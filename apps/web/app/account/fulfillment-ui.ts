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

export function carrierTrackingUrl(code: string | null | undefined): string | null {
  return code ? trackingUrls[code] ?? null : null;
}
