import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../src/db/schema.ts';

const systemId = process.env.S52_SUPPORT_TEST_DB_SYSTEM_ID;
const expectedDatabase = process.env.S52_SUPPORT_TEST_DB_NAME;
const isolatedDatabases = new Set([
  'shoppingmall_s52_schema_1007', 'shoppingmall_s52_schema_v2_1007',
  'shoppingmall_s52_schema_v3_1007',
  'shoppingmall_s52_schema_v4_1007',
  'shoppingmall_s52_schema_v5_1007',
  'shoppingmall_s52_schema_v6_1007',
  'shoppingmall_s52_schema_v7_1007',
]);

test('0016~0018 create private support relations without changing existing orders', {
  skip: !systemId || !expectedDatabase,
}, async () => {
  assert.ok(isolatedDatabases.has(expectedDatabase), 'S5.2 isolated database name required');
  assert.equal(process.env.PGDATABASE, expectedDatabase);
  const pool = new Pool();
  try {
    const identity = (await pool.query(`SELECT current_database() AS name,
      system_identifier::text AS system_id FROM pg_control_system()`)).rows[0];
    assert.equal(identity.name, expectedDatabase);
    assert.equal(identity.system_id, systemId);
    const existing = (await pool.query(`SELECT to_regclass(name)::text AS relation FROM unnest($1::text[]) name`, [[
      'support_purchase_confirmations', 'support_reviews', 'support_review_events',
      'support_review_images', 'support_review_reports', 'support_questions',
      'support_question_messages', 'support_question_message_events',
      'support_claims', 'support_claim_events', 'support_claim_messages',
      'support_claim_evidence', 'support_policy_versions',
    ]])).rows.map((row) => row.relation);
    assert.equal(existing.length, 13);
    assert.ok(existing.every(Boolean), `missing S5.2 relation: ${JSON.stringify(existing)}`);
    const declared = [
      schema.supportPolicyVersions, schema.supportPurchaseConfirmations,
      schema.supportReviews, schema.supportReviewEvents, schema.supportReviewImages,
      schema.supportReviewReports, schema.supportQuestions, schema.supportQuestionMessages,
      schema.supportQuestionMessageEvents, schema.supportClaims, schema.supportClaimEvents,
      schema.supportClaimMessages, schema.supportClaimEvidence,
    ];
    for (const table of declared) {
      assert.ok(table, 'every 0016 support table must have a Drizzle declaration');
      const tableName = getTableName(table);
      const declaredColumns = Object.values(getTableColumns(table))
        .map((column) => ({ column_name: column.name,
          data_type: column.getSQLType(), is_nullable: column.notNull ? 'NO' : 'YES' }))
        .sort((a, b) => a.column_name.localeCompare(b.column_name));
      const actualColumns = (await pool.query(`SELECT column_name,
        CASE data_type WHEN 'timestamp with time zone' THEN 'timestamp with time zone'
          ELSE data_type END AS data_type,is_nullable FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1 ORDER BY column_name`, [tableName])).rows;
      assert.deepEqual(declaredColumns, actualColumns, `${tableName} column drift`);
      const config = getTableConfig(table);
      const relationCounts = (await pool.query(`SELECT contype,count(*)::int AS n
        FROM pg_constraint WHERE conrelid=$1::regclass AND contype IN ('f','u')
        GROUP BY contype`, [tableName])).rows;
      const countFor = (kind) => relationCounts.find(({ contype }) => contype === kind)?.n ?? 0;
      assert.equal(config.foreignKeys.length, countFor('f'), `${tableName} FK drift`);
      assert.equal(config.uniqueConstraints.length +
        Object.values(getTableColumns(table)).filter((column) => column.isUnique).length,
      countFor('u'), `${tableName} UNIQUE drift`);
      const actualChecks = (await pool.query(`SELECT conname FROM pg_constraint
        WHERE conrelid=$1::regclass AND contype='c' ORDER BY conname`, [tableName]))
        .rows.map(({ conname }) => conname);
      assert.deepEqual(config.checks.map(({ name }) => name).sort(), actualChecks,
        `${tableName} CHECK drift`);
      const actualIndexes = (await pool.query(`SELECT indexname FROM pg_indexes
        WHERE schemaname='public' AND tablename=$1`, [tableName]))
        .rows.map(({ indexname }) => indexname);
      for (const item of config.indexes) assert.ok(actualIndexes.includes(item.config.name),
        `${tableName} missing index ${item.config.name}`);
    }
    assert.ok(Object.values(getTableColumns(schema.refundCases))
      .some((column) => column.name === 'post_shipment_claim_id'),
    'refund_cases POST bridge must be declared');
    const refundConfig = getTableConfig(schema.refundCases);
    assert.ok(refundConfig.foreignKeys.some((fk) => fk.getName() === 'refund_cases_post_claim_fk'));
    assert.ok(refundConfig.checks.some(({ name }) => name === 'refund_cases_post_state_ck'));
    assert.ok(refundConfig.indexes.some((item) => item.config.name === 'refund_cases_post_claim_uq'));
    const migrationCount = (await pool.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n;
    assert.equal(migrationCount, 19);
    const claimReplyKey = (await pool.query(`SELECT is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name='support_claim_messages'
        AND column_name='idempotency_key'`)).rows;
    assert.deepEqual(claimReplyKey, [{ is_nullable: 'YES' }]);
    const replyKeyIndex = (await pool.query(`SELECT indexdef FROM pg_indexes
      WHERE schemaname='public' AND indexname='support_claim_messages_author_key_uq'`)).rows[0];
    assert.match(replyKeyIndex?.indexdef ?? '', /UNIQUE.*author_account_id.*idempotency_key/);
    const policy = (await pool.query(`SELECT code,version,shipping_refund_won,restock_mode
      FROM support_policy_versions`)).rows;
    assert.deepEqual(policy, [{ code: 'POST_SHIPMENT_TRIAL', version: 1,
      shipping_refund_won: 0, restock_mode: 'none' }]);
    const oldShipmentColumns = (await pool.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='shipment_orders'
      AND column_name IN ('goods_won','payable_won','seller_id') ORDER BY column_name`)).rows;
    assert.deepEqual(oldShipmentColumns.map(({ column_name }) => column_name),
      ['goods_won', 'payable_won', 'seller_id']);
    const bridge = (await pool.query(`SELECT column_name,is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name='refund_cases'
      AND column_name='post_shipment_claim_id'`)).rows;
    assert.deepEqual(bridge, [{ column_name: 'post_shipment_claim_id', is_nullable: 'YES' }]);
    const orderedEvents = (await pool.query(`SELECT table_name FROM information_schema.columns
      WHERE table_schema='public' AND column_name='event_seq'
        AND table_name=ANY($1::text[]) ORDER BY table_name`, [[
      'support_review_events','support_question_message_events','support_claim_events',
    ]])).rows.map((row) => row.table_name);
    assert.deepEqual(orderedEvents, ['support_claim_events','support_question_message_events',
      'support_review_events']);
    const orderedMessages = (await pool.query(`SELECT table_name FROM information_schema.columns
      WHERE table_schema='public' AND column_name='message_seq'
        AND table_name=ANY($1::text[]) ORDER BY table_name`, [[
      'support_question_messages','support_claim_messages',
    ]])).rows.map((row) => row.table_name);
    assert.deepEqual(orderedMessages, ['support_claim_messages','support_question_messages']);
    const bridgeForeignKey = (await pool.query(`SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conname='refund_cases_post_claim_fk'`)).rows[0]?.definition;
    assert.match(bridgeForeignKey, /FOREIGN KEY \(post_shipment_claim_id, checkout_order_id, shipment_order_id, requester_account_id\)/);
    assert.match(bridgeForeignKey, /REFERENCES support_claims\(id, checkout_order_id, shipment_order_id, customer_account_id\)/);
  } finally { await pool.end(); }
});
