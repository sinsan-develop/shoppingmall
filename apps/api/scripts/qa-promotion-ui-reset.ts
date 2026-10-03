import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { runQaCatalogFixture } from './qa-catalog-fixture.js';
import { qaNames, validateQaRunId } from './qa-fixture.js';
import { runQaPublicFixture } from './qa-public-fixture.js';

const isolatedHosts: Record<string, string> = {
  b83f3204: 'shoppingmall-s32-ui-pg-1003',
  e4401004: 'shoppingmall-s32-three-pg-1004',
};

export function assertIsolatedPromotionQaTarget(runId: string, databaseUrl: string) {
  const id = validateQaRunId(runId);
  const url = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hostname !== isolatedHosts[id] || url.port !== '5432' ||
      url.pathname !== '/shoppingmall') {
    throw new Error('Expected isolated promotion QA database');
  }
  return id;
}

export async function resetPromotionUiFixture(runId: string, databaseUrl: string) {
  const id = assertIsolatedPromotionQaTarget(runId, databaseUrl);
  const names = qaNames(id);
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const accounts = await pool.query<{ account_id: string; identifier: string }>(
      `SELECT account_id, identifier FROM account_identities WHERE kind='email'
       AND identifier=ANY($1::text[])`, [names.emails]);
    if (accounts.rows.length !== 5) throw new Error('Expected five exact QA accounts before reset');
    const admin = accounts.rows.find((row) => row.identifier === names.emails[4])!;
    const campaigns = await pool.query<{ id: string; title: string }>(
      'SELECT id,title FROM promotion_campaigns WHERE created_by_account_id=$1', [admin.account_id]);
    const prefix = `QA-${id}-`;
    if (campaigns.rows.some((row) => !row.title.startsWith(prefix))) {
      throw new Error('QA admin owns a campaign outside this run');
    }
    const ids = campaigns.rows.map((row) => row.id);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM promotion_uses WHERE campaign_id=ANY($1::uuid[])', [ids]);
      await client.query(`DELETE FROM promotion_grants WHERE version_id IN
        (SELECT id FROM promotion_versions WHERE campaign_id=ANY($1::uuid[]))`, [ids]);
      await client.query(`DELETE FROM promotion_codes WHERE version_id IN
        (SELECT id FROM promotion_versions WHERE campaign_id=ANY($1::uuid[]))`, [ids]);
      await client.query('DELETE FROM promotion_versions WHERE campaign_id=ANY($1::uuid[])', [ids]);
      await client.query('DELETE FROM promotion_campaigns WHERE id=ANY($1::uuid[])', [ids]);
      const accountIds = accounts.rows.map((row) => row.account_id);
      await client.query(`DELETE FROM checkout_reservation_lines WHERE reservation_id IN
        (SELECT id FROM checkout_reservations WHERE account_id=ANY($1::uuid[]))`, [accountIds]);
      await client.query('DELETE FROM checkout_reservations WHERE account_id=ANY($1::uuid[])', [accountIds]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    if (id === 'e4401004') await runQaCatalogFixture('reset', id, databaseUrl);
    else await runQaPublicFixture('reset', id, databaseUrl);
    return { runId: id, removedCampaigns: ids.length, removedAccounts: accounts.rows.length };
  } finally { await pool.end(); }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  if (process.argv[2] !== 'reset') throw new Error('usage: qa-promotion-ui-reset.ts reset');
  resetPromotionUiFixture(process.env.QA_RUN_ID ?? '', process.env.DATABASE_URL ?? '')
    .then((result) => { process.stdout.write(`${JSON.stringify(result)}\n`); })
    .catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : 'QA reset failed'}\n`); process.exitCode = 1; });
}
