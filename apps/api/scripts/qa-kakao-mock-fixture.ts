import { randomUUID } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { Pool } from 'pg';
import { hashPassword } from '../src/auth/credentials.js';
import { assertKakaoMockBootConfig, readKakaoQaManifest, signKakaoQaManifest,
  type KakaoQaManifest } from '../src/auth/kakao-mock-gate.js';

/** Synthetic customers in a disposable, attested cluster only. No existing-account linking. */
export async function runQaKakaoMockFixture(action:'seed'|'reset',runId:string,url:string,
  systemId:string,manifestPath:string):Promise<void> {
  const env = {...process.env,KAKAO_AUTH_MODE:'mock',QA_KAKAO_RUN_ID:runId,
    QA_KAKAO_DB_NAME:`shoppingmall_s7_kakao_${runId}`,DATABASE_URL:url,
    QA_KAKAO_DB_SYSTEM_ID:systemId,QA_KAKAO_MANIFEST_PATH:manifestPath};
  try { assertKakaoMockBootConfig(env); }
  catch { throw new Error('QA mock fixture unavailable'); }
  const pool = new Pool({connectionString:url,max:1,connectionTimeoutMillis:2000});
  let wroteManifest = false;
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const identity = (await client.query(`SELECT current_database() AS db,
        system_identifier::text AS system_id FROM pg_control_system()`)).rows[0];
      if (identity?.db !== env.QA_KAKAO_DB_NAME || identity.system_id !== systemId)
        throw new Error('QA identity mismatch');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('s7-kakao-fixture'))");
      await client.query('LOCK TABLE accounts,account_identities,account_roles,customer_addresses,auth_sessions,audit_events IN SHARE ROW EXCLUSIVE MODE');
      const counts:Record<string,number> = {};
      for (const table of ['accounts','account_identities','account_roles','customer_addresses','auth_sessions','audit_events']) {
        counts[table] = Number((await client.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);
      }
      if (action === 'seed') {
        if (Object.values(counts).some(n=>n!==0)) throw new Error('QA must be empty');
        const manifest:KakaoQaManifest = {version:1,runId,dbName:env.QA_KAKAO_DB_NAME,systemId,nonce:randomUUID(),
          accounts:{customerA:randomUUID(),customerB:randomUUID()},identityId:randomUUID(),addressIds:[randomUUID(),randomUUID()]};
        const digest = await hashPassword(`S7-Kakao-${runId}-fixture-only`);
        for (const [index,accountId] of Object.values(manifest.accounts).entries()) {
          const suffix = index === 0 ? 'a' : 'b';
          await client.query('INSERT INTO accounts(id) VALUES($1)',[accountId]);
          await client.query(`INSERT INTO account_identities(account_id,kind,identifier,password_hash,verified_at)
            VALUES($1,'email',$2,$3,now())`,[accountId,`s7-kakao-${runId}-customer-${suffix}@example.invalid`,digest]);
          await client.query("INSERT INTO account_roles(account_id,role) VALUES($1,'customer')",[accountId]);
          await client.query(`INSERT INTO customer_addresses(id,account_id,label,recipient_name,phone,postal_code,line1,is_default)
            VALUES($1,$2,$3,'가상 고객','01000000000','00000','QA 가상 주소',true)`,
          [manifest.addressIds[index],accountId,`S7 Kakao customer-${suffix}`]);
        }
        await client.query(`INSERT INTO account_identities(id,account_id,kind,identifier,verified_at)
          VALUES($1,$2,'kakao',$3,now())`,[manifest.identityId,manifest.accounts.customerA,`mock:s7:${runId}:customer-a`]);
        await writeFile(manifestPath,JSON.stringify({...manifest,hmac:signKakaoQaManifest(manifest,env.QA_KAKAO_MANIFEST_KEY!)}),
          {flag:'wx',mode:0o600});
        wroteManifest = true;
      } else if (action === 'reset') {
        const manifest = await readKakaoQaManifest(env);
        if (Object.values(counts).every(n=>n===0)) { await client.query('COMMIT'); return; }
        if (counts.accounts!==2 || counts.account_identities!==3 || counts.account_roles!==2 ||
          counts.customer_addresses!==2 || counts.auth_sessions!==0 || counts.audit_events!==0)
          throw new Error('QA ownership/history differs');
        const accountIds = Object.values(manifest.accounts);
        const rows = (await client.query(`SELECT id,disabled_at FROM accounts ORDER BY id`)).rows;
        if (rows.some(r=>!accountIds.includes(r.id)||r.disabled_at)) throw new Error('QA accounts differ');
        const identities = (await client.query('SELECT id,account_id,kind,identifier,password_hash FROM account_identities')).rows;
        const expected = new Map([
          [`s7-kakao-${runId}-customer-a@example.invalid`,manifest.accounts.customerA],
          [`s7-kakao-${runId}-customer-b@example.invalid`,manifest.accounts.customerB],
          [`mock:s7:${runId}:customer-a`,manifest.accounts.customerA],
        ]);
        if (identities.some(r=>expected.get(r.identifier)!==r.account_id ||
          (r.identifier.startsWith('mock:') ? r.kind!=='kakao'||r.id!==manifest.identityId||r.password_hash!==null : r.kind!=='email')))
          throw new Error('QA identities differ');
        const roles = (await client.query('SELECT account_id,role,seller_id FROM account_roles')).rows;
        if (roles.some(r=>!accountIds.includes(r.account_id)||r.role!=='customer'||r.seller_id!==null)) throw new Error('QA roles differ');
        const addresses = (await client.query('SELECT id,account_id,label FROM customer_addresses')).rows;
        if (addresses.some(r=>manifest.addressIds.indexOf(r.id)<0 ||
          r.account_id!==accountIds[manifest.addressIds.indexOf(r.id)] ||
          r.label!==`S7 Kakao customer-${manifest.addressIds.indexOf(r.id)===0?'a':'b'}`)) throw new Error('QA addresses differ');
        await client.query('DELETE FROM customer_addresses WHERE id=ANY($1::uuid[])',[manifest.addressIds]);
        await client.query('DELETE FROM account_roles WHERE account_id=ANY($1::uuid[])',[accountIds]);
        await client.query('DELETE FROM account_identities WHERE account_id=ANY($1::uuid[])',[accountIds]);
        // Any external FK reference refuses deletion and rolls back every prior deletion.
        await client.query('DELETE FROM accounts WHERE id=ANY($1::uuid[])',[accountIds]);
      } else throw new Error('QA action unavailable');
      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK');
      if (wroteManifest) await unlink(manifestPath);
      throw new Error('QA mock fixture unavailable');
    } finally { client.release(); }
  } catch { throw new Error('QA mock fixture unavailable'); }
  finally { await pool.end(); }
}
