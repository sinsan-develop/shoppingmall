import { allocateIncrementalRefundWon } from '../refunds/allocation.js';

export type ConfirmationSubject = {
  customerId: string;
  orderOwnerId: string;
  orderStatus: string;
  shipmentStatus: string;
  fulfillmentStatus: string;
  lineExists: boolean;
};

export function canConfirmPurchase(subject: ConfirmationSubject): boolean {
  return subject.customerId === subject.orderOwnerId && subject.orderStatus === 'PAID' &&
    subject.shipmentStatus === 'PAID' && subject.fulfillmentStatus === 'SHIPPED' &&
    subject.lineExists;
}

export function canSellerHandleLine(sellerId: string, line: { lineSellerId: string }): boolean {
  return !!sellerId && sellerId === line.lineSellerId;
}

export function canPublishReview(status: string, imageScanStatuses: readonly string[]): boolean {
  return status === 'APPROVED' && imageScanStatuses.every((scan) => scan === 'PASS');
}

export function calculatePostShipmentRefund(input: { goodsPayableWon: number;
  purchasedQuantity: number; occupiedQuantity: number; requestedQuantity: number }) {
  try {
    const goodsRefundWon = allocateIncrementalRefundWon(input.goodsPayableWon,
      input.purchasedQuantity, input.occupiedQuantity, input.requestedQuantity);
    return { goodsRefundWon, shippingRefundWon: 0, restockMode: 'none' as const,
      restockedQuantity: 0 };
  } catch { throw new Error('Refund conflict'); }
}
