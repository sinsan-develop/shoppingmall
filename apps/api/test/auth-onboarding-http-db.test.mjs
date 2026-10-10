import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { provisionInitialAdmin } from '../src/auth/onboarding.ts';
import { setQaAuthSink } from '../src/auth/delivery.ts';
import { AuthRepository } from '../src/auth/repository.ts';

const systemId = process.env.AUTH_ADMIN_TEST_DB_SYSTEM_ID;

test('admin setup HTTP is owner-link only, Origin protected, and creates no session cookie', {
  skip: !systemId,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall_auth_admin_1010');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const fixtureLock = await pool.connect();
  await fixtureLock.query("SELECT pg_advisory_lock(hashtext('auth-admin-qa-fixture'))");
  const httpSources = ['127.0.0.1', '::ffff:127.0.0.1', '::1'].map((address) =>
    createHmac('sha256', process.env.AUTH_AUDIT_HMAC_KEY).update(`source:${address}`).digest('hex'));
  await pool.query("DELETE FROM auth_security_events WHERE purpose='admin_setup' AND source_hash=ANY($1::text[])",
    [httpSources]);
  const id = await pool.query('SELECT system_identifier::text AS id FROM pg_control_system()');
  assert.equal(id.rows[0].id, systemId);
  const email = `admin-http+${randomUUID()}@example.invalid`;
  const password = 'isolated-http-password-123';
  const source = `qa-${randomUUID()}`;
  const previous = [process.env.AUTH_DELIVERY_MODE, process.env.APP_ENV,
    process.env.API_HOST, process.env.AUTH_LINK_ORIGIN];
  process.env.AUTH_DELIVERY_MODE = 'mock';
  process.env.APP_ENV = 'development';
  process.env.API_HOST = '127.0.0.1';
  process.env.AUTH_LINK_ORIGIN = 'http://127.0.0.1:9091';
  const messages = [];
  let app;
  try {
    await provisionInitialAdmin(pool, { email, ownerConfirmed: true, operatorId: 'qa-operator',
      source, now: new Date(), mockSink: async (message) => messages.push(message) });
    const token = new URL(messages[0].url).hash.slice('#token='.length);
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const post = (origin, body) => fetch(`${base}/auth/admin-setup/complete`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify(body),
    });
    assert.equal((await post('https://untrusted.invalid', { token, password })).status, 403);
    const invalid = await post('http://127.0.0.1:9091', { token: 'bad', password, role: 'admin' });
    assert.equal(invalid.status, 401);
    const ok = await post('http://127.0.0.1:9091', { token, password, role: 'seller' });
    assert.equal(ok.status, 201);
    assert.equal(ok.headers.get('set-cookie'), null);
    assert.deepEqual(await ok.json(), { status: 'ok' });
    assert.equal((await post('http://127.0.0.1:9091', { token, password })).status, 401);
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:9091' },
      body: JSON.stringify({ email, password, role: 'admin' }),
    });
    assert.equal(login.status, 201);
    assert.match(login.headers.get('set-cookie') ?? '', /HttpOnly/);
  } finally {
    if (app) await app.close();
    const account = await pool.query("SELECT account_id FROM account_identities WHERE kind='email' AND identifier=$1", [email]);
    const accountId = account.rows[0]?.account_id;
    await pool.query('DELETE FROM auth_action_tokens WHERE email=$1', [email]);
    if (accountId) {
      await pool.query('DELETE FROM audit_events WHERE actor_account_id=$1', [accountId]);
      await pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM account_roles WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM account_identities WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM accounts WHERE id=$1', [accountId]);
    }
    await pool.query("DELETE FROM auth_security_events WHERE purpose='admin_setup' AND source_hash=ANY($1::text[])",
      [httpSources]);
    await fixtureLock.query("SELECT pg_advisory_unlock(hashtext('auth-admin-qa-fixture'))");
    fixtureLock.release();
    await pool.end();
    for (const [key, value] of Object.entries({ AUTH_DELIVERY_MODE: previous[0], APP_ENV: previous[1],
      API_HOST: previous[2], AUTH_LINK_ORIGIN: previous[3] })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('seller application HTTP requires buyer session and only admin can review an existing seller', {
  skip: !systemId,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall_auth_admin_1010');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const fixtureLock = await pool.connect();
  await fixtureLock.query("SELECT pg_advisory_lock(hashtext('auth-admin-qa-fixture'))");
  const repository = new AuthRepository(pool);
  const password = 'isolated-seller-http-123';
  const customerEmail = `seller-http+${randomUUID()}@example.invalid`;
  const rejectedEmail = `seller-rejected-http+${randomUUID()}@example.invalid`;
  const adminEmail = `admin-seller-http+${randomUUID()}@example.invalid`;
  const accounts = [];
  let categoryId;
  let sellerId;
  let app;
  try {
    const customerId = await repository.createCustomerAccount(customerEmail, password);
    const rejectedId = await repository.createCustomerAccount(rejectedEmail, password);
    const adminId = await repository.createCustomerAccount(adminEmail, password);
    accounts.push(customerId, rejectedId, adminId);
    await pool.query("INSERT INTO account_roles (account_id,role) VALUES ($1,'admin')", [adminId]);
    const category = await pool.query('INSERT INTO seller_categories(name) VALUES ($1) RETURNING id',
      [`qa-http-${randomUUID()}`]);
    categoryId = category.rows[0].id;
    const seller = await pool.query('INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id',
      [categoryId, 'HTTP QA Seller']);
    sellerId = seller.rows[0].id;
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const post = (path, body, cookie, origin = 'http://127.0.0.1:9091') => fetch(`${base}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin, ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });
    const customerLogin = await post('/auth/login', { email: customerEmail, password, role: 'customer' });
    const adminLogin = await post('/auth/login', { email: adminEmail, password, role: 'admin' });
    const customerCookie = customerLogin.headers.get('set-cookie')?.split(';')[0];
    const adminCookie = adminLogin.headers.get('set-cookie')?.split(';')[0];
    assert.equal((await post('/auth/seller-applications', { displayName: 'HTTP QA Seller' })).status, 401);
    assert.equal((await post('/auth/seller-applications', { displayName: 'HTTP QA Seller' },
      customerCookie, 'https://untrusted.invalid')).status, 403);
    const applied = await post('/auth/seller-applications', { displayName: 'HTTP QA Seller', role: 'admin' }, customerCookie);
    assert.equal(applied.status, 201);
    const application = await applied.json();
    assert.equal(application.status, 'pending');
    assert.equal((await fetch(`${base}/catalog/seller/products`, { headers: { cookie: customerCookie } })).status, 403);
    assert.equal((await post('/auth/seller-applications', { displayName: 'Duplicate' }, customerCookie)).status, 409);
    assert.equal((await fetch(`${base}/auth/admin/seller-applications`, { headers: { cookie: customerCookie } })).status, 403);
    const listed = await fetch(`${base}/auth/admin/seller-applications`, { headers: { cookie: adminCookie } });
    assert.equal(listed.status, 200);
    assert.equal((await listed.json()).some((item) => item.id === application.id), true);
    assert.equal((await post(`/auth/admin/seller-applications/${application.id}/approve`, { sellerId }, customerCookie)).status, 403);
    const approved = await post(`/auth/admin/seller-applications/${application.id}/approve`, { sellerId }, adminCookie);
    assert.equal(approved.status, 201);
    assert.equal((await post(`/auth/admin/seller-applications/${application.id}/approve`, { sellerId }, adminCookie)).status, 409);
    const sellerLogin = await post('/auth/login', { email: customerEmail, password, role: 'seller', sellerId });
    assert.equal(sellerLogin.status, 201);
    const sellerCookie = sellerLogin.headers.get('set-cookie')?.split(';')[0];
    const me = await fetch(`${base}/auth/me`, { headers: { cookie: sellerCookie } });
    const sellerSession = await me.json();
    assert.deepEqual([sellerSession.role, sellerSession.sellerId], ['seller', sellerId]);
    assert.equal((await fetch(`${base}/catalog/seller/products`, { headers: { cookie: sellerCookie } })).status, 200);
    assert.equal((await post('/auth/login', { email: customerEmail, password,
      role: 'seller', sellerId: randomUUID() })).status, 401);
    const rejectedLogin = await post('/auth/login', { email: rejectedEmail, password, role: 'customer' });
    const rejectedCookie = rejectedLogin.headers.get('set-cookie')?.split(';')[0];
    const rejectionApplication = await post('/auth/seller-applications',
      { displayName: 'Second QA Seller' }, rejectedCookie);
    const rejectionId = (await rejectionApplication.json()).id;
    assert.equal((await post(`/auth/admin/seller-applications/${rejectionId}/reject`,
      { reason: 'Review needed' }, rejectedCookie)).status, 403);
    assert.equal((await post(`/auth/admin/seller-applications/${rejectionId}/reject`,
      { reason: 'Ownership not verified' }, adminCookie)).status, 201);
    assert.equal((await post(`/auth/admin/seller-applications/${rejectionId}/approve`,
      { sellerId }, adminCookie)).status, 409);
  } finally {
    if (app) await app.close();
    if (accounts.length) {
      await pool.query('DELETE FROM seller_applications WHERE account_id=ANY($1::uuid[])', [accounts]);
      await pool.query('DELETE FROM audit_events WHERE actor_account_id=ANY($1::uuid[])', [accounts]);
      await pool.query('DELETE FROM auth_sessions WHERE account_id=ANY($1::uuid[])', [accounts]);
      await pool.query('DELETE FROM account_roles WHERE account_id=ANY($1::uuid[])', [accounts]);
      await pool.query('DELETE FROM account_identities WHERE account_id=ANY($1::uuid[])', [accounts]);
      await pool.query('DELETE FROM accounts WHERE id=ANY($1::uuid[])', [accounts]);
    }
    if (sellerId) await pool.query('DELETE FROM sellers WHERE id=$1', [sellerId]);
    if (categoryId) await pool.query('DELETE FROM seller_categories WHERE id=$1', [categoryId]);
    await fixtureLock.query("SELECT pg_advisory_unlock(hashtext('auth-admin-qa-fixture'))");
    fixtureLock.release();
    await pool.end();
  }
});

test('customer signup HTTP keeps existing and unknown email responses equal and ignores role escalation', {
  skip: !systemId,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall_auth_admin_1010');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const email = `customer-http+${randomUUID()}@example.invalid`;
  const password = 'isolated-customer-http-123';
  const saved = [process.env.AUTH_DELIVERY_MODE, process.env.APP_ENV,
    process.env.API_HOST, process.env.AUTH_LINK_ORIGIN];
  process.env.AUTH_DELIVERY_MODE = 'mock';
  process.env.APP_ENV = 'development';
  process.env.API_HOST = '127.0.0.1';
  process.env.AUTH_LINK_ORIGIN = 'http://127.0.0.1:9091';
  const messages = [];
  const customerSources = ['127.0.0.1', '::ffff:127.0.0.1', '::1'].map((address) =>
    createHmac('sha256', process.env.AUTH_AUDIT_HMAC_KEY).update(`source:${address}`).digest('hex'));
  let app;
  try {
    await pool.query("DELETE FROM auth_security_events WHERE purpose='customer_signup' AND source_hash=ANY($1::text[])",
      [customerSources]);
    setQaAuthSink(async (message) => messages.push(message));
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const post = (path, body, origin = 'http://127.0.0.1:9091') => fetch(`${base}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify(body),
    });
    assert.equal((await post('/auth/customer-signup/start', { email }, 'https://untrusted.invalid')).status, 403);
    const start = await post('/auth/customer-signup/start', { email, role: 'admin' });
    assert.equal(start.status, 201);
    assert.deepEqual(await start.json(), { status: 'accepted' });
    assert.equal(messages.length, 1);
    const before = await pool.query("SELECT count(*)::int AS n FROM account_identities WHERE kind='email' AND identifier=$1", [email]);
    assert.equal(before.rows[0].n, 0);
    const token = new URL(messages[0].url).hash.slice('#token='.length);
    const invalid = await post('/auth/customer-signup/complete', { token: 'bad', password });
    assert.equal(invalid.status, 401);
    const complete = await post('/auth/customer-signup/complete', {
      token, password, role: 'admin', sellerId: randomUUID(),
    });
    assert.equal(complete.status, 201);
    assert.deepEqual(await complete.json(), { status: 'ok' });
    assert.equal(complete.headers.get('set-cookie'), null);
    assert.equal((await post('/auth/customer-signup/complete', { token, password })).status, 401);
    const duplicate = await post('/auth/customer-signup/start', { email });
    assert.equal(duplicate.status, 201);
    assert.deepEqual(await duplicate.json(), { status: 'accepted' });
    assert.equal(messages.length, 1);
    const customerLogin = await post('/auth/login', { email, password, role: 'customer' });
    assert.equal(customerLogin.status, 201);
    assert.equal((await post('/auth/login', { email, password, role: 'admin' })).status, 401);
    setQaAuthSink(undefined);
    assert.equal((await post('/auth/customer-signup/start', { email })).status, 503);
  } finally {
    setQaAuthSink(undefined);
    if (app) await app.close();
    const identity = await pool.query("SELECT account_id FROM account_identities WHERE kind='email' AND identifier=$1", [email]);
    const accountId = identity.rows[0]?.account_id;
    await pool.query('DELETE FROM auth_action_tokens WHERE email=$1', [email]);
    if (accountId) {
      await pool.query('DELETE FROM audit_events WHERE actor_account_id=$1', [accountId]);
      await pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM account_roles WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM account_identities WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM accounts WHERE id=$1', [accountId]);
    }
    await pool.query("DELETE FROM auth_security_events WHERE purpose='customer_signup' AND source_hash=ANY($1::text[])",
      [customerSources]);
    await pool.end();
    for (const [key, value] of Object.entries({ AUTH_DELIVERY_MODE: saved[0], APP_ENV: saved[1],
      API_HOST: saved[2], AUTH_LINK_ORIGIN: saved[3] })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
