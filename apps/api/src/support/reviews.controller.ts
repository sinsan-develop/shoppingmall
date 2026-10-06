import { BadRequestException, Body, ConflictException, Controller, ForbiddenException,
  Get, Header, HttpCode, Inject, NotFoundException, Param, Post, Put, Req,
  ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { Pool } from 'pg';
import { readToken, requireOrigin } from '../auth/controller.js';
import { AuthRepository } from '../auth/repository.js';
import { DatabaseService } from '../db/service.js';
import { createReview, editReview, getCustomerReview } from './reviews.js';

type RequestHeaders = { headers: { cookie?: string; origin?: string; 'idempotency-key'?: string } };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function poolOrUnavailable(database: DatabaseService): Pool {
  const pool = database.getPool();
  if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
  return pool;
}

function parseContent(value: unknown, keys: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException();
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !keys.includes(key)) ||
      keys.some((key) => body[key] === undefined) ||
      !Number.isInteger(body.rating) || Number(body.rating) < 1 || Number(body.rating) > 5 ||
      typeof body.text !== 'string' || !body.text.trim() || body.text.trim().length > 2000)
    throw new BadRequestException({ status: 'invalid_support' });
  return { rating: body.rating as number, body: body.text.trim(),
    ...(body.confirmationId ? { confirmationId: body.confirmationId as string } : {}) };
}

async function handle<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Invalid support request') throw new BadRequestException({ status: 'invalid_support' });
    if (message === 'Support unavailable') throw new NotFoundException();
    if (message === 'Support conflict') throw new ConflictException({ status: 'support_conflict' });
    throw error;
  }
}

@Controller('customer/support/reviews')
export class CustomerSupportReviewController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private async context(request: RequestHeaders) {
    const token = readToken(request.headers.cookie);
    if (!token) throw new UnauthorizedException();
    const pool = poolOrUnavailable(this.database);
    const actor = await new AuthRepository(pool).getSession(token);
    if (!actor) throw new UnauthorizedException();
    if (actor.role !== 'customer') throw new ForbiddenException();
    return { pool, accountId: actor.accountId };
  }

  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  async create(@Req() request: RequestHeaders, @Body() value: unknown) {
    requireOrigin(request);
    const { pool, accountId } = await this.context(request);
    const key = request.headers['idempotency-key'];
    if (!key || !uuid.test(key)) throw new BadRequestException({ status: 'invalid_support' });
    const content = parseContent(value, ['confirmationId','rating','text']);
    return handle(() => createReview(pool, { customerAccountId: accountId,
      confirmationId: content.confirmationId!, rating: content.rating, body: content.body,
      idempotencyKey: key }));
  }

  @Put(':reviewId')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  async edit(@Req() request: RequestHeaders, @Param('reviewId') reviewId: string,
    @Body() value: unknown) {
    requireOrigin(request);
    const { pool, accountId } = await this.context(request);
    const key = request.headers['idempotency-key'];
    if (!key || !uuid.test(key)) throw new BadRequestException({ status: 'invalid_support' });
    const content = parseContent(value, ['rating','text']);
    return handle(() => editReview(pool, { reviewId, customerAccountId: accountId,
      rating: content.rating, body: content.body, idempotencyKey: key }));
  }

  @Get(':reviewId')
  @Header('Cache-Control', 'private, no-store')
  async detail(@Req() request: RequestHeaders, @Param('reviewId') reviewId: string) {
    const { pool, accountId } = await this.context(request);
    const review = await handle(() => getCustomerReview(pool, accountId, reviewId));
    if (!review) throw new NotFoundException();
    return review;
  }
}
