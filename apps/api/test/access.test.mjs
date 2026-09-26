import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccess, canApproveProposal } from '../src/access.ts';

const customer = { accountId: 'buyer-a', role: 'customer' };
const sellerA = { accountId: 'seller-person', role: 'seller', sellerId: 'farm-a' };
const sellerB = { accountId: 'other-person', role: 'seller', sellerId: 'farm-b' };
const admin = { accountId: 'seller-person', role: 'admin' };

test('customer IDOR and unauthenticated operations are denied', () => {
  assert.equal(canAccess(undefined, 'read-customer', { customerId: 'buyer-a' }), false);
  assert.equal(canAccess(customer, 'read-customer', { customerId: 'buyer-b' }), false);
  assert.equal(canAccess(customer, 'read-customer', { customerId: 'buyer-a' }), true);
  assert.equal(canAccess(customer, 'approve-proposal', { sellerId: 'farm-a' }), false);
});

test('seller belongs only to its own seller and cannot elevate to admin', () => {
  assert.equal(canAccess(sellerA, 'read-seller-order', { sellerId: 'farm-a' }), true);
  assert.equal(canAccess(sellerA, 'read-seller-order', { sellerId: 'farm-b' }), false);
  assert.equal(canAccess(sellerB, 'change-stock', { sellerId: 'farm-a' }), false);
  assert.equal(canAccess(sellerA, 'approve-proposal', { sellerId: 'farm-a' }), false);
  assert.equal(canAccess(sellerA, 'decide-refund', { sellerId: 'farm-a' }), false);
  assert.equal(canAccess(sellerA, 'complete-settlement', { sellerId: 'farm-a' }), false);
});

test('same account may act separately as seller or admin, with separate request and approval', () => {
  assert.equal(canAccess(admin, 'approve-proposal', { sellerId: 'farm-a' }), true);
  assert.equal(canAccess(admin, 'decide-refund', { sellerId: 'farm-a' }), true);
  assert.equal(canAccess(admin, 'complete-settlement', { sellerId: 'farm-a' }), true);
  assert.equal(canApproveProposal(sellerA, { id: 'request-1', requestedBy: 'seller-person' }), false);
  assert.equal(canApproveProposal(admin, { id: 'request-1', requestedBy: 'seller-person' }), true);
});
