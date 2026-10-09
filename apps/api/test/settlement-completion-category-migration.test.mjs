import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const path = new URL('../migrations/0023_s6_completion_category.sql', import.meta.url);

test('0023 snapshots the completion category and refuses unknowable historical completions', () => {
  assert.equal(existsSync(path), true, '0023 completion category migration required');
  const sql = readFileSync(path, 'utf8');
  const journal = JSON.parse(readFileSync(new URL('../migrations/meta/_journal.json', import.meta.url), 'utf8'));
  assert.equal(journal.entries.at(-1).tag, '0023_s6_completion_category');
  assert.match(sql, /IF EXISTS\s*\(SELECT 1 FROM seller_settlement_periods\)/i);
  assert.match(sql, /seller_category_id/i);
  assert.match(sql, /seller_category_name/i);
});
