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

  async createPhoneCustomerAfterVerification(phone: string) {
    if (typeof phone !== 'string' || !/^01[016789]\d{7,8}$/.test(phone)) throw new Error('Invalid phone');
    const accountId = await this.db.transaction(async (tx) => {
      const [existing] = await tx.select({ id: schema.accountIdentities.id })
        .from(schema.accountIdentities)
        .where(and(eq(schema.accountIdentities.kind, 'phone'), eq(schema.accountIdentities.identifier, phone)))
        .limit(1);
      if (existing) throw new Error('Phone already registered');
      const [account] = await tx.insert(schema.accounts).values({}).returning({ id: schema.accounts.id });
      await tx.insert(schema.accountIdentities).values({
        accountId: account.id, kind: 'phone', identifier: phone, verifiedAt: new Date(),
      });
      await tx.insert(schema.accountRoles).values({ accountId: account.id, role: 'customer' });
      await tx.insert(schema.auditEvents).values({
        actorAccountId: account.id, activeRole: 'customer', action: 'auth.phone_signup',
        targetType: 'account', targetId: account.id,
      });
      return account.id;
    });
    return { accountId, ...(await this.issueSession(accountId, 'customer')) };
  }

  async loginPhoneAfterVerification(phone: string) {
    if (typeof phone !== 'string' || !/^01[016789]\d{7,8}$/.test(phone)) throw new Error('Invalid phone');
    const [identity] = await this.db.select({
      accountId: schema.accountIdentities.accountId,
      disabledAt: schema.accounts.disabledAt,
    }).from(schema.accountIdentities)
      .innerJoin(schema.accounts, eq(schema.accounts.id, schema.accountIdentities.accountId))
      .where(and(eq(schema.accountIdentities.kind, 'phone'), eq(schema.accountIdentities.identifier, phone)))
      .limit(1);
    if (!identity || identity.disabledAt || !(await this.isGranted(identity.accountId, 'customer'))) {
      throw new Error('Phone account unavailable');
    }
    return this.issueSession(identity.accountId, 'customer');
  }

  async linkPhoneIdentity(actor: AccessContext, proof: { phone: string; accountId: string }): Promise<void> {
    if (actor.role !== 'customer' || actor.accountId !== proof?.accountId ||
        typeof proof.phone !== 'string' || !/^01[016789]\d{7,8}$/.test(proof.phone)) {
      throw new Error('Invalid phone proof');
    }
    await this.db.transaction(async (tx) => {
      const [existing] = await tx.select({ id: schema.accountIdentities.id })
        .from(schema.accountIdentities)
        .where(and(eq(schema.accountIdentities.kind, 'phone'), eq(schema.accountIdentities.identifier, proof.phone)))
        .limit(1);
      if (existing) throw new Error('Phone already linked');
      await tx.insert(schema.accountIdentities).values({
        accountId: actor.accountId, kind: 'phone', identifier: proof.phone, verifiedAt: new Date(),
      });
      await tx.insert(schema.auditEvents).values({
        actorAccountId: actor.accountId, activeRole: 'customer',
        action: 'auth.link_phone', targetType: 'account', targetId: actor.accountId,
      });
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
    const scope = role === 'seller' && !sellerId ? await this.onlySellerGrant(identity.accountId) : sellerId;
    if (!(await this.isGranted(identity.accountId, role, scope))) throw new Error('Invalid credentials');
    return this.issueSession(identity.accountId, role, scope);
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
    const scope = current && role === 'seller' && !sellerId
      ? await this.onlySellerGrant(current.accountId) : sellerId;
    if (!current || !(await this.isGranted(current.accountId, role, scope))) {
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
        accountId: current.accountId, role, sellerId: scope ?? null,
        tokenHash: hashSessionToken(fresh), expiresAt,
      });
      await tx.insert(schema.auditEvents).values({
        actorAccountId: current.accountId, activeRole: role, sellerId: scope ?? null,
        action: 'auth.switch_role', targetType: 'account', targetId: current.accountId,
      });
      return { token: fresh, expiresAt };
    });
  }

  async logout(token: string): Promise<void> {
    const actor = await this.getSession(token);
    if (!actor) return;
    await this.db.transaction(async (tx) => {
      const revoked = await tx.update(schema.authSessions).set({ revokedAt: new Date() })
        .where(and(eq(schema.authSessions.tokenHash, hashSessionToken(token)), isNull(schema.authSessions.revokedAt)))
        .returning({ id: schema.authSessions.id });
      if (revoked.length !== 1) return;
      await tx.insert(schema.auditEvents).values({
        actorAccountId: actor.accountId, activeRole: actor.role, sellerId: actor.sellerId ?? null,
        action: 'auth.logout', targetType: 'account', targetId: actor.accountId,
      });
    });
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

  private async onlySellerGrant(accountId: string): Promise<string | undefined> {
    const grants = await this.db.select({ sellerId: schema.accountRoles.sellerId })
      .from(schema.accountRoles)
      .where(and(eq(schema.accountRoles.accountId, accountId), eq(schema.accountRoles.role, 'seller')))
      .limit(2);
    return grants.length === 1 ? grants[0].sellerId ?? undefined : undefined;
  }

  private async issueSession(accountId: string, role: ActiveRole, sellerId?: string) {
    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + sessionHours * 60 * 60 * 1000);
    await this.db.transaction(async (tx) => {
      await tx.insert(schema.authSessions).values({
        tokenHash: hashSessionToken(token), accountId, role, sellerId: sellerId ?? null, expiresAt,
      });
      await tx.insert(schema.auditEvents).values({
        actorAccountId: accountId, activeRole: role, sellerId: sellerId ?? null,
        action: 'auth.login', targetType: 'account', targetId: accountId,
      });
    });
    return { token, expiresAt };
  }
}
