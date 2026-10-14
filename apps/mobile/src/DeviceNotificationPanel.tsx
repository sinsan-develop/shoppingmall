import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { DeviceNotifications, DevicePermission } from './device-notifications-core';

export default function DeviceNotificationPanel({ notifications, enableMock = false }: {
  notifications: DeviceNotifications; enableMock?: boolean;
}) {
  const [permission, setPermission] = useState<DevicePermission>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const active = useRef(false);
  const lock = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    let current = true; active.current = true;
    const initial = generation.current;
    void notifications.readPermission().then(value => { if (current && initial === generation.current) setPermission(value); })
      .catch(() => { if (current && initial === generation.current) setMessage('기기 알림 상태를 확인하지 못했습니다. 주문·내 문의에서 직접 확인하세요.'); });
    return () => { current = false; active.current = false; };
  }, [notifications]);
  const run = async (action: 'permission' | 'read' | 'send' | 'clear') => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    generation.current += 1;
    try {
      if (action === 'permission' || action === 'read') {
        const value = action === 'permission' ? await notifications.requestPermission() : await notifications.readPermission();
        if (active.current) setPermission(value);
      } else if (action === 'send') {
        // OS 설정에서 권한을 취소한 경우에도 이전 화면 상태를 믿고 발송하지 않는다.
        const value = await notifications.readPermission();
        if (!active.current) return;
        setPermission(value);
        if (value !== 'granted') { setMessage('기기 알림이 허용되지 않았습니다. 주문·내 문의에서 직접 확인하세요.'); return; }
        await notifications.sendMock();
        if (active.current) setMessage('개발용 모의 알림 표시를 요청했습니다. 알림창에서 확인하세요. 실제 푸시 수신 시험은 아닙니다.');
      } else {
        await notifications.clearMock();
        if (active.current) setMessage('개발용 모의 알림만 지웠습니다.');
      }
    } catch {
      if (active.current) setMessage('기기 알림 처리를 완료하지 못했습니다. 주문·내 문의에서 직접 확인하세요.');
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  };
  const button = (label: string, action: 'permission' | 'read' | 'send' | 'clear', disabled = false) =>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: busy || disabled }}
      disabled={busy || disabled} onPress={() => void run(action)} style={{ padding: 12, opacity: busy || disabled ? 0.5 : 1 }}>
      <Text>{label}</Text>
    </Pressable>;
  return <View>
    <Text>기기 알림 권한 · {permission === undefined ? '확인 중/미확인' : {
      undetermined: '아직 요청하지 않음', granted: '허용됨', denied: '거부됨', blocked: '거부됨 · Android 설정에서 변경 필요',
      unsupported: 'Android 전용 기능',
    }[permission]}</Text>
    <Text>OS 권한은 서버 수신 동의와 별개입니다. 실제 푸시 연결은 미구현이며 주문·내 문의에서 결과를 직접 확인하세요.</Text>
    {button('Android 알림 권한 요청', 'permission', permission === 'unsupported' || permission === 'blocked' || permission === 'granted')}
    {button('기기 알림 상태 다시 확인', 'read')}
    {enableMock ? <>
      {button('개발용 모의 알림 보내기', 'send', permission !== 'granted')}
      {button('개발용 모의 알림 지우기', 'clear')}
    </> : null}
    {message ? <Text accessibilityRole="alert">{message}</Text> : null}
  </View>;
}
