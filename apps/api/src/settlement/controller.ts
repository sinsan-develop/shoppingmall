import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get,
  Header, HttpCode, Inject, Post, Query, Req, ServiceUnavailableException,
  UnauthorizedException } from '@nestjs/common';
import type { Pool } from 'pg';
import { readToken, requireOrigin } from '../auth/controller.js';
import { AuthRepository } from '../auth/repository.js';
import { DatabaseService } from '../db/service.js';
import { completeSellerPeriodTransaction, type CompleteSellerPeriodInput } from './complete.js';
import { recordManualCommission, type ManualCommissionInput } from './commission.js';
import { parseSettlementQuery, type SettlementQuery } from './query.js';
import { readSettlement } from './repository.js';

type RequestHeaders = { headers: { cookie?: string; origin?: string } };

async function actor(pool: Pool, request: RequestHeaders) {
  const token = readToken(request.headers.cookie);
  if (!token) throw new UnauthorizedException();
  const active = await new AuthRepository(pool).getSession(token);
  if (!active) throw new UnauthorizedException();
  return active;
}

function query(value: Record<string, unknown>): SettlementQuery {
  try { return parseSettlementQuery(value); }
  catch { throw new BadRequestException({ status: 'invalid_settlement_query' }); }
}

async function report(pool: Pool, filter: SettlementQuery) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result = await readSettlement(client, filter);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  finally { client.release(); }
}

@Controller('admin/settlement')
export class AdminSettlementController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private async context(request: RequestHeaders) {
    const token = readToken(request.headers.cookie);
    if (!token) throw new UnauthorizedException();
    const pool = this.database.getPool();
    if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    const active = await actor(pool, request);
    if (active.role !== 'admin') throw new ForbiddenException();
    return { pool, accountId: active.accountId };
  }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  async read(@Req() request: RequestHeaders, @Query() raw: Record<string, unknown>) {
    const { pool } = await this.context(request);
    return report(pool, query(raw));
  }

  @Post('completions')
  @HttpCode(201)
  async complete(@Req() request: RequestHeaders, @Body() raw: unknown) {
    requireOrigin(request);
    const { pool, accountId } = await this.context(request);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new BadRequestException({ status: 'invalid_settlement_completion' });
    const body = raw as Record<string, unknown>;
    if (Object.keys(body).some((key) => !['sellerId', 'from', 'to', 'reason'].includes(key)) ||
        typeof body.sellerId !== 'string' || typeof body.from !== 'string' ||
        typeof body.to !== 'string' || typeof body.reason !== 'string')
      throw new BadRequestException({ status: 'invalid_settlement_completion' });
    try {
      return await completeSellerPeriodTransaction(pool, accountId, body as CompleteSellerPeriodInput);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23P01')
        throw new ConflictException({ status: 'settlement_period_overlap' });
      if (error instanceof Error && (error.message === 'Invalid settlement completion' ||
          error.message === 'Invalid settlement query'))
        throw new BadRequestException({ status: 'invalid_settlement_completion' });
      if (error instanceof Error && error.message === 'Settlement access denied')
        throw new ForbiddenException();
      throw error;
    }
  }

  @Post('commissions')
  @HttpCode(201)
  async commission(@Req() request: RequestHeaders, @Body() raw: unknown) {
    requireOrigin(request);
    const { pool, accountId } = await this.context(request);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new BadRequestException({ status: 'invalid_manual_commission' });
    const body = raw as Record<string, unknown>;
    if (Object.keys(body).some((key) => !['sellerId', 'requestId', 'amountWon',
      'occurredAt', 'reason'].includes(key)) ||
      typeof body.sellerId !== 'string' || typeof body.requestId !== 'string' ||
      typeof body.amountWon !== 'number' || typeof body.occurredAt !== 'string' ||
      typeof body.reason !== 'string')
      throw new BadRequestException({ status: 'invalid_manual_commission' });
    const client = await pool.connect();
    try {
      return await recordManualCommission(client, accountId, body as ManualCommissionInput);
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid manual commission')
        throw new BadRequestException({ status: 'invalid_manual_commission' });
      if (error instanceof Error && error.message === 'Manual commission access denied')
        throw new ForbiddenException();
      if (error instanceof Error && error.message === 'Manual commission request conflict')
        throw new ConflictException({ status: 'manual_commission_request_conflict' });
      throw error;
    } finally { client.release(); }
  }
}

@Controller('seller/settlement')
export class SellerSettlementController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  async read(@Req() request: RequestHeaders, @Query() raw: Record<string, unknown>) {
    const token = readToken(request.headers.cookie);
    if (!token) throw new UnauthorizedException();
    const pool = this.database.getPool();
    if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    const active = await actor(pool, request);
    if (active.role !== 'seller' || !active.sellerId) throw new ForbiddenException();
    if (Object.keys(raw).some((key) => !['from', 'to'].includes(key)))
      throw new BadRequestException({ status: 'invalid_settlement_query' });
    return report(pool, query({ ...raw, sellerId: active.sellerId }));
  }
}
