import type { Pool } from 'pg';
import type { AccessContext } from '../access.js';
import type { HomePayload } from './types.js';

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
}
