import { pathToFileURL } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import { qaNames, runQaFixture, validateQaRunId } from './qa-fixture.js';

function productNames(runId: string) {
  return { major: `qa-${runId}-major`, minor: `qa-${runId}-minor`, title: `qa-${runId}-review-chili` };
}

async function seedProduct(client: PoolClient, runId: string) {
  const names = qaNames(runId);
  const product = productNames(runId);
  const seller = await client.query<{ id: string }>('SELECT id FROM sellers WHERE display_name=$1', [names.sellerA]);
  const account = await client.query<{ account_id: string }>(
    'SELECT account_id FROM account_identities WHERE kind=$1 AND identifier=$2', ['email', names.emails[1]],
  );
  if (seller.rows.length !== 1 || account.rows.length !== 1) throw new Error('QA seller fixture missing');
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
    `INSERT INTO product_revisions(product_id,version,title,description,origin_label,shipping_mode,status,proposed_by_account_id)
     VALUES ($1,1,$2,'브라우저 심사 가상 상품','경남 진주','seller_direct','pending',$3) RETURNING id`,
    [productId, product.title, account.rows[0].account_id],
  )).rows[0].id;
  await client.query('INSERT INTO product_options(revision_id,name,price_won,display_order) VALUES ($1,$2,$3,0)',
    [revisionId, '500g', 23000]);
  // Metadata only: this key has no image bytes and must never become a public asset.
  await client.query(`INSERT INTO product_images(revision_id,object_key,purpose,mime_type,size_bytes,display_order)
    VALUES ($1,$2,'thumbnail','image/webp',100,0)`, [revisionId, `quarantine/qa-${runId}-metadata-only`]);
  return { productId, revisionId, adminEmail: names.emails[4] };
}

async function resetProduct(client: PoolClient, runId: string) {
  const names = qaNames(runId);
  const product = productNames(runId);
  const target = await client.query<{ id: string; revision_id: string }>(
    `SELECT p.id,r.id AS revision_id FROM products p
     JOIN product_revisions r ON r.product_id=p.id
     JOIN sellers s ON s.id=p.seller_id
     JOIN product_categories c ON c.id=p.category_id
     WHERE s.display_name=$1 AND c.name=$2 AND r.title=$3`,
    [names.sellerA, product.minor, product.title],
  );
  for (const row of target.rows) {
    await client.query('DELETE FROM product_images WHERE revision_id=$1', [row.revision_id]);
    await client.query('DELETE FROM product_options WHERE revision_id=$1', [row.revision_id]);
    await client.query('DELETE FROM product_revisions WHERE id=$1', [row.revision_id]);
    await client.query('DELETE FROM products WHERE id=$1', [row.id]);
  }
  await client.query('DELETE FROM product_categories WHERE name=$1 AND parent_id IN (SELECT id FROM product_categories WHERE name=$2)',
    [product.minor, product.major]);
  await client.query('DELETE FROM product_categories WHERE name=$1', [product.major]);
}

export async function runQaReviewFixture(action: 'seed' | 'reset', runId: string, databaseUrl: string, password?: string) {
  const id = validateQaRunId(runId);
  if (new URL(databaseUrl).pathname !== '/shoppingmall') throw new Error('QA fixture is limited to shoppingmall database');
  if (action !== 'seed' && action !== 'reset') throw new Error('Invalid QA action');
  if (action === 'seed') await runQaFixture('seed', id, databaseUrl, password);
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = action === 'seed' ? await seedProduct(client, id) : await resetProduct(client, id);
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
  if (action !== 'seed' && action !== 'reset') throw new Error('usage: qa-review-fixture.ts seed|reset');
  runQaReviewFixture(action, process.env.QA_RUN_ID ?? '', process.env.DATABASE_URL ?? '', process.env.QA_FIXTURE_PASSWORD)
    .then((result) => { process.stdout.write(`${JSON.stringify(result)}\n`); })
    .catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : 'QA review fixture failed'}\n`); process.exitCode = 1; });
}
