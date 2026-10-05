export type RefundProvider = 'mock' | 'no_charge';
export type VerifiedRefund = {
  provider: RefundProvider;
  eventId: string;
  orderId: string;
  paymentId: string;
  providerRefundId: string;
  amountWon: number;
  outcome: 'SUCCEEDED' | 'FAILED';
};

export function resolveRefundMode(env: { APP_ENV?: string; PAYMENT_MODE?: string }) {
  return env.APP_ENV === 'development' && env.PAYMENT_MODE === 'mock' ? 'mock' : 'disabled';
}

export function providerRefundId(provider: RefundProvider, caseId: string) {
  return `${provider}:refund:${caseId}`;
}
