import { BadRequestException, Body, ConflictException, Controller, ForbiddenException,
  Header, HttpCode, Inject, NotFoundException, Post, Req, ServiceUnavailableException,
  UnauthorizedException } from '@nestjs/common';
import type { Pool } from 'pg';
import { readToken, requireOrigin } from '../auth/controller.js';
import { AuthRepository } from '../auth/repository.js';
import { DatabaseService } from '../db/service.js';
import { createClaim } from './claims.js';

type RequestHeaders = { headers: { cookie?: string; origin?: string; 'idempotency-key'?: string } };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function poolOrUnavailable(database: DatabaseService): Pool {
  const pool = database.getPool();
  if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
  return pool;
}

function claimBody(value: unknown) {
  const keys = ['orderId','shipmentOrderId','optionId','kind','reasonCode','reason','quantity'];
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException({ status: 'invalid_support' });
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !keys.includes(key)) ||
      keys.some((key) => body[key] === undefined) ||
      keys.slice(0, 6).some((key) => typeof body[key] !== 'string') ||
      !Number.isSafeInteger(body.quantity))
    throw new BadRequestException({ status: 'invalid_support' });
  return body as { orderId: string; shipmentOrderId: string; optionId: string;
    kind: string; reasonCode: string; reason: string; quantity: number };
}

@Controller('customer/support/claims')
export class CustomerSupportClaimController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  async create(@Req() request: RequestHeaders, @Body() value: unknown) {
    requireOrigin(request);
    const token = readToken(request.headers.cookie);
    if (!token) throw new UnauthorizedException();
    const pool = poolOrUnavailable(this.database);
    const actor = await new AuthRepository(pool).getSession(token);
    if (!actor) throw new UnauthorizedException();
    if (actor.role !== 'customer') throw new ForbiddenException();
    const key = request.headers['idempotency-key'];
    if (!key || !uuid.test(key)) throw new BadRequestException({ status: 'invalid_support' });
    const body = claimBody(value);
    try { return await createClaim(pool, { ...body, customerAccountId: actor.accountId,
      idempotencyKey: key }); }
    catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'Invalid support request')
        throw new BadRequestException({ status: 'invalid_support' });
      if (message === 'Support unavailable') throw new NotFoundException();
      if (message === 'Support conflict')
        throw new ConflictException({ status: 'support_conflict' });
      throw error;
    }
  }
}
