import { and, asc, eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { canAccess, type AccessContext } from '../access.js';
import * as schema from '../db/schema.js';

export type DraftInput = {
  categoryId: string;
  title: string;
  description: string;
  originLabel: string;
  shippingMode: 'seller_direct' | 'owool_fulfillment';
  options: { name: string; priceWon: number }[];
};

function clean(value: string, maxLength: number): string {
  if (typeof value !== 'string') throw new Error('Invalid product');
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) throw new Error('Invalid product');
  return trimmed;
}

function validate(input: DraftInput) {
  if (!input || typeof input !== 'object' || typeof input.categoryId !== 'string' ||
      !['seller_direct', 'owool_fulfillment'].includes(input.shippingMode)) throw new Error('Invalid product');
  const title = clean(input.title, 160);
  const description = clean(input.description, 10000);
  const originLabel = clean(input.originLabel, 120);
  if (!Array.isArray(input.options) || input.options.length < 1 || input.options.length > 20) {
    throw new Error('Option required');
  }
  const names = new Set<string>();
  const options = input.options.map((option) => {
    if (!option || typeof option !== 'object' || typeof option.name !== 'string' ||
        !Number.isInteger(option.priceWon) || option.priceWon < 0 || option.priceWon > 1_000_000_000) {
      throw new Error('Invalid option');
    }
    const name = option.name.trim();
    if (!name || name.length > 80 || names.has(name)) throw new Error('Invalid option');
    names.add(name);
    return { name, priceWon: option.priceWon };
  });
  return { categoryId: input.categoryId, title, description, originLabel, shippingMode: input.shippingMode, options };
}

/** Actor must come from a verified session; never from a client role or sellerId header. */
export class ProductDrafts {
  private readonly db: NodePgDatabase<typeof schema>;

  constructor(pool: Pool) { this.db = drizzle(pool, { schema }); }

  async create(actor: AccessContext, input: DraftInput) {
    if (!actor.sellerId || !canAccess(actor, 'request-proposal', { sellerId: actor.sellerId })) {
      throw new Error('Forbidden');
    }
    const data = validate(input);
    return this.db.transaction(async (tx) => {
      const [category] = await tx.select({ parentId: schema.productCategories.parentId })
        .from(schema.productCategories).where(eq(schema.productCategories.id, data.categoryId)).limit(1);
      if (!category || !category.parentId) throw new Error('Minor category required');
      const [product] = await tx.insert(schema.products).values({
        sellerId: actor.sellerId!, categoryId: data.categoryId,
      }).returning({ id: schema.products.id });
      const [revision] = await tx.insert(schema.productRevisions).values({
        productId: product.id, version: 1, title: data.title, description: data.description,
        originLabel: data.originLabel, shippingMode: data.shippingMode,
        status: 'draft', proposedByAccountId: actor.accountId,
      }).returning({ id: schema.productRevisions.id });
      await tx.insert(schema.productOptions).values(data.options.map((option, index) => ({
        revisionId: revision.id, name: option.name, priceWon: option.priceWon, displayOrder: index,
      })));
      await tx.insert(schema.auditEvents).values({
        actorAccountId: actor.accountId, activeRole: 'seller', sellerId: actor.sellerId,
        action: 'product.draft_create', targetType: 'product', targetId: product.id,
      });
      return { productId: product.id, revisionId: revision.id };
    });
  }

  async listOwned(actor: AccessContext) {
    if (!actor.sellerId || !canAccess(actor, 'request-proposal', { sellerId: actor.sellerId })) {
      throw new Error('Forbidden');
    }
    return this.db.select({
      productId: schema.products.id,
      revisionId: schema.productRevisions.id,
      title: schema.productRevisions.title,
      status: schema.productRevisions.status,
      categoryId: schema.products.categoryId,
    }).from(schema.products)
      .innerJoin(schema.productRevisions, eq(schema.productRevisions.productId, schema.products.id))
      .where(and(eq(schema.products.sellerId, actor.sellerId), eq(schema.productRevisions.version, 1)))
      .orderBy(asc(schema.productRevisions.proposedAt));
  }
}
