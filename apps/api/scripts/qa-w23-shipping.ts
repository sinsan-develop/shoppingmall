import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {runQaFixture} from './qa-fixture.js';
import {ShippingPolicies} from '../src/shipping/service.js';
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
try{
 const target=(await pool.query('SELECT current_database() AS name,system_identifier::text AS id FROM pg_control_system()')).rows[0];
 assert.equal(target.name,'shoppingmall_qa_20261010_2');assert.equal(target.id,process.env.QA_ROLE_MATRIX_DB_SYSTEM_ID);assert.notEqual(target.id,'7622490131194466339');
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n,0);assert.equal((await pool.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n,28);
 const password=randomBytes(24).toString('hex');await runQaFixture('seed','a0150023',process.env.DATABASE_URL!,password);
 const seller=(await pool.query('SELECT i.account_id,r.seller_id FROM account_identities i JOIN account_roles r ON r.account_id=i.account_id WHERE i.identifier=$1',['qa+a0150023-seller-a@example.invalid'])).rows[0];
 const request=await new ShippingPolicies(pool).requestSeller({accountId:seller.account_id,role:'seller',sellerId:seller.seller_id},{feeWon:3500,freeThresholdWon:40000,cutoffTime:null,blockedPostalRanges:[]});
 await writeFile('/workspace/w23-manifest.json',JSON.stringify({requestId:request.requestId,systemId:target.id}),{mode:0o600,flag:'wx'});
 await writeFile('/tmp/w23-credential.json',JSON.stringify({email:'qa+a0150023-admin@example.invalid',password}),{mode:0o600,flag:'wx'});console.info('W23_SHIPPING_SEEDED');
}finally{await pool.end();}
