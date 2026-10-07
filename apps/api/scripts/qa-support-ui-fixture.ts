import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chmod, lstat, open, readFile, readdir, realpath, rmdir, stat, unlink } from 'node:fs/promises';
import { Pool, type PoolClient } from 'pg';
import { hashPassword } from '../src/auth/credentials.js';
import { ImageQuarantine } from '../src/catalog/image-quarantine.js';
import { openPaymentFulfillments } from '../src/fulfillment/repository.js';
import { validateQaRunId } from './qa-fixture.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type PreviousSetting = { owoolSellerId: string | null; updatedBy: string | null;
  version: number; updatedAt: string };
export type SupportUiManifest = {
  runId: string; emails: string[]; accountIds: string[]; sellerIds: string[];
  sellerCategoryId: string; productCategoryIds: string[];
  productId: string; revisionId: string; optionId: string;
  addressId: string; reservationId: string; orderId: string; shipmentId: string;
  paymentAttemptId: string; paymentEventId: string;
  initialFulfillmentEventIds: string[]; orderStatusEventId: string;
  previousFulfillmentSetting: PreviousSetting;
  seededFulfillmentSettingUpdatedAt: string; signature: string;
};
type UnsignedManifest = Omit<SupportUiManifest,'signature'>;
const manifestFields = ['runId','emails','accountIds','sellerIds','sellerCategoryId',
  'productCategoryIds','productId','revisionId','optionId','addressId','reservationId',
  'orderId','shipmentId','paymentAttemptId','paymentEventId',
  'initialFulfillmentEventIds','orderStatusEventId','previousFulfillmentSetting',
  'seededFulfillmentSettingUpdatedAt','signature'];

export function supportUiDatabaseName(value: string) {
  return `shoppingmall_s52_support_ui_${validateQaRunId(value)}`;
}

export function supportUiEmails(value: string) {
  const runId = validateQaRunId(value);
  return ['customer-a','customer-b','seller-a','owool','admin']
    .map((role) => `qa+${runId}-support-${role}@example.invalid`);
}

export function supportUiUploadRoot(value: string) {
  return join(supportUiTempRoot(),`shoppingmall-upload-s52-support-ui-${validateQaRunId(value)}`);
}

export function supportUiRecoveryPath(value: string) {
  return join(supportUiTempRoot(),`shoppingmall-s52-support-ui-${validateQaRunId(value)}-recovery.json`);
}

function supportUiTempRoot() {
  if (process.platform === 'win32') {
    const target = 'D:\\tmp';
    if (process.env.S52_SUPPORT_UI_TEMP_ROOT &&
        resolve(process.env.S52_SUPPORT_UI_TEMP_ROOT).toLowerCase() !== target.toLowerCase())
      throw new Error('Support UI fixture requires D:\\tmp on Windows');
    return target;
  }
  const target = process.env.S52_SUPPORT_UI_TEMP_ROOT;
  if (!target || resolve(target) !== resolve(join(tmpdir(),'shoppingmall-s52-support-ui')))
    throw new Error('Support UI fixture requires an explicit dedicated local temp root');
  return target;
}

async function assertSupportUiTempRoot() {
  const root = supportUiTempRoot();
  const entry = await lstat(root);
  const canonical = await realpath(root);
  if (!entry.isDirectory() || entry.isSymbolicLink() ||
      (process.platform === 'win32' ? canonical.toLowerCase() : canonical) !==
      (process.platform === 'win32' ? resolve(root).toLowerCase() : resolve(root)))
    throw new Error('Support UI fixture temp root is unsafe');
}

function assertWindowsRecoveryAcl(path: string) {
  const target = path.replaceAll("'","''");
  const script = `$target='${target}'; ` +
    '$acl=[System.IO.File]::GetAccessControl($target); ' +
    '$self=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; ' +
    '$rules=@($acl.GetAccessRules($true,$true,' +
    '[System.Security.Principal.SecurityIdentifier])); ' +
    'if (-not $acl.AreAccessRulesProtected -or $rules.Count -ne 1) { exit 1 }; ' +
    '$rule=$rules[0]; ' +
    '$ownerSid=$rule.IdentityReference.Value; ' +
    'if ($ownerSid -ne $self -or $rule.AccessControlType -ne "Allow" -or ' +
    '($rule.FileSystemRights -band ' +
    '[System.Security.AccessControl.FileSystemRights]::FullControl) -ne ' +
    '[System.Security.AccessControl.FileSystemRights]::FullControl) { exit 1 }';
  try {
    execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],
      { stdio:'pipe',timeout:10000 });
  } catch {
    throw new Error('Support UI fixture recovery file permissions unavailable');
  }
}

async function assertRecoveryPermissions(path: string) {
  const recovery = await lstat(path);
  if (!recovery.isFile() || recovery.isSymbolicLink())
    throw new Error('Support UI fixture recovery file permissions unavailable');
  const canonical = await realpath(path);
  if ((process.platform === 'win32' ? canonical.toLowerCase() : canonical) !==
      (process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path)))
    throw new Error('Support UI fixture recovery file path changed');
  if (process.platform === 'win32') assertWindowsRecoveryAcl(path);
  else if ((recovery.mode & 0o077) !== 0)
    throw new Error('Support UI fixture recovery file permissions unavailable');
}

async function createRecoveryFile(path: string,password: string,
  manifest: SupportUiManifest,onCreate: () => void) {
  if (resolve(path) !== resolve(supportUiRecoveryPath(manifest.runId)) ||
      (process.platform === 'win32'
        ? (await realpath(dirname(path))).toLowerCase() !== resolve(dirname(path)).toLowerCase()
        : await realpath(dirname(path)) !== resolve(dirname(path))))
    throw new Error('Support UI fixture recovery file target changed');
  const handle = await open(path,'wx',0o600);
  onCreate();
  try {
    if (process.platform === 'win32') {
      const recovery = await lstat(path);
      if (!recovery.isFile() || recovery.isSymbolicLink() ||
          (await realpath(path)).toLowerCase() !== resolve(path).toLowerCase())
        throw new Error('Support UI fixture recovery file target changed');
      try {
        execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',
          `[System.IO.File]::GetAccessControl('${path.replaceAll("'","''")}') | Out-Null`],
        { stdio:'pipe',timeout:10000 });
        const sid = execFileSync('powershell.exe',['-NoProfile','-NonInteractive',
          '-Command','[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value'],
        { encoding:'utf8',stdio:'pipe',timeout:10000 }).trim();
        if (!/^S-\d+(?:-\d+)+$/.test(sid))
          throw new Error('Support UI fixture current user SID unavailable');
        execFileSync('icacls',[path,'/inheritance:r','/grant:r',`*${sid}:(F)`],
          { stdio:'pipe',timeout:10000 });
      } catch {
        throw new Error('Support UI fixture recovery file ACL restriction unavailable');
      }
    } else await chmod(path,0o600);
    await assertRecoveryPermissions(path);
    await handle.writeFile(JSON.stringify({ password,manifest }),'utf8');
    await handle.sync();
  } finally { await handle.close(); }
}

