import { sql } from 'drizzle-orm';
import { boolean, check, date, foreignKey, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
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

// Append-only decisions are retained; an approved stop hides new sale without deleting a publication or stock.
export const productSaleStopRequests = pgTable('product_sale_stop_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id),
  status: text('status').notNull().default('pending'),
  reason: text('reason').notNull(),
  requestedByAccountId: uuid('requested_by_account_id').notNull().references(() => accounts.id),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  decidedByAccountId: uuid('decided_by_account_id').references(() => accounts.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionReason: text('decision_reason'),
}, (table) => [
  index('product_sale_stops_product_idx').on(table.productId),
  uniqueIndex('product_sale_stops_one_pending_uq').on(table.productId).where(sql`${table.status} = 'pending'`),
  uniqueIndex('product_sale_stops_one_approved_uq').on(table.productId).where(sql`${table.status} = 'approved'`),
  check('product_sale_stops_status_ck', sql`${table.status} IN ('pending','approved','rejected')`),
  check('product_sale_stops_reason_ck', sql`length(trim(${table.reason})) BETWEEN 1 AND 500`),
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

type HomeContentPayload = { menu: unknown[]; events: unknown[]; recommendations: unknown[] };
const emptyHomeContent: HomeContentPayload = { menu: [], events: [], recommendations: [] };

export const homeContentDraft = pgTable('home_content_draft', {
  id: integer('id').primaryKey().default(1),
  version: integer('version').notNull().default(1),
  payload: jsonb('payload').$type<HomeContentPayload>().notNull().default(emptyHomeContent),
  updatedByAccountId: uuid('updated_by_account_id').references(() => accounts.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('home_draft_one_row_ck', sql`${table.id} = 1`),
  check('home_draft_version_ck', sql`${table.version} > 0`),
  check('home_draft_payload_ck', sql`jsonb_typeof(${table.payload}) = 'object'`),
]);

export const homeContentPublications = pgTable('home_content_publications', {
  id: uuid('id').primaryKey().defaultRandom(),
  payload: jsonb('payload').$type<HomeContentPayload>().notNull(),
  publishedByAccountId: uuid('published_by_account_id').notNull().references(() => accounts.id),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [check('home_publication_payload_ck', sql`jsonb_typeof(${table.payload}) = 'object'`)]);

export const homeContentCurrent = pgTable('home_content_current', {
  id: integer('id').primaryKey().default(1),
  publicationId: uuid('publication_id').references(() => homeContentPublications.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [check('home_current_one_row_ck', sql`${table.id} = 1`)]);

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

export const customerFavorites = pgTable('customer_favorites', {
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.accountId, table.productId] }),
  index('customer_favorites_product_idx').on(table.productId)]);

export const customerCartItems = pgTable('customer_cart_items', {
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  optionId: uuid('option_id').notNull().references(() => productOptions.id),
  quantity: integer('quantity').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.accountId, table.optionId] }),
  index('customer_cart_items_option_idx').on(table.optionId),
  check('customer_cart_items_quantity_ck', sql`${table.quantity} BETWEEN 1 AND 1000000`),
]);

export const checkoutReservations = pgTable('checkout_reservations', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  idempotencyKey: uuid('idempotency_key').notNull(),
  status: text('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  endReason: text('end_reason'),
}, (table) => [
  uniqueIndex('checkout_reservations_account_key_uq').on(table.accountId, table.idempotencyKey),
  uniqueIndex('checkout_reservations_account_active_uq').on(table.accountId)
    .where(sql`${table.status} = 'ACTIVE'`),
  index('checkout_reservations_due_idx').on(table.status, table.expiresAt),
  check('checkout_reservations_status_ck',
    sql`${table.status} IN ('ACTIVE','EXPIRED','RELEASED','CANCELLED','CONSUMED')`),
  check('checkout_reservations_expires_ck', sql`${table.expiresAt} > ${table.createdAt}`),
  check('checkout_reservations_ended_ck',
    sql`(${table.status} = 'ACTIVE' AND ${table.endedAt} IS NULL)
      OR (${table.status} <> 'ACTIVE' AND ${table.endedAt} IS NOT NULL)`),
  check('checkout_reservations_reason_ck',
    sql`${table.status} <> 'CANCELLED' OR length(trim(coalesce(${table.endReason},''))) BETWEEN 1 AND 500`),
]);

export const checkoutReservationLines = pgTable('checkout_reservation_lines', {
  reservationId: uuid('reservation_id').notNull().references(() => checkoutReservations.id),
  optionId: uuid('option_id').notNull().references(() => productOptions.id),
  quantity: integer('quantity').notNull(),
}, (table) => [
  primaryKey({ columns: [table.reservationId, table.optionId] }),
  index('checkout_reservation_lines_option_idx').on(table.optionId),
  check('checkout_reservation_lines_quantity_ck', sql`${table.quantity} BETWEEN 1 AND 1000000`),
]);

export const inventoryDeferredStockTargets = pgTable('inventory_deferred_stock_targets', {
  id: uuid('id').primaryKey().defaultRandom(),
  optionId: uuid('option_id').notNull().references(() => productOptions.id),
  targetOnHand: integer('target_on_hand').notNull().default(0),
  requestedByAccountId: uuid('requested_by_account_id').notNull().references(() => accounts.id),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  status: text('status').notNull().default('pending'),
  appliedAt: timestamp('applied_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('inventory_deferred_stock_targets_pending_uq').on(table.optionId)
    .where(sql`${table.status} = 'pending'`),
  index('inventory_deferred_stock_targets_option_idx').on(table.optionId),
  check('inventory_deferred_stock_targets_zero_ck', sql`${table.targetOnHand} = 0`),
  check('inventory_deferred_stock_targets_status_ck',
    sql`${table.status} IN ('pending','applied','superseded')`),
  check('inventory_deferred_stock_targets_applied_ck',
    sql`${table.status} <> 'applied' OR ${table.appliedAt} IS NOT NULL`),
]);

export const restockSubscriptions = pgTable('restock_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  optionName: text('option_name').notNull(),
  status: text('status').notNull().default('active'),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  notifiedAt: timestamp('notified_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('restock_subscriptions_active_uq').on(table.accountId, table.productId, table.optionName)
    .where(sql`${table.status} = 'active'`),
  index('restock_subscriptions_account_idx').on(table.accountId),
  index('restock_subscriptions_product_idx').on(table.productId),
  check('restock_subscriptions_status_ck', sql`${table.status} IN ('active','cancelled','notified')`),
  check('restock_subscriptions_option_name_ck', sql`length(trim(${table.optionName})) > 0`),
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

// Campaign limits span every version and both direct grants and public-code acquisition.
export const promotionCampaigns = pgTable('promotion_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  kind: text('kind').notNull(),
  status: text('status').notNull().default('active'),
  directIssueLimit: integer('direct_issue_limit'),
  totalUseLimit: integer('total_use_limit').notNull(),
  perAccountUseLimit: integer('per_account_use_limit').notNull(),
  createdByAccountId: uuid('created_by_account_id').notNull().references(() => accounts.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  stoppedByAccountId: uuid('stopped_by_account_id').references(() => accounts.id),
  stoppedAt: timestamp('stopped_at', { withTimezone: true }),
  stopReason: text('stop_reason'),
}, (table) => [
  index('promotion_campaigns_status_idx').on(table.status),
  check('promotion_campaigns_title_ck', sql`length(trim(${table.title})) BETWEEN 1 AND 160`),
  check('promotion_campaigns_kind_ck', sql`${table.kind} IN ('goods_discount','shipping_support')`),
  check('promotion_campaigns_status_ck', sql`${table.status} IN ('active','stopped')`),
  check('promotion_campaigns_limits_ck', sql`(${table.directIssueLimit} IS NULL OR ${table.directIssueLimit} > 0)
    AND ${table.totalUseLimit} > 0 AND ${table.perAccountUseLimit} > 0`),
  check('promotion_campaigns_stop_ck', sql`(${table.status} = 'active' AND ${table.stoppedAt} IS NULL
      AND ${table.stoppedByAccountId} IS NULL AND ${table.stopReason} IS NULL)
    OR (${table.status} = 'stopped' AND ${table.stoppedAt} IS NOT NULL
      AND ${table.stoppedByAccountId} IS NOT NULL AND length(trim(coalesce(${table.stopReason},''))) BETWEEN 1 AND 500)`),
]);

export const promotionVersions = pgTable('promotion_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').notNull().references(() => promotionCampaigns.id),
  version: integer('version').notNull(),
  scope: text('scope').notNull(),
  targetIds: uuid('target_ids').array().notNull().default(sql`'{}'::uuid[]`),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  minimumEligibleGoodsWon: integer('minimum_eligible_goods_won').notNull().default(0),
  amountKind: text('amount_kind').notNull(),
  amountValue: integer('amount_value').notNull(),
  maxDiscountWon: integer('max_discount_won'),
  createdByAccountId: uuid('created_by_account_id').notNull().references(() => accounts.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('promotion_versions_campaign_version_uq').on(table.campaignId, table.version),
  index('promotion_versions_period_idx').on(table.startsAt, table.endsAt),
  check('promotion_versions_version_ck', sql`${table.version} > 0`),
  check('promotion_versions_scope_ck', sql`${table.scope} IN ('all','sellers','options')`),
  check('promotion_versions_targets_ck', sql`array_position(${table.targetIds}, NULL) IS NULL
    AND ((${table.scope} = 'all' AND cardinality(${table.targetIds}) = 0)
      OR (${table.scope} <> 'all' AND cardinality(${table.targetIds}) > 0))`),
  check('promotion_versions_period_ck', sql`${table.endsAt} > ${table.startsAt}`),
  check('promotion_versions_minimum_ck', sql`${table.minimumEligibleGoodsWon} >= 0`),
  check('promotion_versions_amount_ck', sql`(${table.amountKind} = 'fixed' AND ${table.amountValue} > 0)
    OR (${table.amountKind} = 'percent' AND ${table.amountValue} BETWEEN 1 AND 10000
      AND ${table.maxDiscountWon} IS NOT NULL)`),
  check('promotion_versions_cap_ck', sql`${table.maxDiscountWon} IS NULL OR ${table.maxDiscountWon} > 0`),
]);

export const promotionCodes = pgTable('promotion_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  versionId: uuid('version_id').notNull().references(() => promotionVersions.id),
  code: text('code').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('promotion_codes_code_uq').on(table.code),
  index('promotion_codes_version_idx').on(table.versionId),
  check('promotion_codes_normalized_ck', sql`${table.code} ~ '^[A-Z0-9_-]{4,40}$'`),
]);

export const promotionGrants = pgTable('promotion_grants', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  versionId: uuid('version_id').notNull().references(() => promotionVersions.id),
  source: text('source').notNull(),
  issuedByAccountId: uuid('issued_by_account_id').references(() => accounts.id),
  idempotencyKey: uuid('idempotency_key'),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('promotion_grants_account_version_source_uq').on(table.accountId, table.versionId, table.source),
  uniqueIndex('promotion_grants_actor_key_uq').on(table.issuedByAccountId, table.idempotencyKey)
    .where(sql`${table.source} = 'direct'`),
  index('promotion_grants_version_idx').on(table.versionId),
  check('promotion_grants_source_ck', sql`${table.source} IN ('direct','code')`),
  check('promotion_grants_actor_ck', sql`(${table.source} = 'direct' AND ${table.issuedByAccountId} IS NOT NULL
      AND ${table.idempotencyKey} IS NOT NULL
      AND length(trim(coalesce(${table.reason},''))) BETWEEN 1 AND 500)
    OR (${table.source} = 'code' AND ${table.issuedByAccountId} IS NULL
      AND ${table.idempotencyKey} IS NULL AND ${table.reason} IS NULL)`),
]);

export const promotionUses = pgTable('promotion_uses', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  campaignId: uuid('campaign_id').notNull().references(() => promotionCampaigns.id),
  versionId: uuid('version_id').notNull().references(() => promotionVersions.id),
  grantId: uuid('grant_id').notNull().references(() => promotionGrants.id),
  reservationId: uuid('reservation_id').notNull().references(() => checkoutReservations.id),
  shipmentKey: text('shipment_key'),
  status: text('status').notNull().default('HELD'),
  idempotencyKey: uuid('idempotency_key').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  heldAt: timestamp('held_at', { withTimezone: true }).notNull().defaultNow(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  releasedAt: timestamp('released_at', { withTimezone: true }),
  releaseReason: text('release_reason'),
}, (table) => [
  uniqueIndex('promotion_uses_reservation_campaign_shipment_uq')
    .on(table.reservationId, table.campaignId, sql`coalesce(${table.shipmentKey},'')`)
    .where(sql`${table.status} IN ('HELD','USED')`),
  uniqueIndex('promotion_uses_account_key_campaign_shipment_uq')
    .on(table.accountId, table.idempotencyKey, table.campaignId, sql`coalesce(${table.shipmentKey},'')`),
  index('promotion_uses_campaign_status_idx').on(table.campaignId, table.status),
  index('promotion_uses_account_campaign_idx').on(table.accountId, table.campaignId),
  index('promotion_uses_due_idx').on(table.status, table.expiresAt),
  check('promotion_uses_status_ck', sql`${table.status} IN ('HELD','USED','RELEASED')`),
  check('promotion_uses_shipment_ck', sql`${table.shipmentKey} IS NULL OR length(trim(${table.shipmentKey})) > 0`),
  check('promotion_uses_dates_ck', sql`(${table.status} = 'HELD' AND ${table.usedAt} IS NULL
      AND ${table.releasedAt} IS NULL AND ${table.releaseReason} IS NULL)
    OR (${table.status} = 'USED' AND ${table.usedAt} IS NOT NULL AND ${table.releasedAt} IS NULL)
    OR (${table.status} = 'RELEASED' AND ${table.releasedAt} IS NOT NULL
      AND length(trim(coalesce(${table.releaseReason},''))) BETWEEN 1 AND 500)`),
]);

// S3.3 records a pending payment target only; payment approval belongs to S4.
export const checkoutOrders = pgTable('checkout_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  reservationId: uuid('reservation_id').notNull().references(() => checkoutReservations.id),
  idempotencyKey: uuid('idempotency_key').notNull(),
  requestFingerprint: text('request_fingerprint').notNull(),
  addressId: uuid('address_id').notNull().references(() => customerAddresses.id),
  recipientName: text('recipient_name').notNull(),
  phone: text('phone').notNull(),
  postalCode: text('postal_code').notNull(),
  line1: text('line1').notNull(),
  line2: text('line2').notNull().default(''),
  goodsWon: integer('goods_won').notNull(),
  goodsDiscountWon: integer('goods_discount_won').notNull(),
  shippingFeeWon: integer('shipping_fee_won').notNull(),
  shippingSupportWon: integer('shipping_support_won').notNull(),
  payableWon: integer('payable_won').notNull(),
  status: text('status').notNull().default('PENDING_PAYMENT'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('checkout_orders_account_key_uq').on(table.accountId, table.idempotencyKey),
  uniqueIndex('checkout_orders_reservation_uq').on(table.reservationId),
  index('checkout_orders_due_idx').on(table.status, table.expiresAt),
  index('checkout_orders_account_created_idx').on(table.accountId, table.createdAt),
  check('checkout_orders_fingerprint_ck', sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`),
  check('checkout_orders_address_ck', sql`length(trim(${table.recipientName})) > 0
    AND length(trim(${table.phone})) > 0 AND length(trim(${table.postalCode})) > 0
    AND length(trim(${table.line1})) > 0`),
  check('checkout_orders_money_ck', sql`${table.goodsWon} >= 0
    AND ${table.goodsDiscountWon} BETWEEN 0 AND ${table.goodsWon}
    AND ${table.shippingFeeWon} >= 0
    AND ${table.shippingSupportWon} BETWEEN 0 AND ${table.shippingFeeWon}
    AND ${table.payableWon} = ${table.goodsWon} - ${table.goodsDiscountWon}
      + ${table.shippingFeeWon} - ${table.shippingSupportWon}`),
  check('checkout_orders_status_ck', sql`${table.status} IN ('PENDING_PAYMENT','EXPIRED','PAID')`),
  check('checkout_orders_expires_ck', sql`${table.expiresAt} > ${table.createdAt}`),
  check('checkout_orders_ended_ck', sql`(${table.status} = 'PENDING_PAYMENT' AND ${table.endedAt} IS NULL AND ${table.paidAt} IS NULL)
    OR (${table.status} = 'EXPIRED' AND ${table.endedAt} IS NOT NULL AND ${table.paidAt} IS NULL)
    OR (${table.status} = 'PAID' AND ${table.endedAt} IS NOT NULL AND ${table.paidAt} IS NOT NULL)`),
]);

export const shipmentOrders = pgTable('shipment_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  checkoutOrderId: uuid('checkout_order_id').notNull().references(() => checkoutOrders.id),
  shipmentKey: text('shipment_key').notNull(),
  shippingMode: productShippingMode('shipping_mode').notNull(),
  sellerId: uuid('seller_id').references(() => sellers.id),
  goodsWon: integer('goods_won').notNull(),
  goodsDiscountWon: integer('goods_discount_won').notNull(),
  shippingFeeWon: integer('shipping_fee_won').notNull(),
  shippingSupportWon: integer('shipping_support_won').notNull(),
  payableWon: integer('payable_won').notNull(),
  status: text('status').notNull().default('PENDING_PAYMENT'),
}, (table) => [
  uniqueIndex('shipment_orders_checkout_key_uq').on(table.checkoutOrderId, table.shipmentKey),
  uniqueIndex('shipment_orders_checkout_id_uq').on(table.checkoutOrderId, table.id),
  check('shipment_orders_key_ck', sql`length(trim(${table.shipmentKey})) > 0`),
  check('shipment_orders_mode_seller_ck', sql`(${table.shippingMode} = 'seller_direct'
    AND ${table.sellerId} IS NOT NULL) OR (${table.shippingMode} = 'owool_fulfillment'
    AND ${table.sellerId} IS NULL)`),
  check('shipment_orders_money_ck', sql`${table.goodsWon} >= 0
    AND ${table.goodsDiscountWon} BETWEEN 0 AND ${table.goodsWon}
    AND ${table.shippingFeeWon} >= 0
    AND ${table.shippingSupportWon} BETWEEN 0 AND ${table.shippingFeeWon}
    AND ${table.payableWon} = ${table.goodsWon} - ${table.goodsDiscountWon}
      + ${table.shippingFeeWon} - ${table.shippingSupportWon}`),
  check('shipment_orders_status_ck', sql`${table.status} IN ('PENDING_PAYMENT','EXPIRED','PAID')`),
]);

export const shipmentOrderLines = pgTable('shipment_order_lines', {
  shipmentOrderId: uuid('shipment_order_id').notNull().references(() => shipmentOrders.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  optionId: uuid('option_id').notNull().references(() => productOptions.id),
  sellerId: uuid('seller_id').notNull().references(() => sellers.id),
  productName: text('product_name').notNull(),
  optionName: text('option_name').notNull(),
  unitPriceWon: integer('unit_price_won').notNull(),
  quantity: integer('quantity').notNull(),
  goodsDiscountWon: integer('goods_discount_won').notNull(),
  goodsPayableWon: integer('goods_payable_won').notNull(),
}, (table) => [
  primaryKey({ columns: [table.shipmentOrderId, table.optionId], name: 'shipment_order_lines_pk' }),
  index('shipment_order_lines_product_idx').on(table.productId),
  index('shipment_order_lines_seller_idx').on(table.sellerId),
  check('shipment_order_lines_names_ck', sql`length(trim(${table.productName})) > 0
    AND length(trim(${table.optionName})) > 0`),
  check('shipment_order_lines_money_ck', sql`${table.unitPriceWon} >= 0
    AND ${table.quantity} BETWEEN 1 AND 1000000 AND ${table.goodsDiscountWon} >= 0
    AND ${table.goodsPayableWon} >= 0
    AND ${table.goodsPayableWon}::bigint = ${table.unitPriceWon}::bigint * ${table.quantity}
      - ${table.goodsDiscountWon}`),
]);

export const orderPromotionAllocations = pgTable('order_promotion_allocations', {
  id: uuid('id').primaryKey().defaultRandom(),
  checkoutOrderId: uuid('checkout_order_id').notNull().references(() => checkoutOrders.id),
  shipmentOrderId: uuid('shipment_order_id').notNull(),
  promotionUseId: uuid('promotion_use_id').notNull().references(() => promotionUses.id),
  campaignId: uuid('campaign_id').notNull().references(() => promotionCampaigns.id),
  versionId: uuid('version_id').notNull().references(() => promotionVersions.id),
  kind: text('kind').notNull(),
  amountWon: integer('amount_won').notNull(),
}, (table) => [
  foreignKey({ name: 'order_promotion_allocations_shipment_order_fk',
    columns: [table.checkoutOrderId, table.shipmentOrderId],
    foreignColumns: [shipmentOrders.checkoutOrderId, shipmentOrders.id] }),
  uniqueIndex('order_promotion_allocations_use_shipment_kind_uq')
    .on(table.promotionUseId, table.shipmentOrderId, table.kind),
  index('order_promotion_allocations_checkout_idx').on(table.checkoutOrderId),
  check('order_promotion_allocations_kind_ck', sql`${table.kind} IN ('goods_discount','shipping_support')`),
  check('order_promotion_allocations_amount_ck', sql`${table.amountWon} > 0`),
]);

export const orderStatusEvents = pgTable('order_status_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  checkoutOrderId: uuid('checkout_order_id').notNull().references(() => checkoutOrders.id),
  status: text('status').notNull(),
  actorAccountId: uuid('actor_account_id').references(() => accounts.id),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('order_status_events_checkout_created_idx').on(table.checkoutOrderId, table.createdAt),
  check('order_status_events_status_ck', sql`${table.status} IN ('PENDING_PAYMENT','EXPIRED','PAID')`),
  check('order_status_events_reason_ck', sql`length(trim(${table.reason})) BETWEEN 1 AND 500`),
]);

export const paymentAttempts = pgTable('payment_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  checkoutOrderId: uuid('checkout_order_id').notNull().references(() => checkoutOrders.id),
  provider: text('provider').notNull(),
  providerOrderId: text('provider_order_id').notNull(),
  requestedWon: integer('requested_won').notNull(),
  idempotencyKey: uuid('idempotency_key').notNull(),
  requestFingerprint: text('request_fingerprint').notNull(),
  status: text('status').notNull().default('PENDING'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('payment_attempts_checkout_key_uq').on(table.checkoutOrderId, table.idempotencyKey),
  uniqueIndex('payment_attempts_provider_order_uq').on(table.provider, table.providerOrderId),
  index('payment_attempts_checkout_created_idx').on(table.checkoutOrderId, table.createdAt),
  check('payment_attempts_provider_ck', sql`${table.provider} IN ('mock','no_charge')`),
  check('payment_attempts_provider_order_ck', sql`length(trim(${table.providerOrderId})) BETWEEN 1 AND 200`),
  check('payment_attempts_requested_ck', sql`${table.requestedWon} >= 0`),
  check('payment_attempts_fingerprint_ck', sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`),
  check('payment_attempts_status_ck', sql`${table.status} IN ('PENDING','APPROVED','DECLINED','REVIEW_REQUIRED')`),
  check('payment_attempts_ended_ck', sql`(${table.status} = 'PENDING' AND ${table.endedAt} IS NULL)
    OR (${table.status} <> 'PENDING' AND ${table.endedAt} IS NOT NULL)`),
]);

export const paymentEvents = pgTable('payment_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentAttemptId: uuid('payment_attempt_id').notNull().references(() => paymentAttempts.id),
  provider: text('provider').notNull(),
  providerEventId: text('provider_event_id').notNull(),
  outcome: text('outcome').notNull(),
  verifiedOrderId: uuid('verified_order_id').notNull(),
  providerPaymentId: text('provider_payment_id').notNull(),
  amountWon: integer('amount_won').notNull(),
  eventFingerprint: text('event_fingerprint').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  processingStatus: text('processing_status').notNull().default('PENDING_PROCESSING'),
  processedAt: timestamp('processed_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('payment_events_provider_event_uq').on(table.provider, table.providerEventId),
  index('payment_events_attempt_received_idx').on(table.paymentAttemptId, table.receivedAt),
  index('payment_events_pending_idx').on(table.processingStatus, table.receivedAt),
  check('payment_events_provider_ck', sql`${table.provider} IN ('mock','no_charge')`),
  check('payment_events_provider_event_ck', sql`length(trim(${table.providerEventId})) BETWEEN 1 AND 200`),
  check('payment_events_payment_id_ck', sql`length(trim(${table.providerPaymentId})) BETWEEN 1 AND 200`),
  check('payment_events_outcome_ck', sql`${table.outcome} IN ('APPROVED','DECLINED')`),
  check('payment_events_amount_ck', sql`${table.amountWon} >= 0`),
  check('payment_events_fingerprint_ck', sql`${table.eventFingerprint} ~ '^[0-9a-f]{64}$'`),
  check('payment_events_processing_ck', sql`${table.processingStatus} IN ('PENDING_PROCESSING','APPLIED','REVIEW_REQUIRED')`),
  check('payment_events_processed_ck', sql`(${table.processingStatus} = 'PENDING_PROCESSING' AND ${table.processedAt} IS NULL)
    OR (${table.processingStatus} <> 'PENDING_PROCESSING' AND ${table.processedAt} IS NOT NULL)`),
]);

export const paymentEventConflicts = pgTable('payment_event_conflicts', {
  id: uuid('id').primaryKey().defaultRandom(),
  originalEventId: uuid('original_event_id').notNull().references(() => paymentEvents.id),
  incomingAttemptId: uuid('incoming_attempt_id').notNull().references(() => paymentAttempts.id),
  incomingFingerprint: text('incoming_fingerprint').notNull(),
  reason: text('reason').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('payment_event_conflicts_original_received_idx').on(table.originalEventId, table.receivedAt),
  check('payment_event_conflicts_fingerprint_ck', sql`${table.incomingFingerprint} ~ '^[0-9a-f]{64}$'`),
  check('payment_event_conflicts_reason_ck', sql`${table.reason} IN ('FINGERPRINT_MISMATCH','ATTEMPT_MISMATCH')`),
]);

export const refundCases = pgTable('refund_cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  checkoutOrderId: uuid('checkout_order_id').notNull().references(() => checkoutOrders.id),
  shipmentOrderId: uuid('shipment_order_id').notNull(),
  requesterAccountId: uuid('requester_account_id').notNull().references(() => accounts.id),
  requesterRole: text('requester_role').notNull(),
  reasonCode: text('reason_code').notNull(),
  reason: text('reason').notNull(),
  preShipmentEvidence: text('pre_shipment_evidence'),
  preShipmentConfirmedBy: uuid('pre_shipment_confirmed_by').references(() => accounts.id),
  preShipmentConfirmedAt: timestamp('pre_shipment_confirmed_at', { withTimezone: true }),
  policyCode: text('policy_code').notNull().default('PRE_SHIPMENT_V1'),
  policyVersion: integer('policy_version').notNull().default(1),
  idempotencyKey: uuid('idempotency_key').notNull(),
  requestFingerprint: text('request_fingerprint').notNull(),
  goodsRefundWon: integer('goods_refund_won').notNull().default(0),
  shippingRefundWon: integer('shipping_refund_won').notNull().default(0),
  totalRefundWon: integer('total_refund_won').notNull().default(0),
  status: text('status').notNull().default('REQUESTED'),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  decisionBy: uuid('decision_by').references(() => accounts.id),
  decisionReason: text('decision_reason'),
  decisionIdempotencyKey: uuid('decision_idempotency_key'),
  decisionFingerprint: text('decision_fingerprint'),
}, (table) => [
  foreignKey({ name: 'refund_cases_shipment_fk',
    columns: [table.checkoutOrderId, table.shipmentOrderId],
    foreignColumns: [shipmentOrders.checkoutOrderId, shipmentOrders.id] }),
  uniqueIndex('refund_cases_request_key_uq')
    .on(table.requesterAccountId, table.checkoutOrderId, table.idempotencyKey),
  uniqueIndex('refund_cases_id_shipment_uq').on(table.id, table.shipmentOrderId),
  index('refund_cases_checkout_requested_idx').on(table.checkoutOrderId, table.requestedAt),
  index('refund_cases_status_requested_idx').on(table.status, table.requestedAt),
  check('refund_cases_requester_role_ck', sql`${table.requesterRole} IN ('customer','admin')`),
  check('refund_cases_reason_code_ck', sql`${table.reasonCode} IN
    ('customer_request','quality_issue','wrong_delivery','damaged','other')`),
  check('refund_cases_reason_ck', sql`length(trim(${table.reason})) BETWEEN 1 AND 500`),
  check('refund_cases_evidence_ck', sql`${table.preShipmentEvidence} IS NULL
    OR ${table.preShipmentEvidence} = 'ADMIN_CONFIRMED_NOT_DISPATCHED'`),
  check('refund_cases_policy_ck', sql`length(trim(${table.policyCode})) BETWEEN 1 AND 100
    AND ${table.policyVersion} > 0`),
  check('refund_cases_fingerprint_ck', sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`),
  check('refund_cases_amount_ck', sql`${table.goodsRefundWon} >= 0
    AND ${table.shippingRefundWon} >= 0
    AND ${table.totalRefundWon} = ${table.goodsRefundWon} + ${table.shippingRefundWon}`),
  check('refund_cases_status_ck', sql`${table.status} IN
    ('REQUESTED','APPROVED','REJECTED','PROCESSING','REFUNDED','REVIEW_REQUIRED')`),
  check('refund_cases_decision_reason_ck', sql`${table.decisionReason} IS NULL
    OR length(trim(${table.decisionReason})) BETWEEN 1 AND 500`),
  check('refund_cases_decision_fingerprint_ck', sql`${table.decisionFingerprint} IS NULL
    OR ${table.decisionFingerprint} ~ '^[0-9a-f]{64}$'`),
  check('refund_cases_state_ck', sql`(
    ${table.status} = 'REQUESTED' AND ${table.decidedAt} IS NULL
      AND ${table.completedAt} IS NULL AND ${table.decisionBy} IS NULL
      AND ${table.decisionReason} IS NULL AND ${table.preShipmentEvidence} IS NULL
      AND ${table.decisionIdempotencyKey} IS NULL AND ${table.decisionFingerprint} IS NULL
      AND ${table.preShipmentConfirmedBy} IS NULL AND ${table.preShipmentConfirmedAt} IS NULL
      AND ${table.goodsRefundWon} = 0 AND ${table.shippingRefundWon} = 0
      AND ${table.totalRefundWon} = 0)
    OR (${table.status} IN ('APPROVED','PROCESSING') AND ${table.decidedAt} IS NOT NULL
      AND ${table.completedAt} IS NULL AND ${table.decisionBy} IS NOT NULL
      AND ${table.decisionReason} IS NOT NULL
      AND ${table.decisionIdempotencyKey} IS NOT NULL AND ${table.decisionFingerprint} IS NOT NULL
      AND ${table.preShipmentEvidence} = 'ADMIN_CONFIRMED_NOT_DISPATCHED'
      AND ${table.preShipmentConfirmedBy} IS NOT NULL
      AND ${table.preShipmentConfirmedAt} IS NOT NULL)
    OR (${table.status} = 'REJECTED' AND ${table.decidedAt} IS NOT NULL
      AND ${table.completedAt} IS NOT NULL AND ${table.decisionBy} IS NOT NULL
      AND ${table.decisionReason} IS NOT NULL AND ${table.goodsRefundWon} = 0
      AND ${table.decisionIdempotencyKey} IS NOT NULL AND ${table.decisionFingerprint} IS NOT NULL
      AND ${table.shippingRefundWon} = 0 AND ${table.totalRefundWon} = 0)
    OR (${table.status} = 'REFUNDED' AND ${table.decidedAt} IS NOT NULL
      AND ${table.completedAt} IS NOT NULL AND ${table.decisionBy} IS NOT NULL
      AND ${table.decisionReason} IS NOT NULL
      AND ${table.decisionIdempotencyKey} IS NOT NULL AND ${table.decisionFingerprint} IS NOT NULL
      AND ${table.preShipmentEvidence} = 'ADMIN_CONFIRMED_NOT_DISPATCHED'
      AND ${table.preShipmentConfirmedBy} IS NOT NULL
      AND ${table.preShipmentConfirmedAt} IS NOT NULL)
    OR (${table.status} = 'REVIEW_REQUIRED' AND ${table.decidedAt} IS NOT NULL
      AND ${table.completedAt} IS NULL AND ${table.decisionBy} IS NOT NULL
      AND ${table.decisionReason} IS NOT NULL
      AND ${table.decisionIdempotencyKey} IS NOT NULL AND ${table.decisionFingerprint} IS NOT NULL
      AND ${table.preShipmentEvidence} = 'ADMIN_CONFIRMED_NOT_DISPATCHED'
      AND ${table.preShipmentConfirmedBy} IS NOT NULL
      AND ${table.preShipmentConfirmedAt} IS NOT NULL)`),
]);

export const refundCaseLines = pgTable('refund_case_lines', {
  refundCaseId: uuid('refund_case_id').notNull(),
  shipmentOrderId: uuid('shipment_order_id').notNull(),
  optionId: uuid('option_id').notNull(),
  quantity: integer('quantity').notNull(),
  goodsRefundWon: integer('goods_refund_won').notNull().default(0),
  restockMode: text('restock_mode').notNull().default('none'),
  restockedQuantity: integer('restocked_quantity').notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.refundCaseId, table.optionId], name: 'refund_case_lines_pk' }),
  foreignKey({ name: 'refund_case_lines_case_fk',
    columns: [table.refundCaseId, table.shipmentOrderId],
    foreignColumns: [refundCases.id, refundCases.shipmentOrderId] }),
  foreignKey({ name: 'refund_case_lines_order_line_fk',
    columns: [table.shipmentOrderId, table.optionId],
    foreignColumns: [shipmentOrderLines.shipmentOrderId, shipmentOrderLines.optionId] }),
  index('refund_case_lines_option_idx').on(table.optionId),
  check('refund_case_lines_quantity_ck', sql`${table.quantity} > 0`),
  check('refund_case_lines_money_ck', sql`${table.goodsRefundWon} >= 0`),
  check('refund_case_lines_restock_ck', sql`(${table.restockMode} = 'none'
      AND ${table.restockedQuantity} = 0)
    OR (${table.restockMode} = 'on_hand_only'
      AND ${table.restockedQuantity} BETWEEN 0 AND ${table.quantity})`),
]);

export const refundAttempts = pgTable('refund_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  refundCaseId: uuid('refund_case_id').notNull().references(() => refundCases.id),
  paymentAttemptId: uuid('payment_attempt_id').notNull().references(() => paymentAttempts.id),
  provider: text('provider').notNull(),
  providerRefundId: text('provider_refund_id').notNull(),
  requestedWon: integer('requested_won').notNull(),
  idempotencyKey: uuid('idempotency_key').notNull(),
  requestFingerprint: text('request_fingerprint').notNull(),
  status: text('status').notNull().default('PENDING'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('refund_attempts_case_key_uq').on(table.refundCaseId, table.idempotencyKey),
  uniqueIndex('refund_attempts_provider_refund_uq').on(table.provider, table.providerRefundId),
  index('refund_attempts_case_created_idx').on(table.refundCaseId, table.createdAt),
  check('refund_attempts_provider_ck', sql`${table.provider} IN ('mock','no_charge')`),
  check('refund_attempts_provider_id_ck',
    sql`length(trim(${table.providerRefundId})) BETWEEN 1 AND 200`),
  check('refund_attempts_requested_ck', sql`${table.requestedWon} >= 0`),
  check('refund_attempts_fingerprint_ck', sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`),
  check('refund_attempts_status_ck',
    sql`${table.status} IN ('PENDING','SUCCEEDED','FAILED','REVIEW_REQUIRED')`),
  check('refund_attempts_ended_ck', sql`(${table.status} = 'PENDING' AND ${table.endedAt} IS NULL)
    OR (${table.status} <> 'PENDING' AND ${table.endedAt} IS NOT NULL)`),
]);

