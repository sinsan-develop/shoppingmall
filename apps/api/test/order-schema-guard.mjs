/** Run S3.3 DB tests only after all additive order relations exist, before any QA seed. */
export async function skipWithoutOrderSchema(context, pool,
  strict = process.env.S3_ORDER_SCHEMA_REQUIRED === '1') {
  const result = await pool.query(`SELECT
    to_regclass('public.checkout_orders') IS NOT NULL AND
    to_regclass('public.shipment_orders') IS NOT NULL AND
    to_regclass('public.shipment_order_lines') IS NOT NULL AND
    to_regclass('public.order_promotion_allocations') IS NOT NULL AND
    to_regclass('public.order_status_events') IS NOT NULL AS ready`);
  if (result.rows[0]?.ready) return false;
  const reason = 'S3 order migration 0012 not applied';
  if (strict) throw new Error(reason);
  context.skip(reason);
  return true;
}

/** A policy-changing QA test must target one explicitly identified disposable server. */
export async function assertOrderMutationQaTarget(pool, expectedSystemId) {
  if (!/^\d{10,}$/.test(expectedSystemId ?? '')) throw new Error('Expected isolated S3 QA database');
  const result = await pool.query(`SELECT system_identifier::text AS "systemId",
    current_database() AS "databaseName" FROM pg_control_system()`);
  const row = result.rows[0];
  if (row?.systemId !== expectedSystemId || row?.databaseName !== 'shoppingmall')
    throw new Error('Expected isolated S3 QA database');
}