export function isSupportUiImageKey(value: string) {
  return /^quarantine\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/.test(value);
}

export function validateSupportUiTarget(databaseUrl: string,value: string) {
  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!['postgres:','postgresql:'].includes(url.protocol) ||
      !['127.0.0.1','::1','[::1]','localhost'].includes(url.hostname) ||
      database !== supportUiDatabaseName(value))
    throw new Error('Support UI fixture requires its exact local isolated database');
  return { url,database };
}

export function validateSharedSupportUiTarget(databaseUrl: string,value: string,
  consent?: string) {
  const runId = validateQaRunId(value);
  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!['postgres:','postgresql:'].includes(url.protocol) ||
      !['127.0.0.1','::1','[::1]','localhost'].includes(url.hostname) ||
      database !== 'shoppingmall' ||
      consent !== `SHARED_S52_SUPPORT_UI_${runId}`)
    throw new Error('Support UI shared fixture requires exact shoppingmall DB and run-bound opt-in');
  return { url,database };
}

export function validateSharedSupportUiBaseline(counts: Record<string,number>) {
  const defaults = new Set(['fulfillment_settings','home_content_current',
    'home_content_draft','shipping_policy_global','support_policy_versions']);
  if ([...defaults].some((name) => counts[name] !== 1) ||
      Object.entries(counts).some(([name,count]) =>
        !Number.isSafeInteger(count) || count !== (defaults.has(name) ? 1 : 0)))
    throw new Error('Support UI shared fixture requires an untouched empty QA baseline');
}

