import { BadRequestException, Body, ConflictException, Controller, ForbiddenException,
  Get, Header, HttpCode, Inject, NotFoundException, Param, Post, Put, Query, Req,
  ServiceUnavailableException, StreamableFile, UnauthorizedException } from '@nestjs/common';
import type { Pool } from 'pg';
import { readToken, requireOrigin } from '../auth/controller.js';
import { AuthRepository } from '../auth/repository.js';
import { DatabaseService } from '../db/service.js';
import { ImageQuarantine } from '../catalog/image-quarantine.js';
import { scanImageWithClamd } from '../catalog/image-scanner.js';
import { approveReview, createReview, editReview, getCustomerReview, hideReview,
  listPublicReviews, readPublicReviewImage, reportReview } from './reviews.js';
import { parseQuestionPageQuery } from './questions.js';

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
    if (message === 'Support scan unavailable')
      throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'image_scan' });
    if (message === 'Support image unavailable')
      throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'review_image' });
    throw error;
  }
}

async function context(database: DatabaseService, request: RequestHeaders,
  role: 'customer' | 'admin') {
  const token = readToken(request.headers.cookie);
  if (!token) throw new UnauthorizedException();
  const pool = poolOrUnavailable(database);
  const actor = await new AuthRepository(pool).getSession(token);
  if (!actor) throw new UnauthorizedException();
  if (actor.role !== role) throw new ForbiddenException();
  return { pool, accountId: actor.accountId };
}

function requestKey(request: RequestHeaders) {
  const key = request.headers['idempotency-key'];
  if (!key || !uuid.test(key)) throw new BadRequestException({ status: 'invalid_support' });
  return key;
}

function localReviewStore(): ImageQuarantine | undefined {
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_LOCAL_UPLOAD !== '1' ||
      !['127.0.0.1', '::1', 'localhost'].includes(process.env.API_HOST ?? '127.0.0.1') ||
      !process.env.SHOPPINGMALL_UPLOAD_ROOT) return undefined;
  try { return new ImageQuarantine(process.env.SHOPPINGMALL_UPLOAD_ROOT); }
  catch { return undefined; }
}

function reasonBody(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).join(',') !== 'reason' ||
      typeof (value as { reason?: unknown }).reason !== 'string' ||
      !(value as { reason: string }).reason.trim() ||
      (value as { reason: string }).reason.trim().length > 500)
    throw new BadRequestException({ status: 'invalid_support' });
  return (value as { reason: string }).reason.trim();
}

@Controller('customer/support/reviews')
export class CustomerSupportReviewController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private async context(request: RequestHeaders) {
    return context(this.database, request, 'customer');
  }

  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  async create(@Req() request: RequestHeaders, @Body() value: unknown) {
    requireOrigin(request);
    const { pool, accountId } = await this.context(request);
    const key = requestKey(request);
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
    const key = requestKey(request);
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

  @Post(':reviewId/reports')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  async report(@Req() request: RequestHeaders, @Param('reviewId') reviewId: string,
    @Body() value: unknown) {
    requireOrigin(request);
    const { pool, accountId } = await this.context(request);
    return handle(() => reportReview(pool, { reviewId, customerAccountId: accountId,
      reason: reasonBody(value) }));
  }
}

@Controller('admin/support/reviews')
export class AdminSupportReviewController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Post(':reviewId/approve')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  async approve(@Req() request: RequestHeaders, @Param('reviewId') reviewId: string,
    @Body() value: unknown) {
    requireOrigin(request);
    const { pool, accountId } = await context(this.database, request, 'admin');
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).length) throw new BadRequestException({ status: 'invalid_support' });
    const store = localReviewStore();
    return handle(() => approveReview(pool, { reviewId, adminAccountId: accountId,
      idempotencyKey: requestKey(request), store,
      scan: store ? (bytes) => scanImageWithClamd(bytes, { host: '127.0.0.1',
        port: Number(process.env.CLAMD_PORT ?? 3310), timeoutMs: 15000 }) : undefined }));
  }

  @Post(':reviewId/hide')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  async hide(@Req() request: RequestHeaders, @Param('reviewId') reviewId: string,
    @Body() value: unknown) {
    requireOrigin(request);
    const { pool, accountId } = await context(this.database, request, 'admin');
    return handle(() => hideReview(pool, { reviewId, adminAccountId: accountId,
      reason: reasonBody(value), idempotencyKey: requestKey(request) }));
  }
}

@Controller('catalog/products/:productId/customer-reviews')
export class PublicSupportReviewController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get()
  async list(@Param('productId') productId: string, @Query() query: Record<string, unknown>) {
    return handle(() => listPublicReviews(poolOrUnavailable(this.database), productId,
      parseQuestionPageQuery(query)));
  }

  @Get(':reviewId/images/:imageId')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cross-Origin-Resource-Policy', 'same-site')
  async image(@Param('productId') productId: string,
    @Param('reviewId') reviewId: string, @Param('imageId') imageId: string) {
    const store = localReviewStore();
    if (!store) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'review_image' });
    const bytes = await handle(() => readPublicReviewImage(poolOrUnavailable(this.database),
      { productId, reviewId, imageId, store }));
    return new StreamableFile(bytes, { type: 'image/webp' });
  }
}
