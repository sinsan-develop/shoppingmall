import assert from 'node:assert/strict';
import test from 'node:test';
import { planMigrationPreview } from '../scripts/migration-preview.ts';

const files = [
  { tag: '0000_first', when: 100, hash: 'first', sql: ['CREATE TABLE first(id int);'] },
  { tag: '0001_second', when: 200, hash: 'second', sql: ['CREATE TABLE second(id int);'] },
];

test('preview lists only unapplied SQL after verified migration history', () => {
  const pending = planMigrationPreview(files, [{ createdAt: 100, hash: 'first' }]);
  assert.deepEqual(pending, [files[1]]);
  assert.deepEqual(planMigrationPreview(files, files.map(({ when, hash }) => ({ createdAt: when, hash }))), []);
});

test('preview refuses changed or unknown applied migration history', () => {
  assert.throws(() => planMigrationPreview(files, [{ createdAt: 100, hash: 'changed' }]), /history mismatch/i);
  assert.throws(() => planMigrationPreview(files, [{ createdAt: 300, hash: 'other' }]), /history mismatch/i);
  assert.throws(() => planMigrationPreview(files, [{ createdAt: 200, hash: 'second' }]), /history mismatch/i);
});
