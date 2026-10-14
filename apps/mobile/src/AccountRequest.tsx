import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { CustomerApi } from './customer-api';

export default function AccountRequest({ api, kind, busy, run, back }: {
  api: CustomerApi; kind: 'signup' | 'reset'; busy: boolean;
  run: (task: () => Promise<void>) => Promise<void>; back: () => void;
}) {
  const [email, setEmail] = useState(''); const [accepted, setAccepted] = useState(false);
  const valid = /^[^@\s,<>]+@[^@\s,<>]+\.[^@\s,<>]+$/.test(email.trim());
  function button(label: string, disabled: boolean, action: () => void) {
    return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}
      disabled={disabled} onPress={action} style={{ padding: 12, backgroundColor: '#5b481f', marginVertical: 4, opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ color: '#fff' }}>{label}</Text></Pressable>;
  }
  return <View><Text>{kind === 'signup' ? '구매자 가입하기' : '비밀번호 찾기'}</Text>
    <Text>{kind === 'signup' ? '이메일 본인 확인 후 구매자 계정을 생성합니다. 관리자 공개 가입은 없습니다.' : '확인된 이메일의 본인 확인 링크로 비밀번호를 재설정합니다.'}</Text>
    <Text>요청 이메일</Text><TextInput accessibilityLabel="요청 이메일" value={email} editable={!busy}
      onChangeText={value => { setEmail(value); setAccepted(false); }} autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
      style={{ padding: 10, borderWidth: 1, borderColor: '#716850', marginVertical: 4 }} />
    {button('확인 링크 요청', busy || !valid || accepted, () => void run(async () => {
      await api.startAccountRequest(kind, email); setAccepted(true);
    }))}
    {accepted ? <Text>요청을 접수했습니다. 해당 이메일이 처리 대상이면 확인 링크가 전달됩니다. 가입·비밀번호 변경 완료가 아닙니다.</Text> : null}
    <Text>본인 확인·설정 완료는 받은 링크의 기존 웹 확인 화면에서 진행합니다. 실제 메일 수신·HTTPS 링크 시험은 인수테스트에 보류되어 있습니다.</Text>
    {button('로그인으로 돌아가기', busy, back)}
  </View>;
}
