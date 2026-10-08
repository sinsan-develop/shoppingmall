import { BadRequestException, Controller, ForbiddenException, Get, Header, Inject,
  Query, Req, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { readToken } from '../auth/controller.js';
import { AuthRepository } from '../auth/repository.js';
import { DatabaseService } from '../db/service.js';
import { parseMonitoringQuery } from './query.js';
import { readMonitoring } from './repository.js';

type RequestHeaders = { headers: { cookie?: string } };

@Controller('admin/monitoring')
export class AdminMonitoringController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  async overview(@Req() request: RequestHeaders, @Query() query: Record<string, unknown>) {
    const token = readToken(request.headers.cookie);
    if (!token) throw new UnauthorizedException();
    const pool = this.database.getPool();
    if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    const actor = await new AuthRepository(pool).getSession(token);
    if (!actor) throw new UnauthorizedException();
    if (actor.role !== 'admin') throw new ForbiddenException();
    let filter;
    try { filter = parseMonitoringQuery(query); }
    catch { throw new BadRequestException({ status: 'invalid_monitoring_query' }); }
    return readMonitoring(pool, filter);
  }
}
