import { createHash, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { canAccess, type AccessContext } from '../access.js';
import { findAdminCorrectionReplay, findAdminSettingReplay, findSellerTransitionReplay,
  getAdminFulfillmentDetail, getAdminFulfillmentSetting, getSellerFulfillmentDetail,
  hasActiveSellerGrant, insertAdminCorrectionRecords, insertSellerTransitionRecords,
  listAdminFulfillments, listSellerFulfillments, lockAdminFulfillment,
  lockAdminFulfillmentSetting, lockSellerFulfillment, updateAdminFulfillment,
  updateAdminFulfillmentSetting, updateSellerFulfillment, type AdminFulfillmentCursor,
  type SellerFulfillmentCursor } from './repository.js';
import { validateAdminCorrection, validateSellerTransition } from './rules.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const paidAt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.(?:\d{3}|\d{6})Z$/;
const statuses = new Set(['READY', 'PACKING', 'DELAYED', 'SHIPPED', 'CANCELLED']);
const transitionFields = ['targetStatus', 'expectedVersion', 'reason', 'customerMessage',
  'expectedShipDate', 'carrierCode', 'carrierName', 'trackingNumber'] as const;

type TransitionBody = Record<(typeof transitionFields)[number], unknown> & { expectedVersion: number };

function invalid(): Error { return new Error('Invalid fulfillment request'); }

const CURSOR_CHECKSUM_PREFIX = 'seller-fulfillment-cursor-checksum-v1\0';

// SQL seller scope is the authorization boundary. This unkeyed checksum only detects
// opaque cursor format/corruption; it does not authenticate the cursor.
function cursorChecksum(payload: string): Buffer {
  return createHash('sha256').update(CURSOR_CHECKSUM_PREFIX).update(payload).digest();
}

function encodeCursor(cursor: SellerFulfillmentCursor): string {
  const payload = Buffer.from(JSON.stringify({ paidAt: cursor.paidAt,
    shipmentOrderId: cursor.shipmentOrderId })).toString('base64url');
  return Buffer.from(JSON.stringify({ payload,
    checksum: cursorChecksum(payload).toString('base64url') })).toString('base64url');
}

function decodeCursor(value: unknown): SellerFulfillmentCursor {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(value)) throw invalid();
  try {
    const envelope = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) throw invalid();
    const record = envelope as Record<string, unknown>;
    if (Object.keys(record).length !== 2 || typeof record.payload !== 'string' ||
        typeof record.checksum !== 'string') throw invalid();
    const actualChecksum = Buffer.from(record.checksum, 'base64url');
    const expectedChecksum = cursorChecksum(record.payload);
    if (actualChecksum.length !== expectedChecksum.length ||
        !timingSafeEqual(actualChecksum, expectedChecksum)) throw invalid();
    const decoded = JSON.parse(Buffer.from(record.payload, 'base64url').toString('utf8')) as unknown;
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw invalid();
    const cursor = decoded as Record<string, unknown>;
    if (Object.keys(cursor).length !== 2 || typeof cursor.paidAt !== 'string' ||
        !paidAt.test(cursor.paidAt) || !Number.isFinite(new Date(cursor.paidAt).getTime()) ||
        typeof cursor.shipmentOrderId !== 'string' || !uuid.test(cursor.shipmentOrderId)) throw invalid();
    return { paidAt: cursor.paidAt, shipmentOrderId: cursor.shipmentOrderId };
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid fulfillment request') throw error;
    throw invalid();
  }
}

function parseListQuery(query: Record<string, unknown>) {
  if (Object.keys(query).some((key) => !['status', 'cursor', 'limit'].includes(key)) ||
      Object.values(query).some((value) => typeof value !== 'string')) throw invalid();
  if (query.status !== undefined && !statuses.has(query.status as string)) throw invalid();
  let limit = 20;
  if (query.limit !== undefined) {
    if (!/^\d+$/.test(query.limit as string)) throw invalid();
    limit = Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw invalid();
  }
  return {
    status: query.status as string | undefined,
    cursor: query.cursor === undefined ? undefined : decodeCursor(query.cursor),
    limit,
  };
}

function parseTransitionBody(value: unknown): TransitionBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !transitionFields.includes(
    key as (typeof transitionFields)[number],
  )) || typeof input.targetStatus !== 'string' || !Number.isInteger(input.expectedVersion) ||
      (input.expectedVersion as number) < 0) throw invalid();
  return input as TransitionBody;
}

