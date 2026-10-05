import type { Pool, PoolClient } from 'pg';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function finishEvent(client: PoolClient, eventId: string,
  processingStatus: 'APPLIED' | 'REVIEW_REQUIRED') {
  await client.query(`UPDATE refund_events SET processing_status=$2,processed_at=clock_timestamp()
    WHERE id=$1 AND processing_status='PENDING_PROCESSING'`, [eventId, processingStatus]);
  return { id: eventId, processingStatus };
}

async function review(client: PoolClient, caseId: string, attemptId: string, eventId: string,
  reason: string) {
  const changed = await client.query(`UPDATE refund_cases SET status='REVIEW_REQUIRED'
    WHERE id=$1 AND status='PROCESSING' RETURNING id`, [caseId]);
  await client.query(`UPDATE refund_attempts SET status='REVIEW_REQUIRED',ended_at=clock_timestamp()
    WHERE id=$1 AND status='PENDING'`, [attemptId]);
  if (changed.rowCount) await client.query(`INSERT INTO refund_case_events
    (refund_case_id,from_status,to_status,actor_account_id,actor_role,reason,refund_event_id)
    VALUES ($1,'PROCESSING','REVIEW_REQUIRED',NULL,'system',$2,$3)`, [caseId, reason, eventId]);
  return finishEvent(client, eventId, 'REVIEW_REQUIRED');
}

