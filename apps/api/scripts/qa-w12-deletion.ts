import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { runQaFixture } from './qa-fixture.js';

const pool = new Pool({connectionString:process.env.DATABASE_URL,max:1});
try {
 const identity=(await pool.query('SELECT current_database() AS name,system_identifier::text AS id FROM pg_control_system()')).rows[0];
 assert.equal(identity.name,'shoppingmall_qa_20261010_2');assert.equal(identity.id,process.env.QA_ROLE_MATRIX_DB_SYSTEM_ID);assert.notEqual(identity.id,'7622490131194466339');
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n,0);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n,28);
 const password=randomBytes(24).toString('hex');
 await runQaFixture('seed','a0150012',process.env.DATABASE_URL!,password);
 const email='qa+a0150012-customer@example.invalid';
 const accountId=(await pool.query('SELECT account_id FROM account_identities WHERE kind=$1 AND identifier=$2',['email',email])).rows[0].account_id;
 await writeFile('/workspace/w12-manifest.json',JSON.stringify({accountId,systemId:identity.id}),{mode:0o600,flag:'wx'});
 await writeFile('/tmp/w12-credential.json',JSON.stringify({email,password}),{mode:0o600,flag:'wx'});
 console.info('W12_DELETION_SEEDED');
} finally {await pool.end();}