async function assertSharedSupportUiBaseline(client: PoolClient) {
  await client.query("SET LOCAL lock_timeout='1s'");
  await client.query("SET LOCAL statement_timeout='10s'");
  const tables = (await client.query<{ tablename: string }>(`SELECT tablename FROM pg_tables
    WHERE schemaname='public' ORDER BY tablename`)).rows.map((row) => row.tablename);
  const quoted = tables.map((name) => `public."${name.replaceAll('"','""')}"`);
  if (!tables.length) throw new Error('Support UI shared fixture has no public tables');
  await client.query(`LOCK TABLE ${quoted.join(',')} IN SHARE ROW EXCLUSIVE MODE`);
  const counts: Record<string,number> = {};
  for (let index=0;index<tables.length;index++) {
    counts[tables[index]] = (await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ${quoted[index]}`)).rows[0].count;
  }
  validateSharedSupportUiBaseline(counts);
}

export function validateSupportUiSystemTarget(value: string,expectedSystemId: string | undefined,
  actual: { databaseName?: string; systemId?: string },
  expectedDatabase = supportUiDatabaseName(value)) {
  if (!/^\d{10,}$/.test(expectedSystemId ?? '') ||
      ![supportUiDatabaseName(value),'shoppingmall'].includes(expectedDatabase) ||
      actual.systemId !== expectedSystemId ||
      actual.databaseName !== expectedDatabase)
    throw new Error('Support UI fixture requires its exact database system identifier and name');
  return { databaseName: actual.databaseName,systemId: actual.systemId };
}

function exactUuids(value: unknown,length: number) {
  return Array.isArray(value) && value.length === length &&
    new Set(value).size === length &&
    value.every((entry) => typeof entry === 'string' && uuid.test(entry));
}

function manifestPayload(manifest: UnsignedManifest) {
  return JSON.stringify([
    manifest.runId,manifest.emails,manifest.accountIds,manifest.sellerIds,
    manifest.sellerCategoryId,manifest.productCategoryIds,manifest.productId,
    manifest.revisionId,manifest.optionId,manifest.addressId,manifest.reservationId,
    manifest.orderId,manifest.shipmentId,manifest.paymentAttemptId,manifest.paymentEventId,
    manifest.initialFulfillmentEventIds,manifest.orderStatusEventId,
    manifest.previousFulfillmentSetting,manifest.seededFulfillmentSettingUpdatedAt,
  ]);
}

export function signSupportUiManifest(manifest: UnsignedManifest,password: string) {
  if (typeof password !== 'string' || password.length < 12)
    throw new Error('QA_FIXTURE_PASSWORD must be set');
  return createHmac('sha256',password).update(manifestPayload(manifest)).digest('hex');
}

export function validateSupportUiManifest(value: string,candidate: unknown,
  password: string): SupportUiManifest {
  const manifest = candidate as Partial<SupportUiManifest> | null;
  const previous = manifest?.previousFulfillmentSetting;
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) ||
      Object.keys(manifest).sort().join(',') !== [...manifestFields].sort().join(',') ||
      manifest.runId !== validateQaRunId(value) ||
      JSON.stringify(manifest.emails) !== JSON.stringify(supportUiEmails(value)) ||
      !exactUuids(manifest.accountIds,5) || !exactUuids(manifest.sellerIds,2) ||
      !exactUuids(manifest.productCategoryIds,2) ||
      !exactUuids(manifest.initialFulfillmentEventIds,3) ||
      ![manifest.sellerCategoryId,manifest.productId,manifest.revisionId,
        manifest.optionId,manifest.addressId,manifest.reservationId,manifest.orderId,
        manifest.shipmentId,manifest.paymentAttemptId,manifest.paymentEventId,
        manifest.orderStatusEventId].every((id) => typeof id === 'string' && uuid.test(id)) ||
      !previous || !(previous.owoolSellerId === null ||
        (typeof previous.owoolSellerId === 'string' && uuid.test(previous.owoolSellerId))) ||
      !(previous.updatedBy === null ||
        (typeof previous.updatedBy === 'string' && uuid.test(previous.updatedBy))) ||
      !Number.isInteger(previous.version) || previous.version < 0 ||
      typeof previous.updatedAt !== 'string' || Number.isNaN(Date.parse(previous.updatedAt)) ||
      typeof manifest.seededFulfillmentSettingUpdatedAt !== 'string' ||
      Number.isNaN(Date.parse(manifest.seededFulfillmentSettingUpdatedAt)) ||
      typeof manifest.signature !== 'string' || !/^[0-9a-f]{64}$/.test(manifest.signature))
    throw new Error('Support UI reset requires exact creation manifest');
  const { signature,...unsigned } = manifest as SupportUiManifest;
  const expected = Buffer.from(signSupportUiManifest(unsigned,password),'hex');
  const supplied = Buffer.from(signature,'hex');
  if (expected.length !== supplied.length || !timingSafeEqual(expected,supplied))
    throw new Error('Support UI reset manifest signature mismatch');
  return manifest as SupportUiManifest;
}

const fingerprint = '5'.repeat(64);
const paidAt = new Date('2026-10-06T05:00:00.000Z');
const shipDate = '2026-10-07';
function fixturePrefix(value: string) { return `qa-${validateQaRunId(value)}-support`; }

function fulfillmentSnapshot(status: string,carrierCode: string | null,
  trackingNumber: string | null) {
  return { status,expectedShipDate: shipDate,carrierCode,trackingNumber };
}

async function insertShipEvent(client: PoolClient,input: {
  shipmentId: string; action: string; from: string; to: string;
  before: ReturnType<typeof fulfillmentSnapshot>;
  after: ReturnType<typeof fulfillmentSnapshot>;
  actorAccountId: string; actorSellerId: string; occurredAt: Date;
}) {
  const event = await client.query<{ id: string }>(`INSERT INTO shipment_fulfillment_events
    (shipment_order_id,action,from_status,to_status,actor_account_id,actor_role,
      actor_seller_id,before_snapshot,after_snapshot,idempotency_scope,idempotency_key,
      request_fingerprint,occurred_at)
    VALUES ($1,$2,$3,$4,$5,'seller',$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12)
    RETURNING id`, [input.shipmentId,input.action,input.from,input.to,
      input.actorAccountId,input.actorSellerId,JSON.stringify(input.before),
      JSON.stringify(input.after),input.actorAccountId,randomUUID(),fingerprint,
      input.occurredAt]);
  return event.rows[0].id;
}

async function seedFixture(client: PoolClient,runId: string,password: string): Promise<SupportUiManifest> {
  const emails = supportUiEmails(runId);
  const prefix = fixturePrefix(runId);
  const existing = await client.query(`SELECT 1 FROM account_identities WHERE identifier=ANY($1::text[])
    UNION ALL SELECT 1 FROM seller_categories WHERE name=$2
    UNION ALL SELECT 1 FROM product_revisions WHERE title=$3 LIMIT 1`,
  [emails,`${prefix}-sellers`,`${prefix}-고추`]);
  if (existing.rowCount) throw new Error('Support UI fixture already exists; reset with its manifest');

  const digest = await hashPassword(password);
  const sellerCategoryId = (await client.query<{ id: string }>(
    'INSERT INTO seller_categories(name) VALUES ($1) RETURNING id',
    [`${prefix}-sellers`])).rows[0].id;
  const sellerIds: string[] = [];
  for (const name of [`${prefix}-seller-a`,`${prefix}-owool`]) {
    sellerIds.push((await client.query<{ id: string }>(
      'INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id',
      [sellerCategoryId,name])).rows[0].id);
  }
  const accountIds: string[] = [];
  for (const [index,email] of emails.entries()) {
    const accountId = (await client.query<{ id: string }>(
      'INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    accountIds.push(accountId);
    await client.query(`INSERT INTO account_identities
      (account_id,kind,identifier,password_hash,verified_at)
      VALUES ($1,'email',$2,$3,now())`,[accountId,email,digest]);
    if (index < 2) await client.query(
      "INSERT INTO account_roles(account_id,role) VALUES ($1,'customer')",[accountId]);
    else if (index === 4) await client.query(
      "INSERT INTO account_roles(account_id,role) VALUES ($1,'admin')",[accountId]);
    else await client.query(
      "INSERT INTO account_roles(account_id,role,seller_id) VALUES ($1,'seller',$2)",
      [accountId,sellerIds[index-2]]);
  }

  const major = (await client.query<{ id: string }>(
    'INSERT INTO product_categories(name) VALUES ($1) RETURNING id',
    [`${prefix}-채소`])).rows[0].id;
  const minor = (await client.query<{ id: string }>(
    'INSERT INTO product_categories(parent_id,name) VALUES ($1,$2) RETURNING id',
    [major,`${prefix}-고추`])).rows[0].id;
  const productId = (await client.query<{ id: string }>(
    'INSERT INTO products(seller_id,category_id) VALUES ($1,$2) RETURNING id',
    [sellerIds[0],minor])).rows[0].id;
  const revisionId = (await client.query<{ id: string }>(`INSERT INTO product_revisions
    (product_id,version,title,description,origin_label,shipping_mode,status,
      proposed_by_account_id,reviewed_by_account_id,reviewed_at)
    VALUES ($1,1,$2,'S5.2 격리 시험 가상 상품','가상 산지','owool_fulfillment',
      'approved',$3,$4,now()) RETURNING id`,
  [productId,`${prefix}-고추`,accountIds[2],accountIds[4]])).rows[0].id;
  const optionId = (await client.query<{ id: string }>(
    "INSERT INTO product_options(revision_id,name,price_won,display_order) VALUES ($1,'기본',23000,0) RETURNING id",
    [revisionId])).rows[0].id;
  await client.query('INSERT INTO inventory_levels(option_id,on_hand_quantity,sellable_quantity) VALUES ($1,20,20)',
    [optionId]);
  await client.query(`INSERT INTO product_publications
    (product_id,revision_id,published_by_account_id) VALUES ($1,$2,$3)`,
  [productId,revisionId,accountIds[4]]);

  const addressId = (await client.query<{ id: string }>(`INSERT INTO customer_addresses
    (account_id,label,recipient_name,phone,postal_code,line1,line2)
    VALUES ($1,'S5.2 QA','가상 고객','01000000000','12345','서울시 가상구 테스트로 1','가상 101호') RETURNING id`,
  [accountIds[0]])).rows[0].id;
  const setting = (await client.query<{ owool_seller_id: string | null;
    updated_by: string | null; version: number; updated_at: Date }>(
    'SELECT owool_seller_id,updated_by,version,updated_at FROM fulfillment_settings WHERE id=1 FOR UPDATE')).rows[0];
  if (!setting) throw new Error('Fulfillment setting singleton is missing');
  const previousFulfillmentSetting = { owoolSellerId: setting.owool_seller_id,
    updatedBy: setting.updated_by,version: setting.version,
    updatedAt: setting.updated_at.toISOString() };
  const seededSetting = (await client.query<{ updated_at: Date }>(`UPDATE fulfillment_settings
    SET owool_seller_id=$1,updated_by=$2,version=version+1,
      updated_at=clock_timestamp() WHERE id=1 RETURNING updated_at`,
  [sellerIds[1],accountIds[4]])).rows[0];

  const createdAt = new Date('2026-10-06T04:58:00.000Z');
  const expiresAt = new Date(createdAt.getTime()+3_600_000);
  const reservationId = (await client.query<{ id: string }>(`INSERT INTO checkout_reservations
    (account_id,idempotency_key,status,created_at,expires_at,ended_at)
    VALUES ($1,$2,'CONSUMED',$3,$4,$5) RETURNING id`,
  [accountIds[0],randomUUID(),createdAt,expiresAt,paidAt])).rows[0].id;
  await client.query(`INSERT INTO checkout_reservation_lines(reservation_id,option_id,quantity)
    VALUES ($1,$2,2)`,[reservationId,optionId]);
  const orderId = (await client.query<{ id: string }>(`INSERT INTO checkout_orders
    (account_id,reservation_id,idempotency_key,request_fingerprint,address_id,
      recipient_name,phone,postal_code,line1,line2,goods_won,goods_discount_won,
      shipping_fee_won,shipping_support_won,payable_won,status,created_at,
      expires_at,ended_at,paid_at)
    VALUES ($1,$2,$3,$4,$5,'가상 고객','01000000000','12345',
      '서울시 가상구 테스트로 1','가상 101호',46000,0,3000,0,49000,'PAID',
      $6,$7,$8,$8) RETURNING id`,
  [accountIds[0],reservationId,randomUUID(),fingerprint,addressId,createdAt,
    expiresAt,paidAt])).rows[0].id;
  const shipmentId = (await client.query<{ id: string }>(`INSERT INTO shipment_orders
    (checkout_order_id,shipment_key,shipping_mode,seller_id,goods_won,
      goods_discount_won,shipping_fee_won,shipping_support_won,payable_won,status)
    VALUES ($1,'owool_fulfillment:s52','owool_fulfillment',NULL,
      46000,0,3000,0,49000,'PAID') RETURNING id`,[orderId])).rows[0].id;
  await client.query(`INSERT INTO shipment_order_lines
    (shipment_order_id,product_id,option_id,seller_id,product_name,
      option_name,unit_price_won,quantity,goods_discount_won,goods_payable_won)
    VALUES ($1,$2,$3,$4,$5,'기본',23000,2,0,46000)`,
  [shipmentId,productId,optionId,sellerIds[0],`${prefix}-고추`]);

  const paymentAttemptId = (await client.query<{ id: string }>(`INSERT INTO payment_attempts
    (checkout_order_id,provider,provider_order_id,requested_won,idempotency_key,
      request_fingerprint,status,created_at,ended_at)
    VALUES ($1,'mock',$2,49000,$3,$4,'APPROVED',$5,$5) RETURNING id`,
  [orderId,`${prefix}-order`,randomUUID(),fingerprint,paidAt])).rows[0].id;
  const paymentEventId = (await client.query<{ id: string }>(`INSERT INTO payment_events
    (payment_attempt_id,provider,provider_event_id,outcome,verified_order_id,
      provider_payment_id,amount_won,event_fingerprint,received_at,processing_status,processed_at)
    VALUES ($1,'mock',$2,'APPROVED',$3,$4,49000,$5,$6,'APPLIED',$6) RETURNING id`,
  [paymentAttemptId,`${prefix}-payment-event`,orderId,`${prefix}-payment`,fingerprint,paidAt])).rows[0].id;
  await client.query(`INSERT INTO shipment_fulfillments
    (shipment_order_id,fulfillment_seller_id,status,cutoff_time)
    VALUES ($1,$2,'PAYMENT_PENDING','14:00')`,[shipmentId,sellerIds[1]]);
  await openPaymentFulfillments(client,[{ shipmentOrderId: shipmentId,cutoffTime: '14:00' }],
    paymentEventId,paidAt);
  const packedAt = new Date(paidAt.getTime()+60_000);
  const shippedAt = new Date(paidAt.getTime()+120_000);
  const tracking = `QA${runId.toUpperCase()}`;
  await client.query(`UPDATE shipment_fulfillments SET status='SHIPPED',carrier_code='hanjin',
    tracking_number=$2,packed_at=$3,first_shipped_at=$4,shipped_at=$4,
    version=version+2,updated_at=$4 WHERE shipment_order_id=$1`,
  [shipmentId,tracking,packedAt,shippedAt]);
  await insertShipEvent(client,{ shipmentId,action:'START_PACKING',from:'READY',to:'PACKING',
    before:fulfillmentSnapshot('READY',null,null),
    after:fulfillmentSnapshot('PACKING',null,null),actorAccountId:accountIds[3],
    actorSellerId:sellerIds[1],occurredAt:packedAt });
  await insertShipEvent(client,{ shipmentId,action:'MARK_SHIPPED',from:'PACKING',to:'SHIPPED',
    before:fulfillmentSnapshot('PACKING',null,null),
    after:fulfillmentSnapshot('SHIPPED','hanjin',tracking),
    actorAccountId:accountIds[3],actorSellerId:sellerIds[1],occurredAt:shippedAt });
  const initialFulfillmentEventIds = (await client.query<{ id: string }>(
    'SELECT id FROM shipment_fulfillment_events WHERE shipment_order_id=$1 ORDER BY occurred_at,id',
    [shipmentId])).rows.map((row) => row.id);
  if (initialFulfillmentEventIds.length !== 3)
    throw new Error('Support UI fixture expected exactly three initial fulfillment events');
  const orderStatusEventId = (await client.query<{ id: string }>(`INSERT INTO order_status_events
    (checkout_order_id,status,reason,created_at)
    VALUES ($1,'PAID','S5.2 격리 QA 모의 결제',$2) RETURNING id`,
  [orderId,paidAt])).rows[0].id;
  const unsigned: UnsignedManifest = { runId,emails,accountIds,sellerIds,
    sellerCategoryId,productCategoryIds:[major,minor],productId,revisionId,optionId,
    addressId,reservationId,orderId,shipmentId,paymentAttemptId,paymentEventId,
    initialFulfillmentEventIds,orderStatusEventId,previousFulfillmentSetting,
    seededFulfillmentSettingUpdatedAt:seededSetting.updated_at.toISOString() };
  return { ...unsigned,signature: signSupportUiManifest(unsigned,password) };
}

type RowRule = { table: string; predicate: string; params?: unknown[] };
async function assertOnlyOwned(client: PoolClient,rule: RowRule) {
  const found = await client.query(`SELECT 1 FROM ${rule.table}
    WHERE (${rule.predicate}) IS NOT TRUE LIMIT 1`,rule.params ?? []);
  if (found.rowCount) throw new Error(`Support UI fixture has foreign ${rule.table} data`);
}

async function assertResetOwnership(client: PoolClient,manifest: SupportUiManifest) {
  await client.query("SET LOCAL lock_timeout='1s'");
  await client.query("SET LOCAL statement_timeout='10s'");
  await client.query(`LOCK TABLE accounts,account_identities,account_roles,auth_sessions,
    audit_events,seller_categories,sellers,product_categories,products,product_revisions,
    product_options,product_publications,inventory_levels,customer_addresses,
    checkout_reservations,checkout_reservation_lines,checkout_orders,order_status_events,
    shipment_orders,shipment_order_lines,shipment_fulfillments,shipment_fulfillment_events,
    payment_attempts,payment_events,payment_event_conflicts,refund_cases,
    refund_case_lines,refund_case_events,refund_attempts,refund_events,
    refund_event_conflicts,support_purchase_confirmations,support_reviews,
    support_review_events,support_review_images,support_review_reports,
    support_questions,support_question_messages,support_question_message_events,
    support_claims,support_claim_messages,support_claim_events,support_claim_evidence,
    customer_cart_items,customer_favorites,restock_subscriptions,
    account_deletion_requests,notification_preferences,seller_shipping_policies,
    seller_shipping_policy_requests
    IN SHARE ROW EXCLUSIVE MODE`);
  const m = manifest;
  const count = (await client.query<{
    accounts: number; sellers: number; categories: number; products: number;
    revisions: number; options: number; orders: number; shipments: number;
    reservations: number; addresses: number; paymentAttempts: number;
    paymentEvents: number; fulfillmentEvents: number; orderStatusEvents: number;
  }>(`SELECT
    (SELECT count(*)::int FROM accounts) AS accounts,
    (SELECT count(*)::int FROM sellers) AS sellers,
    (SELECT count(*)::int FROM product_categories) AS categories,
    (SELECT count(*)::int FROM products) AS products,
    (SELECT count(*)::int FROM product_revisions) AS revisions,
    (SELECT count(*)::int FROM product_options) AS options,
    (SELECT count(*)::int FROM checkout_orders) AS orders,
    (SELECT count(*)::int FROM shipment_orders) AS shipments,
    (SELECT count(*)::int FROM checkout_reservations) AS reservations,
    (SELECT count(*)::int FROM customer_addresses) AS addresses,
    (SELECT count(*)::int FROM payment_attempts) AS "paymentAttempts",
    (SELECT count(*)::int FROM payment_events) AS "paymentEvents",
    (SELECT count(*)::int FROM shipment_fulfillment_events) AS "fulfillmentEvents",
    (SELECT count(*)::int FROM order_status_events) AS "orderStatusEvents"`)).rows[0];
  if (JSON.stringify(count) !== JSON.stringify({ accounts:5,sellers:2,categories:2,
    products:1,revisions:1,options:1,orders:1,shipments:1,reservations:1,
    addresses:1,paymentAttempts:1,paymentEvents:1,fulfillmentEvents:3,
    orderStatusEvents:1 }))
    throw new Error('Support UI fixture base row count differs from manifest');

  const rules: RowRule[] = [
    { table:'accounts',predicate:'id=ANY($1::uuid[]) AND disabled_at IS NULL',params:[m.accountIds] },
    { table:'seller_categories',predicate:'id=$1 AND name=$2',
      params:[m.sellerCategoryId,`${fixturePrefix(m.runId)}-sellers`] },
    { table:'sellers',predicate:'id=ANY($1::uuid[]) AND category_id=$2',
      params:[m.sellerIds,m.sellerCategoryId] },
    { table:'product_categories',predicate:'id=ANY($1::uuid[])',params:[m.productCategoryIds] },
    { table:'products',predicate:'id=$1 AND seller_id=$2 AND category_id=$3',
      params:[m.productId,m.sellerIds[0],m.productCategoryIds[1]] },
    { table:'product_revisions',predicate:"id=$1 AND product_id=$2 AND status='approved' AND shipping_mode='owool_fulfillment'",
      params:[m.revisionId,m.productId] },
    { table:'product_options',predicate:'id=$1 AND revision_id=$2',params:[m.optionId,m.revisionId] },
    { table:'product_publications',predicate:'product_id=$1 AND revision_id=$2',
      params:[m.productId,m.revisionId] },
    { table:'inventory_levels',predicate:'option_id=$1',params:[m.optionId] },
    { table:'customer_addresses',predicate:'id=$1 AND account_id=$2',
      params:[m.addressId,m.accountIds[0]] },
    { table:'checkout_reservations',predicate:'id=$1 AND account_id=$2',
      params:[m.reservationId,m.accountIds[0]] },
    { table:'checkout_reservation_lines',predicate:'reservation_id=$1 AND option_id=$2',
      params:[m.reservationId,m.optionId] },
    { table:'checkout_orders',predicate:"id=$1 AND account_id=$2 AND reservation_id=$3 AND address_id=$4 AND status='PAID'",
      params:[m.orderId,m.accountIds[0],m.reservationId,m.addressId] },
    { table:'order_status_events',predicate:'id=$1 AND checkout_order_id=$2',
      params:[m.orderStatusEventId,m.orderId] },
    { table:'shipment_orders',predicate:"id=$1 AND checkout_order_id=$2 AND shipping_mode='owool_fulfillment' AND seller_id IS NULL AND status='PAID'",
      params:[m.shipmentId,m.orderId] },
    { table:'shipment_order_lines',predicate:'shipment_order_id=$1 AND option_id=$2 AND product_id=$3 AND seller_id=$4',
      params:[m.shipmentId,m.optionId,m.productId,m.sellerIds[0]] },
    { table:'shipment_fulfillments',predicate:"shipment_order_id=$1 AND fulfillment_seller_id=$2 AND status='SHIPPED'",
      params:[m.shipmentId,m.sellerIds[1]] },
    { table:'shipment_fulfillment_events',predicate:'id=ANY($1::uuid[]) AND shipment_order_id=$2 AND (actor_account_id IS NULL OR actor_account_id=ANY($3::uuid[])) AND (actor_seller_id IS NULL OR actor_seller_id=ANY($4::uuid[]))',
      params:[m.initialFulfillmentEventIds,m.shipmentId,m.accountIds,m.sellerIds] },
    { table:'payment_attempts',predicate:'id=$1 AND checkout_order_id=$2',
      params:[m.paymentAttemptId,m.orderId] },
    { table:'payment_events',predicate:'id=$1 AND payment_attempt_id=$2 AND verified_order_id=$3',
      params:[m.paymentEventId,m.paymentAttemptId,m.orderId] },
    { table:'support_purchase_confirmations',predicate:'checkout_order_id=$1 AND shipment_order_id=$2 AND option_id=$3 AND product_id=$4 AND customer_account_id=$5 AND shipped_event_id=ANY($6::uuid[])',
      params:[m.orderId,m.shipmentId,m.optionId,m.productId,m.accountIds[0],m.initialFulfillmentEventIds] },
    { table:'support_reviews',predicate:'product_id=$1 AND customer_account_id=$2 AND (approved_by IS NULL OR approved_by=$3) AND (hidden_by IS NULL OR hidden_by=$3)',
      params:[m.productId,m.accountIds[0],m.accountIds[4]] },
    { table:'support_review_events',predicate:'actor_account_id=ANY($1::uuid[])',params:[m.accountIds] },
    { table:'support_review_images',predicate:"review_id IN (SELECT id FROM support_reviews WHERE product_id=$1 AND customer_account_id=$2) AND mime_type='image/webp'",
      params:[m.productId,m.accountIds[0]] },
    { table:'support_review_reports',predicate:'reporter_account_id=ANY($1::uuid[])',params:[m.accountIds] },
    { table:'support_questions',predicate:'product_id=$1 AND customer_account_id=ANY($2::uuid[]) AND seller_id=$3',
      params:[m.productId,m.accountIds.slice(0,2),m.sellerIds[0]] },
    { table:'support_question_messages',predicate:'author_account_id=ANY($1::uuid[])',params:[m.accountIds] },
    { table:'support_question_message_events',predicate:'actor_account_id=ANY($1::uuid[])',params:[m.accountIds] },
    { table:'support_claims',predicate:'checkout_order_id=$1 AND shipment_order_id=$2 AND option_id=$3 AND product_id=$4 AND customer_account_id=$5 AND seller_id=$6 AND (decision_by IS NULL OR decision_by=$7)',
      params:[m.orderId,m.shipmentId,m.optionId,m.productId,m.accountIds[0],m.sellerIds[0],m.accountIds[4]] },
    { table:'support_claim_messages',predicate:'author_account_id=ANY($1::uuid[])',params:[m.accountIds] },
    { table:'support_claim_events',predicate:'actor_account_id IS NULL OR actor_account_id=ANY($1::uuid[])',params:[m.accountIds] },
    { table:'support_claim_evidence',predicate:'uploaded_by=$1',params:[m.accountIds[0]] },
    { table:'refund_cases',predicate:'checkout_order_id=$1 AND shipment_order_id=$2 AND requester_account_id=$3 AND post_shipment_claim_id IS NOT NULL AND decision_by=$4',
      params:[m.orderId,m.shipmentId,m.accountIds[0],m.accountIds[4]] },
    { table:'refund_case_lines',predicate:'shipment_order_id=$1 AND option_id=$2',params:[m.shipmentId,m.optionId] },
    { table:'refund_attempts',predicate:'payment_attempt_id=$1',params:[m.paymentAttemptId] },
    { table:'refund_events',predicate:'verified_order_id=$1',params:[m.orderId] },
    { table:'refund_case_events',predicate:'actor_account_id IS NULL OR actor_account_id=ANY($1::uuid[])',params:[m.accountIds] },
    { table:'refund_event_conflicts',predicate:'original_event_id IN (SELECT id FROM refund_events WHERE verified_order_id=$1) AND incoming_attempt_id IN (SELECT id FROM refund_attempts WHERE payment_attempt_id=$2)',
      params:[m.orderId,m.paymentAttemptId] },
    { table:'auth_sessions',predicate:'account_id=ANY($1::uuid[]) AND (seller_id IS NULL OR seller_id=ANY($2::uuid[]))',
      params:[m.accountIds,m.sellerIds] },
    { table:'audit_events',predicate:'actor_account_id=ANY($1::uuid[]) AND (seller_id IS NULL OR seller_id=ANY($2::uuid[]))',
      params:[m.accountIds,m.sellerIds] },
  ];
  for (const rule of rules) await assertOnlyOwned(client,rule);

  const identities = (await client.query<{ account_id: string;kind: string;identifier: string }>(
    'SELECT account_id,kind,identifier FROM account_identities')).rows;
  if (identities.length !== 5 || identities.some((row) => {
    const index = m.accountIds.indexOf(row.account_id);
    return index < 0 || row.kind !== 'email' || row.identifier !== m.emails[index];
  })) throw new Error('Support UI fixture contains foreign account identity');
  const roles = (await client.query<{ account_id: string;role: string;seller_id: string | null }>(
    'SELECT account_id,role,seller_id FROM account_roles')).rows;
  if (roles.length !== 5 || roles.some((row) => {
    const index = m.accountIds.indexOf(row.account_id);
    return index < 0 || row.role !== (index < 2 ? 'customer' : index === 4 ? 'admin' : 'seller') ||
      row.seller_id !== (index === 2 ? m.sellerIds[0] : index === 3 ? m.sellerIds[1] : null);
  })) throw new Error('Support UI fixture contains foreign account role');

  const setting = (await client.query<{ owool_seller_id: string | null;
    updated_by: string | null;version: number;updated_at: Date }>(
    'SELECT owool_seller_id,updated_by,version,updated_at FROM fulfillment_settings WHERE id=1 FOR UPDATE')).rows[0];
  if (!setting || setting.owool_seller_id !== m.sellerIds[1] ||
      setting.updated_by !== m.accountIds[4] ||
      setting.version !== m.previousFulfillmentSetting.version+1 ||
      setting.updated_at.toISOString() !== m.seededFulfillmentSettingUpdatedAt)
    throw new Error('Support UI fixture fulfillment setting ownership differs');

  const foreignReferences = await client.query(`SELECT 1 FROM customer_cart_items
    UNION ALL SELECT 1 FROM customer_favorites
    UNION ALL SELECT 1 FROM restock_subscriptions
    UNION ALL SELECT 1 FROM account_deletion_requests
    UNION ALL SELECT 1 FROM notification_preferences
    UNION ALL SELECT 1 FROM seller_shipping_policies
    UNION ALL SELECT 1 FROM seller_shipping_policy_requests
    UNION ALL SELECT 1 FROM payment_event_conflicts
    LIMIT 1`);
  if (foreignReferences.rowCount)
    throw new Error('Support UI fixture has a foreign reference or conflict');

  const audit = (await client.query<{ actor_account_id: string;action: string;
    target_type: string;target_id: string }>(
    'SELECT actor_account_id,action,target_type,target_id FROM audit_events')).rows;
  const claimIds = (await client.query<{ id: string }>('SELECT id FROM support_claims')).rows.map((row) => row.id);
  if (audit.some((row) => !(
    (['auth.login','auth.logout','auth.switch_role'].includes(row.action) &&
      row.target_type === 'account' &&
      row.target_id === row.actor_account_id) ||
    (row.action.startsWith('support.claim_refund_') && row.target_type === 'support_claim' &&
      row.actor_account_id === m.accountIds[4] && claimIds.includes(row.target_id)))))
    throw new Error('Support UI fixture has foreign audit target');

  const imageFiles = (await client.query<{ object_key: string;size_bytes: number }>(`
    SELECT object_key,size_bytes FROM support_review_images
    UNION ALL SELECT object_key,size_bytes FROM support_claim_evidence`)).rows;
  const duplicateKey = new Set(imageFiles.map((row) => row.object_key)).size !== imageFiles.length;
  const invalidFormat = imageFiles.some((row) => !isSupportUiImageKey(row.object_key));
  const invalidSize = imageFiles.some((row) => !Number.isSafeInteger(row.size_bytes) ||
    row.size_bytes < 1 || row.size_bytes > 5*1024*1024);
  if (duplicateKey || invalidFormat || invalidSize)
    throw new Error('Support UI fixture has foreign image key');
  return imageFiles;
}

async function assertOwnedFiles(runId: string,
  files: { object_key: string;size_bytes: number }[]) {
  const root = supportUiUploadRoot(runId);
  let rootStat;
  try { rootStat = await lstat(root); }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT' &&
        files.length === 0) return;
    throw new Error('Support UI fixture image root is missing or unsafe');
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
    throw new Error('Support UI fixture image root is unsafe');
  const top = await readdir(root,{ withFileTypes:true });
  if (top.some((entry) => !['quarantine','trash'].includes(entry.name) ||
      !entry.isDirectory() || entry.isSymbolicLink()))
    throw new Error('Support UI fixture has foreign image root entry');
  const trash = top.find((entry) => entry.name === 'trash');
  if (trash && (await readdir(join(root,'trash'))).length)
    throw new Error('Support UI fixture image cleanup recovery required');
  const quarantine = top.find((entry) => entry.name === 'quarantine');
  if (!quarantine && files.length)
    throw new Error('Support UI fixture image files are missing');
  const entries = quarantine ? await readdir(join(root,'quarantine'),{ withFileTypes:true }) : [];
  const expected = new Map(files.map((file) => [basename(file.object_key),file.size_bytes]));
  if (entries.length !== expected.size || entries.some((entry) =>
    !entry.isFile() || entry.isSymbolicLink() || !expected.has(entry.name)))
    throw new Error('Support UI fixture has foreign image file');
  for (const entry of entries) {
    const stat = await lstat(join(root,'quarantine',entry.name));
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== expected.get(entry.name))
      throw new Error('Support UI fixture image file differs from DB');
  }
}

async function deleteOwnedRows(client: PoolClient,m: SupportUiManifest) {
  const order = [m.orderId];
  await client.query(`DELETE FROM refund_event_conflicts WHERE incoming_attempt_id IN
    (SELECT a.id FROM refund_attempts a JOIN refund_cases c ON c.id=a.refund_case_id
      WHERE c.checkout_order_id=ANY($1::uuid[]))`,[order]);
  await client.query(`DELETE FROM refund_case_events WHERE refund_case_id IN
    (SELECT id FROM refund_cases WHERE checkout_order_id=ANY($1::uuid[]))`,[order]);
  await client.query(`DELETE FROM refund_events WHERE refund_attempt_id IN
    (SELECT a.id FROM refund_attempts a JOIN refund_cases c ON c.id=a.refund_case_id
      WHERE c.checkout_order_id=ANY($1::uuid[]))`,[order]);
  await client.query(`DELETE FROM refund_attempts WHERE refund_case_id IN
    (SELECT id FROM refund_cases WHERE checkout_order_id=ANY($1::uuid[]))`,[order]);
  await client.query(`DELETE FROM refund_case_lines WHERE refund_case_id IN
    (SELECT id FROM refund_cases WHERE checkout_order_id=ANY($1::uuid[]))`,[order]);
  await client.query('DELETE FROM refund_cases WHERE checkout_order_id=ANY($1::uuid[])',[order]);

  await client.query(`DELETE FROM support_review_reports WHERE review_id IN
    (SELECT id FROM support_reviews WHERE product_id=$1)`,[m.productId]);
  await client.query(`DELETE FROM support_review_images WHERE review_id IN
    (SELECT id FROM support_reviews WHERE product_id=$1)`,[m.productId]);
  await client.query(`DELETE FROM support_review_events WHERE review_id IN
    (SELECT id FROM support_reviews WHERE product_id=$1)`,[m.productId]);
  await client.query('DELETE FROM support_reviews WHERE product_id=$1',[m.productId]);
  await client.query('DELETE FROM support_purchase_confirmations WHERE shipment_order_id=$1',[m.shipmentId]);

  await client.query(`DELETE FROM support_question_message_events WHERE message_id IN
    (SELECT message.id FROM support_question_messages message
      JOIN support_questions question ON question.id=message.question_id
      WHERE question.product_id=$1)`,[m.productId]);
  await client.query(`DELETE FROM support_question_messages WHERE question_id IN
    (SELECT id FROM support_questions WHERE product_id=$1)`,[m.productId]);
  await client.query('DELETE FROM support_questions WHERE product_id=$1',[m.productId]);

  await client.query(`DELETE FROM support_claim_evidence WHERE claim_id IN
    (SELECT id FROM support_claims WHERE shipment_order_id=$1)`,[m.shipmentId]);
  await client.query(`DELETE FROM support_claim_messages WHERE claim_id IN
    (SELECT id FROM support_claims WHERE shipment_order_id=$1)`,[m.shipmentId]);
  await client.query(`DELETE FROM support_claim_events WHERE claim_id IN
    (SELECT id FROM support_claims WHERE shipment_order_id=$1)`,[m.shipmentId]);
  await client.query('DELETE FROM support_claims WHERE shipment_order_id=$1',[m.shipmentId]);

  await client.query('DELETE FROM audit_events WHERE actor_account_id=ANY($1::uuid[])',[m.accountIds]);
  await client.query('DELETE FROM auth_sessions WHERE account_id=ANY($1::uuid[])',[m.accountIds]);
  await client.query('DELETE FROM payment_events WHERE id=$1',[m.paymentEventId]);
  await client.query('DELETE FROM payment_attempts WHERE id=$1',[m.paymentAttemptId]);
  await client.query('DELETE FROM shipment_fulfillment_events WHERE id=ANY($1::uuid[])',
    [m.initialFulfillmentEventIds]);
  await client.query('DELETE FROM order_status_events WHERE id=$1',[m.orderStatusEventId]);
  await client.query('DELETE FROM shipment_order_lines WHERE shipment_order_id=$1',[m.shipmentId]);
  await client.query('DELETE FROM shipment_fulfillments WHERE shipment_order_id=$1',[m.shipmentId]);
  await client.query('DELETE FROM shipment_orders WHERE id=$1',[m.shipmentId]);
  await client.query('DELETE FROM checkout_orders WHERE id=$1',[m.orderId]);
  await client.query('DELETE FROM checkout_reservation_lines WHERE reservation_id=$1',[m.reservationId]);
  await client.query('DELETE FROM checkout_reservations WHERE id=$1',[m.reservationId]);
  await client.query('DELETE FROM customer_addresses WHERE id=$1',[m.addressId]);
  await client.query(`UPDATE fulfillment_settings SET owool_seller_id=$1,updated_by=$2,
    version=$3,updated_at=$4 WHERE id=1`,[
    m.previousFulfillmentSetting.owoolSellerId,m.previousFulfillmentSetting.updatedBy,
    m.previousFulfillmentSetting.version,m.previousFulfillmentSetting.updatedAt,
  ]);
  await client.query('DELETE FROM product_publications WHERE product_id=$1',[m.productId]);
  await client.query('DELETE FROM inventory_levels WHERE option_id=$1',[m.optionId]);
  await client.query('DELETE FROM product_options WHERE id=$1',[m.optionId]);
  await client.query('DELETE FROM product_revisions WHERE id=$1',[m.revisionId]);
  await client.query('DELETE FROM products WHERE id=$1',[m.productId]);
  await client.query('DELETE FROM product_categories WHERE id=$1',[m.productCategoryIds[1]]);
  await client.query('DELETE FROM product_categories WHERE id=$1',[m.productCategoryIds[0]]);
  await client.query('DELETE FROM account_roles WHERE account_id=ANY($1::uuid[])',[m.accountIds]);
  await client.query('DELETE FROM account_identities WHERE account_id=ANY($1::uuid[])',[m.accountIds]);
  await client.query('DELETE FROM accounts WHERE id=ANY($1::uuid[])',[m.accountIds]);
  await client.query('DELETE FROM sellers WHERE id=ANY($1::uuid[])',[m.sellerIds]);
  await client.query('DELETE FROM seller_categories WHERE id=$1',[m.sellerCategoryId]);
  return { accounts:5,sellers:2,products:1,orders:1,shipments:1 };
}

export async function runSupportUiFixture(action: 'seed' | 'reset',value: string,
  databaseUrl: string,password?: string,manifestJson?: string,expectedSystemId?: string,
  sharedConsent?: string) {
  const runId = validateQaRunId(value);
  const databaseName = sharedConsent === undefined
    ? validateSupportUiTarget(databaseUrl,runId).database
    : validateSharedSupportUiTarget(databaseUrl,runId,sharedConsent).database;
  await assertSupportUiTempRoot();
  if (action !== 'seed' && action !== 'reset') throw new Error('Invalid QA action');
  if (!password || password.length < 12) throw new Error('QA_FIXTURE_PASSWORD must be set');
  const manifest = action === 'reset'
    ? validateSupportUiManifest(runId,JSON.parse(manifestJson ?? 'null'),password) : null;
  const recoveryPath = supportUiRecoveryPath(runId);
  const pool = new Pool({ connectionString:databaseUrl,max:1 });
  const staged: { restore: () => Promise<void>;purge: () => Promise<void> }[] = [];
  let committed = false;
  let recoveryCreated = false;
  let result: SupportUiManifest | { accounts: number;sellers: number;products: number;
    orders: number;shipments: number };
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      const actual = (await client.query<{ databaseName: string;systemId: string }>(`
        SELECT current_database() AS "databaseName",system_identifier::text AS "systemId"
        FROM pg_control_system()`)).rows[0];
      validateSupportUiSystemTarget(runId,expectedSystemId,actual,databaseName);
      if (action === 'seed') {
        if (sharedConsent !== undefined) await assertSharedSupportUiBaseline(client);
        result = await seedFixture(client,runId,password);
        await createRecoveryFile(recoveryPath,password,result,
          () => { recoveryCreated = true; });
      }
      else {
        await assertRecoveryPermissions(recoveryPath);
        const saved = JSON.parse(await readFile(recoveryPath,'utf8')) as {
          password?: string;manifest?: SupportUiManifest };
        if (saved.password !== password ||
            JSON.stringify(saved.manifest) !== JSON.stringify(manifest))
          throw new Error('Support UI fixture recovery file mismatch');
        const files = await assertResetOwnership(client,manifest!);
        await assertOwnedFiles(runId,files);
        const store = new ImageQuarantine(supportUiUploadRoot(runId));
        for (const file of files) staged.push(await store.stageRemoval(file.object_key));
        result = await deleteOwnedRows(client,manifest!);
        if (sharedConsent !== undefined) await assertSharedSupportUiBaseline(client);
      }
      await client.query('COMMIT');
      committed = true;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      const recoveryErrors: unknown[] = [];
      for (const item of staged.reverse()) {
        try { await item.restore(); } catch (restoreError) { recoveryErrors.push(restoreError); }
      }
      if (recoveryCreated && !committed) {
        try { await unlink(recoveryPath); }
        catch (removeError) { recoveryErrors.push(removeError); }
      }
      if (recoveryErrors.length)
        throw new AggregateError([error,...recoveryErrors],
          'Support UI reset rollback left private image recovery work');
      throw error;
    } finally { client.release(); }
    if (committed && action === 'reset') {
      for (const item of staged) await item.purge();
      const root = supportUiUploadRoot(runId);
      for (const target of [join(root,'quarantine'),join(root,'trash'),root]) {
        try { await rmdir(target); }
        catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
        }
      }
      await unlink(recoveryPath);
      try { await stat(recoveryPath); throw new Error('Support UI recovery file remains'); }
      catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      }
    }
    return result!;
  } finally { await pool.end(); }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const action = process.argv[2];
  if (action !== 'seed' && action !== 'reset')
    throw new Error('usage: qa-support-ui-fixture.ts seed|reset');
  runSupportUiFixture(action,process.env.QA_RUN_ID ?? '',process.env.DATABASE_URL ?? '',
    process.env.QA_FIXTURE_PASSWORD,process.env.QA_FIXTURE_JSON,
    process.env.S52_SUPPORT_UI_DB_SYSTEM_ID,process.env.QA_SHARED_SUPPORT_UI)
    .then((value) => { process.stdout.write(`${JSON.stringify(value)}\n`); })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : 'Support UI fixture failed'}\n`);
      process.exitCode = 1;
    });
}
