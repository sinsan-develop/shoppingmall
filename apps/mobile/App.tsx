import { useMemo } from 'react';
import { SafeAreaView, Text } from 'react-native';
import { randomUUID } from 'expo-crypto';
import CustomerApp from './src/CustomerApp';
import { CustomerApi } from './src/customer-api';

export default function App() {
  const apiOrigin = process.env.EXPO_PUBLIC_API_ORIGIN;
  const webOrigin = process.env.EXPO_PUBLIC_WEB_ORIGIN;
  const api = useMemo(() => {
    if (!apiOrigin || !webOrigin) return undefined;
    try { return new CustomerApi({ apiOrigin, webOrigin, createKey: randomUUID }); }
    catch { return undefined; }
  }, [apiOrigin, webOrigin]);
  if (!api) return <SafeAreaView><Text>API·허용 웹 Origin 설정을 확인해 주세요. 비밀값은 앱 공개 설정에 넣지 않습니다.</Text></SafeAreaView>;
  return <CustomerApp api={api} imageOrigin={apiOrigin}
    enableMockPayment={process.env.EXPO_PUBLIC_ENABLE_MOCK_PAYMENT === '1'} />;
}
