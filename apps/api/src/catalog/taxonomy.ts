import { asc, eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { canAccess, type AccessContext } from '../access.js';
import * as schema from '../db/schema.js';

function requireAdmin(actor: AccessContext) {
  if (!canAccess(actor, 'manage-taxonomy', {})) throw new Error('Forbidden');
}

function cleanName(value: string): string {
  if (typeof value !== 'string') throw new Error('Invalid name');
  const name = value.trim();
  if (!name || name.length > 80) throw new Error('Invalid name');
  return name;
}

export class CatalogTaxonomy {
  private readonly db: NodePgDatabase<typeof schema>;

  constructor(pool: Pool) {
    this.db = drizzle(pool, { schema });
  }

  async listProductCategories() {
    return this.db.select({
      id: schema.productCategories.id,
      parentId: schema.productCategories.parentId,
      name: schema.productCategories.name,
      displayOrder: schema.productCategories.displayOrder,
    }).from(schema.productCategories)
      .orderBy(asc(schema.productCategories.displayOrder), asc(schema.productCategories.name));
  }

  async listSellerCategories() {
    return this.db.select({
      id: schema.sellerCategories.id,
      name: schema.sellerCategories.name,
      displayOrder: schema.sellerCategories.displayOrder,
    }).from(schema.sellerCategories)
      .orderBy(asc(schema.sellerCategories.displayOrder), asc(schema.sellerCategories.name));
  }

  async listSellers() {
    return this.db.select({
      id: schema.sellers.id,
      categoryId: schema.sellers.categoryId,
      displayName: schema.sellers.displayName,
    }).from(schema.sellers).orderBy(asc(schema.sellers.displayName));
  }

  async createMajor(actor: AccessContext, input: string): Promise<string> {
    requireAdmin(actor);
    const name = cleanName(input);
    return this.db.transaction(async (tx) => {
      const [item] = await tx.insert(schema.productCategories).values({ name }).returning({ id: schema.productCategories.id });
      await tx.insert(schema.auditEvents).values({
        actorAccountId: actor.accountId, activeRole: 'admin', action: 'category.create_major',
        targetType: 'product_category', targetId: item.id,
      });
      return item.id;
    });
  }

  async createMinor(actor: AccessContext, parentId: string, input: string): Promise<string> {
    requireAdmin(actor);
    const name = cleanName(input);
    return this.db.transaction(async (tx) => {
      const [parent] = await tx.select({ parentId: schema.productCategories.parentId }).from(schema.productCategories)
        .where(eq(schema.productCategories.id, parentId)).limit(1);
      if (!parent || parent.parentId !== null) {
        throw new Error('Parent must be a major category');
      }
      const [item] = await tx.insert(schema.productCategories).values({ parentId, name })
        .returning({ id: schema.productCategories.id });
      await tx.insert(schema.auditEvents).values({
        actorAccountId: actor.accountId, activeRole: 'admin', action: 'category.create_minor',
        targetType: 'product_category', targetId: item.id,
      });
      return item.id;
    });
  }

  async createSellerCategory(actor: AccessContext, input: string): Promise<string> {
    requireAdmin(actor);
    const name = cleanName(input);
    return this.db.transaction(async (tx) => {
      const [item] = await tx.insert(schema.sellerCategories).values({ name })
        .returning({ id: schema.sellerCategories.id });
      await tx.insert(schema.auditEvents).values({
        actorAccountId: actor.accountId, activeRole: 'admin', action: 'seller_category.create',
        targetType: 'seller_category', targetId: item.id,
      });
      return item.id;
    });
  }

  async registerSeller(actor: AccessContext, categoryId: string, input: string): Promise<string> {
    requireAdmin(actor);
    const displayName = cleanName(input);
    return this.db.transaction(async (tx) => {
      const [category] = await tx.select({ id: schema.sellerCategories.id }).from(schema.sellerCategories)
        .where(eq(schema.sellerCategories.id, categoryId)).limit(1);
      if (!category) throw new Error('Seller category not found');
      const [seller] = await tx.insert(schema.sellers).values({ categoryId, displayName })
        .returning({ id: schema.sellers.id });
      await tx.insert(schema.auditEvents).values({
        actorAccountId: actor.accountId, activeRole: 'admin', action: 'seller.create',
        targetType: 'seller', targetId: seller.id,
      });
      return seller.id;
    });
  }
}
