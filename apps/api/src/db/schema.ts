import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
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
  check('checkout_orders_status_ck', sql`${table.status} IN ('PENDING_PAYMENT','EXPIRED')`),
  check('checkout_orders_expires_ck', sql`${table.expiresAt} > ${table.createdAt}`),
  check('checkout_orders_ended_ck', sql`(${table.status} = 'PENDING_PAYMENT' AND ${table.endedAt} IS NULL)
    OR (${table.status} = 'EXPIRED' AND ${table.endedAt} IS NOT NULL)`),
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
  check('shipment_orders_status_ck', sql`${table.status} IN ('PENDING_PAYMENT','EXPIRED')`),
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
  check('order_status_events_status_ck', sql`${table.status} IN ('PENDING_PAYMENT','EXPIRED')`),
  check('order_status_events_reason_ck', sql`length(trim(${table.reason})) BETWEEN 1 AND 500`),
]);
