import assert from 'node:assert/strict';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { planMigrationPreview } from '../scripts/migration-preview.ts';

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations');

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

test('checked-out historical SQL keeps the hashes already applied to the shared database', () => {
  const expected = [
    'd5acf8ea2991ef781a9439e330c6f5bdeba546c57e88eeca9c0777cd5b515c12',
    '44fd5dd493d9f32500856c54fade6f3cebdf29e8327de388305c20697949c27b',
    'b5039816a71a073ef543b022dd183e1486ecd2f0dd35fa8fbff0956a694c3ed3',
    'f4771c03b2a622bde0e317deb40efceeddeb777b8861d7a7d861704e55b0075c',
    '401216f868fd52d0140e2b374aa9860dc6a800358ec672ec48059eea654a5b7a',
    '21691cbc9450808e6063dfba06917cd1bb180ac57a7905417019161db1850f94',
    '9ee2bd00d8e3e2131efeb80e4238c6d80ae03436874b5596ebdb2d7ee1c8d523',
    'fc1aad9238071055a00eecabf2f273de520719cee2919d0c11158710b80dd56e',
    'fb9878e9c9043a5686623556d19c1d1bd11a99185c7cc730a263574affa89538',
    '85db48a68ed370022aeb50f6e8dc9efb7fbf4bf03b882d98ca416d6f11d1d3ed',
    '2be18dda86fb4ed32df427628ace9f9359c714d117bd3429cfd7ff81dc42267c',
    '75675ca05c8e55e3f0d8ecc7cba5ada64c304372adbde9d1bface5e82850c330',
    'efe1d8848186d4b74c202241d20cc0a80a4417078e469aa3b082a294b8d267fa',
    '4556376ac133b0468015a56f631b93bf5bff8dd276ee1e3777c096d35456b547',
    'fe1328de61502e1d19a7ade992862c9bd508667f432f0ac29de1df87a9c75181',
    'ec41e1ff8281ff53c4fc424245d5f9601f04d001df024b4fa4e111d42f1d19ee',
  ];
  const migrations = readMigrationFiles({ migrationsFolder });
  assert.deepEqual(migrations.slice(0, expected.length).map((item) => item.hash), expected);
  assert.equal(migrations.length, 18, '0016/0017 must append to immutable 0000~0015');
});
