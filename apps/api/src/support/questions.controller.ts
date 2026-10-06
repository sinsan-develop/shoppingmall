import { BadRequestException, Body, ConflictException, Controller, ForbiddenException,
  Get, Header, HttpCode, Inject, NotFoundException, Param, Post, Req,
  ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { Pool } from 'pg';
import type { AccessContext } from '../access.js';
import { readToken, requireOrigin } from '../auth/controller.js';
import { AuthRepository } from '../auth/repository.js';
import { DatabaseService } from '../db/service.js';
import { createQuestion, getCustomerQuestion, getSellerQuestion,
  listPublicQuestionAnswers, publishQuestionMessage, replyToQuestion } from './questions.js';

type RequestHeaders = { headers: { cookie?: string; origin?: string; 'idempotency-key'?: string } };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function poolOrUnavailable(database: DatabaseService): Pool {
  const pool = database.getPool();
  if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
  return pool;
}

async function context(database: DatabaseService, request: RequestHeaders,
  role: 'customer' | 'seller' | 'admin') {
  const token = readToken(request.headers.cookie);
  if (!token) throw new UnauthorizedException();
  const pool = poolOrUnavailable(database);
  const actor = await new AuthRepository(pool).getSession(token);
  if (!actor) throw new UnauthorizedException();
  if (actor.role !== role || (role === 'seller' && !actor.sellerId)) throw new ForbiddenException();
  return { pool, actor: actor as AccessContext };
}

function parseBody(value: unknown, keys: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException();
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !keys.includes(key)) ||
      keys.some((key) => typeof body[key] !== 'string')) throw new BadRequestException();
  return body as Record<string, string>;
}

async function handle<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Invalid support request') throw new BadRequestException({ status: 'invalid_support' });
    if (message === 'Support unavailable') throw new NotFoundException();
    if (message === 'Support conflict') throw new ConflictException({ status: 'support_conflict' });
    if (error && typeof error === 'object' && 'code' in error &&
      ['42P01','42703'].includes(String(error.code)))
      throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    throw error;
  }
}

@Controller('customer/support/questions')
export class CustomerSupportQuestionController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  async create(@Req() request: RequestHeaders, @Body() body: unknown) {
    requireOrigin(request);
    const { pool, actor } = await context(this.database, request, 'customer');
    const key = request.headers['idempotency-key'];
    if (!key || !uuid.test(key)) throw new BadRequestException({ status: 'invalid_support' });
    const input = parseBody(body, ['productId','text']);
    return handle(() => createQuestion(pool, { customerAccountId: actor.accountId,
      productId: input.productId, body: input.text, idempotencyKey: key }));
  }

  @Get(':questionId')
  @Header('Cache-Control', 'private, no-store')
  async detail(@Req() request: RequestHeaders, @Param('questionId') questionId: string) {
    const { pool, actor } = await context(this.database, request, 'customer');
    const result = await handle(() => getCustomerQuestion(pool, actor.accountId, questionId));
    if (!result) throw new NotFoundException();
    return result;
  }
}

@Controller('seller/support/questions')
export class SellerSupportQuestionController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get(':questionId')
  @Header('Cache-Control', 'private, no-store')
  async detail(@Req() request: RequestHeaders, @Param('questionId') questionId: string) {
    const { pool, actor } = await context(this.database, request, 'seller');
    const result = await handle(() => getSellerQuestion(pool, actor.sellerId!, questionId));
    if (!result) throw new NotFoundException();
    return result;
  }

  @Post(':questionId/replies')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  async reply(@Req() request: RequestHeaders, @Param('questionId') questionId: string,
    @Body() body: unknown) {
    requireOrigin(request);
    const { pool, actor } = await context(this.database, request, 'seller');
    const key = request.headers['idempotency-key'];
    if (!key || !uuid.test(key)) throw new BadRequestException({ status: 'invalid_support' });
    const input = parseBody(body, ['text']);
    return handle(() => replyToQuestion(pool, { questionId, sellerId: actor.sellerId!,
      actorAccountId: actor.accountId, body: input.text, idempotencyKey: key }));
  }
}

@Controller('admin/support/questions')
export class AdminSupportQuestionController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Post(':questionId/publish')
  @HttpCode(200)
  async publish(@Req() request: RequestHeaders, @Param('questionId') questionId: string,
    @Body() body: unknown) {
    requireOrigin(request);
    const { pool, actor } = await context(this.database, request, 'admin');
    const input = parseBody(body, ['messageId']);
    await handle(() => publishQuestionMessage(pool, { questionId,
      messageId: input.messageId, adminAccountId: actor.accountId }));
    return { status: 'published' };
  }
}

@Controller('catalog/products/:productId/questions')
export class PublicSupportQuestionController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get()
  async list(@Param('productId') productId: string) {
    return handle(() => listPublicQuestionAnswers(poolOrUnavailable(this.database), productId));
  }
}
