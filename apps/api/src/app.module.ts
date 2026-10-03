import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { DatabaseService } from './db/service.js';
import { AuthController } from './auth/controller.js';
import { CustomerController } from './customer/controller.js';
import { CatalogController } from './catalog/controller.js';
import { ShippingController } from './shipping/controller.js';
import { HomeAdminController, HomePublicController } from './home/controller.js';
import { CustomerCartController } from './checkout/cart.controller.js';
import { AdminReservationController, CustomerReservationController } from './checkout/reservation.controller.js';
import { PromotionAdminController } from './promotions/admin.controller.js';
import { CustomerPromotionController } from './promotions/customer.controller.js';

@Module({ controllers: [HealthController, AuthController, CustomerController, CustomerCartController,
  CustomerReservationController, AdminReservationController, CatalogController, ShippingController,
  HomeAdminController, HomePublicController, PromotionAdminController, CustomerPromotionController],
  providers: [DatabaseService] })
export class AppModule {}
