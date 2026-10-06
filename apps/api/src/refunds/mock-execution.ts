import { NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';
import { MockRefundAdapter, NoChargeRefundAdapter } from './mock-adapter.js';
import { processVerifiedRefundEvent } from './processor.js';
import { recordVerifiedRefundEvent } from './service.js';

export function requireLocalMockRefund(request: { socket?: { localAddress?: string } }) {
  const host = process.env.API_HOST ?? '127.0.0.1';
  const actual = request.socket?.localAddress;
  if (process.env.NODE_ENV === 'production' || process.env.APP_ENV !== 'development' ||
      process.env.PAYMENT_MODE !== 'mock' || !['127.0.0.1','::1','localhost'].includes(host) ||
      !actual || !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(actual))
    throw new NotFoundException();
}

export async function executeMockRefundCase(pool: Pool, caseId: string) {
  const internal = (await pool.query<{ attemptId: string; provider: 'mock' | 'no_charge';
    providerRefundId: string; amountWon: number; orderId: string; paymentId: string }>(`SELECT
    a.id AS "attemptId",a.provider,a.provider_refund_id AS "providerRefundId",
    a.requested_won AS "amountWon",c.checkout_order_id AS "orderId",
    pe.provider_payment_id AS "paymentId" FROM refund_attempts a
    JOIN refund_cases c ON c.id=a.refund_case_id
    JOIN LATERAL (SELECT e.provider_payment_id FROM payment_events e
      WHERE e.payment_attempt_id=a.payment_attempt_id AND e.outcome='APPROVED'
        AND e.processing_status='APPLIED' ORDER BY e.received_at,e.id LIMIT 1) pe ON true
    WHERE a.refund_case_id=$1 ORDER BY a.created_at DESC,a.id DESC LIMIT 1`, [caseId])).rows[0];
  if (!internal) throw new Error('Refund attempt unavailable');
  const existing = (await pool.query<{ id: string }>(`SELECT id FROM refund_events
    WHERE refund_attempt_id=$1 ORDER BY received_at,id LIMIT 1`, [internal.attemptId])).rows[0];
  if (existing) await processVerifiedRefundEvent(pool, existing.id);
  else {
    const adapter = internal.provider === 'no_charge'
      ? new NoChargeRefundAdapter() : new MockRefundAdapter();
    const verified = adapter.verify({ providerRefundId: internal.providerRefundId,
      orderId: internal.orderId,paymentId: internal.paymentId,amountWon: internal.amountWon,
      outcome: 'SUCCEEDED' });
    const event = await recordVerifiedRefundEvent(pool, internal.attemptId, verified);
    await processVerifiedRefundEvent(pool, event.id);
  }
}
