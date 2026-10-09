import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { AuthRepository } from '../src/auth/repository.js';
import { completeSellerPeriodTransaction } from '../src/settlement/complete.js';
import { recordCorrectionTransaction } from '../src/settlement/correction.js';

const database = 'shoppingmall_s6_followup_1009';
const expectedSystemId = process.env.S6_FOLLOWUP_TEST_DB_SYSTEM_ID;
if (process.env.PGDATABASE !== database || !expectedSystemId || !process.env.DATABASE_URL ||
    new URL(process.env.DATABASE_URL).pathname !== `/${database}`) {
  throw new Error('C1 browser fixture is limited to its named disposable database');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const systemId = (await pool.query('SELECT system_identifier::text AS id FROM pg_control_system()'))
    .rows[0].id;
  if (systemId !== expectedSystemId) throw new Error('C1 browser fixture system ID mismatch');
  const count = (await pool.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations'))
    .rows[0].n;
  if (count !== 23) throw new Error('C1 browser fixture requires 23 migrations');

  const run = randomBytes(4).toString('hex');
  const password = 'Test-only-s6-c1-2026!';
  const adminEmail = `qa-s6-c1-admin-${run}@example.invalid`;
  const sellerEmail = `qa-s6-c1-seller-${run}@example.invalid`;
  const auth = new AuthRepository(pool);
  const adminId = await auth.createCustomerAccount(adminEmail, password);
  const sellerActorId = await auth.createCustomerAccount(sellerEmail, password);
  const categoryId = (await pool.query(`INSERT INTO seller_categories(name)
    VALUES ($1) RETURNING id`, [`QA C1 분류 ${run}`])).rows[0].id;
  const sellerId = (await pool.query(`INSERT INTO sellers(category_id,display_name)
    VALUES ($1,$2) RETURNING id`, [categoryId, `QA C1 판매자 ${run}`])).rows[0].id;
  await pool.query(`INSERT INTO account_roles(account_id,role,seller_id)
    VALUES ($1,'admin',NULL),($2,'seller',$3)`, [adminId, sellerActorId, sellerId]);
  const originalEventId = (await pool.query(`INSERT INTO settlement_events
    (dedupe_key,kind,amount_won,occurred_at,seller_id,seller_name,
     seller_category_id,seller_category_name,source_event_kind,source_event_id,
     recorded_by,reason)
    VALUES ($1,'commission',10000,'2026-05-01T00:00:00Z',$2,$3,
      $4,$5,'manual_commission',$6,$7,'브라우저 QA 원수수료') RETURNING id`,
  [`qa:${randomUUID()}`, sellerId, `QA C1 판매자 ${run}`, categoryId,
    `QA C1 분류 ${run}`, randomUUID(), adminId])).rows[0].id;
  await completeSellerPeriodTransaction(pool, adminId, { sellerId,
    from: '2026-05-01', to: '2026-05-20', reason: '브라우저 QA 확인' });
  await recordCorrectionTransaction(pool, adminId, { originalEventId,
    requestId: randomUUID(), direction: 'decrease', amountWon: 2000,
    reason: '브라우저 QA 정정' });
  console.info(JSON.stringify({ run, adminEmail, sellerEmail, sellerId,
    categoryId, originalEventId, testOnlyPassword: password }));
} finally {
  await pool.end();
}
