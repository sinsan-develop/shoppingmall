export type SettlementKind = 'sale' | 'goods_discount' | 'shipping_fee' | 'shipping_support'
  | 'goods_refund' | 'shipping_refund' | 'commission';

export type SellerSnapshot = {
  id: string; name: string; categoryId: string; categoryName: string;
};

type SaleLine = {
  productId: string; optionId: string; productName: string; optionName: string;
  producer: SellerSnapshot; unitPriceWon: number; quantity: number; goodsDiscountWon: number;
};

type RefundLine = {
  productId: string; optionId: string; productName: string; optionName: string;
  producer: SellerSnapshot; goodsRefundWon: number;
};

export type SettlementOccurrence = {
  dedupeKey: string; kind: SettlementKind; amountWon: number; occurredAt: string;
  sellerId: string; sellerName: string; sellerCategoryId: string; sellerCategoryName: string;
  checkoutOrderId: string; shipmentOrderId: string; productId: string | null;
  optionId: string | null; productName: string | null; optionName: string | null;
  sourceEventKind: 'payment' | 'refund'; sourceEventId: string;
};

export type SaleOccurrenceInput = {
  paymentEventId: string; orderId: string; occurredAt: string;
  shipments: Array<{ id: string; fulfillmentSeller: SellerSnapshot;
    shippingFeeWon: number; shippingSupportWon: number; lines: SaleLine[] }>;
};

export type RefundOccurrenceInput = {
  refundEventId: string; orderId: string; shipmentOrderId: string; occurredAt: string;
  fulfillmentSeller: SellerSnapshot; shippingRefundWon: number; lines: RefundLine[];
};

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function validSeller(value: SellerSnapshot | undefined): value is SellerSnapshot {
  return !!value && validId(value.id) && validId(value.name)
    && validId(value.categoryId) && validId(value.categoryName);
}

function validTime(value: string): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function occurrence(input: { sourceEventKind: 'payment' | 'refund'; sourceEventId: string;
  orderId: string; shipmentOrderId: string; occurredAt: string; kind: SettlementKind;
  amountWon: number; seller: SellerSnapshot; productId?: string; optionId?: string;
  productName?: string; optionName?: string }): SettlementOccurrence {
  const { seller, productId, optionId } = input;
  return {
    dedupeKey: [input.sourceEventKind, input.sourceEventId, input.kind,
      input.shipmentOrderId, optionId ?? 'shipment'].join(':'),
    kind: input.kind, amountWon: input.amountWon, occurredAt: input.occurredAt,
    sellerId: seller.id, sellerName: seller.name,
    sellerCategoryId: seller.categoryId, sellerCategoryName: seller.categoryName,
    checkoutOrderId: input.orderId, shipmentOrderId: input.shipmentOrderId,
    productId: productId ?? null, optionId: optionId ?? null,
    productName: input.productName ?? null, optionName: input.optionName ?? null,
    sourceEventKind: input.sourceEventKind, sourceEventId: input.sourceEventId,
  };
}

export function buildSaleOccurrences(input: SaleOccurrenceInput): SettlementOccurrence[] {
  if (!validId(input.paymentEventId) || !validId(input.orderId) || !validTime(input.occurredAt)
    || !Array.isArray(input.shipments) || input.shipments.length === 0) {
    throw new Error('Invalid settlement occurrence');
  }
  const result: SettlementOccurrence[] = [];
  for (const shipment of input.shipments) {
    if (!validId(shipment.id) || !validSeller(shipment.fulfillmentSeller)
      || !validMoney(shipment.shippingFeeWon) || !validMoney(shipment.shippingSupportWon)
      || shipment.shippingSupportWon > shipment.shippingFeeWon || !Array.isArray(shipment.lines)
      || shipment.lines.length === 0) throw new Error('Invalid settlement occurrence');
    for (const line of shipment.lines) {
      const grossWon = line.unitPriceWon * line.quantity;
      if (!validId(line.productId) || !validId(line.optionId)
        || !validId(line.productName) || !validId(line.optionName)
        || !validSeller(line.producer) || !validMoney(line.unitPriceWon)
        || !Number.isSafeInteger(line.quantity) || line.quantity <= 0
        || !validMoney(grossWon) || !validMoney(line.goodsDiscountWon)
        || line.goodsDiscountWon > grossWon) throw new Error('Invalid settlement occurrence');
      const base = { sourceEventKind: 'payment' as const, sourceEventId: input.paymentEventId,
        orderId: input.orderId, shipmentOrderId: shipment.id, occurredAt: input.occurredAt,
        seller: line.producer, productId: line.productId, optionId: line.optionId,
        productName: line.productName, optionName: line.optionName };
      result.push(occurrence({ ...base, kind: 'sale', amountWon: grossWon }));
      if (line.goodsDiscountWon) result.push(occurrence({ ...base,
        kind: 'goods_discount', amountWon: line.goodsDiscountWon }));
    }
    const shippingBase = { sourceEventKind: 'payment' as const,
      sourceEventId: input.paymentEventId, orderId: input.orderId,
      shipmentOrderId: shipment.id, occurredAt: input.occurredAt,
      seller: shipment.fulfillmentSeller };
    if (shipment.shippingFeeWon) result.push(occurrence({ ...shippingBase,
      kind: 'shipping_fee', amountWon: shipment.shippingFeeWon }));
    if (shipment.shippingSupportWon) result.push(occurrence({ ...shippingBase,
      kind: 'shipping_support', amountWon: shipment.shippingSupportWon }));
  }
  if (new Set(result.map((item) => item.dedupeKey)).size !== result.length) {
    throw new Error('Invalid settlement occurrence');
  }
  return result;
}

export function buildRefundOccurrences(input: RefundOccurrenceInput): SettlementOccurrence[] {
  if (!validId(input.refundEventId) || !validId(input.orderId)
    || !validId(input.shipmentOrderId) || !validTime(input.occurredAt)
    || !validSeller(input.fulfillmentSeller) || !validMoney(input.shippingRefundWon)
    || !Array.isArray(input.lines)) throw new Error('Invalid settlement occurrence');
  const result: SettlementOccurrence[] = [];
  for (const line of input.lines) {
    if (!validId(line.productId) || !validId(line.optionId)
      || !validId(line.productName) || !validId(line.optionName)
      || !validSeller(line.producer) || !validMoney(line.goodsRefundWon)) {
      throw new Error('Invalid settlement occurrence');
    }
    if (line.goodsRefundWon) result.push(occurrence({ sourceEventKind: 'refund',
      sourceEventId: input.refundEventId, orderId: input.orderId,
      shipmentOrderId: input.shipmentOrderId, occurredAt: input.occurredAt,
      kind: 'goods_refund', amountWon: line.goodsRefundWon, seller: line.producer,
      productId: line.productId, optionId: line.optionId,
      productName: line.productName, optionName: line.optionName }));
  }
  if (input.shippingRefundWon) result.push(occurrence({ sourceEventKind: 'refund',
    sourceEventId: input.refundEventId, orderId: input.orderId,
    shipmentOrderId: input.shipmentOrderId, occurredAt: input.occurredAt,
    kind: 'shipping_refund', amountWon: input.shippingRefundWon,
    seller: input.fulfillmentSeller }));
  if (new Set(result.map((item) => item.dedupeKey)).size !== result.length) {
    throw new Error('Invalid settlement occurrence');
  }
  return result;
}
