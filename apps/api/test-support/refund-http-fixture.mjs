import { randomUUID } from 'node:crypto';
import { createSessionToken, hashSessionToken } from '../src/auth/credentials.ts';

const fingerprint = 'b'.repeat(64);

export async function seedRefundHttpFixture(pool) {
  const ids = { accounts: [], categories: [], tokens: {} };
  for (const name of ['customer', 'otherCustomer', 'admin', 'sellerAccount']) {
    const accountId = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    ids.accounts.push(accountId);
    ids[`${name}Id`] = accountId;
  }
  ids.sellerCategoryId = (await pool.query(
    'INSERT INTO seller_categories(name) VALUES ($1) RETURNING id', [`refund-http-${randomUUID()}`],
  )).rows[0].id;
  ids.sellerId = (await pool.query(
    'INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id',
    [ids.sellerCategoryId, `refund-http-seller-${randomUUID()}`],
  )).rows[0].id;
  await pool.query(`INSERT INTO account_roles(account_id,role,seller_id) VALUES
    ($1,'customer',NULL),($2,'customer',NULL),($3,'admin',NULL),($4,'seller',$5)`,
  [ids.customerId, ids.otherCustomerId, ids.adminId, ids.sellerAccountId, ids.sellerId]);
  for (const [name, accountId, role, sellerId] of [
    ['customer', ids.customerId, 'customer', null],
    ['otherCustomer', ids.otherCustomerId, 'customer', null],
    ['admin', ids.adminId, 'admin', null],
    ['seller', ids.sellerAccountId, 'seller', ids.sellerId],
  ]) {
    const token = createSessionToken();
    ids.tokens[name] = token;
    await pool.query(`INSERT INTO auth_sessions(token_hash,account_id,role,seller_id,expires_at)
      VALUES ($1,$2,$3,$4,now()+interval '1 hour')`,
    [hashSessionToken(token), accountId, role, sellerId]);
  }
  const majorId = (await pool.query(
    'INSERT INTO product_categories(name) VALUES ($1) RETURNING id', [`refund-http-major-${randomUUID()}`],
  )).rows[0].id;
  const minorId = (await pool.query(
    'INSERT INTO product_categories(parent_id,name) VALUES ($1,$2) RETURNING id',
    [majorId, `refund-http-minor-${randomUUID()}`],
  )).rows[0].id;
  ids.categories.push(minorId, majorId);
  ids.productId = (await pool.query(
    'INSERT INTO products(seller_id,category_id) VALUES ($1,$2) RETURNING id',
    [ids.sellerId, minorId],
  )).rows[0].id;
  ids.revisionId = (await pool.query(`INSERT INTO product_revisions
    (product_id,version,title,description,origin_label,shipping_mode,status,
     proposed_by_account_id,reviewed_by_account_id,reviewed_at)
    VALUES ($1,1,'환불 HTTP 시험 상품','환불 HTTP 시험','시험 산지','seller_direct','approved',$2,$3,now())
    RETURNING id`, [ids.productId, ids.sellerAccountId, ids.adminId])).rows[0].id;
  ids.optionId = (await pool.query(`INSERT INTO product_options(revision_id,name,price_won)
    VALUES ($1,'기본',4000) RETURNING id`, [ids.revisionId])).rows[0].id;
  await pool.query(`INSERT INTO inventory_levels(option_id,on_hand_quantity,sellable_quantity)
    VALUES ($1,7,7)`, [ids.optionId]);
  await pool.query(`INSERT INTO product_publications(product_id,revision_id,published_by_account_id)
    VALUES ($1,$2,$3)`, [ids.productId, ids.revisionId, ids.adminId]);
  ids.addressId = (await pool.query(`INSERT INTO customer_addresses
    (account_id,label,recipient_name,phone,postal_code,line1)
    VALUES ($1,'시험','받는 분','01000000000','12345','시험 주소') RETURNING id`,
  [ids.customerId])).rows[0].id;
  ids.reservationId = (await pool.query(`INSERT INTO checkout_reservations
    (account_id,idempotency_key,status,expires_at,ended_at)
    VALUES ($1,$2,'CONSUMED',now()+interval '1 hour',now()) RETURNING id`,
  [ids.customerId, randomUUID()])).rows[0].id;
  await pool.query(`INSERT INTO checkout_reservation_lines(reservation_id,option_id,quantity)
    VALUES ($1,$2,3)`, [ids.reservationId, ids.optionId]);
  ids.orderId = (await pool.query(`INSERT INTO checkout_orders
    (account_id,reservation_id,idempotency_key,request_fingerprint,address_id,
     recipient_name,phone,postal_code,line1,goods_won,goods_discount_won,
     shipping_fee_won,shipping_support_won,payable_won,status,expires_at,ended_at,paid_at)
    VALUES ($1,$2,$3,$4,$5,'받는 분','01000000000','12345','시험 주소',
      12000,2000,3000,1000,12000,'PAID',now()+interval '1 hour',now(),now()) RETURNING id`,
  [ids.customerId, ids.reservationId, randomUUID(), fingerprint, ids.addressId])).rows[0].id;
  ids.shipmentId = (await pool.query(`INSERT INTO shipment_orders
    (checkout_order_id,shipment_key,shipping_mode,seller_id,goods_won,goods_discount_won,
     shipping_fee_won,shipping_support_won,payable_won,status)
    VALUES ($1,$2,'seller_direct',$3,12000,2000,3000,1000,12000,'PAID') RETURNING id`,
  [ids.orderId, `seller:${ids.sellerId}`, ids.sellerId])).rows[0].id;
  await pool.query(`INSERT INTO shipment_fulfillments
    (shipment_order_id,fulfillment_seller_id,status,expected_ship_date)
    VALUES ($1,$2,'READY','2026-10-08')`, [ids.shipmentId, ids.sellerId]);
  await pool.query(`INSERT INTO shipment_order_lines
    (shipment_order_id,product_id,option_id,seller_id,product_name,option_name,
     unit_price_won,quantity,goods_discount_won,goods_payable_won)
    VALUES ($1,$2,$3,$4,'환불 HTTP 시험 상품','기본',4000,3,2000,10000)`,
  [ids.shipmentId, ids.productId, ids.optionId, ids.sellerId]);
  ids.paymentAttemptId = (await pool.query(`INSERT INTO payment_attempts
    (checkout_order_id,provider,provider_order_id,requested_won,idempotency_key,
     request_fingerprint,status,ended_at)
    VALUES ($1,'mock',$2,12000,$3,$4,'APPROVED',now()) RETURNING id`,
  [ids.orderId, `mock:order:${ids.orderId}`, randomUUID(), fingerprint])).rows[0].id;
  ids.paymentId = `mock:payment:${randomUUID()}`;
  await pool.query(`INSERT INTO payment_events
    (payment_attempt_id,provider,provider_event_id,outcome,verified_order_id,
     provider_payment_id,amount_won,event_fingerprint,processing_status,processed_at)
    VALUES ($1,'mock',$2,'APPROVED',$3,$4,12000,$5,'APPLIED',now())`,
  [ids.paymentAttemptId, `mock:event:${randomUUID()}`, ids.orderId, ids.paymentId, fingerprint]);
  return ids;
}

