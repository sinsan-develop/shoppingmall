import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { AuthRepository } from '../src/auth/repository.ts';

test('email login uses persisted roles, scoped sessions and explicit role switching', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repository = new AuthRepository(pool);
  const email = `qa+${randomUUID()}@example.invalid`;
  const password = 'test-only-password-12345';
  let accountId;
  try {
    accountId = await repository.createCustomerAccount(email.toUpperCase(), password);
    await assert.rejects(repository.createCustomerAccount(email, password));
    await assert.rejects(repository.loginEmail(email, 'wrong-password'));

    const session = await repository.loginEmail(email, password);
    assert.equal((await repository.getSession(session.token))?.accountId, accountId);
    assert.equal((await repository.getSession(session.token))?.role, 'customer');
    assert.equal(await repository.getSession('invalid-token'), undefined);
    await assert.rejects(repository.switchRole(session.token, 'admin'));

    await pool.query(
      'INSERT INTO account_roles (account_id, role) VALUES ($1, $2)',
      [accountId, 'admin'],
    );
    await assert.rejects(repository.loginEmail(email, password, 'seller'));
    const directAdmin = await repository.loginEmail(email, password, 'admin');
    assert.equal((await repository.getSession(directAdmin.token))?.role, 'admin');
    await repository.logout(directAdmin.token);
    const admin = await repository.switchRole(session.token, 'admin');
    assert.equal((await repository.getSession(admin.token))?.role, 'admin');
    assert.equal(await repository.getSession(session.token), undefined);
    await repository.logout(admin.token);
    assert.equal(await repository.getSession(admin.token), undefined);
    const audit = await pool.query(
      'SELECT action, active_role FROM audit_events WHERE actor_account_id = $1 ORDER BY occurred_at, id',
      [accountId],
    );
    assert.ok(audit.rows.some((row) => row.action === 'auth.login' && row.active_role === 'customer'));
    assert.ok(audit.rows.some((row) => row.action === 'auth.switch_role' && row.active_role === 'admin'));
    assert.ok(audit.rows.some((row) => row.action === 'auth.logout' && row.active_role === 'admin'));
  } finally {
    if (accountId) {
      await pool.query('DELETE FROM audit_events WHERE actor_account_id = $1', [accountId]);
      await pool.query('DELETE FROM auth_sessions WHERE account_id = $1', [accountId]);
      await pool.query('DELETE FROM account_roles WHERE account_id = $1', [accountId]);
      await pool.query('DELETE FROM account_identities WHERE account_id = $1', [accountId]);
      await pool.query('DELETE FROM accounts WHERE id = $1', [accountId]);
    }
    await pool.end();
  }
});
