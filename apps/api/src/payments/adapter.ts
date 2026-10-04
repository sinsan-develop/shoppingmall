export type PaymentMode = 'disabled' | 'mock';
export type LocalOutcome = 'approve' | 'decline' | 'delay';
export type VerifiedPayment = {
  provider: 'mock' | 'no_charge'; providerOrderId: string; eventId: string;
  paymentId: string; orderId: string; amountWon: number; outcome: 'APPROVED' | 'DECLINED';
};

export interface PaymentAdapter {
  start(orderId: string, amountWon: number): { providerOrderId: string };
  verify(providerOrderId: string, testOutcome: LocalOutcome): VerifiedPayment | null;
}

/** A configured mock outside a private development process must never start. */
export function resolvePaymentMode(env: { APP_ENV?: string; PAYMENT_MODE?: string }): PaymentMode {
  const mode = env.PAYMENT_MODE ?? 'disabled';
  if (mode === 'disabled') return 'disabled';
  if (mode === 'mock' && env.APP_ENV === 'development') return 'mock';
  throw new Error('Payment mode unavailable');
}

/** The processor compares the provider's normalized result with immutable order data. */
export function assertVerifiedPayment(verified: VerifiedPayment | null,
  orderId: string, payableWon: number): asserts verified is VerifiedPayment {
  if (!verified || verified.orderId !== orderId || verified.amountWon !== payableWon ||
      !Number.isSafeInteger(payableWon) || payableWon < 0 || payableWon > 2147483647)
    throw new Error('Verified payment conflict');
}
