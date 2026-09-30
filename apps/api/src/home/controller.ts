import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Inject,
  Header, NotFoundException, Param, Post, Put, Req, ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { readToken, requireOrigin } from '../auth/controller.js';
import { AuthRepository } from '../auth/repository.js';
import { DatabaseService } from '../db/service.js';
import { HomeRepository } from './repository.js';
import { PublicHome } from './public.js';
import { parseHomePayload } from './validation.js';

type RequestHeaders = { headers: { cookie?: string; origin?: string } };

@Controller('home')
export class HomePublicController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private home() {
    const pool = this.database.getPool();
    if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    return new PublicHome(pool);
  }

  @Get('content')
  @Header('Cache-Control', 'no-store')
  content() { return this.home().content(); }

  @Get('events/:id')
  @Header('Cache-Control', 'no-store')
  event(@Param('id') id: string) { return this.home().event(id); }
}

@Controller('home/admin')
export class HomeAdminController {
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

  @Get('draft')
  async getDraft(@Req() request: RequestHeaders) {
    await this.admin(request);
    return new HomeRepository(this.pool()).getDraft();
  }

  @Put('draft')
  async saveDraft(@Req() request: RequestHeaders, @Body() body: unknown) {
    requireOrigin(request);
    const actor = await this.admin(request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException();
    const input = body as Record<string, unknown>;
    if (!Number.isInteger(input.version) || (input.version as number) < 1) throw new BadRequestException();
    let payload;
    try { payload = parseHomePayload(input.payload); }
    catch { throw new BadRequestException({ status: 'invalid_home_payload' }); }
    try { return await new HomeRepository(this.pool()).saveDraft(actor, input.version as number, payload); }
    catch (error) {
      if (error instanceof Error && error.message === 'Home draft version conflict') {
        throw new ConflictException({ status: 'home_draft_version_conflict' });
      }
      throw error;
    }
  }

  @Get('preview')
  async preview(@Req() request: RequestHeaders) {
    await this.admin(request);
    return new HomeRepository(this.pool()).preview();
  }

  @Post('publish')
  async publish(@Req() request: RequestHeaders, @Body() body: unknown) {
    requireOrigin(request);
    const actor = await this.admin(request);
    const version = body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).version : undefined;
    if (!Number.isInteger(version) || (version as number) < 1) throw new BadRequestException();
    try { return await new HomeRepository(this.pool()).publish(actor, version as number); }
    catch (error) {
      if (error instanceof Error && error.message === 'Home draft version conflict') throw new ConflictException();
      if (error instanceof Error && ['Invalid home publication targets', 'Invalid payload'].includes(error.message)) {
        throw new BadRequestException({ status: 'invalid_home_publication', reason: error.message });
      }
      throw error;
    }
  }

  @Get('history')
  async history(@Req() request: RequestHeaders) {
    await this.admin(request);
    return new HomeRepository(this.pool()).history();
  }

  @Post('restore/:publicationId')
  async restore(@Req() request: RequestHeaders, @Param('publicationId') publicationId: string) {
    requireOrigin(request);
    const actor = await this.admin(request);
    try { return await new HomeRepository(this.pool()).restore(actor, publicationId); }
    catch (error) {
      if (error instanceof Error && error.message === 'Invalid home publication id') throw new BadRequestException();
      if (error instanceof Error && error.message === 'Home publication not found') throw new NotFoundException();
      throw error;
    }
  }
}
