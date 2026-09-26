import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { AuthRepository } from '../src/auth/repository.ts';
import { CatalogTaxonomy } from '../src/catalog/taxonomy.ts';

test('only an admin creates two-level product and seller classifications', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const auth = new AuthRepository(pool);
  const taxonomy = new CatalogTaxonomy(pool);
  const suffix = randomUUID().slice(0, 8);
  let accountId;
  let major;
  let minor;
  let sellerCategory;
  let seller;
  try {
    accountId = await auth.createCustomerAccount(`qa+${randomUUID()}@example.invalid`, 'test-only-password-12345');
    await pool.query('INSERT INTO account_roles (account_id, role) VALUES ($1, $2)', [accountId, 'admin']);
    const admin = { accountId, role: 'admin' };
    const customer = { accountId, role: 'customer' };
    await assert.rejects(taxonomy.createMajor(customer, `과일-${suffix}`));
    major = await taxonomy.createMajor(admin, `과일-${suffix}`);
    minor = await taxonomy.createMinor(admin, major, `베리-${suffix}`);
    await assert.rejects(taxonomy.createMinor(admin, minor, `3단계-${suffix}`));
    await assert.rejects(taxonomy.createMajor(admin, `과일-${suffix}`));
    sellerCategory = await taxonomy.createSellerCategory(admin, `생산자-${suffix}`);
    seller = await taxonomy.registerSeller(admin, sellerCategory, `시험 판매자-${suffix}`);
    const record = await pool.query('SELECT category_id FROM sellers WHERE id = $1', [seller]);
    assert.equal(record.rows[0].category_id, sellerCategory);
    const audit = await pool.query('SELECT count(*)::int AS total FROM audit_events WHERE actor_account_id = $1', [accountId]);
    assert.equal(audit.rows[0].total, 4);
  } finally {
    if (seller) await pool.query('DELETE FROM sellers WHERE id = $1', [seller]);
    if (minor) await pool.query('DELETE FROM product_categories WHERE id = $1', [minor]);
    if (major) await pool.query('DELETE FROM product_categories WHERE id = $1', [major]);
    if (sellerCategory) await pool.query('DELETE FROM seller_categories WHERE id = $1', [sellerCategory]);
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
