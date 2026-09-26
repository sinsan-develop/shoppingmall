import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { healthPayload } from './health.js';

@Controller()
export class HealthController {
  @Get('health')
  readHealth() {
    return healthPayload();
  }

  @Get('ready')
  readReady() {
    throw new ServiceUnavailableException({
      status: 'unavailable',
      dependency: 'database',
    });
  }
}
