import assert from 'node:assert/strict';
import test from 'node:test';
import { qaBrowserNames, resetQaBrowserFixture } from '../scripts/qa-browser-fixture.ts';

test('browser QA cleanup targets only exact run-scoped catalog names', () => {
  assert.deepEqual(qaBrowserNames('a438c918'), {
    major: 'qa-a438c918-채소',
    minor: 'qa-a438c918-고추',
    title: 'qa-a438c918-햇고추',
  });
  assert.throws(() => qaBrowserNames('a438c918%'), /QA_RUN_ID/);
});

test('role QA browser reset refuses a missing system identity before connecting', async () => {
  const previous = process.env.QA_ROLE_MATRIX_DB_SYSTEM_ID;
  delete process.env.QA_ROLE_MATRIX_DB_SYSTEM_ID;
  try {
    await assert.rejects(
      resetQaBrowserFixture('a438c918',
        'postgresql://qa:placeholder@127.0.0.1:65432/shoppingmall_qa_20261010_2',
        'D:/tmp/unused-browser-images'),
      /QA role database system ID must be specified/,
    );
  } finally {
    if (previous === undefined) delete process.env.QA_ROLE_MATRIX_DB_SYSTEM_ID;
    else process.env.QA_ROLE_MATRIX_DB_SYSTEM_ID = previous;
  }
});