export async function processVerifiedRefundEvent(pool: Pool, eventId: string) {
  if (!uuid.test(eventId)) throw new Error('Invalid refund event');
  const anchor = (await pool.query<{ caseId: string }>(`SELECT a.refund_case_id AS "caseId"
    FROM refund_events e JOIN refund_attempts a ON a.id=e.refund_attempt_id WHERE e.id=$1`,
  [eventId])).rows[0];
  if (!anchor) throw new Error('Refund event unavailable');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const target = (await client.query<{ id: string; status: string; orderId: string;
      shipmentId: string; totalWon: number }>(`SELECT id,status,checkout_order_id AS "orderId",
      shipment_order_id AS "shipmentId",total_refund_won AS "totalWon"
      FROM refund_cases WHERE id=$1 FOR UPDATE`, [anchor.caseId])).rows[0];
    if (!target) throw new Error('Refund unavailable');
    const event = (await client.query<{ id: string; attemptId: string; provider: string;
      providerRefundId: string; paymentId: string; outcome: string; orderId: string;
      amountWon: number; processingStatus: string }>(`SELECT id,
      refund_attempt_id AS "attemptId",provider,provider_refund_id AS "providerRefundId",
      provider_payment_id AS "paymentId",outcome,verified_order_id AS "orderId",
      amount_won AS "amountWon",processing_status AS "processingStatus"
      FROM refund_events WHERE id=$1 FOR UPDATE`, [eventId])).rows[0];
    if (!event) throw new Error('Refund event unavailable');
    const attempt = (await client.query<{ id: string; paymentAttemptId: string; provider: string;
      providerRefundId: string; requestedWon: number; status: string }>(`SELECT id,
      payment_attempt_id AS "paymentAttemptId",provider,provider_refund_id AS "providerRefundId",
      requested_won AS "requestedWon",status FROM refund_attempts WHERE id=$1 FOR UPDATE`,
    [event.attemptId])).rows[0];
    if (!attempt) throw new Error('Refund attempt unavailable');
    if (event.processingStatus !== 'PENDING_PROCESSING') {
      await client.query('COMMIT');
      return { id: event.id, processingStatus: event.processingStatus };
    }
    const payment = (await client.query<{ paymentId: string }>(`SELECT e.provider_payment_id AS "paymentId"
      FROM payment_events e JOIN payment_attempts a ON a.id=e.payment_attempt_id
      WHERE a.id=$1 AND a.status='APPROVED' AND e.outcome='APPROVED'
        AND e.processing_status='APPLIED' ORDER BY e.received_at,e.id LIMIT 1 FOR UPDATE OF e,a`,
    [attempt.paymentAttemptId])).rows[0];
    if (target.status !== 'PROCESSING' || attempt.status !== 'PENDING' || !payment ||
        event.provider !== attempt.provider || event.providerRefundId !== attempt.providerRefundId ||
        event.orderId !== target.orderId || event.amountWon !== target.totalWon ||
        attempt.requestedWon !== target.totalWon || event.paymentId !== payment.paymentId) {
      const result = await review(client, target.id, attempt.id, event.id, 'Refund verification mismatch');
      await client.query('COMMIT');
      return result;
    }
    if (event.outcome === 'FAILED') {
      await client.query(`UPDATE refund_attempts SET status='FAILED',ended_at=clock_timestamp()
        WHERE id=$1`, [attempt.id]);
      const changed = await client.query(`UPDATE refund_cases SET status='REVIEW_REQUIRED'
        WHERE id=$1 AND status='PROCESSING' RETURNING id`, [target.id]);
      if (changed.rowCount) await client.query(`INSERT INTO refund_case_events
        (refund_case_id,from_status,to_status,actor_account_id,actor_role,reason,refund_event_id)
        VALUES ($1,'PROCESSING','REVIEW_REQUIRED',NULL,'system','Verified refund failure',$2)`,
      [target.id, event.id]);
      const result = await finishEvent(client, event.id, 'APPLIED');
      await client.query('COMMIT');
      return result;
    }
    const lines = await client.query<{ optionId: string; quantity: number; restockMode: string }>(
      `SELECT option_id AS "optionId",quantity,restock_mode AS "restockMode"
       FROM refund_case_lines WHERE refund_case_id=$1 ORDER BY option_id FOR UPDATE`, [target.id]);
    const restockLines = lines.rows.filter(({ restockMode }) => restockMode === 'on_hand_only');
    // Sale-stop approval takes these same product locks. Validate every target before
    // restoring any stock so an unavailable line cannot leave a partly applied refund.
    await client.query(`SELECT p.id FROM products p WHERE p.id IN (
      SELECT r.product_id FROM product_options o JOIN product_revisions r ON r.id=o.revision_id
      WHERE o.id=ANY($1::uuid[])) ORDER BY p.id FOR UPDATE`,
    [restockLines.map(({ optionId }) => optionId)]);
    for (const line of restockLines) {
      const stock = await client.query(`SELECT i.option_id FROM inventory_levels i
        JOIN product_options o ON o.id=i.option_id JOIN product_revisions r ON r.id=o.revision_id
        WHERE i.option_id=$1 AND i.on_hand_quantity <= 2147483647-$2
          AND NOT EXISTS (SELECT 1 FROM product_sale_stop_requests s
          WHERE s.product_id=r.product_id AND s.status='approved') FOR UPDATE OF i`, [line.optionId, line.quantity]);
      if (!stock.rowCount) {
        const result = await review(client, target.id, attempt.id, event.id,
          'Verified refund succeeded; stock restoration requires manual review');
        await client.query('COMMIT');
        return result;
      }
    }
    for (const line of restockLines) {
      await client.query(`UPDATE inventory_levels SET on_hand_quantity=on_hand_quantity+$2,
        updated_at=clock_timestamp() WHERE option_id=$1`, [line.optionId, line.quantity]);
      await client.query(`UPDATE refund_case_lines SET restocked_quantity=$3
        WHERE refund_case_id=$1 AND option_id=$2 AND restocked_quantity=0`,
      [target.id, line.optionId, line.quantity]);
    }
    await client.query(`UPDATE refund_attempts SET status='SUCCEEDED',ended_at=clock_timestamp()
      WHERE id=$1`, [attempt.id]);
    await client.query(`UPDATE refund_cases SET status='REFUNDED',completed_at=clock_timestamp()
      WHERE id=$1`, [target.id]);
    const result = await finishEvent(client, event.id, 'APPLIED');
    await client.query(`INSERT INTO refund_case_events
      (refund_case_id,from_status,to_status,actor_account_id,actor_role,reason,refund_event_id)
      VALUES ($1,'PROCESSING','REFUNDED',NULL,'system','Verified refund applied',$2)`,
    [target.id, event.id]);
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
