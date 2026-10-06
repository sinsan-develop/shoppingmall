export type FulfillmentSaveDisposition = 'reload' | 'unauthorized' | 'error';

const trackingUrls: Readonly<Record<string, string>> = {
  cj_logistics: 'https://www.cjlogistics.com/ko/tool/parcel/tracking',
  korea_post: 'https://www.koreapost.go.kr/kpost/subIndex/138.do',
  hanjin: 'https://hanjin.com/kor/CMS/DeliveryMgr/WaybillSch.do?mCode=MN038',
  lotte: 'https://lotteglogis.com/home/reservation/tracking/index',
};

export function fulfillmentSaveDisposition(status: number): FulfillmentSaveDisposition {
  if ((status >= 200 && status < 300) || status === 409) return 'reload';
  if (status === 401 || status === 403) return 'unauthorized';
  return 'error';
}

export function appendUniqueFulfillments<T extends { shipmentOrderId: string }>(
  current: readonly T[], incoming: readonly T[],
): T[] {
  const byId = new Map(current.map((item) => [item.shipmentOrderId, item]));
  for (const item of incoming) byId.set(item.shipmentOrderId, item);
  return [...byId.values()];
}

export function shouldReleaseFulfillmentKey(
  disposition: FulfillmentSaveDisposition, authoritativeReloadSucceeded: boolean,
): boolean {
  return disposition === 'reload' && authoritativeReloadSucceeded;
}

export function fulfillmentFailureMessage(status?: number): string {
  if (status !== undefined && status >= 400 && status < 500) {
    return '출고 정보를 저장하지 못했습니다. 입력값을 확인해 주세요';
  }
  return '처리 결과를 확인할 수 없습니다. 같은 내용으로 다시 시도해 주세요';
}

export function createLatestRequestGuard() {
  let latest = 0;
  return {
    begin() { latest += 1; return latest; },
    isLatest(request: number) { return request === latest; },
  };
}

export function carrierTrackingUrl(code: string | null | undefined): string | null {
  return code ? trackingUrls[code] ?? null : null;
}
