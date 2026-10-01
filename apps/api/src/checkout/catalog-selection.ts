import type { Pool } from 'pg';
import type { CartSelection } from './cart-selection.js';
import type { ShipmentLine } from './shipment-quote.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResolvedCartLine = ShipmentLine & {
  productId: string;
  title: string;
  optionName: string;
  sellableQuantity: number;
};

/** A quote read only. Checkout submission must lock and revalidate these rows. */
export class CheckoutCatalog {
  constructor(private readonly pool: Pool) {}

  async resolve(selections: readonly CartSelection[]): Promise<ResolvedCartLine[]> {
    if (!Array.isArray(selections) || selections.length > 100) throw new Error('Invalid cart selection');
    const seen = new Set<string>();
    for (const item of selections) {
      if (!item || typeof item.optionId !== 'string' || !uuid.test(item.optionId) ||
          !Number.isSafeInteger(item.quantity) || item.quantity <= 0 || seen.has(item.optionId)) {
        throw new Error('Invalid cart selection');
      }
      seen.add(item.optionId);
    }
    if (selections.length === 0) return [];
    const result = await this.pool.query<{
      optionId: string; productId: string; title: string; optionName: string; sellerId: string;
      shippingMode: ShipmentLine['shippingMode']; unitPriceWon: number; sellableQuantity: number;
    }>(
      `SELECT o.id AS "optionId",p.id AS "productId",r.title,o.name AS "optionName",
              p.seller_id AS "sellerId",r.shipping_mode AS "shippingMode",
              o.price_won AS "unitPriceWon",
              greatest(0,coalesce(i.sellable_quantity,0)-coalesce((
                SELECT sum(l.quantity) FROM checkout_reservation_lines l
                JOIN checkout_reservations h ON h.id=l.reservation_id
                WHERE l.option_id=o.id AND h.status='ACTIVE' AND h.expires_at>clock_timestamp()
              ),0))::int AS "sellableQuantity"
       FROM unnest($1::uuid[]) WITH ORDINALITY wanted(id,position)
       JOIN product_options o ON o.id=wanted.id
       JOIN product_revisions r ON r.id=o.revision_id AND r.status='approved'
       JOIN product_publications pub ON pub.revision_id=r.id AND pub.product_id=r.product_id
       JOIN products p ON p.id=pub.product_id
       LEFT JOIN inventory_levels i ON i.option_id=o.id
       WHERE NOT EXISTS (SELECT 1 FROM product_sale_stop_requests stop
         WHERE stop.product_id=p.id AND stop.status='approved')
       ORDER BY wanted.position`,
      [selections.map((item) => item.optionId)],
    );
    if (result.rows.length !== selections.length) throw new Error('Unavailable cart selection');
    return result.rows.map((row, index) => {
      const quantity = selections[index].quantity;
      if (row.sellableQuantity < quantity) throw new Error('Insufficient stock');
      return { ...row, quantity };
    });
  }
}
