export function productLoadFailureMessage(reason: unknown) {
  return reason instanceof Error && reason.message === '상품을 찾을 수 없습니다'
    ? '상품을 찾을 수 없습니다' : '상품을 불러올 수 없습니다';
}
