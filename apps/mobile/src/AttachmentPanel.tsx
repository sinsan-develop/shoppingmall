import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { CustomerApi, CustomerApiError, type Attachment, type PickAttachment } from './customer-api';

export default function AttachmentPanel({ api, kind, targetId, items, pickAttachment, busy, run, reload }: {
  api: CustomerApi; kind: 'review' | 'claim'; targetId: string; items: { id: string; scanStatus?: string }[];
  pickAttachment?: PickAttachment; busy: boolean; run: (task: () => Promise<void>) => Promise<void>; reload: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<Attachment>();
  const [uncertain, setUncertain] = useState(false); const [notice, setNotice] = useState('');
  const label = kind === 'review' ? '리뷰 사진' : '클레임 증빙';
  function button(title: string, disabled: boolean, action: () => void) {
    return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled}
      onPress={action} style={{ padding: 12, backgroundColor: '#5b481f', marginVertical: 4, opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ color: '#fff' }}>{title}</Text></Pressable>;
  }
  return <View><Text>{label} · PNG/JPEG/WebP · 파일당 5MiB 이하 · 최대 5건</Text>
    {button(`${label} 선택`, busy || uncertain || !pickAttachment || items.length >= 5, () => void run(async () => {
      setSelected(undefined); setNotice(''); const file = await pickAttachment!();
      if (!file) { setNotice('파일 선택을 취소했습니다.'); return; }
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.mimeType) || file.bytes.byteLength < 1 ||
          file.bytes.byteLength > 5 * 1024 * 1024) throw new CustomerApiError('invalid');
      setSelected(file);
    }))}
    {selected ? <Text>선택한 파일 {selected.name} · {selected.bytes.byteLength}bytes</Text> : null}
    {uncertain ? <Text>업로드 결과가 불명확하여 같은 파일·요청 키로 재시도합니다.</Text> : null}
    {button(`${label} 업로드`, busy || !selected, () => void run(async () => {
      try { await api.uploadAttachment(kind, targetId, selected!); }
      catch (error) { if (error instanceof CustomerApiError && error.code === 'offline') setUncertain(true); throw error; }
      setSelected(undefined); setUncertain(false); setNotice('서버 첨부 접수 · 검사·공개·심사 완료 아님');
      await reload();
    }))}
    {button(`${label} 첨부 새로고침`, busy, () => void run(reload))}
    {notice ? <Text>{notice}</Text> : null}
    <Text>서버 첨부 {items.length}건</Text>
    {items.map(item => <View key={item.id}>
      <Text>첨부 {item.id}{item.scanStatus ? ` · 검사 ${item.scanStatus}` : ''}</Text>
      <Image accessibilityLabel={`${label} ${item.id}`} source={{ uri: api.attachmentUrl(kind, targetId, item.id), cache: 'reload' }}
        style={{ width: '100%', height: 180, resizeMode: 'contain' }} />
    </View>)}
  </View>;
}
