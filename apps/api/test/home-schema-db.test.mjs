import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';

async function rejectsConstraint(client, sql, values, code) {
  await client.query('SAVEPOINT home_expected_constraint');
  try {
    await assert.rejects(client.query(sql, values), (error) => error.code === code);
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT home_expected_constraint');
    await client.query('RELEASE SAVEPOINT home_expected_constraint');
  }
}

test('home draft starts empty, stays singleton and validates version, JSON and actor', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const draft = await client.query('SELECT id,version,payload FROM home_content_draft');
    assert.deepEqual(draft.rows, [{ id: 1, version: 1, payload: { menu: [], events: [], recommendations: [] } }]);
    await rejectsConstraint(client, 'INSERT INTO home_content_draft(id) VALUES (2)', [], '23514');
    await rejectsConstraint(client, 'UPDATE home_content_draft SET version=0 WHERE id=1', [], '23514');
    await rejectsConstraint(client, 'UPDATE home_content_draft SET payload=$1 WHERE id=1', ['[]'], '23514');
    await rejectsConstraint(client, 'UPDATE home_content_draft SET updated_by_account_id=$1 WHERE id=1', [randomUUID()], '23503');
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});

test('home publications are historical rows and current pointer is a singleton foreign key', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT id,publication_id FROM home_content_current');
    assert.deepEqual(current.rows, [{ id: 1, publication_id: null }]);
    const account = await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id');
    const publication = await client.query(
      'INSERT INTO home_content_publications(payload,published_by_account_id) VALUES ($1,$2) RETURNING id',
      [{ menu: [], events: [], recommendations: [] }, account.rows[0].id],
    );
    await client.query('UPDATE home_content_current SET publication_id=$1 WHERE id=1', [publication.rows[0].id]);
    assert.equal((await client.query('SELECT publication_id FROM home_content_current')).rows[0].publication_id,
      publication.rows[0].id);
    await rejectsConstraint(client, 'INSERT INTO home_content_current(id) VALUES (2)', [], '23514');
    await rejectsConstraint(client, 'UPDATE home_content_current SET publication_id=$1 WHERE id=1', [randomUUID()], '23503');
    await rejectsConstraint(client,
      'INSERT INTO home_content_publications(payload,published_by_account_id) VALUES ($1,$2)',
      [{ menu: [], events: [], recommendations: [] }, randomUUID()], '23503');
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
