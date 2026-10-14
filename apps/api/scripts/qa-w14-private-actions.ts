import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import sharp from 'sharp';
import {runQaPublicFixture} from './qa-public-fixture.js';
import {ProductDrafts} from '../src/catalog/product-drafts.js';
import {ImageQuarantine} from '../src/catalog/image-quarantine.js';
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
try {
 const identity=(await pool.query('SELECT current_database() AS name,system_identifier::text AS id FROM pg_control_system()')).rows[0];
 assert.equal(identity.name,'shoppingmall_qa_20261010_2');assert.equal(identity.id,process.env.QA_ROLE_MATRIX_DB_SYSTEM_ID);assert.notEqual(identity.id,'7622490131194466339');
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n,0);assert.equal((await pool.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n,28);
 const password=randomBytes(24).toString('hex');const fixture=await runQaPublicFixture('seed','a0150014',process.env.DATABASE_URL!,password,1,false);
 const actorRow=(await pool.query('SELECT i.account_id,r.seller_id FROM account_identities i JOIN account_roles r ON r.account_id=i.account_id WHERE i.identifier=$1',['qa+a0150014-seller-a@example.invalid'])).rows[0];
 const actor={accountId:actorRow.account_id,role:'seller' as const,sellerId:actorRow.seller_id};
 const categoryId=(await pool.query('SELECT category_id FROM products WHERE id=$1',[fixture.productId])).rows[0].category_id;
 const drafts=new ProductDrafts(pool);const input={categoryId,description:'미확인 비공개 조작 전용',originLabel:'시험 산지',shippingMode:'seller_direct' as const,options:[{name:'500g',priceWon:23000}]};
 const photos=await drafts.create(actor,{...input,title:'qa-a0150014-private-photos'});const empty=await drafts.create(actor,{...input,title:'qa-a0150014-empty-draft'});
 const store=new ImageQuarantine('/tmp/shoppingmall-upload-w14-20261015');const imageIds=[];
 for(const [index,color] of ['#e69923','#ca32ab'].entries()){
  const png=await sharp({create:{width:16,height:16,channels:4,background:color}}).png().toBuffer();const image=await store.put(png,'image/png');
  imageIds.push((await pool.query('INSERT INTO product_images(revision_id,object_key,purpose,mime_type,size_bytes,display_order) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',[photos.revisionId,image.objectKey,index===0?'thumbnail':'detail',image.mimeType,image.sizeBytes,index])).rows[0].id);
 }
 await writeFile('/workspace/w14-manifest.json',JSON.stringify({photos,empty,imageIds,publicProductId:fixture.productId,systemId:identity.id}),{mode:0o600,flag:'wx'});
 await writeFile('/tmp/w14-credential.json',JSON.stringify({email:'qa+a0150014-seller-a@example.invalid',password}),{mode:0o600,flag:'wx'});console.info('W14_PRIVATE_ACTIONS_SEEDED');
}finally{await pool.end();}
