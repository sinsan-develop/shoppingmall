import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { issueActionToken, consumeActionToken } from '../src/auth/action-tokens.ts';
import { purgeAuthSecurityEvents } from '../scripts/purge-auth-security-events.ts';
import { deliverAuthLink } from '../src/auth/delivery.ts';

const expectedSystemId = process.env.AUTH_ONBOARDING_TEST_DB_SYSTEM_ID;

test('0025 stores only bounded one-time action digests in the isolated database', {
  skip: !expectedSystemId,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall_auth_1010');
  assert.match(expectedSystemId ?? '', /^\d+$/);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  let began = false;
  try {
    const identity = await client.query('SELECT system_identifier::text AS id FROM pg_control_system()');
    assert.equal(identity.rows[0].id, expectedSystemId);
    await client.query('BEGIN'); began = true;
    const tokenHash = randomBytes(32).toString('hex');
    const inserted = await client.query(`INSERT INTO auth_action_tokens
      (purpose, email, token_hash, expires_at)
      VALUES ('customer_signup', 'qa@example.invalid', $1, now() + interval '30 minutes')
      RETURNING purpose, email, token_hash, expires_at, consumed_at, revoked_at`, [tokenHash]);
    assert.equal(inserted.rows[0].purpose, 'customer_signup');
    assert.equal(inserted.rows[0].email, 'qa@example.invalid');
    assert.equal(inserted.rows[0].token_hash, tokenHash);
    assert.equal(inserted.rows[0].consumed_at, null);
    assert.equal(inserted.rows[0].revoked_at, null);
    const columns = await client.query(`SELECT column_name FROM information_schema.columns
      WHERE table_name = 'auth_action_tokens'`);
    assert.equal(columns.rows.some((row) => row.column_name === 'raw_token'), false);
    await client.query('SAVEPOINT bad_purpose');
    await assert.rejects(client.query(`INSERT INTO auth_action_tokens
      (purpose, email, token_hash, expires_at)
      VALUES ('admin', 'qa@example.invalid', $1, now() + interval '30 minutes')`,
    [randomBytes(32).toString('hex')]), (error) => error.code === '23514');
    await client.query('ROLLBACK TO SAVEPOINT bad_purpose');
    const ledgers = await client.query(`SELECT to_regclass('seller_applications') AS seller,
      to_regclass('auth_security_events') AS security`);
    assert.ok(ledgers.rows[0].seller);
    assert.ok(ledgers.rows[0].security);
  } finally {
    if (began) await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});

test('issued links are hashed, purpose-bound, one-time and reissue revokes the old link', {
  skip: !expectedSystemId,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall_auth_1010');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const email = `qa+${randomUUID()}@example.invalid`;
  const source = `qa-source-${randomUUID()}`;
  const now = new Date('2026-10-10T12:00:00.000Z');
  try {
    const first = await issueActionToken(pool, { purpose: 'customer_signup', email, accountId: null, source, now });
    const second = await issueActionToken(pool, { purpose: 'customer_signup', email, accountId: null, source, now });
    assert.notEqual(first, second);
    const digest = createHash('sha256').update(second).digest('hex');
    const stored = await pool.query('SELECT token_hash, expires_at, revoked_at FROM auth_action_tokens WHERE email=$1 ORDER BY created_at', [email]);
    assert.equal(stored.rowCount, 2);
    assert.equal(stored.rows.some((row) => row.token_hash === first || row.token_hash === second), false);
    assert.equal(stored.rows.some((row) => row.token_hash === digest), true);
    assert.equal(stored.rows.filter((row) => row.revoked_at === null).length, 1);
    await assert.rejects(consumeActionToken(pool, 'customer_signup', first, now, async () => true), /invalid/i);
    await assert.rejects(consumeActionToken(pool, 'password_reset', second, now, async () => true), /invalid/i);
    const result = await consumeActionToken(pool, 'customer_signup', second, now, async (_client, action) => action.email);
    assert.equal(result, email);
    await assert.rejects(consumeActionToken(pool, 'customer_signup', second, now, async () => true), /invalid/i);
  } finally {
    await pool.end();
  }
});

test('expired links and concurrent double consumption cannot authorize twice', {
  skip: !expectedSystemId,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall_auth_1010');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const email = `qa+${randomUUID()}@example.invalid`;
  const source = `qa-source-${randomUUID()}`;
  const now = new Date('2026-10-10T12:00:00.000Z');
  try {
    const expired = await issueActionToken(pool, { purpose: 'customer_signup', email, accountId: null, source, now });
    await assert.rejects(consumeActionToken(pool, 'customer_signup', expired,
      new Date('2026-10-10T12:31:00.000Z'), async () => true), /invalid/i);
    const fresh = await issueActionToken(pool, { purpose: 'customer_signup', email, accountId: null,
      source, now: new Date('2026-10-10T12:32:00.000Z') });
    const outcomes = await Promise.allSettled([
      consumeActionToken(pool, 'customer_signup', fresh, new Date('2026-10-10T12:33:00.000Z'), async () => true),
      consumeActionToken(pool, 'customer_signup', fresh, new Date('2026-10-10T12:33:00.000Z'), async () => true),
    ]);
    assert.equal(outcomes.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter((item) => item.status === 'rejected').length, 1);
  } finally {
    await pool.end();
  }
});

test('a failed account update rolls back token consumption so the owner can retry', {
  skip: !expectedSystemId,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall_auth_1010');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const email = `qa+${randomUUID()}@example.invalid`;
  const source = `qa-source-${randomUUID()}`;
  const now = new Date('2026-10-10T12:05:00.000Z');
  try {
    const token = await issueActionToken(pool, { purpose: 'customer_signup', email, accountId: null, source, now });
    await assert.rejects(consumeActionToken(pool, 'customer_signup', token, now,
      async () => { throw new Error('account update failed'); }, source), /account update failed/);
    const result = await consumeActionToken(pool, 'customer_signup', token, now,
      async (_client, action) => action.email, source);
    assert.equal(result, email);
  } finally {
    await pool.end();
  }
});

test('sixth link request from one source is denied and the denial is audited without contact data', {
  skip: !expectedSystemId,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall_auth_1010');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const source = `qa-source-${randomUUID()}`;
  const now = new Date('2026-10-10T12:40:00.000Z');
  try {
    const before = await pool.query("SELECT count(*)::int AS n FROM auth_security_events WHERE result_code='issue_rate_limited'");
    for (let index = 0; index < 5; index++) {
      const token = await issueActionToken(pool, {
        purpose: 'customer_signup', email: `qa+${randomUUID()}@example.invalid`,
        accountId: null, source, now,
      });
      assert.ok(token.length > 32);
    }
    await assert.rejects(issueActionToken(pool, {
      purpose: 'customer_signup', email: `qa+${randomUUID()}@example.invalid`,
      accountId: null, source, now,
    }), /rate limited/i);
    const after = await pool.query("SELECT count(*)::int AS n FROM auth_security_events WHERE result_code='issue_rate_limited'");
    assert.equal(after.rows[0].n, before.rows[0].n + 1);
    const columns = await pool.query(`SELECT column_name FROM information_schema.columns
      WHERE table_name='auth_security_events'`);
    assert.equal(columns.rows.some((row) => ['email', 'ip', 'source'].includes(row.column_name)), false);
  } finally {
    await pool.end();
  }
});

test('five failed confirmations block the same source for fifteen minutes without consuming a valid link', {
  skip: !expectedSystemId,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall_auth_1010');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const source = `qa-source-${randomUUID()}`;
  const email = `qa+${randomUUID()}@example.invalid`;
  const now = new Date('2026-10-10T12:45:00.000Z');
  try {
    const valid = await issueActionToken(pool, { purpose: 'customer_signup', email, accountId: null, source, now });
    const before = await pool.query(`SELECT result_code,count(*)::int AS n FROM auth_security_events
      WHERE result_code IN ('confirm_invalid','confirm_rate_limited') GROUP BY result_code`);
    const count = (rows, code) => rows.find((row) => row.result_code === code)?.n ?? 0;
    for (let index = 0; index < 5; index++) {
      await assert.rejects(consumeActionToken(pool, 'customer_signup', randomBytes(32).toString('base64url'),
        now, async () => true, source), /invalid/i);
    }
    await assert.rejects(consumeActionToken(pool, 'customer_signup', valid, now,
      async () => true, source), /invalid/i);
    const after = await pool.query(`SELECT result_code,count(*)::int AS n FROM auth_security_events
      WHERE result_code IN ('confirm_invalid','confirm_rate_limited') GROUP BY result_code`);
    assert.equal(count(after.rows, 'confirm_invalid') - count(before.rows, 'confirm_invalid'), 5);
    assert.equal(count(after.rows, 'confirm_rate_limited') - count(before.rows, 'confirm_rate_limited'), 1);
    const later = await consumeActionToken(pool, 'customer_signup', valid,
      new Date('2026-10-10T13:01:00.000Z'), async (_client, action) => action.email, source);
    assert.equal(later, email);
  } finally {
    await pool.end();
  }
});

test('security events older than thirty days and action links older than twenty-four hours are purged', {
  skip: !expectedSystemId,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall_auth_1010');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const now = new Date('2026-10-10T14:00:00.000Z');
  const oldTokenId = randomUUID();
  const recentTokenId = randomUUID();
  const oldEventId = randomUUID();
  const recentEventId = randomUUID();
  try {
    await pool.query(`INSERT INTO auth_action_tokens
      (id,purpose,email,token_hash,created_at,expires_at) VALUES
      ($1,'customer_signup','purge-old@example.invalid',$3,$5::timestamptz - interval '2 days',$5::timestamptz - interval '25 hours'),
      ($2,'customer_signup','purge-recent@example.invalid',$4,$5::timestamptz - interval '2 days',$5::timestamptz - interval '1 hour')`,
    [oldTokenId, recentTokenId, randomBytes(32).toString('hex'), randomBytes(32).toString('hex'), now]);
    await pool.query(`INSERT INTO auth_security_events
      (id,purpose,result_code,subject_hash,occurred_at) VALUES
      ($1,'customer_signup','qa_purge',$3,$5::timestamptz - interval '31 days'),
      ($2,'customer_signup','qa_purge',$4,$5::timestamptz - interval '29 days')`,
    [oldEventId, recentEventId, randomBytes(32).toString('hex'), randomBytes(32).toString('hex'), now]);
    await purgeAuthSecurityEvents(pool, now);
    const remaining = await pool.query(`SELECT
      (SELECT count(*)::int FROM auth_action_tokens WHERE id=$1) AS old_token,
      (SELECT count(*)::int FROM auth_action_tokens WHERE id=$2) AS recent_token,
      (SELECT count(*)::int FROM auth_security_events WHERE id=$3) AS old_event,
      (SELECT count(*)::int FROM auth_security_events WHERE id=$4) AS recent_event`,
    [oldTokenId, recentTokenId, oldEventId, recentEventId]);
    assert.deepEqual(remaining.rows[0], { old_token: 0, recent_token: 1, old_event: 0, recent_event: 1 });
  } finally {
    await pool.query('DELETE FROM auth_action_tokens WHERE id=ANY($1::uuid[])', [[oldTokenId, recentTokenId]]);
    await pool.query('DELETE FROM auth_security_events WHERE id=ANY($1::uuid[])', [[oldEventId, recentEventId]]);
    await pool.end();
  }
});

test('auth link delivery fails closed unless a development loopback mock sink is explicitly configured', async () => {
  const before = {
    mode: process.env.AUTH_DELIVERY_MODE,
    app: process.env.APP_ENV,
    host: process.env.API_HOST,
    origin: process.env.AUTH_LINK_ORIGIN,
  };
  const url = 'http://127.0.0.1:9091/signup#token=isolated-test-only';
  const received = [];
  const sink = async (message) => { received.push(message); };
  const restore = (key, value) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; };
  try {
    process.env.APP_ENV = 'development';
    process.env.API_HOST = '127.0.0.1';
    process.env.AUTH_LINK_ORIGIN = 'http://127.0.0.1:9091';
    process.env.AUTH_DELIVERY_MODE = 'disabled';
    await assert.rejects(deliverAuthLink('customer_signup', 'qa@example.invalid', url, sink), /unavailable/i);
    process.env.AUTH_DELIVERY_MODE = 'mock';
    await deliverAuthLink('customer_signup', 'qa@example.invalid', url, sink);
    assert.deepEqual(received, [{ purpose: 'customer_signup', email: 'qa@example.invalid', url }]);
    process.env.API_HOST = '0.0.0.0';
    await assert.rejects(deliverAuthLink('customer_signup', 'qa@example.invalid', url, sink), /unavailable/i);
    process.env.API_HOST = '127.0.0.1';
    process.env.APP_ENV = 'production';
    await assert.rejects(deliverAuthLink('customer_signup', 'qa@example.invalid', url, sink), /unavailable/i);
    process.env.APP_ENV = 'development';
    process.env.AUTH_DELIVERY_MODE = 'provider';
    await assert.rejects(deliverAuthLink('customer_signup', 'qa@example.invalid', url, sink), /unavailable/i);
    assert.equal(received.length, 1);
  } finally {
    restore('AUTH_DELIVERY_MODE', before.mode);
    restore('APP_ENV', before.app);
    restore('API_HOST', before.host);
    restore('AUTH_LINK_ORIGIN', before.origin);
  }
});
