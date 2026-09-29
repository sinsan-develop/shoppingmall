import assert from 'node:assert/strict';
import test from 'node:test';
import { qaBrowserNames } from '../scripts/qa-browser-fixture.ts';

test('browser QA cleanup targets only exact run-scoped catalog names', () => {
  assert.deepEqual(qaBrowserNames('a438c918'), {
    major: 'qa-a438c918-채소',
    minor: 'qa-a438c918-고추',
    title: 'qa-a438c918-햇고추',
  });
  assert.throws(() => qaBrowserNames('a438c918%'), /QA_RUN_ID/);
});
