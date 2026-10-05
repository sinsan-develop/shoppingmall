import { randomUUID } from 'node:crypto';
import type { VerifiedRefund } from './adapter.js';

export class MockRefundAdapter {
  verify(input: Omit<VerifiedRefund, 'provider' | 'eventId'> & { eventId?: string }): VerifiedRefund {
    return { ...input, provider: 'mock',
      eventId: input.eventId ?? `mock:refund-event:${randomUUID()}` };
  }
}

export class NoChargeRefundAdapter {
  verify(input: Omit<VerifiedRefund, 'provider' | 'eventId'> & { eventId?: string }): VerifiedRefund {
    return { ...input, provider: 'no_charge',
      eventId: input.eventId ?? `no_charge:refund-event:${randomUUID()}` };
  }
}
