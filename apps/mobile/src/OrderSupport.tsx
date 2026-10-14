import { useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import { CustomerApi, CustomerApiError, type Order, type Confirmation, type Review,
  type ClaimInput, type ClaimSummary, type Claim, type PickAttachment } from './customer-api';
import AttachmentPanel from './AttachmentPanel';

function Action({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress} style={{ padding: 12, marginVertical: 4, backgroundColor: '#5b481f', opacity: disabled ? 0.5 : 1 }}>
    <Text style={{ color: '#fff' }}>{label}</Text></Pressable>;
}
function Input({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  return <View><Text>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange}
    editable={!disabled} style={{ padding: 10, borderWidth: 1, borderColor: '#716850', marginVertical: 4 }} /></View>;
}

export default function OrderSupport({ api, order, busy, run, pickAttachment }: {
  api: CustomerApi; order: Order; busy: boolean; run: (task: () => Promise<void>) => Promise<void>; pickAttachment?: PickAttachment;
}) {
  const [subject, setSubject] = useState<{ shipmentId: string; optionId: string; quantity: number; name: string }>();
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const [received, setReceived] = useState(false);
  const [review, setReview] = useState<Review>();
  const [rating, setRating] = useState('5'); const [reviewText, setReviewText] = useState('');
  const [kind, setKind] = useState<ClaimInput['kind']>('CLAIM');
  const [reasonCode, setReasonCode] = useState<ClaimInput['reasonCode']>('quality_issue');
  const [quantity, setQuantity] = useState('1'); const [reason, setReason] = useState('');
  const [claimRetry, setClaimRetry] = useState<ClaimInput>();
  const [claim, setClaim] = useState<Claim>(); const [claims, setClaims] = useState<ClaimSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null); const [notice, setNotice] = useState('');
  async function choose(shipment: Order['shipments'][number], line: Order['shipments'][number]['lines'][number]) {
    setSubject(undefined); setConfirmation(undefined); setReview(undefined); setClaim(undefined); setNotice('');
    setReceived(false); setRating('5'); setReviewText(''); setKind('CLAIM'); setReasonCode('quality_issue');
    setQuantity('1'); setReason(''); setClaimRetry(undefined);
    const found = await api.confirmation(shipment.id, line.optionId);
    const savedReview = found?.reviewId ? await api.review(found.reviewId) : undefined;
    setConfirmation(found); setReview(savedReview);
    if (savedReview) { setRating(String(savedReview.rating)); setReviewText(savedReview.body); }
    setSubject({ shipmentId: shipment.id, optionId: line.optionId, quantity: line.quantity, name: line.optionName });
  }
  async function openClaim(id: string) { setClaim(undefined); setClaim(await api.claim(id)); }
  return <View>
    <Text>구매확정·리뷰·출고 후 클레임</Text>
    {order.shipments.filter(item => item.status === 'PAID' && item.fulfillment?.status === 'SHIPPED').flatMap(shipment =>
      shipment.lines.map(line => <Action key={`${shipment.id}:${line.optionId}`} label={`${line.optionName} 구매확정·리뷰·클레임`}
        disabled={busy || Boolean(claimRetry)} onPress={() => void run(() => choose(shipment, line))} />))}
    {notice ? <Text>{notice}</Text> : null}
    {subject ? <View>
      <Text>{subject.name} · 결제 수량 {subject.quantity}개</Text>
      {confirmation ? <Text>구매확정 완료 · {confirmation.id}</Text> : <>
        <Text>실제 상품 수령을 확인한 후 구매확정하세요.</Text>
        <Switch accessibilityLabel="상품 수령 확인" value={received} disabled={busy} onValueChange={setReceived} />
        <Action label="구매확정" disabled={busy || !received} onPress={() => void run(async () => {
          const created = await api.confirmPurchase(order.id, subject.shipmentId, subject.optionId);
          setConfirmation({ id: created.id, reviewId: null, reviewStatus: null });
        })} />
      </>}
      {confirmation ? <View>
        <Input label="리뷰 별점" value={rating} onChange={setRating} disabled={busy} />
        <Input label="리뷰 내용" value={reviewText} onChange={setReviewText} disabled={busy} />
        <Action label="리뷰 저장" disabled={busy || !Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5 ||
          !reviewText.trim() || reviewText.trim().length > 2000 || review?.status === 'HIDDEN'} onPress={() => void run(async () => {
          const saved = review ? await api.editReview(review.id, Number(rating), reviewText.trim()) :
            await api.createReview(confirmation.id, Number(rating), reviewText.trim());
          setNotice(`리뷰 상태 ${saved.status} · 공개 완료 아님`);
          const found = await api.review(saved.id); setReview(found); setRating(String(found.rating)); setReviewText(found.body);
        })} />
        {review ? <Text>내 리뷰 {review.status} · {review.body}</Text> : null}
        {review ? <AttachmentPanel key={review.id} api={api} kind="review" targetId={review.id} items={review.images}
          pickAttachment={pickAttachment} busy={busy} run={run} reload={async () => setReview(await api.review(review.id))} /> :
          <Text>리뷰를 먼저 저장한 뒤 사진을 첨부합니다.</Text>}
      </View> : null}
      <Text>클레임 접수는 승인·교환·환불 완료가 아닙니다.</Text>
      {(['CLAIM', 'RETURN', 'EXCHANGE'] as const).map((value, i) => <Action key={value} label={['일반 클레임', '반품 요청', '교환 요청'][i]}
        disabled={busy || Boolean(claimRetry)} onPress={() => setKind(value)} />)}
      <Text>선택 유형 {kind}</Text>
      {(['quality_issue', 'damaged', 'wrong_delivery', 'change_of_mind', 'other'] as const).map((value, i) => <Action key={value}
        label={['품질 문제 사유', '파손 사유', '오배송 사유', '단순 변심 사유', '기타 클레임 사유'][i]}
        disabled={busy || Boolean(claimRetry)} onPress={() => setReasonCode(value)} />)}
      <Text>선택 사유 {reasonCode}</Text>
      <Input label="클레임 수량" value={quantity} onChange={setQuantity} disabled={busy || Boolean(claimRetry)} />
      <Input label="클레임 상세 사유" value={reason} onChange={setReason} disabled={busy || Boolean(claimRetry)} />
      {claimRetry ? <Text>결과가 불명확하여 같은 입력·요청 키로 재시도합니다.</Text> : null}
      <Action label="클레임 접수" disabled={busy || !Number.isSafeInteger(Number(quantity)) || Number(quantity) < 1 ||
        Number(quantity) > subject.quantity || !reason.trim() || reason.trim().length > 2000} onPress={() => void run(async () => {
        const input: ClaimInput = claimRetry ?? { orderId: order.id, shipmentOrderId: subject.shipmentId,
          optionId: subject.optionId, kind, reasonCode, reason: reason.trim(), quantity: Number(quantity) };
        let created: { id: string; status: string };
        try {
          created = await api.createClaim(input);
        } catch (error) {
          if (error instanceof CustomerApiError && error.code === 'offline') setClaimRetry(input);
          throw error;
        }
        setReason(''); setClaimRetry(undefined); setNotice('클레임 접수 · 처리 완료 아님');
        await openClaim(created.id);
      })} />
      <Text>클레임을 접수한 뒤 증빙을 첨부합니다. 첨부만으로 심사 완료가 아닙니다.</Text>
    </View> : null}
    <Action label="내 클레임 조회" disabled={busy} onPress={() => void run(async () => {
      setClaims([]); setCursor(null); setClaim(undefined); const result = await api.claims();
      setClaims(result.items); setCursor(result.nextCursor);
    })} />
    {claims.map(item => <Action key={item.id} label={`${item.kind} ${item.status} ${item.id}`} disabled={busy}
      onPress={() => void run(() => openClaim(item.id))} />)}
    {cursor ? <Action label="클레임 더 보기" disabled={busy} onPress={() => void run(async () => {
      const result = await api.claims(cursor); setClaims(previous => [...previous, ...result.items]); setCursor(result.nextCursor);
    })} /> : null}
    {claim ? <View><Text>클레임 {claim.status} · {claim.reason}</Text>
      <Text>심사 사유 {claim.decisionReason ?? '미등록'}</Text>
      {claim.messages.map(message => <Text key={message.id}>{message.authorRole} · {message.body}</Text>)}
      {claim.events.map((event, i) => <Text key={i}>{event.action} · {event.afterStatus} · {event.occurredAt}</Text>)}
      {['REQUESTED', 'SELLER_REPLIED'].includes(claim.status) ? <AttachmentPanel key={claim.id} api={api} kind="claim" targetId={claim.id}
        items={claim.evidence} pickAttachment={pickAttachment} busy={busy} run={run} reload={() => openClaim(claim.id)} /> :
        <Text>처리가 진행된 클레임은 새 증빙을 첨부할 수 없습니다.</Text>}
    </View> : null}
  </View>;
}
