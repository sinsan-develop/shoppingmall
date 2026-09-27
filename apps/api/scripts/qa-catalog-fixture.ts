import { pathToFileURL } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import { qaNames, runQaFixture, validateQaRunId } from './qa-fixture.js';

/** Synthetic values only: never treat these prices or stock as a sales launch decision. */
export const catalogQaSpecs = [
  { item: '고추', major: '채소', seller: 'sellerA', shippingMode: 'seller_direct', priceWon: 23000 },
  { item: '고춧가루', major: '가공식품', seller: 'owool', shippingMode: 'owool_fulfillment', priceWon: 18000 },
  { item: '양파', major: '채소', seller: 'sellerA', shippingMode: 'seller_direct', priceWon: 12000 },
  { item: '마늘', major: '채소', seller: 'sellerB', shippingMode: 'seller_direct', priceWon: 16000 },
  { item: '블루베리', major: '과일', seller: 'sellerB', shippingMode: 'seller_direct', priceWon: 28000 },
] as const;

function name(runId: string, suffix: string) { return `qa-${runId}-${suffix}`; }

async function seedCatalog(client: PoolClient, runId: string) {
  const names = qaNames(runId);
  const admin = await client.query<{ account_id: string }>(
    'SELECT account_id FROM account_identities WHERE kind=$1 AND identifier=$2', ['email', names.emails[4]],
  );
  if (admin.rowCount !== 1) throw new Error('QA admin missing');
  const sellers = {} as Record<(typeof catalogQaSpecs)[number]['seller'], { id: string; accountId: string }>;
  for (const [key, displayName, email] of [
    ['sellerA', names.sellerA, names.emails[1]],
    ['sellerB', names.sellerB, names.emails[2]],
    ['owool', names.owool, names.emails[3]],
  ] as const) {
    const result = await client.query<{ id: string; account_id: string }>(
      `SELECT s.id,a.account_id FROM sellers s JOIN account_roles role ON role.seller_id=s.id
       JOIN account_identities a ON a.account_id=role.account_id
       WHERE s.display_name=$1 AND a.kind='email' AND a.identifier=$2`, [displayName, email],
    );
    if (result.rowCount !== 1) throw new Error('QA seller missing');
    sellers[key] = { id: result.rows[0].id, accountId: result.rows[0].account_id };
  }
  const majorIds = new Map<string, string>();
  const minorIds = new Map<string, string>();
  for (const spec of catalogQaSpecs) {
    if (!majorIds.has(spec.major)) {
      const row = await client.query<{ id: string }>(
        'INSERT INTO product_categories(name) VALUES ($1) RETURNING id', [name(runId, spec.major)],
      );
      majorIds.set(spec.major, row.rows[0].id);
    }
    const row = await client.query<{ id: string }>(
      'INSERT INTO product_categories(parent_id,name) VALUES ($1,$2) RETURNING id',
      [majorIds.get(spec.major), name(runId, spec.item)],
    );
    minorIds.set(spec.item, row.rows[0].id);
  }
  for (const spec of catalogQaSpecs) {
    const seller = sellers[spec.seller];
    const product = await client.query<{ id: string }>(
      'INSERT INTO products(seller_id,category_id) VALUES ($1,$2) RETURNING id',
      [seller.id, minorIds.get(spec.item)],
    );
    const revision = await client.query<{ id: string }>(
      `INSERT INTO product_revisions(product_id,version,title,description,origin_label,shipping_mode,
        status,proposed_by_account_id,reviewed_by_account_id,reviewed_at)
       VALUES ($1,1,$2,$3,'가상 산지',$4,'approved',$5,$6,now()) RETURNING id`,
      [product.rows[0].id, name(runId, spec.item), 'QA 전용 가상 상품', spec.shippingMode,
        seller.accountId, admin.rows[0].account_id],
    );
    const option = await client.query<{ id: string }>(
      'INSERT INTO product_options(revision_id,name,price_won,display_order) VALUES ($1,$2,$3,0) RETURNING id',
      [revision.rows[0].id, '기본', spec.priceWon],
    );
    await client.query('INSERT INTO inventory_levels(option_id,on_hand_quantity,sellable_quantity) VALUES ($1,5,5)',
      [option.rows[0].id]);
    await client.query(
      'INSERT INTO product_publications(product_id,revision_id,published_by_account_id) VALUES ($1,$2,$3)',
      [product.rows[0].id, revision.rows[0].id, admin.rows[0].account_id],
    );
  }
  return { products: catalogQaSpecs.length, sellers: 3, virtual: true };
}

