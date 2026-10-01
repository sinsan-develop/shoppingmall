import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException,
  Get, Inject, Param, Put, Req, ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { readToken, requireOrigin } from '../auth/controller.js';
import { AuthRepository } from '../auth/repository.js';
import { DatabaseService } from '../db/service.js';
import { CustomerCart } from './customer-cart.js';

type RequestHeaders = { headers: { cookie?: string; origin?: string } };

function translateCartError(error: unknown): never {
  if (error instanceof Error) {
    if (['Invalid cart selection', 'Invalid account', 'Cart option limit exceeded'].includes(error.message)) {
      throw new BadRequestException();
    }
    if (['Unavailable cart selection', 'Insufficient stock', 'Empty cart'].includes(error.message)) {
      throw new ConflictException();
    }
    if (error.message === 'Missing account') throw new UnauthorizedException();
  }
  if (error && typeof error === 'object' && 'code' in error && error.code === '42P01') {
    throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
  }
  throw error;
}

@Controller('customer/cart')
export class CustomerCartController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private async context(request: RequestHeaders) {
    const token = readToken(request.headers.cookie);
    if (!token) throw new UnauthorizedException();
    const pool = this.database.getPool();
    if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    const actor = await new AuthRepository(pool).getSession(token);
    if (!actor) throw new UnauthorizedException();
    if (actor.role !== 'customer') throw new ForbiddenException();
    return { accountId: actor.accountId, cart: new CustomerCart(pool) };
  }

  @Get()
  async list(@Req() request: RequestHeaders) {
    const { accountId, cart } = await this.context(request);
    try { return await cart.list(accountId); } catch (error) { translateCartError(error); }
  }

  @Get('quote')
  async quote(@Req() request: RequestHeaders) {
    const { accountId, cart } = await this.context(request);
    try { return await cart.quote(accountId); } catch (error) { translateCartError(error); }
  }

  @Put('items/:optionId')
  async set(@Req() request: RequestHeaders, @Param('optionId') optionId: string, @Body() body: unknown) {
    requireOrigin(request);
    const { accountId, cart } = await this.context(request);
    if (!body || typeof body !== 'object' || !('quantity' in body)) throw new BadRequestException();
    try {
      await cart.set(accountId, optionId, (body as { quantity: number }).quantity);
      return await cart.list(accountId);
    } catch (error) { translateCartError(error); }
  }

  @Delete('items/:optionId')
  async remove(@Req() request: RequestHeaders, @Param('optionId') optionId: string) {
    requireOrigin(request);
    const { accountId, cart } = await this.context(request);
    try {
      await cart.remove(accountId, optionId);
      return await cart.list(accountId);
    } catch (error) { translateCartError(error); }
  }
}
