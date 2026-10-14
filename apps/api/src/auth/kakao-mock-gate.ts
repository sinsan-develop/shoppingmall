import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
import { KakaoMockError } from './kakao-mock-registry.js';

type Env = Record<string,string|undefined>;
export const protectedKakaoSystemId = '7622490131194466339';
export type KakaoQaManifest = {version:1;runId:string;dbName:string;systemId:string;nonce:string;
  accounts:{customerA:string;customerB:string};identityId:string;addressIds:string[]};
export type KakaoQaBinding = {runId:string;dbName:string;systemId:string;identifier:string;accountId:string};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const unavailable = () => new KakaoMockError(503);
export function assertKakaoMockBootConfig(env:Env):'disabled'|'mock' {
  const mode = env.KAKAO_AUTH_MODE ?? 'disabled';
  if (mode === 'disabled') return mode;
  if (mode !== 'mock' || env.APP_ENV !== 'development' || env.NODE_ENV === 'production' || env.API_HOST !== '127.0.0.1' ||
    !/^[0-9a-f]{8}$/.test(env.QA_KAKAO_RUN_ID ?? '') || env.QA_KAKAO_DB_NAME !== `shoppingmall_s7_kakao_${env.QA_KAKAO_RUN_ID}` ||
    !/^\d+$/.test(env.QA_KAKAO_DB_SYSTEM_ID ?? '') || env.QA_KAKAO_DB_SYSTEM_ID === protectedKakaoSystemId ||
    !env.QA_KAKAO_MANIFEST_PATH || (env.QA_KAKAO_MANIFEST_KEY?.length ?? 0) < 32) throw unavailable();
  try {
    const db = new URL(env.DATABASE_URL ?? ''), web = new URL(env.WEB_ORIGIN ?? '');
    if (!['postgres:','postgresql:'].includes(db.protocol) ||
      !['127.0.0.1','localhost','shoppingmall-s7-kakao-20261014-pg'].includes(db.hostname) ||
      db.pathname !== `/${env.QA_KAKAO_DB_NAME}` || web.protocol !== 'http:' || web.hostname !== '127.0.0.1' ||
      web.origin !== env.WEB_ORIGIN) throw unavailable();
  } catch { throw unavailable(); }
  return mode;
}
export function assertKakaoMockRequest(request:{headers:{origin?:string};socket?:{localAddress?:string;remoteAddress?:string}},env:Env) {
  if (assertKakaoMockBootConfig(env) !== 'mock') throw new KakaoMockError(404);
  const loopback = (value?:string) => ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(value ?? '');
  if (request.headers.origin !== env.WEB_ORIGIN || !loopback(request.socket?.localAddress) || !loopback(request.socket?.remoteAddress))
    throw new KakaoMockError(403);
}
export function signKakaoQaManifest(value:KakaoQaManifest,key:string) {
  return createHmac('sha256',key).update(JSON.stringify(value)).digest('hex');
}
export async function readKakaoQaManifest(env:Env):Promise<KakaoQaManifest> {
  try {
    const raw = await readFile(env.QA_KAKAO_MANIFEST_PATH ?? '', 'utf8');
    if (raw.length > 16384 || (env.QA_KAKAO_MANIFEST_KEY?.length ?? 0) < 32) throw unavailable();
    const parsed = JSON.parse(raw) as KakaoQaManifest & {hmac:string};
    const {hmac,...value} = parsed;
    if (!/^[0-9a-f]{64}$/.test(hmac ?? '') || Object.keys(value).sort().join(',') !== 'accounts,addressIds,dbName,identityId,nonce,runId,systemId,version' ||
      value.version !== 1 || value.runId !== env.QA_KAKAO_RUN_ID || value.dbName !== env.QA_KAKAO_DB_NAME || value.systemId !== env.QA_KAKAO_DB_SYSTEM_ID ||
      value.systemId === protectedKakaoSystemId || !uuid.test(value.nonce) || !uuid.test(value.identityId) ||
      !value.accounts || Object.keys(value.accounts).sort().join(',') !== 'customerA,customerB' ||
      !uuid.test(value.accounts.customerA) || !uuid.test(value.accounts.customerB) || value.accounts.customerA === value.accounts.customerB ||
      !Array.isArray(value.addressIds) || value.addressIds.length !== 2 || value.addressIds.some(id=>!uuid.test(id)) ||
      value.addressIds[0] === value.addressIds[1] ||
      !timingSafeEqual(Buffer.from(hmac,'hex'),Buffer.from(signKakaoQaManifest(value,env.QA_KAKAO_MANIFEST_KEY!), 'hex'))) throw unavailable();
    return value;
  } catch { throw unavailable(); }
}
export async function attestKakaoMockDatabase(pool:Pool,env:Env):Promise<KakaoQaBinding> {
  try {
    if (assertKakaoMockBootConfig(env) !== 'mock') throw unavailable();
    const manifest = await readKakaoQaManifest(env);
    const identity = (await pool.query('SELECT current_database() AS db,system_identifier::text AS system_id FROM pg_control_system()')).rows[0];
    if (identity?.db !== manifest.dbName || identity.system_id !== manifest.systemId || identity.system_id === protectedKakaoSystemId) throw unavailable();
    const identifier = `mock:s7:${manifest.runId}:customer-a`;
    const rows = (await pool.query(`SELECT i.id AS identity_id,i.account_id,i.identifier,a.disabled_at,r.role
      FROM account_identities i JOIN accounts a ON a.id=i.account_id JOIN account_roles r ON r.account_id=a.id
      WHERE i.kind='kakao' AND i.identifier=$1 AND r.role='customer' AND r.seller_id IS NULL`,[identifier])).rows;
    const row=rows[0];
    if (rows.length !== 1 || row.account_id !== manifest.accounts.customerA || row.identity_id !== manifest.identityId ||
      row.identifier !== identifier || row.disabled_at || row.role !== 'customer') throw unavailable();
    return {runId:manifest.runId,dbName:manifest.dbName,systemId:manifest.systemId,identifier,accountId:row.account_id};
  } catch { throw unavailable(); }
}
