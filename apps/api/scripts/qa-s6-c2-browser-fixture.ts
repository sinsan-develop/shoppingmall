import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { completeSellerPeriod } from '../src/settlement/complete.js';
import { qaNames, runQaFixture, validateQaRunId } from './qa-fixture.js';

type FixtureTarget = { database: string; migrations: number };
type FixtureBaseline = FixtureTarget & { systemId: string; accounts: number; events: number };

export function validateS6C2BrowserTarget(databaseUrl: string, runId: string,
  systemId: string, mode?: string): FixtureTarget {
  validateQaRunId(runId);
  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.slice(1));
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.ok(['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname));
  assert.equal(url.search, '');
  assert.equal(url.hash, '');
  assert.match(systemId, /^\d{10,}$/);
  if (mode === 'approved-qa') {
    assert.equal(database, 'shoppingmall_qa_20261010_2');
    assert.equal(systemId, '7622490131194466339');
    return { database, migrations: 26 };
  }
  assert.equal(mode, undefined);
  assert.equal(database, 'shoppingmall');
  return { database, migrations: 24 };
}

export function assertS6C2BrowserBaseline(target: FixtureTarget, expectedSystemId: string,
  actual: FixtureBaseline): void {
  assert.deepEqual({ database: actual.database, migrations: actual.migrations }, target);
  assert.equal(actual.systemId, expectedSystemId);
  assert.equal(actual.accounts, 0);
  assert.equal(actual.events, 0);
}

export async function runS6C2BrowserFixture(runInput: string, databaseUrl: string,
  systemId: string, password: string, mode?: string) {
const run = validateQaRunId(runInput);
const target = validateS6C2BrowserTarget(databaseUrl, run, systemId, mode);
assert.ok(password.length >= 12);
if (mode === 'approved-qa') assert.equal(process.env.QA_ROLE_MATRIX_DB_SYSTEM_ID, systemId);

const pool = new Pool({ connectionString: databaseUrl });
try {
  const baseline = (await pool.query(`SELECT current_database() AS database,
    system_identifier::text AS "systemId",
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS migrations,
    (SELECT count(*)::int FROM accounts) AS accounts,
    (SELECT count(*)::int FROM settlement_events) AS events
    FROM pg_control_system()`)).rows[0] as FixtureBaseline;
  assertS6C2BrowserBaseline(target, systemId, baseline);
  await runQaFixture('seed', run, databaseUrl, password);
  const names = qaNames(run);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const admin = (await client.query(`SELECT account_id AS id FROM account_identities
      WHERE identifier=$1`, [names.emails[4]])).rows[0].id;
    const sellers = (await client.query(`SELECT id,display_name AS name FROM sellers
      WHERE display_name=ANY($1::text[])`, [[names.sellerA, names.sellerB]])).rows;
    const sellerA = sellers.find((seller) => seller.name === names.sellerA)?.id;
    const sellerB = sellers.find((seller) => seller.name === names.sellerB)?.id;
    assert.ok(sellerA && sellerB);
    const x = (await client.query(`INSERT INTO seller_categories(name)
      VALUES ('C2 과거 X') RETURNING id`)).rows[0].id;
    const y = (await client.query(`INSERT INTO seller_categories(name)
      VALUES ('C2 현재 Y') RETURNING id`)).rows[0].id;
    await client.query('UPDATE sellers SET category_id=$1 WHERE id=ANY($2::uuid[])',
      [x, [sellerA, sellerB]]);
    for (const [categoryId, categoryName, date, amount] of [
      [x, 'C2 과거 X', '2026-05-01T00:00:00Z', 10000],
      [y, 'C2 현재 Y', '2026-05-02T00:00:00Z', 4000],
    ] as const) {
      const source = randomUUID();
      await client.query(`INSERT INTO settlement_events
        (dedupe_key,kind,amount_won,occurred_at,seller_id,seller_name,
         seller_category_id,seller_category_name,source_event_kind,source_event_id,
         recorded_by,reason)
        VALUES ($1,'commission',$2,$3,$4,$5,$6,$7,'manual_commission',$8,$9,'C2 브라우저 근거')`,
      [`manual:${source}`, amount, date, sellerA, names.sellerA,
        categoryId, categoryName, source, admin]);
    }
    await client.query('UPDATE sellers SET category_id=$1 WHERE id=$2', [y, sellerA]);
    await completeSellerPeriod(client, admin, { sellerId: sellerA,
      from: '2026-05-01', to: '2026-05-20', reason: 'C2 혼합 완료' });
    await completeSellerPeriod(client, admin, { sellerId: sellerB,
      from: '2026-05-01', to: '2026-05-20', reason: 'C2 0건 완료' });
    await client.query('COMMIT');
    return { run, sellerA, sellerB, x, y, immutableEventsPreserved: true,
      expected: { all: 14000, x: 10000, y: 4000, empty: 0 } };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
} finally { await pool.end(); }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runS6C2BrowserFixture(process.env.S6_C2_BROWSER_RUN ?? '', process.env.DATABASE_URL ?? '',
    process.env.S6_C2_BROWSER_DB_SYSTEM_ID ?? '', process.env.QA_FIXTURE_PASSWORD ?? '',
    process.env.S6_C2_BROWSER_QA_MODE)
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : 'C2 QA fixture failed'}\n`);
      process.exitCode = 1;
    });
}
