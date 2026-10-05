import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get,
  HttpCode, Inject, NotFoundException, Param, Post, Query, Req, Res,
  ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { Pool } from 'pg';
import { readToken, requireOrigin } from '../auth/controller.js';
import { AuthRepository } from '../auth/repository.js';
import { DatabaseService } from '../db/service.js';
import { MockRefundAdapter, NoChargeRefundAdapter } from './mock-adapter.js';
import { processVerifiedRefundEvent } from './processor.js';
import { createRefundCaseWithDisposition, decideRefundCase, getAdminRefundCase,
  listAdminRefundCases, recordVerifiedRefundEvent } from './service.js';

type RequestHeaders = { headers: { cookie?: string; origin?: string; 'idempotency-key'?: string };
  socket?: { localAddress?: string } };
type StatusReply = { status: (code: number) => unknown };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseLines(value: unknown, decision = false) {
  if (!Array.isArray(value)) throw new BadRequestException({ status: 'invalid_refund' });
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new BadRequestException();
    const line = item as Record<string, unknown>;
    const keys = decision ? ['optionId', 'restockMode'] : ['optionId', 'quantity'];
    if (Object.keys(line).some((key) => !keys.includes(key))) throw new BadRequestException();
    return decision
      ? { optionId: line.optionId as string, restockMode: line.restockMode as 'none' | 'on_hand_only' }
      : { optionId: line.optionId as string, quantity: line.quantity as number };
  });
}

function parseCreate(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException();
  const body = value as Record<string, unknown>;
  const allowed = new Set(['checkoutOrderId', 'shipmentOrderId', 'lines', 'reasonCode', 'reason']);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw new BadRequestException();
  return { checkoutOrderId: body.checkoutOrderId as string,
    shipmentOrderId: body.shipmentOrderId as string,
    lines: parseLines(body.lines) as { optionId: string; quantity: number }[],
    reasonCode: body.reasonCode as string, reason: body.reason as string };
}

function parseDecision(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException();
  const body = value as Record<string, unknown>;
  const allowed = new Set(['decision', 'reason', 'preShipmentConfirmed', 'preShipmentEvidence', 'lines']);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw new BadRequestException();
  const lines = parseLines(body.lines, true) as { optionId: string; restockMode: 'none' | 'on_hand_only' }[];
  if (body.decision === 'approve') {
    if (body.preShipmentConfirmed !== true ||
        body.preShipmentEvidence !== 'ADMIN_CONFIRMED_NOT_DISPATCHED' || !lines.length)
      throw new BadRequestException({ status: 'invalid_refund' });
  } else if (body.decision === 'reject') {
    if (lines.length || (body.preShipmentConfirmed !== undefined && body.preShipmentConfirmed !== false) ||
        body.preShipmentEvidence !== undefined)
      throw new BadRequestException({ status: 'invalid_refund' });
  } else throw new BadRequestException({ status: 'invalid_refund' });
  return { decision: body.decision as 'approve' | 'reject', reason: body.reason as string,
    preShipmentConfirmed: body.preShipmentConfirmed as boolean,
    ...(body.preShipmentEvidence === undefined ? {} :
      { preShipmentEvidence: body.preShipmentEvidence as string }),
    lines };
}

@Controller('refunds/admin/cases')
export class AdminRefundController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private requireLocalMock(request: RequestHeaders) {
    const host = process.env.API_HOST ?? '127.0.0.1';
    const actual = request.socket?.localAddress;
    if (process.env.NODE_ENV === 'production' || process.env.APP_ENV !== 'development' ||
        process.env.PAYMENT_MODE !== 'mock' || !['127.0.0.1', '::1', 'localhost'].includes(host) ||
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
    if (actor.role !== 'admin') throw new ForbiddenException();
    return { pool, accountId: actor.accountId };
  }

  private async handle<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); }
    catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (['Invalid refund request', 'Invalid refund decision', 'Invalid refund event'].includes(message))
        throw new BadRequestException({ status: 'invalid_refund' });
      if (['Refund unavailable', 'Refund event unavailable', 'Refund attempt unavailable'].includes(message))
        throw new NotFoundException();
      if (['Refund conflict', 'Refund event conflict', 'Restock unavailable'].includes(message))
        throw new ConflictException({ status: 'refund_conflict' });
      if (error && typeof error === 'object' && 'code' in error && error.code === '42P01')
        throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
      throw error;
    }
  }

  private async executeMock(pool: Pool, caseId: string) {
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
        orderId: internal.orderId, paymentId: internal.paymentId, amountWon: internal.amountWon,
        outcome: 'SUCCEEDED' });
      const event = await recordVerifiedRefundEvent(pool, internal.attemptId, verified);
      await processVerifiedRefundEvent(pool, event.id);
    }
  }

  @Post()
  async create(@Req() request: RequestHeaders, @Body() body: unknown,
    @Res({ passthrough: true }) reply: StatusReply) {
    requireOrigin(request);
    const { pool, accountId } = await this.context(request);
    const idempotencyKey = request.headers['idempotency-key'];
    if (!idempotencyKey || !uuid.test(idempotencyKey)) throw new BadRequestException({ status: 'invalid_refund' });
    const input = parseCreate(body);
    const result = await this.handle(() => createRefundCaseWithDisposition(pool, {
      actorAccountId: accountId, actorRole: 'admin', ...input, idempotencyKey,
    }));
    const view = await this.handle(() => getAdminRefundCase(pool, accountId, result.view.id));
    if (!view) throw new NotFoundException();
    reply.status(result.created ? 201 : 200);
    return view;
  }

  @Get()
  async list(@Req() request: RequestHeaders, @Query() query: Record<string, unknown>) {
    const { pool, accountId } = await this.context(request);
    const allowed = new Set(['status', 'shipmentOrderId', 'from', 'to']);
    if (Object.keys(query).some((key) => !allowed.has(key)) ||
        Object.values(query).some((value) => typeof value !== 'string'))
      throw new BadRequestException({ status: 'invalid_refund' });
    return this.handle(() => listAdminRefundCases(pool, accountId, query));
  }

  @Get(':caseId')
  async detail(@Req() request: RequestHeaders, @Param('caseId') caseId: string) {
    const { pool, accountId } = await this.context(request);
    if (!uuid.test(caseId)) throw new BadRequestException({ status: 'invalid_refund' });
    const view = await this.handle(() => getAdminRefundCase(pool, accountId, caseId));
    if (!view) throw new NotFoundException();
    return view;
  }

  @Post(':caseId/decision')
  @HttpCode(200)
  async decide(@Req() request: RequestHeaders, @Param('caseId') caseId: string, @Body() body: unknown) {
    requireOrigin(request);
    const { pool, accountId } = await this.context(request);
    const idempotencyKey = request.headers['idempotency-key'];
    if (!uuid.test(caseId) || !idempotencyKey || !uuid.test(idempotencyKey))
      throw new BadRequestException({ status: 'invalid_refund' });
    const input = parseDecision(body);
    if (input.decision === 'approve') this.requireLocalMock(request);
    await this.handle(() => decideRefundCase(pool, { adminAccountId: accountId, caseId,
      idempotencyKey, ...input }));
    let view = await this.handle(() => getAdminRefundCase(pool, accountId, caseId));
    if (!view) throw new NotFoundException();
    if (input.decision === 'approve' && view.status === 'PROCESSING') {
      await this.handle(() => this.executeMock(pool, caseId));
      view = await this.handle(() => getAdminRefundCase(pool, accountId, caseId));
      if (!view) throw new NotFoundException();
    }
    return view;
  }
}
