import assert from 'node:assert/strict';
import test from 'node:test';
import { recordCorrection } from '../src/settlement/correction.ts';

const adminId = '11111111-1111-4111-8111-111111111111';
const originalEventId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const input = { originalEventId, requestId, direction: 'decrease',
  amountWon: 2000, reason: '원거래 금액 정정' };

test('correction rejects malformed money, reference, direction and reason before database work', async () => {
  const client = { async query() { throw new Error('must not access database'); } };
  for (const bad of [{ ...input, amountWon: 0 }, { ...input, amountWon: 1.5 },
    { ...input, originalEventId: 'bad' }, { ...input, requestId: 'bad' },
    { ...input, direction: 'neutral' }, { ...input, reason: ' ' }]) {
    await assert.rejects(() => recordCorrection(client, adminId, bad),
      /Invalid settlement correction/);
  }
});

test('correction reuses an identical request and rejects a changed retry', async () => {
  let saved = null;
  const client = { async query(sql) {
    if (sql.includes('FOR UPDATE OF event')) return { rows: [{ id: originalEventId,
      kind: 'sale', amountWon: '10000', sellerId: 'seller-a',
      sellerName: '판매자 A', sellerCategoryId: 'category-a',
      sellerCategoryName: '분류 A' }] };
    if (sql.includes('WHERE dedupe_key=$1')) return { rows: saved ? [saved] : [] };
    if (sql.includes('sum(CASE')) return { rows: [{ adjustedWon: '10000' }] };
    if (sql.includes('INSERT INTO settlement_events')) {
      saved = { id: 'correction-a', originalEventId, requestId,
        direction: 'decrease', amountWon: '2000', reason: input.reason,
        recordedBy: adminId, occurredAt: new Date('2026-07-01T00:00:00Z') };
      return { rows: [saved] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  } };
  assert.equal((await recordCorrection(client, adminId, input)).id, 'correction-a');
  assert.equal((await recordCorrection(client, adminId, input)).id, 'correction-a');
  await assert.rejects(() => recordCorrection(client, adminId,
    { ...input, amountWon: 3000 }), /Settlement correction request conflict/);
});

test('UUID case variants represent one correction request and one original event', async () => {
  const original = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const request = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const byKey = new Map();
  let inserts = 0;
  const client = { async query(sql, values) {
    if (sql.includes('FOR UPDATE OF event')) return { rows: [{
      id: original, kind: 'commission', amountWon: '10000', sellerId: 'seller-a',
      sellerName: '판매자 A', sellerCategoryId: 'category-a', sellerCategoryName: '분류 A',
    }] };
    if (sql.includes('WHERE dedupe_key=$1')) return { rows: byKey.has(values[0])
      ? [byKey.get(values[0])] : [] };
    if (sql.includes('sum(CASE')) return { rows: [{ adjustedWon: '10000' }] };
    if (sql.includes('INSERT INTO settlement_events')) {
      inserts++;
      const row = { id: 'correction-a', originalEventId: values[7],
        requestId: values[6], direction: values[8], amountWon: String(values[1]),
        reason: values[10], recordedBy: values[9],
        occurredAt: new Date('2026-07-01T00:00:00Z') };
      byKey.set(values[0], row);
      return { rows: [row] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  } };
  const mixed = { ...input, originalEventId: original.toUpperCase(),
    requestId: request.toUpperCase() };
  const first = await recordCorrection(client, adminId, mixed);
  const retry = await recordCorrection(client, adminId,
    { ...mixed, originalEventId: original, requestId: request });
  assert.equal(retry.id, first.id);
  assert.equal(inserts, 1);
  await assert.rejects(() => recordCorrection(client, adminId,
    { ...mixed, originalEventId: original, requestId: request, amountWon: 3000 }),
  /Settlement correction request conflict/);
});
