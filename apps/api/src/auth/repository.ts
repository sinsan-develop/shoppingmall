import { and, eq, gt, isNull } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import type { AccessContext, ActiveRole } from '../access.js';
import * as schema from '../db/schema.js';
import { createSessionToken, hashPassword, hashSessionToken, verifyPassword } from './credentials.js';

const sessionHours = 24;

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    throw new Error('Invalid email');
  }
  return email;
}

export class AuthRepository {
  private readonly db: NodePgDatabase<typeof schema>;

  constructor(pool: Pool) {
    this.db = drizzle(pool, { schema });
  }

  async createCustomerAccount(emailInput: string, password: string): Promise<string> {
    const email = normalizeEmail(emailInput);
    const digest = await hashPassword(password);
    return this.db.transaction(async (tx) => {
      const [account] = await tx.insert(schema.accounts).values({}).returning({ id: schema.accounts.id });
      await tx.insert(schema.accountIdentities).values({
        accountId: account.id, kind: 'email', identifier: email, passwordHash: digest,
      });
      await tx.insert(schema.accountRoles).values({ accountId: account.id, role: 'customer' });
      return account.id;
    });
  }

  async loginEmail(emailInput: string, password: string, role: ActiveRole = 'customer', sellerId?: string): Promise<{ token: string; expiresAt: Date }> {
    const email = normalizeEmail(emailInput);
    const [identity] = await this.db.select({
      accountId: schema.accountIdentities.accountId,
      passwordHash: schema.accountIdentities.passwordHash,
      disabledAt: schema.accounts.disabledAt,
    }).from(schema.accountIdentities)
      .innerJoin(schema.accounts, eq(schema.accounts.id, schema.accountIdentities.accountId))
      .where(and(eq(schema.accountIdentities.kind, 'email'), eq(schema.accountIdentities.identifier, email)))
      .limit(1);
    if (!identity || identity.disabledAt || !identity.passwordHash ||
        !(await verifyPassword(password, identity.passwordHash))) {
      throw new Error('Invalid credentials');
    }
    if (!(await this.isGranted(identity.accountId, role, sellerId))) throw new Error('Invalid credentials');
    return this.issueSession(identity.accountId, role, sellerId);
  }

  async getSession(token: string): Promise<AccessContext | undefined> {
    if (!token || token.length > 256) return undefined;
    const [session] = await this.db.select({
      accountId: schema.authSessions.accountId,
      role: schema.authSessions.role,
      sellerId: schema.authSessions.sellerId,
      disabledAt: schema.accounts.disabledAt,
    }).from(schema.authSessions)
      .innerJoin(schema.accounts, eq(schema.accounts.id, schema.authSessions.accountId))
      .where(and(
        eq(schema.authSessions.tokenHash, hashSessionToken(token)),
        isNull(schema.authSessions.revokedAt),
        gt(schema.authSessions.expiresAt, new Date()),
      )).limit(1);
    if (!session || session.disabledAt ||
        !(await this.isGranted(session.accountId, session.role, session.sellerId ?? undefined))) {
      return undefined;
    }
    return {
      accountId: session.accountId,
      role: session.role,
      ...(session.sellerId ? { sellerId: session.sellerId } : {}),
    };
  }

  async switchRole(token: string, role: ActiveRole, sellerId?: string) {
    const current = await this.getSession(token);
    if (!current || !(await this.isGranted(current.accountId, role, sellerId))) {
      throw new Error('Role unavailable');
    }
    return this.db.transaction(async (tx) => {
      const revoked = await tx.update(schema.authSessions).set({ revokedAt: new Date() })
        .where(and(eq(schema.authSessions.tokenHash, hashSessionToken(token)), isNull(schema.authSessions.revokedAt)))
        .returning({ id: schema.authSessions.id });
      if (revoked.length !== 1) throw new Error('Session no longer active');
      const fresh = createSessionToken();
      const expiresAt = new Date(Date.now() + sessionHours * 60 * 60 * 1000);
      await tx.insert(schema.authSessions).values({
        accountId: current.accountId, role, sellerId: sellerId ?? null,
        tokenHash: hashSessionToken(fresh), expiresAt,
      });
      return { token: fresh, expiresAt };
    });
  }

  async logout(token: string): Promise<void> {
    await this.db.update(schema.authSessions).set({ revokedAt: new Date() })
      .where(eq(schema.authSessions.tokenHash, hashSessionToken(token)));
  }

  private async isGranted(accountId: string, role: ActiveRole, sellerId?: string): Promise<boolean> {
    if (role === 'seller' && !sellerId) return false;
    if (role !== 'seller' && sellerId) return false;
    const [grant] = await this.db.select({ id: schema.accountRoles.id }).from(schema.accountRoles)
      .where(and(
        eq(schema.accountRoles.accountId, accountId),
        eq(schema.accountRoles.role, role),
        sellerId ? eq(schema.accountRoles.sellerId, sellerId) : isNull(schema.accountRoles.sellerId),
      )).limit(1);
    return !!grant;
  }

  private async issueSession(accountId: string, role: ActiveRole, sellerId?: string) {
    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + sessionHours * 60 * 60 * 1000);
    await this.db.insert(schema.authSessions).values({
      tokenHash: hashSessionToken(token), accountId, role, sellerId: sellerId ?? null, expiresAt,
    });
    return { token, expiresAt };
  }
}
