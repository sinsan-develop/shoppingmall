import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import { hashPassword } from '../src/auth/credentials.js';

const fingerprint = 'c'.repeat(64);

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

export async function resetRefundUiFixture(client: PoolClient, value: string, maxOrders = 1) {
  const found = await findFixture(client, value);
  const orderIds = found.accountIds.length ? (await client.query<{ id: string }>(
    'SELECT id FROM checkout_orders WHERE account_id=ANY($1::uuid[])', [found.accountIds])).rows.map((row) => row.id) : [];
  if (orderIds.length > maxOrders || found.products.length > 1 || found.accountIds.length > 3)
    throw new Error('Refund UI fixture scope exceeds its bounded accounts, orders or product');
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
    await client.query(`DELETE FROM checkout_reservation_lines WHERE reservation_id IN
      (SELECT id FROM checkout_reservations WHERE account_id=ANY($1::uuid[]))`, [found.accountIds]);
    await client.query('DELETE FROM checkout_reservations WHERE account_id=ANY($1::uuid[])', [found.accountIds]);
    await client.query('DELETE FROM customer_addresses WHERE account_id=ANY($1::uuid[])', [found.accountIds]);
  }
  if (found.products.length) {
    const productIds = found.products.map((row) => row.id);
    const optionIds = (await client.query<{ id: string }>(`SELECT o.id FROM product_options o
      JOIN product_revisions r ON r.id=o.revision_id WHERE r.product_id=ANY($1::uuid[])`, [productIds])).rows
      .map((row) => row.id);
    await client.query('DELETE FROM customer_cart_items WHERE option_id=ANY($1::uuid[])', [optionIds]);
    await client.query('DELETE FROM restock_subscriptions WHERE product_id=ANY($1::uuid[])', [productIds]);
    await client.query('DELETE FROM customer_favorites WHERE product_id=ANY($1::uuid[])', [productIds]);
    await client.query('DELETE FROM inventory_deferred_stock_targets WHERE option_id=ANY($1::uuid[])', [optionIds]);
    await client.query('DELETE FROM stock_change_requests WHERE option_id=ANY($1::uuid[])', [optionIds]);
    await client.query('DELETE FROM product_sale_stop_requests WHERE product_id=ANY($1::uuid[])', [productIds]);
    await client.query('DELETE FROM product_publications WHERE product_id=ANY($1::uuid[])', [productIds]);
    await client.query('DELETE FROM inventory_levels WHERE option_id=ANY($1::uuid[])', [optionIds]);
    await client.query('DELETE FROM product_images WHERE revision_id IN (SELECT id FROM product_revisions WHERE product_id=ANY($1::uuid[]))', [productIds]);
    await client.query('DELETE FROM product_options WHERE id=ANY($1::uuid[])', [optionIds]);
    await client.query('DELETE FROM product_revisions WHERE product_id=ANY($1::uuid[])', [productIds]);
    await client.query('DELETE FROM products WHERE id=ANY($1::uuid[])', [productIds]);
    await client.query('DELETE FROM product_categories WHERE id=ANY($1::uuid[])',
      [found.products.map((row) => row.category_id)]);
  }
  if (found.accountIds.length) {
    await client.query('DELETE FROM audit_events WHERE actor_account_id=ANY($1::uuid[])', [found.accountIds]);
    await client.query('DELETE FROM auth_sessions WHERE account_id=ANY($1::uuid[])', [found.accountIds]);
    await client.query('DELETE FROM account_roles WHERE account_id=ANY($1::uuid[])', [found.accountIds]);
    await client.query('DELETE FROM account_identities WHERE account_id=ANY($1::uuid[])', [found.accountIds]);
    await client.query('DELETE FROM accounts WHERE id=ANY($1::uuid[])', [found.accountIds]);
  }
  if (found.seller) {
    await client.query('DELETE FROM seller_shipping_policies WHERE seller_id=$1', [found.seller.id]);
    await client.query('DELETE FROM seller_shipping_policy_requests WHERE seller_id=$1', [found.seller.id]);
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
  return { runId: runId(value), emails, orderId, reservationId, shipmentId, optionId };
}

export async function runRefundUiFixture(action: 'seed' | 'reset', value: string,
  databaseUrl: string, password?: string, sharedConsent?: string) {
  if (sharedConsent) validateSharedRefundUiTarget(databaseUrl, value, sharedConsent);
  else validateRefundUiTarget(databaseUrl, value);
  if (action === 'seed' && (!password || password.length < 12))
    throw new Error('QA_FIXTURE_PASSWORD must be set');
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = action === 'seed' ? await seed(client, value, password!) :
        await resetRefundUiFixture(client, value, sharedConsent ? 4 : 1);
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
    process.env.QA_FIXTURE_PASSWORD, process.env.QA_SHARED_REFUND_UI).then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : 'QA fixture failed'}\n`);
      process.exitCode = 1; });
}
