import type { Pool } from 'pg';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const orderBy = {
  latest: 'pub.published_at DESC,p.id DESC',
  price_asc: 'price.amount ASC,p.id ASC',
  price_desc: 'price.amount DESC,p.id DESC',
} as const;

export type PublicSearch = {
  query?: string;
  categoryId?: string;
  sellerId?: string;
  sort?: string;
  page?: number;
};

/** Public rows are projected only from an explicit approved publication and live sellable options. */
export class PublicProducts {
  constructor(private readonly pool: Pool) {}

  /** The object key is returned only to the server-side image route, never to a customer payload. */
  async getPublishedImage(productId: string, imageId: string) {
    if (!uuid.test(productId) || !uuid.test(imageId)) throw new Error('Invalid image target');
    const result = await this.pool.query<{ objectKey: string; mimeType: string }>(
      `SELECT i.object_key AS "objectKey",i.mime_type AS "mimeType"
       FROM product_publications pub
       JOIN product_revisions r ON r.id=pub.revision_id AND r.product_id=pub.product_id
       JOIN product_images i ON i.revision_id=r.id
       WHERE pub.product_id=$1 AND i.id=$2 AND r.status='approved' AND i.mime_type='image/webp'`,
      [productId, imageId],
    );
    return result.rows[0] ?? null;
  }

  async get(productId: string) {
    if (typeof productId !== 'string' || !uuid.test(productId)) throw new Error('Invalid product target');
    const publication = await this.pool.query<{
      productId: string; revisionId: string; title: string; description: string; originLabel: string;
      shippingMode: string; sellerId: string; sellerName: string; categoryId: string; categoryName: string;
    }>(
      `SELECT p.id AS "productId",r.id AS "revisionId",r.title,r.description,
              r.origin_label AS "originLabel",r.shipping_mode AS "shippingMode",
              s.id AS "sellerId",s.display_name AS "sellerName",
              c.id AS "categoryId",c.name AS "categoryName"
       FROM product_publications pub
       JOIN products p ON p.id=pub.product_id
       JOIN product_revisions r ON r.id=pub.revision_id AND r.product_id=p.id
       JOIN sellers s ON s.id=p.seller_id
       JOIN product_categories c ON c.id=p.category_id
       WHERE p.id=$1 AND r.status='approved'`, [productId],
    );
    if (!publication.rows[0]) return null;
    const options = await this.pool.query<{
      id: string; name: string; priceWon: number; sellableQuantity: number;
    }>(
      `SELECT o.id,o.name,o.price_won AS "priceWon",
              coalesce(i.sellable_quantity,0)::int AS "sellableQuantity"
       FROM product_options o LEFT JOIN inventory_levels i ON i.option_id=o.id
       WHERE o.revision_id=$1 ORDER BY o.display_order,o.id`, [publication.rows[0].revisionId],
    );
    return { ...publication.rows[0], options: options.rows };
  }

  async list(input: PublicSearch = {}) {
    const { query = '', categoryId, sellerId, sort = 'latest', page = 1 } = input;
    if (typeof query !== 'string' || query.trim().length > 80 ||
        (categoryId !== undefined && (typeof categoryId !== 'string' || !uuid.test(categoryId))) ||
        (sellerId !== undefined && (typeof sellerId !== 'string' || !uuid.test(sellerId))) ||
        typeof sort !== 'string' || !Object.hasOwn(orderBy, sort) ||
        !Number.isInteger(page) || page < 1 || page > 1000) {
      throw new Error('Invalid search');
    }
    const params: (string | number)[] = [];
    const conditions = ["r.status='approved'"];
    if (query.trim()) {
      params.push(query.trim().toLowerCase());
      conditions.push(`(strpos(lower(r.title),$${params.length})>0 OR strpos(lower(s.display_name),$${params.length})>0)`);
    }
    if (categoryId) {
      params.push(categoryId);
      conditions.push(`(c.id=$${params.length} OR c.parent_id=$${params.length})`);
    }
    if (sellerId) {
      params.push(sellerId);
      conditions.push(`p.seller_id=$${params.length}`);
    }
    params.push(24, (page - 1) * 24);
    const results = await this.pool.query<{
      productId: string; revisionId: string; title: string; originLabel: string;
      sellerId: string; sellerName: string; categoryId: string; categoryName: string;
      minPriceWon: number; publishedAt: Date;
    }>(
      `SELECT p.id AS "productId",r.id AS "revisionId",r.title,r.origin_label AS "originLabel",
              s.id AS "sellerId",s.display_name AS "sellerName",c.id AS "categoryId",
              c.name AS "categoryName",price.amount AS "minPriceWon",pub.published_at AS "publishedAt"
       FROM product_publications pub
       JOIN products p ON p.id=pub.product_id
       JOIN product_revisions r ON r.id=pub.revision_id AND r.product_id=p.id
       JOIN sellers s ON s.id=p.seller_id
       JOIN product_categories c ON c.id=p.category_id
       JOIN LATERAL (
         SELECT min(o.price_won)::int AS amount FROM product_options o
         JOIN inventory_levels i ON i.option_id=o.id
         WHERE o.revision_id=r.id AND i.sellable_quantity>0
       ) price ON price.amount IS NOT NULL
       WHERE ${conditions.join(' AND ')}
       ORDER BY ${orderBy[sort as keyof typeof orderBy]}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return results.rows;
  }
}
