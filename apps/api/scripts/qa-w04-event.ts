import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {Pool} from 'pg';
import {runQaPublicFixture} from './qa-public-fixture.js';
import {qaNames} from './qa-fixture.js';
import {ImageQuarantine} from '../src/catalog/image-quarantine.js';
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
try{
 const identity=(await pool.query('SELECT current_database() AS name,system_identifier::text AS id FROM pg_control_system()')).rows[0];
 assert.equal(identity.name,'shoppingmall_qa_20261010_2');assert.equal(identity.id,process.env.QA_ROLE_MATRIX_DB_SYSTEM_ID);assert.notEqual(identity.id,'7622490131194466339');
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n,0);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n,28);
 const fixture=await runQaPublicFixture('seed','a0150004',process.env.DATABASE_URL!,randomBytes(24).toString('hex'));
 const actor=(await pool.query('SELECT account_id FROM account_identities WHERE identifier=$1',[qaNames('a0150004').emails[4]])).rows[0].account_id;
 const store=new ImageQuarantine('/tmp/shoppingmall-upload-w04-20261015');
 const bytes=await sharp({create:{width:16,height:16,channels:4,background:'#48904f'}}).png().toBuffer();const image=await store.put(bytes,'image/png');
 const imageId=(await pool.query('INSERT INTO product_images(revision_id,object_key,purpose,mime_type,size_bytes,display_order) VALUES ($1,$2,\'thumbnail\',$3,$4,0) RETURNING id',[fixture.revisionId,image.objectKey,image.mimeType,image.sizeBytes])).rows[0].id;
 const activeId=randomUUID(),futureId=randomUUID(),expiredId=randomUUID(),now=Date.now();
 const active={id:activeId,title:'W04 진행 기획전',description:'W04 격리 상품 상세 확인',displayOrder:0,startAt:new Date(now-3600000).toISOString(),endAt:new Date(now+3600000).toISOString(),productIds:[fixture.productId],heroProductId:fixture.productId,heroImageId:imageId};
 const events=[active,{...active,id:futureId,title:'W04 예정 기획전',startAt:new Date(now+3600000).toISOString(),endAt:new Date(now+7200000).toISOString()},{...active,id:expiredId,title:'W04 종료 기획전',startAt:new Date(now-7200000).toISOString(),endAt:new Date(now-3600000).toISOString()}];
 const publication=(await pool.query('INSERT INTO home_content_publications(payload,published_by_account_id) VALUES ($1,$2) RETURNING id',[{menu:[],recommendations:[],events},actor])).rows[0].id;
 await pool.query('UPDATE home_content_current SET publication_id=$1 WHERE id=1',[publication]);
 await writeFile('/workspace/w04-manifest.json',JSON.stringify({...fixture,activeId,futureId,expiredId,systemId:identity.id}),{mode:0o600,flag:'wx'});
 console.info('W04_EVENT_SEEDED');
}finally{await pool.end();}
