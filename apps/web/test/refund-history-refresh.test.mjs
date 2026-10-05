import assert from 'node:assert/strict';
import test from 'node:test';
import { createRefreshGate, refreshRefundHistory } from '../app/cart/page.tsx';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('late prior-order refund history cannot overwrite the selected order', async () => {
  const gate = createRefreshGate(), a = deferred(), writes = [];
  const load = (id, send) => refreshRefundHistory('http://127.0.0.1:9092', id, gate,
    rows => writes.push(rows), message => writes.push(message), send);
  const prior = load('order-a', () => a.promise);
  gate.invalidate(); // selection changes before the new order detail finishes loading
  await load('order-b', async () => Response.json([{ id: 'case-b' }]));
  a.resolve(Response.json([{ id: 'case-a' }]));
  await prior;
  assert.deepEqual(writes, [[{ id: 'case-b' }]]);
});

test('latest same-order refresh wins even when the old response body finishes later', async () => {
  const gate = createRefreshGate(), body = deferred(), writes = [];
  const old = refreshRefundHistory('http://127.0.0.1:9092', 'order-a', gate,
    rows => writes.push(rows), message => writes.push(message), async () => ({
      ok: true, status: 200, json: () => body.promise,
    }));
  await Promise.resolve();
  await refreshRefundHistory('http://127.0.0.1:9092', 'order-a', gate,
    rows => writes.push(rows), message => writes.push(message), async () => Response.json([]));
  body.resolve([{ id: 'stale-case' }]); await old;
  assert.deepEqual(writes, [[]]);
});

test('invalidated failures are silent; current authorization failure remains visible', async () => {
  const gate = createRefreshGate(), pending = deferred(), writes = [];
  const old = refreshRefundHistory('http://127.0.0.1:9092', 'order-a', gate,
    rows => writes.push(rows), message => writes.push(message), () => pending.promise);
  gate.invalidate(); pending.reject(new Error('old network failure')); await old;
  assert.deepEqual(writes, []);
  await refreshRefundHistory('http://127.0.0.1:9092', 'order-b', gate,
    rows => writes.push(rows), message => writes.push(message), async (url, options) => {
      assert.equal(new URL(url).pathname, '/customer/checkout/orders/order-b/refund-cases');
      assert.equal(options.credentials, 'include'); assert.equal(options.cache, 'no-store');
      return Response.json({}, { status: 403 });
    });
  assert.deepEqual(writes, ['구매자 역할로 로그인해 주세요']);
});
