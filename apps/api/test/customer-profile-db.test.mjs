import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { AuthRepository } from '../src/auth/repository.ts';
import { CustomerProfile, maskContact } from '../src/customer/profile.ts';

test('customer address, consent and deletion request stay scoped and audited', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const auth = new AuthRepository(pool);
  const profile = new CustomerProfile(pool);
  const ids = [];
  try {
    const accountA = await auth.createCustomerAccount(`qa+${randomUUID()}@example.invalid`, 'test-only-password-12345');
    ids.push(accountA);
    const accountB = await auth.createCustomerAccount(`qa+${randomUUID()}@example.invalid`, 'test-only-password-12345');
    ids.push(accountB);
    const buyerA = { accountId: accountA, role: 'customer' };
    const buyerB = { accountId: accountB, role: 'customer' };
    const addressId = await profile.addAddress(buyerA, accountA, {
      label: '시험 배송지', recipientName: '가상고객', phone: '010-0000-1234',
      postalCode: '00000', line1: '시험용 주소 1', line2: '가상', isDefault: true,
    });
    assert.equal((await profile.listAddresses(buyerA, accountA))[0].id, addressId);
    await assert.rejects(profile.listAddresses(buyerB, accountA));
    await assert.rejects(profile.addAddress(buyerB, accountA, {
      label: '침입', recipientName: '침입', phone: '010-0000-0000',
      postalCode: '00000', line1: '침입 주소', line2: '', isDefault: false,
    }));
    assert.equal(maskContact('010-0000-1234'), '***-***-1234');

    await profile.setPreferences(buyerA, accountA, { marketingEmail: true, marketingSms: false, push: false });
    assert.equal((await profile.getPreferences(buyerA, accountA)).marketingEmail, true);
    await assert.rejects(profile.getPreferences(buyerB, accountA));
    const deletion = await profile.requestDeletion(buyerA, accountA);
    assert.equal(deletion.status, 'requested');
    await assert.rejects(profile.requestDeletion(buyerA, accountA));
    const audit = await pool.query('SELECT action FROM audit_events WHERE actor_account_id = $1', [accountA]);
    assert.ok(audit.rows.some((row) => row.action === 'customer.address_add'));
    assert.ok(audit.rows.some((row) => row.action === 'customer.preferences_update'));
    assert.ok(audit.rows.some((row) => row.action === 'customer.deletion_request'));
  } finally {
    for (const accountId of ids) {
      await pool.query('DELETE FROM customer_addresses WHERE account_id = $1', [accountId]);
      await pool.query('DELETE FROM notification_preferences WHERE account_id = $1', [accountId]);
      await pool.query('DELETE FROM account_deletion_requests WHERE account_id = $1', [accountId]);
      await pool.query('DELETE FROM audit_events WHERE actor_account_id = $1', [accountId]);
      await pool.query('DELETE FROM auth_sessions WHERE account_id = $1', [accountId]);
      await pool.query('DELETE FROM account_roles WHERE account_id = $1', [accountId]);
      await pool.query('DELETE FROM account_identities WHERE account_id = $1', [accountId]);
      await pool.query('DELETE FROM accounts WHERE id = $1', [accountId]);
    }
    await pool.end();
  }
});
