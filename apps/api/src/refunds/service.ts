import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { allocateIncrementalRefundWon } from './allocation.js';
import { providerRefundId, resolveRefundMode, type VerifiedRefund } from './adapter.js';
import { listRefundCaseSummaries, readAdminRefundCase, readCustomerRefundCase,
  readRefundCase, type RefundCaseView } from './repository.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const reasonCodes = new Set(['customer_request', 'quality_issue', 'wrong_delivery', 'damaged', 'other']);
type Role = 'customer' | 'admin' | 'seller';
type RequestLine = { optionId: string; quantity: number };
type DecisionLine = { optionId: string; restockMode: 'none' | 'on_hand_only' };

function validText(value: unknown) {
  return typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 500;
}
function normalizeRequestLines(lines: RequestLine[]) {
  if (!Array.isArray(lines) || !lines.length) throw new Error('Invalid refund request');
  const normalized = lines.map(({ optionId, quantity }) => ({ optionId, quantity }))
    .sort((a, b) => a.optionId.localeCompare(b.optionId));
  if (normalized.some(({ optionId, quantity }, index) => !uuid.test(optionId) ||
      !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000 ||
      (index > 0 && normalized[index - 1].optionId === optionId))) throw new Error('Invalid refund request');
  return normalized;
}
function normalizeDecisionLines(lines: DecisionLine[]) {
  if (!Array.isArray(lines)) throw new Error('Invalid refund decision');
  const normalized = lines.map(({ optionId, restockMode }) => ({ optionId, restockMode }))
    .sort((a, b) => a.optionId.localeCompare(b.optionId));
  if (normalized.some(({ optionId, restockMode }, index) => !uuid.test(optionId) ||
      !['none', 'on_hand_only'].includes(restockMode) ||
      (index > 0 && normalized[index - 1].optionId === optionId))) throw new Error('Invalid refund decision');
  return normalized;
}
async function requireRole(client: PoolClient, accountId: string, role: Role) {
  const found = await client.query(`SELECT a.id FROM accounts a JOIN account_roles r ON r.account_id=a.id
    WHERE a.id=$1 AND a.disabled_at IS NULL AND r.role=$2 FOR UPDATE OF a`, [accountId, role]);
  if (!found.rowCount) throw new Error('Refund unavailable');
}

