import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { issueActionToken, consumeActionToken } from './action-tokens.js';
import { deliverAuthLink, requireAuthDelivery, type MockAuthSink } from './delivery.js';
import { hashPassword } from './credentials.js';

function normalizedEmail(input: string): string {
  if (typeof input !== 'string') throw new Error('Invalid email');
  const email = input.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) throw new Error('Invalid email');
  return email;
}

export async function startPasswordReset(pool: Pool, emailInput: string, source: string,
  now: Date, mockSink?: MockAuthSink): Promise<{ status: 'accepted' }> {
  const email = normalizedEmail(emailInput);
  requireAuthDelivery('password_reset', mockSink);
  if (!source || Number.isNaN(now.getTime())) throw new Error('Invalid password reset request');
  const identity = await pool.query(`SELECT i.account_id FROM account_identities i
    JOIN accounts a ON a.id=i.account_id
    WHERE i.kind='email' AND i.identifier=$1 AND i.verified_at IS NOT NULL
      AND i.password_hash IS NOT NULL AND a.disabled_at IS NULL`, [email]);
  if (identity.rowCount !== 1) return { status: 'accepted' };
  let rawToken: string;
  try {
    rawToken = await issueActionToken(pool, { purpose: 'password_reset', email,
      accountId: identity.rows[0].account_id, source, now });
  } catch (error) {
    if (error instanceof Error && error.message === 'Action token rate limited') return { status: 'accepted' };
    throw error;
  }
  const origin = process.env.AUTH_LINK_ORIGIN;
  if (!origin) throw new Error('Auth delivery unavailable');
  const url = new URL('/reset-password', origin);
  url.hash = `token=${encodeURIComponent(rawToken)}`;
  try {
    await deliverAuthLink('password_reset', email, url.toString(), mockSink);
  } catch {
    await pool.query(`UPDATE auth_action_tokens SET revoked_at=$2
      WHERE token_hash=$1 AND consumed_at IS NULL AND revoked_at IS NULL`,
    [createHash('sha256').update(rawToken).digest('hex'), now]);
  }
  return { status: 'accepted' };
}

export async function completePasswordReset(pool: Pool, rawToken: string, password: string,
  now: Date, source: string): Promise<{ status: 'ok' }> {
  if (!source) throw new Error('Invalid action token');
  const passwordHash = await hashPassword(password);
  return consumeActionToken(pool, 'password_reset', rawToken, now, async (client, action) => {
    if (!action.accountId) throw new Error('Invalid action token');
    const changed = await client.query(`UPDATE account_identities i SET password_hash=$3
      FROM accounts a WHERE i.account_id=$1 AND i.identifier=$2 AND i.kind='email'
        AND i.verified_at IS NOT NULL AND i.password_hash IS NOT NULL
        AND a.id=i.account_id AND a.disabled_at IS NULL RETURNING i.id`,
    [action.accountId, action.email, passwordHash]);
    if (changed.rowCount !== 1) throw new Error('Invalid action token');
    await client.query(`UPDATE auth_sessions SET revoked_at=$2
      WHERE account_id=$1 AND revoked_at IS NULL`, [action.accountId, now]);
    const grant = await client.query(`SELECT role,seller_id FROM account_roles WHERE account_id=$1
      ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'customer' THEN 1 ELSE 2 END LIMIT 1`,
    [action.accountId]);
    if (grant.rowCount !== 1) throw new Error('Invalid action token');
    await client.query(`INSERT INTO audit_events
      (actor_account_id,active_role,seller_id,action,target_type,target_id)
      VALUES ($1,$2,$3,'auth.password_reset','account',$4)`,
    [action.accountId, grant.rows[0].role, grant.rows[0].seller_id, action.accountId]);
    return { status: 'ok' as const };
  }, source);
}
