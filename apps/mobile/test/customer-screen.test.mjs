import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { build } from 'esbuild';
import React from 'react';
import { act, create } from 'react-test-renderer';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const key = 'b243a3fc-a728-4cde-a43c-3f898c963900';
async function component() {
  const result = await build({ stdin: { contents: 'export {default} from "./src/CustomerApp"; export {CustomerApi} from "./src/customer-api";',
      resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'tsx' },
    bundle: true, write: false, jsx: 'automatic', platform: 'node', format: 'cjs', external: ['react'],
    plugins: [{ name: 'native-controls', setup(builder) {
      builder.onResolve({ filter: /^react-native$/ }, () => ({ path: 'native-controls', namespace: 'native' }));
      builder.onLoad({ filter: /.*/, namespace: 'native' }, () => ({ contents:
        'export const Text="Text",View="View",ScrollView="ScrollView",FlatList="FlatList",Pressable="Pressable",TextInput="TextInput",Switch="Switch",SafeAreaView="SafeAreaView",ActivityIndicator="ActivityIndicator",Image="Image";export const StyleSheet={create:x=>x};', loader: 'js' }));
    } }] });
  const mod = { exports: {} }; new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, mod, mod.exports);
  return mod.exports;
}
async function ready(t, status = {}, overrides = {}) {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push([req.url, req.method, body ? JSON.parse(body) : undefined]);
    const value = req.url.startsWith('/catalog/products?') ? [{ productId: key, title: '시험 고추', sellerName: '시험 농가', originLabel: '국내', minPriceWon: 3000 }] :
      req.url === '/auth/me' ? { role: 'customer' } : req.url === '/customer/cart/quote' ? { totalWon: 9000, goodsWon: 6000, shippingWon: 3000, shipments: [] } :
      req.url === '/customer/cart' ? [{ optionId: key, productId: key, title: '시험 고추', optionName: '1kg', quantity: 2, unitPriceWon: 3000, availability: 'available' }] :
      req.url === '/customer/addresses' ? [{ id: key, label: '집', line1: '가상 주소', recipientName: 'QA' }] :
      req.url === '/customer/preferences' ? { marketingEmail: false, marketingSms: false, push: false } : { status: 'ok' };
    res.writeHead(status[req.url] ?? (req.url === '/customer/checkout/reservations/active' ? 404 : 200),
      { 'content-type': 'application/json' }); res.end(JSON.stringify(overrides[req.url] ?? value));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const { default: App, CustomerApi } = await component();
  const api = new CustomerApi({ apiOrigin: `http://127.0.0.1:${server.address().port}`, webOrigin: 'http://127.0.0.1:9091', createKey: () => key });
  let tree;
  await act(async () => { tree = create(React.createElement(App, { api })); });
  t.after(() => act(() => tree.unmount()));
  return { tree, requests, status };
}
async function until(check, describe = () => '') {
  for (let i = 0; i < 50; i++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    if (check()) return;
  }
  assert.fail(`화면 상태 전이가 완료되지 않음 ${describe()}`);
}
function text(tree) {
  const output = [];
  function visit(node) {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Text') output.push((node.children ?? []).filter(x => typeof x !== 'object').join(''));
    else (node.children ?? []).forEach(visit);
  }
  visit(tree.toJSON()); return output.join('\n');
}
function button(tree, label) { return tree.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel === label); }
async function login(tree) {
  await until(() => button(tree, '로그인')?.props.disabled === false);
  await act(async () => { button(tree, '로그인').props.onPress(); });
  await act(async () => {
    tree.root.findAllByType('TextInput').find(x => x.props.accessibilityLabel === '이메일').props.onChangeText('qa@example.test');
    tree.root.findAllByType('TextInput').find(x => x.props.accessibilityLabel === '비밀번호').props.onChangeText('Test-passphrase-1014');
  });
  await act(async () => { button(tree, '구매자 로그인').props.onPress(); });
  await until(() => text(tree).includes('로그아웃') && button(tree, '장바구니')?.props.disabled === false);
}
test('mobile search renders fetched products rather than construction notice', async t => {
  const { tree } = await ready(t);
  await until(() => text(tree).includes('시험 고추'));
  assert.ok(button(tree, '시험 고추 상세'));
  assert.equal(text(tree).includes('앱 서비스 구축 중'), false);
});