function transitionFingerprint(shipmentOrderId: string, body: TransitionBody): string {
  const canonical: Record<string, unknown> = { shipmentOrderId };
  for (const key of transitionFields) {
    if (Object.hasOwn(body, key)) canonical[key] = body[key];
  }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function maskName(value: string): string {
  const characters = Array.from(value);
  if (characters.length < 2) return '*';
  if (characters.length === 2) return `${characters[0]}*`;
  return `${characters[0]}${'*'.repeat(Math.max(2, characters.length - 2))}${characters.at(-1)}`;
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return `***-***-${digits.slice(-4).padStart(4, '*')}`;
}

async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export class SellerFulfillmentService {
  private readonly sellerId: string;

  constructor(private readonly pool: Pool, private readonly actor: AccessContext) {
    if (!actor.sellerId || !canAccess(actor, 'manage-seller-fulfillment',
      { sellerId: actor.sellerId })) throw new Error('Fulfillment forbidden');
    this.sellerId = actor.sellerId;
  }

  async list(query: Record<string, unknown>) {
    const input = parseListQuery(query);
    const rows = await listSellerFulfillments(this.pool, this.sellerId, input);
    const visible = rows.slice(0, input.limit);
    const items = visible.map((row) => ({
      shipmentOrderId: row.shipmentOrderId,
      status: row.status,
      version: row.version,
      paidAt: row.paidAt.toISOString(),
      expectedShipDate: row.expectedShipDate,
      recipientName: maskName(row.recipientName),
      phone: maskPhone(row.phone),
      carrierCode: row.carrierCode,
      carrierName: row.carrierName,
      trackingNumber: row.trackingNumber,
    }));
    const last = visible.at(-1);
    return {
      items,
      nextCursor: rows.length > input.limit && last ? encodeCursor({
        paidAt: last.cursorPaidAt, shipmentOrderId: last.shipmentOrderId,
      }) : null,
    };
  }

  async detail(shipmentOrderId: string) {
    return getSellerFulfillmentDetail(this.pool, this.sellerId, shipmentOrderId);
  }

  async transition(shipmentOrderId: string, idempotencyKey: string, value: unknown) {
    const body = parseTransitionBody(value);
    const fingerprint = transitionFingerprint(shipmentOrderId, body);
    return transaction(this.pool, async (client) => {
      const current = await lockSellerFulfillment(client, this.sellerId, shipmentOrderId);
      if (!current) throw new Error('Fulfillment unavailable');
      const replay = await findSellerTransitionReplay(client, shipmentOrderId,
        this.actor.accountId, idempotencyKey);
      if (replay) {
        if (replay.requestFingerprint !== fingerprint) throw new Error('Fulfillment conflict');
        if (replay.response && typeof replay.response === 'object') return replay.response;
        return {
          shipmentOrderId,
          status: replay.afterSnapshot.status,
          version: body.expectedVersion + 1,
          expectedShipDate: replay.afterSnapshot.expectedShipDate,
          customerMessage: replay.customerMessage,
          carrierCode: replay.afterSnapshot.carrierCode,
          carrierName: body.carrierName ?? null,
          trackingNumber: replay.afterSnapshot.trackingNumber,
        };
      }
      if (current.version !== body.expectedVersion) throw new Error('Fulfillment conflict');
      const { expectedVersion, ...request } = body;
      const validated = validateSellerTransition({
        currentStatus: current.status,
        currentExpectedShipDate: current.expectedShipDate,
        currentSeoulDate: current.currentSeoulDate,
        ...request,
      });
      const version = await updateSellerFulfillment(client, shipmentOrderId,
        expectedVersion, validated);
      if (version === undefined) throw new Error('Fulfillment conflict');
      const customerMessage = validated.customerMessage ?? current.customerMessage;
      const response = {
        shipmentOrderId,
        status: validated.status,
        version,
        expectedShipDate: validated.expectedShipDate,
        customerMessage,
        carrierCode: validated.carrierCode,
        carrierName: validated.carrierName,
        trackingNumber: validated.trackingNumber,
      };
      const action = validated.status === 'DELAYED' ? 'REPORT_DELAY'
        : validated.status === 'SHIPPED' ? 'MARK_SHIPPED'
          : current.status === 'DELAYED' ? 'RESUME_PACKING' : 'START_PACKING';
      await insertSellerTransitionRecords(client, {
        shipmentOrderId,
        accountId: this.actor.accountId,
        sellerId: this.sellerId,
        idempotencyKey,
        requestFingerprint: fingerprint,
        action,
        fromStatus: current.status,
        toStatus: validated.status,
        reason: validated.delayedReason,
        customerMessage: validated.customerMessage,
        beforeSnapshot: {
          status: current.status,
          expectedShipDate: current.expectedShipDate,
          carrierCode: current.carrierCode,
          trackingNumber: current.trackingNumber,
        },
        afterSnapshot: {
          status: validated.status,
          expectedShipDate: validated.expectedShipDate,
          carrierCode: validated.carrierCode,
          trackingNumber: validated.trackingNumber,
        },
        response,
      });
      return response;
    });
  }
}

const ADMIN_CURSOR_CHECKSUM_PREFIX = 'admin-fulfillment-cursor-checksum-v1\0';
const settingFields = ['owoolSellerId', 'expectedVersion', 'reason'] as const;
const correctionFields = ['expectedVersion', 'corrected', 'reason', 'customerMessage'] as const;
const correctedFields = [
  'status', 'expectedShipDate', 'carrierCode', 'carrierName', 'trackingNumber',
] as const;

type SettingBody = {
  owoolSellerId: string;
  expectedVersion: number;
  reason: string;
};

type CorrectionBody = {
  expectedVersion: number;
  corrected: Record<string, unknown>;
  reason: string;
  customerMessage: string;
};

function adminCursorChecksum(payload: string): Buffer {
  return createHash('sha256').update(ADMIN_CURSOR_CHECKSUM_PREFIX).update(payload).digest();
}

function encodeAdminCursor(cursor: AdminFulfillmentCursor): string {
  const payload = Buffer.from(JSON.stringify({
    paidAt: cursor.paidAt, shipmentOrderId: cursor.shipmentOrderId,
  })).toString('base64url');
  return Buffer.from(JSON.stringify({
    payload, checksum: adminCursorChecksum(payload).toString('base64url'),
  })).toString('base64url');
}

function decodeAdminCursor(value: unknown): AdminFulfillmentCursor {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(value)) throw invalid();
  try {
    const envelope = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) throw invalid();
    const record = envelope as Record<string, unknown>;
    if (Object.keys(record).length !== 2 || typeof record.payload !== 'string' ||
        typeof record.checksum !== 'string') throw invalid();
    const actualChecksum = Buffer.from(record.checksum, 'base64url');
    const expectedChecksum = adminCursorChecksum(record.payload);
    if (actualChecksum.length !== expectedChecksum.length ||
        !timingSafeEqual(actualChecksum, expectedChecksum)) throw invalid();
    const decoded = JSON.parse(Buffer.from(record.payload, 'base64url').toString('utf8')) as unknown;
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw invalid();
    const cursor = decoded as Record<string, unknown>;
    if (Object.keys(cursor).length !== 2 || typeof cursor.paidAt !== 'string' ||
        !paidAt.test(cursor.paidAt) || !Number.isFinite(new Date(cursor.paidAt).getTime()) ||
        typeof cursor.shipmentOrderId !== 'string' || !uuid.test(cursor.shipmentOrderId)) throw invalid();
    return { paidAt: cursor.paidAt, shipmentOrderId: cursor.shipmentOrderId };
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid fulfillment request') throw error;
    throw invalid();
  }
}

