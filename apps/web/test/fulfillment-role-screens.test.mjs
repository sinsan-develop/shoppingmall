import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const sellerItem = {
  shipmentOrderId: 'shipment-seller-1', status: 'READY', version: 3,
  paidAt: '2026-10-05T00:00:00Z', expectedShipDate: '2026-10-08',
  recipientName: '받는 분', phone: '010-****-1234', carrierCode: null,
  carrierName: null, trackingNumber: null,
};

const sellerDetail = {
  ...sellerItem,
  customerMessage: null,
  amounts: { goodsWon: 12000, shippingWon: 3000, payableWon: 15000 },
  address: { postalCode: '00000', line1: '경남 진주시', line2: '상세 주소' },
  lines: [{ id: 'line-1', productName: '<img src=x onerror=alert(1)>',
    optionName: '500g', quantity: 1 }],
};

const adminItem = {
  ...sellerItem,
  recipientName: '홍길동', phone: '010-1234-5678',
  fulfillmentSeller: { id: 'seller-a', displayName: '농가 A' },
  categories: ['채소'],
};

const adminDetail = {
  ...sellerDetail,
  ...adminItem,
  events: [{
    action: 'ADMIN_CORRECT', fromStatus: 'READY', toStatus: 'DELAYED',
    reason: '출고일 정정', customerMessage: '하루 늦게 발송합니다',
    before: { status: 'READY', expectedShipDate: '2026-10-08', carrierCode: null,
      trackingNumber: null },
    after: { status: 'DELAYED', expectedShipDate: '2026-10-09', carrierCode: null,
      trackingNumber: null },
    occurredAt: '2026-10-06T00:00:00Z',
  }],
};

function sellerProps(overrides = {}) {
  return {
    items: [sellerItem], selected: sellerDetail, statusFilter: 'READY',
    busy: false, error: '', message: '', onFilter: () => {}, onSelect: () => {},
    onTransition: () => {}, ...overrides,
  };
}

function adminProps(overrides = {}) {
  return {
    setting: { owoolSellerId: 'seller-a', version: 2,
      updatedAt: '2026-10-06T00:00:00Z' },
    items: [adminItem], selected: adminDetail, statusFilter: 'DELAYED',
    sellerFilter: 'seller-a', busy: false, error: '', message: '',
    onSaveSetting: () => {}, onFilter: () => {}, onSelect: () => {},
    onCorrect: () => {}, ...overrides,
  };
}

test('fulfillment UI reloads authoritative state after success or 409 and uses fixed generic carrier URLs', async () => {
  const { fulfillmentSaveDisposition, carrierTrackingUrl } =
    await import('../app/account/fulfillment-ui.ts');

  assert.equal(fulfillmentSaveDisposition(200), 'reload');
  assert.equal(fulfillmentSaveDisposition(409), 'reload');
  assert.equal(fulfillmentSaveDisposition(403), 'unauthorized');
  assert.equal(fulfillmentSaveDisposition(500), 'error');
  assert.equal(carrierTrackingUrl('cj_logistics'),
    'https://www.cjlogistics.com/ko/tool/parcel/tracking');
  assert.equal(carrierTrackingUrl('korea_post'),
    'https://www.koreapost.go.kr/kpost/subIndex/138.do');
  assert.equal(carrierTrackingUrl('hanjin'),
    'https://hanjin.com/kor/CMS/DeliveryMgr/WaybillSch.do?mCode=MN038');
  assert.equal(carrierTrackingUrl('lotte'),
    'https://lotteglogis.com/home/reservation/tracking/index');
  assert.equal(carrierTrackingUrl('other'), null);
});

test('seller fulfillment screen is private and covers filters, states, and transition forms', async () => {
  const { default: SellerFulfillmentPage, SellerFulfillmentView } =
    await import('../app/account/seller/orders/page.tsx');

  assert.match(renderToStaticMarkup(createElement(SellerFulfillmentPage)),
    /판매자 권한 확인 중/);

  const ready = renderToStaticMarkup(createElement(SellerFulfillmentView,
    sellerProps()));
  const packing = renderToStaticMarkup(createElement(SellerFulfillmentView,
    sellerProps({ selected: { ...sellerDetail, status: 'PACKING' } })));
  const delayed = renderToStaticMarkup(createElement(SellerFulfillmentView,
    sellerProps({ selected: { ...sellerDetail, status: 'DELAYED' } })));
  const all = `${ready}${packing}${delayed}`;

  for (const label of ['판매자 주문 출고', '상태', '전체', 'READY', 'PACKING',
    'DELAYED', 'SHIPPED', '잠정 예상일', '휴무일 미반영', '포장 시작',
    '지연 등록', '출고 처리', '지연 사유', '고객 안내', '택배사', '운송장'])
    assert.match(all, new RegExp(label));
  assert.match(all, /name="trackingNumber"/);
  assert.match(all, /maxLength="50"/);
  assert.match(all, /pattern="\[A-Za-z0-9-\]\+"/);
  assert.match(all, /name="customerMessage"/);
  assert.match(all, /class="[^"]*(shell|account-card|primary-button)/);
  assert.match(all, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(all, /<img[^>]+onerror=/);

  assert.match(renderToStaticMarkup(createElement(SellerFulfillmentView,
    sellerProps({ items: [], selected: null }))), /처리할 발송 주문이 없습니다/);
  assert.match(renderToStaticMarkup(createElement(SellerFulfillmentView,
    sellerProps({ error: '출고 목록을 불러오지 못했습니다' }))),
  /출고 목록을 불러오지 못했습니다/);
  const saving = renderToStaticMarkup(createElement(SellerFulfillmentView,
    sellerProps({ busy: true })));
  assert.match(saving, /저장 중/);
  assert.match(saving, /disabled/);
});

