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

/** Reject an unsafe mock process before the HTTP listener can open. */
export function assertPaymentBootConfig(env: { APP_ENV?: string; PAYMENT_MODE?: string;
  API_HOST?: string; NODE_ENV?: string; QA_LOAD_MODE?: string; QA_LOAD_RUN_ID?: string;
  [key: string]: string | undefined }): PaymentMode {
  const mode = resolvePaymentMode(env);
  if (mode === 'mock' && (env.NODE_ENV === 'production' ||
      !['127.0.0.1', '::1', 'localhost'].includes(env.API_HOST ?? '127.0.0.1')))
    throw new Error('Payment mode unavailable');
  if (env.QA_LOAD_MODE !== undefined) {
    if (env.QA_LOAD_MODE !== '1') throw new Error('QA load mode unavailable');
    const providerCredentials = Object.entries(env).some(([name, value]) =>
      /^(TOSS|PORTONE|IAMPORT|IMP_|PAYMENT_PROVIDER_|PG_SECRET)/i.test(name) &&
      /(SECRET|TOKEN|KEY|CREDENTIAL|PASSWORD)/i.test(name) && Boolean(value));
    assertQaLoadMode({ appEnv: env.APP_ENV, apiHost: env.API_HOST,
      runId: env.QA_LOAD_RUN_ID, paymentMode: mode, providerCredentials });
    const qaDb = 'shoppingmall_qa_20261010_2';
    let dbUrl: URL;
    try { dbUrl = new URL(env.DATABASE_URL ?? ''); }
    catch { throw new Error('QA load database unavailable'); }
    if (env.PGDATABASE !== qaDb ||
        !['postgres:', 'postgresql:'].includes(dbUrl.protocol) ||
        !['127.0.0.1', 'localhost', '[::1]', 'local-postgres'].includes(dbUrl.hostname) ||
        dbUrl.pathname !== `/${qaDb}` ||
        !/^\d+$/.test(env.QA_LOAD_DB_SYSTEM_ID ?? ''))
      throw new Error('QA load database unavailable');
  }
  return mode;
}

/** Fail closed before a QA load listener can start; never inspect credential values. */
export function assertQaLoadMode(input: { appEnv?: string; apiHost?: string;
  runId?: string; paymentMode: PaymentMode; providerCredentials: boolean }): void {
  if (input.appEnv !== 'development' || input.paymentMode !== 'mock' ||
      !['127.0.0.1', '::1', 'localhost'].includes(input.apiHost ?? '') ||
      !/^[0-9a-f]{8}$/.test(input.runId ?? '') || input.providerCredentials)
    throw new Error('QA load mode unavailable');
}

/** The processor compares the provider's normalized result with immutable order data. */
export function assertVerifiedPayment(verified: VerifiedPayment | null,
  orderId: string, payableWon: number): asserts verified is VerifiedPayment {
  if (!verified || verified.orderId !== orderId || verified.amountWon !== payableWon ||
      !Number.isSafeInteger(payableWon) || payableWon < 0 || payableWon > 2147483647)
    throw new Error('Verified payment conflict');
}
