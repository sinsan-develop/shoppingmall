import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException,
  Get, Inject, NotFoundException, Param, Post, Put, Req, ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { readToken, requireOrigin } from '../auth/controller.js';
import { AuthRepository } from '../auth/repository.js';
import { DatabaseService } from '../db/service.js';
import { CustomerProfile, type AddressInput, type PreferenceInput } from './profile.js';
import { CustomerEngagement } from './engagement.js';

type RequestHeaders = { headers: { cookie?: string; origin?: string } };

@Controller('customer')
export class CustomerController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private async context(request: RequestHeaders) {
    const token = readToken(request.headers.cookie);
    if (!token) throw new UnauthorizedException();
    const pool = this.database.getPool();
    if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    const actor = await new AuthRepository(pool).getSession(token);
    if (!actor) throw new UnauthorizedException();
    if (actor.role !== 'customer') throw new ForbiddenException();
    return { actor, profile: new CustomerProfile(pool), engagement: new CustomerEngagement(pool) };
  }

  @Get('favorites')
  async listFavorites(@Req() request: RequestHeaders) {
    const { actor, engagement } = await this.context(request);
    return engagement.listFavorites(actor);
  }

  @Put('favorites/:productId')
  async addFavorite(@Req() request: RequestHeaders, @Param('productId') productId: string) {
    requireOrigin(request);
    const { actor, engagement } = await this.context(request);
    try {
      return await engagement.addFavorite(actor, productId);
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid product') throw new BadRequestException();
      if (error instanceof Error && error.message === 'Product unavailable') throw new NotFoundException();
      throw error;
    }
  }

  @Delete('favorites/:productId')
  async removeFavorite(@Req() request: RequestHeaders, @Param('productId') productId: string) {
    requireOrigin(request);
    const { actor, engagement } = await this.context(request);
    try {
      return await engagement.removeFavorite(actor, productId);
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid product') throw new BadRequestException();
      throw error;
    }
  }

  @Get('addresses')
  async listAddresses(@Req() request: RequestHeaders) {
    const { actor, profile } = await this.context(request);
    return profile.listAddresses(actor, actor.accountId);
  }

  @Post('addresses')
  async addAddress(@Req() request: RequestHeaders, @Body() body: unknown) {
    requireOrigin(request);
    const { actor, profile } = await this.context(request);
    if (!body || typeof body !== 'object') throw new BadRequestException();
    try {
      const id = await profile.addAddress(actor, actor.accountId, body as AddressInput);
      return { id };
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid address') throw new BadRequestException();
      throw error;
    }
  }

  @Get('preferences')
  async getPreferences(@Req() request: RequestHeaders) {
    const { actor, profile } = await this.context(request);
    return profile.getPreferences(actor, actor.accountId);
  }

  @Put('preferences')
  async setPreferences(@Req() request: RequestHeaders, @Body() body: unknown) {
    requireOrigin(request);
    const { actor, profile } = await this.context(request);
    if (!body || typeof body !== 'object') throw new BadRequestException();
    try {
      await profile.setPreferences(actor, actor.accountId, body as PreferenceInput);
      return { status: 'ok' };
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid preferences') throw new BadRequestException();
      throw error;
    }
  }

  @Post('deletion-request')
  async requestDeletion(@Req() request: RequestHeaders) {
    requireOrigin(request);
    const { actor, profile } = await this.context(request);
    try {
      return await profile.requestDeletion(actor, actor.accountId);
    } catch (error) {
      const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : undefined;
      if (cause && typeof cause === 'object' && 'code' in cause && 'constraint' in cause &&
          cause.code === '23505' && cause.constraint === 'account_deletion_requests_open_uq') {
        throw new ConflictException({ status: 'already_requested' });
      }
      throw error;
    }
  }
}
