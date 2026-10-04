import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { qaNames } from '../scripts/qa-fixture.ts';
import { runQaCatalogFixture } from '../scripts/qa-catalog-fixture.ts';
import { CheckoutReservations } from '../src/checkout/reservation-service.ts';
import { skipWithoutOrderSchema } from './order-schema-guard.mjs';

test('admin cancellation locks reservation before its options, matching order submission', {
  skip: !process.env.DATABASE_URL,
}, async (context) => {
  const runId = randomBytes(4).toString('hex');
  const applicationName = `qa-s33-cancel-${runId}`;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  const cancellingPool = new Pool({ connectionString: process.env.DATABASE_URL,
    application_name: applicationName, max: 1 });
  let seeded = false; let reservationId; let anchor;
  try {
    if (await skipWithoutOrderSchema(context, pool)) return;
    await runQaCatalogFixture('seed', runId, process.env.DATABASE_URL, 'test-only-password-12345');
    seeded = true;
    const names = qaNames(runId);
    const ids = (await pool.query(`SELECT identifier,account_id FROM account_identities
      WHERE identifier=ANY($1::text[])`, [names.emails])).rows;
    const buyerId = ids.find((row) => row.identifier === names.emails[0]).account_id;
    const adminId = ids.find((row) => row.identifier === names.emails[4]).account_id;
    const optionId = (await pool.query(`SELECT o.id FROM product_options o
      JOIN product_revisions r ON r.id=o.revision_id WHERE r.title=$1`,
    [`qa-${runId}-고추`])).rows[0].id;
    await pool.query('INSERT INTO customer_cart_items(account_id,option_id,quantity) VALUES ($1,$2,1)',
      [buyerId, optionId]);
    reservationId = (await new CheckoutReservations(pool).start(buyerId, randomUUID())).id;
    anchor = await pool.connect();
    await anchor.query('BEGIN');
    await anchor.query('SELECT id FROM checkout_reservations WHERE id=$1 FOR UPDATE', [reservationId]);
    const cancellation = new CheckoutReservations(cancellingPool).cancel(adminId, reservationId,
      'QA lock ordering');
    let waited = false; let optionLocked = false;
    try {
      const until = Date.now() + 3000;
      while (Date.now() < until) {
        const activity = await pool.query(`SELECT wait_event_type AS wait FROM pg_stat_activity
          WHERE application_name=$1 AND state='active'`, [applicationName]);
        if (activity.rows[0]?.wait === 'Lock') { waited = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      if (waited) {
        await anchor.query("SET LOCAL lock_timeout='300ms'");
        try {
          await anchor.query('SELECT id FROM product_options WHERE id=$1 FOR UPDATE', [optionId]);
          optionLocked = true;
        } catch (error) {
          if (error?.code !== '55P03') throw error;
        }
      }
    } finally {
      await anchor.query('ROLLBACK');
      anchor.release(); anchor = undefined;
    }
    assert.equal((await cancellation).status, 'CANCELLED');
    assert.equal(waited, true, 'admin cancellation must reach a reservation lock wait');
    assert.equal(optionLocked, true, 'reservation-first lock order must leave options free');
  } finally {
    if (anchor) { await anchor.query('ROLLBACK'); anchor.release(); }
    if (reservationId) {
      await pool.query('DELETE FROM checkout_reservation_lines WHERE reservation_id=$1', [reservationId]);
      await pool.query('DELETE FROM checkout_reservations WHERE id=$1', [reservationId]);
    }
    if (seeded) await runQaCatalogFixture('reset', runId, process.env.DATABASE_URL);
    await cancellingPool.end(); await pool.end();
  }
});