export async function cleanupRefundHttpFixture(pool, ids) {
  if (!ids?.orderId) return;
  await pool.query(`DELETE FROM refund_event_conflicts WHERE original_event_id IN
    (SELECT e.id FROM refund_events e JOIN refund_attempts a ON a.id=e.refund_attempt_id
     JOIN refund_cases c ON c.id=a.refund_case_id WHERE c.checkout_order_id=$1)`, [ids.orderId]);
  await pool.query(`DELETE FROM refund_case_events WHERE refund_case_id IN
    (SELECT id FROM refund_cases WHERE checkout_order_id=$1)`, [ids.orderId]);
  await pool.query(`DELETE FROM refund_events WHERE refund_attempt_id IN
    (SELECT a.id FROM refund_attempts a JOIN refund_cases c ON c.id=a.refund_case_id
     WHERE c.checkout_order_id=$1)`, [ids.orderId]);
  await pool.query(`DELETE FROM refund_attempts WHERE refund_case_id IN
    (SELECT id FROM refund_cases WHERE checkout_order_id=$1)`, [ids.orderId]);
  await pool.query(`DELETE FROM refund_case_lines WHERE refund_case_id IN
    (SELECT id FROM refund_cases WHERE checkout_order_id=$1)`, [ids.orderId]);
  await pool.query('DELETE FROM refund_cases WHERE checkout_order_id=$1', [ids.orderId]);
  await pool.query('DELETE FROM payment_events WHERE payment_attempt_id=$1', [ids.paymentAttemptId]);
  await pool.query('DELETE FROM payment_attempts WHERE id=$1', [ids.paymentAttemptId]);
  await pool.query('DELETE FROM shipment_order_lines WHERE shipment_order_id=$1', [ids.shipmentId]);
  await pool.query('DELETE FROM shipment_fulfillment_events WHERE shipment_order_id=$1', [ids.shipmentId]);
  await pool.query(`DELETE FROM audit_events WHERE action='fulfillment.refund_cancelled'
    AND target_type='shipment_order' AND target_id=$1`, [ids.shipmentId]);
  await pool.query('DELETE FROM shipment_fulfillments WHERE shipment_order_id=$1', [ids.shipmentId]);
  await pool.query('DELETE FROM shipment_orders WHERE id=$1', [ids.shipmentId]);
  await pool.query('DELETE FROM checkout_orders WHERE id=$1', [ids.orderId]);
  await pool.query('DELETE FROM checkout_reservation_lines WHERE reservation_id=$1', [ids.reservationId]);
  await pool.query('DELETE FROM checkout_reservations WHERE id=$1', [ids.reservationId]);
  await pool.query('DELETE FROM customer_addresses WHERE id=$1', [ids.addressId]);
  await pool.query('DELETE FROM product_publications WHERE product_id=$1', [ids.productId]);
  await pool.query('DELETE FROM product_sale_stop_requests WHERE product_id=$1', [ids.productId]);
  await pool.query('DELETE FROM inventory_levels WHERE option_id=$1', [ids.optionId]);
  await pool.query('DELETE FROM product_options WHERE id=$1', [ids.optionId]);
  await pool.query('DELETE FROM product_revisions WHERE id=$1', [ids.revisionId]);
  await pool.query('DELETE FROM products WHERE id=$1', [ids.productId]);
  for (const categoryId of ids.categories) await pool.query('DELETE FROM product_categories WHERE id=$1', [categoryId]);
  await pool.query('DELETE FROM auth_sessions WHERE account_id=ANY($1::uuid[])', [ids.accounts]);
  await pool.query('DELETE FROM audit_events WHERE actor_account_id=ANY($1::uuid[])', [ids.accounts]);
  await pool.query('DELETE FROM account_roles WHERE account_id=ANY($1::uuid[])', [ids.accounts]);
  await pool.query('DELETE FROM sellers WHERE id=$1', [ids.sellerId]);
  await pool.query('DELETE FROM seller_categories WHERE id=$1', [ids.sellerCategoryId]);
  await pool.query('DELETE FROM accounts WHERE id=ANY($1::uuid[])', [ids.accounts]);
}

export function refundCookies(ids) {
  return Object.fromEntries(Object.entries(ids.tokens).map(([name, token]) => [name, `sm_session=${token}`]));
}
