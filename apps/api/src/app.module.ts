import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { DatabaseService } from './db/service.js';

@Module({ controllers: [HealthController], providers: [DatabaseService] })
export class AppModule {}
