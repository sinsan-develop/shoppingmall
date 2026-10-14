import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
const implementation = await import('../src/customer-api.ts');
const key1 = 'b243a3fc-a728-4cde-a43c-3f898c963900';
const key2 = 'bf66b7c1-b0f6-4346-8333-d42ee1c8e299';
async function serve(t, handler) {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push({ path: req.url, method: req.method, origin: req.headers.origin,
      key: req.headers['idempotency-key'], body: body ? JSON.parse(body) : undefined });
    handler(req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return { base: `http://127.0.0.1:${server.address().port}`, requests };
}
function client(base, options = {}) {
  assert.equal(typeof implementation.CustomerApi, 'function', '고객 앱 HTTP 클라이언트 미구현');
  return new implementation.CustomerApi({ apiOrigin: base, webOrigin: 'http://127.0.0.1:9091',
    createKey: () => key1, ...options });
}
function json(res, value, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value));
}

test('favorites and restock use owned customer routes and exact option identity', async t => {
  const { base, requests } = await serve(t, (_req, res) => json(res, []));
  const api = client(base);
  await api.favorites(); await api.addFavorite(key1); await api.removeFavorite(key1);
  await api.restockSubscriptions(); await api.subscribeRestock(key1, key2); await api.cancelRestock(key2);
  assert.deepEqual(requests.map(({ path, method, body }) => ({ path, method, body })), [
    { path: '/customer/favorites', method: 'GET', body: undefined },
    { path: `/customer/favorites/${key1}`, method: 'PUT', body: undefined },
    { path: `/customer/favorites/${key1}`, method: 'DELETE', body: undefined },
    { path: '/customer/restock-subscriptions', method: 'GET', body: undefined },
    { path: '/customer/restock-subscriptions', method: 'POST', body: { productId: key1, optionId: key2 } },
    { path: `/customer/restock-subscriptions/${key2}`, method: 'DELETE', body: undefined },
  ]);
  assert.ok(requests.filter(r => r.method !== 'GET').every(r => r.origin === 'http://127.0.0.1:9091'));
});
test('server quote is authoritative and cart writes use existing customer contract', async t => {
  const { base, requests } = await serve(t, (req, res) => {
    json(res, req.url === '/customer/cart/quote' ? { totalWon: 57000, goodsWon: 66000, shippingWon: 0 } : []);
  });
  const api = client(base);
  assert.equal((await api.quote()).totalWon, 57000);
  await api.setCartItem(key1, 2);
  assert.deepEqual(requests[1], { path: `/customer/cart/items/${key1}`, method: 'PUT',
    origin: 'http://127.0.0.1:9091', key: undefined, body: { quantity: 2 } });
});
test('lost order response retains retry key but changed input receives new key', async t => {
  let lost = true;
  const { base, requests } = await serve(t, (req, res) => {
    if (lost) { lost = false; req.socket.destroy(); return; }
    json(res, { id: key2, status: 'PENDING_PAYMENT', payableWon: 57000, shipments: [] });
  });
  let index = 0; const api = client(base, { createKey: () => [key1, key2][index++] });
  const input = { reservationId: key1, addressId: key2, expectedPayableWon: 57000, selections: {} };
  await assert.rejects(api.submitOrder(input), e => e.code === 'offline');
  await api.submitOrder(input);
  await api.submitOrder({ ...input, expectedPayableWon: 56000 });
  assert.deepEqual(requests.map(r => r.key), [key1, key1, key2]);
  assert.deepEqual(requests[1].body, input);
});
test('session expiry requests login without leaking server error body', async t => {
  const { base } = await serve(t, (_req, res) => json(res, { secret: 'must not surface' }, 401));
  const api = client(base); let expired = 0; api.onSessionExpired = () => { expired++; };
  await assert.rejects(api.addresses(), e => e.code === 'unauthorized' && !e.message.includes('secret'));
  assert.equal(expired, 1);
});
test('stock conflict, disabled payment, and denied role are not successes', async t => {
  const { base } = await serve(t, (req, res) => json(res, {},
    req.url.includes('payment') ? 404 : req.url.includes('cart') ? 409 : 403));
  const api = client(base);
  await assert.rejects(api.setCartItem(key1, 2), e => e.code === 'conflict');
  await assert.rejects(api.payMock(key1, 'approve'), e => e.code === 'not_found');
  await assert.rejects(api.preferences(), e => e.code === 'forbidden');
});
test('questions and opt-out preferences are sent to existing save endpoints', async t => {
  const { base, requests } = await serve(t, (_req, res) => json(res, { status: 'ok' }));
  const api = client(base);
  await api.askQuestion(key1, '발송일 문의');
  await api.savePreferences({ marketingEmail: false, marketingSms: false, push: false });
  assert.deepEqual(requests.map(r => [r.path, r.body]), [
    ['/customer/support/questions', { productId: key1, text: '발송일 문의' }],
    ['/customer/preferences', { marketingEmail: false, marketingSms: false, push: false }],
  ]);
});
test('catalog pagination uses supported sort and numeric page, with array response', async t => {
  const { base, requests } = await serve(t, (_req, res) => json(res, [{ productId: key1, title: '고추' }]));
  const result = await client(base).products('고추', 2);
  const query = new URL(requests[0].path, base).searchParams;
  assert.equal(query.get('sort'), 'latest');
  assert.equal(query.get('page'), '2');
  assert.equal(query.get('q'), '고추');
  assert.equal(query.has('cursor'), false);
  assert.deepEqual(result, [{ productId: key1, title: '고추' }]);
});
test('paid-order pagination explicitly supplies required status and limit', async t => {
  const { base, requests } = await serve(t, (_req, res) => json(res, { items: [], nextCursor: null }));
  await client(base).orders('opaque-cursor');
  const query = new URL(requests[0].path, base).searchParams;
  assert.equal(query.get('status'), 'PAID');
  assert.equal(query.get('limit'), '20');
  assert.equal(query.get('cursor'), 'opaque-cursor');
});
test('finished reservation permits a fresh reservation key', async t => {
  const { base, requests } = await serve(t, (req, res) => json(res, { id: key1, status: 'ACTIVE' },
    req.url.endsWith('/active') ? 404 : 200));
  let index = 0; const api = client(base, { createKey: () => [key1, key2][index++] });
  await api.reserve(); await api.activeReservation(); await api.reserve();
  assert.deepEqual(requests.filter(r => r.method === 'POST').map(r => r.key), [key1, key2]);
});
test('confirmed question ends its retry intent; a new identical question receives new key', async t => {
  const { base, requests } = await serve(t, (_req, res) => json(res, { id: key1 }));
  let index = 0; const api = client(base, { createKey: () => [key1, key2][index++] });
  await api.askQuestion(key1, '같은 문의'); await api.askQuestion(key1, '같은 문의');
  assert.deepEqual(requests.map(r => r.key), [key1, key2]);
});
