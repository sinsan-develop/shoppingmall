import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDeviceNotifications } from '../src/device-notifications-core.ts';

function nativePort(permission = { granted: false, status: 'undetermined', canAskAgain: true }) {
  const calls = [];
  let current = permission, channel = null;
  return { calls, setPermission: value => { current = value; }, setChannel: value => { channel = value; },
    port: {
      AndroidImportance: { NONE: 2, DEFAULT: 5 },
      getPermissionsAsync: async () => current,
      requestPermissionsAsync: async () => { calls.push('request'); current = { granted: true, status: 'granted', canAskAgain: true }; return current; },
      getNotificationChannelAsync: async () => channel,
      setNotificationChannelAsync: async (id, value) => { calls.push(['channel', id, value]); channel = value; },
      scheduleNotificationAsync: async value => { calls.push(['schedule', value]); return value.identifier; },
      dismissNotificationAsync: async id => { calls.push(['dismiss', id]); },
      cancelScheduledNotificationAsync: async id => { calls.push(['cancel', id]); },
    } };
}

test('상태 조회는 권한을 요청하지 않고 명시 요청에서 채널을 먼저 준비한다', async () => {
  const native = nativePort(); const client = createDeviceNotifications(native.port, 'android', true);
  assert.equal(await client.readPermission(), 'undetermined');
  assert.deepEqual(native.calls, []);
  assert.equal(await client.requestPermission(), 'granted');
  assert.equal(native.calls[0][0], 'channel'); assert.equal(native.calls[1], 'request');
});

test('재요청 불가 또는 비Android는 OS 프롬프트를 반복하지 않는다', async () => {
  const native = nativePort({ granted: false, status: 'denied', canAskAgain: false });
  assert.equal(await createDeviceNotifications(native.port, 'android', true).requestPermission(), 'blocked');
  assert.equal(native.calls.includes('request'), false);
  const before = native.calls.length;
  assert.equal(await createDeviceNotifications(native.port, 'ios', true).requestPermission(), 'unsupported');
  assert.equal(native.calls.length, before);
});

test('모의 알림은 개발 모드·현재 권한·채널 허용을 모두 확인하고 개인정보 없는 고정 내용을 전달한다', async () => {
  const native = nativePort({ granted: true, status: 'granted', canAskAgain: true });
  await assert.rejects(createDeviceNotifications(native.port, 'android', false).sendMock(), /development_only/);
  assert.deepEqual(native.calls, []);
  const client = createDeviceNotifications(native.port, 'android', true);
  await client.requestPermission(); await client.sendMock();
  const scheduled = native.calls.find(x => x[0] === 'schedule')[1];
  assert.deepEqual(scheduled, { identifier: 'owoolmall-development-mock',
    content: { title: '어울몰 개발용 모의 알림', body: '기기 표시 시험입니다. 실제 주문·배송 알림이 아닙니다.',
      data: { kind: 'development-mock' }, sound: false }, trigger: { channelId: 'owoolmall-development' } });
  native.setPermission({ granted: false, status: 'denied', canAskAgain: true });
  await assert.rejects(client.sendMock(), /permission_required/);
  native.setPermission({ granted: true, status: 'granted', canAskAgain: true });
  native.setChannel({ importance: 2 }); await assert.rejects(client.sendMock(), /permission_required/);
  assert.equal(native.calls.filter(x => x[0] === 'schedule').length, 1);
});

test('정리는 우리 모의 알림만 대상으로 하며 다른 알림 전체를 삭제하지 않는다', async () => {
  const native = nativePort(); await createDeviceNotifications(native.port, 'android', true).clearMock();
  assert.deepEqual(native.calls, [['cancel', 'owoolmall-development-mock'], ['dismiss', 'owoolmall-development-mock']]);
});
