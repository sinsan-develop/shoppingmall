import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get,
  Inject, NotFoundException, Param, Post, Query, Req, Res, ServiceUnavailableException,
  UnauthorizedException } from '@nestjs/common';
import { readToken, requireOrigin } from '../auth/controller.js';
import { AuthRepository } from '../auth/repository.js';
import { DatabaseService } from '../db/service.js';
import { getOrderSnapshotConsistent } from './repository.js';
import { submitPendingOrderWithDisposition } from './service.js';
import type { PromotionSelection } from '../promotions/usage-service.js';
import { MockPaymentAdapter, NoChargePaymentAdapter } from '../payments/mock-adapter.js';
import { getPaymentAttempt, recordVerifiedPaymentEvent,
  startPaymentAttemptWithDisposition } from '../payments/service.js';
import { processVerifiedPaymentEvent } from '../payments/processor.js';
import { listPaidOrders, parsePaidOrderQuery } from './paid-history.js';

type RequestHeaders = { headers: { cookie?: string; origin?: string; 'idempotency-key'?: string };
  socket?: { localAddress?: string } };
type StatusReply = { status: (code: number) => unknown };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function selector(value: unknown): value is { grantId: string } | { code: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const part = value as Record<string, unknown>;
  return (typeof part.grantId === 'string' && !!part.grantId && part.code === undefined) ||
    (typeof part.code === 'string' && !!part.code.trim() && part.grantId === undefined);
}
function parseBody(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException();
  const body = value as Record<string, unknown>;
  if (!uuid.test(String(body.reservationId)) || !uuid.test(String(body.addressId)) ||
      !Number.isSafeInteger(body.expectedPayableWon) || Number(body.expectedPayableWon) < 0 ||
      Number(body.expectedPayableWon) > 2147483647 || !body.selections ||
      typeof body.selections !== 'object' || Array.isArray(body.selections)) throw new BadRequestException();
  const raw = body.selections as Record<string, unknown>;
  if (raw.goodsCoupon !== undefined && !selector(raw.goodsCoupon)) throw new BadRequestException();
  if (raw.shippingCoupons !== undefined && (!Array.isArray(raw.shippingCoupons) ||
      raw.shippingCoupons.length > 100 || raw.shippingCoupons.some((part: unknown) => {
        if (!part || typeof part !== 'object' || Array.isArray(part)) return true;
        const item = part as Record<string, unknown>;
        return typeof item.shipmentKey !== 'string' || !item.shipmentKey.trim() || !selector(item);
      }))) throw new BadRequestException();
  const selections: PromotionSelection = {
    ...(raw.goodsCoupon ? { goodsCoupon: raw.goodsCoupon as PromotionSelection['goodsCoupon'] } : {}),
    shippingCoupons: (raw.shippingCoupons as Record<string, string>[] | undefined)?.map((item) => ({
      shipmentKey: item.shipmentKey,
      selector: item.grantId ? { grantId: item.grantId } : { code: item.code },
    })),
  };
  return { reservationId: body.reservationId as string, addressId: body.addressId as string,
    expectedPayableWon: body.expectedPayableWon as number, selections };
}

