import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException,
  Get, Inject, NotFoundException, Param, Post, Req, ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { readToken, requireOrigin } from '../auth/controller.js';
import { AuthRepository } from '../auth/repository.js';
import { DatabaseService } from '../db/service.js';
import { quoteReservation } from './reservation-quote.js';
import { CheckoutReservations, type ReservationView } from './reservation-service.js';

type RequestHeaders = { headers: { cookie?: string; origin?: string; 'idempotency-key'?: string } };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function translate(error: unknown): never {
  if (error instanceof Error) {
    if (['Invalid reservation request', 'Cancel reason required', 'Invalid cart selection'].includes(error.message)) {
      throw new BadRequestException();
    }
    if (['Active reservation exists', 'Unavailable cart selection', 'Insufficient stock',
      'Reservation unavailable', 'Reserved product changed'].includes(error.message)) {
      throw new ConflictException({ status: 'reservation_conflict', reason: error.message });
    }
  }
  if (error && typeof error === 'object' && 'code' in error && error.code === '42P01') {
    throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
  }
  throw error;
}

async function context(database: DatabaseService, request: RequestHeaders, role: 'customer' | 'admin') {
  const token = readToken(request.headers.cookie);
  if (!token) throw new UnauthorizedException();
  const pool = database.getPool();
  if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
  const actor = await new AuthRepository(pool).getSession(token);
  if (!actor) throw new UnauthorizedException();
  if (actor.role !== role) throw new ForbiddenException();
  return { pool, accountId: actor.accountId, reservations: new CheckoutReservations(pool) };
}

async function withQuote(pool: NonNullable<ReturnType<DatabaseService['getPool']>>,
  accountId: string, view: ReservationView) {
  return view.status === 'ACTIVE' ?
    { ...view, quote: await quoteReservation(pool, accountId, view.id) } : view;
}

@Controller('customer/checkout/reservations')
export class CustomerReservationController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Post()
  async start(@Req() request: RequestHeaders) {
    requireOrigin(request);
    const { pool, accountId, reservations } = await context(this.database, request, 'customer');
    const key = request.headers['idempotency-key'];
    if (!key || !uuid.test(key)) throw new BadRequestException();
    try { return await withQuote(pool, accountId, await reservations.start(accountId, key)); }
    catch (error) { translate(error); }
  }

  @Get(':id')
  async get(@Req() request: RequestHeaders, @Param('id') id: string) {
    const { pool, accountId, reservations } = await context(this.database, request, 'customer');
    if (!uuid.test(id)) throw new BadRequestException();
    try {
      const view = await reservations.get(accountId, id);
      if (!view) throw new NotFoundException();
      return await withQuote(pool, accountId, view);
    } catch (error) { translate(error); }
  }

  @Delete(':id')
  async release(@Req() request: RequestHeaders, @Param('id') id: string) {
    requireOrigin(request);
    const { accountId, reservations } = await context(this.database, request, 'customer');
    if (!uuid.test(id)) throw new BadRequestException();
    try {
      const view = await reservations.release(accountId, id);
      if (!view) throw new NotFoundException();
      return view;
    } catch (error) { translate(error); }
  }
}

@Controller('checkout/admin/reservations')
export class AdminReservationController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Post(':id/cancel')
  async cancel(@Req() request: RequestHeaders, @Param('id') id: string, @Body() body: unknown) {
    requireOrigin(request);
    const { accountId, reservations } = await context(this.database, request, 'admin');
    if (!uuid.test(id) || !body || typeof body !== 'object') throw new BadRequestException();
    const reason = (body as { reason?: unknown }).reason;
    if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) {
      throw new BadRequestException();
    }
    try {
      const view = await reservations.cancel(accountId, id, reason);
      if (!view) throw new NotFoundException();
      return view;
    } catch (error) { translate(error); }
  }
}
