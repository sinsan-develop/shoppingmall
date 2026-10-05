import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import { hashPassword } from '../src/auth/credentials.js';

const fingerprint = 'c'.repeat(64);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SharedRefundManifest = {
  runId: string; emails: string[]; accountIds: string[]; sellerId: string;
  sellerCategoryId: string; productId: string; productCategoryId: string;
  revisionId: string; optionId: string; addressId: string;
  orderId: string; reservationId: string; shipmentId: string;
};

function runId(value: string) {
  if (!/^[0-9a-f]{8}$/i.test(value)) throw new Error('QA_RUN_ID must be eight hex characters');
  return value.toLowerCase();
}

export function refundUiDatabaseName(value: string) {
  return `shoppingmall_s4_refund_ui_${runId(value)}`;
}

export function refundUiEmails(value: string) {
  const id = runId(value);
  return ['customer', 'seller', 'admin'].map((role) =>
    `qa+${id}-refund-${role}@example.invalid`);
}

export function validateRefundUiTarget(databaseUrl: string, value: string) {
  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (database !== refundUiDatabaseName(value))
    throw new Error('Refund UI fixture requires its exact isolated database');
  return { url, database };
}

export function validateSharedRefundUiTarget(databaseUrl: string, value: string, consent?: string) {
  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (database !== 'shoppingmall' || consent !== `SHARED_S4_REFUND_UI_${runId(value)}`)
    throw new Error('Shared refund UI fixture requires exact shoppingmall DB and run-bound opt-in');
  return { url, database };
}

export function validateSharedRefundManifest(value: string, candidate: unknown): SharedRefundManifest {
  const manifest = candidate as Partial<SharedRefundManifest> | null;
  const ids = manifest && [manifest.sellerId, manifest.sellerCategoryId, manifest.productId,
    manifest.productCategoryId, manifest.revisionId, manifest.optionId, manifest.addressId,
    manifest.orderId, manifest.reservationId, manifest.shipmentId];
  if (!manifest || manifest.runId !== runId(value) ||
      JSON.stringify(manifest.emails) !== JSON.stringify(refundUiEmails(value)) ||
      !Array.isArray(manifest.accountIds) || manifest.accountIds.length !== 3 ||
      !manifest.accountIds.every((id) => typeof id === 'string' && uuid.test(id)) ||
      new Set(manifest.accountIds).size !== 3 || !ids?.every((id) => typeof id === 'string' && uuid.test(id)))
    throw new Error('Shared refund UI reset requires exact creation manifest');
  return manifest as SharedRefundManifest;
}

function prefix(value: string) { return `qa-${runId(value)}-refund-ui`; }

async function findFixture(client: PoolClient, value: string) {
  const emails = refundUiEmails(value);
  const accounts = await client.query<{ account_id: string; identifier: string }>(
    `SELECT account_id,identifier FROM account_identities
     WHERE kind='email' AND identifier=ANY($1::text[])`, [emails]);
  const byEmail = new Map(accounts.rows.map((row) => [row.identifier, row.account_id]));
  const seller = await client.query<{ id: string; category_id: string }>(
    'SELECT id,category_id FROM sellers WHERE display_name=$1', [prefix(value)]);
  const products = seller.rows[0] ? await client.query<{ id: string; category_id: string }>(
    'SELECT id,category_id FROM products WHERE seller_id=$1', [seller.rows[0].id]) : { rows: [] };
  return { emails, accountIds: accounts.rows.map((row) => row.account_id), byEmail,
    seller: seller.rows[0], products: products.rows };
}