export const refundEvents = pgTable('refund_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  refundAttemptId: uuid('refund_attempt_id').notNull().references(() => refundAttempts.id),
  provider: text('provider').notNull(),
  providerEventId: text('provider_event_id').notNull(),
  outcome: text('outcome').notNull(),
  verifiedOrderId: uuid('verified_order_id').notNull().references(() => checkoutOrders.id),
  providerPaymentId: text('provider_payment_id').notNull(),
  providerRefundId: text('provider_refund_id').notNull(),
  amountWon: integer('amount_won').notNull(),
  eventFingerprint: text('event_fingerprint').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  processingStatus: text('processing_status').notNull().default('PENDING_PROCESSING'),
  processedAt: timestamp('processed_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('refund_events_provider_event_uq').on(table.provider, table.providerEventId),
  index('refund_events_attempt_received_idx').on(table.refundAttemptId, table.receivedAt),
  index('refund_events_pending_idx').on(table.processingStatus, table.receivedAt),
  check('refund_events_provider_ck', sql`${table.provider} IN ('mock','no_charge')`),
  check('refund_events_ids_ck', sql`length(trim(${table.providerEventId})) BETWEEN 1 AND 200
    AND length(trim(${table.providerPaymentId})) BETWEEN 1 AND 200
    AND length(trim(${table.providerRefundId})) BETWEEN 1 AND 200`),
  check('refund_events_outcome_ck', sql`${table.outcome} IN ('SUCCEEDED','FAILED')`),
  check('refund_events_amount_ck', sql`${table.amountWon} >= 0`),
  check('refund_events_fingerprint_ck', sql`${table.eventFingerprint} ~ '^[0-9a-f]{64}$'`),
  check('refund_events_processing_ck',
    sql`${table.processingStatus} IN ('PENDING_PROCESSING','APPLIED','REVIEW_REQUIRED')`),
  check('refund_events_processed_ck',
    sql`(${table.processingStatus} = 'PENDING_PROCESSING' AND ${table.processedAt} IS NULL)
      OR (${table.processingStatus} <> 'PENDING_PROCESSING' AND ${table.processedAt} IS NOT NULL)`),
]);

