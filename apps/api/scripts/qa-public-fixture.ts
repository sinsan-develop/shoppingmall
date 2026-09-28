import { pathToFileURL } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import { qaNames, runQaFixture, validateQaRunId } from './qa-fixture.js';

function productNames(runId: string) {
  return {
    major: `qa-${runId}-public-major`,
    minor: `qa-${runId}-public-minor`,
    title: `qa-${runId}-public-chili`,
  };
}

async function seedPublicProduct(client: PoolClient, runId: string, count: number) {
  const names = qaNames(runId);
  const product = productNames(runId);
  const seller = await client.query<{ id: string }>('SELECT id FROM sellers WHERE display_name=$1', [names.sellerA]);
  const sellerAccount = await client.query<{ account_id: string }>(
    'SELECT account_id FROM account_identities WHERE kind=$1 AND identifier=$2', ['email', names.emails[1]],
  );
  const adminAccount = await client.query<{ account_id: string }>(
    'SELECT account_id FROM account_identities WHERE kind=$1 AND identifier=$2', ['email', names.emails[4]],
  );
  if (seller.rows.length !== 1 || sellerAccount.rows.length !== 1 || adminAccount.rows.length !== 1) {
    throw new Error('QA account fixture missing');
  }
  const majorId = (await client.query<{ id: string }>(
    'INSERT INTO product_categories(name) VALUES ($1) RETURNING id', [product.major],
  )).rows[0].id;
  const minorId = (await client.query<{ id: string }>(
    'INSERT INTO product_categories(parent_id,name) VALUES ($1,$2) RETURNING id', [majorId, product.minor],
  )).rows[0].id;
  const productId = (await client.query<{ id: string }>(
    'INSERT INTO products(seller_id,category_id) VALUES ($1,$2) RETURNING id', [seller.rows[0].id, minorId],
  )).rows[0].id;
  const revisionId = (await client.query<{ id: string }>(
    `INSERT INTO product_revisions(product_id,version,title,description,origin_label,shipping_mode,status,proposed_by_account_id,
      reviewed_by_account_id,reviewed_at)
     VALUES ($1,1,$2,'실제 브라우저 공개 화면 검증용 가상 고추','경남 진주','seller_direct','approved',$3,$4,now()) RETURNING id`,
    [productId, product.title, sellerAccount.rows[0].account_id, adminAccount.rows[0].account_id],
  )).rows[0].id;
  const optionId = (await client.query<{ id: string }>(
    'INSERT INTO product_options(revision_id,name,price_won,display_order) VALUES ($1,$2,$3,0) RETURNING id',
    [revisionId, '500g', 23000],
  )).rows[0].id;
  await client.query('INSERT INTO inventory_levels(option_id,on_hand_quantity,sellable_quantity) VALUES ($1,5,5)', [optionId]);
  await client.query(
    'INSERT INTO product_publications(product_id,revision_id,published_by_account_id) VALUES ($1,$2,$3)',
    [productId, revisionId, adminAccount.rows[0].account_id],
  );
  for (let index = 1; index < count; index++) {
    const extraProductId = (await client.query<{ id: string }>(
      'INSERT INTO products(seller_id,category_id) VALUES ($1,$2) RETURNING id',
      [seller.rows[0].id, minorId],
    )).rows[0].id;
    const extraRevisionId = (await client.query<{ id: string }>(
      `INSERT INTO product_revisions(product_id,version,title,description,origin_label,shipping_mode,status,
        proposed_by_account_id,reviewed_by_account_id,reviewed_at)
       VALUES ($1,1,$2,'검색 페이지 QA용 가상 상품','경남 진주','seller_direct','approved',$3,$4,now()) RETURNING id`,
      [extraProductId, `${product.title}-extra-${String(index).padStart(2, '0')}`,
        sellerAccount.rows[0].account_id, adminAccount.rows[0].account_id],
    )).rows[0].id;
    const extraOptionId = (await client.query<{ id: string }>(
      'INSERT INTO product_options(revision_id,name,price_won,display_order) VALUES ($1,$2,$3,0) RETURNING id',
      [extraRevisionId, '500g', 23000 + index],
    )).rows[0].id;
    await client.query('INSERT INTO inventory_levels(option_id,on_hand_quantity,sellable_quantity) VALUES ($1,5,5)',
      [extraOptionId]);
    await client.query(
      'INSERT INTO product_publications(product_id,revision_id,published_by_account_id) VALUES ($1,$2,$3)',
      [extraProductId, extraRevisionId, adminAccount.rows[0].account_id],
    );
  }
  return { productId, revisionId, majorId, title: product.title, count };
}