export async function resetRefundUiFixture(client: PoolClient, value: string, maxOrders = 1,
  sharedManifest?: SharedRefundManifest) {
  if (sharedManifest) {
    await client.query("SET LOCAL lock_timeout = '1s'");
    await client.query("SET LOCAL statement_timeout = '3s'");
  }
  const found = await findFixture(client, value);
  let ownedReservationIds: string[] | undefined;
  let allowedAuditTargets: Map<string, Set<string>> | undefined;
  if (sharedManifest) {
    const accountIds = refundUiEmails(value).map((email) => found.byEmail.get(email));
    if (JSON.stringify(accountIds) !== JSON.stringify(sharedManifest.accountIds) ||
        found.accountIds.length !== 3 || found.seller?.id !== sharedManifest.sellerId ||
        found.seller?.category_id !== sharedManifest.sellerCategoryId || found.products.length !== 1 ||
        found.products[0].id !== sharedManifest.productId ||
        found.products[0].category_id !== sharedManifest.productCategoryId)
      throw new Error('Shared refund UI fixture ownership differs from creation manifest');
    // FK inserts acquire KEY SHARE; these locks keep late foreign references out until commit.
    await client.query('SELECT id FROM accounts WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [accountIds]);
    await client.query('SELECT id FROM sellers WHERE id=$1 FOR UPDATE', [sharedManifest.sellerId]);
    await client.query('SELECT id FROM products WHERE id=$1 FOR UPDATE', [sharedManifest.productId]);
    await client.query('SELECT id FROM product_revisions WHERE id=$1 FOR UPDATE', [sharedManifest.revisionId]);
    await client.query('SELECT id FROM product_options WHERE id=$1 FOR UPDATE', [sharedManifest.optionId]);
    const identities = await client.query<{ account_id: string; kind: string; identifier: string }>(
      'SELECT account_id,kind,identifier FROM account_identities WHERE account_id=ANY($1::uuid[])', [accountIds]);
    const roles = await client.query<{ account_id: string; role: string; seller_id: string | null }>(
      'SELECT account_id,role,seller_id FROM account_roles WHERE account_id=ANY($1::uuid[])', [accountIds]);
    const addresses = await client.query<{ id: string; account_id: string; label: string }>(
      'SELECT id,account_id,label FROM customer_addresses WHERE account_id=ANY($1::uuid[])', [accountIds]);
    const revisions = await client.query<{ id: string; proposed_by_account_id: string; reviewed_by_account_id: string }>(
      'SELECT id,proposed_by_account_id,reviewed_by_account_id FROM product_revisions WHERE product_id=$1',
      [sharedManifest.productId]);
    const options = await client.query<{ id: string }>(
      'SELECT id FROM product_options WHERE revision_id=$1', [sharedManifest.revisionId]);
    const publications = await client.query<{ published_by_account_id: string }>(
      'SELECT published_by_account_id FROM product_publications WHERE product_id=$1', [sharedManifest.productId]);
    const sellerCategory = await client.query<{ name: string }>(
      'SELECT name FROM seller_categories WHERE id=$1', [sharedManifest.sellerCategoryId]);
    const productCategory = await client.query<{ name: string }>(
      'SELECT name FROM product_categories WHERE id=$1', [sharedManifest.productCategoryId]);
    const unexpected = await client.query(`SELECT 1 FROM product_images WHERE revision_id=$1
      UNION ALL SELECT 1 FROM stock_change_requests WHERE option_id=$2
      UNION ALL SELECT 1 FROM inventory_deferred_stock_targets WHERE option_id=$2
      UNION ALL SELECT 1 FROM product_sale_stop_requests WHERE product_id=$3
      UNION ALL SELECT 1 FROM seller_shipping_policies WHERE seller_id=$4
      UNION ALL SELECT 1 FROM seller_shipping_policy_requests WHERE seller_id=$4 LIMIT 1`,
    [sharedManifest.revisionId, sharedManifest.optionId, sharedManifest.productId, sharedManifest.sellerId]);
    if (identities.rows.length !== 3 || identities.rows.some((row) => {
      const index = sharedManifest.accountIds.indexOf(row.account_id);
      return index < 0 || row.kind !== 'email' || row.identifier !== sharedManifest.emails[index];
    }) || new Set(identities.rows.map((row) => row.account_id)).size !== 3 ||
      roles.rows.length !== 3 || roles.rows.some((row) => {
        const index = sharedManifest.accountIds.indexOf(row.account_id);
        return index < 0 || row.role !== ['customer', 'seller', 'admin'][index] ||
          row.seller_id !== (index === 1 ? sharedManifest.sellerId : null);
      }) || new Set(roles.rows.map((row) => row.account_id)).size !== 3 ||
      addresses.rows.length !== 1 || addresses.rows[0].id !== sharedManifest.addressId ||
      addresses.rows[0].account_id !== sharedManifest.accountIds[0] || addresses.rows[0].label !== '환불 QA' ||
      revisions.rows.length !== 1 || revisions.rows[0].id !== sharedManifest.revisionId ||
      revisions.rows[0].proposed_by_account_id !== sharedManifest.accountIds[1] ||
      revisions.rows[0].reviewed_by_account_id !== sharedManifest.accountIds[2] ||
      options.rows.length !== 1 || options.rows[0].id !== sharedManifest.optionId ||
      publications.rows.length !== 1 || publications.rows[0].published_by_account_id !== sharedManifest.accountIds[2] ||
      sellerCategory.rows[0]?.name !== prefix(value) || productCategory.rows[0]?.name !== prefix(value) ||
      unexpected.rowCount)
      throw new Error('Shared refund UI fixture contains foreign account or product data');
  }
  const orderIds = found.accountIds.length ? (await client.query<{ id: string }>(
    'SELECT id FROM checkout_orders WHERE account_id=ANY($1::uuid[])', [found.accountIds])).rows.map((row) => row.id) : [];
  if (orderIds.length > maxOrders || found.products.length > 1 || found.accountIds.length > 3)
    throw new Error('Refund UI fixture scope exceeds its bounded accounts, orders or product');
  if (sharedManifest && !orderIds.includes(sharedManifest.orderId))
    throw new Error('Shared refund UI original order differs from creation manifest');
  if (sharedManifest && orderIds.length) {
    // These FK parents close the preflight-to-delete race for new shipments,
    // attempts, events and conflicts from a different order.
    await client.query('SELECT id FROM checkout_orders WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [orderIds]);
    await client.query('SELECT id FROM payment_attempts WHERE checkout_order_id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [orderIds]);
    await client.query(`SELECT e.id FROM payment_events e JOIN payment_attempts a ON a.id=e.payment_attempt_id
      WHERE a.checkout_order_id=ANY($1::uuid[]) ORDER BY e.id FOR UPDATE OF e`, [orderIds]);
    await client.query('SELECT id FROM refund_cases WHERE checkout_order_id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [orderIds]);
    await client.query(`SELECT a.id FROM refund_attempts a JOIN refund_cases c ON c.id=a.refund_case_id
      WHERE c.checkout_order_id=ANY($1::uuid[]) ORDER BY a.id FOR UPDATE OF a`, [orderIds]);
    await client.query(`SELECT e.id FROM refund_events e JOIN refund_attempts a ON a.id=e.refund_attempt_id
      JOIN refund_cases c ON c.id=a.refund_case_id
      WHERE c.checkout_order_id=ANY($1::uuid[]) ORDER BY e.id FOR UPDATE OF e`, [orderIds]);
  }
  if (sharedManifest) {
    const reservations = await client.query<{ id: string; account_id: string }>(
      'SELECT id,account_id FROM checkout_reservations WHERE account_id=ANY($1::uuid[])',
      [sharedManifest.accountIds]);
    ownedReservationIds = reservations.rows.map((row) => row.id);
    const reservationLines = await client.query<{ reservation_id: string; option_id: string }>(
      'SELECT reservation_id,option_id FROM checkout_reservation_lines WHERE reservation_id=ANY($1::uuid[])',
      [ownedReservationIds]);
    const reservationSet = new Set(ownedReservationIds);
    if (ownedReservationIds.length > 4 || !reservationSet.has(sharedManifest.reservationId) ||
        reservations.rows.some((row) => row.account_id !== sharedManifest.accountIds[0]) ||
        reservationLines.rows.some((row) => !reservationSet.has(row.reservation_id) ||
          row.option_id !== sharedManifest.optionId) ||
        !reservationLines.rows.some((row) => row.reservation_id === sharedManifest.reservationId &&
          row.option_id === sharedManifest.optionId))
      throw new Error('Shared refund UI reservation contains foreign product or account data');
    const orderScope = await client.query<{ reservation_id: string; address_id: string }>(
      'SELECT reservation_id,address_id FROM checkout_orders WHERE id=ANY($1::uuid[])', [orderIds]);
    if (orderScope.rows.some((row) => !reservationSet.has(row.reservation_id) ||
      row.address_id !== sharedManifest.addressId))
      throw new Error('Shared refund UI order references foreign reservation or address');
  }
  if (sharedManifest && orderIds.length) {
    const foreignActors = await client.query(`SELECT 1 FROM checkout_orders
      WHERE id=ANY($1::uuid[]) AND account_id<>$2
      UNION ALL SELECT 1 FROM refund_cases WHERE checkout_order_id=ANY($1::uuid[])
        AND (NOT(requester_account_id=ANY($3::uuid[])) OR
          (decision_by IS NOT NULL AND NOT(decision_by=ANY($3::uuid[]))) OR
          (pre_shipment_confirmed_by IS NOT NULL AND NOT(pre_shipment_confirmed_by=ANY($3::uuid[]))))
      UNION ALL SELECT 1 FROM refund_case_events e JOIN refund_cases c ON c.id=e.refund_case_id
        WHERE c.checkout_order_id=ANY($1::uuid[]) AND e.actor_account_id IS NOT NULL
          AND NOT(e.actor_account_id=ANY($3::uuid[]))
      UNION ALL SELECT 1 FROM order_status_events WHERE checkout_order_id=ANY($1::uuid[])
        AND actor_account_id IS NOT NULL AND NOT(actor_account_id=ANY($3::uuid[])) LIMIT 1`,
    [orderIds, sharedManifest.accountIds[0], sharedManifest.accountIds]);
    if (foreignActors.rowCount) throw new Error('Shared refund UI order contains foreign actor data');
    const paymentCrossLinks = await client.query(`SELECT 1 FROM payment_event_conflicts c
      JOIN payment_events e ON e.id=c.original_event_id
      JOIN payment_attempts original_attempt ON original_attempt.id=e.payment_attempt_id
      JOIN payment_attempts incoming_attempt ON incoming_attempt.id=c.incoming_attempt_id
      WHERE (original_attempt.checkout_order_id=ANY($1::uuid[])) <>
            (incoming_attempt.checkout_order_id=ANY($1::uuid[]))
      UNION ALL SELECT 1 FROM payment_events e
      JOIN payment_attempts a ON a.id=e.payment_attempt_id
      WHERE a.checkout_order_id=ANY($1::uuid[]) AND NOT(e.verified_order_id=ANY($1::uuid[]))
      LIMIT 1`, [orderIds]);
    if (paymentCrossLinks.rowCount)
      throw new Error('Shared refund UI foreign payment conflict or event reference');
    const refundCrossLinks = await client.query(`SELECT 1 FROM refund_event_conflicts x
      JOIN refund_events e ON e.id=x.original_event_id
      JOIN refund_attempts original_attempt ON original_attempt.id=e.refund_attempt_id
      JOIN refund_cases original_case ON original_case.id=original_attempt.refund_case_id
      JOIN refund_attempts incoming_attempt ON incoming_attempt.id=x.incoming_attempt_id
      JOIN refund_cases incoming_case ON incoming_case.id=incoming_attempt.refund_case_id
      WHERE (original_case.checkout_order_id=ANY($1::uuid[])) <>
            (incoming_case.checkout_order_id=ANY($1::uuid[]))
      UNION ALL SELECT 1 FROM refund_attempts a
      JOIN refund_cases c ON c.id=a.refund_case_id
      JOIN payment_attempts p ON p.id=a.payment_attempt_id
      WHERE (c.checkout_order_id=ANY($1::uuid[])) <>
            (p.checkout_order_id=ANY($1::uuid[]))
      UNION ALL SELECT 1 FROM refund_events e
      JOIN refund_attempts a ON a.id=e.refund_attempt_id
      JOIN refund_cases c ON c.id=a.refund_case_id
      WHERE (c.checkout_order_id=ANY($1::uuid[])) <>
            (e.verified_order_id=ANY($1::uuid[]))
      UNION ALL SELECT 1 FROM refund_case_events ce
      JOIN refund_cases c ON c.id=ce.refund_case_id
      JOIN refund_events e ON e.id=ce.refund_event_id
      JOIN refund_attempts a ON a.id=e.refund_attempt_id
      JOIN refund_cases event_case ON event_case.id=a.refund_case_id
      WHERE (c.checkout_order_id=ANY($1::uuid[])) <>
            (event_case.checkout_order_id=ANY($1::uuid[]))
      LIMIT 1`, [orderIds]);
    if (refundCrossLinks.rowCount)
      throw new Error('Shared refund UI foreign refund conflict or event reference');
  }
  if (found.products.length) {
    const productId = found.products[0].id;
    const foreignCart = await client.query(`SELECT 1 FROM customer_cart_items i
      JOIN product_options o ON o.id=i.option_id JOIN product_revisions r ON r.id=o.revision_id
      WHERE r.product_id=$1 AND NOT(i.account_id=ANY($2::uuid[])) LIMIT 1`, [productId, found.accountIds]);
    const foreignReservation = await client.query(`SELECT 1 FROM checkout_reservation_lines l
      JOIN checkout_reservations x ON x.id=l.reservation_id
      JOIN product_options o ON o.id=l.option_id JOIN product_revisions r ON r.id=o.revision_id
      WHERE r.product_id=$1 AND NOT(x.account_id=ANY($2::uuid[])) LIMIT 1`, [productId, found.accountIds]);
    const foreignFavorite = await client.query(`SELECT 1 FROM customer_favorites
      WHERE product_id=$1 AND NOT(account_id=ANY($2::uuid[])) LIMIT 1`, [productId, found.accountIds]);
    const foreignRestock = await client.query(`SELECT 1 FROM restock_subscriptions
      WHERE product_id=$1 AND NOT(account_id=ANY($2::uuid[])) LIMIT 1`, [productId, found.accountIds]);
    const foreignOrderLine = await client.query(`SELECT 1 FROM shipment_order_lines l
      JOIN shipment_orders s ON s.id=l.shipment_order_id
      JOIN checkout_orders x ON x.id=s.checkout_order_id
      WHERE l.product_id=$1 AND NOT(x.account_id=ANY($2::uuid[])) LIMIT 1`, [productId, found.accountIds]);
    const unrelatedLine = orderIds.length ? await client.query(`SELECT 1 FROM shipment_order_lines l
      JOIN shipment_orders s ON s.id=l.shipment_order_id
      WHERE s.checkout_order_id=ANY($1::uuid[]) AND l.product_id<>$2 LIMIT 1`, [orderIds, productId]) : { rowCount: 0 };
    if (foreignCart.rowCount || foreignReservation.rowCount || foreignFavorite.rowCount ||
        foreignRestock.rowCount || foreignOrderLine.rowCount || unrelatedLine.rowCount)
      throw new Error('Refund UI fixture is referenced by a foreign account or product');
  }
  if (sharedManifest) {
    const shipments = await client.query<{
      id: string; checkout_order_id: string; seller_id: string | null;
      shipping_mode: string; shipment_key: string;
    }>(`SELECT id,checkout_order_id,seller_id,shipping_mode,shipment_key
      FROM shipment_orders WHERE checkout_order_id=ANY($1::uuid[])`, [orderIds]);
    const shipmentIds = shipments.rows.map((row) => row.id);
    const shipmentLines = await client.query<{
      shipment_order_id: string; product_id: string; option_id: string; seller_id: string;
    }>(`SELECT shipment_order_id,product_id,option_id,seller_id
      FROM shipment_order_lines WHERE shipment_order_id=ANY($1::uuid[])`, [shipmentIds]);
    if (shipments.rows.length !== orderIds.length || shipmentLines.rows.length !== shipmentIds.length ||
        !shipments.rows.some((row) => row.id === sharedManifest.shipmentId &&
          row.checkout_order_id === sharedManifest.orderId) ||
        shipments.rows.some((row) => row.seller_id !== sharedManifest.sellerId ||
          row.shipping_mode !== 'seller_direct' ||
          row.shipment_key !== `seller:${sharedManifest.sellerId}`) ||
        shipmentLines.rows.some((row) => row.product_id !== sharedManifest.productId ||
          row.option_id !== sharedManifest.optionId || row.seller_id !== sharedManifest.sellerId ||
          !shipmentIds.includes(row.shipment_order_id)) ||
        shipmentIds.some((id) => shipmentLines.rows.filter((row) => row.shipment_order_id === id).length !== 1))
      throw new Error('Shared refund UI shipment contains foreign seller, product or option');
    const refundCaseIds = (await client.query<{ id: string }>(
      'SELECT id FROM refund_cases WHERE checkout_order_id=ANY($1::uuid[])', [orderIds])).rows
      .map((row) => row.id);
    const restockIds = (await client.query<{ id: string }>(
      'SELECT id FROM restock_subscriptions WHERE account_id=ANY($1::uuid[]) AND product_id=$2',
      [sharedManifest.accountIds, sharedManifest.productId])).rows.map((row) => row.id);
    allowedAuditTargets = new Map<string, Set<string>>([
      ['account', new Set(sharedManifest.accountIds)],
      ['customer_address', new Set([sharedManifest.addressId])],
      ['seller', new Set([sharedManifest.sellerId])],
      ['seller_category', new Set([sharedManifest.sellerCategoryId])],
      ['product', new Set([sharedManifest.productId])],
      ['product_category', new Set([sharedManifest.productCategoryId])],
      ['product_revision', new Set([sharedManifest.revisionId])],
      ['product_option', new Set([sharedManifest.optionId])],
      ['checkout_reservation', new Set(ownedReservationIds)],
      ['checkout_order', new Set(orderIds)],
      ['shipment_order', new Set(shipmentIds)],
      ['refund_case', new Set(refundCaseIds)],
      ['restock_subscription', new Set(restockIds)],
    ]);
  }
  if (orderIds.length) {
    await client.query(`DELETE FROM refund_event_conflicts WHERE original_event_id IN
      (SELECT e.id FROM refund_events e JOIN refund_attempts a ON a.id=e.refund_attempt_id
       JOIN refund_cases c ON c.id=a.refund_case_id WHERE c.checkout_order_id=ANY($1::uuid[]))`, [orderIds]);
    await client.query(`DELETE FROM refund_case_events WHERE refund_case_id IN
      (SELECT id FROM refund_cases WHERE checkout_order_id=ANY($1::uuid[]))`, [orderIds]);
    await client.query(`DELETE FROM refund_events WHERE refund_attempt_id IN
      (SELECT a.id FROM refund_attempts a JOIN refund_cases c ON c.id=a.refund_case_id
       WHERE c.checkout_order_id=ANY($1::uuid[]))`, [orderIds]);
    await client.query(`DELETE FROM refund_attempts WHERE refund_case_id IN
      (SELECT id FROM refund_cases WHERE checkout_order_id=ANY($1::uuid[]))`, [orderIds]);
    await client.query(`DELETE FROM refund_case_lines WHERE refund_case_id IN
      (SELECT id FROM refund_cases WHERE checkout_order_id=ANY($1::uuid[]))`, [orderIds]);
    await client.query('DELETE FROM refund_cases WHERE checkout_order_id=ANY($1::uuid[])', [orderIds]);
    await client.query(`DELETE FROM payment_event_conflicts WHERE original_event_id IN
      (SELECT e.id FROM payment_events e JOIN payment_attempts a ON a.id=e.payment_attempt_id
       WHERE a.checkout_order_id=ANY($1::uuid[]))`, [orderIds]);
    await client.query(`DELETE FROM payment_events WHERE payment_attempt_id IN
      (SELECT id FROM payment_attempts WHERE checkout_order_id=ANY($1::uuid[]))`, [orderIds]);
    await client.query('DELETE FROM payment_attempts WHERE checkout_order_id=ANY($1::uuid[])', [orderIds]);
    await client.query('DELETE FROM order_promotion_allocations WHERE checkout_order_id=ANY($1::uuid[])', [orderIds]);
    await client.query('DELETE FROM order_status_events WHERE checkout_order_id=ANY($1::uuid[])', [orderIds]);
    await client.query(`DELETE FROM shipment_order_lines WHERE shipment_order_id IN
      (SELECT id FROM shipment_orders WHERE checkout_order_id=ANY($1::uuid[]))`, [orderIds]);
    await client.query('DELETE FROM shipment_orders WHERE checkout_order_id=ANY($1::uuid[])', [orderIds]);
    await client.query('DELETE FROM checkout_orders WHERE id=ANY($1::uuid[])', [orderIds]);
  }
  if (found.accountIds.length) {
    if (sharedManifest) {
      await client.query('DELETE FROM checkout_reservation_lines WHERE reservation_id=ANY($1::uuid[])',
        [ownedReservationIds]);
      await client.query('DELETE FROM checkout_reservations WHERE id=ANY($1::uuid[])',
        [ownedReservationIds]);
    } else {
      await client.query(`DELETE FROM checkout_reservation_lines WHERE reservation_id IN
        (SELECT id FROM checkout_reservations WHERE account_id=ANY($1::uuid[]))`, [found.accountIds]);
      await client.query('DELETE FROM checkout_reservations WHERE account_id=ANY($1::uuid[])', [found.accountIds]);
    }
    await client.query('DELETE FROM customer_addresses WHERE account_id=ANY($1::uuid[])', [found.accountIds]);
  }
  if (found.products.length) {
    const productIds = found.products.map((row) => row.id);
    const optionIds = (await client.query<{ id: string }>(`SELECT o.id FROM product_options o
      JOIN product_revisions r ON r.id=o.revision_id WHERE r.product_id=ANY($1::uuid[])`, [productIds])).rows
      .map((row) => row.id);
    await client.query('DELETE FROM customer_cart_items WHERE option_id=ANY($1::uuid[]) AND account_id=ANY($2::uuid[])', [optionIds, found.accountIds]);
    await client.query('DELETE FROM restock_subscriptions WHERE product_id=ANY($1::uuid[]) AND account_id=ANY($2::uuid[])', [productIds, found.accountIds]);
    await client.query('DELETE FROM customer_favorites WHERE product_id=ANY($1::uuid[]) AND account_id=ANY($2::uuid[])', [productIds, found.accountIds]);
    await client.query('DELETE FROM inventory_deferred_stock_targets WHERE option_id=ANY($1::uuid[]) AND requested_by_account_id=ANY($2::uuid[])', [optionIds, found.accountIds]);
    await client.query('DELETE FROM stock_change_requests WHERE option_id=ANY($1::uuid[]) AND requested_by_account_id=ANY($2::uuid[])', [optionIds, found.accountIds]);
    await client.query('DELETE FROM product_sale_stop_requests WHERE product_id=ANY($1::uuid[]) AND requested_by_account_id=ANY($2::uuid[])', [productIds, found.accountIds]);
    await client.query('DELETE FROM product_publications WHERE product_id=ANY($1::uuid[]) AND published_by_account_id=ANY($2::uuid[])', [productIds, found.accountIds]);
    await client.query('DELETE FROM inventory_levels WHERE option_id=ANY($1::uuid[])', [optionIds]);
    await client.query('DELETE FROM product_images WHERE revision_id IN (SELECT id FROM product_revisions WHERE product_id=ANY($1::uuid[]))', [productIds]);
    await client.query('DELETE FROM product_options WHERE id=ANY($1::uuid[])', [optionIds]);
    await client.query('DELETE FROM product_revisions WHERE product_id=ANY($1::uuid[])', [productIds]);
    await client.query('DELETE FROM products WHERE id=ANY($1::uuid[])', [productIds]);
    await client.query('DELETE FROM product_categories WHERE id=ANY($1::uuid[])',
      [found.products.map((row) => row.category_id)]);
  }
  if (found.accountIds.length) {
    await client.query('DELETE FROM auth_sessions WHERE account_id=ANY($1::uuid[])', [found.accountIds]);
    await client.query('DELETE FROM account_roles WHERE account_id=ANY($1::uuid[])', [found.accountIds]);
    await client.query('DELETE FROM account_identities WHERE account_id=ANY($1::uuid[])', [found.accountIds]);
  }
  if (found.seller) {
    await client.query('DELETE FROM seller_shipping_policies WHERE seller_id=$1', [found.seller.id]);
    await client.query('DELETE FROM seller_shipping_policy_requests WHERE seller_id=$1', [found.seller.id]);
  }
  if (sharedManifest) {
    // Non-audit rows have already been removed transactionally. The global
    // audit write lock now covers only two bounded reads and four final deletes.
    await client.query("SET LOCAL statement_timeout = '500ms'");
    await client.query('LOCK TABLE audit_events IN SHARE ROW EXCLUSIVE MODE');
    const audit = await client.query<{ id: string; target_type: string; target_id: string; seller_id: string | null }>(
      'SELECT id,target_type,target_id,seller_id FROM audit_events WHERE actor_account_id=ANY($1::uuid[]) LIMIT 101',
      [sharedManifest.accountIds]);
    if (audit.rows.length > 100 || audit.rows.some((row) => !allowedAuditTargets?.get(row.target_type)?.has(row.target_id) ||
      (row.seller_id !== null && row.seller_id !== sharedManifest.sellerId)))
      throw new Error('Shared refund UI audit references a foreign target or seller');
    const targetIds = Object.fromEntries([...allowedAuditTargets!].map(([kind, ids]) => [kind, [...ids]]));
    const externalAudit = await client.query(`SELECT 1 FROM audit_events
      WHERE NOT(actor_account_id=ANY($1::uuid[]))
        AND (seller_id=$2 OR (($3::jsonb ? target_type) AND (($3::jsonb -> target_type) ? target_id)))
      LIMIT 1`, [sharedManifest.accountIds, sharedManifest.sellerId, JSON.stringify(targetIds)]);
    if (externalAudit.rowCount)
      throw new Error('Shared refund UI target is referenced by foreign audit');
    await client.query('DELETE FROM audit_events WHERE id=ANY($1::uuid[]) AND actor_account_id=ANY($2::uuid[])',
      [audit.rows.map((row) => row.id), sharedManifest.accountIds]);
  } else if (found.accountIds.length) {
    await client.query('DELETE FROM audit_events WHERE actor_account_id=ANY($1::uuid[])', [found.accountIds]);
  }
  if (found.accountIds.length)
    await client.query('DELETE FROM accounts WHERE id=ANY($1::uuid[])', [found.accountIds]);
  if (found.seller) {
    await client.query('DELETE FROM sellers WHERE id=$1', [found.seller.id]);
    await client.query('DELETE FROM seller_categories WHERE id=$1', [found.seller.category_id]);
  }
  return { accounts: found.accountIds.length, orders: orderIds.length, products: found.products.length };
}

async function seed(client: PoolClient, value: string, password: string) {
  const existing = await findFixture(client, value);
  if (existing.accountIds.length || existing.seller || existing.products.length)
    throw new Error('Refund UI fixture run already exists');
  const digest = await hashPassword(password);
  const emails = refundUiEmails(value);
  const accountIds: string[] = [];
  for (const [index, email] of emails.entries()) {
    const accountId = (await client.query<{ id: string }>('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    accountIds.push(accountId);
    await client.query(`INSERT INTO account_identities(account_id,kind,identifier,password_hash,verified_at)
      VALUES ($1,'email',$2,$3,now())`, [accountId, email, digest]);
    if (index === 0) await client.query("INSERT INTO account_roles(account_id,role) VALUES ($1,'customer')", [accountId]);
  }
  const [customerId, sellerAccountId, adminId] = accountIds;
  const sellerCategoryId = (await client.query<{ id: string }>(
    'INSERT INTO seller_categories(name) VALUES ($1) RETURNING id', [prefix(value)])).rows[0].id;
  const sellerId = (await client.query<{ id: string }>(
    'INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id',
    [sellerCategoryId, prefix(value)])).rows[0].id;
  await client.query("INSERT INTO account_roles(account_id,role,seller_id) VALUES ($1,'seller',$2)",
    [sellerAccountId, sellerId]);
  await client.query("INSERT INTO account_roles(account_id,role) VALUES ($1,'admin')", [adminId]);
  const categoryId = (await client.query<{ id: string }>(
    'INSERT INTO product_categories(name) VALUES ($1) RETURNING id', [prefix(value)])).rows[0].id;
  const productId = (await client.query<{ id: string }>(
    'INSERT INTO products(seller_id,category_id) VALUES ($1,$2) RETURNING id', [sellerId, categoryId])).rows[0].id;
  const revisionId = (await client.query<{ id: string }>(`INSERT INTO product_revisions
    (product_id,version,title,description,origin_label,shipping_mode,status,
     proposed_by_account_id,reviewed_by_account_id,reviewed_at)
    VALUES ($1,1,$2,'환불 브라우저 시험 상품','시험 산지','seller_direct','approved',$3,$4,now()) RETURNING id`,
  [productId, `${prefix(value)} 고추`, sellerAccountId, adminId])).rows[0].id;
  const optionId = (await client.query<{ id: string }>(`INSERT INTO product_options(revision_id,name,price_won)
    VALUES ($1,'500g',4000) RETURNING id`, [revisionId])).rows[0].id;
  await client.query('INSERT INTO inventory_levels(option_id,on_hand_quantity,sellable_quantity) VALUES ($1,7,7)', [optionId]);
  await client.query(`INSERT INTO product_publications(product_id,revision_id,published_by_account_id)
    VALUES ($1,$2,$3)`, [productId, revisionId, adminId]);
  const addressId = (await client.query<{ id: string }>(`INSERT INTO customer_addresses
    (account_id,label,recipient_name,phone,postal_code,line1)
    VALUES ($1,'환불 QA','받는 분','01000000000','12345','시험 주소') RETURNING id`, [customerId])).rows[0].id;
  const reservationId = (await client.query<{ id: string }>(`INSERT INTO checkout_reservations
    (account_id,idempotency_key,status,expires_at,ended_at)
    VALUES ($1,$2,'CONSUMED',now()+interval '1 hour',now()) RETURNING id`, [customerId, randomUUID()])).rows[0].id;
  await client.query('INSERT INTO checkout_reservation_lines(reservation_id,option_id,quantity) VALUES ($1,$2,3)',
    [reservationId, optionId]);
  const orderId = (await client.query<{ id: string }>(`INSERT INTO checkout_orders
    (account_id,reservation_id,idempotency_key,request_fingerprint,address_id,recipient_name,phone,
     postal_code,line1,goods_won,goods_discount_won,shipping_fee_won,shipping_support_won,
     payable_won,status,expires_at,ended_at,paid_at)
    VALUES ($1,$2,$3,$4,$5,'받는 분','01000000000','12345','시험 주소',12000,2000,3000,1000,
      12000,'PAID',now()+interval '1 hour',now(),now()) RETURNING id`,
  [customerId, reservationId, randomUUID(), fingerprint, addressId])).rows[0].id;
  const shipmentId = (await client.query<{ id: string }>(`INSERT INTO shipment_orders
    (checkout_order_id,shipment_key,shipping_mode,seller_id,goods_won,goods_discount_won,
     shipping_fee_won,shipping_support_won,payable_won,status)
    VALUES ($1,$2,'seller_direct',$3,12000,2000,3000,1000,12000,'PAID') RETURNING id`,
  [orderId, `seller:${sellerId}`, sellerId])).rows[0].id;
  await client.query(`INSERT INTO shipment_order_lines
    (shipment_order_id,product_id,option_id,seller_id,product_name,option_name,
     unit_price_won,quantity,goods_discount_won,goods_payable_won)
    VALUES ($1,$2,$3,$4,$5,'500g',4000,3,2000,10000)`,
  [shipmentId, productId, optionId, sellerId, `${prefix(value)} 고추`]);
  const paymentAttemptId = (await client.query<{ id: string }>(`INSERT INTO payment_attempts
    (checkout_order_id,provider,provider_order_id,requested_won,idempotency_key,request_fingerprint,status,ended_at)
    VALUES ($1,'mock',$2,12000,$3,$4,'APPROVED',now()) RETURNING id`,
  [orderId, `mock:order:${orderId}`, randomUUID(), fingerprint])).rows[0].id;
  await client.query(`INSERT INTO payment_events
    (payment_attempt_id,provider,provider_event_id,outcome,verified_order_id,provider_payment_id,
     amount_won,event_fingerprint,processing_status,processed_at)
    VALUES ($1,'mock',$2,'APPROVED',$3,$4,12000,$5,'APPLIED',now())`,
  [paymentAttemptId, `mock:event:${randomUUID()}`, orderId, `mock:payment:${randomUUID()}`, fingerprint]);
  return { runId: runId(value), emails, accountIds, sellerId, sellerCategoryId,
    productId, productCategoryId: categoryId, revisionId, optionId, addressId,
    orderId, reservationId, shipmentId };
}

export async function runRefundUiFixture(action: 'seed' | 'reset', value: string,
  databaseUrl: string, password?: string, sharedConsent?: string, manifestInput?: unknown) {
  if (sharedConsent) validateSharedRefundUiTarget(databaseUrl, value, sharedConsent);
  else validateRefundUiTarget(databaseUrl, value);
  const manifest = sharedConsent && action === 'reset' ?
    validateSharedRefundManifest(value, manifestInput) : undefined;
  if (action === 'seed' && (!password || password.length < 12))
    throw new Error('QA_FIXTURE_PASSWORD must be set');
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const client = await pool.connect();
    try {
      await client.query(sharedConsent && action === 'seed' ? 'BEGIN ISOLATION LEVEL SERIALIZABLE' : 'BEGIN');
      const result = action === 'seed' ? await seed(client, value, password!) :
        await resetRefundUiFixture(client, value, sharedConsent ? 4 : 1, manifest);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  } finally { await pool.end(); }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const action = process.argv[2];
  if (action !== 'seed' && action !== 'reset') throw new Error('usage: qa-refund-ui-fixture.ts seed|reset');
  runRefundUiFixture(action, process.env.QA_RUN_ID ?? '', process.env.DATABASE_URL ?? '',
    process.env.QA_FIXTURE_PASSWORD, process.env.QA_SHARED_REFUND_UI,
    process.env.QA_SHARED_REFUND_UI_MANIFEST ? JSON.parse(process.env.QA_SHARED_REFUND_UI_MANIFEST) : undefined)
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : 'QA fixture failed'}\n`);
      process.exitCode = 1; });
}
