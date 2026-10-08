import assert from 'node:assert/strict';
import test from 'node:test';
import { recordPaidSettlement, recordRefundSettlement } from '../src/settlement/record.ts';

const farm = { id: 'farm-id', name: '농가 A', categoryId: 'farm-category', categoryName: '농가' };
const owool = { id: 'owool-id', name: '어울몰', categoryId: 'own-category', categoryName: '자체' };

test('paid pooled order records producer goods and fulfillment shipping atomically', async () => {
  const inserted = [];
  const client = { async query(sql, values) {
    if (sql.includes('FROM shipment_orders sh')) return { rows: [{ id: 'shipment-id',
      shippingFeeWon: 3000, shippingSupportWon: 1000,
      fulfillmentSellerId: owool.id, fulfillmentSellerName: owool.name,
      fulfillmentCategoryId: owool.categoryId, fulfillmentCategoryName: owool.categoryName }] };
    if (sql.includes('FROM shipment_order_lines line')) return { rows: [{
      shipmentOrderId: 'shipment-id', productId: 'product-id', optionId: 'option-id',
      productName: '고추', optionName: '500g', unitPriceWon: 20000, quantity: 1,
      goodsDiscountWon: 2000, producerId: farm.id, producerName: farm.name,
      producerCategoryId: farm.categoryId, producerCategoryName: farm.categoryName,
    }] };
    if (sql.includes('INSERT INTO settlement_events')) { inserted.push(values); return { rowCount: 1 }; }
    throw new Error(`Unexpected query: ${sql}`);
  } };
  await recordPaidSettlement(client, { orderId: 'order-id', eventId: 'event-id',
    paidAt: new Date('2026-05-01T00:00:00Z'), payableWon: 20000 });
  assert.equal(inserted.length, 4);
  const byKind = Object.fromEntries(inserted.map((values) => [values[1], values]));
  assert.deepEqual([byKind.sale[2], byKind.sale[4], byKind.sale[8]],
    [20000, farm.id, 'order-id']);
  assert.deepEqual([byKind.goods_discount[2], byKind.goods_discount[4]], [2000, farm.id]);
  assert.deepEqual([byKind.shipping_fee[2], byKind.shipping_fee[4]], [3000, owool.id]);
  assert.deepEqual([byKind.shipping_support[2], byKind.shipping_support[4]], [1000, owool.id]);
  assert.ok(inserted.every((values) => values[3] === '2026-05-01T00:00:00.000Z'));
});

test('paid settlement refuses non-reconciling order before inserting any entry', async () => {
  let inserted = false;
  const client = { async query(sql) {
    if (sql.includes('FROM shipment_orders sh')) return { rows: [{ id: 'shipment-id',
      shippingFeeWon: 3000, shippingSupportWon: 1000,
      fulfillmentSellerId: owool.id, fulfillmentSellerName: owool.name,
      fulfillmentCategoryId: owool.categoryId, fulfillmentCategoryName: owool.categoryName }] };
    if (sql.includes('FROM shipment_order_lines line')) return { rows: [{
      shipmentOrderId: 'shipment-id', productId: 'product-id', optionId: 'option-id',
      productName: '고추', optionName: '500g', unitPriceWon: 20000, quantity: 1,
      goodsDiscountWon: 2000, producerId: farm.id, producerName: farm.name,
      producerCategoryId: farm.categoryId, producerCategoryName: farm.categoryName }] };
    if (sql.includes('INSERT INTO settlement_events')) inserted = true;
    return { rows: [] };
  } };
  await assert.rejects(() => recordPaidSettlement(client, { orderId: 'order-id',
    eventId: 'event-id', paidAt: new Date('2026-05-01T00:00:00Z'), payableWon: 19999 }),
  /Settlement amount mismatch/);
  assert.equal(inserted, false);
});

test('refund occurrence uses its completion date and original product and order', async () => {
  const inserted = [];
  const client = { async query(sql, values) {
    if (sql.includes('FROM refund_cases refund')) return { rows: [{
      orderId: 'may-order', shipmentOrderId: 'may-shipment', goodsWon: 12000,
      shippingWon: 3000, totalWon: 15000, completedAt: new Date('2026-07-01T00:00:00Z'),
      fulfillmentSellerId: owool.id, fulfillmentSellerName: owool.name,
      fulfillmentCategoryId: owool.categoryId, fulfillmentCategoryName: owool.categoryName,
    }] };
    if (sql.includes('FROM refund_case_lines refundLine')) return { rows: [{
      productId: 'product-id', optionId: 'option-id', productName: '고추', optionName: '500g',
      goodsRefundWon: 12000, producerId: farm.id, producerName: farm.name,
      producerCategoryId: farm.categoryId, producerCategoryName: farm.categoryName,
    }] };
    if (sql.includes('INSERT INTO settlement_events')) { inserted.push(values); return { rowCount: 1 }; }
    throw new Error(`Unexpected query: ${sql}`);
  } };
  await recordRefundSettlement(client, { caseId: 'case-id', eventId: 'refund-event' });
  assert.equal(inserted.length, 2);
  assert.deepEqual([inserted[0][1], inserted[0][2], inserted[0][4], inserted[0][8],
    inserted[0][12], inserted[0][14]],
  ['goods_refund', 12000, farm.id, 'may-order', '고추', 'refund']);
  assert.deepEqual([inserted[1][1], inserted[1][2], inserted[1][4]],
    ['shipping_refund', 3000, owool.id]);
  assert.ok(inserted.every((values) => values[3] === '2026-07-01T00:00:00.000Z'));
});
