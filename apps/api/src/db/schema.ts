import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import type { PostalRange, ShippingPolicy } from '../shipping/policy.js';

export const identityKind = pgEnum('identity_kind', ['email', 'phone', 'kakao', 'apple']);
export const activeRole = pgEnum('active_role', ['customer', 'seller', 'admin']);
export const deletionStatus = pgEnum('deletion_status', ['requested', 'in_review', 'completed']);
export const productProposalStatus = pgEnum('product_proposal_status', ['draft', 'pending', 'approved', 'rejected']);
export const productShippingMode = pgEnum('product_shipping_mode', ['seller_direct', 'owool_fulfillment']);
export const productImagePurpose = pgEnum('product_image_purpose', ['thumbnail', 'detail']);

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
});

export const sellerCategories = pgTable('seller_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [check('seller_categories_name_ck', sql`length(trim(${table.name})) > 0`)]);

export const productCategories = pgTable('product_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  parentId: uuid('parent_id').references((): AnyPgColumn => productCategories.id),
  name: text('name').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('product_categories_root_name_uq').on(table.name).where(sql`${table.parentId} IS NULL`),
  uniqueIndex('product_categories_child_name_uq').on(table.parentId, table.name).where(sql`${table.parentId} IS NOT NULL`),
  index('product_categories_parent_idx').on(table.parentId),
  check('product_categories_name_ck', sql`length(trim(${table.name})) > 0`),
]);

