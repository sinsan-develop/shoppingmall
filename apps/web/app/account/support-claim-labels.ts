const statusLabels: Record<string,string> = {
  REQUESTED:'접수됨',SELLER_REPLIED:'판매자 답변',APPROVED:'승인',
  REJECTED:'반려',REFUND_PROCESSING:'환불 처리 중',REFUNDED:'환불 완료',
  REVIEW_REQUIRED:'검토 필요',
};
const kindLabels: Record<string,string> = {
  CLAIM:'클레임',RETURN:'반품',EXCHANGE:'교환',
};
const reasonLabels: Record<string,string> = {
  quality_issue:'품질',damaged:'훼손',wrong_delivery:'오배송',
  change_of_mind:'변심',other:'기타',
};
const roleLabels: Record<string,string> = {
  customer:'고객',seller:'판매자',admin:'관리자',system:'시스템',
};
const actionLabels: Record<string,string> = {
  ...statusLabels,EVIDENCE_ADDED:'증빙 추가',
};
const systemReasonLabels: Record<string,string> = {
  'Refund attempt reserved':'환불 시도 예약',
  'Verified post-shipment goods refund applied':'출고 후 상품 환불 검증·적용',
  'Refund event conflict':'환불 사건 충돌',
  'Refund event mismatch':'환불 사건 불일치',
  'Refund path does not match the current shipment state':'현재 발송 상태와 환불 경로 불일치',
  'Refund verification mismatch':'환불 검증 값 불일치',
  'Verified refund failure':'검증된 환불 실패',
  'Post-shipment claim and refund line mismatch':'출고 후 클레임과 환불 품목 불일치',
  'Verified refund succeeded; stock restoration requires manual review':
    '환불은 성공했으나 재고 복원은 수동 검토 필요',
};

function knownOrRaw(labels: Record<string,string>,value: string) {
  return labels[value] ?? value;
}

export const claimStatusLabel = (value: string) => knownOrRaw(statusLabels,value);
export const claimKindLabel = (value: string) => knownOrRaw(kindLabels,value);
export const claimReasonCodeLabel = (value: string) => knownOrRaw(reasonLabels,value);
export const claimActorRoleLabel = (value: string) => knownOrRaw(roleLabels,value);
export const claimActionLabel = (value: string) => knownOrRaw(actionLabels,value);

export function claimEventReasonLabel(event: { action: string;actorRole: string;reason: string }) {
  if (event.action === 'REQUESTED' && event.actorRole === 'customer' &&
      event.reason === 'Claim requested') return '클레임 접수';
  if (event.action === 'SELLER_REPLIED' && event.actorRole === 'seller' &&
      event.reason === 'Seller reply submitted') return '판매자 답변 등록';
  if (event.action === 'EVIDENCE_ADDED' && event.actorRole === 'customer') {
    const match = /^Evidence ([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}) added$/i
      .exec(event.reason);
    if (match) return `증빙 ${match[1]} 추가`;
  }
  if (event.actorRole === 'system')
    return knownOrRaw(systemReasonLabels,event.reason);
  return event.reason;
}
