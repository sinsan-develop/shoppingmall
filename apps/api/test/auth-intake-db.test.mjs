import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { AuthRepository } from '../src/auth/repository.ts';
import { enqueueAuthIntake, claimAuthIntakeJob, finishAuthIntakeJob,
  retryAuthIntakeJob } from '../src/auth/intake.ts';
import { processAuthIntakeOnce } from '../src/auth/intake-worker.ts';

const expectedSystemId = process.env.AUTH_INTAKE_TEST_DB_SYSTEM_ID;

test('isolated intake persists account-blind requests, recovers leases and expires work', {
  skip: !expectedSystemId,
}, async () => {
  const dbName = 'shoppingmall_auth_intake_1011';
  assert.equal(process.env.PGDATABASE, dbName);
  assert.equal(new URL(process.env.DATABASE_URL).pathname, `/${dbName}`);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const original = [process.env.APP_ENV, process.env.AUTH_DELIVERY_MODE,
    process.env.API_HOST, process.env.AUTH_LINK_ORIGIN];
  process.env.APP_ENV = 'development';
  process.env.AUTH_DELIVERY_MODE = 'mock';
  process.env.API_HOST = '127.0.0.1';
  process.env.AUTH_LINK_ORIGIN = 'http://127.0.0.1:9091';
  const run = randomUUID();
  const known = `intake-known-${run}@example.invalid`;
  const unknown = `intake-unknown-${run}@example.invalid`;
  const leaseEmail = `intake-lease-${run}@example.invalid`;
  const expiredEmail = `intake-expired-${run}@example.invalid`;
  const emails = [known, unknown, leaseEmail, expiredEmail];
  const sources = emails.map((email) => `intake-${email}`);
  const sourceHash = (source) => createHmac('sha256', process.env.AUTH_AUDIT_HMAC_KEY)
    .update(`source:${source}`).digest('hex');
  const sourceHashes = sources.flatMap((source) => {
    const direct = sourceHash(source);
    return [direct, sourceHash(direct)];
  });
  const deliveries = [];
  const sink = async (message) => { deliveries.push({ purpose: message.purpose, email: message.email }); };
  let accountId;
  try {
    const identity = await pool.query('SELECT current_database() AS name, system_identifier::text AS id FROM pg_control_system()');
    assert.deepEqual(identity.rows[0], { name: dbName, id: expectedSystemId });
    accountId = await new AuthRepository(pool).createCustomerAccount(known, `Intake-${run}!`);
    await pool.query('UPDATE account_identities SET verified_at=clock_timestamp() WHERE account_id=$1', [accountId]);
    const now = new Date();
    const knownAccepted = await enqueueAuthIntake(pool, 'password_reset', known, sources[0], now, sink);
    const unknownAccepted = await enqueueAuthIntake(pool, 'password_reset', unknown, sources[1], now, sink);
    assert.deepEqual(knownAccepted, { status: 'accepted' });
    assert.deepEqual(unknownAccepted, knownAccepted);
    const before = await pool.query('SELECT count(*)::int AS n FROM auth_action_tokens WHERE email=ANY($1::text[])', [emails]);
    assert.equal(before.rows[0].n, 0, 'no token may be issued before the intake response');
    assert.equal((await processAuthIntakeOnce(pool, now, sink)).processed, true);
    assert.equal((await processAuthIntakeOnce(pool, now, sink)).processed, true);
    assert.deepEqual(deliveries, [{ purpose: 'password_reset', email: known }]);
    const processed = await pool.query('SELECT status,count(*)::int AS n FROM auth_intake_jobs WHERE email=ANY($1::text[]) GROUP BY status', [emails]);
    assert.deepEqual(processed.rows, [{ status: 'done', n: 2 }]);

    await enqueueAuthIntake(pool, 'customer_signup', leaseEmail, sources[2], now, sink);
    const [first, second] = await Promise.all([
      claimAuthIntakeJob(pool, now), claimAuthIntakeJob(pool, now),
    ]);
    assert.equal([first, second].filter(Boolean).length, 1, 'concurrent workers cannot claim the same job');
    const claimed = first ?? second;
    await retryAuthIntakeJob(pool, claimed, now);
    assert.equal((await claimAuthIntakeJob(pool, now)), undefined, 'retry respects availability delay');
    const recovered = await claimAuthIntakeJob(pool, new Date(now.getTime() + 11_000));
    assert.equal(recovered.id, claimed.id);
    assert.equal(recovered.attempts, 2);
    const stale = await claimAuthIntakeJob(pool, new Date(now.getTime() + 2 * 60_000 + 12_000));
    assert.equal(stale.id, claimed.id, 'expired worker lease is reclaimed after a restart');
    assert.equal(stale.attempts, 3);
    await assert.rejects(finishAuthIntakeJob(pool, recovered, new Date()), /lease lost/);
    await finishAuthIntakeJob(pool, stale, new Date());

    const past = new Date(now.getTime() - 31 * 60_000);
    await enqueueAuthIntake(pool, 'customer_signup', expiredEmail, sources[3], past, sink);
    assert.equal((await processAuthIntakeOnce(pool, now, sink)).processed, false);
    const statuses = await pool.query('SELECT email,status,last_error_code FROM auth_intake_jobs WHERE email=ANY($1::text[]) ORDER BY email', [emails]);
    assert.equal(statuses.rows.find((row) => row.email === expiredEmail)?.last_error_code, 'expired');
    assert.equal(statuses.rows.find((row) => row.email === expiredEmail)?.status, 'dead');
    const audits = await pool.query(`SELECT count(*)::int AS n FROM auth_security_events
      WHERE result_code='intake_accepted' AND source_hash=ANY($1::text[])`, [sourceHashes]);
    assert.equal(audits.rows[0].n, 4);
  } finally {
    try {
      await pool.query('DELETE FROM auth_intake_jobs WHERE email=ANY($1::text[])', [emails]);
      await pool.query('DELETE FROM auth_action_tokens WHERE email=ANY($1::text[])', [emails]);
      await pool.query('DELETE FROM auth_security_events WHERE source_hash=ANY($1::text[])', [sourceHashes]);
      if (accountId) {
        await pool.query('DELETE FROM audit_events WHERE actor_account_id=$1', [accountId]);
        await pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [accountId]);
        await pool.query('DELETE FROM account_roles WHERE account_id=$1', [accountId]);
        await pool.query('DELETE FROM account_identities WHERE account_id=$1', [accountId]);
        await pool.query('DELETE FROM accounts WHERE id=$1', [accountId]);
      }
      const left = await pool.query('SELECT count(*)::int AS n FROM auth_intake_jobs WHERE email=ANY($1::text[])', [emails]);
      assert.equal(left.rows[0].n, 0);
    } finally {
      [process.env.APP_ENV, process.env.AUTH_DELIVERY_MODE,
        process.env.API_HOST, process.env.AUTH_LINK_ORIGIN] = original;
      await pool.end();
    }
  }
});

