import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function applyRequest(coordinator, lane, pending, writes, errors) {
  const token = coordinator.begin(lane);
  try {
    const value = await pending.promise;
    if (coordinator.isLatest(lane, token)) writes.push(value);
  } catch (error) {
    if (coordinator.isLatest(lane, token)) errors.push(error.message);
  } finally {
    coordinator.finish();
  }
}

test('reversed list responses keep only the latest data and stay busy until every request settles', async () => {
  const { createFulfillmentRequestCoordinator } =
    await import('../app/account/fulfillment-ui.ts');
  assert.equal(typeof createFulfillmentRequestCoordinator, 'function');
  const busy = [], writes = [], errors = [];
  const coordinator = createFulfillmentRequestCoordinator(value => busy.push(value));
  const oldResponse = deferred(), latestResponse = deferred();

  const oldRequest = applyRequest(coordinator, 'list', oldResponse, writes, errors);
  const latestRequest = applyRequest(coordinator, 'list', latestResponse, writes, errors);
  latestResponse.resolve('latest-list');
  await latestRequest;
  assert.deepEqual(writes, ['latest-list']);
  assert.deepEqual(busy, [true]);

  oldResponse.resolve('stale-list');
  await oldRequest;
  assert.deepEqual(writes, ['latest-list']);
  assert.deepEqual(errors, []);
  assert.deepEqual(busy, [true, false]);
  assert.equal(coordinator.pendingCount(), 0);
});

test('mutation invalidation silences stale reads while independent detail and reload requests complete', async () => {
  const { createFulfillmentRequestCoordinator } =
    await import('../app/account/fulfillment-ui.ts');
  const busy = [], writes = [], errors = [];
  const coordinator = createFulfillmentRequestCoordinator(value => busy.push(value));
  const staleList = deferred(), detail = deferred(), authoritativeList = deferred();

  const old = applyRequest(coordinator, 'list', staleList, writes, errors);
  const selected = applyRequest(coordinator, 'detail', detail, writes, errors);
  const mutation = coordinator.begin('mutation');
  coordinator.invalidate('list');
  const reload = applyRequest(coordinator, 'list', authoritativeList, writes, errors);

  staleList.reject(new Error('stale list failure'));
  detail.resolve('latest-detail');
  authoritativeList.resolve('authoritative-list');
  await Promise.all([old, selected, reload]);

  assert.deepEqual(writes, ['latest-detail', 'authoritative-list']);
  assert.deepEqual(errors, []);
  assert.equal(coordinator.isLatest('mutation', mutation), true);
  assert.deepEqual(busy, [true]);
  assert.equal(coordinator.pendingCount(), 1);
  coordinator.finish();
  assert.deepEqual(busy, [true, false]);
  assert.equal(coordinator.pendingCount(), 0);
});

test('seller and admin pages keep list, detail and mutation work on the shared coordinator', async () => {
  for (const path of [
    new URL('../app/account/seller/orders/page.tsx', import.meta.url),
    new URL('../app/account/admin/fulfillment/page.tsx', import.meta.url),
  ]) {
    const source = await readFile(path, 'utf8');
    assert.match(source, /createFulfillmentRequestCoordinator/);
    assert.match(source, /begin\('list'\)/);
    assert.match(source, /begin\('detail'\)/);
    assert.match(source, /begin\('mutation'\)/);
    assert.match(source, /invalidate\(/);
    assert.doesNotMatch(source, /finally\(\(\) => setBusy\(false\)\)/);
    assert.doesNotMatch(source, /\.catch\(\(\) => setError/);
  }
});