async function resetPublicProduct(client: PoolClient, runId: string) {
  const names = qaNames(runId);
  const product = productNames(runId);
  const target = await client.query<{ id: string }>(
    `SELECT DISTINCT p.id FROM products p
     JOIN sellers s ON s.id=p.seller_id
     JOIN product_categories c ON c.id=p.category_id
     WHERE s.display_name=$1 AND c.name=$2`,
    [names.sellerA, product.minor],
  );
  for (const row of target.rows) {
    await client.query('DELETE FROM product_publications WHERE product_id=$1', [row.id]);
    await client.query(`DELETE FROM stock_change_requests WHERE option_id IN
      (SELECT o.id FROM product_options o JOIN product_revisions r ON r.id=o.revision_id WHERE r.product_id=$1)`, [row.id]);
    await client.query('DELETE FROM product_images WHERE revision_id IN (SELECT id FROM product_revisions WHERE product_id=$1)',
      [row.id]);
    await client.query(
      `DELETE FROM inventory_levels WHERE option_id IN
        (SELECT o.id FROM product_options o JOIN product_revisions r ON r.id=o.revision_id WHERE r.product_id=$1)`,
      [row.id],
    );
    await client.query('DELETE FROM product_options WHERE revision_id IN (SELECT id FROM product_revisions WHERE product_id=$1)',
      [row.id]);
    await client.query('DELETE FROM product_revisions WHERE product_id=$1', [row.id]);
    await client.query('DELETE FROM products WHERE id=$1', [row.id]);
  }
  await client.query(
    'DELETE FROM product_categories WHERE name=$1 AND parent_id IN (SELECT id FROM product_categories WHERE name=$2)',
    [product.minor, product.major],
  );
  await client.query('DELETE FROM product_categories WHERE name=$1 AND parent_id IS NULL', [product.major]);
}

export async function runQaPublicFixture(action: 'seed' | 'reset', runId: string, databaseUrl: string,
  password?: string, productCount = 1) {
  const id = validateQaRunId(runId);
  if (new URL(databaseUrl).pathname !== '/shoppingmall') throw new Error('QA fixture is limited to shoppingmall database');
  if (action !== 'seed' && action !== 'reset') throw new Error('Invalid QA action');
  if (!Number.isInteger(productCount) || productCount < 1 || productCount > 25) {
    throw new Error('QA product count must be 1..25');
  }
  if (action === 'seed') await runQaFixture('seed', id, databaseUrl, password);
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = action === 'seed' ? await seedPublicProduct(client, id, productCount) : await resetPublicProduct(client, id);
      await client.query('COMMIT');
      if (action === 'reset') await runQaFixture('reset', id, databaseUrl);
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      if (action === 'seed') await runQaFixture('reset', id, databaseUrl);
      throw error;
    } finally { client.release(); }
  } finally { await pool.end(); }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const action = process.argv[2];
  if (action !== 'seed' && action !== 'reset') throw new Error('usage: qa-public-fixture.ts seed|reset');
  runQaPublicFixture(action, process.env.QA_RUN_ID ?? '', process.env.DATABASE_URL ?? '', process.env.QA_FIXTURE_PASSWORD,
    action === 'seed' ? Number(process.env.QA_PUBLIC_PRODUCT_COUNT ?? '1') : 1)
    .then((result) => { process.stdout.write(`${JSON.stringify(result ?? { reset: true })}\n`); })
    .catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : 'QA public fixture failed'}\n`); process.exitCode = 1; });
}