export const refundEventConflicts = pgTable('refund_event_conflicts', {
  id: uuid('id').primaryKey().defaultRandom(),
  originalEventId: uuid('original_event_id').notNull().references(() => refundEvents.id),
  incomingAttemptId: uuid('incoming_attempt_id').notNull().references(() => refundAttempts.id),
  incomingFingerprint: text('incoming_fingerprint').notNull(),
  reason: text('reason').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('refund_event_conflicts_original_received_idx').on(table.originalEventId, table.receivedAt),
  check('refund_event_conflicts_fingerprint_ck',
    sql`${table.incomingFingerprint} ~ '^[0-9a-f]{64}$'`),
  check('refund_event_conflicts_reason_ck',
    sql`${table.reason} IN ('FINGERPRINT_MISMATCH','ATTEMPT_MISMATCH')`),
]);

export const refundCaseEvents = pgTable('refund_case_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  refundCaseId: uuid('refund_case_id').notNull().references(() => refundCases.id),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  actorAccountId: uuid('actor_account_id').references(() => accounts.id),
  actorRole: text('actor_role').notNull(),
  reason: text('reason').notNull(),
  refundEventId: uuid('refund_event_id').references(() => refundEvents.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('refund_case_events_case_created_idx').on(table.refundCaseId, table.createdAt),
  check('refund_case_events_from_ck', sql`${table.fromStatus} IS NULL OR ${table.fromStatus} IN
    ('REQUESTED','APPROVED','REJECTED','PROCESSING','REFUNDED','REVIEW_REQUIRED')`),
  check('refund_case_events_to_ck', sql`${table.toStatus} IN
    ('REQUESTED','APPROVED','REJECTED','PROCESSING','REFUNDED','REVIEW_REQUIRED')`),
  check('refund_case_events_actor_ck', sql`(${table.actorRole} IN ('customer','admin')
      AND ${table.actorAccountId} IS NOT NULL)
    OR (${table.actorRole} = 'system' AND ${table.actorAccountId} IS NULL)`),
  check('refund_case_events_reason_ck', sql`length(trim(${table.reason})) BETWEEN 1 AND 500`),
]);