test('favorite list supports detail, removal and hides private items on session expiry', async t => {
  const overrides = {
    '/customer/favorites': [{ productId: key, title: '내 찜 고추', published: true, saleStopped: false }],
    '/customer/restock-subscriptions': [],
    [`/catalog/products/${key}`]: { productId: key, title: '내 찜 고추', description: '설명', options: [], images: [] },
  };
  const { tree, requests, status } = await ready(t, {}, overrides);
  await login(tree);
  assert.ok(button(tree, '찜·재입고'), '찜·재입고 메뉴 미구현');
  await act(async () => button(tree, '찜·재입고').props.onPress());
  await until(() => button(tree, '내 찜 고추 상세')?.props.disabled === false);
  await act(async () => button(tree, '내 찜 고추 상세').props.onPress());
  await until(() => button(tree, '찜 추가')?.props.disabled === false);
  await act(async () => button(tree, '찜 추가').props.onPress());
  await until(() => text(tree).includes('찜에 저장했습니다.'));
  assert.ok(requests.some(([path, method]) => path === `/customer/favorites/${key}` && method === 'PUT'));
  await act(async () => button(tree, '찜·재입고').props.onPress());
  await until(() => button(tree, '내 찜 고추 찜 제거')?.props.disabled === false);
  overrides['/customer/favorites'] = [];
  await act(async () => button(tree, '내 찜 고추 찜 제거').props.onPress());
  await until(() => text(tree).includes('찜한 상품이 없습니다.'));
  assert.ok(requests.some(([path, method]) => path === `/customer/favorites/${key}` && method === 'DELETE'));
  overrides['/customer/favorites'] = [{ productId: key, title: '비공개 내 찜', published: false, saleStopped: true }];
  await act(async () => button(tree, '찜·재입고').props.onPress());
  await until(() => text(tree).includes('비공개 내 찜'));
  assert.equal(button(tree, '비공개 내 찜 상세').props.disabled, true);
  status['/customer/favorites'] = 401;
  await act(async () => button(tree, '찜·재입고').props.onPress());
  await until(() => text(tree).includes('구매자 로그인'));
  assert.equal(text(tree).includes('비공개 내 찜'), false);
});

