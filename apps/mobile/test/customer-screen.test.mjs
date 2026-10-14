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
async function ready(t, status = {}, overrides = {}, props = {}, holds = {}) {
  const requests = [];
  let signedIn = false;
  const server = createServer(async (req, res) => {
    const responseStatus = status[req.url] ?? (req.url === '/auth/me' && !signedIn && !overrides[req.url] ? 401 :
      req.url === '/customer/checkout/reservations/active' ? 404 : 200);
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    requests.push([req.url, req.method, body.length ? req.headers['content-type'] === 'application/json' ? JSON.parse(body.toString()) : [...body] : undefined]);
    if (holds[req.url]) await (typeof holds[req.url] === 'function' ? holds[req.url](req) : holds[req.url]);
    if (status[req.url] === 'disconnect') { req.socket.destroy(); return; }
    if (req.url === '/auth/login' && responseStatus === 200) signedIn = true;
    if (req.url === '/auth/logout' && responseStatus === 200) signedIn = false;
    const value = req.url.startsWith('/catalog/products?') ? [{ productId: key, title: '시험 고추', sellerName: '시험 농가', originLabel: '국내', minPriceWon: 3000 }] :
      req.url === '/auth/me' ? { role: 'customer' } : req.url === '/customer/cart/quote' ? { totalWon: 9000, goodsWon: 6000, shippingWon: 3000, shipments: [] } :
      req.url === '/customer/cart' ? [{ optionId: key, productId: key, title: '시험 고추', optionName: '1kg', quantity: 2, unitPriceWon: 3000, availability: 'available' }] :
      req.url === '/customer/addresses' ? [{ id: key, label: '집', line1: '가상 주소', recipientName: 'QA' }] :
      req.url === '/customer/preferences' ? { marketingEmail: false, marketingSms: false, push: false } : { status: 'ok' };
    res.writeHead(responseStatus,
      { 'content-type': 'application/json' }); res.end(JSON.stringify(overrides[req.url] ??
        (req.url === '/catalog/categories' || req.url === '/catalog/sellers' || req.url === '/customer/promotions/coupons' || req.url.endsWith('/refund-cases') ? [] :
          req.url === '/home/content' ? { menu: [], events: [], recommendations: [] } : value)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const { default: App, CustomerApi } = await component();
  const api = new CustomerApi({ apiOrigin: `http://127.0.0.1:${server.address().port}`, webOrigin: 'http://127.0.0.1:9091', createKey: () => key });
  // Observe settlement of real HTTP client calls, without replacing their responses or effects.
  const sessionSettled = [];
  const readSession = api.me.bind(api);
  api.me = (...args) => readSession(...args).finally(() => { sessionSettled.push(true); });
  let tree;
  await act(async () => { tree = create(React.createElement(App, { api, ...props })); });
  t.after(() => act(() => tree.unmount()));
  return { tree, requests, status, api, sessionSettled };
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

test('existing customer session restores private cart and active reservation without another login', async t => {
  const { tree, requests } = await ready(t, { '/customer/checkout/reservations/active': 200 }, { '/auth/me': { role: 'customer' },
    '/customer/checkout/reservations/active': { id: key, status: 'ACTIVE', expiresAt: '2099-01-01T00:00:00Z',
      quote: { totalWon: 9000, goodsWon: 6000, shippingWon: 3000, shipments: [] } } });
  await until(() => button(tree, '로그아웃')?.props.disabled === false);
  await act(async () => button(tree, '장바구니').props.onPress());
  await until(() => text(tree).includes('합계 9,000원') && text(tree).includes('예약 ACTIVE'));
  assert.equal(requests.some(([path]) => path === '/auth/login'), false);
  assert.ok(requests.some(([path]) => path === '/customer/checkout/reservations/active'));
});

test('expired unavailable or non-customer startup session never exposes private cart', async t => {
  for (const [code, actor] of [[401, undefined], [503, undefined], [200, { role: 'admin' }]]) {
    const { tree, requests, sessionSettled } = await ready(t, { '/auth/me': code }, actor ? { '/auth/me': actor } : {});
    await until(() => sessionSettled.length === 1);
    await until(() => button(tree, '장바구니')?.props.disabled === false);
    await act(async () => button(tree, '장바구니').props.onPress());
    assert.ok(text(tree).includes('구매자 로그인'));
    assert.equal(requests.some(([path]) => path === '/customer/cart'), false);
    assert.equal(button(tree, '로그아웃'), undefined);
  }
});

test('late startup expiry cannot clear a newer manual login and public search stays usable', async t => {
  let release; const held = new Promise(resolve => { release = resolve; }); t.after(() => release());
  let calls = 0;
  const { tree, requests, sessionSettled } = await ready(t, {}, {}, {}, { '/auth/me': () => ++calls === 1 ? held : undefined });
  await until(() => requests.some(([path]) => path === '/auth/me'));
  await until(() => button(tree, '검색')?.props.disabled === false);
  await login(tree);
  await act(async () => { release(); });
  await until(() => sessionSettled.length === 2);
  await until(() => button(tree, '로그아웃')?.props.disabled === false);
  await act(async () => button(tree, '장바구니').props.onPress());
  await until(() => text(tree).includes('합계 9,000원'));
});

test('late startup success cannot revive an expired private session', async t => {
  let release; const held = new Promise(resolve => { release = resolve; }); t.after(() => release());
  const { tree, requests, api, sessionSettled } = await ready(t, { '/customer/addresses': 401 }, { '/auth/me': { role: 'customer' } }, {}, { '/auth/me': held });
  await until(() => requests.some(([path]) => path === '/auth/me'));
  await act(async () => { await assert.rejects(api.addresses(), error => error.code === 'unauthorized'); release(); });
  await until(() => sessionSettled.length === 1);
  await until(() => button(tree, '로그인')?.props.disabled === false);
  await act(async () => button(tree, '장바구니').props.onPress());
  assert.ok(text(tree).includes('구매자 로그인'));
  assert.equal(requests.some(([path]) => path === '/customer/cart'), false);
});

test('late startup success cannot restore the customer after explicit logout', async t => {
  let release; const held = new Promise(resolve => { release = resolve; }); t.after(() => release());
  let calls = 0;
  const { tree, requests, sessionSettled } = await ready(t, {}, { '/auth/me': { role: 'customer' } }, {},
    { '/auth/me': () => ++calls === 1 ? held : undefined });
  await until(() => requests.some(([path]) => path === '/auth/me'));
  await login(tree);
  await act(async () => button(tree, '로그아웃').props.onPress());
  await until(() => button(tree, '로그인')?.props.disabled === false);
  await act(async () => { release(); });
  await until(() => sessionSettled.length === 2);
  assert.equal(button(tree, '로그아웃'), undefined);
  await act(async () => button(tree, '장바구니').props.onPress());
  assert.equal(requests.some(([path]) => path === '/customer/cart'), false);
});

test('catalog pagination preserves applied category seller sort and resets when a new filter is applied', async t => {
  const seller = 'bf66b7c1-b0f6-4346-8333-d42ee1c8e299';
  const firstPage = `/catalog/products?q=&sort=price_asc&page=1&categoryId=${key}&sellerId=${seller}`;
  const items = Array.from({ length: 24 }, (_, i) => ({ productId: `qa-${i}`, title: `첫 결과 ${i}`, sellerName: '시험 농가', originLabel: 'QA', minPriceWon: 3000 }));
  const { tree, requests } = await ready(t, {}, { '/catalog/categories': [{ id: key, parentId: null, name: '채소' }],
    '/catalog/sellers': [{ id: seller, displayName: '시험 농가' }], [firstPage]: items });
  await until(() => button(tree, '분류 채소')?.props.disabled === false);
  for (const label of ['분류 채소', '농가 시험 농가', '낮은 가격순']) await act(async () => { button(tree, label).props.onPress(); });
  await act(async () => { button(tree, '검색').props.onPress(); });
  await until(() => button(tree, '상품 더 보기')?.props.disabled === false);
  await act(async () => { button(tree, '높은 가격순').props.onPress(); });
  await act(async () => { button(tree, '상품 더 보기').props.onPress(); });
  await until(() => requests.some(([path]) => path.includes('page=2')));
  const page2 = new URL(requests.find(([path]) => path.includes('page=2'))[0], 'http://qa.test').searchParams;
  assert.equal(page2.get('sort'), 'price_asc'); assert.equal(page2.get('categoryId'), key); assert.equal(page2.get('sellerId'), seller);
  await act(async () => { button(tree, '검색').props.onPress(); });
  await until(() => requests.some(([path]) => path.includes('sort=price_desc&page=1')));
  await until(() => button(tree, '검색').props.disabled === false);
  assert.equal(text(tree).includes('첫 결과 0'), false);
});
test('home renders server curation and opens recommended products and unavailable events safely', async t => {
  const item = { productId: key, title: '서버 추천 고추', sellerName: '시험 농가', originLabel: 'QA', minPriceWon: 3000 };
  const { tree, requests } = await ready(t, {}, { '/home/content': { menu: [], recommendations: [item],
    events: [{ id: key, title: '수확 기획전', description: '기간 한정', heroProduct: item, heroImageId: null }] },
    [`/home/events/${key}`]: { status: 'unavailable', message: '현재 이 기획전을 볼 수 없습니다. 전체 상품을 둘러보세요.' },
    [`/catalog/products/${key}`]: { ...item, shippingMode: 'seller_direct', description: '실제 상세', options: [], images: [] } });
  await until(() => button(tree, '홈')?.props.disabled === false);
  await act(async () => { button(tree, '홈').props.onPress(); });
  await until(() => button(tree, '추천 서버 추천 고추')?.props.disabled === false);
  await act(async () => { button(tree, '추천 서버 추천 고추').props.onPress(); });
  await until(() => text(tree).includes('실제 상세'));
  await act(async () => { button(tree, '홈').props.onPress(); });
  await until(() => button(tree, '기획전 수확 기획전')?.props.disabled === false);
  await act(async () => { button(tree, '기획전 수확 기획전').props.onPress(); });
  await until(() => text(tree).includes('현재 이 기획전을 볼 수 없습니다'));
  assert.ok(requests.some(([path]) => path === `/home/events/${key}`));
  assert.equal(button(tree, '추천 서버 추천 고추'), undefined);
});

test('taxonomy failure preserves catalog search and does not invent categories or farms', async t => {
  const { tree, requests } = await ready(t, { '/catalog/categories': 503 });
  await until(() => text(tree).includes('분류·농가를 불러오지 못했습니다'));
  assert.ok(text(tree).includes('시험 고추'));
  assert.equal(button(tree, '분류 채소'), undefined);
  await act(async () => { button(tree, '검색').props.onPress(); });
  await until(() => button(tree, '검색').props.disabled === false);
  assert.equal(requests.filter(([path]) => path.startsWith('/catalog/products?')).length, 2);
});

test('slow taxonomy never locks product search or delays home content', async t => {
  let release; const hold = new Promise(resolve => { release = resolve; }); t.after(() => release());
  const { tree } = await ready(t, {}, {}, {}, { '/catalog/categories': hold });
  await until(() => text(tree).includes('시험 고추'));
  await until(() => button(tree, '검색')?.props.disabled === false);
  assert.equal(button(tree, '시험 고추 상세').props.disabled, false);
  await act(async () => { button(tree, '홈').props.onPress(); });
  await until(() => text(tree).includes('현재 진행 중인 기획전이 없습니다.'));
  assert.equal(button(tree, '상품').props.disabled, false);
  release();
});

test('login opens signup/reset intake, rejects invalid email, and does not claim account completion', async t => {
  const { tree, requests } = await ready(t, {}, { '/auth/customer-signup/start': { status: 'accepted' }, '/auth/password-reset/start': { status: 'accepted' } });
  await until(() => button(tree, '로그인')?.props.disabled === false);
  await act(async () => { button(tree, '로그인').props.onPress(); });
  for (const label of ['가입하기', '비밀번호 찾기']) {
    assert.ok(button(tree, label), `${label} 진입 미구현`);
    await act(async () => { button(tree, label).props.onPress(); });
    await until(() => button(tree, '확인 링크 요청') !== undefined);
    assert.equal(button(tree, '확인 링크 요청').props.disabled, true);
    const field = tree.root.findAllByType('TextInput').find(x => x.props.accessibilityLabel === '요청 이메일');
    await act(async () => { field.props.onChangeText('qa@example.invalid'); });
    await act(async () => { button(tree, '확인 링크 요청').props.onPress(); });
    await until(() => text(tree).includes('요청을 접수했습니다'));
    assert.ok(text(tree).includes('가입·비밀번호 변경 완료가 아닙니다'));
    assert.ok(!requests.some(([path]) => path.endsWith('/complete')));
    await act(async () => { button(tree, '로그인으로 돌아가기').props.onPress(); });
    await until(() => button(tree, '구매자 로그인') !== undefined);
  }
  assert.ok(requests.some(([path]) => path === '/auth/customer-signup/start'));
  assert.ok(requests.some(([path]) => path === '/auth/password-reset/start'));
});

test('deletion needs explicit acknowledgement, records request only and resets confirmation on logout', async t => {
  const { tree, requests } = await ready(t, {}, { '/customer/deletion-request': { id: key, status: 'requested' } });
  await login(tree);
  await act(async () => { button(tree, '배송지·알림').props.onPress(); });
  await until(() => button(tree, '탈퇴 요청 접수') !== undefined);
  assert.equal(button(tree, '탈퇴 요청 접수').props.disabled, true);
  assert.ok(text(tree).includes('계정은 즉시 삭제되지 않습니다'));
  await act(async () => { tree.root.findAllByType('Switch').find(x => x.props.accessibilityLabel === '탈퇴 요청 안내 확인').props.onValueChange(true); });
  await act(async () => { button(tree, '탈퇴 요청 접수').props.onPress(); });
  await until(() => text(tree).includes('탈퇴 요청이 접수되었습니다'));
  assert.equal(button(tree, '탈퇴 요청 접수').props.disabled, true);
  assert.equal(requests.filter(([path]) => path === '/customer/deletion-request').length, 1);
  await act(async () => { button(tree, '로그아웃').props.onPress(); });
  await until(() => button(tree, '구매자 로그인') !== undefined);
  assert.equal(text(tree).includes('탈퇴 요청이 접수되었습니다'), false);
});

test('unavailable signup stays retryable and never displays accepted status', async t => {
  const { tree } = await ready(t, { '/auth/customer-signup/start': 503 });
  await until(() => button(tree, '로그인')?.props.disabled === false);
  await act(async () => { button(tree, '로그인').props.onPress(); });
  await act(async () => { button(tree, '가입하기').props.onPress(); });
  await act(async () => { tree.root.findAllByType('TextInput').find(x => x.props.accessibilityLabel === '요청 이메일').props.onChangeText('qa@example.invalid'); });
  await act(async () => { button(tree, '확인 링크 요청').props.onPress(); });
  await until(() => text(tree).includes('서버 기능을 사용할 수 없습니다'));
  assert.equal(text(tree).includes('요청을 접수했습니다'), false);
  assert.equal(button(tree, '확인 링크 요청').props.disabled, false);
});
test('existing deletion request is not reported as a new deletion; expired session clears the form', async t => {
  for (const code of [409, 401]) {
    const { tree } = await ready(t, { '/customer/deletion-request': code });
    await login(tree);
    await act(async () => { button(tree, '배송지·알림').props.onPress(); });
    await until(() => button(tree, '탈퇴 요청 접수')?.props.disabled === true);
    await act(async () => { tree.root.findAllByType('Switch').find(x => x.props.accessibilityLabel === '탈퇴 요청 안내 확인').props.onValueChange(true); });
    await act(async () => { button(tree, '탈퇴 요청 접수').props.onPress(); });
    if (code === 409) {
      await until(() => text(tree).includes('탈퇴 요청이 이미 접수되어 있습니다'));
      assert.equal(button(tree, '탈퇴 요청 접수').props.disabled, true);
    } else {
      await until(() => button(tree, '구매자 로그인') !== undefined);
      assert.equal(button(tree, '탈퇴 요청 접수'), undefined);
      assert.equal(text(tree).includes('탈퇴 요청이 접수되었습니다'), false);
    }
  }
});

test('paid shipment refund validates quantity, displays requested estimate and clears on session expiry', async t => {
  const order = { id: key, status: 'PAID', payableWon: 9000, shipments: [{ id: key, status: 'PAID',
    fulfillment: { status: 'READY' }, lines: [{ optionId: key, productName: '시험 고추', optionName: '1kg', quantity: 2 }] }] };
  const path = `/customer/checkout/orders/${key}/refund-cases`;
  const overrides = { '/customer/checkout/orders?status=PAID&limit=20': { items: [order], nextCursor: null },
    [`/customer/checkout/orders/${key}`]: order, [path]: [] };
  const { tree, requests, status } = await ready(t, {}, overrides);
  await login(tree); await act(async () => button(tree, '주문·배송').props.onPress());
  await until(() => button(tree, `${key} · 9,000원`)?.props.disabled === false);
  await act(async () => button(tree, `${key} · 9,000원`).props.onPress());
  await until(() => button(tree, `발송 ${key} 취소·환불 선택`)?.props.disabled === false);
  await act(async () => button(tree, `발송 ${key} 취소·환불 선택`).props.onPress());
  const field = label => tree.root.findAllByType('TextInput').find(x => x.props.accessibilityLabel === label);
  await act(async () => { field('1kg 취소 수량').props.onChangeText('3'); field('취소 상세 사유').props.onChangeText('가상 취소'); });
  assert.equal(button(tree, '취소·환불 요청 접수').props.disabled, true);
  await act(async () => field('1kg 취소 수량').props.onChangeText('1'));
  overrides[path] = { id: key, status: 'REQUESTED', shipmentOrderId: key, reason: '가상 취소',
    totalRefundWon: 3000, amountFinal: false, estimateAvailable: true, lines: [], history: [] };
  await act(async () => button(tree, '취소·환불 요청 접수').props.onPress());
  await until(() => text(tree).includes('요청 접수 · 환불 완료 아님'));
  assert.deepEqual(requests.find(([p, method]) => p === path && method === 'POST')[2], {
    shipmentOrderId: key, lines: [{ optionId: key, quantity: 1 }], reasonCode: 'customer_request', reason: '가상 취소' });
  overrides[path] = [{ ...overrides[path] }];
  await act(async () => button(tree, '환불 내역 새로고침').props.onPress());
  await until(() => text(tree).includes('예상 환불액 3,000원'));
  assert.equal(text(tree).includes('환불 완료 ·'), false);
  status[path] = 401;
  await act(async () => button(tree, '환불 내역 새로고침').props.onPress());
  await until(() => text(tree).includes('구매자 로그인'));
  assert.equal(text(tree).includes('가상 취소'), false);
});

test('already shipped order does not offer pre-shipment refund form', async t => {
  const order = { id: key, status: 'PAID', payableWon: 9000, shipments: [{ id: key, status: 'PAID',
    fulfillment: { status: 'SHIPPED' }, lines: [{ optionId: key, productName: '고추', optionName: '1kg', quantity: 2 }] }] };
  const { tree } = await ready(t, {}, { '/customer/checkout/orders?status=PAID&limit=20': { items: [order], nextCursor: null },
    [`/customer/checkout/orders/${key}`]: order });
  await login(tree); await act(async () => button(tree, '주문·배송').props.onPress());
  await until(() => button(tree, `${key} · 9,000원`)?.props.disabled === false);
  await act(async () => button(tree, `${key} · 9,000원`).props.onPress());
  await until(() => text(tree).includes('출고 SHIPPED'));
  assert.equal(button(tree, `발송 ${key} 취소·환불 선택`), undefined);
  assert.ok(text(tree).includes('출고 후에는 클레임 경로'));
});

test('shipped line confirms receipt, saves pending review and submits owned claim with history pagination', async t => {
  const order = { id: key, status: 'PAID', payableWon: 9000, shipments: [{ id: key, status: 'PAID',
    fulfillment: { status: 'SHIPPED' }, lines: [{ optionId: key, productName: '고추', optionName: '1kg', quantity: 2 }] }] };
  const confirmationPath = `/customer/support/confirmations/${key}/${key}`;
  const claimPath = `/customer/support/claims/${key}`;
  const overrides = { '/customer/checkout/orders?status=PAID&limit=20': { items: [order], nextCursor: null },
    [`/customer/checkout/orders/${key}`]: order,
    '/customer/support/confirmations': { id: key },
    [confirmationPath]: { id: key, reviewId: null, reviewStatus: null },
    '/customer/support/reviews': { id: key, status: 'PENDING' },
    [`/customer/support/reviews/${key}`]: { id: key, body: '가상 후기', rating: 4, status: 'PENDING', images: [], events: [] },
    '/customer/support/claims': { id: key, status: 'REQUESTED' },
    [claimPath]: { id: key, status: 'SELLER_REPLIED', kind: 'RETURN', reason: '가상 파손', quantity: 1,
      messages: [{ id: 'bf66b7c1-b0f6-4346-8333-d42ee1c8e299', authorRole: 'customer', body: '가상 파손' },
        { id: key, authorRole: 'seller', body: '가상 처리 안내' }], evidence: [], events: [] },
    '/customer/support/claims?cursor=older': { items: [], nextCursor: null },
  };
  const { tree, requests, status } = await ready(t, { [confirmationPath]: 404 }, overrides);
  await login(tree); await act(async () => button(tree, '주문·배송').props.onPress());
  await until(() => button(tree, `${key} · 9,000원`)?.props.disabled === false);
  await act(async () => button(tree, `${key} · 9,000원`).props.onPress());
  await until(() => button(tree, '1kg 구매확정·리뷰·클레임')?.props.disabled === false);
  await act(async () => button(tree, '1kg 구매확정·리뷰·클레임').props.onPress());
  await until(() => button(tree, '구매확정') !== undefined);
  assert.equal(button(tree, '구매확정').props.disabled, true);
  await act(async () => tree.root.findAllByType('Switch').find(x => x.props.accessibilityLabel === '상품 수령 확인').props.onValueChange(true));
  status[confirmationPath] = 200;
  await act(async () => button(tree, '구매확정').props.onPress());
  await until(() => text(tree).includes('구매확정 완료'));
  const field = label => tree.root.findAllByType('TextInput').find(x => x.props.accessibilityLabel === label);
  await act(async () => { field('리뷰 별점').props.onChangeText('6'); field('리뷰 내용').props.onChangeText('가상 후기'); });
  assert.equal(button(tree, '리뷰 저장').props.disabled, true);
  await act(async () => field('리뷰 별점').props.onChangeText('4'));
  await act(async () => button(tree, '리뷰 저장').props.onPress());
  await until(() => text(tree).includes('리뷰 상태 PENDING · 공개 완료 아님'));
  await act(async () => { button(tree, '반품 요청').props.onPress(); button(tree, '파손 사유').props.onPress(); });
  await act(async () => { field('클레임 수량').props.onChangeText('1'); field('클레임 상세 사유').props.onChangeText('가상 파손'); });
  await act(async () => button(tree, '클레임 접수').props.onPress());
  await until(() => text(tree).includes('가상 처리 안내'));
  assert.ok(requests.some(([path, method, body]) => path === '/customer/support/claims' && method === 'POST' &&
    body.kind === 'RETURN' && body.reasonCode === 'damaged' && body.quantity === 1));
  overrides['/customer/support/claims'] = { items: [{ id: key, kind: 'RETURN', status: 'SELLER_REPLIED' }], nextCursor: 'older' };
  await act(async () => button(tree, '내 클레임 조회').props.onPress());
  await until(() => button(tree, '클레임 더 보기')?.props.disabled === false);
  await act(async () => button(tree, '클레임 더 보기').props.onPress());
  await until(() => requests.some(([path]) => path === '/customer/support/claims?cursor=older'));
  status['/customer/support/claims'] = 401;
  await act(async () => button(tree, '내 클레임 조회').props.onPress());
  await until(() => text(tree).includes('구매자 로그인'));
  assert.equal(text(tree).includes('가상 후기'), false); assert.equal(text(tree).includes('가상 처리 안내'), false);
});

test('confirmed claim creation followed by lost detail does not lock a cleared form as uncertain submission', async t => {
  const order = { id: key, status: 'PAID', payableWon: 9000, shipments: [{ id: key, status: 'PAID',
    fulfillment: { status: 'SHIPPED' }, lines: [{ optionId: key, productName: '고추', optionName: '1kg', quantity: 2 }] }] };
  const { tree, requests } = await ready(t, { [`/customer/support/confirmations/${key}/${key}`]: 404,
    [`/customer/support/claims/${key}`]: 'disconnect' }, {
    '/customer/checkout/orders?status=PAID&limit=20': { items: [order], nextCursor: null },
    [`/customer/checkout/orders/${key}`]: order, '/customer/support/claims': { id: key, status: 'REQUESTED' } });
  await login(tree); await act(async () => button(tree, '주문·배송').props.onPress());
  await until(() => button(tree, `${key} · 9,000원`)?.props.disabled === false);
  await act(async () => button(tree, `${key} · 9,000원`).props.onPress());
  await until(() => button(tree, '1kg 구매확정·리뷰·클레임')?.props.disabled === false);
  await act(async () => button(tree, '1kg 구매확정·리뷰·클레임').props.onPress());
  await until(() => button(tree, '클레임 접수') !== undefined);
  const reason = () => tree.root.findAllByType('TextInput').find(x => x.props.accessibilityLabel === '클레임 상세 사유');
  await act(async () => reason().props.onChangeText('가상 접수'));
  await act(async () => button(tree, '클레임 접수').props.onPress());
  await until(() => text(tree).includes('연결하지 못했습니다.') && button(tree, '내 클레임 조회')?.props.disabled === false);
  assert.equal(requests.filter(([path, method]) => path === '/customer/support/claims' && method === 'POST').length, 1);
  assert.ok(text(tree).includes('클레임 접수 · 처리 완료 아님'));
  assert.equal(text(tree).includes('결과가 불명확하여 같은 입력'), false);
  assert.equal(reason().props.value, ''); assert.equal(reason().props.editable, true);
});

test('review attachment selection cancellation writes nothing; confirmed upload displays owned server image', async t => {
  const order = { id: key, status: 'PAID', payableWon: 9000, shipments: [{ id: key, status: 'PAID', fulfillment: { status: 'SHIPPED' },
    lines: [{ optionId: key, productName: '고추', optionName: '1kg', quantity: 2 }] }] };
  const reviewPath = `/customer/support/reviews/${key}`; const uploadPath = `${reviewPath}/images`;
  let chosen;
  const overrides = { '/customer/checkout/orders?status=PAID&limit=20': { items: [order], nextCursor: null },
    [`/customer/checkout/orders/${key}`]: order,
    [`/customer/support/confirmations/${key}/${key}`]: { id: key, reviewId: key, reviewStatus: 'PENDING' },
    [reviewPath]: { id: key, body: '후기', rating: 4, status: 'PENDING', images: [], events: [] },
    [uploadPath]: { id: key } };
  const { tree, requests } = await ready(t, {}, overrides, { pickAttachment: async () => chosen });
  await login(tree); await act(async () => button(tree, '주문·배송').props.onPress());
  await until(() => button(tree, `${key} · 9,000원`)?.props.disabled === false);
  await act(async () => button(tree, `${key} · 9,000원`).props.onPress());
  await until(() => button(tree, '1kg 구매확정·리뷰·클레임')?.props.disabled === false);
  await act(async () => button(tree, '1kg 구매확정·리뷰·클레임').props.onPress());
  await until(() => button(tree, '리뷰 사진 선택')?.props.disabled === false);
  await act(async () => button(tree, '리뷰 사진 선택').props.onPress());
  await until(() => text(tree).includes('파일 선택을 취소했습니다.'));
  assert.equal(requests.filter(([p, m]) => p === uploadPath && m === 'POST').length, 0);
  chosen = { name: '시험.png', mimeType: 'image/png', bytes: new Uint8Array([137, 80, 78, 71]).buffer };
  await act(async () => button(tree, '리뷰 사진 선택').props.onPress());
  await until(() => button(tree, '리뷰 사진 업로드')?.props.disabled === false);
  overrides[reviewPath] = { ...overrides[reviewPath], images: [{ id: key, scanStatus: 'PENDING' }] };
  await act(async () => button(tree, '리뷰 사진 업로드').props.onPress());
  await until(() => text(tree).includes('서버 첨부 1건'));
  assert.ok(text(tree).includes('검사·공개·심사 완료 아님'));
  assert.deepEqual(requests.find(([p, m]) => p === uploadPath && m === 'POST')[2], [137, 80, 78, 71]);
  assert.ok(tree.root.findAllByType('Image').some(x => x.props.source.uri.endsWith(`/images/${key}/preview`)));
});

test('held goods and shipment coupons remain identical across preview and order; returning cart invalidates preview', async t => {
  const shippingGrant = 'bf66b7c1-b0f6-4346-8333-d42ee1c8e299';
  const held = { id: key, status: 'ACTIVE', expiresAt: '2099-01-01T00:00:00Z', quote: {
    totalWon: 9000, goodsWon: 6000, shippingWon: 3000,
    shipments: [{ key: 'seller:qa', shippingMode: 'seller_direct', goodsWon: 6000, shippingWon: 3000, totalWon: 9000 }] } };
  const selections = { goodsCoupon: { grantId: key }, shippingCoupons: [{ shipmentKey: 'seller:qa', grantId: shippingGrant }] };
  const { tree, requests } = await ready(t, { '/customer/checkout/reservations/active': 200 }, {
    '/customer/checkout/reservations/active': held,
    '/customer/promotions/coupons': [
      { grantId: key, title: '상품 할인', rule: { kind: 'goods_discount' } },
      { grantId: shippingGrant, title: '배송 지원', rule: { kind: 'shipping_support' } }],
    [`/customer/checkout/reservations/${key}/promotions/quote`]: { ...held.quote, payableTotalWon: 4500,
      discountWon: 1500, supportWon: 3000, shipments: [{ ...held.quote.shipments[0], discountWon: 1500, supportWon: 3000, payableTotalWon: 4500 }] },
    '/customer/checkout/orders': { id: key, status: 'PENDING_PAYMENT', payableWon: 4500, shipments: [] },
  });
  await login(tree); await act(async () => button(tree, '장바구니').props.onPress());
  await until(() => button(tree, '상품 쿠폰 상품 할인')?.props.disabled === false);
  await act(async () => button(tree, '상품 쿠폰 상품 할인').props.onPress());
  await act(async () => button(tree, '배송 seller:qa 쿠폰 배송 지원').props.onPress());
  assert.equal(button(tree, '주문 생성').props.disabled, true);
  await act(async () => button(tree, '혜택 재견적').props.onPress());
  await until(() => button(tree, '주문 생성')?.props.disabled === false);
  assert.ok(text(tree).includes('4,500원'));
  await act(async () => button(tree, '배송지·알림').props.onPress());
  await until(() => button(tree, '장바구니')?.props.disabled === false);
  await act(async () => button(tree, '장바구니').props.onPress());
  await until(() => button(tree, '혜택 재견적')?.props.disabled === false);
  assert.equal(button(tree, '주문 생성').props.disabled, true, 'base quote must not revalidate selected benefits');
  await act(async () => button(tree, '혜택 재견적').props.onPress());
  await until(() => button(tree, '주문 생성')?.props.disabled === false);
  await act(async () => button(tree, '주문 생성').props.onPress());
  await until(() => requests.some(([path, method]) => path === '/customer/checkout/orders' && method === 'POST'));
  assert.deepEqual(requests.find(([path]) => path.endsWith('/promotions/quote'))[2], selections);
  const input = requests.find(([path, method]) => path === '/customer/checkout/orders' && method === 'POST')[2];
  assert.deepEqual(input.selections, selections); assert.equal(input.expectedPayableWon, 4500);
});

test('coupon change and failed preview cannot reuse an earlier payable amount', async t => {
  const path = `/customer/checkout/reservations/${key}/promotions/quote`;
  const { tree, status } = await ready(t, { '/customer/checkout/reservations/active': 200 }, {
    '/customer/checkout/reservations/active': { id: key, status: 'ACTIVE', expiresAt: '2099-01-01T00:00:00Z',
      quote: { totalWon: 9000, goodsWon: 6000, shippingWon: 3000, shipments: [] } },
    [path]: { totalWon: 9000, payableTotalWon: 8000, discountWon: 1000, supportWon: 0, shipments: [] },
  });
  await login(tree); await act(async () => button(tree, '장바구니').props.onPress());
  await until(() => button(tree, '혜택 재견적')?.props.disabled === false);
  const input = () => tree.root.findAllByType('TextInput').find(x => x.props.accessibilityLabel === '상품 할인 쿠폰 코드');
  await act(async () => input().props.onChangeText('VALID'));
  await act(async () => button(tree, '혜택 재견적').props.onPress());
  await until(() => button(tree, '주문 생성')?.props.disabled === false);
  status[path] = 409;
  await act(async () => button(tree, '혜택 재견적').props.onPress());
  await until(() => text(tree).includes('다시 조회해 주세요.'));
  assert.equal(button(tree, '주문 생성').props.disabled, true);
  assert.equal(text(tree).includes('서버 확인 결제금액 8,000원'), false);
  await act(async () => input().props.onChangeText('CHANGED'));
  assert.equal(button(tree, '주문 생성').props.disabled, true);
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
