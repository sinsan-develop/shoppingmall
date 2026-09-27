import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { ImageQuarantine } from '../src/catalog/image-quarantine.js';
import { qaNames, runQaFixture, validateQaRunId } from './qa-fixture.js';

export function qaBrowserNames(runId: string) {
  const id = validateQaRunId(runId);
  return { major: `qa-${id}-채소`, minor: `qa-${id}-고추`, title: `qa-${id}-햇고추` };
}

/** Reset only the browser-run product, its private bytes and then the run-scoped accounts. */
export async function resetQaBrowserFixture(runId: string, databaseUrl: string, uploadRoot: string) {
  const id = validateQaRunId(runId);
  if (new URL(databaseUrl).pathname !== '/shoppingmall') throw new Error('QA fixture is limited to shoppingmall database');
  const names = qaBrowserNames(id);
  const seller = qaNames(id);
  const store = new ImageQuarantine(uploadRoot);
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  let removedImages = 0;
  try {
    const client = await pool.connect();
    const staged: Awaited<ReturnType<ImageQuarantine['stageRemoval']>>[] = [];
    let committed = false;
    try {
      await client.query('BEGIN');
      const target = await client.query<{ product_id: string; revision_id: string; minor_id: string; major_id: string }>(
        `SELECT p.id AS product_id, r.id AS revision_id, c.id AS minor_id, major.id AS major_id
         FROM products p JOIN product_revisions r ON r.product_id=p.id
         JOIN sellers s ON s.id=p.seller_id
         JOIN product_categories c ON c.id=p.category_id
         JOIN product_categories major ON major.id=c.parent_id
         WHERE s.display_name=$1 AND c.name=$2 AND major.name=$3 AND r.title=$4`,
        [seller.sellerA, names.minor, names.major, names.title],
      );
      if (target.rows.length !== 1) throw new Error('Expected one exact browser QA product');
      const { product_id: productId, revision_id: revisionId, minor_id: minorId, major_id: majorId } = target.rows[0];
      const images = await client.query<{ object_key: string }>(
        'SELECT object_key FROM product_images WHERE revision_id=$1 ORDER BY id', [revisionId],
      );
      for (const image of images.rows) staged.push(await store.stageRemoval(image.object_key));
      await client.query('DELETE FROM product_publications WHERE product_id=$1 AND revision_id=$2', [productId, revisionId]);
      await client.query(`DELETE FROM stock_change_requests WHERE option_id IN
        (SELECT id FROM product_options WHERE revision_id=$1)`, [revisionId]);
      await client.query(`DELETE FROM inventory_levels WHERE option_id IN
        (SELECT id FROM product_options WHERE revision_id=$1)`, [revisionId]);
      await client.query('DELETE FROM product_images WHERE revision_id=$1', [revisionId]);
      await client.query('DELETE FROM product_options WHERE revision_id=$1', [revisionId]);
      await client.query('DELETE FROM product_revisions WHERE id=$1', [revisionId]);
      await client.query('DELETE FROM products WHERE id=$1', [productId]);
      await client.query('DELETE FROM product_categories WHERE id=$1', [minorId]);
      await client.query('DELETE FROM product_categories WHERE id=$1', [majorId]);
      await client.query('COMMIT');
      committed = true;
      for (const image of staged) { await image.purge(); removedImages++; }
    } catch (error) {
      if (!committed) {
        await client.query('ROLLBACK');
        for (const image of staged.reverse()) await image.restore();
      }
      throw error;
    } finally { client.release(); }
  } finally { await pool.end(); }
  const result = await runQaFixture('reset', id, databaseUrl);
  return { product: 1, images: removedImages, accounts: result?.accounts ?? 0 };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  resetQaBrowserFixture(process.env.QA_RUN_ID ?? '', process.env.DATABASE_URL ?? '',
    process.env.SHOPPINGMALL_UPLOAD_ROOT ?? '')
    .then((result) => { process.stdout.write(`${JSON.stringify(result)}\n`); })
    .catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : 'QA browser reset failed'}\n`); process.exitCode = 1; });
}