function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseAdminFulfillmentListQuery(query: Record<string, unknown>) {
  if (Object.keys(query).some((key) =>
    !['status', 'sellerId', 'categoryId', 'from', 'to', 'cursor', 'limit'].includes(key)) ||
      Object.values(query).some((value) => typeof value !== 'string')) throw invalid();
  if (query.status !== undefined && !statuses.has(query.status as string)) throw invalid();
  if (query.sellerId !== undefined && !uuid.test(query.sellerId as string)) throw invalid();
  if (query.categoryId !== undefined && !uuid.test(query.categoryId as string)) throw invalid();
  if (query.from !== undefined && !validCalendarDate(query.from as string)) throw invalid();
  if (query.to !== undefined && !validCalendarDate(query.to as string)) throw invalid();
  if (query.from !== undefined && query.to !== undefined &&
      (query.from as string) > (query.to as string)) throw invalid();
  let limit = 20;
  if (query.limit !== undefined) {
    if (!/^\d+$/.test(query.limit as string)) throw invalid();
    limit = Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw invalid();
  }
  const result: {
    status?: string; sellerId?: string; categoryId?: string; from?: string; to?: string;
    cursor?: AdminFulfillmentCursor; limit: number;
  } = { limit };
  if (query.status !== undefined) result.status = query.status as string;
  if (query.sellerId !== undefined) result.sellerId = query.sellerId as string;
  if (query.categoryId !== undefined) result.categoryId = query.categoryId as string;
  if (query.from !== undefined) result.from = query.from as string;
  if (query.to !== undefined) result.to = query.to as string;
  if (query.cursor !== undefined) result.cursor = decodeAdminCursor(query.cursor);
  return result;
}

