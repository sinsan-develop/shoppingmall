import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

export async function createApp() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.enableCors({
    origin: process.env.WEB_ORIGIN ??
      (process.env.NODE_ENV === 'production' ? false : 'http://127.0.0.1:9091'),
    credentials: true,
  });
  return app;
}
