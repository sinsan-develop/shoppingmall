import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const path = new URL('../migrations/0022_s6_corrections.sql', import.meta.url);

test('0022 adds linked directional corrections without rewriting historical migrations', () => {
  assert.equal(existsSync(path), true, '0022 correction migration required');
  const sql = readFileSync(path, 'utf8');
  const journal = JSON.parse(readFileSync(new URL('../migrations/meta/_journal.json', import.meta.url), 'utf8'));
  assert.equal(journal.entries[22].tag, '0022_s6_corrections');
  assert.match(sql, /original_event_id/i);
  assert.match(sql, /correction_direction/i);
  assert.match(sql, /REFERENCES\s+"settlement_events"\s*\("id"\)/i);
  assert.match(sql, /increase.*decrease/is);
});