function nonEmptyText(value: unknown): string {
  if (typeof value !== 'string') throw invalid();
  const result = value.trim();
  if (!result || Array.from(result).length > 500) throw invalid();
  return result;
}

function parseSettingBody(value: unknown): SettingBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== settingFields.length ||
      Object.keys(input).some((key) => !settingFields.includes(
        key as (typeof settingFields)[number],
      )) || typeof input.owoolSellerId !== 'string' || !uuid.test(input.owoolSellerId) ||
      !Number.isInteger(input.expectedVersion) || (input.expectedVersion as number) < 0) throw invalid();
  return {
    owoolSellerId: input.owoolSellerId,
    expectedVersion: input.expectedVersion as number,
    reason: nonEmptyText(input.reason),
  };
}

function parseCorrectionBody(value: unknown): CorrectionBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== correctionFields.length ||
      Object.keys(input).some((key) => !correctionFields.includes(
        key as (typeof correctionFields)[number],
      )) || !Number.isInteger(input.expectedVersion) || (input.expectedVersion as number) < 0 ||
      !input.corrected || typeof input.corrected !== 'object' || Array.isArray(input.corrected) ||
      Object.keys(input.corrected as Record<string, unknown>).some((key) =>
        !correctedFields.includes(key as (typeof correctedFields)[number]))) throw invalid();
  return {
    expectedVersion: input.expectedVersion as number,
    corrected: input.corrected as Record<string, unknown>,
    reason: nonEmptyText(input.reason),
    customerMessage: nonEmptyText(input.customerMessage),
  };
}

function settingFingerprint(body: SettingBody): string {
  return createHash('sha256').update(JSON.stringify({
    owoolSellerId: body.owoolSellerId,
    expectedVersion: body.expectedVersion,
    reason: body.reason,
  })).digest('hex');
}

function correctionFingerprint(shipmentOrderId: string, body: CorrectionBody): string {
  const corrected: Record<string, unknown> = {};
  for (const key of correctedFields) {
    if (Object.hasOwn(body.corrected, key)) corrected[key] = body.corrected[key];
  }
  return createHash('sha256').update(JSON.stringify({
    shipmentOrderId,
    expectedVersion: body.expectedVersion,
    corrected,
    reason: body.reason,
    customerMessage: body.customerMessage,
  })).digest('hex');
}

export class AdminFulfillmentService {
  constructor(private readonly pool: Pool, private readonly actor: AccessContext) {
    if (actor.role !== 'admin') throw new Error('Fulfillment forbidden');
  }

  async getSetting() {
    const setting = await getAdminFulfillmentSetting(this.pool);
    if (!setting) throw new Error('Fulfillment configuration unavailable');
    return setting;
  }

  async updateSetting(idempotencyKey: string, value: unknown) {
    const body = parseSettingBody(value);
    const requestFingerprint = settingFingerprint(body);
    return transaction(this.pool, async (client) => {
      const current = await lockAdminFulfillmentSetting(client);
      if (!current) throw new Error('Fulfillment configuration unavailable');
      const replay = await findAdminSettingReplay(client, this.actor.accountId, idempotencyKey);
      if (replay) {
        if (replay.requestFingerprint !== requestFingerprint || !replay.response) {
          throw new Error('Fulfillment conflict');
        }
        return replay.response;
      }
      if (current.version !== body.expectedVersion) throw new Error('Fulfillment conflict');
      if (!await hasActiveSellerGrant(client, body.owoolSellerId)) throw invalid();
      const changed = await updateAdminFulfillmentSetting(client, {
        sellerId: body.owoolSellerId,
        accountId: this.actor.accountId,
        expectedVersion: body.expectedVersion,
        reason: body.reason,
        idempotencyKey,
        requestFingerprint,
      });
      if (!changed) throw new Error('Fulfillment conflict');
      return changed;
    });
  }

