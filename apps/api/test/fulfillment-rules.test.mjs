import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const rulesPath = new URL('../src/fulfillment/rules.ts', import.meta.url);
const rules = await import(rulesPath).catch((error) => {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});

function required(name) {
  return rules[name] ?? (() => { throw new Error(`Fulfillment rule ${name} is not implemented`); });
}

const calculateExpectedShipDate = required('calculateExpectedShipDate');
const getCarrierTrackingUrl = required('getCarrierTrackingUrl');
const normalizeTrackingNumber = required('normalizeTrackingNumber');
const validateAdminCorrection = required('validateAdminCorrection');
const validateSellerTransition = required('validateSellerTransition');

const baseSellerInput = {
  currentStatus: 'READY',
  targetStatus: 'PACKING',
  currentExpectedShipDate: '2026-10-05',
  currentSeoulDate: '2026-10-05',
};

test('seller transitions allow only the four approved fulfillment edges', () => {
  const allowed = [
    ['READY', 'PACKING'],
    ['READY', 'DELAYED'],
    ['PACKING', 'DELAYED'],
    ['DELAYED', 'PACKING'],
    ['PACKING', 'SHIPPED'],
  ];
  for (const [currentStatus, targetStatus] of allowed) {
    const input = { ...baseSellerInput, currentStatus, targetStatus };
    if (targetStatus === 'DELAYED') Object.assign(input, {
      expectedShipDate: '2026-10-06', reason: '출고 준비 지연', customerMessage: '내일 출고 예정입니다.',
    });
    if (targetStatus === 'SHIPPED') Object.assign(input, {
      carrierCode: 'cj_logistics', trackingNumber: ' 12-34-AB ',
    });
    assert.equal(validateSellerTransition(input).status, targetStatus);
  }

  for (const [currentStatus, targetStatus] of [
    ['READY', 'SHIPPED'], ['PACKING', 'READY'], ['DELAYED', 'SHIPPED'],
    ['SHIPPED', 'PACKING'], ['CANCELLED', 'PACKING'], ['PAYMENT_PENDING', 'READY'],
  ]) assert.throws(() => validateSellerTransition({
    ...baseSellerInput, currentStatus, targetStatus,
  }), /Invalid fulfillment transition/);
});

test('Seoul cutoff uses the same date before cutoff and the next calendar date at or after cutoff', () => {
  assert.equal(calculateExpectedShipDate('2026-10-05T04:59:59.999Z', '14:00'), '2026-10-05');
  assert.equal(calculateExpectedShipDate('2026-10-05T05:00:00.000Z', '14:00'), '2026-10-06');
  assert.equal(calculateExpectedShipDate('2026-10-05T05:00:00.001Z', '14:00'), '2026-10-06');
  assert.equal(calculateExpectedShipDate('2026-10-31T15:30:00.000Z', null), '2026-11-01');

  const moduleUrl = rulesPath.href;
  const script = `import { calculateExpectedShipDate } from ${JSON.stringify(moduleUrl)};`
    + `process.stdout.write(calculateExpectedShipDate('2026-10-05T05:00:00.000Z', '14:00'));`;
  const run = (TZ) => execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
    cwd: process.cwd(), env: { ...process.env, TZ }, encoding: 'utf8',
  });
  assert.equal(run('UTC'), '2026-10-06');
  assert.equal(run('America/Los_Angeles'), '2026-10-06');
});

test('DELAYED requires a later provisional date, reason and customer message', () => {
  const valid = {
    ...baseSellerInput,
    targetStatus: 'DELAYED',
    expectedShipDate: '2026-10-06',
    reason: '포장 자재 도착 지연',
    customerMessage: '휴무일이 반영되지 않은 잠정 예상일은 10월 6일입니다.',
  };
  assert.deepEqual(validateSellerTransition(valid), {
    status: 'DELAYED',
    expectedShipDate: '2026-10-06',
    delayedReason: '포장 자재 도착 지연',
    customerMessage: '휴무일이 반영되지 않은 잠정 예상일은 10월 6일입니다.',
    carrierCode: null,
    carrierName: null,
    trackingNumber: null,
  });
  for (const patch of [
    { expectedShipDate: undefined }, { expectedShipDate: '2026-10-05' },
    { expectedShipDate: '2026-10-04' }, { reason: ' ' }, { customerMessage: undefined },
  ]) assert.throws(() => validateSellerTransition({ ...valid, ...patch }), /Invalid fulfillment delay/);
});

