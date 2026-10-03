import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { AccessContext } from '../access.js';
import { validatePromotionRule, type PromotionRule } from './rules.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const positiveInt = (value: unknown) => Number.isInteger(value) &&
  typeof value === 'number' && value > 0 && value <= 2147483647;

type CampaignInput = {
  title: string; rule: PromotionRule; directIssueLimit: number | null;
  totalUseLimit: number; perAccountUseLimit: number; code: string | null;
};
type RuleInput = { rule: PromotionRule; code: string | null };
type CampaignRow = QueryResultRow & { id: string; kind: PromotionRule['kind']; status: string;
  directIssueLimit: number | null; versionId?: string; title?: string };

function normalizedCode(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error('Invalid promotion input');
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{4,40}$/.test(code)) throw new Error('Invalid promotion input');
  return code;
}

function parseRuleInput(input: unknown): RuleInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid promotion input');
  const data = input as Record<string, unknown>;
  if (typeof data.startsAt !== 'string' || typeof data.endsAt !== 'string' ||
      !Array.isArray(data.targetIds) || data.targetIds.some((id: unknown) =>
        typeof id !== 'string' || !uuid.test(id)) ||
      !Number.isInteger(data.minimumEligibleGoodsWon) ||
      typeof data.minimumEligibleGoodsWon !== 'number' || data.minimumEligibleGoodsWon > 2147483647 ||
      !Number.isInteger(data.amountValue) || typeof data.amountValue !== 'number' ||
      data.amountValue > 2147483647 ||
      (data.maxDiscountWon !== null && (!Number.isInteger(data.maxDiscountWon) ||
        typeof data.maxDiscountWon !== 'number' || data.maxDiscountWon > 2147483647))) {
    throw new Error('Invalid promotion input');
  }
  try {
    const rule = validatePromotionRule({ kind: data.kind, scope: data.scope,
      targetIds: data.targetIds, startAt: new Date(data.startsAt), endAt: new Date(data.endsAt),
      minimumEligibleGoodsWon: data.minimumEligibleGoodsWon, amountKind: data.amountKind,
      amountValue: data.amountValue, maxDiscountWon: data.maxDiscountWon });
    return { rule, code: normalizedCode(data.code) };
  } catch { throw new Error('Invalid promotion input'); }
}

function parseCampaignInput(input: unknown): CampaignInput {
  const parsed = parseRuleInput(input);
  const data = input as Record<string, unknown>;
  if (typeof data.title !== 'string' || data.title.trim().length < 1 || data.title.trim().length > 160 ||
      (data.directIssueLimit !== null && !positiveInt(data.directIssueLimit)) ||
      !positiveInt(data.totalUseLimit) || !positiveInt(data.perAccountUseLimit)) {
    throw new Error('Invalid promotion input');
  }
  return { title: data.title.trim(), ...parsed,
    directIssueLimit: data.directIssueLimit as number | null,
    totalUseLimit: data.totalUseLimit as number,
    perAccountUseLimit: data.perAccountUseLimit as number };
}