async function resetCatalog(client: PoolClient, runId: string) {
  const names = qaNames(runId);
  const titles = catalogQaSpecs.map((spec) => name(runId, spec.item));
  const products = await client.query<{ product_id: string; revision_id: string }>(
    `SELECT p.id AS product_id,r.id AS revision_id FROM products p
     JOIN product_revisions r ON r.product_id=p.id JOIN sellers s ON s.id=p.seller_id
     WHERE r.title=ANY($1::text[]) AND s.display_name=ANY($2::text[])`,
    [titles, [names.sellerA, names.sellerB, names.owool]],
  );
  if (products.rowCount === 0) {
    const categoryNames = [...titles, ...new Set(catalogQaSpecs.map((spec) => name(runId, spec.major)))];
    const categories = await client.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM product_categories WHERE name=ANY($1::text[])', [categoryNames],
    );
    if (categories.rows[0].total !== 0) throw new Error('QA categories remain without expected products');
    return { products: 0 };
  }
  if (products.rowCount !== catalogQaSpecs.length ||
      new Set(products.rows.map((row) => row.product_id)).size !== catalogQaSpecs.length) {
    throw new Error('Expected five exact QA products');
  }
  const productIds = products.rows.map((row) => row.product_id);
  const revisionIds = products.rows.map((row) => row.revision_id);
  const protectedRows = await client.query<{ revisions: number; images: number }>(
    `SELECT (SELECT count(*)::int FROM product_revisions WHERE product_id=ANY($1::uuid[])) AS revisions,
            (SELECT count(*)::int FROM product_images WHERE revision_id=ANY($2::uuid[])) AS images`,
    [productIds, revisionIds],
  );
  if (protectedRows.rows[0].revisions !== catalogQaSpecs.length || protectedRows.rows[0].images !== 0) {
    throw new Error('QA catalog has additional revisions or images requiring separate cleanup');
  }
  await client.query('DELETE FROM product_publications WHERE product_id=ANY($1::uuid[])', [productIds]);
  await client.query(`DELETE FROM stock_change_requests WHERE option_id IN
    (SELECT id FROM product_options WHERE revision_id=ANY($1::uuid[]))`, [revisionIds]);
  await client.query(`DELETE FROM inventory_levels WHERE option_id IN
    (SELECT id FROM product_options WHERE revision_id=ANY($1::uuid[]))`, [revisionIds]);
  await client.query('DELETE FROM product_options WHERE revision_id=ANY($1::uuid[])', [revisionIds]);
  await client.query('DELETE FROM product_revisions WHERE id=ANY($1::uuid[])', [revisionIds]);
  await client.query('DELETE FROM products WHERE id=ANY($1::uuid[])', [productIds]);
  await client.query('DELETE FROM product_categories WHERE name=ANY($1::text[])', [titles]);
  await client.query('DELETE FROM product_categories WHERE name=ANY($1::text[])',
    [[...new Set(catalogQaSpecs.map((spec) => name(runId, spec.major)))]]);
  return { products: catalogQaSpecs.length };
}

export async function runQaCatalogFixture(action: 'seed' | 'reset', runId: string,
  databaseUrl: string, password?: string) {
  const id = validateQaRunId(runId);
  if (new URL(databaseUrl).pathname !== '/shoppingmall') throw new Error('QA fixture is limited to shoppingmall database');
  if (action !== 'seed' && action !== 'reset') throw new Error('Invalid QA action');
  if (action === 'seed') await runQaFixture('seed', id, databaseUrl, password);
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = action === 'seed' ? await seedCatalog(client, id) : await resetCatalog(client, id);
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
  if (action !== 'seed' && action !== 'reset') throw new Error('usage: qa-catalog-fixture.ts seed|reset');
  runQaCatalogFixture(action, process.env.QA_RUN_ID ?? '', process.env.DATABASE_URL ?? '',
    process.env.QA_FIXTURE_PASSWORD)
    .then((result) => { process.stdout.write(`${JSON.stringify(result)}\n`); })
    .catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : 'QA catalog fixture failed'}\n`); process.exitCode = 1; });
}
