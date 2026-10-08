import { BadRequestException, Body, ConflictException, Controller, ForbiddenException,
  Get, Header, HttpCode, Inject, NotFoundException, Param, Post, Req, ServiceUnavailableException,
  UnauthorizedException } from '@nestjs/common';
import type { Pool } from 'pg';
import { readToken, requireOrigin } from '../auth/controller.js';
import { AuthRepository } from '../auth/repository.js';
import { DatabaseService } from '../db/service.js';
import { createPurchaseConfirmation, getPurchaseConfirmation } from './confirmations.js';

type RequestHeaders = { headers: { cookie?: string; origin?: string; 'idempotency-key'?: string } };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function poolOrUnavailable(database: DatabaseService): Pool {
  const pool = database.getPool();
  if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
  return pool;
}

@Controller('customer/support/confirmations')
export class CustomerSupportConfirmationController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get(':shipmentId/:optionId')
  @Header('Cache-Control', 'private, no-store')
  async detail(@Req() request: RequestHeaders, @Param('shipmentId') shipmentId: string,
    @Param('optionId') optionId: string) {
    const token = readToken(request.headers.cookie);
    if (!token) throw new UnauthorizedException();
    const pool = poolOrUnavailable(this.database);
    const actor = await new AuthRepository(pool).getSession(token);
    if (!actor) throw new UnauthorizedException();
    if (actor.role !== 'customer') throw new ForbiddenException();
    if (![shipmentId,optionId].every((id) => uuid.test(id)))
      throw new BadRequestException({ status: 'invalid_support' });
    const found = await getPurchaseConfirmation(pool, { customerAccountId: actor.accountId,
      shipmentOrderId: shipmentId,optionId });
    if (!found) throw new NotFoundException();
    return found;
  }

  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  async create(@Req() request: RequestHeaders, @Body() body: unknown) {
    requireOrigin(request);
    const token = readToken(request.headers.cookie);
    if (!token) throw new UnauthorizedException();
    const pool = poolOrUnavailable(this.database);
    const actor = await new AuthRepository(pool).getSession(token);
    if (!actor) throw new UnauthorizedException();
    if (actor.role !== 'customer') throw new ForbiddenException();
    const key = request.headers['idempotency-key'];
    if (!key || !uuid.test(key)) throw new BadRequestException({ status: 'invalid_support' });
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException();
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some((name) => !['orderId','shipmentOrderId','optionId'].includes(name)) ||
        ['orderId','shipmentOrderId','optionId'].some((name) =>
          typeof input[name] !== 'string' || !uuid.test(input[name])))
      throw new BadRequestException({ status: 'invalid_support' });
    try {
      return await createPurchaseConfirmation(pool, { customerAccountId: actor.accountId,
        orderId: input.orderId as string, shipmentOrderId: input.shipmentOrderId as string,
        optionId: input.optionId as string, idempotencyKey: key });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'Invalid support request') throw new BadRequestException({ status: 'invalid_support' });
      if (message === 'Support unavailable') throw new NotFoundException();
      if (message === 'Support conflict') throw new ConflictException({ status: 'support_conflict' });
      throw error;
    }
  }
}
