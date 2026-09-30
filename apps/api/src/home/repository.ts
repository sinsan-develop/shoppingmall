import type { Pool } from 'pg';
import type { AccessContext } from '../access.js';
import { PublicProducts } from '../catalog/public-products.js';
import type { HomePayload } from './types.js';
import { parseHomePayload } from './validation.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Queryable = Pick<Pool, 'query'>;

async function excludedTargets(db: Queryable, payload: HomePayload) {
  const catalog = new PublicProducts(db as Pool);
  const excluded: { kind: string; id: string; reason: string }[] = [];
  const activeEvents = new Set<string>();
  for (const event of payload.events) {
    const products = await catalog.getSellableByIds(event.productIds);
    if (products.length === 0) excluded.push({ kind: 'event', id: event.id, reason: 'no_sellable_products' });
    else activeEvents.add(event.id);
  }
  const validRecommendations = await catalog.getSellableByIds(payload.recommendations);
  const recommendationIds = new Set(validRecommendations.map((product) => product.productId));
  for (const productId of payload.recommendations) {
    if (!recommendationIds.has(productId)) excluded.push({ kind: 'recommendation', id: productId, reason: 'not_sellable' });
  }
  for (const item of payload.menu) {
    const link = item.target;
    let valid = true;
    if (link.type === 'event') valid = activeEvents.has(link.id);
    if (link.type === 'product') valid = (await catalog.getSellableByIds([link.id])).length > 0;
    if (link.type === 'category') valid = (await catalog.list({ categoryId: link.id })).length > 0;
    if (link.type === 'seller') valid = (await catalog.list({ sellerId: link.id })).length > 0;
    if (!valid) excluded.push({ kind: 'menu', id: item.id, reason: 'invalid_target' });
  }
  return excluded;
}

export class HomeRepository {
  constructor(private readonly pool: Pool) {}

  async getDraft(): Promise<{ version: number; payload: HomePayload }> {
    const result = await this.pool.query<{ version: number; payload: HomePayload }>(
      'SELECT version,payload FROM home_content_draft WHERE id=1',
    );
    if (!result.rows[0]) throw new Error('Home draft unavailable');
    return result.rows[0];
  }

  async saveDraft(actor: AccessContext, version: number, payload: HomePayload) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query<{ version: number; payload: HomePayload }>(
        `UPDATE home_content_draft SET version=version+1,payload=$1,updated_by_account_id=$2,updated_at=now()
         WHERE id=1 AND version=$3 RETURNING version,payload`,
        [payload, actor.accountId, version],
      );
      if (!updated.rows[0]) throw new Error('Home draft version conflict');
      await client.query(
        `INSERT INTO audit_events(actor_account_id,active_role,action,target_type,target_id,details)
         VALUES ($1,$2,'home.draft_saved','home_content_draft','1',$3)`,
        [actor.accountId, actor.role, { previousVersion: version, version: updated.rows[0].version }],
      );
      await client.query('COMMIT');
      return updated.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async preview() {
    const draft = await this.getDraft();
    return { payload: draft.payload, excluded: await excludedTargets(this.pool, draft.payload) };
  }

  async publish(actor: AccessContext, version: number) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const draft = await client.query<{ version: number; payload: HomePayload }>(
        'SELECT version,payload FROM home_content_draft WHERE id=1 FOR UPDATE',
      );
      if (!draft.rows[0] || draft.rows[0].version !== version) throw new Error('Home draft version conflict');
      const payload = parseHomePayload(draft.rows[0].payload);
      const excluded = await excludedTargets(client as unknown as Queryable, payload);
      if (excluded.length) throw new Error('Invalid home publication targets');
      const current = await client.query<{ publication_id: string | null }>(
        'SELECT publication_id FROM home_content_current WHERE id=1 FOR UPDATE',
      );
      const publication = await client.query<{ id: string }>(
        'INSERT INTO home_content_publications(payload,published_by_account_id) VALUES ($1,$2) RETURNING id',
        [payload, actor.accountId],
      );
      const publicationId = publication.rows[0].id;
      await client.query('UPDATE home_content_current SET publication_id=$1,updated_at=now() WHERE id=1',
        [publicationId]);
      await client.query(
        `INSERT INTO audit_events(actor_account_id,active_role,action,target_type,target_id,details)
         VALUES ($1,$2,'home.published','home_content_publication',$3,$4)`,
        [actor.accountId, actor.role, publicationId,
          { previousPublicationId: current.rows[0]?.publication_id ?? null, publicationId }],
      );
      await client.query('COMMIT');
      return { publicationId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async history() {
    const result = await this.pool.query<{
      id: string; publishedByAccountId: string; publishedAt: Date;
    }>(
      `SELECT id,published_by_account_id AS "publishedByAccountId",published_at AS "publishedAt"
       FROM home_content_publications ORDER BY published_at DESC,id DESC LIMIT 100`,
    );
    return result.rows;
  }

  async restore(actor: AccessContext, publicationId: string) {
    if (!uuid.test(publicationId)) throw new Error('Invalid home publication id');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const publication = await client.query('SELECT id FROM home_content_publications WHERE id=$1', [publicationId]);
      if (!publication.rows[0]) throw new Error('Home publication not found');
      const current = await client.query<{ publication_id: string | null }>(
        'SELECT publication_id FROM home_content_current WHERE id=1 FOR UPDATE',
      );
      await client.query('UPDATE home_content_current SET publication_id=$1,updated_at=now() WHERE id=1',
        [publicationId]);
      await client.query(
        `INSERT INTO audit_events(actor_account_id,active_role,action,target_type,target_id,details)
         VALUES ($1,$2,'home.restored','home_content_publication',$3,$4)`,
        [actor.accountId, actor.role, publicationId,
          { previousPublicationId: current.rows[0]?.publication_id ?? null, publicationId }],
      );
      await client.query('COMMIT');
      return { publicationId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}