export const fulfillmentSettings = pgTable('fulfillment_settings', {
  id: integer('id').primaryKey().default(1),
  owoolSellerId: uuid('owool_seller_id').references(() => sellers.id),
  updatedBy: uuid('updated_by').references(() => accounts.id),
  version: integer('version').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('fulfillment_settings_singleton_ck', sql`${table.id} = 1`),
  check('fulfillment_settings_version_ck', sql`${table.version} >= 0`),
]);

export const shipmentFulfillments = pgTable('shipment_fulfillments', {
  shipmentOrderId: uuid('shipment_order_id').primaryKey().references(() => shipmentOrders.id),
  fulfillmentSellerId: uuid('fulfillment_seller_id').notNull().references(() => sellers.id),
  status: text('status').notNull().default('PAYMENT_PENDING'),
  cutoffTime: text('cutoff_time'),
  timezone: text('timezone').notNull().default('Asia/Seoul'),
  expectedShipDate: date('expected_ship_date'),
  carrierCode: text('carrier_code'),
  carrierName: text('carrier_name'),
  trackingNumber: text('tracking_number'),
  packedAt: timestamp('packed_at', { withTimezone: true }),
  firstShippedAt: timestamp('first_shipped_at', { withTimezone: true }),
  shippedAt: timestamp('shipped_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  version: integer('version').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('shipment_fulfillments_seller_status_idx').on(table.fulfillmentSellerId, table.status, table.shipmentOrderId),
  index('shipment_fulfillments_status_idx').on(table.status, table.shipmentOrderId),
  check('shipment_fulfillments_status_ck', sql`${table.status} IN
    ('PAYMENT_PENDING','READY','PACKING','DELAYED','SHIPPED','CANCELLED')`),
  check('shipment_fulfillments_cutoff_ck', sql`${table.cutoffTime} IS NULL
    OR ${table.cutoffTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
  check('shipment_fulfillments_timezone_ck', sql`${table.timezone} = 'Asia/Seoul'`),
  check('shipment_fulfillments_version_ck', sql`${table.version} >= 0`),
  check('shipment_fulfillments_pending_ck', sql`
    (${table.status} = 'PAYMENT_PENDING' AND ${table.expectedShipDate} IS NULL
      AND ${table.packedAt} IS NULL AND ${table.firstShippedAt} IS NULL)
    OR (${table.status} <> 'PAYMENT_PENDING' AND ${table.expectedShipDate} IS NOT NULL)`),
  check('shipment_fulfillments_packing_ck', sql`${table.status} <> 'PACKING' OR ${table.packedAt} IS NOT NULL`),
  check('shipment_fulfillments_shipping_ck', sql`
    (${table.status} = 'SHIPPED' AND ${table.carrierCode} IS NOT NULL
      AND ${table.carrierCode} IN ('cj_logistics','korea_post','hanjin','lotte','other')
      AND ${table.trackingNumber} IS NOT NULL AND ${table.trackingNumber} ~ '^[A-Za-z0-9]{1,50}$'
      AND ${table.firstShippedAt} IS NOT NULL AND ${table.shippedAt} IS NOT NULL
      AND ((${table.carrierCode} = 'other' AND ${table.carrierName} IS NOT NULL
        AND length(trim(${table.carrierName})) BETWEEN 1 AND 50)
        OR (${table.carrierCode} <> 'other' AND ${table.carrierName} IS NULL)))
    OR (${table.status} <> 'SHIPPED' AND ${table.carrierCode} IS NULL AND ${table.carrierName} IS NULL
      AND ${table.trackingNumber} IS NULL AND ${table.shippedAt} IS NULL)`),
  check('shipment_fulfillments_cancelled_ck', sql`(${table.status} = 'CANCELLED') = (${table.cancelledAt} IS NOT NULL)`),
]);

export const shipmentFulfillmentEvents = pgTable('shipment_fulfillment_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  shipmentOrderId: uuid('shipment_order_id').notNull().references(() => shipmentFulfillments.shipmentOrderId),
  action: text('action').notNull(),
  fromStatus: text('from_status').notNull(),
  toStatus: text('to_status').notNull(),
  actorAccountId: uuid('actor_account_id').references(() => accounts.id),
  actorRole: text('actor_role'),
  actorSellerId: uuid('actor_seller_id').references(() => sellers.id),
  reason: text('reason'),
  customerMessage: text('customer_message'),
  beforeSnapshot: jsonb('before_snapshot').notNull(),
  afterSnapshot: jsonb('after_snapshot').notNull(),
  idempotencyScope: text('idempotency_scope').notNull(),
  idempotencyKey: uuid('idempotency_key').notNull(),
  requestFingerprint: text('request_fingerprint').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('shipment_fulfillment_events_key_uq').on(table.shipmentOrderId, table.idempotencyScope, table.idempotencyKey),
  index('shipment_fulfillment_events_shipment_time_idx').on(table.shipmentOrderId, table.occurredAt),
  check('shipment_fulfillment_events_action_ck', sql`${table.action} IN
    ('PAYMENT_CONFIRMED','START_PACKING','REPORT_DELAY','RESUME_PACKING','MARK_SHIPPED','ADMIN_CORRECT','REFUND_CANCELLED')`),
  check('shipment_fulfillment_events_from_ck', sql`${table.fromStatus} IN
    ('PAYMENT_PENDING','READY','PACKING','DELAYED','SHIPPED','CANCELLED')`),
  check('shipment_fulfillment_events_to_ck', sql`${table.toStatus} IN
    ('PAYMENT_PENDING','READY','PACKING','DELAYED','SHIPPED','CANCELLED')`),
  check('shipment_fulfillment_events_actor_ck', sql`coalesce(
    (${table.action} IN ('START_PACKING','REPORT_DELAY','RESUME_PACKING','MARK_SHIPPED')
      AND ${table.actorRole} = 'seller' AND ${table.actorAccountId} IS NOT NULL AND ${table.actorSellerId} IS NOT NULL
      AND ${table.idempotencyScope} = ${table.actorAccountId}::text)
    OR (${table.action} = 'ADMIN_CORRECT' AND ${table.actorRole} = 'admin'
      AND ${table.actorAccountId} IS NOT NULL AND ${table.actorSellerId} IS NULL
      AND ${table.idempotencyScope} = ${table.actorAccountId}::text)
    OR (${table.action} IN ('PAYMENT_CONFIRMED','REFUND_CANCELLED') AND ${table.actorRole} IS NULL
      AND ${table.actorAccountId} IS NULL AND ${table.actorSellerId} IS NULL
      AND ${table.idempotencyScope} = CASE ${table.action} WHEN 'PAYMENT_CONFIRMED' THEN 'system:payment' ELSE 'system:refund' END), false)`),
  check('shipment_fulfillment_events_reason_ck', sql`${table.reason} IS NULL OR length(trim(${table.reason})) BETWEEN 1 AND 500`),
  check('shipment_fulfillment_events_message_ck', sql`${table.customerMessage} IS NULL OR length(trim(${table.customerMessage})) BETWEEN 1 AND 500`),
  check('shipment_fulfillment_events_notice_ck', sql`${table.action} NOT IN ('REPORT_DELAY','ADMIN_CORRECT')
    OR (${table.reason} IS NOT NULL AND ${table.customerMessage} IS NOT NULL)`),
  check('shipment_fulfillment_events_snapshot_ck', sql`
    jsonb_typeof(${table.beforeSnapshot}) = 'object' AND jsonb_typeof(${table.afterSnapshot}) = 'object'
    AND (${table.beforeSnapshot} - ARRAY['status','expectedShipDate','carrierCode','trackingNumber']::text[]) = '{}'::jsonb
    AND (${table.afterSnapshot} - ARRAY['status','expectedShipDate','carrierCode','trackingNumber']::text[]) = '{}'::jsonb
      AND (NOT (${table.beforeSnapshot} ? 'status') OR
        (jsonb_typeof(${table.beforeSnapshot}->'status') = 'string' AND ${table.beforeSnapshot}->>'status' IN
          ('PAYMENT_PENDING','READY','PACKING','DELAYED','SHIPPED','CANCELLED')))
      AND (NOT (${table.beforeSnapshot} ? 'expectedShipDate') OR ${table.beforeSnapshot}->'expectedShipDate' = 'null'::jsonb OR
        CASE WHEN jsonb_typeof(${table.beforeSnapshot}->'expectedShipDate') = 'string'
          AND length(${table.beforeSnapshot}->>'expectedShipDate') = 10
          AND ${table.beforeSnapshot}->>'expectedShipDate' ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
        THEN substring(${table.beforeSnapshot}->>'expectedShipDate',9,2)::integer <=
          CASE WHEN substring(${table.beforeSnapshot}->>'expectedShipDate',6,2) = '02'
            THEN 28 + CASE WHEN substring(${table.beforeSnapshot}->>'expectedShipDate',1,4)::integer % 400 = 0
              OR (substring(${table.beforeSnapshot}->>'expectedShipDate',1,4)::integer % 4 = 0
                AND substring(${table.beforeSnapshot}->>'expectedShipDate',1,4)::integer % 100 <> 0)
              THEN 1 ELSE 0 END
            WHEN substring(${table.beforeSnapshot}->>'expectedShipDate',6,2) IN ('04','06','09','11') THEN 30
            ELSE 31 END
        ELSE false END)
      AND (NOT (${table.beforeSnapshot} ? 'carrierCode') OR ${table.beforeSnapshot}->'carrierCode' = 'null'::jsonb OR
        (jsonb_typeof(${table.beforeSnapshot}->'carrierCode') = 'string' AND ${table.beforeSnapshot}->>'carrierCode' IN
          ('cj_logistics','korea_post','hanjin','lotte','other')))
      AND (NOT (${table.beforeSnapshot} ? 'trackingNumber') OR ${table.beforeSnapshot}->'trackingNumber' = 'null'::jsonb OR
        (jsonb_typeof(${table.beforeSnapshot}->'trackingNumber') = 'string'
          AND length(${table.beforeSnapshot}->>'trackingNumber') BETWEEN 1 AND 50
          AND ${table.beforeSnapshot}->>'trackingNumber' !~ '[^A-Za-z0-9]'))
      AND (NOT (${table.afterSnapshot} ? 'status') OR
        (jsonb_typeof(${table.afterSnapshot}->'status') = 'string' AND ${table.afterSnapshot}->>'status' IN
          ('PAYMENT_PENDING','READY','PACKING','DELAYED','SHIPPED','CANCELLED')))
      AND (NOT (${table.afterSnapshot} ? 'expectedShipDate') OR ${table.afterSnapshot}->'expectedShipDate' = 'null'::jsonb OR
        CASE WHEN jsonb_typeof(${table.afterSnapshot}->'expectedShipDate') = 'string'
          AND length(${table.afterSnapshot}->>'expectedShipDate') = 10
          AND ${table.afterSnapshot}->>'expectedShipDate' ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
        THEN substring(${table.afterSnapshot}->>'expectedShipDate',9,2)::integer <=
          CASE WHEN substring(${table.afterSnapshot}->>'expectedShipDate',6,2) = '02'
            THEN 28 + CASE WHEN substring(${table.afterSnapshot}->>'expectedShipDate',1,4)::integer % 400 = 0
              OR (substring(${table.afterSnapshot}->>'expectedShipDate',1,4)::integer % 4 = 0
                AND substring(${table.afterSnapshot}->>'expectedShipDate',1,4)::integer % 100 <> 0)
              THEN 1 ELSE 0 END
            WHEN substring(${table.afterSnapshot}->>'expectedShipDate',6,2) IN ('04','06','09','11') THEN 30
            ELSE 31 END
        ELSE false END)
      AND (NOT (${table.afterSnapshot} ? 'carrierCode') OR ${table.afterSnapshot}->'carrierCode' = 'null'::jsonb OR
        (jsonb_typeof(${table.afterSnapshot}->'carrierCode') = 'string' AND ${table.afterSnapshot}->>'carrierCode' IN
          ('cj_logistics','korea_post','hanjin','lotte','other')))
      AND (NOT (${table.afterSnapshot} ? 'trackingNumber') OR ${table.afterSnapshot}->'trackingNumber' = 'null'::jsonb OR
        (jsonb_typeof(${table.afterSnapshot}->'trackingNumber') = 'string'
          AND length(${table.afterSnapshot}->>'trackingNumber') BETWEEN 1 AND 50
          AND ${table.afterSnapshot}->>'trackingNumber' !~ '[^A-Za-z0-9]'))`),
  check('shipment_fulfillment_events_fingerprint_ck', sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`),
]);
