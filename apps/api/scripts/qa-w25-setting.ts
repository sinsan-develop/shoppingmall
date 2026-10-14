import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {runQaFixture} from './qa-fixture.js';
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
try{
 const t=(await pool.query('SELECT current_database() AS name,system_identifier::text AS id FROM pg_control_system()')).rows[0];assert.equal(t.name,'shoppingmall_qa_20261010_2');assert.equal(t.id,process.env.QA_ROLE_MATRIX_DB_SYSTEM_ID);assert.notEqual(t.id,'7622490131194466339');
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n,0);assert.equal((await pool.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n,28);
 const password=randomBytes(24).toString('hex');await runQaFixture('seed','a0150025',process.env.DATABASE_URL!,password);
 const sellerId=(await pool.query('SELECT id FROM sellers WHERE display_name=$1',['qa-a0150025-owool'])).rows[0].id;
 await writeFile('/workspace/w25-manifest.json',JSON.stringify({sellerId,systemId:t.id}),{mode:0o600,flag:'wx'});await writeFile('/tmp/w25-credential.json',JSON.stringify({email:'qa+a0150025-admin@example.invalid',password}),{mode:0o600,flag:'wx'});console.info('W25_SETTING_SEEDED');
}finally{await pool.end();}
