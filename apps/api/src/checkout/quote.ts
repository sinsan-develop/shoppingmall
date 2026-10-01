import type { Pool } from 'pg';
import { ShippingPolicies } from '../shipping/service.js';
import type { ShippingPolicy } from '../shipping/policy.js';
import type { CartSelection } from './cart-selection.js';
import { CheckoutCatalog } from './catalog-selection.js';
import { groupShipmentLines, quoteShipments, type ShipmentQuote } from './shipment-quote.js';

/** Current-price preview only. Order submission must revalidate and reserve stock in a transaction. */
export class CheckoutQuote {
  constructor(private readonly pool: Pool) {}

  async quote(selections: readonly CartSelection[]): Promise<ShipmentQuote> {
    const lines = await new CheckoutCatalog(this.pool).resolve(selections);
    const groups = groupShipmentLines(lines);
    if (groups.length === 0) throw new Error('Empty cart');

    const policies = new ShippingPolicies(this.pool);
    const global = await policies.getGlobal();
    const policyByGroup = new Map<string, Pick<ShippingPolicy, 'feeWon' | 'freeThresholdWon'>>();
    await Promise.all(groups.map(async (group) => {
      const policy = group.sellerId
        ? (await policies.getEffective(group.sellerId)).policy
        : global.policy;
      policyByGroup.set(group.key, policy);
    }));
    return quoteShipments(lines, (group) => {
      const policy = policyByGroup.get(group.key);
      if (!policy) throw new Error('Shipment policy unavailable');
      return policy;
    });
  }
}
