import { BadRequestException, Body, ConflictException, Controller, ForbiddenException,
  Get, Header, HttpCode, Inject, NotFoundException, Param, PayloadTooLargeException,
  Post, Query, Req, ServiceUnavailableException, StreamableFile,
  UnauthorizedException } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import type { Pool } from 'pg';
import { readToken, requireOrigin } from '../auth/controller.js';
import { AuthRepository } from '../auth/repository.js';
import { ImageQuarantine } from '../catalog/image-quarantine.js';
import { DatabaseService } from '../db/service.js';
import { addClaimEvidence, approveClaim, createClaim, getClaim, listClaims, parseClaimPageQuery,
  readClaimEvidence, rejectClaim, replyToClaim } from './claims.js';

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

async function context(database: DatabaseService, request: RequestHeaders,
  role: 'customer' | 'seller' | 'admin') {
  const token = readToken(request.headers.cookie);
  if (!token) throw new UnauthorizedException();
  const pool = poolOrUnavailable(database);
  const actor = await new AuthRepository(pool).getSession(token);
  if (!actor) throw new UnauthorizedException();
  if (actor.role !== role || (role === 'seller' && !actor.sellerId))
    throw new ForbiddenException();
  return { pool, actor };
}

async function handle<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Invalid support request')
      throw new BadRequestException({ status: 'invalid_support' });
    if (message === 'Support unavailable') throw new NotFoundException();
    if (message === 'Support conflict')
      throw new ConflictException({ status: 'support_conflict' });
    if (message === 'Support image limit')
      throw new ConflictException({ status: 'image_limit' });
    if (message === 'Image too large') throw new PayloadTooLargeException();
    if (['Unsupported image','Image MIME mismatch','Invalid image container'].includes(message))
      throw new BadRequestException({ status: 'invalid_image' });
    if (message === 'Support evidence unavailable')
      throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'claim_evidence' });
    if (message === 'Support refund unavailable')
      throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'refund_provider' });
    throw error;
  }
}

function localClaimStore(): ImageQuarantine | undefined {
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_LOCAL_UPLOAD !== '1' ||
      !['127.0.0.1','::1','localhost'].includes(process.env.API_HOST ?? '127.0.0.1') ||
      !process.env.SHOPPINGMALL_UPLOAD_ROOT) return undefined;
  try { return new ImageQuarantine(process.env.SHOPPINGMALL_UPLOAD_ROOT); }
  catch { return undefined; }
}

@Controller('customer/support/claims')
export class CustomerSupportClaimController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  async list(@Req() request: RequestHeaders, @Query() query: Record<string, unknown>) {
    const { pool, actor } = await context(this.database, request, 'customer');
    return handle(() => listClaims(pool, 'customer', actor.accountId,
      undefined, parseClaimPageQuery(query)));
  }

  @Get(':claimId')
  @Header('Cache-Control', 'private, no-store')
  async detail(@Req() request: RequestHeaders, @Param('claimId') claimId: string) {
    const { pool, actor } = await context(this.database, request, 'customer');
    const claim = await handle(() => getClaim(pool, 'customer', actor.accountId,
      undefined, claimId));
    if (!claim) throw new NotFoundException();
    return claim;
  }

  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  async create(@Req() request: RequestHeaders, @Body() value: unknown) {
    requireOrigin(request);
    const { pool, actor } = await context(this.database, request, 'customer');
    const key = request.headers['idempotency-key'];
    if (!key || !uuid.test(key)) throw new BadRequestException({ status: 'invalid_support' });
    const body = claimBody(value);
    return handle(() => createClaim(pool, { ...body, customerAccountId: actor.accountId,
      idempotencyKey: key }));
  }

  @Post(':claimId/evidence')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  async addEvidence(@Req() request: IncomingMessage, @Param('claimId') claimId: string) {
    requireOrigin(request);
    const { pool, actor } = await context(this.database, request, 'customer');
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || !uuid.test(key))
      throw new BadRequestException({ status: 'invalid_support' });
    const store = localClaimStore();
    if (!store) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'upload_store' });
    const mimeType = request.headers['content-type'];
    if (typeof mimeType !== 'string' ||
        !['image/png','image/jpeg','image/webp'].includes(mimeType))
      throw new BadRequestException({ status: 'invalid_image_headers' });
    if (Number(request.headers['content-length'] ?? 0) > 5 * 1024 * 1024)
      throw new PayloadTooLargeException();
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > 5 * 1024 * 1024) throw new PayloadTooLargeException();
      chunks.push(bytes);
    }
    return handle(() => addClaimEvidence(pool, { claimId,
      customerAccountId: actor.accountId, idempotencyKey: key,
      bytes: Buffer.concat(chunks, size), mimeType, store }));
  }

  @Get(':claimId/evidence/:evidenceId')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cross-Origin-Resource-Policy', 'same-site')
  async evidence(@Req() request: RequestHeaders, @Param('claimId') claimId: string,
    @Param('evidenceId') evidenceId: string) {
    const { pool, actor } = await context(this.database, request, 'customer');
    const store = localClaimStore();
    if (!store) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'upload_store' });
    const bytes = await handle(() => readClaimEvidence(pool, { claimId,evidenceId,
      actorRole: 'customer',actorAccountId: actor.accountId,store }));
    return new StreamableFile(bytes, { type: 'image/webp' });
  }
}

