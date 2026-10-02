import { Pool } from 'pg';
import { AuthRepository } from '../src/auth/repository.js';

const action = process.argv[2];
const runId = process.env.QA_RUN_ID;
const databaseUrl = process.env.DATABASE_URL;
if (!['seed', 'reset'].includes(action) || !runId || !/^[0-9a-f]{8}$/i.test(runId) || !databaseUrl ||
    new URL(databaseUrl).pathname !== '/shoppingmall_s31_reservation_ui_1002') {
  throw new Error('Exact isolated QA database, run ID and seed/reset action required');
}
const password = process.env.QA_FIXTURE_PASSWORD;
if (action === 'seed' && (!password || password.length < 12)) throw new Error('QA password required');
const pool = new Pool({ connectionString: databaseUrl });
const prefix = `qa-${runId}-reservation-ui`;
const emails = ['customer', 'customer2', 'seller', 'admin'].map((role) => `qa+${runId}-reservation-${role}@example.invalid`);

async function accountIds() {
  const result = await pool.query<{ account_id: string }>(
    `SELECT account_id FROM account_identities WHERE kind='email' AND identifier=ANY($1::text[])`, [emails]);
  return result.rows.map((row) => row.account_id);
}

async function reset() {
  const accounts = await accountIds();
  const seller = await pool.query<{ id: string; category_id: string }>(
    'SELECT id,category_id FROM sellers WHERE display_name=$1', [prefix]);
  const product = seller.rows[0] ? await pool.query<{ id: string; category_id: string }>(
    'SELECT id,category_id FROM products WHERE seller_id=$1', [seller.rows[0].id]) : { rows: [] };
  if (product.rows[0]) {
    const id = product.rows[0].id;
    const options = await pool.query<{ id: string }>(
      `SELECT o.id FROM product_options o JOIN product_revisions r ON r.id=o.revision_id
       WHERE r.product_id=$1`, [id]);
    const optionIds = options.rows.map((row) => row.id);
    if (accounts.length) {
      await pool.query('DELETE FROM customer_cart_items WHERE account_id=ANY($1::uuid[])', [accounts]);
      await pool.query('DELETE FROM checkout_reservation_lines WHERE reservation_id IN (SELECT id FROM checkout_reservations WHERE account_id=ANY($1::uuid[]))', [accounts]);
      await pool.query('DELETE FROM checkout_reservations WHERE account_id=ANY($1::uuid[])', [accounts]);
    }
    await pool.query('DELETE FROM inventory_deferred_stock_targets WHERE option_id=ANY($1::uuid[])', [optionIds]);
    await pool.query('DELETE FROM stock_change_requests WHERE option_id=ANY($1::uuid[])', [optionIds]);
    await pool.query('DELETE FROM product_sale_stop_requests WHERE product_id=$1', [id]);
    await pool.query('DELETE FROM product_publications WHERE product_id=$1', [id]);
    await pool.query('DELETE FROM inventory_levels WHERE option_id=ANY($1::uuid[])', [optionIds]);
    await pool.query('DELETE FROM product_options WHERE id=ANY($1::uuid[])', [optionIds]);
    await pool.query('DELETE FROM product_revisions WHERE product_id=$1', [id]);
    await pool.query('DELETE FROM products WHERE id=$1', [id]);
    await pool.query('DELETE FROM product_categories WHERE id=$1', [product.rows[0].category_id]);
  }
  if (accounts.length) {
    await pool.query('DELETE FROM audit_events WHERE actor_account_id=ANY($1::uuid[])', [accounts]);
    await pool.query('DELETE FROM auth_sessions WHERE account_id=ANY($1::uuid[])', [accounts]);
    await pool.query('DELETE FROM account_roles WHERE account_id=ANY($1::uuid[])', [accounts]);
    await pool.query('DELETE FROM account_identities WHERE account_id=ANY($1::uuid[])', [accounts]);
    await pool.query('DELETE FROM accounts WHERE id=ANY($1::uuid[])', [accounts]);
  }
  if (seller.rows[0]) {
    await pool.query('DELETE FROM sellers WHERE id=$1', [seller.rows[0].id]);
    await pool.query('DELETE FROM seller_categories WHERE id=$1', [seller.rows[0].category_id]);
  }
}

async function seed() {
  if ((await accountIds()).length) throw new Error('QA run already exists');
  const auth = new AuthRepository(pool);
  const [customer, secondCustomer, sellerAccount, admin] = await Promise.all(emails.map((email) =>
    auth.createCustomerAccount(email, password!)));
  const sellerCategory = (await pool.query(
    'INSERT INTO seller_categories(name) VALUES ($1) RETURNING id', [prefix])).rows[0].id;
  const seller = (await pool.query(
    'INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id',
    [sellerCategory, prefix])).rows[0].id;
  await pool.query('INSERT INTO account_roles(account_id,role,seller_id) VALUES ($1,$2,$3)',
    [sellerAccount, 'seller', seller]);
  await pool.query('INSERT INTO account_roles(account_id,role) VALUES ($1,$2)', [admin, 'admin']);
  const category = (await pool.query('INSERT INTO product_categories(name) VALUES ($1) RETURNING id',
    [prefix])).rows[0].id;
  const product = (await pool.query('INSERT INTO products(seller_id,category_id) VALUES ($1,$2) RETURNING id',
    [seller, category])).rows[0].id;
  const revision = (await pool.query(
    `INSERT INTO product_revisions(product_id,version,title,description,origin_label,shipping_mode,
     status,proposed_by_account_id,reviewed_by_account_id,reviewed_at)
     VALUES ($1,1,$2,'시험용 고추','시험 산지','seller_direct','approved',$3,$4,now()) RETURNING id`,
    [product, `${prefix}-고추`, sellerAccount, admin])).rows[0].id;
  const option = (await pool.query('INSERT INTO product_options(revision_id,name,price_won) VALUES ($1,$2,23000) RETURNING id',
    [revision, '500g'])).rows[0].id;
  await pool.query('INSERT INTO inventory_levels(option_id,on_hand_quantity,sellable_quantity) VALUES ($1,5,5)', [option]);
  await pool.query('INSERT INTO product_publications(product_id,revision_id,published_by_account_id) VALUES ($1,$2,$3)',
    [product, revision, admin]);
  await pool.query('INSERT INTO customer_cart_items(account_id,option_id,quantity) VALUES ($1,$2,2)', [customer, option]);
  await pool.query('INSERT INTO customer_cart_items(account_id,option_id,quantity) VALUES ($1,$2,4)', [secondCustomer, option]);
  process.stdout.write(JSON.stringify({ runId, emails, product, option }) + '\n');
}

try {
  if (action === 'seed') await seed();
  else { await reset(); process.stdout.write(`reset ${runId}\n`); }
} finally { await pool.end(); }
