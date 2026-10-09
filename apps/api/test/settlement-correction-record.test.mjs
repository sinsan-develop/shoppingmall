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