export async function createRefundCaseWithDisposition(pool: Pool, input: { actorAccountId: string; actorRole: Role;
  checkoutOrderId: string; shipmentOrderId: string; lines: RequestLine[]; reasonCode: string;
  reason: string; idempotencyKey: string }): Promise<{ view: RefundCaseView; created: boolean }> {
  if (![input.actorAccountId, input.checkoutOrderId, input.shipmentOrderId, input.idempotencyKey]
      .every((value) => uuid.test(value)) || !['customer', 'admin'].includes(input.actorRole) ||
      !reasonCodes.has(input.reasonCode) || !validText(input.reason)) throw new Error('Invalid refund request');
  const lines = normalizeRequestLines(input.lines);
  const requestFingerprint = hash({ shipmentOrderId: input.shipmentOrderId, lines,
    reasonCode: input.reasonCode, reason: input.reason.trim() });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await requireRole(client, input.actorAccountId, input.actorRole);
    const order = (await client.query<{ accountId: string; status: string }>(
      `SELECT account_id AS "accountId",status FROM checkout_orders WHERE id=$1 FOR UPDATE`,
    [input.checkoutOrderId])).rows[0];
    if (!order || order.status !== 'PAID' ||
        (input.actorRole === 'customer' && order.accountId !== input.actorAccountId))
      throw new Error('Refund unavailable');
    const prior = (await client.query<{ id: string; requestFingerprint: string }>(
      `SELECT id,request_fingerprint AS "requestFingerprint" FROM refund_cases
       WHERE requester_account_id=$1 AND checkout_order_id=$2 AND idempotency_key=$3 FOR UPDATE`,
    [input.actorAccountId, input.checkoutOrderId, input.idempotencyKey])).rows[0];
    if (prior) {
      if (prior.requestFingerprint !== requestFingerprint) throw new Error('Refund conflict');
      const view = await readRefundCase(client, prior.id);
      await client.query('COMMIT');
      return { view: view!, created: false };
    }
    const shipment = (await client.query<{ status: string }>(
      `SELECT status FROM shipment_orders WHERE id=$1 AND checkout_order_id=$2 FOR UPDATE`,
    [input.shipmentOrderId, input.checkoutOrderId])).rows[0];
    if (!shipment || shipment.status !== 'PAID') throw new Error('Refund unavailable');
    const original = await client.query<{ optionId: string; quantity: number }>(
      `SELECT option_id AS "optionId",quantity FROM shipment_order_lines
       WHERE shipment_order_id=$1 AND option_id=ANY($2::uuid[]) ORDER BY option_id`,
    [input.shipmentOrderId, lines.map(({ optionId }) => optionId)]);
    if (original.rows.length !== lines.length || original.rows.some((row, index) =>
      row.optionId !== lines[index].optionId || lines[index].quantity > row.quantity))
      throw new Error('Invalid refund request');
    const inserted = await client.query<{ id: string }>(`INSERT INTO refund_cases
      (checkout_order_id,shipment_order_id,requester_account_id,requester_role,
       reason_code,reason,idempotency_key,request_fingerprint)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [input.checkoutOrderId, input.shipmentOrderId, input.actorAccountId, input.actorRole,
      input.reasonCode, input.reason.trim(), input.idempotencyKey, requestFingerprint]);
    const caseId = inserted.rows[0].id;
    for (const line of lines) await client.query(`INSERT INTO refund_case_lines
      (refund_case_id,shipment_order_id,option_id,quantity) VALUES ($1,$2,$3,$4)`,
    [caseId, input.shipmentOrderId, line.optionId, line.quantity]);
    await client.query(`INSERT INTO refund_case_events
      (refund_case_id,from_status,to_status,actor_account_id,actor_role,reason)
      VALUES ($1,NULL,'REQUESTED',$2,$3,'Refund requested')`,
    [caseId, input.actorAccountId, input.actorRole]);
    const view = await readRefundCase(client, caseId);
    await client.query('COMMIT');
    return { view: view!, created: true };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function createRefundCase(pool: Pool, input: Parameters<typeof createRefundCaseWithDisposition>[1]) {
  return (await createRefundCaseWithDisposition(pool, input)).view;
}

export async function getRefundCase(pool: Pool, accountId: string, role: Role,
  caseId: string): Promise<RefundCaseView | null> {
  if (![accountId, caseId].every((value) => uuid.test(value)) || !['customer', 'admin'].includes(role)) return null;
  const client = await pool.connect();
  try {
    const allowed = await client.query(`SELECT 1 FROM account_roles WHERE account_id=$1 AND role=$2`,
      [accountId, role]);
    if (!allowed.rowCount) return null;
    const owned = await client.query<{ id: string }>(`SELECT c.id FROM refund_cases c
      JOIN checkout_orders o ON o.id=c.checkout_order_id WHERE c.id=$1
      AND ($2='admin' OR o.account_id=$3)`, [caseId, role, accountId]);
    return owned.rowCount ? await readRefundCase(client, caseId) : null;
  } finally { client.release(); }
}

export async function listCustomerRefundCases(pool: Pool, accountId: string, checkoutOrderId: string) {
  if (![accountId, checkoutOrderId].every((value) => uuid.test(value))) return null;
  const client = await pool.connect();
  try {
    const owned = await client.query(`SELECT 1 FROM checkout_orders o JOIN account_roles r
      ON r.account_id=o.account_id AND r.role='customer'
      WHERE o.id=$1 AND o.account_id=$2`, [checkoutOrderId, accountId]);
    if (!owned.rowCount) return null;
    const summaries = await listRefundCaseSummaries(client, { accountId, checkoutOrderId });
    return Promise.all(summaries.map((summary) => readCustomerRefundCase(client, summary.id)));
  } finally { client.release(); }
}

export async function getCustomerRefundCase(pool: Pool, accountId: string,
  checkoutOrderId: string, caseId: string) {
  if (![accountId, checkoutOrderId, caseId].every((value) => uuid.test(value))) return null;
  const client = await pool.connect();
  try {
    const owned = await client.query(`SELECT 1 FROM refund_cases c JOIN checkout_orders o
      ON o.id=c.checkout_order_id JOIN account_roles r ON r.account_id=o.account_id AND r.role='customer'
      WHERE c.id=$1 AND c.checkout_order_id=$2 AND o.account_id=$3`,
    [caseId, checkoutOrderId, accountId]);
    return owned.rowCount ? readCustomerRefundCase(client, caseId) : null;
  } finally { client.release(); }
}

const refundStatuses = new Set(['REQUESTED', 'APPROVED', 'REJECTED', 'PROCESSING',
  'REFUNDED', 'REVIEW_REQUIRED']);

export async function listAdminRefundCases(pool: Pool, adminAccountId: string, filters: {
  status?: string; shipmentOrderId?: string; from?: string; to?: string;
}) {
  if (!uuid.test(adminAccountId) || (filters.status && !refundStatuses.has(filters.status)) ||
      (filters.shipmentOrderId && !uuid.test(filters.shipmentOrderId))) throw new Error('Invalid refund request');
  const from = filters.from ? new Date(filters.from) : undefined;
  const to = filters.to ? new Date(filters.to) : undefined;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())) ||
      (from && to && from >= to)) throw new Error('Invalid refund request');
  const client = await pool.connect();
  try {
    await requireRole(client, adminAccountId, 'admin');
    return listRefundCaseSummaries(client, { status: filters.status,
      shipmentOrderId: filters.shipmentOrderId, from, to });
  } finally { client.release(); }
}

export async function getAdminRefundCase(pool: Pool, adminAccountId: string, caseId: string) {
  if (![adminAccountId, caseId].every((value) => uuid.test(value))) return null;
  const client = await pool.connect();
  try {
    const allowed = await client.query(`SELECT 1 FROM account_roles r JOIN accounts a ON a.id=r.account_id
      WHERE r.account_id=$1 AND r.role='admin' AND a.disabled_at IS NULL`, [adminAccountId]);
    return allowed.rowCount ? readAdminRefundCase(client, caseId) : null;
  } finally { client.release(); }
}

export async function decideRefundCase(pool: Pool, input: { adminAccountId: string; caseId: string;
  idempotencyKey: string; decision: 'approve' | 'reject'; reason: string;
  preShipmentConfirmed: boolean; preShipmentEvidence?: string; lines: DecisionLine[] },
env: { APP_ENV?: string; PAYMENT_MODE?: string } = process.env): Promise<RefundCaseView> {
  if (![input.adminAccountId, input.caseId, input.idempotencyKey].every((value) => uuid.test(value)) ||
      !['approve', 'reject'].includes(input.decision) || !validText(input.reason))
    throw new Error('Invalid refund decision');
  const lines = normalizeDecisionLines(input.lines);
  const decisionFingerprint = hash({ decision: input.decision, reason: input.reason.trim(),
    preShipmentConfirmed: input.preShipmentConfirmed,
    preShipmentEvidence: input.preShipmentEvidence ?? null, lines });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await requireRole(client, input.adminAccountId, 'admin');
    const located = (await client.query<{ checkoutOrderId: string; shipmentOrderId: string }>(
      `SELECT checkout_order_id AS "checkoutOrderId",shipment_order_id AS "shipmentOrderId"
       FROM refund_cases WHERE id=$1`, [input.caseId])).rows[0];
    if (!located) throw new Error('Refund unavailable');
    const order = (await client.query<{ status: string }>(
      'SELECT status FROM checkout_orders WHERE id=$1 FOR UPDATE', [located.checkoutOrderId])).rows[0];
    const shipment = (await client.query<{ status: string; shippingFeeWon: number;
      shippingSupportWon: number; payableWon: number }>(`SELECT status,
      shipping_fee_won AS "shippingFeeWon",shipping_support_won AS "shippingSupportWon",
      payable_won AS "payableWon" FROM shipment_orders WHERE id=$1 FOR UPDATE`,
    [located.shipmentOrderId])).rows[0];
    const fulfillment = (await client.query<{ status: string }>(`SELECT status
      FROM shipment_fulfillments WHERE shipment_order_id=$1 FOR UPDATE`,
    [located.shipmentOrderId])).rows[0];
    await client.query(`SELECT option_id FROM shipment_order_lines
      WHERE shipment_order_id=$1 ORDER BY option_id FOR UPDATE`, [located.shipmentOrderId]);
    await client.query(`SELECT id FROM refund_cases
      WHERE shipment_order_id=$1 ORDER BY id FOR UPDATE`, [located.shipmentOrderId]);
    const target = (await client.query<{ id: string; status: string; checkoutOrderId: string;
      shipmentOrderId: string; decisionIdempotencyKey: string | null; decisionFingerprint: string | null }>(
      `SELECT id,status,checkout_order_id AS "checkoutOrderId",shipment_order_id AS "shipmentOrderId",
       decision_idempotency_key AS "decisionIdempotencyKey",decision_fingerprint AS "decisionFingerprint"
       FROM refund_cases WHERE id=$1`, [input.caseId])).rows[0];
    if (!target || order?.status !== 'PAID' || shipment?.status !== 'PAID' || !fulfillment)
      throw new Error('Refund unavailable');
    if (target.status !== 'REQUESTED') {
      if (target.decisionIdempotencyKey !== input.idempotencyKey ||
          target.decisionFingerprint !== decisionFingerprint) throw new Error('Refund conflict');
      const view = await readRefundCase(client, target.id);
      await client.query('COMMIT');
      return view!;
    }
    if (input.decision === 'reject') {
      if (lines.length) throw new Error('Invalid refund decision');
      await client.query(`UPDATE refund_cases SET status='REJECTED',decided_at=clock_timestamp(),
        completed_at=clock_timestamp(),decision_by=$2,decision_reason=$3,
        decision_idempotency_key=$4,decision_fingerprint=$5 WHERE id=$1`,
      [target.id, input.adminAccountId, input.reason.trim(), input.idempotencyKey, decisionFingerprint]);
      await client.query(`INSERT INTO refund_case_events
        (refund_case_id,from_status,to_status,actor_account_id,actor_role,reason)
        VALUES ($1,'REQUESTED','REJECTED',$2,'admin',$3)`,
      [target.id, input.adminAccountId, input.reason.trim()]);
      const view = await readRefundCase(client, target.id);
      await client.query('COMMIT');
      return view!;
    }
    if (input.decision === 'approve' && fulfillment.status === 'SHIPPED')
      throw new Error('Refund unavailable');
    if (resolveRefundMode(env) !== 'mock' || !input.preShipmentConfirmed ||
        input.preShipmentEvidence !== 'ADMIN_CONFIRMED_NOT_DISPATCHED')
      throw new Error('Refund unavailable');
    const requested = await client.query<{ optionId: string; quantity: number }>(
      `SELECT option_id AS "optionId",quantity FROM refund_case_lines
       WHERE refund_case_id=$1 ORDER BY option_id FOR UPDATE`, [target.id]);
    if (requested.rows.length !== lines.length || requested.rows.some((row, index) =>
      row.optionId !== lines[index].optionId)) throw new Error('Invalid refund decision');
    const originals = await client.query<{ optionId: string; quantity: number; goodsPayableWon: number;
      occupiedQuantity: number }>(`SELECT l.option_id AS "optionId",l.quantity,
      l.goods_payable_won AS "goodsPayableWon",
      coalesce(sum(CASE WHEN c.status IN ('APPROVED','PROCESSING','REFUNDED','REVIEW_REQUIRED')
        THEN cl.quantity ELSE 0 END),0)::int AS "occupiedQuantity"
      FROM shipment_order_lines l LEFT JOIN refund_case_lines cl
        ON cl.shipment_order_id=l.shipment_order_id AND cl.option_id=l.option_id
      LEFT JOIN refund_cases c ON c.id=cl.refund_case_id AND c.id<>$2
      WHERE l.shipment_order_id=$1 GROUP BY l.option_id,l.quantity,l.goods_payable_won
      ORDER BY l.option_id`, [target.shipmentOrderId, target.id]);
    const requestedByOption = new Map(requested.rows.map((row) => [row.optionId, row.quantity]));
    let goodsRefundWon = 0;
    for (const original of originals.rows) {
      const quantity = requestedByOption.get(original.optionId) ?? 0;
      if (original.occupiedQuantity + quantity > original.quantity) throw new Error('Refund conflict');
      if (quantity) goodsRefundWon += allocateIncrementalRefundWon(original.goodsPayableWon,
        original.quantity, original.occupiedQuantity, quantity);
    }
    const fullShipment = originals.rows.every((row) =>
      row.occupiedQuantity + (requestedByOption.get(row.optionId) ?? 0) === row.quantity);
    let shippingRefundWon = 0;
    if (fullShipment) {
      const unfinished = await client.query(`SELECT 1 FROM refund_cases WHERE shipment_order_id=$1
        AND id<>$2 AND status IN ('APPROVED','PROCESSING','REVIEW_REQUIRED') LIMIT 1`,
      [target.shipmentOrderId, target.id]);
      if (unfinished.rowCount) throw new Error('Refund conflict');
      const priorShipping = (await client.query<{ amount: number }>(`SELECT
        coalesce(sum(shipping_refund_won),0)::int AS amount FROM refund_cases
        WHERE shipment_order_id=$1 AND id<>$2 AND status='REFUNDED'`,
      [target.shipmentOrderId, target.id])).rows[0].amount;
      shippingRefundWon = priorShipping ? 0 : shipment.shippingFeeWon - shipment.shippingSupportWon;
    }
    const totalRefundWon = goodsRefundWon + shippingRefundWon;
    const priorTotal = (await client.query<{ amount: number }>(`SELECT
      coalesce(sum(total_refund_won),0)::int AS amount FROM refund_cases WHERE shipment_order_id=$1
      AND id<>$2 AND status IN ('APPROVED','PROCESSING','REFUNDED','REVIEW_REQUIRED')`,
    [target.shipmentOrderId, target.id])).rows[0].amount;
    if (priorTotal + totalRefundWon > shipment.payableWon) throw new Error('Refund conflict');
    for (const line of lines.filter(({ restockMode }) => restockMode === 'on_hand_only')) {
      const restock = await client.query(`SELECT 1 FROM product_options o
        JOIN product_revisions r ON r.id=o.revision_id JOIN inventory_levels i ON i.option_id=o.id
        WHERE o.id=$1 AND NOT EXISTS (SELECT 1 FROM product_sale_stop_requests s
          WHERE s.product_id=r.product_id AND s.status='approved') FOR UPDATE OF o,i`, [line.optionId]);
      if (!restock.rowCount) throw new Error('Restock unavailable');
    }
    const payment = (await client.query<{ id: string; provider: 'mock' | 'no_charge' }>(
      `SELECT a.id,a.provider FROM payment_attempts a WHERE a.checkout_order_id=$1
       AND a.status='APPROVED' AND EXISTS (SELECT 1 FROM payment_events e
         WHERE e.payment_attempt_id=a.id AND e.outcome='APPROVED' AND e.processing_status='APPLIED')
       ORDER BY a.ended_at DESC,a.id DESC LIMIT 1 FOR UPDATE`, [target.checkoutOrderId])).rows[0];
    if (!payment) throw new Error('Refund unavailable');
    const provider = totalRefundWon === 0 ? 'no_charge' : payment.provider;
    const refundId = providerRefundId(provider, target.id);
    await client.query(`UPDATE refund_cases SET status='PROCESSING',goods_refund_won=$2,
      shipping_refund_won=$3,total_refund_won=$4,decided_at=clock_timestamp(),decision_by=$5,
      decision_reason=$6,decision_idempotency_key=$7,decision_fingerprint=$8,
      pre_shipment_evidence='ADMIN_CONFIRMED_NOT_DISPATCHED',pre_shipment_confirmed_by=$5,
      pre_shipment_confirmed_at=clock_timestamp() WHERE id=$1`,
    [target.id, goodsRefundWon, shippingRefundWon, totalRefundWon, input.adminAccountId,
      input.reason.trim(), input.idempotencyKey, decisionFingerprint]);
    for (const line of lines) await client.query(`UPDATE refund_case_lines SET goods_refund_won=$3,
      restock_mode=$4 WHERE refund_case_id=$1 AND option_id=$2`, [target.id, line.optionId,
      allocateIncrementalRefundWon(originals.rows.find((row) => row.optionId === line.optionId)!.goodsPayableWon,
        originals.rows.find((row) => row.optionId === line.optionId)!.quantity,
        originals.rows.find((row) => row.optionId === line.optionId)!.occupiedQuantity,
        requestedByOption.get(line.optionId)!), line.restockMode]);
    const attempt = await client.query<{ id: string }>(`INSERT INTO refund_attempts
      (refund_case_id,payment_attempt_id,provider,provider_refund_id,requested_won,
       idempotency_key,request_fingerprint)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [target.id, payment.id, provider, refundId, totalRefundWon, input.idempotencyKey, decisionFingerprint]);
    await client.query(`INSERT INTO refund_case_events
      (refund_case_id,from_status,to_status,actor_account_id,actor_role,reason)
      VALUES ($1,'REQUESTED','APPROVED',$2,'admin',$3),
             ($1,'APPROVED','PROCESSING',NULL,'system','Refund attempt reserved')`,
    [target.id, input.adminAccountId, input.reason.trim()]);
    const view = await readRefundCase(client, target.id);
    await client.query('COMMIT');
    return { ...view!, attemptId: attempt.rows[0].id, providerRefundId: refundId };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function moveToReview(client: PoolClient, caseId: string, attemptId: string, reason: string) {
  const changed = await client.query<{ status: string }>(`UPDATE refund_cases SET status='REVIEW_REQUIRED'
    WHERE id=$1 AND status='PROCESSING' RETURNING status`, [caseId]);
  await client.query(`UPDATE refund_attempts SET status='REVIEW_REQUIRED',ended_at=clock_timestamp()
    WHERE id=$1 AND status='PENDING'`, [attemptId]);
  if (changed.rowCount) await client.query(`INSERT INTO refund_case_events
    (refund_case_id,from_status,to_status,actor_account_id,actor_role,reason)
    VALUES ($1,'PROCESSING','REVIEW_REQUIRED',NULL,'system',$2)`, [caseId, reason]);
}

export async function recordVerifiedRefundEvent(pool: Pool, attemptId: string,
  verified: VerifiedRefund): Promise<{ id: string; processingStatus: string }> {
  if (!uuid.test(attemptId) || !verified || !['mock', 'no_charge'].includes(verified.provider) ||
      !uuid.test(verified.orderId) || !Number.isSafeInteger(verified.amountWon) ||
      verified.amountWon < 0 || verified.amountWon > 2147483647 ||
      !['SUCCEEDED', 'FAILED'].includes(verified.outcome) ||
      [verified.eventId, verified.paymentId, verified.providerRefundId].some(
        (value) => typeof value !== 'string' || value.length < 1 || value.length > 200))
    throw new Error('Invalid refund event');
  const eventFingerprint = hash({ attemptId, ...verified });
  const persisted = await (async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`${verified.provider}:${verified.eventId}`]);
      const attempt = (await client.query<{ id: string; caseId: string; provider: string;
        providerRefundId: string; requestedWon: number; orderId: string }>(`SELECT a.id,
        a.refund_case_id AS "caseId",a.provider,a.provider_refund_id AS "providerRefundId",
        a.requested_won AS "requestedWon",c.checkout_order_id AS "orderId"
        FROM refund_attempts a JOIN refund_cases c ON c.id=a.refund_case_id WHERE a.id=$1 FOR UPDATE`,
      [attemptId])).rows[0];
      if (!attempt) throw new Error('Refund unavailable');
      const prior = (await client.query<{ id: string; attemptId: string; fingerprint: string;
        processingStatus: string }>(`SELECT id,refund_attempt_id AS "attemptId",
        event_fingerprint AS fingerprint,processing_status AS "processingStatus"
        FROM refund_events WHERE provider=$1 AND provider_event_id=$2 FOR UPDATE`,
      [verified.provider, verified.eventId])).rows[0];
      if (prior) {
        if (prior.attemptId !== attemptId || prior.fingerprint !== eventFingerprint) {
          await client.query(`INSERT INTO refund_event_conflicts
            (original_event_id,incoming_attempt_id,incoming_fingerprint,reason)
            VALUES ($1,$2,$3,$4)`, [prior.id, attemptId, eventFingerprint,
            prior.attemptId === attemptId ? 'FINGERPRINT_MISMATCH' : 'ATTEMPT_MISMATCH']);
          await moveToReview(client, attempt.caseId, attemptId, 'Refund event conflict');
          await client.query('COMMIT');
          return null;
        }
        await client.query('COMMIT');
        return { id: prior.id, processingStatus: prior.processingStatus };
      }
      const mismatch = attempt.provider !== verified.provider ||
        attempt.providerRefundId !== verified.providerRefundId || attempt.orderId !== verified.orderId ||
        attempt.requestedWon !== verified.amountWon;
      const status = mismatch ? 'REVIEW_REQUIRED' : 'PENDING_PROCESSING';
      const inserted = await client.query<{ id: string }>(`INSERT INTO refund_events
        (refund_attempt_id,provider,provider_event_id,outcome,verified_order_id,
         provider_payment_id,provider_refund_id,amount_won,event_fingerprint,
         processing_status,processed_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          CASE WHEN $10='REVIEW_REQUIRED' THEN clock_timestamp() ELSE NULL END) RETURNING id`,
      [attemptId, verified.provider, verified.eventId, verified.outcome, verified.orderId,
        verified.paymentId, verified.providerRefundId, verified.amountWon, eventFingerprint, status]);
      if (mismatch) await moveToReview(client, attempt.caseId, attemptId, 'Refund event mismatch');
      await client.query('COMMIT');
      return { id: inserted.rows[0].id, processingStatus: status };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  })();
  if (!persisted) throw new Error('Refund event conflict');
  return persisted;
}