async function insertVersion(client: PoolClient, campaignId: string, version: number,
  parsed: RuleInput, actorId: string): Promise<string> {
  const rule = parsed.rule;
  const inserted = await client.query<{ id: string }>(`INSERT INTO promotion_versions
    (campaign_id,version,scope,target_ids,starts_at,ends_at,minimum_eligible_goods_won,
      amount_kind,amount_value,max_discount_won,created_by_account_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
  [campaignId, version, rule.scope, rule.targetIds, rule.startAt, rule.endAt,
    rule.minimumEligibleGoodsWon, rule.amountKind, rule.amountValue, rule.maxDiscountWon, actorId]);
  const versionId = inserted.rows[0].id;
  if (parsed.code) await client.query('INSERT INTO promotion_codes(version_id,code) VALUES ($1,$2)',
    [versionId, parsed.code]);
  return versionId;
}

async function ensureTargets(client: PoolClient, rule: PromotionRule): Promise<void> {
  if (rule.scope === 'all') return;
  const query = rule.scope === 'sellers'
    ? 'SELECT count(*)::int AS count FROM sellers WHERE id=ANY($1::uuid[])'
    : `SELECT count(*)::int AS count FROM product_options o
       JOIN product_revisions r ON r.id=o.revision_id
       JOIN product_publications p ON p.product_id=r.product_id AND p.revision_id=r.id
       WHERE o.id=ANY($1::uuid[])
         AND NOT EXISTS (SELECT 1 FROM product_sale_stop_requests s
           WHERE s.product_id=r.product_id AND s.status='approved')`;
  const result = await client.query<{ count: number }>(query, [rule.targetIds]);
  if (result.rows[0].count !== rule.targetIds.length) throw new Error('Invalid promotion input');
}

async function audit(client: PoolClient, actor: AccessContext, action: string, targetId: string, details: object) {
  await client.query(`INSERT INTO audit_events
    (actor_account_id,active_role,action,target_type,target_id,details)
    VALUES ($1,'admin',$2,'promotion_campaign',$3,$4)`, [actor.accountId, action, targetId, details]);
}

/** All admin mutations are scoped to the verified admin session and one DB transaction. */
export class PromotionAdminService {
  constructor(private readonly pool: Pool) {}

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') throw new Error('Promotion conflict');
      if ((error as { code?: string }).code === '23503' || (error as { code?: string }).code === '23514')
        throw new Error('Invalid promotion input');
      throw error;
    } finally { client.release(); }
  }

  async list() {
    const result = await this.pool.query(`SELECT c.id,c.title,c.kind,c.status,
      c.direct_issue_limit AS "directIssueLimit",c.total_use_limit AS "totalUseLimit",
      c.per_account_use_limit AS "perAccountUseLimit",v.id AS "versionId",v.version
      FROM promotion_campaigns c LEFT JOIN LATERAL
        (SELECT id,version FROM promotion_versions WHERE campaign_id=c.id ORDER BY version DESC LIMIT 1) v ON true
      ORDER BY c.created_at DESC,c.id`);
    return result.rows;
  }

  async create(actor: AccessContext, input: unknown) {
    const parsed = parseCampaignInput(input);
    return this.transaction(async (client) => {
      await ensureTargets(client, parsed.rule);
      const inserted = await client.query<{ id: string }>(`INSERT INTO promotion_campaigns
        (title,kind,direct_issue_limit,total_use_limit,per_account_use_limit,created_by_account_id)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [parsed.title, parsed.rule.kind, parsed.directIssueLimit,
        parsed.totalUseLimit, parsed.perAccountUseLimit, actor.accountId]);
      const id = inserted.rows[0].id;
      const versionId = await insertVersion(client, id, 1, parsed, actor.accountId);
      await audit(client, actor, 'promotion.campaign_created', id, { versionId });
      return { id, versionId, status: 'active' };
    });
  }

  async addVersion(actor: AccessContext, campaignId: string, input: unknown) {
    if (!uuid.test(campaignId)) throw new Error('Invalid promotion input');
    const parsed = parseRuleInput(input);
    return this.transaction(async (client) => {
      const campaign = await client.query<CampaignRow>(
        'SELECT id,kind,status FROM promotion_campaigns WHERE id=$1 FOR UPDATE', [campaignId]);
      const current = campaign.rows[0];
      if (!current) throw new Error('Promotion not found');
      if (current.status !== 'active') throw new Error('Promotion stopped');
      if (current.kind !== parsed.rule.kind) throw new Error('Invalid promotion input');
      await ensureTargets(client, parsed.rule);
      const version = (await client.query<{ next: number }>(
        'SELECT coalesce(max(version),0)::int+1 AS next FROM promotion_versions WHERE campaign_id=$1',
        [campaignId])).rows[0].next;
      const versionId = await insertVersion(client, campaignId, version, parsed, actor.accountId);
      await audit(client, actor, 'promotion.version_created', campaignId, { versionId, version });
      return { id: campaignId, versionId, version };
    });
  }

  async stop(actor: AccessContext, campaignId: string, reason: unknown) {
    if (!uuid.test(campaignId) || typeof reason !== 'string' || reason.trim().length < 1 ||
        reason.trim().length > 500) throw new Error('Invalid promotion input');
    return this.transaction(async (client) => {
      const result = await client.query<CampaignRow>(
        'SELECT id,status FROM promotion_campaigns WHERE id=$1 FOR UPDATE', [campaignId]);
      if (!result.rows[0]) throw new Error('Promotion not found');
      if (result.rows[0].status !== 'active') throw new Error('Promotion stopped');
      await client.query(`UPDATE promotion_campaigns SET status='stopped',stopped_by_account_id=$2,
        stopped_at=now(),stop_reason=$3 WHERE id=$1`, [campaignId, actor.accountId, reason.trim()]);
      await audit(client, actor, 'promotion.campaign_stopped', campaignId, { reason: reason.trim() });
      return { id: campaignId, status: 'stopped' };
    });
  }

  async issue(actor: AccessContext, campaignId: string, accountId: unknown,
    reason: unknown, idempotencyKey: unknown) {
    if (!uuid.test(campaignId) || typeof accountId !== 'string' || !uuid.test(accountId) ||
        typeof idempotencyKey !== 'string' || !uuid.test(idempotencyKey) ||
        typeof reason !== 'string' || reason.trim().length < 1 || reason.trim().length > 500)
      throw new Error('Invalid promotion input');
    return this.transaction(async (client) => {
      const campaign = await client.query<CampaignRow>(`SELECT id,status,
        direct_issue_limit AS "directIssueLimit" FROM promotion_campaigns WHERE id=$1 FOR UPDATE`, [campaignId]);
      if (!campaign.rows[0]) throw new Error('Promotion not found');
      if (campaign.rows[0].status !== 'active') throw new Error('Promotion stopped');
      const retried = await client.query<{ id: string; accountId: string; campaignId: string; reason: string }>(
        `SELECT g.id,g.account_id AS "accountId",v.campaign_id AS "campaignId",g.reason
         FROM promotion_grants g JOIN promotion_versions v ON v.id=g.version_id
         WHERE g.issued_by_account_id=$1 AND g.idempotency_key=$2`, [actor.accountId, idempotencyKey]);
      if (retried.rows[0]) {
        if (retried.rows[0].accountId !== accountId || retried.rows[0].campaignId !== campaignId ||
            retried.rows[0].reason !== reason.trim()) throw new Error('Promotion conflict');
        return { id: retried.rows[0].id };
      }
      if (campaign.rows[0].directIssueLimit === null) throw new Error('Promotion issue unavailable');
      const account = await client.query(`SELECT 1 FROM accounts a JOIN account_roles r ON r.account_id=a.id
        WHERE a.id=$1 AND a.disabled_at IS NULL AND r.role='customer' LIMIT 1`, [accountId]);
      if (!account.rows[0]) throw new Error('Invalid promotion account');
      const issued = (await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM promotion_grants g
        JOIN promotion_versions v ON v.id=g.version_id
        WHERE v.campaign_id=$1 AND g.source='direct'`, [campaignId])).rows[0].count;
      if (issued >= campaign.rows[0].directIssueLimit) throw new Error('Promotion limit reached');
      const version = await client.query<{ id: string }>(
        'SELECT id FROM promotion_versions WHERE campaign_id=$1 ORDER BY version DESC LIMIT 1', [campaignId]);
      if (!version.rows[0]) throw new Error('Promotion not found');
      const grant = await client.query<{ id: string }>(`INSERT INTO promotion_grants
        (account_id,version_id,source,issued_by_account_id,idempotency_key,reason)
        VALUES ($1,$2,'direct',$3,$4,$5) RETURNING id`,
      [accountId, version.rows[0].id, actor.accountId, idempotencyKey, reason.trim()]);
      await audit(client, actor, 'promotion.grant_issued', campaignId,
        { grantId: grant.rows[0].id, accountId, versionId: version.rows[0].id });
      return { id: grant.rows[0].id };
    });
  }
}
