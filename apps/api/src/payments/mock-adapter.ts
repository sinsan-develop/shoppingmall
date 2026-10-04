import { createHash, randomUUID } from 'node:crypto';
import type { LocalOutcome, PaymentAdapter, VerifiedPayment } from './adapter.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const providerOrder = /^(mock|no_charge):v1:([0-9a-f-]{36}):([0-9]{1,10}):([0-9a-f-]{36})$/i;

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
function parse(value: string, expected: 'mock' | 'no_charge') {
  const match = providerOrder.exec(value);
  if (!match || match[1] !== expected || !uuid.test(match[2]) || !uuid.test(match[4]))
    throw new Error('Invalid provider order');
  const amountWon = Number(match[3]);
  if (!Number.isSafeInteger(amountWon) || amountWon < 0 || amountWon > 2147483647)
    throw new Error('Invalid provider amount');
  return { orderId: match[2], amountWon };
}
function event(provider: 'mock' | 'no_charge', providerOrderId: string,
  outcome: 'APPROVED' | 'DECLINED'): VerifiedPayment {
  const { orderId, amountWon } = parse(providerOrderId, provider);
  return { provider, providerOrderId, orderId, amountWon, outcome,
    eventId: `${provider}:event:${digest(`${providerOrderId}:${outcome}`)}`,
    paymentId: `${provider}:payment:${digest(providerOrderId)}` };
}

/** Stateless local simulator: retries after restart normalize to the same provider event. */
export class MockPaymentAdapter implements PaymentAdapter {
  start(orderId: string, amountWon: number) {
    if (!uuid.test(orderId) || !Number.isSafeInteger(amountWon) ||
        amountWon < 1 || amountWon > 2147483647) throw new Error('Invalid mock payment');
    return { providerOrderId: `mock:v1:${orderId}:${amountWon}:${randomUUID()}` };
  }

  verify(providerOrderId: string, testOutcome: LocalOutcome): VerifiedPayment | null {
    parse(providerOrderId, 'mock');
    if (testOutcome === 'delay') return null;
    if (testOutcome === 'approve') return event('mock', providerOrderId, 'APPROVED');
    if (testOutcome === 'decline') return event('mock', providerOrderId, 'DECLINED');
    throw new Error('Invalid mock outcome');
  }
}

/** A zero-won order is confirmed without contacting a payment gateway. */
export class NoChargePaymentAdapter implements PaymentAdapter {
  start(orderId: string, amountWon: number) {
    if (!uuid.test(orderId) || amountWon !== 0) throw new Error('Invalid no-charge payment');
    return { providerOrderId: `no_charge:v1:${orderId}:0:${randomUUID()}` };
  }

  verify(providerOrderId: string, testOutcome: LocalOutcome): VerifiedPayment {
    const { amountWon } = parse(providerOrderId, 'no_charge');
    if (amountWon !== 0 || testOutcome !== 'approve') throw new Error('Invalid no-charge outcome');
    return event('no_charge', providerOrderId, 'APPROVED');
  }
}