test('admin fulfillment screen is private and covers singleton, filters, events, and corrections', async () => {
  const { default: AdminFulfillmentPage, AdminFulfillmentView } =
    await import('../app/account/admin/fulfillment/page.tsx');

  assert.match(renderToStaticMarkup(createElement(AdminFulfillmentPage)),
    /운영자 권한 확인 중/);
  const html = renderToStaticMarkup(createElement(AdminFulfillmentView, adminProps()));
  for (const label of ['출고 운영 관리', '공동출고 담당 판매자', '설정 버전', '상태',
    '담당 판매자', '사건 이력', 'ADMIN_CORRECT', 'READY', 'DELAYED',
    '변경 전', '변경 후', '정정 사유', '고객 안내', '정정 저장'])
    assert.match(html, new RegExp(label));
  assert.match(html, /name="statusFilter"/);
  assert.match(html, /name="sellerFilter"/);
  assert.match(html, /name="correctionReason"/);
  assert.match(html, /name="customerMessage"/);
  assert.match(html, /class="[^"]*(shell|account-card|primary-button)/);

  const saving = renderToStaticMarkup(createElement(AdminFulfillmentView,
    adminProps({ busy: true })));
  assert.match(saving, /저장 중/);
  assert.match(saving, /disabled/);
});

test('customer order detail renders provisional dates, notices, and safe fixed tracking links', async () => {
  const { CustomerOrderFulfillmentView } =
    await import('../app/account/customer/order-fulfillment.tsx');
  const delayed = renderToStaticMarkup(createElement(CustomerOrderFulfillmentView, {
    shipment: {
      id: 'shipment-customer-1', status: 'PAID',
      fulfillment: {
        status: 'DELAYED', expectedShipDate: '2026-10-09',
        delayedReason: '수확 일정 변경',
        customerMessage: '<img src=x onerror=alert(1)> 하루 늦게 발송합니다',
        carrier: null, trackingNumber: null, packedAt: null, shippedAt: null,
        updatedAt: '2026-10-06T00:00:00Z',
        events: [{ action: 'ADMIN_CORRECT', status: 'DELAYED',
          expectedShipDate: '2026-10-09', customerMessage: '관리자가 출고일을 정정했습니다',
          occurredAt: '2026-10-06T00:00:00Z' }],
      },
    },
  }));
  const shipped = renderToStaticMarkup(createElement(CustomerOrderFulfillmentView, {
    shipment: {
      id: 'shipment-customer-2', status: 'PAID',
      fulfillment: {
        status: 'SHIPPED', expectedShipDate: '2026-10-08', delayedReason: null,
        customerMessage: null, carrier: { code: 'hanjin', displayName: '한진택배' },
        trackingNumber: 'TRACK123', packedAt: '2026-10-06T01:00:00Z',
        shippedAt: '2026-10-06T02:00:00Z', updatedAt: '2026-10-06T02:00:00Z',
        events: [],
      },
    },
  }));
  const all = `${delayed}${shipped}`;

  for (const label of ['배송 진행', '잠정 예상일', '휴무일 미반영', 'DELAYED',
    '수확 일정 변경', '관리자가 출고일을 정정했습니다', '한진택배', 'TRACK123',
    '운송장 직접 입력', '공식 배송조회 페이지']) assert.match(all, new RegExp(label));
  assert.match(shipped,
    /href="https:\/\/hanjin\.com\/kor\/CMS\/DeliveryMgr\/WaybillSch\.do\?mCode=MN038"/);
  assert.match(shipped, /target="_blank"/);
  assert.match(shipped, /rel="noopener noreferrer"/);
  assert.match(all, /class="[^"]*(shell|account-card|secondary-button)/);
  assert.match(delayed, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(delayed, /<img[^>]+onerror=/);
});

test('account role menus retain Flat v2 links to fulfillment screens', async () => {
  const { AccountRoleLinks } = await import('../app/account/page.tsx');
  assert.equal(typeof AccountRoleLinks, 'function');

  const seller = renderToStaticMarkup(createElement(AccountRoleLinks, { role: 'seller' }));
  const admin = renderToStaticMarkup(createElement(AccountRoleLinks, { role: 'admin' }));
  const customer = renderToStaticMarkup(createElement(AccountRoleLinks, { role: 'customer' }));
  assert.match(seller, /href="\/account\/seller\/orders"/);
  assert.match(admin, /href="\/account\/admin\/fulfillment"/);
  assert.match(customer, /href="\/account\/customer"/);
  assert.match(`${seller}${admin}${customer}`,
    /class="[^"]*(account-card|primary-button|secondary-button)/);
});
