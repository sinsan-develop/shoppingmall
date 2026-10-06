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
import { CustomerOrderController } from './orders/customer.controller.js';
import { AdminRefundController } from './refunds/admin.controller.js';
import { CustomerRefundController } from './refunds/customer.controller.js';
import { SellerFulfillmentController } from './fulfillment/seller.controller.js';
import { AdminFulfillmentController } from './fulfillment/admin.controller.js';
import { AdminSupportQuestionController, CustomerSupportQuestionController,
  PublicSupportQuestionController, SellerSupportQuestionController } from './support/questions.controller.js';
import { CustomerSupportConfirmationController } from './support/confirmations.controller.js';

@Module({ controllers: [HealthController, AuthController, CustomerController, CustomerCartController,
  CustomerReservationController, AdminReservationController, CatalogController, ShippingController,
  HomeAdminController, HomePublicController, PromotionAdminController, CustomerPromotionController,
  CustomerOrderController, CustomerRefundController, AdminRefundController,
  SellerFulfillmentController, AdminFulfillmentController, CustomerSupportQuestionController,
  SellerSupportQuestionController, AdminSupportQuestionController, PublicSupportQuestionController,
  CustomerSupportConfirmationController],
  providers: [DatabaseService] })
export class AppModule {}
