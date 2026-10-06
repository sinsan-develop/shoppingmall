import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import { hashPassword } from '../src/auth/credentials.js';
import { validateQaRunId } from './qa-fixture.js';

const fingerprint = '5'.repeat(64);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const expectedShipDate = '2026-10-08';

type PreviousSetting = {
  owoolSellerId: string | null;
  updatedBy: string | null;
  version: number;
  updatedAt: string;
};

export type FulfillmentUiManifest = {
  runId: string;
  emails: string[];
  accountIds: string[];
  sellerIds: string[];
  sellerCategoryId: string;
  productCategoryIds: string[];
  productIds: string[];
  revisionIds: string[];
  optionIds: string[];
  orderIds: string[];
  reservationIds: string[];
  shipmentIds: string[];
  addressId: string;
  previousFulfillmentSetting: PreviousSetting;
  signature: string;
};

type UnsignedFulfillmentUiManifest = Omit<FulfillmentUiManifest, 'signature'>;

function id(value: string) { return validateQaRunId(value); }
function prefix(value: string) { return `qa-${id(value)}-fulfillment`; }

export function fulfillmentUiDatabaseName(value: string) {
  return `shoppingmall_s5_fulfillment_ui_${id(value)}`;
}

export function fulfillmentUiEmails(value: string) {
  const runId = id(value);
  return ['customer', 'seller-a', 'seller-b', 'owool', 'admin']
    .map((role) => `qa+${runId}-fulfillment-${role}@example.invalid`);
}

export function validateFulfillmentUiTarget(databaseUrl: string, value: string) {
  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (database !== fulfillmentUiDatabaseName(value))
    throw new Error('Fulfillment UI fixture requires its exact isolated database');
  return { url, database };
}

function exactUuidArray(value: unknown, length: number) {
  return Array.isArray(value) && value.length === length && new Set(value).size === length &&
    value.every((entry) => typeof entry === 'string' && uuid.test(entry));
}

function manifestPayload(manifest: UnsignedFulfillmentUiManifest) {
  return JSON.stringify([
    manifest.runId, manifest.emails, manifest.accountIds, manifest.sellerIds,
    manifest.sellerCategoryId, manifest.productCategoryIds, manifest.productIds,
    manifest.revisionIds, manifest.optionIds, manifest.orderIds, manifest.reservationIds,
    manifest.shipmentIds, manifest.addressId, manifest.previousFulfillmentSetting,
  ]);
}

export function signFulfillmentUiManifest(manifest: UnsignedFulfillmentUiManifest, password: string) {
  if (typeof password !== 'string' || password.length < 12)
    throw new Error('QA_FIXTURE_PASSWORD must be set');
  return createHmac('sha256', password).update(manifestPayload(manifest)).digest('hex');
}

export function validateFulfillmentUiSystemTarget(value: string, expectedSystemId: string | undefined,
  actual: { databaseName?: string; systemId?: string }) {
  if (!/^\d{10,}$/.test(expectedSystemId ?? '') || actual.systemId !== expectedSystemId ||
      actual.databaseName !== fulfillmentUiDatabaseName(value))
    throw new Error('Fulfillment UI fixture requires its exact database system identifier and name');
  return { databaseName: actual.databaseName, systemId: actual.systemId };
}

export function validateFulfillmentUiManifest(value: string, candidate: unknown,
  password: string): FulfillmentUiManifest {
  const manifest = candidate as Partial<FulfillmentUiManifest> | null;
  const previous = manifest?.previousFulfillmentSetting as Partial<PreviousSetting> | undefined;
  if (!manifest || manifest.runId !== id(value) ||
      JSON.stringify(manifest.emails) !== JSON.stringify(fulfillmentUiEmails(value)) ||
      !exactUuidArray(manifest.accountIds, 5) || !exactUuidArray(manifest.sellerIds, 3) ||
      typeof manifest.sellerCategoryId !== 'string' || !uuid.test(manifest.sellerCategoryId) ||
      !exactUuidArray(manifest.productCategoryIds, 5) ||
      !exactUuidArray(manifest.productIds, 3) || !exactUuidArray(manifest.revisionIds, 3) ||
      !exactUuidArray(manifest.optionIds, 3) || !exactUuidArray(manifest.orderIds, 3) ||
      !exactUuidArray(manifest.reservationIds, 3) || !exactUuidArray(manifest.shipmentIds, 3) ||
      typeof manifest.addressId !== 'string' || !uuid.test(manifest.addressId) ||
      !previous || !(previous.owoolSellerId === null ||
        (typeof previous.owoolSellerId === 'string' && uuid.test(previous.owoolSellerId))) ||
      !(previous.updatedBy === null || (typeof previous.updatedBy === 'string' && uuid.test(previous.updatedBy))) ||
      !Number.isInteger(previous.version) || Number(previous.version) < 0 ||
      typeof previous.updatedAt !== 'string' || Number.isNaN(Date.parse(previous.updatedAt)) ||
      typeof manifest.signature !== 'string' || !/^[0-9a-f]{64}$/.test(manifest.signature)) {
    throw new Error('Fulfillment UI reset requires exact creation manifest');
  }
  const { signature, ...unsigned } = manifest as FulfillmentUiManifest;
  const expected = Buffer.from(signFulfillmentUiManifest(unsigned, password), 'hex');
  const supplied = Buffer.from(signature, 'hex');
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied))
    throw new Error('Fulfillment UI reset manifest signature mismatch');
  return manifest as FulfillmentUiManifest;
}

