import assert from 'node:assert/strict';
import test from 'node:test';
import * as sellerApplications from '../src/auth/seller-applications.ts';

test('seller application lookup requires a session and scopes the query to its account', async () => {
  const accountId = '11111111-1111-4111-8111-111111111111';
  let queried = false;
  const pool = {
    async query(sql, values) {
      queried = true;
      assert.match(sql, /WHERE account_id=\$1/);
      assert.deepEqual(values, [accountId]);
      return { rows: [{ id: 'a', displayName: 'Farm', status: 'pending',
        sellerId: null, reviewReason: null, createdAt: 'date', reviewedAt: null }] };
    },
  };
  assert.equal(typeof sellerApplications.listOwnSellerApplications, 'function');
  const { listOwnSellerApplications } = sellerApplications;
  await assert.rejects(listOwnSellerApplications(pool, undefined), /session/i);
  assert.equal(queried, false);
  assert.deepEqual((await listOwnSellerApplications(pool, { accountId, role: 'customer' }))[0], {
    id: 'a', displayName: 'Farm', status: 'pending', sellerId: null,
    reviewReason: null, createdAt: 'date', reviewedAt: null,
  });
});