  async list(query: Record<string, unknown>) {
    const input = parseAdminFulfillmentListQuery(query);
    const rows = await listAdminFulfillments(this.pool, input);
    const visible = rows.slice(0, input.limit);
    const items = visible.map((row) => ({
      shipmentOrderId: row.shipmentOrderId,
      status: row.status,
      version: row.version,
      paidAt: row.paidAt.toISOString(),
      expectedShipDate: row.expectedShipDate,
      recipientName: maskName(row.recipientName),
      phone: maskPhone(row.phone),
      fulfillmentSeller: {
        id: row.fulfillmentSellerId,
        displayName: row.fulfillmentSellerName,
      },
      categories: row.categories,
      carrierCode: row.carrierCode,
      carrierName: row.carrierName,
      trackingNumber: row.trackingNumber,
    }));
    const last = visible.at(-1);
    return {
      items,
      nextCursor: rows.length > input.limit && last ? encodeAdminCursor({
        paidAt: last.cursorPaidAt,
        shipmentOrderId: last.shipmentOrderId,
      }) : null,
    };
  }

  async detail(shipmentOrderId: string) {
    return getAdminFulfillmentDetail(this.pool, shipmentOrderId);
  }

  async correct(shipmentOrderId: string, idempotencyKey: string, value: unknown) {
    const body = parseCorrectionBody(value);
    const requestFingerprint = correctionFingerprint(shipmentOrderId, body);
    return transaction(this.pool, async (client) => {
      const current = await lockAdminFulfillment(client, shipmentOrderId);
      if (!current) throw new Error('Fulfillment unavailable');
      const replay = await findAdminCorrectionReplay(
        client, shipmentOrderId, this.actor.accountId, idempotencyKey,
      );
      if (replay) {
        if (replay.requestFingerprint !== requestFingerprint || !replay.response) {
          throw new Error('Fulfillment conflict');
        }
        return replay.response;
      }
      if (current.version !== body.expectedVersion) throw new Error('Fulfillment conflict');
      const validated = validateAdminCorrection({
        current: {
          status: current.status,
          expectedShipDate: current.expectedShipDate,
          carrierCode: current.carrierCode,
          carrierName: current.carrierName,
          trackingNumber: current.trackingNumber,
        },
        corrected: body.corrected,
        reason: body.reason,
        customerMessage: body.customerMessage,
      });
      const version = await updateAdminFulfillment(
        client, shipmentOrderId, body.expectedVersion, validated,
      );
      if (version === undefined) throw new Error('Fulfillment conflict');
      const beforeSnapshot = {
        status: current.status,
        expectedShipDate: current.expectedShipDate,
        carrierCode: current.carrierCode,
        trackingNumber: current.trackingNumber,
      };
      const afterSnapshot = {
        status: validated.status,
        expectedShipDate: validated.expectedShipDate,
        carrierCode: validated.carrierCode,
        trackingNumber: validated.trackingNumber,
      };
      const auditBefore = { ...beforeSnapshot, carrierName: current.carrierName };
      const auditAfter = { ...afterSnapshot, carrierName: validated.carrierName };
      const response = {
        shipmentOrderId,
        status: validated.status,
        version,
        expectedShipDate: validated.expectedShipDate,
        customerMessage: validated.customerMessage,
        carrierCode: validated.carrierCode,
        carrierName: validated.carrierName,
        trackingNumber: validated.trackingNumber,
      };
      await insertAdminCorrectionRecords(client, {
        shipmentOrderId,
        accountId: this.actor.accountId,
        idempotencyKey,
        requestFingerprint,
        fromStatus: current.status,
        toStatus: validated.status,
        reason: validated.reason,
        customerMessage: validated.customerMessage,
        beforeSnapshot,
        afterSnapshot,
        auditBefore,
        auditAfter,
        response,
      });
      return response;
    });
  }
}
