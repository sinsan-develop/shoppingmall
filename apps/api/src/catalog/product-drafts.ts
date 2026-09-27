import { and, asc, eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { canAccess, type AccessContext } from '../access.js';
import * as schema from '../db/schema.js';
import type { ImageQuarantine } from './image-quarantine.js';

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
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.categoryId) ||
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
  private readonly pool: Pool;

  constructor(pool: Pool) { this.db = drizzle(pool, { schema }); this.pool = pool; }

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

  async update(actor: AccessContext, productId: string, revisionId: string, input: DraftInput) {
    if (!actor.sellerId || !canAccess(actor, 'request-proposal', { sellerId: actor.sellerId })) {
      throw new Error('Forbidden');
    }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(productId) || !uuid.test(revisionId)) throw new Error('Invalid proposal target');
    const data = validate(input);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const target = await client.query<{ seller_id: string; status: string; category_id: string }>(
        `SELECT p.seller_id,p.category_id,r.status FROM products p JOIN product_revisions r ON r.product_id=p.id
         WHERE p.id=$1 AND r.id=$2 FOR UPDATE OF p,r`, [productId, revisionId],
      );
      if (target.rows[0]?.seller_id !== actor.sellerId) throw new Error('Forbidden');
      if (target.rows[0].status !== 'draft') throw new Error('Draft required');
      const category = await client.query<{ parent_id: string | null }>(
        'SELECT parent_id FROM product_categories WHERE id=$1', [data.categoryId],
      );
      if (!category.rows[0]?.parent_id) throw new Error('Minor category required');
      if (target.rows[0].category_id !== data.categoryId) {
        const published = await client.query('SELECT 1 FROM product_publications WHERE product_id=$1', [productId]);
        if (published.rowCount) throw new Error('Published category cannot change');
      }
      const current = await client.query<{ id: string; name: string }>(
        'SELECT id,name FROM product_options WHERE revision_id=$1 FOR UPDATE', [revisionId],
      );
      const retained = new Set(data.options.map((option) => option.name));
      for (const option of current.rows) {
        if (retained.has(option.name)) continue;
        const dependencies = await client.query<{ total: number }>(
          `SELECT ((SELECT count(*) FROM inventory_levels WHERE option_id=$1) +
                   (SELECT count(*) FROM stock_change_requests WHERE option_id=$1))::int AS total`, [option.id],
        );
        if (dependencies.rows[0].total > 0) throw new Error('Stocked option cannot be removed');
        await client.query('DELETE FROM product_options WHERE id=$1', [option.id]);
      }
      for (const [index, option] of data.options.entries()) {
        const existing = current.rows.find((item) => item.name === option.name);
        if (existing) {
          await client.query('UPDATE product_options SET price_won=$2,display_order=$3 WHERE id=$1',
            [existing.id, option.priceWon, index]);
        } else {
          await client.query(
            'INSERT INTO product_options(revision_id,name,price_won,display_order) VALUES ($1,$2,$3,$4)',
            [revisionId, option.name, option.priceWon, index],
          );
        }
      }
      await client.query('UPDATE products SET category_id=$2 WHERE id=$1', [productId, data.categoryId]);
      await client.query(
        `UPDATE product_revisions SET title=$2,description=$3,origin_label=$4,shipping_mode=$5 WHERE id=$1`,
        [revisionId, data.title, data.description, data.originLabel, data.shippingMode],
      );
      await client.query(
        `INSERT INTO audit_events(actor_account_id,active_role,seller_id,action,target_type,target_id)
         VALUES ($1,'seller',$2,'product.draft_update','product_revision',$3)`,
        [actor.accountId, actor.sellerId, revisionId],
      );
      await client.query('COMMIT');
      return { productId, revisionId, status: 'draft' as const };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async getEditable(actor: AccessContext, productId: string, revisionId: string) {
    if (!actor.sellerId || !canAccess(actor, 'request-proposal', { sellerId: actor.sellerId })) {
      throw new Error('Forbidden');
    }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(productId) || !uuid.test(revisionId)) throw new Error('Invalid proposal target');
    const target = await this.pool.query<{
      sellerId: string; status: string; categoryId: string; title: string; description: string;
      originLabel: string; shippingMode: 'seller_direct' | 'owool_fulfillment';
    }>(
      `SELECT p.seller_id AS "sellerId",p.category_id AS "categoryId",r.status,r.title,r.description,
              r.origin_label AS "originLabel",r.shipping_mode AS "shippingMode"
       FROM products p JOIN product_revisions r ON r.product_id=p.id
       WHERE p.id=$1 AND r.id=$2`, [productId, revisionId],
    );
    if (target.rows[0]?.sellerId !== actor.sellerId) throw new Error('Forbidden');
    if (target.rows[0].status !== 'draft') throw new Error('Draft required');
    const options = await this.pool.query<{ name: string; priceWon: number }>(
      'SELECT name,price_won AS "priceWon" FROM product_options WHERE revision_id=$1 ORDER BY display_order,id',
      [revisionId],
    );
    const row = target.rows[0];
    return { categoryId: row.categoryId, title: row.title, description: row.description,
      originLabel: row.originLabel, shippingMode: row.shippingMode, options: options.rows };
  }

  async deleteDraft(actor: AccessContext, productId: string, revisionId: string) {
    if (!actor.sellerId || !canAccess(actor, 'request-proposal', { sellerId: actor.sellerId })) {
      throw new Error('Forbidden');
    }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(productId) || !uuid.test(revisionId)) throw new Error('Invalid proposal target');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const target = await client.query<{ seller_id: string; status: string }>(
        `SELECT p.seller_id,r.status FROM products p JOIN product_revisions r ON r.product_id=p.id
         WHERE p.id=$1 AND r.id=$2 FOR UPDATE OF p,r`, [productId, revisionId],
      );
      if (target.rows[0]?.seller_id !== actor.sellerId) throw new Error('Forbidden');
      if (target.rows[0].status !== 'draft') throw new Error('Draft required');
      const dependencies = await client.query<{
        images: number; stock: number; requests: number; publications: number; revisions: number;
      }>(
        `SELECT
          (SELECT count(*)::int FROM product_images WHERE revision_id=$2) AS images,
          (SELECT count(*)::int FROM inventory_levels i JOIN product_options o ON o.id=i.option_id
            WHERE o.revision_id=$2) AS stock,
          (SELECT count(*)::int FROM stock_change_requests q JOIN product_options o ON o.id=q.option_id
            WHERE o.revision_id=$2) AS requests,
          (SELECT count(*)::int FROM product_publications WHERE product_id=$1) AS publications,
          (SELECT count(*)::int FROM product_revisions WHERE product_id=$1 AND id<>$2) AS revisions`,
        [productId, revisionId],
      );
      if (Object.values(dependencies.rows[0]).some((count) => count > 0)) {
        throw new Error('Protected draft data');
      }
      await client.query('DELETE FROM product_options WHERE revision_id=$1', [revisionId]);
      await client.query('DELETE FROM product_revisions WHERE id=$1', [revisionId]);
      await client.query('DELETE FROM products WHERE id=$1', [productId]);
      await client.query(
        `INSERT INTO audit_events(actor_account_id,active_role,seller_id,action,target_type,target_id)
         VALUES ($1,'seller',$2,'product.draft_delete','product',$3)`,
        [actor.accountId, actor.sellerId, productId],
      );
      await client.query('COMMIT');
      return { productId, status: 'deleted' as const };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
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

  async addImage(actor: AccessContext, productId: string, revisionId: string,
    purpose: 'thumbnail' | 'detail', bytes: Buffer, declaredMimeType: string, store: ImageQuarantine) {
    if (!actor.sellerId || !canAccess(actor, 'request-proposal', { sellerId: actor.sellerId })) {
      throw new Error('Forbidden');
    }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(productId) || !uuid.test(revisionId) || !['thumbnail', 'detail'].includes(purpose)) {
      throw new Error('Invalid image target');
    }
    const client = await this.pool.connect();
    let objectKey: string | undefined;
    try {
      await client.query('BEGIN');
      const owned = await client.query<{ seller_id: string; status: string }>(
        `SELECT p.seller_id,r.status FROM product_revisions r
         JOIN products p ON p.id=r.product_id WHERE p.id=$1 AND r.id=$2 FOR UPDATE OF r`,
        [productId, revisionId],
      );
      if (owned.rows[0]?.seller_id !== actor.sellerId) throw new Error('Forbidden');
      if (owned.rows[0].status !== 'draft') throw new Error('Draft required');
      const count = await client.query<{ total: number }>(
        'SELECT count(*)::int AS total FROM product_images WHERE revision_id=$1', [revisionId],
      );
      if (count.rows[0].total >= 10) throw new Error('Image limit reached');
      const saved = await store.put(bytes, declaredMimeType);
      objectKey = saved.objectKey;
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO product_images (revision_id,object_key,purpose,mime_type,size_bytes,display_order)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [revisionId, objectKey, purpose, saved.mimeType, saved.sizeBytes, count.rows[0].total],
      );
      await client.query(
        `INSERT INTO audit_events (actor_account_id,active_role,seller_id,action,target_type,target_id)
         VALUES ($1,'seller',$2,'product.image_stage','product_image',$3)`,
        [actor.accountId, actor.sellerId, inserted.rows[0].id],
      );
      await client.query('COMMIT');
      return { id: inserted.rows[0].id, ...saved };
    } catch (error) {
      await client.query('ROLLBACK');
      if (objectKey) {
        try { await store.remove(objectKey); }
        catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Image rollback left a quarantined file'); }
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async listImages(actor: AccessContext, productId: string, revisionId: string) {
    if (!actor.sellerId || !canAccess(actor, 'request-proposal', { sellerId: actor.sellerId })) {
      throw new Error('Forbidden');
    }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(productId) || !uuid.test(revisionId)) throw new Error('Invalid image target');
    const owned = await this.pool.query(
      `SELECT 1 FROM product_revisions r JOIN products p ON p.id=r.product_id
       WHERE p.id=$1 AND r.id=$2 AND p.seller_id=$3`, [productId, revisionId, actor.sellerId],
    );
    if (!owned.rowCount) throw new Error('Forbidden');
    const images = await this.pool.query<{
      id: string; purpose: 'thumbnail' | 'detail'; mimeType: string; sizeBytes: number; displayOrder: number;
    }>(
      `SELECT id,purpose,mime_type AS "mimeType",size_bytes AS "sizeBytes",display_order AS "displayOrder"
       FROM product_images WHERE revision_id=$1 ORDER BY display_order,id`, [revisionId],
    );
    return images.rows;
  }

  async submit(actor: AccessContext, productId: string, revisionId: string) {
    if (!actor.sellerId || !canAccess(actor, 'request-proposal', { sellerId: actor.sellerId })) {
      throw new Error('Forbidden');
    }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(productId) || !uuid.test(revisionId)) throw new Error('Invalid proposal target');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ seller_id: string; status: string }>(
        `SELECT p.seller_id,r.status FROM product_revisions r JOIN products p ON p.id=r.product_id
         WHERE p.id=$1 AND r.id=$2 FOR UPDATE OF r`, [productId, revisionId],
      );
      if (result.rows[0]?.seller_id !== actor.sellerId) throw new Error('Forbidden');
      if (result.rows[0].status !== 'draft') throw new Error('Draft required');
      const requirements = await client.query<{ thumbnails: number; options: number }>(
        `SELECT
          (SELECT count(*)::int FROM product_images WHERE revision_id=$1 AND purpose='thumbnail') AS thumbnails,
          (SELECT count(*)::int FROM product_options WHERE revision_id=$1) AS options`, [revisionId],
      );
      if (!requirements.rows[0].thumbnails || !requirements.rows[0].options) {
        throw new Error('Thumbnail and option required');
      }
      await client.query(
        `UPDATE product_revisions SET status='pending',proposed_at=now() WHERE id=$1`, [revisionId],
      );
      await client.query(
        `INSERT INTO audit_events (actor_account_id,active_role,seller_id,action,target_type,target_id)
         VALUES ($1,'seller',$2,'product.proposal_submit','product_revision',$3)`,
        [actor.accountId, actor.sellerId, revisionId],
      );
      await client.query('COMMIT');
      return { productId, revisionId, status: 'pending' as const };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