test('a delivered reset link survives a completion write failure and job retry', {
  skip: !expectedSystemId,
}, async () => {
  const dbName = 'shoppingmall_auth_intake_1011';
  assert.equal(process.env.PGDATABASE, dbName);
  assert.equal(new URL(process.env.DATABASE_URL).pathname, `/${dbName}`);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const originalEnv = [process.env.APP_ENV, process.env.AUTH_DELIVERY_MODE,
    process.env.API_HOST, process.env.AUTH_LINK_ORIGIN];
  process.env.APP_ENV = 'development';
  process.env.AUTH_DELIVERY_MODE = 'mock';
  process.env.API_HOST = '127.0.0.1';
  process.env.AUTH_LINK_ORIGIN = 'http://127.0.0.1:9091';
  const run = randomUUID();
  const email = `intake-retry-${run}@example.invalid`;
  const source = `intake-retry-${run}`;
  const hash = (value) => createHmac('sha256', process.env.AUTH_AUDIT_HMAC_KEY)
    .update(value).digest('hex');
  const sourceHash = hash(`source:${source}`);
  const auditSourceHashes = [sourceHash, hash(`source:${sourceHash}`)];
  const delivered = [];
  const sink = async (message) => { delivered.push(message.url); };
  let accountId;
  try {
    const identity = await pool.query('SELECT current_database() AS name, system_identifier::text AS id FROM pg_control_system()');
    assert.deepEqual(identity.rows[0], { name: dbName, id: expectedSystemId });
    accountId = await new AuthRepository(pool).createCustomerAccount(email, `Retry-${run}!`);
    await pool.query('UPDATE account_identities SET verified_at=clock_timestamp() WHERE account_id=$1', [accountId]);
    const now = new Date();
    await enqueueAuthIntake(pool, 'password_reset', email, source, now, sink);
    const originalQuery = pool.query.bind(pool);
    let failCompletion = true;
    pool.query = (...args) => {
      if (failCompletion && typeof args[0] === 'string' &&
          args[0].startsWith("UPDATE auth_intake_jobs SET status='done'")) {
        failCompletion = false;
        return Promise.reject(new Error('simulated completion write failure'));
      }
      return originalQuery(...args);
    };
    await processAuthIntakeOnce(pool, now, sink);
    assert.equal(delivered.length, 1);
    assert.equal(failCompletion, false);
    await processAuthIntakeOnce(pool, new Date(now.getTime() + 11_000), sink);
    assert.equal(delivered.length, 1, 'retry must not send another link');
    const token = new URL(delivered[0]).hash.slice('#token='.length);
    const digest = createHash('sha256').update(decodeURIComponent(token)).digest('hex');
    const active = await originalQuery(`SELECT count(*)::int AS n FROM auth_action_tokens
      WHERE purpose='password_reset' AND email=$1 AND token_hash=$2 AND revoked_at IS NULL`, [email, digest]);
    assert.equal(active.rows[0].n, 1, 'first delivered link must remain valid');
    await enqueueAuthIntake(pool, 'password_reset', email, source, now, sink);
    await processAuthIntakeOnce(pool, now, sink);
    assert.equal(delivered.length, 2, 'a separate accepted request must receive a fresh link');
    const tokens = await originalQuery(`SELECT token_hash,revoked_at FROM auth_action_tokens
      WHERE purpose='password_reset' AND email=$1 ORDER BY id`, [email]);
    assert.equal(tokens.rows.length, 2);
    assert.ok(tokens.rows.find((row) => row.token_hash === digest)?.revoked_at,
      'a fresh request must revoke its predecessor');

    const thirdAt = new Date(now.getTime() + 20_000);
    failCompletion = true;
    await enqueueAuthIntake(pool, 'password_reset', email, source, thirdAt, sink);
    await processAuthIntakeOnce(pool, thirdAt, sink);
    assert.equal(delivered.length, 3);
    assert.equal(failCompletion, false);
    const fourthAt = new Date(now.getTime() + 21_000);
    await enqueueAuthIntake(pool, 'password_reset', email, source, fourthAt, sink);
    await processAuthIntakeOnce(pool, fourthAt, sink);
    assert.equal(delivered.length, 4);
    await processAuthIntakeOnce(pool, new Date(now.getTime() + 31_000), sink);
    assert.equal(delivered.length, 4,
      'an old job retry must not invalidate a newer delivered link');
  } finally {
    try {
      await pool.query('DELETE FROM auth_intake_jobs WHERE email=$1', [email]);
      await pool.query('DELETE FROM auth_action_tokens WHERE email=$1', [email]);
      await pool.query('DELETE FROM auth_security_events WHERE source_hash=ANY($1::text[])', [auditSourceHashes]);
      if (accountId) {
        await pool.query('DELETE FROM audit_events WHERE actor_account_id=$1', [accountId]);
        await pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [accountId]);
        await pool.query('DELETE FROM account_roles WHERE account_id=$1', [accountId]);
        await pool.query('DELETE FROM account_identities WHERE account_id=$1', [accountId]);
        await pool.query('DELETE FROM accounts WHERE id=$1', [accountId]);
      }
    } finally {
      [process.env.APP_ENV, process.env.AUTH_DELIVERY_MODE,
        process.env.API_HOST, process.env.AUTH_LINK_ORIGIN] = originalEnv;
      await pool.end();
    }
  }
});

