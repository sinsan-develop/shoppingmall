import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { Pool } from 'pg';
import { AuthRepository } from '../src/auth/repository.ts';
import { startCustomerSignup } from '../src/auth/onboarding.ts';
import { startPasswordReset } from '../src/auth/password-recovery.ts';
import { processAuthIntakeOnce } from '../src/auth/intake-worker.ts';

const runId = process.env.QA_AUTH_TIMING_RUN_ID;
const expectedSystemId = process.env.QA_AUTH_TIMING_DB_SYSTEM_ID;

test('isolated QA records signup and reset latency for present and absent identities', {
  skip: !runId || !expectedSystemId,
}, async () => {
  assert.match(runId, /^[a-z0-9]{8}$/);
  assert.ok(['shoppingmall_qa_20261010_2', 'shoppingmall_auth_intake_1011']
    .includes(process.env.PGDATABASE));
  assert.equal(new URL(process.env.DATABASE_URL).pathname, `/${process.env.PGDATABASE}`);
  assert.equal(process.env.APP_ENV, 'development');
  assert.equal(process.env.AUTH_DELIVERY_MODE, 'mock');
  assert.equal(process.env.API_HOST, '127.0.0.1');
  assert.equal(process.env.AUTH_LINK_ORIGIN, 'http://127.0.0.1:9091');
  assert.ok((process.env.AUTH_AUDIT_HMAC_KEY ?? '').length >= 32);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const knownEmail = `qa-timing-${runId}-known@example.invalid`;
  const unknownEmails = Array.from({ length: 8 }, (_, i) =>
    `qa-timing-${runId}-unknown-${i}@example.invalid`);
  const allEmails = [knownEmail, ...unknownEmails];
  const sources = [];
  const samples = {
    signupPresent: [], signupAbsent: [], resetPresent: [], resetAbsent: [],
  };
  // A bounded isolated-DB observation, not proof against timing enumeration on a live service.
  const sampleIterations = 4;
  const maxP95GapMs = 100;
  const deliveries = { customer_signup: 0, password_reset: 0 };
  const sink = async (message) => { deliveries[message.purpose] += 1; };
  let accountId;
  const hashSource = (source) => createHmac('sha256', process.env.AUTH_AUDIT_HMAC_KEY)
    .update(`source:${source}`).digest('hex');
  const quantile = (numbers, fraction) => {
    const ordered = [...numbers].sort((a, b) => a - b);
    return Number(ordered[Math.ceil(fraction * ordered.length) - 1].toFixed(3));
  };
  try {
    const db = await pool.query('SELECT current_database() AS name, system_identifier::text AS id FROM pg_control_system()');
    assert.deepEqual(db.rows[0], { name: process.env.PGDATABASE, id: expectedSystemId });
    const before = await pool.query(`SELECT
      (SELECT count(*)::int FROM account_identities WHERE identifier=ANY($1::text[])) AS identities,
      (SELECT count(*)::int FROM auth_action_tokens WHERE email=ANY($1::text[])) AS tokens`, [allEmails]);
    assert.deepEqual(before.rows[0], { identities: 0, tokens: 0 });

    accountId = await new AuthRepository(pool).createCustomerAccount(knownEmail,
      `qa-timing-${runId}-${randomBytes(16).toString('hex')}`);
    await pool.query('UPDATE account_identities SET verified_at=clock_timestamp() WHERE account_id=$1', [accountId]);

    let unknownIndex = 0;
    for (let iteration = 0; iteration < sampleIterations; iteration += 1) {
      const ordered = iteration % 2 === 0
        ? [['signupPresent', knownEmail, startCustomerSignup],
          ['signupAbsent', unknownEmails[unknownIndex++], startCustomerSignup],
          ['resetPresent', knownEmail, startPasswordReset],
          ['resetAbsent', unknownEmails[unknownIndex++], startPasswordReset]]
        : [['resetAbsent', unknownEmails[unknownIndex++], startPasswordReset],
          ['resetPresent', knownEmail, startPasswordReset],
          ['signupAbsent', unknownEmails[unknownIndex++], startCustomerSignup],
          ['signupPresent', knownEmail, startCustomerSignup]];
      for (const [category, email, run] of ordered) {
        const source = `qa-timing-${runId}-${category}-${iteration}`;
        sources.push(source);
        const started = performance.now();
        const result = await run(pool, email, source, new Date(), sink);
        samples[category].push(performance.now() - started);
        assert.deepEqual(result, { status: 'accepted' });
      }
    }
    assert.deepEqual(deliveries, { customer_signup: 0, password_reset: 0 });
    for (let i = 0; i < 16; i += 1) assert.equal((await processAuthIntakeOnce(pool, new Date(), sink)).processed, true);
    assert.deepEqual(deliveries, { customer_signup: 4, password_reset: 4 });
    console.log(`QA_AUTH_TIMING_ENV isolated_loopback_mock n=${sampleIterations} max_p95_gap_ms=${maxP95GapMs}`);
    for (const [category, timings] of Object.entries(samples)) {
      assert.equal(timings.length, sampleIterations);
      console.log(`QA_AUTH_TIMING ${category} n=${sampleIterations} p50_ms=${quantile(timings, 0.5)} p95_ms=${quantile(timings, 0.95)}`);
    }
    for (const purpose of ['signup', 'reset']) {
      const gap = Math.abs(quantile(samples[`${purpose}Present`], 0.95) -
        quantile(samples[`${purpose}Absent`], 0.95));
      assert.ok(gap <= maxP95GapMs, `${purpose} p95 gap ${gap}ms exceeds isolated threshold`);
    }
  } finally {
    const sourceHashes = sources.map(hashSource);
    try {
      await pool.query('DELETE FROM auth_intake_jobs WHERE email=ANY($1::text[])', [allEmails]);
      await pool.query('DELETE FROM auth_action_tokens WHERE email=ANY($1::text[])', [allEmails]);
      if (sourceHashes.length) {
        await pool.query('DELETE FROM auth_security_events WHERE source_hash=ANY($1::text[])', [sourceHashes]);
      }
      if (accountId) {
        await pool.query('DELETE FROM audit_events WHERE actor_account_id=$1', [accountId]);
        await pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [accountId]);
        await pool.query('DELETE FROM account_roles WHERE account_id=$1', [accountId]);
        await pool.query('DELETE FROM account_identities WHERE account_id=$1', [accountId]);
        await pool.query('DELETE FROM accounts WHERE id=$1', [accountId]);
      }
      const after = await pool.query(`SELECT
        (SELECT count(*)::int FROM account_identities WHERE identifier=ANY($1::text[])) AS identities,
        (SELECT count(*)::int FROM auth_action_tokens WHERE email=ANY($1::text[])) AS tokens,
        (SELECT count(*)::int FROM auth_security_events WHERE source_hash=ANY($2::text[])) AS events`,
      [allEmails, sourceHashes]);
      assert.deepEqual(after.rows[0], { identities: 0, tokens: 0, events: 0 });
    } finally {
      await pool.end();
    }
  }
});
