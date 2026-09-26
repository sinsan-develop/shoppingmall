import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { hasAccountSchema } from './readiness.js';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 1000 })
    : undefined;

  async isReady(): Promise<boolean> {
    if (!this.pool) return false;
    return hasAccountSchema(() => this.pool!.query<{ ready: boolean }>(
      "SELECT to_regclass('public.accounts') IS NOT NULL AS ready",
    ));
  }

  getPool(): Pool | undefined {
    return this.pool;
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }
}
