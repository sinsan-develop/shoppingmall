import assert from 'node:assert/strict';
import test from 'node:test';
import { recordManualCommission } from '../src/settlement/commission.ts';

const adminId = '11111111-1111-4111-8111-111111111111';
const sellerId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const input = { sellerId, requestId, amountWon: 1200,
  occurredAt: '2026-05-02T00:00:00.000Z', reason: '5월 판매 수수료' };

test('manual commission validates money, occurrence, reason and idempotency UUID', async () => {
  const client = { async query() { throw new Error('must not access database'); } };
  for (const bad of [{ ...input, amountWon: 0 }, { ...input, amountWon: 1.5 },
    { ...input, amountWon: Number.MAX_SAFE_INTEGER + 1 },
    { ...input, occurredAt: '2026-05-02' }, { ...input, reason: ' ' },
    { ...input, requestId: 'bad' }]) {
    await assert.rejects(() => recordManualCommission(client, adminId, bad),
      /Invalid manual commission/);
  }
});

test('manual commission reuses an identical request and rejects changed retries', async () => {
  let existing = null;
  const client = { async query(sql) {
    if (sql.includes('INSERT INTO settlement_events')) {
      if (existing) return { rows: [], rowCount: 0 };
      existing = { id: 'event-a', sellerId, amountWon: '1200',
        occurredAt: new Date(input.occurredAt), reason: input.reason,
        requestId };
      return { rows: [existing], rowCount: 1 };
    }
    if (sql.includes('FROM settlement_events')) return { rows: [existing], rowCount: 1 };
    throw new Error('Unexpected query');
  } };
  assert.equal((await recordManualCommission(client, adminId, input)).id, 'event-a');
  assert.equal((await recordManualCommission(client, adminId, input)).id, 'event-a');
  await assert.rejects(() => recordManualCommission(client, adminId, {
    ...input, amountWon: 1300 }), /Manual commission request conflict/);
});
