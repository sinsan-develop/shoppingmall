import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get,
  Inject, NotFoundException, Param, Post, Req, Res, ServiceUnavailableException,
  UnauthorizedException } from '@nestjs/common';
import { readToken, requireOrigin } from '../auth/controller.js';
import { AuthRepository } from '../auth/repository.js';
import { DatabaseService } from '../db/service.js';
import { getOrderSnapshot } from './repository.js';
import { submitPendingOrderWithDisposition } from './service.js';
import type { PromotionSelection } from '../promotions/usage-service.js';

type RequestHeaders = { headers: { cookie?: string; origin?: string; 'idempotency-key'?: string } };
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
        'Promotion conflict', 'Insufficient stock'].includes(message))
        throw new ConflictException({ status: 'order_conflict' });
      if (error && typeof error === 'object' && 'code' in error && error.code === '42P01')
        throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
      throw error;
    }
  }

  @Get(':id')
  async get(@Req() request: RequestHeaders, @Param('id') id: string) {
    const { pool, accountId } = await this.context(request);
    if (!uuid.test(id)) throw new BadRequestException();
    const client = await pool.connect();
    try {
      const view = await getOrderSnapshot(client, accountId, id);
      if (!view) throw new NotFoundException();
      return view;
    } finally { client.release(); }
  }
}
