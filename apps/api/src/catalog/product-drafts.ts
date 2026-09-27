import { eq } from 'drizzle-orm';
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

  /** A published product gets a separate private draft; neither its public rows nor stock are changed here. */
  async createRevision(actor: AccessContext, productId: string, store: ImageQuarantine) {
    if (!actor.sellerId || !canAccess(actor, 'request-proposal', { sellerId: actor.sellerId })) {
      throw new Error('Forbidden');
    }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(productId)) throw new Error('Invalid proposal target');
    const client = await this.pool.connect();
    const copiedKeys: string[] = [];
    try {
      await client.query('BEGIN');
      const published = await client.query<{
        seller_id: string; revision_id: string; version: number; title: string;
        description: string; origin_label: string; shipping_mode: string;
      }>(
        `SELECT p.seller_id,pub.revision_id,r.version,r.title,r.description,r.origin_label,r.shipping_mode
         FROM products p JOIN product_publications pub ON pub.product_id=p.id
         JOIN product_revisions r ON r.id=pub.revision_id
         WHERE p.id=$1 FOR UPDATE OF p,pub,r`, [productId],
      );
      if (published.rows[0]?.seller_id !== actor.sellerId) throw new Error('Forbidden');
      const source = published.rows[0];
      const existing = await client.query(
        `SELECT 1 FROM product_revisions WHERE product_id=$1 AND status IN ('draft','pending') LIMIT 1`,
        [productId],
      );
      if (existing.rowCount) throw new Error('Active revision already exists');
      const version = await client.query<{ next_version: number }>(
        'SELECT max(version)::int+1 AS next_version FROM product_revisions WHERE product_id=$1', [productId],
      );
      const created = await client.query<{ id: string }>(
        `INSERT INTO product_revisions(product_id,version,title,description,origin_label,shipping_mode,status,proposed_by_account_id)
         VALUES ($1,$2,$3,$4,$5,$6,'draft',$7) RETURNING id`,
        [productId, version.rows[0].next_version, source.title, source.description,
          source.origin_label, source.shipping_mode, actor.accountId],
      );
      const revisionId = created.rows[0].id;
      await client.query(
        `INSERT INTO product_options(revision_id,name,price_won,display_order)
         SELECT $1,name,price_won,display_order FROM product_options WHERE revision_id=$2`,
        [revisionId, source.revision_id],
      );
      const images = await client.query<{
        object_key: string; purpose: string; display_order: number;
      }>(
        `SELECT object_key,purpose,display_order FROM product_images
         WHERE revision_id=$1 ORDER BY display_order,id`, [source.revision_id],
      );
      for (const image of images.rows) {
        const copied = await store.put(await store.read(image.object_key), 'image/webp');
        copiedKeys.push(copied.objectKey);
        await client.query(
          `INSERT INTO product_images(revision_id,object_key,purpose,mime_type,size_bytes,display_order)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [revisionId, copied.objectKey, image.purpose, copied.mimeType, copied.sizeBytes, image.display_order],
        );
      }
      await client.query(
        `INSERT INTO audit_events(actor_account_id,active_role,seller_id,action,target_type,target_id)
         VALUES ($1,'seller',$2,'product.revision_create','product_revision',$3)`,
        [actor.accountId, actor.sellerId, revisionId],
      );
      await client.query('COMMIT');
      return { productId, revisionId, status: 'draft' as const };
    } catch (error) {
      await client.query('ROLLBACK');
      const cleanup = await Promise.allSettled(copiedKeys.map((key) => store.remove(key)));
      const failures = cleanup.filter((result) => result.status === 'rejected');
      if (failures.length) throw new AggregateError([error, ...failures.map((result) => result.reason)],
        'Revision rollback left quarantined files');
      throw error;
    } finally { client.release(); }
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
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
    const result = await this.pool.query<{
      productId: string; revisionId: string; title: string; status: string; categoryId: string;
    }>(
      `SELECT * FROM (
         SELECT DISTINCT ON (p.id) p.id AS "productId",r.id AS "revisionId",r.title,r.status,
                p.category_id AS "categoryId"
         FROM products p JOIN product_revisions r ON r.product_id=p.id
         WHERE p.seller_id=$1 AND r.status <> 'rejected'
         ORDER BY p.id,r.version DESC
       ) current_revisions ORDER BY title,"productId"`, [actor.sellerId],
    );
    return result.rows;
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

  async readImage(actor: AccessContext, productId: string, revisionId: string,
    imageId: string, store: ImageQuarantine) {
    if (!actor.sellerId || !canAccess(actor, 'request-proposal', { sellerId: actor.sellerId })) {
      throw new Error('Forbidden');
    }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (![productId, revisionId, imageId].every((id) => uuid.test(id))) throw new Error('Invalid image target');
    const image = await this.pool.query<{ object_key: string }>(
      `SELECT i.object_key FROM product_images i JOIN product_revisions r ON r.id=i.revision_id
       JOIN products p ON p.id=r.product_id
       WHERE p.id=$1 AND r.id=$2 AND i.id=$3 AND p.seller_id=$4`,
      [productId, revisionId, imageId, actor.sellerId],
    );
    if (!image.rows[0]) throw new Error('Forbidden');
    return store.read(image.rows[0].object_key);
  }

  async reorderImages(actor: AccessContext, productId: string, revisionId: string,
    input: { id: string; purpose: 'thumbnail' | 'detail' }[]) {
    if (!actor.sellerId || !canAccess(actor, 'request-proposal', { sellerId: actor.sellerId })) {
      throw new Error('Forbidden');
    }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(productId) || !uuid.test(revisionId) || !Array.isArray(input) ||
        input.length < 1 || input.length > 10 ||
        input.some((item) => !item || !uuid.test(item.id) || !['thumbnail', 'detail'].includes(item.purpose)) ||
        new Set(input.map((item) => item.id)).size !== input.length) {
      throw new Error('Invalid image order');
    }
    if (input.filter((item) => item.purpose === 'thumbnail').length !== 1) {
      throw new Error('One thumbnail required');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const target = await client.query<{ seller_id: string; status: string }>(
        `SELECT p.seller_id,r.status FROM product_revisions r JOIN products p ON p.id=r.product_id
         WHERE p.id=$1 AND r.id=$2 FOR UPDATE OF r`, [productId, revisionId],
      );
      if (target.rows[0]?.seller_id !== actor.sellerId) throw new Error('Forbidden');
      if (target.rows[0].status !== 'draft') throw new Error('Draft required');
      const current = await client.query<{ id: string }>(
        'SELECT id FROM product_images WHERE revision_id=$1 FOR UPDATE', [revisionId],
      );
      const ids = new Set(current.rows.map((item) => item.id));
      if (current.rows.length !== input.length || input.some((item) => !ids.has(item.id))) {
        throw new Error('Image set mismatch');
      }
      for (const [index, item] of input.entries()) {
        await client.query('UPDATE product_images SET purpose=$2,display_order=$3 WHERE id=$1',
          [item.id, item.purpose, index]);
      }
      await client.query(
        `INSERT INTO audit_events(actor_account_id,active_role,seller_id,action,target_type,target_id)
         VALUES ($1,'seller',$2,'product.images_reorder','product_revision',$3)`,
        [actor.accountId, actor.sellerId, revisionId],
      );
      await client.query('COMMIT');
      return { revisionId, count: input.length };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async removeImage(actor: AccessContext, productId: string, revisionId: string,
    imageId: string, store: ImageQuarantine) {
    if (!actor.sellerId || !canAccess(actor, 'request-proposal', { sellerId: actor.sellerId })) {
      throw new Error('Forbidden');
    }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (![productId, revisionId, imageId].every((id) => uuid.test(id))) throw new Error('Invalid image target');
    const client = await this.pool.connect();
    let staged: Awaited<ReturnType<ImageQuarantine['stageRemoval']>> | undefined;
    try {
      await client.query('BEGIN');
      const target = await client.query<{ seller_id: string; status: string }>(
        `SELECT p.seller_id,r.status FROM product_revisions r JOIN products p ON p.id=r.product_id
         WHERE p.id=$1 AND r.id=$2 FOR UPDATE OF r`, [productId, revisionId],
      );
      if (target.rows[0]?.seller_id !== actor.sellerId) throw new Error('Forbidden');
      if (target.rows[0].status !== 'draft') throw new Error('Draft required');
      const image = await client.query<{ object_key: string }>(
        'SELECT object_key FROM product_images WHERE id=$1 AND revision_id=$2 FOR UPDATE', [imageId, revisionId],
      );
      if (!image.rows[0]) throw new Error('Image not found');
      staged = await store.stageRemoval(image.rows[0].object_key);
      await client.query('DELETE FROM product_images WHERE id=$1', [imageId]);
      await client.query(
        `INSERT INTO audit_events(actor_account_id,active_role,seller_id,action,target_type,target_id)
         VALUES ($1,'seller',$2,'product.image_remove','product_image',$3)`,
        [actor.accountId, actor.sellerId, imageId],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      if (staged) {
        try { await staged.restore(); }
        catch (restoreError) { throw new AggregateError([error, restoreError], 'Image recovery required'); }
      }
      throw error;
    } finally { client.release(); }
    try { await staged!.purge(); }
    catch { return { imageId, status: 'cleanup_pending' as const }; }
    return { imageId, status: 'deleted' as const };
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
