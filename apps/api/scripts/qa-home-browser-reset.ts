import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { qaNames, validateQaRunId } from './qa-fixture.js';

export async function resetQaHomeBrowserRun(runId: string, databaseUrl: string, publicationId: string) {
  const id = validateQaRunId(runId);
  if (new URL(databaseUrl).pathname !== '/shoppingmall') throw new Error('QA reset is limited to shoppingmall database');
  if (!/^[0-9a-f-]{36}$/i.test(publicationId)) throw new Error('Expected QA publication ID required');
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const account = await client.query<{ account_id: string }>(
        'SELECT account_id FROM account_identities WHERE kind=$1 AND identifier=$2',
        ['email', qaNames(id).emails[4]],
      );
      const draft = await client.query<{ version: number; updated_by_account_id: string | null }>(
        'SELECT version,updated_by_account_id FROM home_content_draft WHERE id=1 FOR UPDATE',
      );
      const current = await client.query<{ publication_id: string | null }>(
        'SELECT publication_id FROM home_content_current WHERE id=1 FOR UPDATE',
      );
      const publications = await client.query<{ id: string }>(
        'SELECT id FROM home_content_publications WHERE published_by_account_id=$1',
        [account.rows[0]?.account_id ?? null],
      );
      if (account.rows.length !== 1 || draft.rows.length !== 1 || draft.rows[0].version !== 2
        || draft.rows[0].updated_by_account_id !== account.rows[0].account_id
        || current.rows.length !== 1 || current.rows[0].publication_id !== publicationId
        || publications.rows.length !== 1 || publications.rows[0].id !== publicationId) {
        throw new Error('QA home state changed; refusing reset');
      }
      await client.query('UPDATE home_content_current SET publication_id=NULL WHERE id=1');
      await client.query(
        'UPDATE home_content_draft SET version=1,payload=$1,updated_by_account_id=NULL WHERE id=1',
        [{ menu: [], events: [], recommendations: [] }],
      );
      await client.query('DELETE FROM home_content_publications WHERE id=$1 AND published_by_account_id=$2',
        [publicationId, account.rows[0].account_id]);
      await client.query('COMMIT');
      return { reset: true, runId: id, publicationId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  resetQaHomeBrowserRun(process.env.QA_RUN_ID ?? '', process.env.DATABASE_URL ?? '',
    process.env.QA_HOME_PUBLICATION_ID ?? '')
    .then((result) => { process.stdout.write(`${JSON.stringify(result)}\n`); })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : 'QA home reset failed'}\n`);
      process.exitCode = 1;
    });
}
