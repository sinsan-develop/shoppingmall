import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('0021 registers immutable unique completion membership and refuses unknown history', () => {
  const migration = readFileSync(new URL('../migrations/0021_s6_completed_event_links.sql', import.meta.url), 'utf8');
  const journal = JSON.parse(readFileSync(new URL('../migrations/meta/_journal.json', import.meta.url), 'utf8'));
  assert.equal(journal.entries.at(-1).tag, '0021_s6_completed_event_links');
  assert.match(migration, /seller_settlement_period_event_links/);
  assert.match(migration, /UNIQUE\s*\(\s*"event_id"\s*\)/i);
  assert.match(migration, /prevent_settlement_history_change/);
  assert.match(migration, /IF EXISTS\s*\(\s*SELECT 1 FROM seller_settlement_periods/i);
  assert.match(migration, /period\.xmin::text::bigint = mod\(txid_current\(\), 4294967296\)/);
});
