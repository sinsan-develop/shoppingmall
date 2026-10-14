import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {runFulfillmentUiFixture} from './qa-fulfillment-ui-fixture.js';
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
try {
 const identity=(await pool.query('SELECT current_database() AS name,system_identifier::text AS id FROM pg_control_system()')).rows[0];
 assert.equal(identity.name,'shoppingmall_s5_fulfillment_ui_a0150015');assert.equal(identity.id,process.env.QA_ROLE_MATRIX_DB_SYSTEM_ID);assert.notEqual(identity.id,'7622490131194466339');
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n,0);assert.equal((await pool.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n,28);
 const password=randomBytes(24).toString('hex');const result=await runFulfillmentUiFixture('seed','a0150015',process.env.DATABASE_URL!,password,undefined,identity.id);
 assert.ok('shipmentIds' in result);
 await writeFile('/workspace/w15-manifest.json',JSON.stringify({shipmentId:result.shipmentIds[0],systemId:identity.id}),{mode:0o600,flag:'wx'});
 await writeFile('/tmp/w15-credential.json',JSON.stringify({email:'qa+a0150015-fulfillment-seller-a@example.invalid',password}),{mode:0o600,flag:'wx'});console.info('W15_DELAY_SEEDED');
}finally{await pool.end();}
