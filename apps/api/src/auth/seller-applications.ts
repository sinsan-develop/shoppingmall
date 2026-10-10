import type { Pool } from 'pg';
import type { AccessContext } from '../access.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireAdmin(actor: AccessContext | undefined): asserts actor is AccessContext {
  if (!actor || actor.role !== 'admin') throw new Error('Admin role required');
}

export async function submitSellerApplication(pool: Pool, actor: AccessContext | undefined,
  displayName: string): Promise<{ id: string; status: 'pending' }> {
  if (!actor || actor.role !== 'customer') throw new Error('Customer role required');
  const name = typeof displayName === 'string' ? displayName.trim() : '';
  if (!name || name.length > 120) throw new Error('Invalid seller display name');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ownSeller = await client.query("SELECT id FROM account_roles WHERE account_id=$1 AND role='seller' LIMIT 1",
      [actor.accountId]);
    if (ownSeller.rowCount) throw new Error('Seller role already granted');
    const inserted = await client.query(`INSERT INTO seller_applications (account_id,display_name)
      VALUES ($1,$2) RETURNING id`, [actor.accountId, name]);
    const id = inserted.rows[0].id as string;
    await client.query(`INSERT INTO audit_events (actor_account_id,active_role,action,target_type,target_id)
      VALUES ($1,'customer','auth.seller_application','seller_application',$2)`, [actor.accountId, id]);
    await client.query('COMMIT');
    return { id, status: 'pending' };
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as { code?: string }).code === '23505') throw new Error('Pending application exists');
    throw error;
  } finally {
    client.release();
  }
}

export async function listSellerApplications(pool: Pool, actor: AccessContext | undefined): Promise<Array<{
  id: string; accountId: string; displayName: string; status: string;
  sellerId: string | null; reviewReason: string | null;
}>> {
  requireAdmin(actor);
  const result = await pool.query(`SELECT id,account_id AS "accountId",display_name AS "displayName",
    status,seller_id AS "sellerId",review_reason AS "reviewReason"
    FROM seller_applications ORDER BY created_at DESC,id DESC`);
  return result.rows;
}

export async function approveSellerApplication(pool: Pool, actor: AccessContext | undefined,
  applicationId: string, sellerId: string): Promise<{ status: 'approved' }> {
  requireAdmin(actor);
  if (!uuidPattern.test(applicationId) || !uuidPattern.test(sellerId)) throw new Error('Invalid seller ID');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const application = await client.query(`SELECT account_id,status FROM seller_applications
      WHERE id=$1 FOR UPDATE`, [applicationId]);
    if (application.rowCount !== 1 || application.rows[0].status !== 'pending') {
      throw new Error('Pending application unavailable');
    }
    const seller = await client.query('SELECT id FROM sellers WHERE id=$1', [sellerId]);
    if (seller.rowCount !== 1) throw new Error('Seller unavailable');
    const priorGrant = await client.query("SELECT id FROM account_roles WHERE account_id=$1 AND role='seller' LIMIT 1",
      [application.rows[0].account_id]);
    if (priorGrant.rowCount) throw new Error('Seller role already granted');
    await client.query("INSERT INTO account_roles (account_id,role,seller_id) VALUES ($1,'seller',$2)",
      [application.rows[0].account_id, sellerId]);
    await client.query(`UPDATE seller_applications SET status='approved',seller_id=$2,
      reviewed_by_account_id=$3,reviewed_at=now() WHERE id=$1`,
    [applicationId, sellerId, actor.accountId]);
    await client.query(`INSERT INTO audit_events (actor_account_id,active_role,action,target_type,target_id)
      VALUES ($1,'admin','auth.seller_approved','seller_application',$2)`, [actor.accountId, applicationId]);
    await client.query('COMMIT');
    return { status: 'approved' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function rejectSellerApplication(pool: Pool, actor: AccessContext | undefined,
  applicationId: string, reason: string): Promise<{ status: 'rejected' }> {
  requireAdmin(actor);
  if (!uuidPattern.test(applicationId)) throw new Error('Invalid application ID');
  const cleanReason = typeof reason === 'string' ? reason.trim() : '';
  if (!cleanReason || cleanReason.length > 500) throw new Error('Invalid rejection reason');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const application = await client.query('SELECT status FROM seller_applications WHERE id=$1 FOR UPDATE', [applicationId]);
    if (application.rowCount !== 1 || application.rows[0].status !== 'pending') {
      throw new Error('Pending application unavailable');
    }
    await client.query(`UPDATE seller_applications SET status='rejected',review_reason=$2,
      reviewed_by_account_id=$3,reviewed_at=now() WHERE id=$1`,
    [applicationId, cleanReason, actor.accountId]);
    await client.query(`INSERT INTO audit_events (actor_account_id,active_role,action,target_type,target_id)
      VALUES ($1,'admin','auth.seller_rejected','seller_application',$2)`, [actor.accountId, applicationId]);
    await client.query('COMMIT');
    return { status: 'rejected' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
