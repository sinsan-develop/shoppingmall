import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../../../scripts/qa-load-gate.mjs', import.meta.url));
const safe = {
  APP_ENV: 'development', NODE_ENV: 'test', PAYMENT_MODE: 'mock',
  API_HOST: '127.0.0.1', QA_LOAD_MODE: '1', QA_LOAD_RUN_ID: 'a1b2c3d4',
  PGDATABASE: 'shoppingmall_qa_20261010_2',
  DATABASE_URL: 'postgresql://qa@127.0.0.1:15442/shoppingmall_qa_20261010_2',
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
