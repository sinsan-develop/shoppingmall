import type { Pool } from 'pg';
import { canAccess, type AccessContext } from '../access.js';
import type { ImageQuarantine } from './image-quarantine.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Operator review queue. Rejection never changes the currently published revision. */
export class ProductReviews {
  constructor(private readonly pool: Pool) {}

  async listImages(actor: AccessContext, revisionId: string) {
    if (!canAccess(actor, 'approve-proposal', {})) throw new Error('Forbidden');
    if (!uuid.test(revisionId)) throw new Error('Invalid proposal target');
    const proposal = await this.pool.query('SELECT 1 FROM product_revisions WHERE id=$1 AND status=$2',
      [revisionId, 'pending']);
    if (!proposal.rowCount) throw new Error('Pending proposal required');
    const images = await this.pool.query<{
      id: string; purpose: 'thumbnail' | 'detail'; mimeType: string; sizeBytes: number; displayOrder: number;
    }>(
      `SELECT id,purpose,mime_type AS "mimeType",size_bytes AS "sizeBytes",display_order AS "displayOrder"
       FROM product_images WHERE revision_id=$1 ORDER BY display_order,id`, [revisionId],
    );
    return images.rows;
  }

  async readImage(actor: AccessContext, revisionId: string, imageId: string, store: ImageQuarantine) {
    if (!canAccess(actor, 'approve-proposal', {})) throw new Error('Forbidden');
    if (!uuid.test(revisionId) || !uuid.test(imageId)) throw new Error('Invalid image target');
    const image = await this.pool.query<{ object_key: string }>(
      `SELECT i.object_key FROM product_images i JOIN product_revisions r ON r.id=i.revision_id
       WHERE r.id=$1 AND i.id=$2 AND r.status='pending'`, [revisionId, imageId],
    );
    if (!image.rows[0]) throw new Error('Pending image not found');
    return store.read(image.rows[0].object_key);
  }

  async listPending(actor: AccessContext) {
    if (!canAccess(actor, 'approve-proposal', {})) throw new Error('Forbidden');
    const result = await this.pool.query<{
      productId: string; revisionId: string; title: string; description: string;
      originLabel: string; shippingMode: string; options: { name: string; priceWon: number }[];
      thumbnailCount: number; detailImageCount: number; sellerId: string;
      sellerName: string; proposedAt: Date; proposedByAccountId: string;
    }>(
      `SELECT p.id AS "productId",r.id AS "revisionId",r.title,s.id AS "sellerId",
              s.display_name AS "sellerName",r.proposed_at AS "proposedAt",
              r.proposed_by_account_id AS "proposedByAccountId",r.description,
              r.origin_label AS "originLabel",r.shipping_mode AS "shippingMode",
              COALESCE((SELECT json_agg(json_build_object('name',o.name,'priceWon',o.price_won)
                ORDER BY o.display_order,o.id) FROM product_options o WHERE o.revision_id=r.id),'[]'::json) AS options,
              (SELECT count(*)::int FROM product_images i WHERE i.revision_id=r.id AND i.purpose='thumbnail') AS "thumbnailCount",
              (SELECT count(*)::int FROM product_images i WHERE i.revision_id=r.id AND i.purpose='detail') AS "detailImageCount"
       FROM product_revisions r JOIN products p ON p.id=r.product_id JOIN sellers s ON s.id=p.seller_id
       WHERE r.status='pending' ORDER BY r.proposed_at,r.id LIMIT 100`,
    );
    return result.rows;
  }

  async reject(actor: AccessContext, revisionId: string, reason: string) {
    if (!canAccess(actor, 'approve-proposal', {})) throw new Error('Forbidden');
    if (!uuid.test(revisionId)) throw new Error('Invalid proposal target');
    if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) {
      throw new Error('Review reason required');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const pending = await client.query<{ status: string; seller_id: string; product_id: string }>(
        `SELECT r.status,p.seller_id,p.id AS product_id FROM product_revisions r
         JOIN products p ON p.id=r.product_id WHERE r.id=$1 FOR UPDATE OF r`, [revisionId],
      );
      if (pending.rows[0]?.status !== 'pending') throw new Error('Pending proposal required');
      await client.query(
        `UPDATE product_revisions SET status='rejected',reviewed_by_account_id=$1,
          reviewed_at=now(),review_reason=$2 WHERE id=$3`,
        [actor.accountId, reason.trim(), revisionId],
      );
      await client.query(
        `INSERT INTO audit_events(actor_account_id,active_role,seller_id,action,target_type,target_id)
         VALUES ($1,'admin',$2,'product.proposal_reject','product_revision',$3)`,
        [actor.accountId, pending.rows[0].seller_id, revisionId],
      );
      await client.query('COMMIT');
      return { revisionId, status: 'rejected' as const };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}