test('sold-out option requests restock then cancellation refreshes server state', async t => {
  const overrides = {
    [`/catalog/products/${key}`]: { productId: key, title: '시험 고추', description: '설명', saleStopped: false,
      images: [], options: [{ id: key, name: '품절 1kg', priceWon: 3000, sellableQuantity: 0 }] },
    '/customer/favorites': [], '/customer/restock-subscriptions': [],
  };
  const { tree, requests } = await ready(t, {}, overrides);
  await login(tree);
  await act(async () => button(tree, '시험 고추 상세').props.onPress());
  await until(() => button(tree, '품절 1kg 재입고 신청')?.props.disabled === false);
  await act(async () => button(tree, '품절 1kg 재입고 신청').props.onPress());
  await until(() => text(tree).includes('재입고 신청을 저장했습니다.'));
  assert.ok(requests.some(([path, method, body]) => path === '/customer/restock-subscriptions' && method === 'POST' &&
    body.productId === key && body.optionId === key));
  overrides['/customer/restock-subscriptions'] = [{ id: key, productId: key, title: '시험 고추', optionName: '품절 1kg',
    status: 'active', optionState: 'sold_out', currentOptionId: key, saleStopped: false }];
  await act(async () => button(tree, '찜·재입고').props.onPress());
  await until(() => button(tree, '품절 1kg 재입고 취소')?.props.disabled === false);
  overrides['/customer/restock-subscriptions'][0].status = 'cancelled';
  await act(async () => button(tree, '품절 1kg 재입고 취소').props.onPress());
  await until(() => text(tree).includes('신청 취소됨'));
  assert.equal(button(tree, '품절 1kg 재입고 취소'), undefined);
  assert.ok(requests.some(([path, method]) => path === `/customer/restock-subscriptions/${key}` && method === 'DELETE'));
});
test('login is validated by customer session before cart displays server quote', async t => {
  const { tree, requests } = await ready(t);
  await until(() => button(tree, '로그인')?.props.disabled === false);
  await act(async () => { button(tree, '로그인').props.onPress(); });
  await act(async () => {
    tree.root.findAllByType('TextInput').find(x => x.props.accessibilityLabel === '이메일').props.onChangeText('qa@example.test');
    tree.root.findAllByType('TextInput').find(x => x.props.accessibilityLabel === '비밀번호').props.onChangeText('Test-passphrase-1014');
  });
  await act(async () => { button(tree, '구매자 로그인').props.onPress(); });
  await until(() => text(tree).includes('로그아웃') && button(tree, '장바구니')?.props.disabled === false);
  await act(async () => { button(tree, '장바구니').props.onPress(); });
  await until(() => text(tree).includes('9,000원'));
  assert.ok(requests.some(([path]) => path === '/auth/me'));
  assert.ok(requests.some(([path]) => path === '/customer/cart/quote'));
});
test('session expiry removes previously displayed private quote and order controls', async t => {
  const { tree, status } = await ready(t);
  await until(() => button(tree, '로그인')?.props.disabled === false);
  await act(async () => { button(tree, '로그인').props.onPress(); });
  await act(async () => {
    tree.root.findAllByType('TextInput').find(x => x.props.accessibilityLabel === '이메일').props.onChangeText('qa@example.test');
    tree.root.findAllByType('TextInput').find(x => x.props.accessibilityLabel === '비밀번호').props.onChangeText('Test-passphrase-1014');
  });
  await act(async () => { button(tree, '구매자 로그인').props.onPress(); });
  await until(() => text(tree).includes('로그아웃') && button(tree, '장바구니')?.props.disabled === false);
  await act(async () => { button(tree, '장바구니').props.onPress(); });
  await until(() => text(tree).includes('9,000원') && button(tree, '주문·배송')?.props.disabled === false,
    () => text(tree));
  status['/customer/cart'] = 401;
  await act(async () => { button(tree, '장바구니').props.onPress(); });
  await until(() => text(tree).includes('로그인이 만료'));
  assert.equal(text(tree).includes('9,000원'), false);
  assert.equal(button(tree, '주문 생성'), undefined);
  assert.ok(button(tree, '구매자 로그인'));
});
test('returning customer restores owned active hold and can release it', async t => {
  const activePath = '/customer/checkout/reservations/active';
  const { tree, requests } = await ready(t, { [activePath]: 200 }, { [activePath]: {
    id: key, status: 'ACTIVE', expiresAt: '2099-01-01T00:00:00.000Z',
    quote: { goodsWon: 6000, shippingWon: 3000, totalWon: 9000, shipments: [] },
  } });
  await login(tree);
  await act(async () => { button(tree, '장바구니').props.onPress(); });
  await until(() => button(tree, '예약 해제')?.props.disabled === false);
  assert.ok(requests.some(([path]) => path === activePath));
  assert.ok(text(tree).includes('2099-01-01'));
});
test('older paid order lookup never overwrites current held checkout', async t => {
  const activePath = '/customer/checkout/reservations/active';
  const oldId = 'bf66b7c1-b0f6-4346-8333-d42ee1c8e299';
  const { tree } = await ready(t, { [activePath]: 200 }, {
    [activePath]: { id: key, status: 'ACTIVE', expiresAt: '2099-01-01T00:00:00.000Z',
      quote: { totalWon: 9000, goodsWon: 6000, shippingWon: 3000, shipments: [] } },
    '/customer/checkout/orders?status=PAID&limit=20': { items: [{ id: oldId, payableWon: 10000 }], nextCursor: null },
    [`/customer/checkout/orders/${oldId}`]: { id: oldId, status: 'PAID', payableWon: 10000, shipments: [] },
  });
  await login(tree);
  await act(async () => { button(tree, '장바구니').props.onPress(); });
  await until(() => button(tree, '주문 생성')?.props.disabled === false);
  await act(async () => { button(tree, '주문·배송').props.onPress(); });
  await until(() => button(tree, `${oldId} · 10,000원`)?.props.disabled === false);
  await act(async () => { button(tree, `${oldId} · 10,000원`).props.onPress(); });
  await until(() => text(tree).includes('주문 PAID'));
  await until(() => button(tree, '장바구니')?.props.disabled === false);
  await act(async () => { button(tree, '장바구니').props.onPress(); });
  await until(() => button(tree, '주문 생성')?.props.disabled === false);
  assert.equal(text(tree).includes('10,000원'), false);
});
test('question history exposes next cursor rather than hiding older answers', async t => {
  const { tree, requests } = await ready(t, {}, {
    '/customer/support/questions': { items: [{ id: key, status: 'OPEN', body: '첫 페이지 문의' }], nextCursor: 'old-cursor' },
    '/customer/support/questions?cursor=old-cursor': { items: [{ id: 'old', status: 'ANSWERED', body: '오래된 답변 문의' }], nextCursor: null },
  });
  await login(tree);
  await act(async () => { button(tree, '내 문의').props.onPress(); });
  await until(() => button(tree, '문의 더 보기')?.props.disabled === false);
  await act(async () => { button(tree, '문의 더 보기').props.onPress(); });
  await until(() => text(tree).includes('오래된 답변 문의'));
  assert.ok(requests.some(([path]) => path === '/customer/support/questions?cursor=old-cursor'));
});
test('paid or expired checkout refresh frees cart controls for another purchase', async t => {
  for (const finalStatus of ['PAID', 'EXPIRED']) {
    const id = 'bf66b7c1-b0f6-4346-8333-d42ee1c8e299';
    const active = { id: key, status: 'ACTIVE', expiresAt: '2099-01-01T00:00:00.000Z',
      quote: { goodsWon: 6000, shippingWon: 3000, totalWon: 9000, shipments: [] } };
    const overrides = { '/customer/checkout/reservations': active,
      [`/customer/checkout/reservations/${key}`]: active,
      '/customer/checkout/orders': { id, status: 'PENDING_PAYMENT', payableWon: 9000, shipments: [] },
      [`/customer/checkout/orders/${id}`]: { id, status: finalStatus, payableWon: 9000, shipments: [] } };
    const { tree } = await ready(t, {}, overrides);
    await login(tree);
    await act(async () => { button(tree, '장바구니').props.onPress(); });
    await until(() => button(tree, '재고 예약')?.props.disabled === false);
    await act(async () => { button(tree, '재고 예약').props.onPress(); });
    await until(() => button(tree, '주문 생성')?.props.disabled === false);
    await act(async () => { button(tree, '주문 생성').props.onPress(); });
    await until(() => button(tree, '주문 상태 재조회')?.props.disabled === false);
    await act(async () => { button(tree, '주문 상태 재조회').props.onPress(); });
    await until(() => button(tree, '1kg 수량 늘리기')?.props.disabled === false);
    assert.equal(button(tree, '재고 예약').props.disabled, false);
    assert.equal(text(tree).includes('PENDING_PAYMENT'), false);
  }
});
test('logout removes the prior account email from login input', async t => {
  const { tree } = await ready(t);
  await login(tree);
  await act(async () => { button(tree, '로그아웃').props.onPress(); });
  await until(() => button(tree, '구매자 로그인') !== undefined);
  assert.equal(tree.root.findAllByType('TextInput').find(x => x.props.accessibilityLabel === '이메일').props.value, '');
});
test('pagination keeps applied search distinct from an unsubmitted draft', async t => {
  const items = Array.from({ length: 24 }, (_, i) => ({ productId: `qa-${i}`, title: `시험 ${i}`, sellerName: '농가', originLabel: 'QA', minPriceWon: 3000 }));
  const { tree, requests } = await ready(t, {}, { '/catalog/products?q=&sort=latest&page=1': items });
  await until(() => button(tree, '상품 더 보기')?.props.disabled === false);
  await act(async () => { tree.root.findAllByType('TextInput').find(x => x.props.accessibilityLabel === '상품명·판매자 검색').props.onChangeText('다른 검색'); });
  await act(async () => { button(tree, '상품 더 보기').props.onPress(); });
  await until(() => requests.some(([path]) => path.startsWith('/catalog/products?') && new URL(path, 'http://qa.test').searchParams.get('page') === '2'));
  const query = new URL(requests.at(-1)[0], 'http://qa.test').searchParams;
  assert.equal(query.get('q'), '');
});
