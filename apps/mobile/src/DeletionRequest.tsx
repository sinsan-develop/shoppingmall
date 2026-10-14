import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { CustomerApi, CustomerApiError } from './customer-api';

export default function DeletionRequest({ api, busy, run }: {
  api: CustomerApi; busy: boolean; run: (task: () => Promise<void>) => Promise<void>;
}) {
  const [confirmed, setConfirmed] = useState(false); const [notice, setNotice] = useState('');
  const disabled = busy || !confirmed || Boolean(notice);
  return <View><Text>탈퇴 안내</Text><Text>탈퇴 요청은 운영 검토 후 처리하며 계정은 즉시 삭제되지 않습니다. 기존 주문·환불 처리는 요청 접수만으로 변경되지 않습니다.</Text>
    <Text>위 안내를 확인하고 탈퇴 요청을 접수합니다.</Text>
    <Switch accessibilityLabel="탈퇴 요청 안내 확인" value={confirmed} disabled={busy || Boolean(notice)} onValueChange={setConfirmed} />
    <Pressable accessibilityRole="button" accessibilityLabel="탈퇴 요청 접수" accessibilityState={{ disabled }} disabled={disabled}
      style={{ padding: 12, backgroundColor: '#5b481f', marginVertical: 4, opacity: disabled ? 0.5 : 1 }}
      onPress={() => void run(async () => {
        try { await api.requestDeletion(); }
        catch (error) {
          if (error instanceof CustomerApiError && error.code === 'conflict') {
            setNotice('탈퇴 요청이 이미 접수되어 있습니다. 계정은 아직 삭제되지 않았습니다.'); setConfirmed(false); return;
          }
          throw error;
        }
        setNotice('탈퇴 요청이 접수되었습니다. 계정은 아직 삭제되지 않았습니다.'); setConfirmed(false);
      })}><Text style={{ color: '#fff' }}>탈퇴 요청 접수</Text></Pressable>
    {notice ? <Text>{notice}</Text> : null}
  </View>;
}