function snapshot(status: string, date: string | null, carrierCode: string | null,
  trackingNumber: string | null) {
  return { status, expectedShipDate: date, carrierCode, trackingNumber };
}

async function insertFulfillmentEvent(client: PoolClient, input: {
  shipmentId: string; action: string; from: string; to: string;
  before: ReturnType<typeof snapshot>; after: ReturnType<typeof snapshot>;
  actorAccountId?: string; actorSellerId?: string; role?: string;
  reason?: string; customerMessage?: string; occurredAt: Date;
}) {
  await client.query(`INSERT INTO shipment_fulfillment_events
    (shipment_order_id,action,from_status,to_status,actor_account_id,actor_role,actor_seller_id,
      reason,customer_message,before_snapshot,after_snapshot,idempotency_scope,idempotency_key,
      request_fingerprint,occurred_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15)`, [
    input.shipmentId, input.action, input.from, input.to, input.actorAccountId ?? null,
    input.role ?? null, input.actorSellerId ?? null, input.reason ?? null,
    input.customerMessage ?? null, JSON.stringify(input.before), JSON.stringify(input.after),
    input.actorAccountId ?? 'system:payment', randomUUID(), fingerprint, input.occurredAt,
  ]);
}

async function seedFixture(client: PoolClient, value: string, password: string): Promise<FulfillmentUiManifest> {
  const runId = id(value);
  const emails = fulfillmentUiEmails(runId);
  const fixturePrefix = prefix(runId);
  const existing = await client.query(`SELECT 1 FROM account_identities WHERE identifier=ANY($1::text[])
    UNION ALL SELECT 1 FROM seller_categories WHERE name=$2
    UNION ALL SELECT 1 FROM product_revisions WHERE title LIKE $3 LIMIT 1`,
  [emails, `${fixturePrefix}-sellers`, `${fixturePrefix}-%`]);
  if (existing.rowCount) throw new Error('Fulfillment UI fixture already exists; reset it with its manifest');

  const digest = await hashPassword(password);
  const sellerCategoryId = (await client.query<{ id: string }>(
    'INSERT INTO seller_categories(name) VALUES ($1) RETURNING id', [`${fixturePrefix}-sellers`])).rows[0].id;
  const sellerNames = [`${fixturePrefix}-seller-a`, `${fixturePrefix}-seller-b`, `${fixturePrefix}-owool`];
  const sellerIds: string[] = [];
  for (const name of sellerNames) sellerIds.push((await client.query<{ id: string }>(
    'INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id',
    [sellerCategoryId, name])).rows[0].id);

  const accountIds: string[] = [];
  for (const [index, email] of emails.entries()) {
    const accountId = (await client.query<{ id: string }>('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    accountIds.push(accountId);
    await client.query(`INSERT INTO account_identities
      (account_id,kind,identifier,password_hash,verified_at) VALUES ($1,'email',$2,$3,now())`,
    [accountId, email, digest]);
    if (index === 0) await client.query("INSERT INTO account_roles(account_id,role) VALUES ($1,'customer')", [accountId]);
    else if (index === 4) await client.query("INSERT INTO account_roles(account_id,role) VALUES ($1,'admin')", [accountId]);
    else await client.query("INSERT INTO account_roles(account_id,role,seller_id) VALUES ($1,'seller',$2)",
      [accountId, sellerIds[index - 1]]);
  }

  const productSpecs = [
    { item: '고추', major: '채소', sellerIndex: 0, priceWon: 23000, shippingMode: 'seller_direct' },
    { item: '마늘', major: '채소', sellerIndex: 1, priceWon: 16000, shippingMode: 'seller_direct' },
    { item: '고춧가루', major: '가공식품', sellerIndex: 2, priceWon: 18000, shippingMode: 'owool_fulfillment' },
  ];
  const productIds: string[] = [];
  const revisionIds: string[] = [];
  const optionIds: string[] = [];
  const productCategoryIds: string[] = [];
  const majorIds = new Map<string, string>();
  for (const spec of productSpecs) {
    let majorId = majorIds.get(spec.major);
    if (!majorId) {
      majorId = (await client.query<{ id: string }>(
        'INSERT INTO product_categories(name) VALUES ($1) RETURNING id',
        [`${fixturePrefix}-${spec.major}`])).rows[0].id;
      majorIds.set(spec.major, majorId);
      productCategoryIds.push(majorId);
    }
    const minorId = (await client.query<{ id: string }>(
      'INSERT INTO product_categories(parent_id,name) VALUES ($1,$2) RETURNING id',
      [majorId, `${fixturePrefix}-${spec.item}`])).rows[0].id;
    productCategoryIds.push(minorId);
    const productId = (await client.query<{ id: string }>(
      'INSERT INTO products(seller_id,category_id) VALUES ($1,$2) RETURNING id',
      [sellerIds[spec.sellerIndex], minorId])).rows[0].id;
    const revisionId = (await client.query<{ id: string }>(`INSERT INTO product_revisions
      (product_id,version,title,description,origin_label,shipping_mode,status,
        proposed_by_account_id,reviewed_by_account_id,reviewed_at)
      VALUES ($1,1,$2,'출고 QA 전용 가상 상품','가상 산지',$3,'approved',$4,$5,now()) RETURNING id`,
    [productId, `${fixturePrefix}-${spec.item}`, spec.shippingMode,
      accountIds[spec.sellerIndex + 1], accountIds[4]])).rows[0].id;
    const optionId = (await client.query<{ id: string }>(
      "INSERT INTO product_options(revision_id,name,price_won,display_order) VALUES ($1,'기본',$2,0) RETURNING id",
      [revisionId, spec.priceWon])).rows[0].id;
    await client.query('INSERT INTO inventory_levels(option_id,on_hand_quantity,sellable_quantity) VALUES ($1,20,20)',
      [optionId]);
    await client.query('INSERT INTO product_publications(product_id,revision_id,published_by_account_id) VALUES ($1,$2,$3)',
      [productId, revisionId, accountIds[4]]);
    productIds.push(productId); revisionIds.push(revisionId); optionIds.push(optionId);
  }

  const addressId = (await client.query<{ id: string }>(`INSERT INTO customer_addresses
    (account_id,label,recipient_name,phone,postal_code,line1,line2)
    VALUES ($1,'출고 QA','가상고객','01000000000','12345','서울시 가상구 테스트로 1','가상 101호') RETURNING id`,
  [accountIds[0]])).rows[0].id;
  const setting = (await client.query<{
    owool_seller_id: string | null; updated_by: string | null; version: number; updated_at: Date;
  }>('SELECT owool_seller_id,updated_by,version,updated_at FROM fulfillment_settings WHERE id=1 FOR UPDATE')).rows[0];
  if (!setting) throw new Error('Fulfillment setting singleton is missing');
  const previousFulfillmentSetting = {
    owoolSellerId: setting.owool_seller_id, updatedBy: setting.updated_by,
    version: setting.version, updatedAt: setting.updated_at.toISOString(),
  };
  await client.query(`UPDATE fulfillment_settings SET owool_seller_id=$1,updated_by=$2,
    version=version+1,updated_at=clock_timestamp() WHERE id=1`, [sellerIds[2], accountIds[4]]);

  const reservationIds: string[] = [];
  const orderIds: string[] = [];
  const shipmentIds: string[] = [];
  const statuses = ['READY', 'DELAYED', 'SHIPPED'];
  for (const [index, spec] of productSpecs.entries()) {
    const createdAt = new Date(Date.parse('2026-10-06T00:00:00.000Z') + index * 60_000);
    const paidAt = new Date(createdAt.getTime() + 120_000);
    const reservationId = (await client.query<{ id: string }>(`INSERT INTO checkout_reservations
      (account_id,idempotency_key,status,created_at,expires_at,ended_at)
      VALUES ($1,$2,'CONSUMED',$3,$4,$5) RETURNING id`,
    [accountIds[0], randomUUID(), createdAt, new Date(createdAt.getTime() + 3_600_000), paidAt])).rows[0].id;
    reservationIds.push(reservationId);
    await client.query('INSERT INTO checkout_reservation_lines(reservation_id,option_id,quantity) VALUES ($1,$2,1)',
      [reservationId, optionIds[index]]);
    const payableWon = spec.priceWon + 3000;
    const orderId = (await client.query<{ id: string }>(`INSERT INTO checkout_orders
      (account_id,reservation_id,idempotency_key,request_fingerprint,address_id,recipient_name,phone,
        postal_code,line1,line2,goods_won,goods_discount_won,shipping_fee_won,shipping_support_won,
        payable_won,status,created_at,expires_at,ended_at,paid_at)
      VALUES ($1,$2,$3,$4,$5,'가상고객','01000000000','12345','서울시 가상구 테스트로 1',
        '가상 101호',$6,0,3000,0,$7,'PAID',$8,$9,$10,$10) RETURNING id`,
    [accountIds[0], reservationId, randomUUID(), fingerprint, addressId, spec.priceWon,
      payableWon, createdAt, new Date(createdAt.getTime() + 3_600_000), paidAt])).rows[0].id;
    orderIds.push(orderId);
    const sellerId = spec.shippingMode === 'seller_direct' ? sellerIds[spec.sellerIndex] : null;
    const shipmentId = (await client.query<{ id: string }>(`INSERT INTO shipment_orders
      (checkout_order_id,shipment_key,shipping_mode,seller_id,goods_won,goods_discount_won,
        shipping_fee_won,shipping_support_won,payable_won,status)
      VALUES ($1,$2,$3,$4,$5,0,3000,0,$6,'PAID') RETURNING id`,
    [orderId, `${spec.shippingMode}:${index}`, spec.shippingMode, sellerId,
      spec.priceWon, payableWon])).rows[0].id;
    shipmentIds.push(shipmentId);
    await client.query(`INSERT INTO shipment_order_lines
      (shipment_order_id,product_id,option_id,seller_id,product_name,option_name,
        unit_price_won,quantity,goods_discount_won,goods_payable_won)
      VALUES ($1,$2,$3,$4,$5,'기본',$6,1,0,$6)`,
    [shipmentId, productIds[index], optionIds[index], sellerIds[spec.sellerIndex],
      `${fixturePrefix}-${spec.item}`, spec.priceWon]);

    const status = statuses[index];
    const delayedDate = status === 'DELAYED' ? '2026-10-10' : expectedShipDate;
    await client.query(`INSERT INTO shipment_fulfillments
      (shipment_order_id,fulfillment_seller_id,status,cutoff_time,expected_ship_date,carrier_code,
        carrier_name,tracking_number,packed_at,first_shipped_at,shipped_at,version,created_at,updated_at)
      VALUES ($1,$2,$3,'14:00',$4,$5,NULL,$6,$7,$8,$8,$9,$10,$10)`, [
      shipmentId, sellerIds[spec.sellerIndex], status, delayedDate,
      status === 'SHIPPED' ? 'hanjin' : null, status === 'SHIPPED' ? `QA${runId.toUpperCase()}` : null,
      status === 'SHIPPED' ? new Date(paidAt.getTime() + 60_000) : null,
      status === 'SHIPPED' ? new Date(paidAt.getTime() + 120_000) : null,
      status === 'READY' ? 0 : status === 'DELAYED' ? 1 : 2, paidAt,
    ]);
    await insertFulfillmentEvent(client, { shipmentId, action: 'PAYMENT_CONFIRMED',
      from: 'PAYMENT_PENDING', to: 'READY', before: snapshot('PAYMENT_PENDING', null, null, null),
      after: snapshot('READY', expectedShipDate, null, null), occurredAt: paidAt });
    if (status === 'DELAYED') await insertFulfillmentEvent(client, {
      shipmentId, action: 'REPORT_DELAY', from: 'READY', to: 'DELAYED',
      before: snapshot('READY', expectedShipDate, null, null),
      after: snapshot('DELAYED', delayedDate, null, null), actorAccountId: accountIds[2],
      actorSellerId: sellerIds[1], role: 'seller', reason: '가상 산지 출고 일정 조정',
      customerMessage: '가상 시험 주문의 출고 예정일이 조정되었습니다',
      occurredAt: new Date(paidAt.getTime() + 60_000),
    });
    if (status === 'SHIPPED') {
      const packedAt = new Date(paidAt.getTime() + 60_000);
      const shippedAt = new Date(paidAt.getTime() + 120_000);
      await insertFulfillmentEvent(client, { shipmentId, action: 'START_PACKING', from: 'READY', to: 'PACKING',
        before: snapshot('READY', expectedShipDate, null, null),
        after: snapshot('PACKING', expectedShipDate, null, null), actorAccountId: accountIds[3],
        actorSellerId: sellerIds[2], role: 'seller', occurredAt: packedAt });
      await insertFulfillmentEvent(client, { shipmentId, action: 'MARK_SHIPPED', from: 'PACKING', to: 'SHIPPED',
        before: snapshot('PACKING', expectedShipDate, null, null),
        after: snapshot('SHIPPED', expectedShipDate, 'hanjin', `QA${runId.toUpperCase()}`),
        actorAccountId: accountIds[3], actorSellerId: sellerIds[2], role: 'seller', occurredAt: shippedAt });
    }
    await client.query(`INSERT INTO order_status_events(checkout_order_id,status,reason,created_at)
      VALUES ($1,'PAID','출고 QA 모의 결제 승인',$2)`, [orderId, paidAt]);
    const attemptId = (await client.query<{ id: string }>(`INSERT INTO payment_attempts
      (checkout_order_id,provider,provider_order_id,requested_won,idempotency_key,request_fingerprint,
        status,created_at,ended_at)
      VALUES ($1,'mock',$2,$3,$4,$5,'APPROVED',$6,$6) RETURNING id`,
    [orderId, `qa-${runId}-fulfillment-${index}`, payableWon, randomUUID(), fingerprint, paidAt])).rows[0].id;
    await client.query(`INSERT INTO payment_events
      (payment_attempt_id,provider,provider_event_id,outcome,verified_order_id,provider_payment_id,
        amount_won,event_fingerprint,received_at,processing_status,processed_at)
      VALUES ($1,'mock',$2,'APPROVED',$3,$4,$5,$6,$7,'APPLIED',$7)`,
    [attemptId, `qa-${runId}-fulfillment-event-${index}`, orderId,
      `qa-${runId}-fulfillment-payment-${index}`, payableWon, fingerprint, paidAt]);
  }

  const unsigned = { runId, emails, accountIds, sellerIds, sellerCategoryId, productCategoryIds,
    productIds, revisionIds, optionIds, orderIds, reservationIds, shipmentIds, addressId,
    previousFulfillmentSetting };
  return { ...unsigned, signature: signFulfillmentUiManifest(unsigned, password) };
}

async function assertResetOwnership(client: PoolClient, manifest: FulfillmentUiManifest) {
  await client.query("SET LOCAL lock_timeout = '1s'");
  await client.query("SET LOCAL statement_timeout = '5s'");
  await client.query('SELECT id FROM accounts WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [manifest.accountIds]);
  await client.query('SELECT id FROM seller_categories WHERE id=$1 FOR UPDATE', [manifest.sellerCategoryId]);
  await client.query('SELECT id FROM sellers WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [manifest.sellerIds]);
  await client.query('SELECT id FROM product_categories WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
    [manifest.productCategoryIds]);
  await client.query('SELECT id FROM products WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [manifest.productIds]);
  await client.query('SELECT id FROM product_revisions WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
    [manifest.revisionIds]);
  await client.query('SELECT id FROM product_options WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
    [manifest.optionIds]);
  await client.query('SELECT id FROM customer_addresses WHERE id=$1 FOR UPDATE', [manifest.addressId]);
  await client.query('SELECT id FROM checkout_reservations WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
    [manifest.reservationIds]);
  await client.query('SELECT id FROM checkout_orders WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [manifest.orderIds]);
  await client.query('SELECT id FROM shipment_orders WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
    [manifest.shipmentIds]);
  await client.query(`SELECT shipment_order_id FROM shipment_fulfillments
    WHERE shipment_order_id=ANY($1::uuid[]) ORDER BY shipment_order_id FOR UPDATE`, [manifest.shipmentIds]);
  await client.query(`SELECT id FROM payment_attempts WHERE checkout_order_id=ANY($1::uuid[])
    ORDER BY id FOR UPDATE`, [manifest.orderIds]);
  await client.query(`SELECT id FROM payment_events WHERE payment_attempt_id IN
    (SELECT id FROM payment_attempts WHERE checkout_order_id=ANY($1::uuid[])) ORDER BY id FOR UPDATE`,
  [manifest.orderIds]);
  await client.query('LOCK TABLE audit_events IN SHARE ROW EXCLUSIVE MODE');

  const identities = await client.query<{ account_id: string; kind: string; identifier: string }>(
    'SELECT account_id,kind,identifier FROM account_identities WHERE account_id=ANY($1::uuid[]) ORDER BY account_id',
    [manifest.accountIds]);
  if (identities.rows.length !== 5 || identities.rows.some((row) => {
    const index = manifest.accountIds.indexOf(row.account_id);
    return index < 0 || row.kind !== 'email' || row.identifier !== manifest.emails[index];
  })) throw new Error('Fulfillment UI fixture contains foreign identity or ownership data');

  const roles = await client.query<{ account_id: string; role: string; seller_id: string | null }>(
    'SELECT account_id,role,seller_id FROM account_roles WHERE account_id=ANY($1::uuid[])', [manifest.accountIds]);
  if (roles.rows.length !== 5 || roles.rows.some((row) => {
    const index = manifest.accountIds.indexOf(row.account_id);
    const role = index === 0 ? 'customer' : index === 4 ? 'admin' : 'seller';
    const sellerId = index > 0 && index < 4 ? manifest.sellerIds[index - 1] : null;
    return index < 0 || row.role !== role || row.seller_id !== sellerId;
  })) throw new Error('Fulfillment UI fixture contains foreign role or ownership data');

  const sellers = await client.query<{ id: string; category_id: string }>(
    'SELECT id,category_id FROM sellers WHERE id=ANY($1::uuid[])', [manifest.sellerIds]);
  const categories = await client.query<{ id: string; parent_id: string | null; name: string }>(
    `SELECT id,parent_id,name FROM product_categories
      WHERE id=ANY($1::uuid[]) OR name LIKE $2`,
    [manifest.productCategoryIds, `${prefix(manifest.runId)}-%`]);
  if (sellers.rows.length !== 3 || sellers.rows.some((row) => row.category_id !== manifest.sellerCategoryId) ||
      categories.rows.length !== 5 || categories.rows.some((row) => !manifest.productCategoryIds.includes(row.id)))
    throw new Error('Fulfillment UI fixture contains foreign category or ownership data');

  const scope = (await client.query<{
    accounts: number; sellers: number; products: number; revisions: number; options: number;
    addresses: number; reservations: number; orders: number; shipments: number; fulfillments: number;
  }>(`SELECT
    (SELECT count(*)::int FROM accounts WHERE id=ANY($1::uuid[])) AS accounts,
    (SELECT count(*)::int FROM sellers WHERE id=ANY($2::uuid[])) AS sellers,
    (SELECT count(*)::int FROM products WHERE id=ANY($3::uuid[])) AS products,
    (SELECT count(*)::int FROM product_revisions WHERE id=ANY($4::uuid[]) AND product_id=ANY($3::uuid[])) AS revisions,
    (SELECT count(*)::int FROM product_options WHERE id=ANY($5::uuid[]) AND revision_id=ANY($4::uuid[])) AS options,
    (SELECT count(*)::int FROM customer_addresses WHERE id=$6 AND account_id=$7) AS addresses,
    (SELECT count(*)::int FROM checkout_reservations WHERE id=ANY($8::uuid[]) AND account_id=$7) AS reservations,
    (SELECT count(*)::int FROM checkout_orders WHERE id=ANY($9::uuid[]) AND account_id=$7
      AND reservation_id=ANY($8::uuid[]) AND address_id=$6) AS orders,
    (SELECT count(*)::int FROM shipment_orders WHERE id=ANY($10::uuid[]) AND checkout_order_id=ANY($9::uuid[])) AS shipments,
    (SELECT count(*)::int FROM shipment_fulfillments WHERE shipment_order_id=ANY($10::uuid[])
      AND fulfillment_seller_id=ANY($2::uuid[])) AS fulfillments`, [
    manifest.accountIds, manifest.sellerIds, manifest.productIds, manifest.revisionIds,
    manifest.optionIds, manifest.addressId, manifest.accountIds[0], manifest.reservationIds,
    manifest.orderIds, manifest.shipmentIds,
  ])).rows[0];
  if (JSON.stringify(scope) !== JSON.stringify({ accounts: 5, sellers: 3, products: 3,
    revisions: 3, options: 3, addresses: 1, reservations: 3, orders: 3, shipments: 3,
    fulfillments: 3 })) throw new Error('Fulfillment UI fixture ownership differs from creation manifest');

  const foreign = await client.query(`SELECT 1 FROM checkout_orders
      WHERE (account_id=$1 OR reservation_id=ANY($2::uuid[]) OR address_id=$3)
        AND NOT(id=ANY($4::uuid[]))
    UNION ALL SELECT 1 FROM shipment_orders
      WHERE checkout_order_id=ANY($4::uuid[]) AND NOT(id=ANY($5::uuid[]))
    UNION ALL SELECT 1 FROM shipment_order_lines
      WHERE (product_id=ANY($6::uuid[]) OR option_id=ANY($7::uuid[]) OR seller_id=ANY($8::uuid[]))
        AND NOT(shipment_order_id=ANY($5::uuid[]))
    UNION ALL SELECT 1 FROM customer_cart_items WHERE option_id=ANY($7::uuid[])
    UNION ALL SELECT 1 FROM customer_favorites WHERE product_id=ANY($6::uuid[])
    UNION ALL SELECT 1 FROM restock_subscriptions WHERE product_id=ANY($6::uuid[])
    UNION ALL SELECT 1 FROM refund_cases WHERE checkout_order_id=ANY($4::uuid[])
    LIMIT 1`, [manifest.accountIds[0], manifest.reservationIds, manifest.addressId,
    manifest.orderIds, manifest.shipmentIds, manifest.productIds, manifest.optionIds, manifest.sellerIds]);
  if (foreign.rowCount) throw new Error('Fulfillment UI fixture has a foreign reference');

  const paymentConflicts = await client.query(`SELECT c.id FROM payment_event_conflicts c
    JOIN payment_events e ON e.id=c.original_event_id
    JOIN payment_attempts original_attempt ON original_attempt.id=e.payment_attempt_id
    JOIN payment_attempts incoming_attempt ON incoming_attempt.id=c.incoming_attempt_id
    WHERE original_attempt.checkout_order_id=ANY($1::uuid[])
       OR incoming_attempt.checkout_order_id=ANY($1::uuid[])
    LIMIT 1`, [manifest.orderIds]);
  if (paymentConflicts.rowCount) throw new Error('Fulfillment UI fixture has a foreign payment conflict');

  const eventActors = await client.query(`SELECT 1 FROM shipment_fulfillment_events
    WHERE shipment_order_id=ANY($1::uuid[]) AND
      ((actor_account_id IS NOT NULL AND NOT(actor_account_id=ANY($2::uuid[]))) OR
       (actor_seller_id IS NOT NULL AND NOT(actor_seller_id=ANY($3::uuid[])))) LIMIT 1`,
  [manifest.shipmentIds, manifest.accountIds, manifest.sellerIds]);
  if (eventActors.rowCount) throw new Error('Fulfillment UI fixture has a foreign event actor');

  const audits = await client.query<{ id: string; actor_account_id: string; active_role: string;
    seller_id: string | null; action: string; target_type: string; target_id: string }>(
    `SELECT id,actor_account_id,active_role,seller_id,action,target_type,target_id FROM audit_events
      WHERE actor_account_id=ANY($1::uuid[]) ORDER BY id`, [manifest.accountIds]);
  const allowedAudit = audits.rows.every((row) => {
    const accountIndex = manifest.accountIds.indexOf(row.actor_account_id);
    if (row.action === 'auth.login' && row.target_type === 'account' && row.target_id === row.actor_account_id) {
      const expectedRole = accountIndex === 0 ? 'customer' : accountIndex === 4 ? 'admin' : 'seller';
      const expectedSeller = accountIndex > 0 && accountIndex < 4 ? manifest.sellerIds[accountIndex - 1] : null;
      return row.active_role === expectedRole && row.seller_id === expectedSeller;
    }
    if (row.action === 'fulfillment.seller_transition' && row.target_type === 'shipment_order')
      return accountIndex > 0 && accountIndex < 4 && row.active_role === 'seller' &&
        row.seller_id === manifest.sellerIds[accountIndex - 1] && manifest.shipmentIds.includes(row.target_id);
    if (row.action === 'fulfillment.admin_correction' && row.target_type === 'shipment_order')
      return accountIndex === 4 && row.active_role === 'admin' && row.seller_id === null &&
        manifest.shipmentIds.includes(row.target_id);
    return false;
  });
  if (!allowedAudit) throw new Error('Fulfillment UI fixture has foreign audit ownership data');

  const setting = (await client.query<{ owool_seller_id: string | null; updated_by: string | null; version: number }>(
    'SELECT owool_seller_id,updated_by,version FROM fulfillment_settings WHERE id=1 FOR UPDATE')).rows[0];
  if (!setting || setting.owool_seller_id !== manifest.sellerIds[2] ||
      setting.updated_by !== manifest.accountIds[4] ||
      setting.version !== manifest.previousFulfillmentSetting.version + 1)
    throw new Error('Fulfillment UI setting ownership differs from creation manifest');
  return audits.rows.map((row) => row.id);
}

async function resetFixture(client: PoolClient, manifest: FulfillmentUiManifest) {
  const auditIds = await assertResetOwnership(client, manifest);
  await client.query(`DELETE FROM payment_event_conflicts WHERE original_event_id IN
    (SELECT e.id FROM payment_events e JOIN payment_attempts a ON a.id=e.payment_attempt_id
      WHERE a.checkout_order_id=ANY($1::uuid[])) OR incoming_attempt_id IN
    (SELECT id FROM payment_attempts WHERE checkout_order_id=ANY($1::uuid[]))`, [manifest.orderIds]);
  await client.query(`DELETE FROM payment_events WHERE payment_attempt_id IN
    (SELECT id FROM payment_attempts WHERE checkout_order_id=ANY($1::uuid[]))`, [manifest.orderIds]);
  await client.query('DELETE FROM payment_attempts WHERE checkout_order_id=ANY($1::uuid[])', [manifest.orderIds]);
  await client.query('DELETE FROM shipment_fulfillment_events WHERE shipment_order_id=ANY($1::uuid[])', [manifest.shipmentIds]);
  await client.query('DELETE FROM order_status_events WHERE checkout_order_id=ANY($1::uuid[])', [manifest.orderIds]);
  await client.query('DELETE FROM shipment_order_lines WHERE shipment_order_id=ANY($1::uuid[])', [manifest.shipmentIds]);
  await client.query('DELETE FROM shipment_fulfillments WHERE shipment_order_id=ANY($1::uuid[])', [manifest.shipmentIds]);
  await client.query('DELETE FROM shipment_orders WHERE id=ANY($1::uuid[])', [manifest.shipmentIds]);
  await client.query('DELETE FROM checkout_orders WHERE id=ANY($1::uuid[])', [manifest.orderIds]);
  await client.query('DELETE FROM checkout_reservation_lines WHERE reservation_id=ANY($1::uuid[])', [manifest.reservationIds]);
  await client.query('DELETE FROM checkout_reservations WHERE id=ANY($1::uuid[])', [manifest.reservationIds]);
  await client.query('DELETE FROM customer_addresses WHERE id=$1', [manifest.addressId]);
  await client.query(`UPDATE fulfillment_settings SET owool_seller_id=$1,updated_by=$2,version=$3,updated_at=$4
    WHERE id=1`, [manifest.previousFulfillmentSetting.owoolSellerId,
    manifest.previousFulfillmentSetting.updatedBy, manifest.previousFulfillmentSetting.version,
    manifest.previousFulfillmentSetting.updatedAt]);
  if (auditIds.length) await client.query('DELETE FROM audit_events WHERE id=ANY($1::uuid[])', [auditIds]);
  await client.query('DELETE FROM auth_sessions WHERE account_id=ANY($1::uuid[])', [manifest.accountIds]);
  await client.query('DELETE FROM product_publications WHERE product_id=ANY($1::uuid[])', [manifest.productIds]);
  await client.query('DELETE FROM inventory_levels WHERE option_id=ANY($1::uuid[])', [manifest.optionIds]);
  await client.query('DELETE FROM product_options WHERE id=ANY($1::uuid[])', [manifest.optionIds]);
  await client.query('DELETE FROM product_revisions WHERE id=ANY($1::uuid[])', [manifest.revisionIds]);
  await client.query('DELETE FROM products WHERE id=ANY($1::uuid[])', [manifest.productIds]);
  await client.query('DELETE FROM product_categories WHERE id=ANY($1::uuid[]) AND parent_id IS NOT NULL',
    [manifest.productCategoryIds]);
  await client.query('DELETE FROM product_categories WHERE id=ANY($1::uuid[])', [manifest.productCategoryIds]);
  await client.query('DELETE FROM account_roles WHERE account_id=ANY($1::uuid[])', [manifest.accountIds]);
  await client.query('DELETE FROM account_identities WHERE account_id=ANY($1::uuid[])', [manifest.accountIds]);
  await client.query('DELETE FROM accounts WHERE id=ANY($1::uuid[])', [manifest.accountIds]);
  await client.query('DELETE FROM sellers WHERE id=ANY($1::uuid[])', [manifest.sellerIds]);
  await client.query('DELETE FROM seller_categories WHERE id=$1', [manifest.sellerCategoryId]);
  return { accounts: 5, sellers: 3, products: 3, orders: 3, shipments: 3 };
}

export async function runFulfillmentUiFixture(action: 'seed' | 'reset', value: string,
  databaseUrl: string, password?: string, manifestJson?: string, expectedSystemId?: string) {
  const runId = id(value);
  validateFulfillmentUiTarget(databaseUrl, runId);
  if (action !== 'seed' && action !== 'reset') throw new Error('Invalid QA action');
  if (!password || password.length < 12) throw new Error('QA_FIXTURE_PASSWORD must be set');
  const manifest = action === 'reset'
    ? validateFulfillmentUiManifest(runId, JSON.parse(manifestJson ?? 'null'), password) : null;
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      const actualTarget = (await client.query<{ databaseName: string; systemId: string }>(
        `SELECT current_database() AS "databaseName",system_identifier::text AS "systemId"
          FROM pg_control_system()`)).rows[0];
      validateFulfillmentUiSystemTarget(runId, expectedSystemId, actualTarget);
      const result = action === 'seed'
        ? await seedFixture(client, runId, password!) : await resetFixture(client, manifest!);
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
  if (action !== 'seed' && action !== 'reset')
    throw new Error('usage: qa-fulfillment-ui-fixture.ts seed|reset');
  runFulfillmentUiFixture(action, process.env.QA_RUN_ID ?? '', process.env.DATABASE_URL ?? '',
    process.env.QA_FIXTURE_PASSWORD, process.env.QA_FIXTURE_JSON,
    process.env.S5_FULFILLMENT_UI_DB_SYSTEM_ID)
    .then((result) => { process.stdout.write(`${JSON.stringify(result)}\n`); })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : 'Fulfillment UI fixture failed'}\n`);
      process.exitCode = 1;
    });
}
