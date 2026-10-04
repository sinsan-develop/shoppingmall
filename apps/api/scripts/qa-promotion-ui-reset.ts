import { pathToFileURL } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import { assertQaCatalogResetSafe, resetQaCatalog, runQaCatalogFixture } from './qa-catalog-fixture.js';
import { qaNames, resetQaAccounts, validateQaRunId } from './qa-fixture.js';
import { runQaPublicFixture } from './qa-public-fixture.js';

const isolatedHosts: Record<string, string> = {
  b83f3204: 'shoppingmall-s32-ui-pg-1003',
  e4401004: 'shoppingmall-s32-three-pg-1004',
};

export function assertIsolatedPromotionQaTarget(runId: string, databaseUrl: string) {
  const id = validateQaRunId(runId);
  const url = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hostname !== isolatedHosts[id] || url.port !== '5432' ||
      url.pathname !== '/shoppingmall') {
    throw new Error('Expected isolated promotion QA database');
  }
  return id;
}

export function assertSharedPromotionQaTarget(runId: string, databaseUrl: string) {
  const id = validateQaRunId(runId);
  const url = new URL(databaseUrl);
  if (id !== 'f44f1004' || !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hostname !== 'local-postgres' || url.port !== '5432' ||
      url.pathname !== '/shoppingmall' || url.search || url.hash) {
    throw new Error('Expected exact shared promotion QA database');
  }
  return id;
}

export async function resetPromotionUiFixture(runId: string, databaseUrl: string) {
  const id = validateQaRunId(runId);
  if (id === 'f44f1004') {
    assertSharedPromotionQaTarget(id, databaseUrl);
    return resetSharedPromotionUiFixture(id, databaseUrl);
  }
  assertIsolatedPromotionQaTarget(id, databaseUrl);
  const names = qaNames(id);
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const accounts = await pool.query<{ account_id: string; identifier: string }>(
      `SELECT account_id, identifier FROM account_identities WHERE kind='email'
       AND identifier=ANY($1::text[])`, [names.emails]);
    if (accounts.rows.length !== 5) throw new Error('Expected five exact QA accounts before reset');
    const admin = accounts.rows.find((row) => row.identifier === names.emails[4])!;
    const campaigns = await pool.query<{ id: string; title: string }>(
      'SELECT id,title FROM promotion_campaigns WHERE created_by_account_id=$1', [admin.account_id]);
    const prefix = `QA-${id}-`;
    if (campaigns.rows.some((row) => !row.title.startsWith(prefix))) {
      throw new Error('QA admin owns a campaign outside this run');
    }
    const ids = campaigns.rows.map((row) => row.id);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM promotion_uses WHERE campaign_id=ANY($1::uuid[])', [ids]);
      await client.query(`DELETE FROM promotion_grants WHERE version_id IN
        (SELECT id FROM promotion_versions WHERE campaign_id=ANY($1::uuid[]))`, [ids]);
      await client.query(`DELETE FROM promotion_codes WHERE version_id IN
        (SELECT id FROM promotion_versions WHERE campaign_id=ANY($1::uuid[]))`, [ids]);
      await client.query('DELETE FROM promotion_versions WHERE campaign_id=ANY($1::uuid[])', [ids]);
      await client.query('DELETE FROM promotion_campaigns WHERE id=ANY($1::uuid[])', [ids]);
      const accountIds = accounts.rows.map((row) => row.account_id);
      await client.query(`DELETE FROM checkout_reservation_lines WHERE reservation_id IN
        (SELECT id FROM checkout_reservations WHERE account_id=ANY($1::uuid[]))`, [accountIds]);
      await client.query('DELETE FROM checkout_reservations WHERE account_id=ANY($1::uuid[])', [accountIds]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    if (id === 'e4401004' || id === 'f44f1004') await runQaCatalogFixture('reset', id, databaseUrl);
    else await runQaPublicFixture('reset', id, databaseUrl);
    return { runId: id, removedCampaigns: ids.length, removedAccounts: accounts.rows.length };
  } finally { await pool.end(); }
}

