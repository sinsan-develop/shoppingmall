import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Inject,
  NotFoundException, Param, Post, Req, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { readToken, requireOrigin } from '../auth/controller.js';
import { AuthRepository } from '../auth/repository.js';
import { DatabaseService } from '../db/service.js';
import { PromotionAdminService } from './admin-service.js';

type RequestHeaders = { headers: { cookie?: string; origin?: string; 'idempotency-key'?: string } };

@Controller('promotions/admin')
export class PromotionAdminController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private pool() {
    const pool = this.database.getPool();
    if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    return pool;
  }

  private async admin(request: RequestHeaders) {
    const token = readToken(request.headers.cookie);
    if (!token) throw new UnauthorizedException();
    const actor = await new AuthRepository(this.pool()).getSession(token);
    if (!actor) throw new UnauthorizedException();
    if (actor.role !== 'admin') throw new ForbiddenException();
    return actor;
  }

  private async handle<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); }
    catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'Invalid promotion input' || message === 'Invalid promotion account')
        throw new BadRequestException({ status: 'invalid_promotion' });
      if (message === 'Promotion not found') throw new NotFoundException();
      if (['Promotion conflict', 'Promotion stopped', 'Promotion limit reached',
        'Promotion issue unavailable'].includes(message)) throw new ConflictException({ status: 'promotion_conflict' });
      throw error;
    }
  }

  @Get('campaigns')
  async list(@Req() request: RequestHeaders) {
    await this.admin(request);
    return new PromotionAdminService(this.pool()).list();
  }

  @Post('campaigns')
  async create(@Req() request: RequestHeaders, @Body() body: unknown) {
    requireOrigin(request);
    const actor = await this.admin(request);
    return this.handle(() => new PromotionAdminService(this.pool()).create(actor, body));
  }

  @Post('campaigns/:id/versions')
  async version(@Req() request: RequestHeaders, @Param('id') id: string, @Body() body: unknown) {
    requireOrigin(request);
    const actor = await this.admin(request);
    return this.handle(() => new PromotionAdminService(this.pool()).addVersion(actor, id, body));
  }

  @Post('campaigns/:id/stop')
  async stop(@Req() request: RequestHeaders, @Param('id') id: string, @Body() body: unknown) {
    requireOrigin(request);
    const actor = await this.admin(request);
    const reason = body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).reason : undefined;
    return this.handle(() => new PromotionAdminService(this.pool()).stop(actor, id, reason));
  }

  @Post('campaigns/:id/grants')
  async grant(@Req() request: RequestHeaders, @Param('id') id: string, @Body() body: unknown) {
    requireOrigin(request);
    const actor = await this.admin(request);
    const input = body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown> : {};
    return this.handle(() => new PromotionAdminService(this.pool()).issue(actor, id,
      input.accountId, input.reason, request.headers['idempotency-key']));
  }
}
