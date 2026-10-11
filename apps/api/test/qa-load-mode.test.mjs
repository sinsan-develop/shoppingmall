import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { attestQaLoadDatabase } from '../../../scripts/qa-load-db-attest.mjs';

const script = fileURLToPath(new URL('../../../scripts/qa-load-gate.mjs', import.meta.url));
const attestScript = fileURLToPath(new URL('../../../scripts/qa-load-db-attest.mjs', import.meta.url));
const apiMain = fileURLToPath(new URL('../src/main.ts', import.meta.url));
const safe = {
  APP_ENV: 'development', NODE_ENV: 'test', PAYMENT_MODE: 'mock',
  API_HOST: '127.0.0.1', QA_LOAD_MODE: '1', QA_LOAD_RUN_ID: 'a1b2c3d4',
  PGDATABASE: 'shoppingmall_qa_20261010_2',
  DATABASE_URL: 'postgresql://qa@127.0.0.1:15442/shoppingmall_qa_20261010_2',
  QA_LOAD_DB_SYSTEM_ID: '7622490131194466339',
};

function gate(overrides = {}) {
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
    ...safe, ...overrides };
  return spawnSync(process.execPath, ['--import', 'tsx', script], {
    env, encoding: 'utf8', timeout: 15000,
  });
}

test('QA load preflight accepts only a private mock process without external credentials', () => {
  const result = gate();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /QA load gate passed/);
  assert.doesNotMatch(result.stdout, /SECRET|KEY|TOKEN/i);
  const ipv6 = gate({ API_HOST: '::1',
    DATABASE_URL: 'postgresql://qa@[::1]:15442/shoppingmall_qa_20261010_2' });
  assert.equal(ipv6.status, 0, ipv6.stderr);
});

test('QA load preflight refuses unsafe runtime combinations before requests', () => {
  for (const unsafe of [
    { APP_ENV: 'production' }, { APP_ENV: 'staging' },
    { NODE_ENV: 'production' }, { PAYMENT_MODE: 'disabled' },
    { API_HOST: '0.0.0.0' }, { QA_LOAD_MODE: '0' },
    { QA_LOAD_RUN_ID: '' }, { QA_LOAD_RUN_ID: 'bad id' },
    { TOSS_PAYMENTS_SECRET_KEY: 'sentinel-secret' },
  ]) {
    const result = gate(unsafe);
    assert.notEqual(result.status, 0, JSON.stringify(unsafe));
    assert.doesNotMatch(result.stdout + result.stderr, /sentinel-secret/);
  }
});

test('QA load preflight rejects the protected DB and mismatched QA target before requests', () => {
  for (const unsafe of [
    { PGDATABASE: 'shoppingmall', DATABASE_URL: 'postgresql://qa@127.0.0.1:15442/shoppingmall' },
    { PGDATABASE: 'shoppingmall_qa_20261010_2', DATABASE_URL: 'postgresql://qa@127.0.0.1:15442/shoppingmall' },
    { PGDATABASE: '' }, { DATABASE_URL: '' },
    { DATABASE_URL: 'postgresql://qa@external.example/shoppingmall_qa_20261010_2' },
  ]) {
    const result = gate(unsafe);
    assert.notEqual(result.status, 0, JSON.stringify(unsafe));
    assert.doesNotMatch(result.stdout + result.stderr, /postgresql:\/\//);
  }
});

test('QA load database attestation requires the actual approved database and cluster identity', async () => {
  const env = { ...safe, QA_LOAD_DB_SYSTEM_ID: '7622490131194466339' };
  const query = async (sql) => {
    assert.match(sql, /pg_control_system\(\)/);
    return { rows: [{ database: 'shoppingmall_qa_20261010_2', system_id: env.QA_LOAD_DB_SYSTEM_ID }] };
  };
  await attestQaLoadDatabase(env, query);
  await assert.rejects(attestQaLoadDatabase({ ...env, QA_LOAD_DB_SYSTEM_ID: '' }, query),
    /QA load database unavailable/);
  await assert.rejects(attestQaLoadDatabase(env, async () => ({ rows: [{
    database: 'shoppingmall', system_id: env.QA_LOAD_DB_SYSTEM_ID,
  }] })), /QA load database identity mismatch/);
  await assert.rejects(attestQaLoadDatabase(env, async () => ({ rows: [{
    database: 'shoppingmall_qa_20261010_2', system_id: '1',
  }] })), /QA load database identity mismatch/);
});

test('QA load database attestation refuses unsafe config before opening a connection', async () => {
  let queried = false;
  await assert.rejects(attestQaLoadDatabase({ ...safe, PGDATABASE: 'shoppingmall',
    DATABASE_URL: 'postgresql://qa:sentinel-secret@127.0.0.1:15442/shoppingmall',
    QA_LOAD_DB_SYSTEM_ID: '7622490131194466339' }, async () => {
    queried = true;
    return { rows: [] };
  }), /QA load database unavailable/);
  assert.equal(queried, false);
});

test('QA load database CLI hides connection details and credentials on failure', () => {
  const secret = 'sentinel-secret';
  const result = spawnSync(process.execPath, ['--import', 'tsx', attestScript], {
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...safe,
      DATABASE_URL: `postgresql://qa:${secret}@127.0.0.1:1/shoppingmall_qa_20261010_2`,
      QA_LOAD_DB_SYSTEM_ID: '7622490131194466339' },
    encoding: 'utf8', timeout: 10000,
  });
  assert.notEqual(result.status, 0);
  assert.equal(result.stderr.trim(), 'QA load database attestation failed');
  assert.doesNotMatch(result.stdout + result.stderr, /sentinel-secret|postgresql:\/\//);
});

test('QA load API refuses to listen when the configured QA database cannot be attested', () => {
  const secret = 'sentinel-secret';
  const result = spawnSync(process.execPath, ['--import', 'tsx', apiMain], {
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...safe,
      DATABASE_URL: `postgresql://qa:${secret}@127.0.0.1:1/shoppingmall_qa_20261010_2`,
      QA_LOAD_DB_SYSTEM_ID: '7622490131194466339', API_PORT: '0' },
    encoding: 'utf8', timeout: 20000,
  });
  assert.equal(result.error, undefined, 'the API must reject the DB before listening');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /QA load database attestation failed/);
  assert.doesNotMatch(result.stdout + result.stderr, /sentinel-secret|postgresql:\/\//);
});
