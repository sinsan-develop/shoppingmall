import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { DatabaseService } from './db/service.js';
import { AuthController } from './auth/controller.js';
import { CustomerController } from './customer/controller.js';

@Module({ controllers: [HealthController, AuthController, CustomerController], providers: [DatabaseService] })
export class AppModule {}
