import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { issueActionToken, consumeActionToken } from './action-tokens.js';
import { deliverAuthLink, requireAuthDelivery, type MockAuthSink } from './delivery.js';
import { hashPassword } from './credentials.js';

type InitialAdminInput = {
  email: string;
  ownerConfirmed: boolean;
  operatorId: string;
  source: string;
  now: Date;
  mockSink?: MockAuthSink;
};

function normalizedEmail(value: string): string {
  if (typeof value !== 'string') throw new Error('Invalid email');
  const email = value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    throw new Error('Invalid email');
  }
  return email;
}

function setupLink(rawToken: string): string {
  const origin = process.env.AUTH_LINK_ORIGIN;
  if (!origin) throw new Error('Auth delivery unavailable');
  const url = new URL('/admin-setup', origin);
  url.hash = `token=${encodeURIComponent(rawToken)}`;
  return url.toString();
}

export async function provisionInitialAdmin(pool: Pool, input: InitialAdminInput): Promise<{ status: 'pending' }> {
  if (!input.ownerConfirmed) throw new Error('Owner confirmation required');
  if (!input.operatorId?.trim() || !input.source?.trim() || Number.isNaN(input.now?.getTime())) {
    throw new Error('Invalid operator confirmation');
  }
  const email = normalizedEmail(input.email);
  const client = await pool.connect();
  let accountId: string;
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('initial-admin'), hashtext('provision'))");
    const existing = await client.query(`SELECT a.id, i.identifier, i.password_hash, i.verified_at, a.disabled_at
      FROM account_roles r JOIN accounts a ON a.id=r.account_id
      JOIN account_identities i ON i.account_id=a.id AND i.kind='email'
      WHERE r.role='admin' AND r.seller_id IS NULL FOR UPDATE OF a, i`);
    if ((existing.rowCount ?? 0) > 1 || (existing.rowCount === 1 &&
        (existing.rows[0].identifier !== email || existing.rows[0].password_hash ||
         existing.rows[0].verified_at || existing.rows[0].disabled_at))) {
      throw new Error('Initial admin exists');
    }
    if (existing.rowCount === 1) {
      accountId = existing.rows[0].id;
    } else {
      const duplicate = await client.query("SELECT id FROM account_identities WHERE kind='email' AND identifier=$1", [email]);
      if (duplicate.rowCount) throw new Error('Admin email unavailable');
      const account = await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id');
      accountId = account.rows[0].id;
      await client.query(`INSERT INTO account_identities (account_id,kind,identifier)
        VALUES ($1,'email',$2)`, [accountId, email]);
      await client.query("INSERT INTO account_roles (account_id,role) VALUES ($1,'admin')", [accountId]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const rawToken = await issueActionToken(pool, {
    purpose: 'admin_setup', email, accountId, source: input.source, now: input.now,
  });
  try {
    await deliverAuthLink('admin_setup', email, setupLink(rawToken), input.mockSink);
  } catch (error) {
    await pool.query(`UPDATE auth_action_tokens SET revoked_at=$2
      WHERE token_hash=$1 AND consumed_at IS NULL AND revoked_at IS NULL`,
    [createHash('sha256').update(rawToken).digest('hex'), input.now]);
    throw error;
  }
  return { status: 'pending' };
}

export async function completeAdminSetup(pool: Pool, rawToken: string, password: string,
  now: Date, source: string): Promise<{ status: 'ok' }> {
  if (!source) throw new Error('Invalid action token');
  const passwordHash = await hashPassword(password);
  return consumeActionToken(pool, 'admin_setup', rawToken, now, async (client, action) => {
    if (!action.accountId) throw new Error('Invalid action token');
    const updated = await client.query(`UPDATE account_identities i SET
      password_hash=$3, verified_at=$4
      FROM accounts a
      WHERE i.account_id=$1 AND i.kind='email' AND i.identifier=$2
        AND i.password_hash IS NULL AND i.verified_at IS NULL
        AND a.id=i.account_id AND a.disabled_at IS NULL
        AND EXISTS (SELECT 1 FROM account_roles r WHERE r.account_id=i.account_id
          AND r.role='admin' AND r.seller_id IS NULL)
      RETURNING i.id`, [action.accountId, action.email, passwordHash, now]);
    if (updated.rowCount !== 1) throw new Error('Invalid action token');
    await client.query(`INSERT INTO audit_events (actor_account_id,active_role,action,target_type,target_id)
      VALUES ($1,'admin','auth.admin_setup','account',$2)`, [action.accountId, action.accountId]);
    return { status: 'ok' as const };
  }, source);
}

export async function startCustomerSignup(pool: Pool, emailInput: string, source: string,
  now: Date, mockSink?: MockAuthSink): Promise<{ status: 'accepted' }> {
  const email = normalizedEmail(emailInput);
  requireAuthDelivery('customer_signup', mockSink);
  if (!source || Number.isNaN(now.getTime())) throw new Error('Invalid signup request');
  const existing = await pool.query("SELECT id FROM account_identities WHERE kind='email' AND identifier=$1", [email]);
  if (existing.rowCount) return { status: 'accepted' };
  let rawToken: string;
  try {
    rawToken = await issueActionToken(pool, { purpose: 'customer_signup', email,
      accountId: null, source, now });
  } catch (error) {
    if (error instanceof Error && error.message === 'Action token rate limited') return { status: 'accepted' };
    throw error;
  }
  const origin = process.env.AUTH_LINK_ORIGIN;
  if (!origin) throw new Error('Auth delivery unavailable');
  const url = new URL('/signup', origin);
  url.hash = `token=${encodeURIComponent(rawToken)}`;
  try {
    await deliverAuthLink('customer_signup', email, url.toString(), mockSink);
  } catch {
    await pool.query(`UPDATE auth_action_tokens SET revoked_at=$2
      WHERE token_hash=$1 AND consumed_at IS NULL AND revoked_at IS NULL`,
    [createHash('sha256').update(rawToken).digest('hex'), now]);
  }
  return { status: 'accepted' };
}

export async function completeCustomerSignup(pool: Pool, rawToken: string, password: string,
  now: Date, source: string): Promise<{ status: 'ok' }> {
  if (!source) throw new Error('Invalid action token');
  const passwordHash = await hashPassword(password);
  return consumeActionToken(pool, 'customer_signup', rawToken, now, async (client, action) => {
    if (action.accountId) throw new Error('Invalid action token');
    const existing = await client.query("SELECT id FROM account_identities WHERE kind='email' AND identifier=$1", [action.email]);
    if (existing.rowCount) throw new Error('Invalid action token');
    const account = await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id');
    const accountId = account.rows[0].id as string;
    await client.query(`INSERT INTO account_identities
      (account_id,kind,identifier,password_hash,verified_at)
      VALUES ($1,'email',$2,$3,$4)`, [accountId, action.email, passwordHash, now]);
    await client.query("INSERT INTO account_roles (account_id,role) VALUES ($1,'customer')", [accountId]);
    await client.query(`INSERT INTO audit_events (actor_account_id,active_role,action,target_type,target_id)
      VALUES ($1,'customer','auth.email_signup','account',$2)`, [accountId, accountId]);
    return { status: 'ok' as const };
  }, source);
}
