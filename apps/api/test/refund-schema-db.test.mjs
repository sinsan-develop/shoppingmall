import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';

test('0014 exposes six constrained refund ledger relations', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const history = await pool.query(
      'SELECT count(*)::integer AS count FROM drizzle.__drizzle_migrations',
    );
    assert.equal(history.rows[0].count, 18, 'fresh 0017 database must have 18 applied migrations');

    const expected = ['refund_cases', 'refund_case_lines', 'refund_attempts',
      'refund_events', 'refund_event_conflicts', 'refund_case_events'];
    for (const relation of expected) {
      const found = await pool.query('SELECT to_regclass($1) AS relation', ['public.' + relation]);
      assert.equal(found.rows[0].relation, relation, relation + ' must exist after 0014');
    }

    const constraints = await pool.query(
      "SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint " +
      "WHERE conrelid = ANY($1::regclass[]) ORDER BY conname",
      [expected.map((name) => 'public.' + name)],
    );
    const definitions = new Map(constraints.rows.map((row) => [row.conname, row.definition]));
    assert.match(definitions.get('refund_cases_amount_ck') ?? '', /total_refund_won.*goods_refund_won.*shipping_refund_won/i);
    assert.match(definitions.get('refund_cases_status_ck') ?? '', /REQUESTED.*APPROVED.*REJECTED.*PROCESSING.*REFUNDED.*REVIEW_REQUIRED/i);
    const stateDefinition = definitions.get('refund_cases_state_ck') ?? '';
    assert.match(stateDefinition, /pre_shipment_evidence.*ADMIN_CONFIRMED_NOT_DISPATCHED/i);
    assert.match(stateDefinition, /decision_idempotency_key.*decision_fingerprint/i,
      'every final decision must retain its idempotency identity');
    assert.match(stateDefinition, /status.*=.*'REVIEW_REQUIRED'.*completed_at IS NULL/i,
      'manual review must not claim that the refund completed');
    assert.match(definitions.get('refund_case_lines_restock_ck') ?? '', /restock_mode.*none.*on_hand_only/i);
    assert.match(definitions.get('refund_attempts_status_ck') ?? '', /PENDING.*SUCCEEDED.*FAILED.*REVIEW_REQUIRED/i);
    assert.match(definitions.get('refund_events_processing_ck') ?? '', /PENDING_PROCESSING.*APPLIED.*REVIEW_REQUIRED/i);
    assert.match(definitions.get('refund_event_conflicts_reason_ck') ?? '', /FINGERPRINT_MISMATCH.*ATTEMPT_MISMATCH/i);

    const indexes = await pool.query(
      "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename = ANY($1::text[])",
      [expected],
    );
    const names = new Set(indexes.rows.map((row) => row.indexname));
    for (const name of ['refund_cases_request_key_uq', 'refund_attempts_case_key_uq',
      'refund_attempts_provider_refund_uq', 'refund_events_provider_event_uq'])
      assert.ok(names.has(name), name + ' must enforce idempotency');
  } finally {
    await pool.end();
  }
});
