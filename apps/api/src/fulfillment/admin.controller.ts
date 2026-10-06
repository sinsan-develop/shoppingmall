import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get,
  Header, HttpCode, Inject, NotFoundException, Param, Post, Put, Query, Req,
  ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import type { Pool } from 'pg';
import { readToken, requireOrigin } from '../auth/controller.js';
import { AuthRepository } from '../auth/repository.js';
import { DatabaseService } from '../db/service.js';
import { AdminFulfillmentService } from './service.js';

type RequestHeaders = { headers: { cookie?: string; origin?: string; 'idempotency-key'?: string } };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('fulfillment/admin')
export class AdminFulfillmentController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private databaseUnavailable(error: unknown): never {
    if (error && typeof error === 'object' && 'code' in error &&
        ['42P01', '42703'].includes(String(error.code))) {
      throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    }
    throw error;
  }

  private async context(request: RequestHeaders): Promise<{
    pool: Pool;
    service: AdminFulfillmentService;
  }> {
    const token = readToken(request.headers.cookie);
    if (!token) throw new UnauthorizedException();
    const pool = this.database.getPool();
    if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    try {
      const actor = await new AuthRepository(pool).getSession(token);
      if (!actor) throw new UnauthorizedException();
      if (actor.role !== 'admin') throw new ForbiddenException();
      return { pool, service: new AdminFulfillmentService(pool, actor) };
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) throw error;
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
      if (message === 'Fulfillment configuration unavailable') {
        throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
      }
      return this.databaseUnavailable(error);
    }
  }

  private idempotencyKey(request: RequestHeaders): string {
    const key = request.headers['idempotency-key'];
    if (!key || !uuid.test(key)) {
      throw new BadRequestException({ status: 'invalid_fulfillment' });
    }
    return key;
  }

  private async changeSetting(request: RequestHeaders, body: unknown) {
    requireOrigin(request);
    const { service } = await this.context(request);
    return this.handle(() => service.updateSetting(this.idempotencyKey(request), body));
  }

  @Get('settings')
  @Header('Cache-Control', 'private, no-store')
  async getSetting(@Req() request: RequestHeaders) {
    const { service } = await this.context(request);
    return this.handle(() => service.getSetting());
  }

  @Put('settings')
  async putSetting(@Req() request: RequestHeaders, @Body() body: unknown) {
    return this.changeSetting(request, body);
  }

  @Get('shipments')
  @Header('Cache-Control', 'private, no-store')
  async list(@Req() request: RequestHeaders, @Query() query: Record<string, unknown>) {
    const { service } = await this.context(request);
    return this.handle(() => service.list(query));
  }

  @Get('shipments/:shipmentOrderId')
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

  @Post('shipments/:shipmentOrderId/corrections')
  @HttpCode(200)
  async correct(@Req() request: RequestHeaders, @Param('shipmentOrderId') shipmentOrderId: string,
    @Body() body: unknown) {
    requireOrigin(request);
    const { service } = await this.context(request);
    if (!uuid.test(shipmentOrderId)) {
      throw new BadRequestException({ status: 'invalid_fulfillment' });
    }
    return this.handle(() => service.correct(
      shipmentOrderId, this.idempotencyKey(request), body,
    ));
  }
}