async function assertQaOrdersResetSafe(client: PoolClient, scope: {
  accountIds: string[]; customerId: string; reservationIds: string[];
  sellerIds: string[]; productIds: string[]; optionIds: string[];
  campaignIds: string[]; versionIds: string[]; useIds: string[];
}) {
  const { accountIds, customerId, reservationIds, sellerIds, productIds, optionIds,
    campaignIds, versionIds, useIds } = scope;
  const addresses = await client.query<{ id: string }>(
    'SELECT id FROM customer_addresses WHERE account_id=$1', [customerId]);
  const addressIds = addresses.rows.map((row) => row.id);
  const orders = await client.query<{
    id: string; account_id: string; reservation_id: string; address_id: string;
    status: string; ended_at: Date | null;
  }>(`SELECT o.id,o.account_id,o.reservation_id,o.address_id,o.status,o.ended_at
    FROM checkout_orders o WHERE
      o.account_id=ANY($1::uuid[]) OR o.reservation_id=ANY($2::uuid[])
      OR o.address_id=ANY($3::uuid[])
      OR EXISTS (SELECT 1 FROM shipment_orders s WHERE s.checkout_order_id=o.id
        AND s.seller_id=ANY($4::uuid[]))
      OR EXISTS (SELECT 1 FROM shipment_order_lines l JOIN shipment_orders s
        ON s.id=l.shipment_order_id WHERE s.checkout_order_id=o.id AND
        (l.product_id=ANY($5::uuid[]) OR l.option_id=ANY($6::uuid[])
          OR l.seller_id=ANY($4::uuid[])))
      OR EXISTS (SELECT 1 FROM order_promotion_allocations a WHERE a.checkout_order_id=o.id
        AND (a.campaign_id=ANY($7::uuid[]) OR a.promotion_use_id=ANY($8::uuid[])
          OR a.version_id=ANY($9::uuid[])))
      OR EXISTS (SELECT 1 FROM order_status_events e WHERE e.checkout_order_id=o.id
        AND e.actor_account_id=ANY($1::uuid[]))`,
  [accountIds, reservationIds, addressIds, sellerIds, productIds, optionIds,
    campaignIds, useIds, versionIds]);
  if (orders.rows.length > 1 || orders.rows.some((row) => row.account_id !== customerId ||
      !reservationIds.includes(row.reservation_id) || !addressIds.includes(row.address_id) ||
      row.status !== 'PENDING_PAYMENT' || row.ended_at !== null)) {
    throw new Error('QA order ownership or state differs from pending fixture');
  }
  const orderIds = orders.rows.map((row) => row.id);
  if (!orderIds.length) return orderIds;
  const reservation = await client.query<{ id: string; account_id: string; status: string }>(
    'SELECT id,account_id,status FROM checkout_reservations WHERE id=ANY($1::uuid[])',
    [orders.rows.map((row) => row.reservation_id)]);
  if (reservation.rows.length !== orderIds.length || reservation.rows.some((row) =>
    row.account_id !== customerId || row.status !== 'ACTIVE')) {
    throw new Error('QA order reservation ownership or state differs from fixture');
  }
  const shipments = await client.query<{
    id: string; shipment_key: string; shipping_mode: string; seller_id: string | null; status: string;
  }>('SELECT id,shipment_key,shipping_mode,seller_id,status FROM shipment_orders WHERE checkout_order_id=$1',
  [orderIds[0]]);
  const shipmentIds = shipments.rows.map((row) => row.id);
  if (shipments.rows.length !== 3 ||
      shipments.rows.filter((row) => row.shipping_mode === 'owool_fulfillment' &&
        row.seller_id === null && row.shipment_key === 'owool_fulfillment').length !== 1 ||
      shipments.rows.filter((row) => row.shipping_mode === 'seller_direct' &&
        row.seller_id !== null && sellerIds.includes(row.seller_id) &&
        row.shipment_key === `seller_direct:${row.seller_id}`).length !== 2 ||
      shipments.rows.some((row) => row.status !== 'PENDING_PAYMENT')) {
    throw new Error('QA order shipment ownership or state differs from fixture');
  }
  const lines = await client.query<{
    shipment_order_id: string; product_id: string; option_id: string; seller_id: string;
    actual_product_id: string; actual_seller_id: string; shipping_mode: string;
  }>(`SELECT l.shipment_order_id,l.product_id,l.option_id,l.seller_id,
      r.product_id AS actual_product_id,p.seller_id AS actual_seller_id,r.shipping_mode
    FROM shipment_order_lines l JOIN product_options o ON o.id=l.option_id
    JOIN product_revisions r ON r.id=o.revision_id JOIN products p ON p.id=l.product_id
    WHERE l.shipment_order_id=ANY($1::uuid[])`, [shipmentIds]);
  if (lines.rows.length < 3 || shipments.rows.some((shipment) =>
    !lines.rows.some((line) => line.shipment_order_id === shipment.id)) ||
      lines.rows.some((line) => {
        const shipment = shipments.rows.find((row) => row.id === line.shipment_order_id)!;
        return !productIds.includes(line.product_id) || !optionIds.includes(line.option_id) ||
          !sellerIds.includes(line.seller_id) || line.product_id !== line.actual_product_id ||
          line.seller_id !== line.actual_seller_id || line.shipping_mode !== shipment.shipping_mode ||
          (shipment.seller_id !== null && line.seller_id !== shipment.seller_id);
      })) {
    throw new Error('QA order line references a product or seller outside the fixture');
  }
  const allocations = await client.query<{
    campaign_id: string; version_id: string; promotion_use_id: string;
    use_campaign_id: string; use_version_id: string; use_account_id: string;
    use_reservation_id: string; use_status: string; version_campaign_id: string;
  }>(`SELECT a.campaign_id,a.version_id,a.promotion_use_id,
      u.campaign_id AS use_campaign_id,u.version_id AS use_version_id,
      u.account_id AS use_account_id,u.reservation_id AS use_reservation_id,
      u.status AS use_status,v.campaign_id AS version_campaign_id
    FROM order_promotion_allocations a JOIN promotion_uses u ON u.id=a.promotion_use_id
    JOIN promotion_versions v ON v.id=a.version_id
    WHERE a.checkout_order_id=$1`, [orderIds[0]]);
  if (allocations.rows.some((row) => !campaignIds.includes(row.campaign_id) ||
      !useIds.includes(row.promotion_use_id) || row.campaign_id !== row.use_campaign_id ||
      row.campaign_id !== row.version_campaign_id || row.version_id !== row.use_version_id ||
      row.use_account_id !== customerId || row.use_reservation_id !== orders.rows[0].reservation_id ||
      row.use_status !== 'HELD')) {
    throw new Error('QA order allocation references a promotion outside the fixture');
  }
  const events = await client.query<{ status: string; actor_account_id: string | null }>(
    'SELECT status,actor_account_id FROM order_status_events WHERE checkout_order_id=$1',
    [orderIds[0]]);
  if (!events.rows.length || events.rows.some((row) =>
    row.status !== 'PENDING_PAYMENT' || row.actor_account_id !== customerId)) {
    throw new Error('QA order status event actor or state differs from fixture');
  }
  const foreignAudit = await client.query<{ count: number }>(`SELECT count(*)::int AS count
    FROM audit_events WHERE target_type='checkout_order' AND target_id=ANY($1::text[])
      AND actor_account_id<>ALL($2::uuid[])`, [orderIds, accountIds]);
  if (foreignAudit.rows[0].count !== 0) {
    throw new Error('QA order audit history involves an account outside the fixture');
  }
  return orderIds;
}

