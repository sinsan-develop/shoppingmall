export type ShippingPolicy = { feeWon: number; freeThresholdWon: number; cutoffTime: string | null;
  blockedPostalRanges: { start: string; end: string }[] };

export function ShippingFields({ policy, prefix }: { policy: ShippingPolicy; prefix: string }) {
  return <div className="account-form">
    <label htmlFor={`${prefix}-fee`}>기본 배송비(원)</label>
    <input id={`${prefix}-fee`} name="feeWon" type="number" min="0" max="1000000000" step="1"
      required defaultValue={policy.feeWon} />
    <label htmlFor={`${prefix}-threshold`}>무료배송 기준(할인 전 상품금액, 원)</label>
    <input id={`${prefix}-threshold`} name="freeThresholdWon" type="number" min="0" max="1000000000"
      step="1" required defaultValue={policy.freeThresholdWon} />
    <label htmlFor={`${prefix}-cutoff`}>출고 마감시간</label>
    <input id={`${prefix}-cutoff`} name="cutoffTime" type="time" defaultValue={policy.cutoffTime ?? ''} />
    <label htmlFor={`${prefix}-blocked`}>배송 불가 우편번호 구간</label>
    <textarea id={`${prefix}-blocked`} name="blockedPostalRanges" rows={3}
      defaultValue={policy.blockedPostalRanges.map((range) => `${range.start}-${range.end}`).join('\n')}
      aria-describedby={`${prefix}-blocked-help`} />
    <p id={`${prefix}-blocked-help`}>한 줄에 시작-끝 우편번호 5자리. 예: 63000-63099</p>
  </div>;
}

export function readShippingFields(form: HTMLFormElement): ShippingPolicy {
  const data = new FormData(form);
  const blocked = String(data.get('blockedPostalRanges') ?? '').split(/\r?\n/)
    .map((line) => line.trim()).filter(Boolean).map((line) => {
      const match = /^(\d{5})-(\d{5})$/.exec(line);
      if (!match) throw new Error('배송 불가 우편번호는 5자리 시작-끝 형식으로 입력해 주세요');
      return { start: match[1], end: match[2] };
    });
  return { feeWon: Number(data.get('feeWon')), freeThresholdWon: Number(data.get('freeThresholdWon')),
    cutoffTime: String(data.get('cutoffTime') ?? '') || null, blockedPostalRanges: blocked };
}

export function ShippingSummary({ policy }: { policy: ShippingPolicy }) {
  return <p>배송비 {policy.feeWon.toLocaleString('ko-KR')}원 · 무료배송 기준 {policy.freeThresholdWon.toLocaleString('ko-KR')}원
    {policy.cutoffTime ? ` · 출고 마감 ${policy.cutoffTime}` : ' · 출고 마감 미설정'}
    {` · 배송 불가 구간 ${policy.blockedPostalRanges.length}개`}</p>;
}
