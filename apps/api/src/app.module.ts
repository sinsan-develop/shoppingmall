import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { DatabaseService } from './db/service.js';
import { AuthController } from './auth/controller.js';
import { CustomerController } from './customer/controller.js';
import { CatalogController } from './catalog/controller.js';
import { ShippingController } from './shipping/controller.js';
import { HomeAdminController } from './home/controller.js';

@Module({ controllers: [HealthController, AuthController, CustomerController, CatalogController, ShippingController, HomeAdminController], providers: [DatabaseService] })
export class AppModule {}
