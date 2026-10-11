import assert from 'node:assert/strict';
import test from 'node:test';
import { validateS6C2BrowserTarget, assertS6C2BrowserBaseline, runS6C2BrowserFixture } from
  '../scripts/qa-s6-c2-browser-fixture.ts';

test('C2 browser fixture requires explicit approved QA target and system ID', () => {
  const qa = 'postgresql://postgres:test@127.0.0.1:5432/shoppingmall_qa_20261010_2';
  assert.deepEqual(validateS6C2BrowserTarget(qa, 'a1b2c3d4',
    '7622490131194466339', 'approved-qa'), { database: 'shoppingmall_qa_20261010_2', migrations: 26 });
  for (const unsafe of [
    'postgresql://postgres:test@127.0.0.1:5432/shoppingmall',
    'postgresql://postgres:test@127.0.0.1:5432/other',
    'postgresql://postgres:test@remote.invalid:5432/shoppingmall_qa_20261010_2',
    'postgresql://postgres:test@127.0.0.1:5432/shoppingmall_qa_20261010_2?target=shoppingmall',
  ]) assert.throws(() => validateS6C2BrowserTarget(unsafe, 'a1b2c3d4',
    '7622490131194466339', 'approved-qa'));
  assert.throws(() => validateS6C2BrowserTarget(qa, 'a1b2c3d4',
    '7622490131194466339'));
  assert.throws(() => validateS6C2BrowserTarget(qa, 'a1b2c3d4',
    'not-an-id', 'approved-qa'));
  assert.throws(() => validateS6C2BrowserTarget(qa, 'a1b2c3d4',
    '1111111111111111111', 'approved-qa'));
});

test('C2 approved QA mode refuses a mismatched downstream fixture system ID before connection', async () => {
  const original = process.env.QA_ROLE_MATRIX_DB_SYSTEM_ID;
  process.env.QA_ROLE_MATRIX_DB_SYSTEM_ID = '1111111111111111111';
  try {
    await assert.rejects(runS6C2BrowserFixture('a1b2c3d4',
      'postgresql://postgres:test@127.0.0.1:5432/shoppingmall_qa_20261010_2',
      '7622490131194466339', 'virtual-password-123', 'approved-qa'));
  } finally {
    if (original === undefined) delete process.env.QA_ROLE_MATRIX_DB_SYSTEM_ID;
    else process.env.QA_ROLE_MATRIX_DB_SYSTEM_ID = original;
  }
});

test('C2 browser fixture refuses wrong actual database, migrations or existing records', () => {
  const expected = { database: 'shoppingmall_qa_20261010_2', migrations: 26 };
  const systemId = '7622490131194466339';
  assert.doesNotThrow(() => assertS6C2BrowserBaseline(expected, systemId,
    { database: expected.database, systemId, migrations: 26, accounts: 0, events: 0 }));
  for (const actual of [
    { database: 'shoppingmall', systemId, migrations: 26, accounts: 0, events: 0 },
    { database: expected.database, systemId: '1', migrations: 26, accounts: 0, events: 0 },
    { database: expected.database, systemId, migrations: 24, accounts: 0, events: 0 },
    { database: expected.database, systemId, migrations: 26, accounts: 1, events: 0 },
    { database: expected.database, systemId, migrations: 26, accounts: 0, events: 1 },
  ]) assert.throws(() => assertS6C2BrowserBaseline(expected, systemId, actual));
});