@Controller('customer/checkout/orders')
export class CustomerOrderController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private requireLocalMock(request: RequestHeaders) {
    const host = process.env.API_HOST ?? '127.0.0.1';
    const actual = request.socket?.localAddress;
    if (process.env.NODE_ENV === 'production' || process.env.APP_ENV !== 'development' ||
        process.env.PAYMENT_MODE !== 'mock' ||
        !['127.0.0.1', '::1', 'localhost'].includes(host) ||
        !actual || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(actual))
      throw new NotFoundException();
  }

  private async context(request: RequestHeaders) {
    const token = readToken(request.headers.cookie);
    if (!token) throw new UnauthorizedException();
    const pool = this.database.getPool();
    if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    const actor = await new AuthRepository(pool).getSession(token);
    if (!actor) throw new UnauthorizedException();
    if (actor.role !== 'customer') throw new ForbiddenException();
    return { pool, accountId: actor.accountId };
  }

  @Post()
  async submit(@Req() request: RequestHeaders, @Body() body: unknown,
    @Res({ passthrough: true }) reply: StatusReply) {
    requireOrigin(request);
    const { pool, accountId } = await this.context(request);
    const idempotencyKey = request.headers['idempotency-key'];
    if (!idempotencyKey || !uuid.test(idempotencyKey)) throw new BadRequestException();
    const input = parseBody(body);
    try {
      const result = await submitPendingOrderWithDisposition(pool, accountId,
        { ...input, idempotencyKey });
      reply.status(result.created ? 201 : 200);
      return result.view;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (['Invalid order request', 'Invalid promotion selection'].includes(message))
        throw new BadRequestException();
      if (['Address unavailable', 'Order unavailable', 'Promotion unavailable'].includes(message))
        throw new NotFoundException();
      if (['Order conflict', 'Reservation unavailable', 'Reserved product changed',
        'Promotion conflict', 'Insufficient stock', 'Delivery unavailable', 'Address changed'].includes(message))
        throw new ConflictException({ status: 'order_conflict' });
      if (error && typeof error === 'object' && 'code' in error && error.code === '42P01')
        throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
      throw error;
    }
  }

  @Get()
  async listPaid(@Req() request: RequestHeaders, @Query() query: Record<string, unknown>) {
    const { pool, accountId } = await this.context(request);
    let parsed: ReturnType<typeof parsePaidOrderQuery>;
    try { parsed = parsePaidOrderQuery(query); }
    catch { throw new BadRequestException(); }
    return listPaidOrders(pool, accountId, parsed);
  }

  @Get(':id')
  async get(@Req() request: RequestHeaders, @Param('id') id: string) {
    const { pool, accountId } = await this.context(request);
    if (!uuid.test(id)) throw new BadRequestException();
    const view = await getOrderSnapshotConsistent(pool, accountId, id);
    if (!view) throw new NotFoundException();
    return view;
  }

  @Post(':id/payment-attempts')
  async startPayment(@Req() request: RequestHeaders, @Param('id') id: string,
    @Body() body: unknown, @Res({ passthrough: true }) reply: StatusReply) {
    this.requireLocalMock(request);
    requireOrigin(request);
    const { pool, accountId } = await this.context(request);
    const idempotencyKey = request.headers['idempotency-key'];
    if (!uuid.test(id) || !idempotencyKey || !uuid.test(idempotencyKey) ||
        !body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException();
    const testOutcome = (body as Record<string, unknown>).testOutcome;
    if (!['approve', 'decline', 'delay'].includes(String(testOutcome)) ||
        Object.keys(body).some((key) => key !== 'testOutcome')) throw new BadRequestException();
    try {
      const result = await startPaymentAttemptWithDisposition(pool, accountId, id,
        idempotencyKey, testOutcome as 'approve' | 'decline' | 'delay');
      if (testOutcome !== 'delay') {
        const saved = await pool.query<{ provider: string; providerOrderId: string }>(
          `SELECT provider,provider_order_id AS "providerOrderId" FROM payment_attempts
           WHERE id=$1 AND checkout_order_id=$2`, [result.view.id, id]);
        const internal = saved.rows[0];
        if (!internal) throw new Error('Payment unavailable');
        const adapter = internal.provider === 'no_charge'
          ? new NoChargePaymentAdapter() : new MockPaymentAdapter();
        const verified = adapter.verify(internal.providerOrderId, testOutcome as 'approve' | 'decline');
        if (!verified) throw new Error('Payment verification unavailable');
        const event = await recordVerifiedPaymentEvent(pool, result.view.id, verified);
        await processVerifiedPaymentEvent(pool, event.id);
      }
      const current = await getPaymentAttempt(pool, accountId, id, result.view.id);
      if (!current) throw new Error('Payment unavailable');
      reply.status(result.created ? 201 : 200);
      return { ...current, mockOnly: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'Invalid payment request') throw new BadRequestException();
      if (message === 'Payment conflict' || message === 'Payment event conflict')
        throw new ConflictException({ status: 'payment_conflict' });
      if (message === 'Payment unavailable' || message === 'Payment mode unavailable')
        throw new NotFoundException();
      if (error && typeof error === 'object' && 'code' in error && error.code === '42P01')
        throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
      throw error;
    }
  }

  @Get(':id/payment-attempts/:attemptId')
  async getPayment(@Req() request: RequestHeaders, @Param('id') id: string,
    @Param('attemptId') attemptId: string) {
    const { pool, accountId } = await this.context(request);
    if (!uuid.test(id) || !uuid.test(attemptId)) throw new BadRequestException();
    const attempt = await getPaymentAttempt(pool, accountId, id, attemptId);
    if (!attempt) throw new NotFoundException();
    return { ...attempt, mockOnly: true };
  }
}
