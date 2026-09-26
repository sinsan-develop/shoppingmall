import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { healthPayload } from './health.js';
import { DatabaseService } from './db/service.js';

@Controller()
export class HealthController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get('health')
  readHealth() {
    return healthPayload();
  }

  @Get('ready')
  async readReady() {
    if (await this.database.isReady()) return { status: 'ok', dependency: 'database' };
    throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
  }
}
