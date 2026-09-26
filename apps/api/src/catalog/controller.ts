import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException,
  Get, Inject, Post, Req, ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { readToken, requireOrigin } from '../auth/controller.js';
import { AuthRepository } from '../auth/repository.js';
import { DatabaseService } from '../db/service.js';
import { ProductDrafts, type DraftInput } from './product-drafts.js';
import { CatalogTaxonomy } from './taxonomy.js';

type RequestHeaders = { headers: { cookie?: string; origin?: string } };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('catalog')
export class CatalogController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private taxonomy() {
    const pool = this.database.getPool();
    if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    return new CatalogTaxonomy(pool);
  }

  private async admin(request: RequestHeaders) {
    const token = readToken(request.headers.cookie);
    if (!token) throw new UnauthorizedException();
    const pool = this.database.getPool();
    if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    const actor = await new AuthRepository(pool).getSession(token);
    if (!actor) throw new UnauthorizedException();
    if (actor.role !== 'admin') throw new ForbiddenException();
    return actor;
  }

  private async seller(request: RequestHeaders) {
    const token = readToken(request.headers.cookie);
    if (!token) throw new UnauthorizedException();
    const pool = this.database.getPool();
    if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    const actor = await new AuthRepository(pool).getSession(token);
    if (!actor) throw new UnauthorizedException();
    if (actor.role !== 'seller' || !actor.sellerId) throw new ForbiddenException();
    return actor;
  }

  private drafts() {
    const pool = this.database.getPool();
    if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    return new ProductDrafts(pool);
  }

  private name(body: unknown): string {
    if (!body || typeof body !== 'object' || typeof (body as Record<string, unknown>).name !== 'string') {
      throw new BadRequestException();
    }
    const name = (body as { name: string }).name.trim();
    if (!name || name.length > 80) throw new BadRequestException();
    return name;
  }

  private id(body: unknown, key: string): string {
    const value = body && typeof body === 'object' ? (body as Record<string, unknown>)[key] : undefined;
    if (typeof value !== 'string' || !uuidPattern.test(value)) throw new BadRequestException();
    return value;
  }

  private rethrowCatalog(error: unknown): never {
    if (error instanceof Error && ['Invalid name', 'Parent must be a major category', 'Seller category not found'].includes(error.message)) {
      throw new BadRequestException();
    }
    const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : error;
    if (cause && typeof cause === 'object' && 'code' in cause && cause.code === '23505') {
      throw new ConflictException({ status: 'already_exists' });
    }
    throw error;
  }

  @Get('categories')
  listCategories() { return this.taxonomy().listProductCategories(); }

  @Get('seller-categories')
  listSellerCategories() { return this.taxonomy().listSellerCategories(); }

  @Get('sellers')
  listSellers() { return this.taxonomy().listSellers(); }

  @Get('seller/products')
  async listOwnedProducts(@Req() request: RequestHeaders) {
    const actor = await this.seller(request);
    return this.drafts().listOwned(actor);
  }

  @Post('seller/products')
  async createProductDraft(@Req() request: RequestHeaders, @Body() body: unknown) {
    requireOrigin(request);
    const actor = await this.seller(request);
    try { return await this.drafts().create(actor, body as DraftInput); }
    catch (error) {
      if (error instanceof Error && ['Invalid product', 'Invalid option', 'Option required', 'Minor category required'].includes(error.message)) {
        throw new BadRequestException({ status: 'invalid_draft', reason: error.message });
      }
      throw error;
    }
  }

  @Post('admin/majors')
  async createMajor(@Req() request: RequestHeaders, @Body() body: unknown) {
    requireOrigin(request);
    const actor = await this.admin(request);
    try { return { id: await this.taxonomy().createMajor(actor, this.name(body)) }; }
    catch (error) { this.rethrowCatalog(error); }
  }

  @Post('admin/minors')
  async createMinor(@Req() request: RequestHeaders, @Body() body: unknown) {
    requireOrigin(request);
    const actor = await this.admin(request);
    try { return { id: await this.taxonomy().createMinor(actor, this.id(body, 'parentId'), this.name(body)) }; }
    catch (error) { this.rethrowCatalog(error); }
  }

  @Post('admin/seller-categories')
  async createSellerCategory(@Req() request: RequestHeaders, @Body() body: unknown) {
    requireOrigin(request);
    const actor = await this.admin(request);
    try { return { id: await this.taxonomy().createSellerCategory(actor, this.name(body)) }; }
    catch (error) { this.rethrowCatalog(error); }
  }

  @Post('admin/sellers')
  async createSeller(@Req() request: RequestHeaders, @Body() body: unknown) {
    requireOrigin(request);
    const actor = await this.admin(request);
    try { return { id: await this.taxonomy().registerSeller(actor, this.id(body, 'categoryId'), this.name(body)) }; }
    catch (error) { this.rethrowCatalog(error); }
  }
}
