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
async function ready(t, status = {}) {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push([req.url, req.method, body ? JSON.parse(body) : undefined]);
    const value = req.url.startsWith('/catalog/products?') ? [{ productId: key, title: '시험 고추', sellerName: '시험 농가', originLabel: '국내', minPriceWon: 3000 }] :
      req.url === '/auth/me' ? { role: 'customer' } : req.url === '/customer/cart/quote' ? { totalWon: 9000, goodsWon: 6000, shippingWon: 3000, shipments: [] } :
      req.url === '/customer/cart' ? [{ optionId: key, productId: key, title: '시험 고추', optionName: '1kg', quantity: 2, unitPriceWon: 3000, availability: 'available' }] :
      req.url === '/customer/addresses' ? [{ id: key, label: '집', line1: '가상 주소', recipientName: 'QA' }] :
      req.url === '/customer/preferences' ? { marketingEmail: false, marketingSms: false, push: false } : { status: 'ok' };
    res.writeHead(status[req.url] ?? 200, { 'content-type': 'application/json' }); res.end(JSON.stringify(value));
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
const text = tree => JSON.stringify(tree.toJSON());
function button(tree, label) { return tree.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel === label); }
test('mobile search renders fetched products rather than construction notice', async t => {
  const { tree } = await ready(t);
  await until(() => text(tree).includes('시험 고추'));
  assert.ok(button(tree, '시험 고추 상세'));
  assert.equal(text(tree).includes('앱 서비스 구축 중'), false);
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