@Controller('seller/support/claims')
export class SellerSupportClaimController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  async list(@Req() request: RequestHeaders, @Query() query: Record<string, unknown>) {
    const { pool, actor } = await context(this.database, request, 'seller');
    return handle(() => listClaims(pool, 'seller', actor.accountId,
      actor.sellerId!, parseClaimPageQuery(query)));
  }

  @Get(':claimId')
  @Header('Cache-Control', 'private, no-store')
  async detail(@Req() request: RequestHeaders, @Param('claimId') claimId: string) {
    const { pool, actor } = await context(this.database, request, 'seller');
    const claim = await handle(() => getClaim(pool, 'seller', actor.accountId,
      actor.sellerId!, claimId));
    if (!claim) throw new NotFoundException();
    return claim;
  }

  @Post(':claimId/replies')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  async reply(@Req() request: RequestHeaders, @Param('claimId') claimId: string,
    @Body() value: unknown) {
    requireOrigin(request);
    const { pool, actor } = await context(this.database, request, 'seller');
    const key = request.headers['idempotency-key'];
    if (!key || !uuid.test(key) || !value || typeof value !== 'object' ||
        Array.isArray(value) || Object.keys(value).join(',') !== 'body' ||
        typeof (value as Record<string, unknown>).body !== 'string')
      throw new BadRequestException({ status: 'invalid_support' });
    return handle(() => replyToClaim(pool, { claimId, sellerId: actor.sellerId!,
      actorAccountId: actor.accountId, body: (value as { body: string }).body,
      idempotencyKey: key }));
  }

  @Get(':claimId/evidence/:evidenceId')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cross-Origin-Resource-Policy', 'same-site')
  async evidence(@Req() request: RequestHeaders, @Param('claimId') claimId: string,
    @Param('evidenceId') evidenceId: string) {
    const { pool, actor } = await context(this.database, request, 'seller');
    const store = localClaimStore();
    if (!store) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'upload_store' });
    const bytes = await handle(() => readClaimEvidence(pool, { claimId,evidenceId,
      actorRole: 'seller',actorAccountId: actor.accountId,sellerId: actor.sellerId!,store }));
    return new StreamableFile(bytes, { type: 'image/webp' });
  }
}

@Controller('admin/support/claims')
export class AdminSupportClaimController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  async list(@Req() request: RequestHeaders, @Query() query: Record<string, unknown>) {
    const { pool, actor } = await context(this.database, request, 'admin');
    return handle(() => listClaims(pool, 'admin', actor.accountId,
      undefined, parseClaimPageQuery(query, true)));
  }

  @Get(':claimId')
  @Header('Cache-Control', 'private, no-store')
  async detail(@Req() request: RequestHeaders, @Param('claimId') claimId: string) {
    const { pool, actor } = await context(this.database, request, 'admin');
    const claim = await handle(() => getClaim(pool, 'admin', actor.accountId,
      undefined, claimId));
    if (!claim) throw new NotFoundException();
    return claim;
  }

  @Post(':claimId/decision')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  async decide(@Req() request: RequestHeaders, @Param('claimId') claimId: string,
    @Body() value: unknown) {
    requireOrigin(request);
    const { pool, actor } = await context(this.database, request, 'admin');
    const key = request.headers['idempotency-key'];
    if (!key || !uuid.test(key) || !value || typeof value !== 'object' ||
        Array.isArray(value) || Object.keys(value).sort().join(',') !== 'decision,reason')
      throw new BadRequestException({ status: 'invalid_support' });
    const body = value as { decision?: unknown; reason?: unknown };
    if (!['approve','reject'].includes(String(body.decision)) ||
        typeof body.reason !== 'string')
      throw new BadRequestException({ status: 'invalid_support' });
    const input = { claimId,adminAccountId: actor.accountId,
      reason: body.reason,idempotencyKey: key };
    return handle(() => body.decision === 'approve' ? approveClaim(pool, input) :
      rejectClaim(pool, input));
  }

  @Get(':claimId/evidence/:evidenceId')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cross-Origin-Resource-Policy', 'same-site')
  async evidence(@Req() request: RequestHeaders, @Param('claimId') claimId: string,
    @Param('evidenceId') evidenceId: string) {
    const { pool, actor } = await context(this.database, request, 'admin');
    const store = localClaimStore();
    if (!store) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'upload_store' });
    const bytes = await handle(() => readClaimEvidence(pool, { claimId,evidenceId,
      actorRole: 'admin',actorAccountId: actor.accountId,store }));
    return new StreamableFile(bytes, { type: 'image/webp' });
  }
}