export const sellers = pgTable('sellers', {
  id: uuid('id').primaryKey().defaultRandom(),
  categoryId: uuid('category_id').notNull().references(() => sellerCategories.id),
  displayName: text('display_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const shippingPolicyGlobal = pgTable('shipping_policy_global', {
  id: integer('id').primaryKey().default(1),
  feeWon: integer('fee_won').notNull().default(3000),
  freeThresholdWon: integer('free_threshold_won').notNull().default(50000),
  cutoffTime: text('cutoff_time'),
  blockedPostalRanges: jsonb('blocked_postal_ranges').$type<PostalRange[]>().notNull().default([]),
  lockedFee: boolean('locked_fee').notNull().default(false),
  lockedThreshold: boolean('locked_threshold').notNull().default(false),
  lockedCutoff: boolean('locked_cutoff').notNull().default(false),
  updatedByAccountId: uuid('updated_by_account_id').references(() => accounts.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('shipping_global_one_row_ck', sql`${table.id} = 1`),
  check('shipping_global_money_ck', sql`${table.feeWon} BETWEEN 0 AND 1000000000 AND ${table.freeThresholdWon} BETWEEN 0 AND 1000000000`),
  check('shipping_global_cutoff_ck', sql`${table.cutoffTime} IS NULL OR ${table.cutoffTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
  check('shipping_global_ranges_ck', sql`jsonb_typeof(${table.blockedPostalRanges}) = 'array'`),
]);

export const sellerShippingPolicyRequests = pgTable('seller_shipping_policy_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  sellerId: uuid('seller_id').notNull().references(() => sellers.id),
  policy: jsonb('policy').$type<ShippingPolicy>().notNull(),
  status: text('status').notNull().default('pending'),
  requestedByAccountId: uuid('requested_by_account_id').notNull().references(() => accounts.id),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  decidedByAccountId: uuid('decided_by_account_id').references(() => accounts.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionReason: text('decision_reason'),
}, (table) => [
  index('shipping_requests_seller_idx').on(table.sellerId),
  uniqueIndex('shipping_requests_one_pending_uq').on(table.sellerId).where(sql`${table.status} = 'pending'`),
  check('shipping_requests_status_ck', sql`${table.status} IN ('pending','approved','rejected')`),
  check('shipping_requests_policy_ck', sql`jsonb_typeof(${table.policy}) = 'object'`),
]);

export const sellerShippingPolicies = pgTable('seller_shipping_policies', {
  sellerId: uuid('seller_id').primaryKey().references(() => sellers.id),
  policy: jsonb('policy').$type<ShippingPolicy>().notNull(),
  approvedRequestId: uuid('approved_request_id').notNull().references(() => sellerShippingPolicyRequests.id),
  approvedByAccountId: uuid('approved_by_account_id').notNull().references(() => accounts.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [check('seller_shipping_policy_ck', sql`jsonb_typeof(${table.policy}) = 'object'`)]);

// Seller proposals are immutable revisions. Customer reads use product_publications only.
export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  sellerId: uuid('seller_id').notNull().references(() => sellers.id),
  categoryId: uuid('category_id').notNull().references(() => productCategories.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('products_seller_idx').on(table.sellerId), index('products_category_idx').on(table.categoryId)]);

export const productRevisions = pgTable('product_revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id),
  version: integer('version').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  originLabel: text('origin_label').notNull(),
  shippingMode: productShippingMode('shipping_mode').notNull(),
  status: productProposalStatus('status').notNull().default('draft'),
  proposedByAccountId: uuid('proposed_by_account_id').notNull().references(() => accounts.id),
  proposedAt: timestamp('proposed_at', { withTimezone: true }).notNull().defaultNow(),
  reviewedByAccountId: uuid('reviewed_by_account_id').references(() => accounts.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewReason: text('review_reason'),
}, (table) => [
  uniqueIndex('product_revisions_product_version_uq').on(table.productId, table.version),
  uniqueIndex('product_revisions_product_id_uq').on(table.productId, table.id),
  index('product_revisions_status_idx').on(table.status),
  check('product_revisions_version_ck', sql`${table.version} > 0`),
  check('product_revisions_title_ck', sql`length(trim(${table.title})) > 0`),
  check('product_revisions_origin_ck', sql`length(trim(${table.originLabel})) > 0`),
]);

export const productOptions = pgTable('product_options', {
  id: uuid('id').primaryKey().defaultRandom(),
  revisionId: uuid('revision_id').notNull().references(() => productRevisions.id),
  name: text('name').notNull(),
  priceWon: integer('price_won').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
}, (table) => [
  uniqueIndex('product_options_revision_name_uq').on(table.revisionId, table.name),
  check('product_options_name_ck', sql`length(trim(${table.name})) > 0`),
  check('product_options_price_ck', sql`${table.priceWon} >= 0`),
]);

export const inventoryLevels = pgTable('inventory_levels', {
  optionId: uuid('option_id').primaryKey().references(() => productOptions.id),
  onHandQuantity: integer('on_hand_quantity').notNull().default(0),
  sellableQuantity: integer('sellable_quantity').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('inventory_on_hand_ck', sql`${table.onHandQuantity} >= 0`),
  check('inventory_sellable_ck', sql`${table.sellableQuantity} >= 0 AND ${table.sellableQuantity} <= ${table.onHandQuantity}`),
]);

export const stockChangeRequests = pgTable('stock_change_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  optionId: uuid('option_id').notNull().references(() => productOptions.id),
  targetOnHand: integer('target_on_hand').notNull(),
  status: text('status').notNull().default('pending'),
  requestedByAccountId: uuid('requested_by_account_id').notNull().references(() => accounts.id),
  decidedByAccountId: uuid('decided_by_account_id').references(() => accounts.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
}, (table) => [
  index('stock_requests_option_idx').on(table.optionId),
  uniqueIndex('stock_requests_one_pending_uq').on(table.optionId).where(sql`${table.status} = 'pending'`),
  check('stock_requests_target_ck', sql`${table.targetOnHand} > 0`),
  check('stock_requests_status_ck', sql`${table.status} IN ('pending','approved','superseded','rejected')`),
]);

// The key points to a controlled store; untrusted remote URLs are never public image sources.
export const productImages = pgTable('product_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  revisionId: uuid('revision_id').notNull().references(() => productRevisions.id),
  objectKey: text('object_key').notNull(),
  purpose: productImagePurpose('purpose').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
}, (table) => [
  uniqueIndex('product_images_revision_key_uq').on(table.revisionId, table.objectKey),
  check('product_images_size_ck', sql`${table.sizeBytes} > 0`),
]);

// No proposal becomes customer-visible without an explicit operator publication.
export const productPublications = pgTable('product_publications', {
  productId: uuid('product_id').primaryKey().references(() => products.id),
  revisionId: uuid('revision_id').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  publishedByAccountId: uuid('published_by_account_id').notNull().references(() => accounts.id),
}, (table) => [
  uniqueIndex('product_publications_revision_uq').on(table.revisionId),
  foreignKey({ columns: [table.productId, table.revisionId],
    foreignColumns: [productRevisions.productId, productRevisions.id] }),
]);

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

export const customerAddresses = pgTable('customer_addresses', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  label: text('label').notNull(),
  recipientName: text('recipient_name').notNull(),
  phone: text('phone').notNull(),
  postalCode: text('postal_code').notNull(),
  line1: text('line1').notNull(),
  line2: text('line2').notNull().default(''),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  index('customer_addresses_account_idx').on(table.accountId),
  uniqueIndex('customer_addresses_one_default_uq').on(table.accountId)
    .where(sql`${table.isDefault} = true AND ${table.deletedAt} IS NULL`),
]);

export const notificationPreferences = pgTable('notification_preferences', {
  accountId: uuid('account_id').primaryKey().references(() => accounts.id),
  marketingEmail: boolean('marketing_email').notNull().default(false),
  marketingSms: boolean('marketing_sms').notNull().default(false),
  push: boolean('push').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accountDeletionRequests = pgTable('account_deletion_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  status: deletionStatus('status').notNull().default('requested'),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('account_deletion_requests_open_uq').on(table.accountId)
    .where(sql`${table.status} = 'requested'`),
]);
