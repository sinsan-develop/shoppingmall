import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

async function load(development, flag) {
  let handler;
  const result = await build({ entryPoints: [fileURLToPath(new URL('../src/device-notifications.ts', import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react-native', 'expo-notifications'],
    define: { __DEV__: String(development), 'process.env.EXPO_PUBLIC_ENABLE_MOCK_NOTIFICATIONS': JSON.stringify(flag) } });
  const mod = { exports: {} };
  const native = { setNotificationHandler: value => { handler = value; } };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(name => {
    if (name === 'react-native') return { Platform: { OS: 'android' } };
    if (name === 'expo-notifications') return native;
    throw Error(`unexpected dependency ${name}`);
  }, mod, mod.exports);
  return { ...mod.exports, handler };
}

test('native 진입부는 개발 빌드와 명시 옵션이 함께 있을 때만 모의 알림을 허용한다', async () => {
  for (const [development, flag] of [[false, '1'], [true, '0']]) {
    const { deviceNotifications, enableMockNotifications, handler } = await load(development, flag);
    assert.equal(enableMockNotifications, false);
    await assert.rejects(deviceNotifications.sendMock(), /development_only/);
    assert.equal((await handler.handleNotification({ request: { identifier: 'owoolmall-development-mock',
      content: { data: { kind: 'development-mock' } } } })).shouldShowList, false);
  }
  const { enableMockNotifications, handler } = await load(true, '1');
  assert.equal(enableMockNotifications, true);
  assert.deepEqual(await handler.handleNotification({ request: { identifier: 'owoolmall-development-mock',
    content: { data: { kind: 'development-mock' } } } }),
  { shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true });
  assert.equal((await handler.handleNotification({ request: { identifier: 'foreign', content: {} } })).shouldShowList, false);
});
