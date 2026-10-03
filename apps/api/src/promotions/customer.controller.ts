import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Inject,
  NotFoundException, Param, Post, Req, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { readToken, requireOrigin } from '../auth/controller.js';
import { AuthRepository } from '../auth/repository.js';
import { DatabaseService } from '../db/service.js';
import { CustomerPromotionService } from './customer-service.js';

type RequestHeaders = { headers: { cookie?: string; origin?: string } };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('customer')
export class CustomerPromotionController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private async context(request: RequestHeaders) {
    const token = readToken(request.headers.cookie);
    if (!token) throw new UnauthorizedException();
    const pool = this.database.getPool();
    if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    const actor = await new AuthRepository(pool).getSession(token);
    if (!actor) throw new UnauthorizedException();
    if (actor.role !== 'customer') throw new ForbiddenException();
    return { accountId: actor.accountId, service: new CustomerPromotionService(pool) };
  }

  @Get('promotions/coupons')
  async coupons(@Req() request: RequestHeaders) {
    const { accountId, service } = await this.context(request);
    return service.list(accountId);
  }

  @Post('checkout/reservations/:id/promotions/quote')
  async quote(@Req() request: RequestHeaders, @Param('id') id: string, @Body() body: unknown) {
    requireOrigin(request);
    const { accountId, service } = await this.context(request);
    if (!uuid.test(id)) throw new BadRequestException();
    try { return await service.quote(accountId, id, body); }
    catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (['Invalid promotion selection', 'Invalid coupon selector', 'Invalid shipping support'].includes(message))
        throw new BadRequestException();
      if (message === 'Promotion unavailable') throw new NotFoundException();
      if (['Promotion conflict', 'Reservation unavailable', 'Reserved product changed'].includes(message))
        throw new ConflictException({ status: 'promotion_quote_conflict' });
      throw error;
    }
  }
}
