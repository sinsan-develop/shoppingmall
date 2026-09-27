import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException,
  Get, Inject, NotFoundException, Param, Patch, PayloadTooLargeException, Post, Query, Req,
  ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { readToken, requireOrigin } from '../auth/controller.js';
import { AuthRepository } from '../auth/repository.js';
import { DatabaseService } from '../db/service.js';
import { InventoryService } from '../inventory/service.js';
import { ProductDrafts, type DraftInput } from './product-drafts.js';
import { ProductReviews } from './product-reviews.js';
import { ImageQuarantine } from './image-quarantine.js';
import { PublicProducts } from './public-products.js';
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

  private reviews() {
    const pool = this.database.getPool();
    if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    return new ProductReviews(pool);
  }

  private inventory() {
    const pool = this.database.getPool();
    if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    return new InventoryService(pool);
  }

  private requireLocalUpload() {
    const host = process.env.API_HOST ?? '127.0.0.1';
    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_LOCAL_UPLOAD !== '1' ||
        !['127.0.0.1', '::1', 'localhost'].includes(host)) throw new NotFoundException();
  }

  private localUploadStore() {
    const root = process.env.SHOPPINGMALL_UPLOAD_ROOT;
    if (!root) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'upload_store' });
    try { return new ImageQuarantine(root); }
    catch { throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'upload_store' }); }
  }

  private async imageBytes(request: IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of request) {
      const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += part.length;
      if (total > 5 * 1024 * 1024) throw new PayloadTooLargeException();
      chunks.push(part);
    }
    return Buffer.concat(chunks, total);
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

  @Get('products')
  async listPublicProducts(@Query() query: Record<string, unknown>) {
    const pool = this.database.getPool();
    if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    try {
      return await new PublicProducts(pool).list({
        query: query.q as string | undefined,
        categoryId: query.categoryId === '' ? undefined : query.categoryId as string | undefined,
        sellerId: query.sellerId === '' ? undefined : query.sellerId as string | undefined,
        sort: query.sort as string | undefined,
        page: query.page === undefined ? 1 : Number(query.page),
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid search') throw new BadRequestException();
      throw error;
    }
  }

  @Get('products/:productId')
  async getPublicProduct(@Param('productId') productId: string) {
    const pool = this.database.getPool();
    if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    try {
      const product = await new PublicProducts(pool).get(productId);
      if (!product) throw new NotFoundException();
      return product;
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid product target') throw new BadRequestException();
      throw error;
    }
  }

  @Get('seller/products')
  async listOwnedProducts(@Req() request: RequestHeaders) {
    const actor = await this.seller(request);
    return this.drafts().listOwned(actor);
  }

  @Get('seller/products/:productId/revisions/:revisionId')
  async getEditableProductDraft(@Req() request: RequestHeaders,
    @Param('productId') productId: string, @Param('revisionId') revisionId: string) {
    const actor = await this.seller(request);
    try { return await this.drafts().getEditable(actor, productId, revisionId); }
    catch (error) {
      if (error instanceof Error && error.message === 'Invalid proposal target') throw new BadRequestException();
      if (error instanceof Error && error.message === 'Draft required') throw new ConflictException();
      if (error instanceof Error && error.message === 'Forbidden') throw new ForbiddenException();
      throw error;
    }
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

  @Patch('seller/products/:productId/revisions/:revisionId')
  async updateProductDraft(@Req() request: RequestHeaders,
    @Param('productId') productId: string, @Param('revisionId') revisionId: string, @Body() body: unknown) {
    requireOrigin(request);
    const actor = await this.seller(request);
    try { return await this.drafts().update(actor, productId, revisionId, body as DraftInput); }
    catch (error) {
      if (error instanceof Error && [
        'Invalid proposal target', 'Invalid product', 'Invalid option', 'Option required',
        'Minor category required', 'Stocked option cannot be removed',
      ].includes(error.message)) throw new BadRequestException({ status: 'invalid_draft', reason: error.message });
      if (error instanceof Error && error.message === 'Draft required') throw new ConflictException();
      if (error instanceof Error && error.message === 'Forbidden') throw new ForbiddenException();
      throw error;
    }
  }

  @Post('seller/products/:productId/revisions/:revisionId/submit')
  async submitProductDraft(@Req() request: RequestHeaders,
    @Param('productId') productId: string, @Param('revisionId') revisionId: string) {
    requireOrigin(request);
    const actor = await this.seller(request);
    try { return await this.drafts().submit(actor, productId, revisionId); }
    catch (error) {
      if (error instanceof Error && ['Invalid proposal target', 'Draft required', 'Thumbnail and option required'].includes(error.message)) {
        throw new BadRequestException({ status: 'invalid_proposal', reason: error.message });
      }
      if (error instanceof Error && error.message === 'Forbidden') throw new ForbiddenException();
      throw error;
    }
  }

  @Post('seller/products/:productId/revisions/:revisionId/images')
  async stageProductImage(@Req() request: IncomingMessage,
    @Param('productId') productId: string, @Param('revisionId') revisionId: string) {
    this.requireLocalUpload();
    requireOrigin(request);
    const actor = await this.seller(request);
    const store = this.localUploadStore();
    const purpose = request.headers['x-image-purpose'];
    const mimeType = request.headers['content-type'];
    if ((purpose !== 'thumbnail' && purpose !== 'detail') ||
        !['image/png', 'image/jpeg', 'image/webp'].includes(String(mimeType))) {
      throw new BadRequestException({ status: 'invalid_image_headers' });
    }
    const length = Number(request.headers['content-length'] ?? 0);
    if (length > 5 * 1024 * 1024) throw new PayloadTooLargeException();
    const bytes = await this.imageBytes(request);
    try {
      return await this.drafts().addImage(actor, productId, revisionId, purpose, bytes, mimeType!, store);
    } catch (error) {
      if (error instanceof Error && error.message === 'Image too large') throw new PayloadTooLargeException();
      if (error instanceof Error && [
        'Invalid image target', 'Draft required', 'Image limit reached',
        'Unsupported image', 'Image MIME mismatch', 'Invalid image container',
      ].includes(error.message)) throw new BadRequestException({ status: 'invalid_image', reason: error.message });
      if (error instanceof Error && error.message === 'Forbidden') throw new ForbiddenException();
      throw error;
    }
  }

  @Get('seller/products/:productId/revisions/:revisionId/images')
  async listProductImages(@Req() request: RequestHeaders,
    @Param('productId') productId: string, @Param('revisionId') revisionId: string) {
    const actor = await this.seller(request);
    try { return await this.drafts().listImages(actor, productId, revisionId); }
    catch (error) {
      if (error instanceof Error && error.message === 'Invalid image target') throw new BadRequestException();
      if (error instanceof Error && error.message === 'Forbidden') throw new ForbiddenException();
      throw error;
    }
  }

  @Post('seller/options/:optionId/stock')
  async setOptionStock(@Req() request: RequestHeaders, @Param('optionId') optionId: string,
    @Body() body: unknown) {
    requireOrigin(request);
    const actor = await this.seller(request);
    const quantity = body && typeof body === 'object' ? (body as Record<string, unknown>).quantity : undefined;
    try { return await this.inventory().setStock(actor, optionId, quantity as number); }
    catch (error) {
      if (error instanceof Error && ['Invalid stock', 'Invalid stock target'].includes(error.message)) {
        throw new BadRequestException({ status: 'invalid_stock', reason: error.message });
      }
      if (error instanceof Error && error.message === 'Forbidden') throw new ForbiddenException();
      throw error;
    }
  }

  @Get('seller/stock')
  async listSellerStock(@Req() request: RequestHeaders) {
    const actor = await this.seller(request);
    return this.inventory().listOwned(actor);
  }

  @Get('admin/stock-requests')
  async listStockRequests(@Req() request: RequestHeaders) {
    const actor = await this.admin(request);
    return this.inventory().listPending(actor);
  }

  @Post('admin/stock-requests/:requestId/approve')
  async approveStockIncrease(@Req() request: RequestHeaders, @Param('requestId') requestId: string) {
    requireOrigin(request);
    const actor = await this.admin(request);
    try { return await this.inventory().approveIncrease(actor, requestId); }
    catch (error) {
      if (error instanceof Error && error.message === 'Invalid stock request') throw new BadRequestException();
      if (error instanceof Error && error.message === 'Pending stock request required') {
        throw new ConflictException({ status: 'not_pending' });
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

  @Get('admin/proposals')
  async pendingProposals(@Req() request: RequestHeaders) {
    const actor = await this.admin(request);
    return this.reviews().listPending(actor);
  }

  @Post('admin/proposals/:revisionId/reject')
  async rejectProposal(@Req() request: RequestHeaders, @Param('revisionId') revisionId: string,
    @Body() body: unknown) {
    requireOrigin(request);
    const actor = await this.admin(request);
    const reason = body && typeof body === 'object' ? (body as Record<string, unknown>).reason : undefined;
    try { return await this.reviews().reject(actor, revisionId, reason as string); }
    catch (error) {
      if (error instanceof Error && ['Invalid proposal target', 'Review reason required'].includes(error.message)) {
        throw new BadRequestException({ status: 'invalid_review', reason: error.message });
      }
      if (error instanceof Error && error.message === 'Pending proposal required') {
        throw new ConflictException({ status: 'not_pending' });
      }
      throw error;
    }
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
