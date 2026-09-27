import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Inject,
  NotFoundException, Param, Patch, Post, Req, ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { readToken, requireOrigin } from '../auth/controller.js';
import { AuthRepository } from '../auth/repository.js';
import { DatabaseService } from '../db/service.js';
import { ShippingPolicies } from './service.js';

type RequestHeaders = { headers: { cookie?: string; origin?: string } };

@Controller('shipping')
export class ShippingController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private policies() {
    const pool = this.database.getPool();
    if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    return new ShippingPolicies(pool);
  }

  private async actor(request: RequestHeaders) {
    const token = readToken(request.headers.cookie);
    if (!token) throw new UnauthorizedException();
    const pool = this.database.getPool();
    if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    const actor = await new AuthRepository(pool).getSession(token);
    if (!actor) throw new UnauthorizedException();
    return actor;
  }

  private static rethrow(error: unknown): never {
    if (error instanceof Error) {
      if (['Invalid shipping policy', 'Invalid policy locks', 'Invalid seller target',
        'Invalid shipping request', 'Review reason required'].includes(error.message)) {
        throw new BadRequestException({ status: 'invalid_shipping_policy', reason: error.message });
      }
      if (error.message === 'Seller not found') throw new NotFoundException();
      if (['Pending shipping request exists', 'Pending shipping request required'].includes(error.message)) {
        throw new ConflictException({ status: 'shipping_request_conflict', reason: error.message });
      }
      if (error.message === 'Forbidden') throw new ForbiddenException();
    }
    throw error;
  }

  @Get('sellers/:sellerId/policy')
  async effective(@Param('sellerId') sellerId: string) {
    try { return await this.policies().getEffective(sellerId); }
    catch (error) { ShippingController.rethrow(error); }
  }

  @Get('seller/policy')
  async ownPolicy(@Req() request: RequestHeaders) {
    const actor = await this.actor(request);
    if (actor.role !== 'seller' || !actor.sellerId) throw new ForbiddenException();
    return this.policies().getEffective(actor.sellerId);
  }

  @Get('seller/requests')
  async ownRequests(@Req() request: RequestHeaders) {
    const actor = await this.actor(request);
    if (actor.role !== 'seller') throw new ForbiddenException();
    return this.policies().listOwn(actor);
  }

  @Post('seller/requests')
  async submit(@Req() request: RequestHeaders, @Body() body: unknown) {
    requireOrigin(request);
    const actor = await this.actor(request);
    if (actor.role !== 'seller') throw new ForbiddenException();
    const policy = body && typeof body === 'object' ? (body as Record<string, unknown>).policy : undefined;
    try { return await this.policies().requestSeller(actor, policy); }
    catch (error) { ShippingController.rethrow(error); }
  }

  @Get('admin/global')
  async global(@Req() request: RequestHeaders) {
    const actor = await this.actor(request);
    if (actor.role !== 'admin') throw new ForbiddenException();
    return this.policies().getGlobal();
  }

  @Patch('admin/global')
  async updateGlobal(@Req() request: RequestHeaders, @Body() body: unknown) {
    requireOrigin(request);
    const actor = await this.actor(request);
    if (actor.role !== 'admin') throw new ForbiddenException();
    const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    try { return await this.policies().updateGlobal(actor, input.policy, input.locks); }
    catch (error) { ShippingController.rethrow(error); }
  }

  @Get('admin/requests')
  async pending(@Req() request: RequestHeaders) {
    const actor = await this.actor(request);
    if (actor.role !== 'admin') throw new ForbiddenException();
    return this.policies().listPending(actor);
  }

  @Post('admin/requests/:requestId/approve')
  async approve(@Req() request: RequestHeaders, @Param('requestId') requestId: string) {
    requireOrigin(request);
    const actor = await this.actor(request);
    if (actor.role !== 'admin') throw new ForbiddenException();
    try { return await this.policies().approve(actor, requestId); }
    catch (error) { ShippingController.rethrow(error); }
  }

  @Post('admin/requests/:requestId/reject')
  async reject(@Req() request: RequestHeaders, @Param('requestId') requestId: string, @Body() body: unknown) {
    requireOrigin(request);
    const actor = await this.actor(request);
    if (actor.role !== 'admin') throw new ForbiddenException();
    const reason = body && typeof body === 'object' ? (body as Record<string, unknown>).reason : undefined;
    try { return await this.policies().reject(actor, requestId, reason as string); }
    catch (error) { ShippingController.rethrow(error); }
  }
}
