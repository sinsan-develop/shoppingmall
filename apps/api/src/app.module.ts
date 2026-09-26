import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { DatabaseService } from './db/service.js';
import { AuthController } from './auth/controller.js';

@Module({ controllers: [HealthController, AuthController], providers: [DatabaseService] })
export class AppModule {}
