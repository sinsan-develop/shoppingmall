import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get,
  Inject, NotFoundException, Param, Post, Req, Res, ServiceUnavailableException,
  UnauthorizedException } from '@nestjs/common';
import { readToken, requireOrigin } from '../auth/controller.js';
import { AuthRepository } from '../auth/repository.js';
import { DatabaseService } from '../db/service.js';
import { createRefundCaseWithDisposition, getCustomerRefundCase,
  listCustomerRefundCases } from './service.js';

type RequestHeaders = { headers: { cookie?: string; origin?: string; 'idempotency-key'?: string } };
type StatusReply = { status: (code: number) => unknown };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseRequest(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException();
  const body = value as Record<string, unknown>;
  const allowed = new Set(['shipmentOrderId', 'lines', 'reasonCode', 'reason']);
  if (Object.keys(body).some((key) => !allowed.has(key)) || !Array.isArray(body.lines))
    throw new BadRequestException();
  const lines = body.lines.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException();
    const line = value as Record<string, unknown>;
    if (Object.keys(line).some((key) => !['optionId', 'quantity'].includes(key)))
      throw new BadRequestException();
    return { optionId: line.optionId as string, quantity: line.quantity as number };
  });
  return { shipmentOrderId: body.shipmentOrderId as string, lines,
    reasonCode: body.reasonCode as string, reason: body.reason as string };
}

@Controller('customer/checkout/orders/:orderId/refund-cases')
export class CustomerRefundController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

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

  private async handle<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); }
    catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'Invalid refund request')
        throw new BadRequestException({ status: 'invalid_refund' });
      if (message === 'Refund unavailable') throw new NotFoundException();
      if (['Refund conflict', 'Refund event conflict', 'Restock unavailable'].includes(message))
        throw new ConflictException({ status: 'refund_conflict' });
      if (error && typeof error === 'object' && 'code' in error && error.code === '42P01')
        throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
      throw error;
    }
  }

  @Post()
  async create(@Req() request: RequestHeaders, @Param('orderId') orderId: string,
    @Body() body: unknown, @Res({ passthrough: true }) reply: StatusReply) {
    requireOrigin(request);
    const { pool, accountId } = await this.context(request);
    const idempotencyKey = request.headers['idempotency-key'];
    if (!uuid.test(orderId) || !idempotencyKey || !uuid.test(idempotencyKey))
      throw new BadRequestException({ status: 'invalid_refund' });
    const input = parseRequest(body);
    const result = await this.handle(() => createRefundCaseWithDisposition(pool, {
      actorAccountId: accountId, actorRole: 'customer', checkoutOrderId: orderId,
      ...input, idempotencyKey,
    }));
    const view = await this.handle(() => getCustomerRefundCase(pool, accountId, orderId, result.view.id));
    if (!view) throw new NotFoundException();
    reply.status(result.created ? 201 : 200);
    return view;
  }

  @Get()
  async list(@Req() request: RequestHeaders, @Param('orderId') orderId: string) {
    const { pool, accountId } = await this.context(request);
    if (!uuid.test(orderId)) throw new BadRequestException({ status: 'invalid_refund' });
    const rows = await this.handle(() => listCustomerRefundCases(pool, accountId, orderId));
    if (!rows) throw new NotFoundException();
    return rows;
  }

  @Get(':caseId')
  async detail(@Req() request: RequestHeaders, @Param('orderId') orderId: string,
    @Param('caseId') caseId: string) {
    const { pool, accountId } = await this.context(request);
    if (!uuid.test(orderId) || !uuid.test(caseId))
      throw new BadRequestException({ status: 'invalid_refund' });
    const view = await this.handle(() => getCustomerRefundCase(pool, accountId, orderId, caseId));
    if (!view) throw new NotFoundException();
    return view;
  }
}
