import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const identityKind = pgEnum('identity_kind', ['email', 'phone', 'kakao', 'apple']);
export const activeRole = pgEnum('active_role', ['customer', 'seller', 'admin']);

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
});

export const sellers = pgTable('sellers', {
  id: uuid('id').primaryKey().defaultRandom(),
  displayName: text('display_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accountIdentities = pgTable('account_identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  kind: identityKind('kind').notNull(),
  identifier: text('identifier').notNull(),
  passwordHash: text('password_hash'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('account_identities_kind_identifier_uq').on(table.kind, table.identifier),
  index('account_identities_account_idx').on(table.accountId),
  check('account_identities_identifier_ck', sql`length(trim(${table.identifier})) > 0`),
]);

export const accountRoles = pgTable('account_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  role: activeRole('role').notNull(),
  sellerId: uuid('seller_id').references(() => sellers.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('account_roles_singleton_uq').on(table.accountId, table.role).where(sql`${table.sellerId} IS NULL`),
  uniqueIndex('account_roles_seller_uq').on(table.accountId, table.role, table.sellerId).where(sql`${table.sellerId} IS NOT NULL`),
  index('account_roles_seller_idx').on(table.sellerId),
  check('account_roles_scope_ck', sql`(${table.role} = 'seller') = (${table.sellerId} IS NOT NULL)`),
]);

export const authSessions = pgTable('auth_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: text('token_hash').notNull().unique(),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  role: activeRole('role').notNull(),
  sellerId: uuid('seller_id').references(() => sellers.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('auth_sessions_account_idx').on(table.accountId),
  check('auth_sessions_scope_ck', sql`(${table.role} = 'seller') = (${table.sellerId} IS NOT NULL)`),
]);

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorAccountId: uuid('actor_account_id').notNull().references(() => accounts.id),
  activeRole: activeRole('active_role').notNull(),
  sellerId: uuid('seller_id').references(() => sellers.id),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  details: jsonb('details').notNull().default({}),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('audit_events_occurred_idx').on(table.occurredAt)]);
