import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get,
  Header, HttpCode, Inject, NotFoundException, Param, Post, Query, Req, ServiceUnavailableException,
  UnauthorizedException } from '@nestjs/common';
import type { Pool } from 'pg';
import { canAccess } from '../access.js';
import { readToken, requireOrigin } from '../auth/controller.js';
import { AuthRepository } from '../auth/repository.js';
import { DatabaseService } from '../db/service.js';
import { SellerFulfillmentService } from './service.js';

type RequestHeaders = { headers: { cookie?: string; origin?: string; 'idempotency-key'?: string } };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('fulfillment/seller/shipments')
export class SellerFulfillmentController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private databaseUnavailable(error: unknown): never {
    if (error && typeof error === 'object' && 'code' in error &&
        ['42P01', '42703'].includes(String(error.code))) {
      throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    }
    throw error;
  }

  private async context(request: RequestHeaders): Promise<{ pool: Pool; service: SellerFulfillmentService }> {
    const token = readToken(request.headers.cookie);
    if (!token) throw new UnauthorizedException();
    const pool = this.database.getPool();
    if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    try {
      const actor = await new AuthRepository(pool).getSession(token);
      if (!actor) throw new UnauthorizedException();
      if (actor.role !== 'seller' || !actor.sellerId ||
          !canAccess(actor, 'manage-seller-fulfillment', { sellerId: actor.sellerId })) {
        throw new ForbiddenException();
      }
      return { pool, service: new SellerFulfillmentService(pool, actor) };
    } catch (error) {
      return this.databaseUnavailable(error);
    }
  }

  private async handle<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.startsWith('Invalid fulfillment')) {
        throw new BadRequestException({ status: 'invalid_fulfillment' });
      }
      if (message === 'Fulfillment unavailable') throw new NotFoundException();
      if (message === 'Fulfillment conflict') {
        throw new ConflictException({ status: 'fulfillment_conflict' });
      }
      return this.databaseUnavailable(error);
    }
  }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  async list(@Req() request: RequestHeaders, @Query() query: Record<string, unknown>) {
    const { service } = await this.context(request);
    return this.handle(() => service.list(query));
  }

  @Get(':shipmentOrderId')
  @Header('Cache-Control', 'private, no-store')
  async detail(@Req() request: RequestHeaders, @Param('shipmentOrderId') shipmentOrderId: string) {
    const { service } = await this.context(request);
    if (!uuid.test(shipmentOrderId)) {
      throw new BadRequestException({ status: 'invalid_fulfillment' });
    }
    const detail = await this.handle(() => service.detail(shipmentOrderId));
    if (!detail) throw new NotFoundException();
    return detail;
  }

  @Post(':shipmentOrderId/transitions')
  @HttpCode(200)
  async transition(@Req() request: RequestHeaders, @Param('shipmentOrderId') shipmentOrderId: string,
    @Body() body: unknown) {
    requireOrigin(request);
    const { service } = await this.context(request);
    const key = request.headers['idempotency-key'];
    if (!uuid.test(shipmentOrderId) || !key || !uuid.test(key)) {
      throw new BadRequestException({ status: 'invalid_fulfillment' });
    }
    return this.handle(() => service.transition(shipmentOrderId, key, body));
  }
}
