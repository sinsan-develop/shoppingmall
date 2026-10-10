import type { Pool, PoolClient } from 'pg';
import { createHash, createHmac, randomBytes } from 'node:crypto';

export type AuthActionPurpose = 'admin_setup' | 'customer_signup' | 'password_reset';
export type ActionTokenInput = {
  purpose: AuthActionPurpose;
  email: string;
  accountId: string | null;
  source: string;
  now: Date;
};
export type ConsumedAction = { email: string; accountId: string | null };

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    throw new Error('Invalid email');
  }
  return email;
}

function auditHash(value: string): string {
  const key = process.env.AUTH_AUDIT_HMAC_KEY;
  if (!key || key.length < 32) throw new Error('Auth audit key unavailable');
  return createHmac('sha256', key).update(value).digest('hex');
}

function tokenDigest(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export async function issueActionToken(pool: Pool, input: ActionTokenInput): Promise<string> {
  const email = normalizeEmail(input.email);
  if (!['admin_setup', 'customer_signup', 'password_reset'].includes(input.purpose) ||
      (input.purpose === 'customer_signup') !== (input.accountId === null) ||
      !input.source || Number.isNaN(input.now.getTime())) throw new Error('Invalid action token request');
  const subjectHash = auditHash(`email:${email}`);
  const sourceHash = auditHash(`source:${input.source}`);
  const rawToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(input.now.getTime() + 30 * 60 * 1000);
  const client = await pool.connect();
  let limited = false;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      [`source:${input.purpose}`, sourceHash]);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [input.purpose, email]);
    const counts = await client.query(`SELECT
      (SELECT count(*)::int FROM auth_security_events WHERE purpose=$1 AND subject_hash=$2
        AND result_code='issued' AND occurred_at >= $4::timestamptz - interval '1 hour') AS subject_count,
      (SELECT count(*)::int FROM auth_security_events WHERE purpose=$1 AND source_hash=$3
        AND result_code='issued' AND occurred_at >= $4::timestamptz - interval '1 hour') AS source_count`,
    [input.purpose, subjectHash, sourceHash, input.now]);
    if (counts.rows[0].subject_count >= 5 || counts.rows[0].source_count >= 5) {
      await client.query(`INSERT INTO auth_security_events
        (purpose,result_code,subject_hash,source_hash,occurred_at)
        VALUES ($1,'issue_rate_limited',$2,$3,$4)`,
      [input.purpose, subjectHash, sourceHash, input.now]);
      await client.query('COMMIT');
      limited = true;
    } else {
      await client.query(`UPDATE auth_action_tokens SET revoked_at=$3
        WHERE purpose=$1 AND email=$2 AND consumed_at IS NULL AND revoked_at IS NULL`,
      [input.purpose, email, input.now]);
      await client.query(`INSERT INTO auth_action_tokens
        (purpose,email,account_id,token_hash,expires_at,created_at)
        VALUES ($1,$2,$3,$4,$5,$6)`,
      [input.purpose, email, input.accountId, tokenDigest(rawToken), expiresAt, input.now]);
      await client.query(`INSERT INTO auth_security_events
        (purpose,result_code,subject_hash,source_hash,occurred_at) VALUES ($1,'issued',$2,$3,$4)`,
      [input.purpose, subjectHash, sourceHash, input.now]);
      await client.query('COMMIT');
      return rawToken;
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  if (limited) throw new Error('Action token rate limited');
  throw new Error('Action token issuance unavailable');
}

export async function consumeActionToken<T>(pool: Pool, purpose: AuthActionPurpose, rawToken: string,
  now: Date, apply: (client: PoolClient, action: ConsumedAction) => Promise<T>, source?: string): Promise<T> {
  if (!rawToken || rawToken.length > 256 || Number.isNaN(now.getTime()) ||
      !['admin_setup', 'customer_signup', 'password_reset'].includes(purpose)) {
    throw new Error('Invalid action token');
  }
  const digest = tokenDigest(rawToken);
  const sourceHash = source ? auditHash(`source:${source}`) : null;
  const unknownSubjectHash = auditHash(`token:${digest}`);
  const client = await pool.connect();
  let denied = false;
  try {
    await client.query('BEGIN');
    if (sourceHash) {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
        [`confirm:${purpose}`, sourceHash]);
      const recent = await client.query(`SELECT count(*)::int AS n FROM auth_security_events
        WHERE purpose=$1 AND source_hash=$2 AND result_code='confirm_invalid'
          AND occurred_at >= $3::timestamptz - interval '15 minutes'`,
      [purpose, sourceHash, now]);
      if (recent.rows[0].n >= 5) {
        await client.query(`INSERT INTO auth_security_events
          (purpose,result_code,subject_hash,source_hash,occurred_at)
          VALUES ($1,'confirm_rate_limited',$2,$3,$4)`,
        [purpose, unknownSubjectHash, sourceHash, now]);
        await client.query('COMMIT');
        denied = true;
      }
    }
    if (!denied) {
      const selected = await client.query(`SELECT id,email,account_id FROM auth_action_tokens
        WHERE purpose=$1 AND token_hash=$2 AND expires_at>$3
          AND consumed_at IS NULL AND revoked_at IS NULL FOR UPDATE`,
      [purpose, digest, now]);
      if (selected.rowCount !== 1) {
        await client.query(`INSERT INTO auth_security_events
          (purpose,result_code,subject_hash,source_hash,occurred_at)
          VALUES ($1,'confirm_invalid',$2,$3,$4)`,
        [purpose, unknownSubjectHash, sourceHash, now]);
        await client.query('COMMIT');
        denied = true;
      } else {
        const action = { email: selected.rows[0].email as string,
          accountId: selected.rows[0].account_id as string | null };
        await client.query('UPDATE auth_action_tokens SET consumed_at=$2 WHERE id=$1',
          [selected.rows[0].id, now]);
        const result = await apply(client, action);
        await client.query(`INSERT INTO auth_security_events
          (purpose,result_code,subject_hash,source_hash,occurred_at)
          VALUES ($1,'consumed',$2,$3,$4)`,
        [purpose, auditHash(`email:${action.email}`), sourceHash, now]);
        await client.query('COMMIT');
        return result;
      }
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  if (denied) throw new Error('Invalid action token');
  throw new Error('Action token consumption unavailable');
}
