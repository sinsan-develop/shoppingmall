import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { qaNames, runQaFixture } from '../scripts/qa-fixture.ts';

const origin = 'http://127.0.0.1:9091';
const password = 'test-only-password-12345';

test('only an admin session may save a versioned home draft without publishing it', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const runId = randomBytes(4).toString('hex');
  const names = qaNames(runId);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let app;
  let seeded = false;
  let initial;
  try {
    const draft = await pool.query('SELECT version,payload,updated_by_account_id FROM home_content_draft WHERE id=1');
    assert.equal(draft.rows.length, 1);
    initial = draft.rows[0];
    assert.deepEqual(initial.payload, { menu: [], events: [], recommendations: [] });
    const pointerBefore = (await pool.query('SELECT publication_id FROM home_content_current WHERE id=1')).rows[0].publication_id;
    await runQaFixture('seed', runId, process.env.DATABASE_URL, password);
    seeded = true;
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    async function cookieFor(email, role) {
      const response = await fetch(`${base}/auth/login`, { method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      });
      assert.equal(response.status, 201);
      return response.headers.get('set-cookie')?.split(';')[0];
    }
    const customer = await cookieFor(names.emails[0], 'customer');
    const seller = await cookieFor(names.emails[1], 'seller');
    const admin = await cookieFor(names.emails[4], 'admin');
    const path = `${base}/home/admin/draft`;
    assert.equal((await fetch(path)).status, 401);
    assert.equal((await fetch(path, { headers: { cookie: customer } })).status, 403);
    assert.equal((await fetch(path, { headers: { cookie: seller } })).status, 403);
    const before = await fetch(path, { headers: { cookie: admin } });
    assert.equal(before.status, 200);
    assert.deepEqual(await before.json(), { version: initial.version, payload: initial.payload });
    const body = JSON.stringify({ version: initial.version, payload: initial.payload });
    const put = (requestOrigin = origin) => fetch(path, { method: 'PUT',
      headers: { cookie: admin, origin: requestOrigin, 'content-type': 'application/json' }, body,
    });
    assert.equal((await put('http://invalid.test')).status, 403);
    const saved = await put();
    assert.equal(saved.status, 200);
    assert.deepEqual(await saved.json(), { version: initial.version + 1, payload: initial.payload });
    assert.equal((await put()).status, 409);
    assert.equal((await pool.query('SELECT publication_id FROM home_content_current WHERE id=1')).rows[0].publication_id,
      pointerBefore);
    const actor = (await pool.query('SELECT account_id FROM account_identities WHERE identifier=$1',
      [names.emails[4]])).rows[0].account_id;
    const audit = await pool.query(
      "SELECT action,active_role FROM audit_events WHERE actor_account_id=$1 AND action='home.draft_saved'", [actor]);
    assert.deepEqual(audit.rows, [{ action: 'home.draft_saved', active_role: 'admin' }]);
  } finally {
    if (app) await app.close();
    if (initial) await pool.query(
      'UPDATE home_content_draft SET version=$1,payload=$2,updated_by_account_id=$3 WHERE id=1',
      [initial.version, initial.payload, initial.updated_by_account_id],
    );
    if (seeded) await runQaFixture('reset', runId, process.env.DATABASE_URL);
    await pool.end();
  }
});