test('SHIPPED accepts only allowlisted carriers and normalized 1-50 ASCII alphanumeric tracking numbers', () => {
  assert.deepEqual(validateSellerTransition({
    ...baseSellerInput,
    currentStatus: 'PACKING',
    targetStatus: 'SHIPPED',
    carrierCode: 'hanjin',
    trackingNumber: ' 12-AB-cd-34 ',
  }), {
    status: 'SHIPPED',
    expectedShipDate: '2026-10-05',
    delayedReason: null,
    customerMessage: null,
    carrierCode: 'hanjin',
    carrierName: null,
    trackingNumber: '12ABcd34',
  });
  assert.equal(normalizeTrackingNumber(' AB-12-xy '), 'AB12xy');
  assert.deepEqual(validateSellerTransition({
    ...baseSellerInput,
    currentStatus: 'PACKING',
    targetStatus: 'SHIPPED',
    carrierCode: 'other',
    carrierName: ' 지역 택배 ',
    trackingNumber: 'A-1',
  }).carrierName, '지역 택배');

  for (const patch of [
    { carrierCode: 'unknown', trackingNumber: '123' },
    { carrierCode: 'other', trackingNumber: '123' },
    { carrierCode: 'other', carrierName: ' ', trackingNumber: '123' },
    { carrierCode: 'lotte', carrierName: '임의 택배', trackingNumber: '123' },
    { carrierCode: 'lotte', trackingNumber: '' },
    { carrierCode: 'lotte', trackingNumber: '한글123' },
    { carrierCode: 'lotte', trackingNumber: 'ABC_123' },
    { carrierCode: 'lotte', trackingNumber: 'A'.repeat(51) },
  ]) assert.throws(() => validateSellerTransition({
    ...baseSellerInput,
    currentStatus: 'PACKING',
    targetStatus: 'SHIPPED',
    ...patch,
  }), /Invalid fulfillment shipment/);
});

test('admin correction requires both messages and fully validates only approved corrected fields', () => {
  const current = {
    status: 'PACKING',
    expectedShipDate: '2026-10-05',
    carrierCode: null,
    carrierName: null,
    trackingNumber: null,
  };
  const input = {
    current,
    corrected: {
      status: 'SHIPPED',
      carrierCode: 'korea_post',
      carrierName: null,
      trackingNumber: ' 12-34 ',
    },
    reason: '출고 상태 오입력 정정',
    customerMessage: '우체국택배로 출고되었습니다.',
  };
  assert.deepEqual(validateAdminCorrection(input), {
    status: 'SHIPPED',
    expectedShipDate: '2026-10-05',
    carrierCode: 'korea_post',
    carrierName: null,
    trackingNumber: '1234',
    reason: '출고 상태 오입력 정정',
    customerMessage: '우체국택배로 출고되었습니다.',
  });

  for (const patch of [
    { reason: '' }, { customerMessage: ' '.repeat(2) },
    { corrected: { status: 'CANCELLED' } },
    { corrected: { trackingUrl: 'https://caller.invalid/123' } },
    { corrected: { status: 'SHIPPED' } },
  ]) assert.throws(() => validateAdminCorrection({ ...input, ...patch }), /Invalid fulfillment correction/);
  assert.throws(() => validateAdminCorrection({
    ...input, current: { ...current, status: 'CANCELLED' }, corrected: { status: 'READY' },
  }), /Invalid fulfillment correction/);
});

test('admin correction rejects an explicit null status instead of treating it as omitted', () => {
  assert.throws(() => validateAdminCorrection({
    current: {
      status: 'PACKING', expectedShipDate: '2026-10-05',
      carrierCode: null, carrierName: null, trackingNumber: null,
    },
    corrected: { status: null, expectedShipDate: '2026-10-07' },
    reason: '예상일 정정', customerMessage: '10월 7일 출고 예정입니다.',
  }), /Invalid fulfillment correction/);
});

test('carrier lookup URLs are fixed official general pages and never contain tracking or caller URLs', () => {
  assert.deepEqual({
    cj_logistics: getCarrierTrackingUrl('cj_logistics'),
    korea_post: getCarrierTrackingUrl('korea_post'),
    hanjin: getCarrierTrackingUrl('hanjin'),
    lotte: getCarrierTrackingUrl('lotte'),
    other: getCarrierTrackingUrl('other'),
  }, {
    cj_logistics: 'https://www.cjlogistics.com/ko/tool/parcel/tracking',
    korea_post: 'https://www.koreapost.go.kr/kpost/subIndex/138.do',
    hanjin: 'https://hanjin.com/kor/CMS/DeliveryMgr/WaybillSch.do?mCode=MN038',
    lotte: 'https://lotteglogis.com/home/reservation/tracking/index',
    other: null,
  });
  assert.equal(getCarrierTrackingUrl('cj_logistics', 'ABC123', 'https://caller.invalid'),
    'https://www.cjlogistics.com/ko/tool/parcel/tracking');
  assert.throws(() => getCarrierTrackingUrl('not_allowlisted'), /Invalid fulfillment carrier/);
});

test('pure rules reject extra fields, oversized text and invalid calendar inputs', () => {
  assert.throws(() => validateSellerTransition({
    ...baseSellerInput, trackingUrl: 'https://caller.invalid',
  }), /Invalid fulfillment transition/);
  assert.throws(() => validateSellerTransition({
    ...baseSellerInput, reason: 'unneeded',
  }), /Invalid fulfillment transition/);
  assert.throws(() => validateSellerTransition({
    ...baseSellerInput, targetStatus: 'DELAYED', expectedShipDate: '2026-10-06',
    reason: 'x'.repeat(501), customerMessage: '고객 안내',
  }), /Invalid fulfillment delay/);
  assert.throws(() => validateSellerTransition({
    ...baseSellerInput, currentStatus: 'PACKING', targetStatus: 'SHIPPED',
    carrierCode: 'other', carrierName: 'x'.repeat(51), trackingNumber: 'A1',
  }), /Invalid fulfillment shipment/);
  assert.throws(() => calculateExpectedShipDate('2026-02-30T00:00:00Z', null),
    /Invalid fulfillment payment time/);
  assert.throws(() => calculateExpectedShipDate('2026-10-05T24:00:00Z', null),
    /Invalid fulfillment payment time/);
});