async function resetSharedPromotionUiFixture(id: string, databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const names = qaNames(id);
      const accounts = await client.query<{ account_id: string; identifier: string }>(
        `SELECT account_id,identifier FROM account_identities WHERE kind='email'
         AND identifier=ANY($1::text[])`, [names.emails]);
      if (accounts.rows.length !== 5) throw new Error('Expected five exact QA accounts before reset');
      const accountIds = accounts.rows.map((row) => row.account_id);
      const admin = accounts.rows.find((row) => row.identifier === names.emails[4])!;
      const accountShapes = await client.query<{
        account_id: string; identifier: string; identity_count: number; role_count: number;
        role: string; seller_id: string | null;
      }>(`SELECT a.account_id,a.identifier,
        (SELECT count(*)::int FROM account_identities i WHERE i.account_id=a.account_id) AS identity_count,
        (SELECT count(*)::int FROM account_roles r WHERE r.account_id=a.account_id) AS role_count,
        role.role,role.seller_id FROM account_identities a
        JOIN account_roles role ON role.account_id=a.account_id
        WHERE a.kind='email' AND a.identifier=ANY($1::text[])`, [names.emails]);
      if (accountShapes.rows.length !== 5 || accountShapes.rows.some((row) => {
        const index = names.emails.indexOf(row.identifier);
        const expectedRole = index === 0 ? 'customer' : index === 4 ? 'admin' : 'seller';
        return index < 0 || row.identity_count !== 1 || row.role_count !== 1 ||
          row.role !== expectedRole || (row.seller_id === null) !== (expectedRole !== 'seller');
      })) {
        throw new Error('QA account has an identity or role outside this run');
      }
      const campaigns = await client.query<{ id: string; title: string }>(
        'SELECT id,title FROM promotion_campaigns WHERE created_by_account_id=$1', [admin.account_id]);
      if (campaigns.rows.some((row) => !row.title.startsWith(`QA-${id}-`))) {
        throw new Error('QA admin owns a campaign outside this run');
      }
      const campaignIds = campaigns.rows.map((row) => row.id);
      const versionIds = (await client.query<{ id: string }>(
        'SELECT id FROM promotion_versions WHERE campaign_id=ANY($1::uuid[])', [campaignIds],
      )).rows.map((row) => row.id);
      const catalog = await assertQaCatalogResetSafe(client, id, accountIds);
      const sellerIds = (await client.query<{ id: string }>(
        `SELECT s.id FROM sellers s JOIN seller_categories c ON c.id=s.category_id WHERE c.name=$1`,
        [names.category])).rows.map((row) => row.id);
      const optionIds = (await client.query<{ id: string }>(
        'SELECT id FROM product_options WHERE revision_id=ANY($1::uuid[])', [catalog.revisionIds],
      )).rows.map((row) => row.id);
      const reservationIds = (await client.query<{ id: string }>(
        'SELECT id FROM checkout_reservations WHERE account_id=ANY($1::uuid[])', [accountIds],
      )).rows.map((row) => row.id);
      const stockRequestIds = (await client.query<{ id: string }>(
        'SELECT id FROM stock_change_requests WHERE option_id=ANY($1::uuid[])', [optionIds],
      )).rows.map((row) => row.id);
      const shippingRequestIds = (await client.query<{ id: string }>(
        'SELECT id FROM seller_shipping_policy_requests WHERE seller_id=ANY($1::uuid[])', [sellerIds],
      )).rows.map((row) => row.id);
      const useRows = await client.query<{
        id: string; account_id: string; campaign_id: string; version_id: string;
        grant_account_id: string; grant_version_id: string; version_campaign_id: string;
      }>(`SELECT u.id,u.account_id,u.campaign_id,u.version_id,
          g.account_id AS grant_account_id,g.version_id AS grant_version_id,
          v.campaign_id AS version_campaign_id FROM promotion_uses u
         JOIN promotion_grants g ON g.id=u.grant_id
         JOIN promotion_versions v ON v.id=u.version_id
         WHERE u.campaign_id=ANY($1::uuid[]) OR u.account_id=ANY($2::uuid[])`,
        [campaignIds, accountIds]);
      if (useRows.rows.some((row) => !accountIds.includes(row.account_id) ||
          !campaignIds.includes(row.campaign_id) || row.grant_account_id !== row.account_id ||
          row.grant_version_id !== row.version_id || row.version_campaign_id !== row.campaign_id)) {
        throw new Error('QA order promotion use references an account or campaign outside the fixture');
      }
      const useIds = useRows.rows.map((row) => row.id);
      const outsideOperations = await client.query<{ stock: number; shipping: number; policy: number }>(
        `SELECT
          (SELECT count(*)::int FROM stock_change_requests WHERE option_id=ANY($1::uuid[])
           AND (requested_by_account_id<>ALL($3::uuid[]) OR
             (decided_by_account_id IS NOT NULL AND decided_by_account_id<>ALL($3::uuid[])))) AS stock,
          (SELECT count(*)::int FROM seller_shipping_policy_requests WHERE seller_id=ANY($2::uuid[])
           AND (requested_by_account_id<>ALL($3::uuid[]) OR
             (decided_by_account_id IS NOT NULL AND decided_by_account_id<>ALL($3::uuid[])))) AS shipping,
          (SELECT count(*)::int FROM seller_shipping_policies WHERE seller_id=ANY($2::uuid[])
           AND (approved_by_account_id<>ALL($3::uuid[]) OR
             approved_request_id<>ALL($4::uuid[]))) AS policy`,
        [optionIds, sellerIds, accountIds, shippingRequestIds]);
      if (Object.values(outsideOperations.rows[0]).some((count) => count !== 0)) {
        throw new Error('QA stock or shipping history involves accounts outside QA accounts');
      }
      const orderIds = await assertQaOrdersResetSafe(client, {
        accountIds, customerId: accounts.rows.find((row) => row.identifier === names.emails[0])!.account_id,
        reservationIds, sellerIds, productIds: catalog.productIds, optionIds,
        campaignIds, versionIds, useIds,
      });
      const allowedAuditTargets: Record<string, Set<string>> = {
        account: new Set(accountIds),
        seller: new Set(sellerIds),
        product: new Set(catalog.productIds),
        product_option: new Set(optionIds),
        stock_change_request: new Set(stockRequestIds),
        shipping_policy_request: new Set(shippingRequestIds),
        checkout_reservation: new Set(reservationIds),
        promotion_campaign: new Set(campaignIds),
        promotion_use: new Set(useIds),
        checkout_order: new Set(orderIds),
      };
      const audit = await client.query<{ target_type: string; target_id: string; seller_id: string | null }>(
        'SELECT target_type,target_id,seller_id FROM audit_events WHERE actor_account_id=ANY($1::uuid[])',
        [accountIds]);
      if (audit.rows.some((row) => !allowedAuditTargets[row.target_type]?.has(row.target_id) ||
          (row.seller_id !== null && !allowedAuditTargets.seller.has(row.seller_id)))) {
        throw new Error('QA audit history references a target outside this run');
      }
      const outsidePromotions = await client.query<{
        versions: number; grants: number; uses: number; stops: number;
      }>(
        `SELECT
          (SELECT count(*)::int FROM promotion_versions v WHERE v.campaign_id=ANY($1::uuid[])
           AND v.created_by_account_id<>ALL($2::uuid[])) AS versions,
          (SELECT count(*)::int FROM promotion_grants g JOIN promotion_versions v ON v.id=g.version_id
           WHERE v.campaign_id=ANY($1::uuid[]) AND
             (g.account_id<>ALL($2::uuid[]) OR (g.issued_by_account_id IS NOT NULL
               AND g.issued_by_account_id<>ALL($2::uuid[])))) AS grants,
          (SELECT count(*)::int FROM promotion_uses u JOIN checkout_reservations r ON r.id=u.reservation_id
           WHERE u.campaign_id=ANY($1::uuid[]) AND
             (u.account_id<>ALL($2::uuid[]) OR r.account_id<>ALL($2::uuid[]))) AS uses,
          (SELECT count(*)::int FROM promotion_campaigns c WHERE c.id=ANY($1::uuid[])
           AND c.stopped_by_account_id IS NOT NULL
           AND c.stopped_by_account_id<>ALL($2::uuid[])) AS stops`, [campaignIds, accountIds]);
      if (Object.values(outsidePromotions.rows[0]).some((count) => count !== 0)) {
        throw new Error('QA promotion belongs to accounts outside QA accounts');
      }
      await client.query('DELETE FROM order_promotion_allocations WHERE checkout_order_id=ANY($1::uuid[])',
        [orderIds]);
      await client.query('DELETE FROM order_status_events WHERE checkout_order_id=ANY($1::uuid[])',
        [orderIds]);
      await client.query(`DELETE FROM shipment_order_lines WHERE shipment_order_id IN
        (SELECT id FROM shipment_orders WHERE checkout_order_id=ANY($1::uuid[]))`, [orderIds]);
      await client.query('DELETE FROM shipment_orders WHERE checkout_order_id=ANY($1::uuid[])', [orderIds]);
      await client.query('DELETE FROM checkout_orders WHERE id=ANY($1::uuid[])', [orderIds]);
      await client.query('DELETE FROM promotion_uses WHERE campaign_id=ANY($1::uuid[])', [campaignIds]);
      await client.query(`DELETE FROM promotion_grants WHERE version_id IN
        (SELECT id FROM promotion_versions WHERE campaign_id=ANY($1::uuid[]))`, [campaignIds]);
      await client.query(`DELETE FROM promotion_codes WHERE version_id IN
        (SELECT id FROM promotion_versions WHERE campaign_id=ANY($1::uuid[]))`, [campaignIds]);
      await client.query('DELETE FROM promotion_versions WHERE campaign_id=ANY($1::uuid[])', [campaignIds]);
      await client.query('DELETE FROM promotion_campaigns WHERE id=ANY($1::uuid[])', [campaignIds]);
      await client.query(`DELETE FROM checkout_reservation_lines WHERE reservation_id IN
        (SELECT id FROM checkout_reservations WHERE account_id=ANY($1::uuid[]))`, [accountIds]);
      await client.query('DELETE FROM checkout_reservations WHERE account_id=ANY($1::uuid[])', [accountIds]);
      await resetQaCatalog(client, id, accountIds);
      await resetQaAccounts(client, id);
      await client.query('COMMIT');
      return { runId: id, removedCampaigns: campaignIds.length, removedAccounts: accountIds.length };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  } finally { await pool.end(); }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  if (process.argv[2] !== 'reset') throw new Error('usage: qa-promotion-ui-reset.ts reset');
  resetPromotionUiFixture(process.env.QA_RUN_ID ?? '', process.env.DATABASE_URL ?? '')
    .then((result) => { process.stdout.write(`${JSON.stringify(result)}\n`); })
    .catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : 'QA reset failed'}\n`); process.exitCode = 1; });
}
