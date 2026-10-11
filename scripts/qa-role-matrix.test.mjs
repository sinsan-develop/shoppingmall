import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { auditRoleMatrix } from './qa-role-matrix.mjs';

const matrix = readFileSync(new URL('../docs/evidence/three-role-menu-matrix.md', import.meta.url), 'utf8');
const pages = [
  '/', '/products', '/products/[productId]', '/cart', '/account/customer',
  '/account/seller/products', '/account/seller/orders', '/account/seller/shipping',
  '/account/seller/support', '/account/seller/settlement', '/account/admin/catalog',
  '/account/admin/proposals', '/account/admin/promotions', '/account/admin/fulfillment',
  '/account/admin/refunds', '/account/admin/support/claims', '/account/admin/settlement',
  '/account/admin/monitoring',
];
const appRoot = fileURLToPath(new URL('../apps/web/app/', import.meta.url));

test('the real 18-role matrix maps to the existing Next pages without claiming browser PASS', () => {
  const result = auditRoleMatrix(matrix, appRoot);
  assert.deepEqual(result.routes, pages);
});

test('matrix audit refuses a duplicated role route and a nonexistent page', () => {
  const duplicate = matrix.replace('| 18 | 관리자 | `/account/admin/monitoring` |',
    '| 18 | 관리자 | `/account/admin/catalog` |');
  assert.throws(() => auditRoleMatrix(duplicate, appRoot), /duplicate/i);
  const missing = matrix.replace('| 18 | 관리자 | `/account/admin/monitoring` |',
    '| 18 | 관리자 | `/account/admin/unknown` |');
  assert.throws(() => auditRoleMatrix(missing, appRoot), /missing/i);
});
