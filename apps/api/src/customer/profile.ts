import { and, eq, isNull } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import type { AccessContext } from '../access.js';
import * as schema from '../db/schema.js';

export type AddressInput = {
  label: string;
  recipientName: string;
  phone: string;
  postalCode: string;
  line1: string;
  line2: string;
  isDefault: boolean;
};

export type PreferenceInput = { marketingEmail: boolean; marketingSms: boolean; push: boolean };

function requireOwner(actor: AccessContext, accountId: string) {
  if (actor.role !== 'customer' || actor.accountId !== accountId) throw new Error('Forbidden');
}

function requiredText(value: string, limit: number): string {
  if (typeof value !== 'string') throw new Error('Invalid address');
  const clean = value.trim();
  if (!clean || clean.length > limit) throw new Error('Invalid address');
  return clean;
}

export function maskContact(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 4 ? `***-***-${digits.slice(-4)}` : '***';
}

export class CustomerProfile {
  private readonly db: NodePgDatabase<typeof schema>;

  constructor(pool: Pool) {
    this.db = drizzle(pool, { schema });
  }

  async addAddress(actor: AccessContext, accountId: string, input: AddressInput): Promise<string> {
    requireOwner(actor, accountId);
    const label = requiredText(input.label, 40);
    const recipientName = requiredText(input.recipientName, 80);
    const phone = requiredText(input.phone, 20);
    const postalCode = requiredText(input.postalCode, 5);
    const line1 = requiredText(input.line1, 200);
    if (!/^\d{5}$/.test(postalCode) || !/^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(phone) ||
        typeof input.line2 !== 'string' || input.line2.length > 200 ||
        typeof input.isDefault !== 'boolean') throw new Error('Invalid address');
    return this.db.transaction(async (tx) => {
      if (input.isDefault) {
        await tx.update(schema.customerAddresses).set({ isDefault: false })
          .where(and(eq(schema.customerAddresses.accountId, accountId), isNull(schema.customerAddresses.deletedAt)));
      }
      const [address] = await tx.insert(schema.customerAddresses).values({
        accountId, label, recipientName, phone, postalCode, line1,
        line2: input.line2.trim(), isDefault: input.isDefault,
      }).returning({ id: schema.customerAddresses.id });
      await tx.insert(schema.auditEvents).values({
        actorAccountId: accountId, activeRole: 'customer', action: 'customer.address_add',
        targetType: 'customer_address', targetId: address.id,
      });
      return address.id;
    });
  }

  async listAddresses(actor: AccessContext, accountId: string) {
    requireOwner(actor, accountId);
    return this.db.select().from(schema.customerAddresses)
      .where(and(eq(schema.customerAddresses.accountId, accountId), isNull(schema.customerAddresses.deletedAt)));
  }

  async setPreferences(actor: AccessContext, accountId: string, input: PreferenceInput): Promise<void> {
    requireOwner(actor, accountId);
    if (typeof input.marketingEmail !== 'boolean' || typeof input.marketingSms !== 'boolean' ||
        typeof input.push !== 'boolean') throw new Error('Invalid preferences');
    await this.db.transaction(async (tx) => {
      await tx.insert(schema.notificationPreferences).values({ accountId, ...input })
        .onConflictDoUpdate({ target: schema.notificationPreferences.accountId,
          set: { ...input, updatedAt: new Date() } });
      await tx.insert(schema.auditEvents).values({
        actorAccountId: accountId, activeRole: 'customer', action: 'customer.preferences_update',
        targetType: 'account', targetId: accountId,
        details: input,
      });
    });
  }

  async getPreferences(actor: AccessContext, accountId: string): Promise<PreferenceInput> {
    requireOwner(actor, accountId);
    const [item] = await this.db.select({
      marketingEmail: schema.notificationPreferences.marketingEmail,
      marketingSms: schema.notificationPreferences.marketingSms,
      push: schema.notificationPreferences.push,
    }).from(schema.notificationPreferences)
      .where(eq(schema.notificationPreferences.accountId, accountId)).limit(1);
    return item ?? { marketingEmail: false, marketingSms: false, push: false };
  }

  async requestDeletion(actor: AccessContext, accountId: string) {
    requireOwner(actor, accountId);
    return this.db.transaction(async (tx) => {
      const [request] = await tx.insert(schema.accountDeletionRequests).values({ accountId })
        .returning({ id: schema.accountDeletionRequests.id, status: schema.accountDeletionRequests.status });
      await tx.insert(schema.auditEvents).values({
        actorAccountId: accountId, activeRole: 'customer', action: 'customer.deletion_request',
        targetType: 'deletion_request', targetId: request.id,
      });
      return request;
    });
  }
}
