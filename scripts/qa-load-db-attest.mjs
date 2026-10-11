import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertQaLoadGate } from './qa-load-gate.mjs';

/** Read-only identity check; URL validation alone cannot prove the reached database. */
export async function attestQaLoadDatabase(env, query) {
  assertQaLoadGate(env);
  if (!/^\d+$/.test(env.QA_LOAD_DB_SYSTEM_ID ?? ''))
    throw new Error('QA load database identity unavailable');
  const result = await query(`SELECT current_database() AS database,
    system_identifier::text AS system_id FROM pg_control_system()`);
  if (result.rows?.[0]?.database !== 'shoppingmall_qa_20261010_2' ||
      result.rows[0].system_id !== env.QA_LOAD_DB_SYSTEM_ID)
    throw new Error('QA load database identity mismatch');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let pool;
  let attested = false;
  try {
    assertQaLoadGate(process.env);
    const requireApiDependency = createRequire(new URL('../apps/api/package.json', import.meta.url));
    const { Pool } = requireApiDependency('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1,
      connectionTimeoutMillis: 3000, statement_timeout: 3000 });
    await attestQaLoadDatabase(process.env, (sql) => pool.query(sql));
    attested = true;
  } catch {
    // Never include connection strings, credentials, or driver errors in load logs.
  } finally {
    if (pool) {
      try { await pool.end(); }
      catch { attested = false; }
    }
  }
  if (attested) process.stdout.write('QA load database attested\n');
  else {
    process.stderr.write('QA load database attestation failed\n');
    process.exitCode = 1;
  }
}