test('a failed mock delivery revokes its token and retries only that job', {
  skip: !expectedSystemId,
}, async () => {
  const dbName = 'shoppingmall_auth_intake_1011';
  assert.equal(process.env.PGDATABASE, dbName);
  assert.equal(new URL(process.env.DATABASE_URL).pathname, `/${dbName}`);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const saved = [process.env.APP_ENV, process.env.AUTH_DELIVERY_MODE,
    process.env.API_HOST, process.env.AUTH_LINK_ORIGIN];
  process.env.APP_ENV = 'development';
  process.env.AUTH_DELIVERY_MODE = 'mock';
  process.env.API_HOST = '127.0.0.1';
  process.env.AUTH_LINK_ORIGIN = 'http://127.0.0.1:9091';
  const run = randomUUID();
  const email = `intake-fail-${run}@example.invalid`;
  const source = `intake-fail-${run}`;
  const hash = (value) => createHmac('sha256', process.env.AUTH_AUDIT_HMAC_KEY)
    .update(value).digest('hex');
  const sourceHash = hash(`source:${source}`);
  const auditSourceHashes = [sourceHash, hash(`source:${sourceHash}`)];
  let attempts = 0;
  const sink = async () => {
    attempts++;
    if (attempts === 1) throw new Error('mock receiver unavailable');
  };
  try {
    const identity = await pool.query('SELECT current_database() AS name, system_identifier::text AS id FROM pg_control_system()');
    assert.deepEqual(identity.rows[0], { name: dbName, id: expectedSystemId });
    const now = new Date();
    await enqueueAuthIntake(pool, 'customer_signup', email, source, now, sink);
    await processAuthIntakeOnce(pool, now, sink);
    assert.equal(attempts, 1);
    const failed = await pool.query(`SELECT revoked_at,delivery_failed_at FROM auth_action_tokens
      WHERE email=$1`, [email]);
    assert.equal(failed.rows.length, 1);
    assert.ok(failed.rows[0].revoked_at);
    assert.ok(failed.rows[0].delivery_failed_at);
    await processAuthIntakeOnce(pool, new Date(now.getTime() + 11_000), sink);
    assert.equal(attempts, 2);
    const issued = await pool.query(`SELECT count(*)::int AS n FROM auth_action_tokens
      WHERE email=$1 AND revoked_at IS NULL`, [email]);
    assert.equal(issued.rows[0].n, 1);
    const job = await pool.query('SELECT status FROM auth_intake_jobs WHERE email=$1', [email]);
    assert.equal(job.rows[0].status, 'done');
  } finally {
    try {
      await pool.query('DELETE FROM auth_intake_jobs WHERE email=$1', [email]);
      await pool.query('DELETE FROM auth_action_tokens WHERE email=$1', [email]);
      await pool.query('DELETE FROM auth_security_events WHERE source_hash=ANY($1::text[])', [auditSourceHashes]);
    } finally {
      [process.env.APP_ENV, process.env.AUTH_DELIVERY_MODE,
        process.env.API_HOST, process.env.AUTH_LINK_ORIGIN] = saved;
      await pool.end();
    }
  }
});
