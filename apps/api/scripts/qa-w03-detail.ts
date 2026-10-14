import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { Pool } from 'pg';
import { runQaPublicFixture } from './qa-public-fixture.js';
import { ImageQuarantine } from '../src/catalog/image-quarantine.js';

const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
try {
 const identity=(await pool.query('SELECT current_database() AS name,system_identifier::text AS id FROM pg_control_system()')).rows[0];
 assert.equal(identity.name,'shoppingmall_qa_20261010_2');assert.equal(identity.id,process.env.QA_ROLE_MATRIX_DB_SYSTEM_ID);assert.notEqual(identity.id,'7622490131194466339');
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n,0);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n,28);
 const password=randomBytes(24).toString('hex');
 const fixture=await runQaPublicFixture('seed','a0150003',process.env.DATABASE_URL!,password,1,true);
 const options=(await pool.query('SELECT id,name FROM product_options WHERE revision_id=$1 ORDER BY display_order',[fixture.revisionId])).rows;
 const store=new ImageQuarantine('/tmp/shoppingmall-upload-w03-20261015');
 const imageIds=[];
 for(const [index,color] of ['#e69923','#ca32ab'].entries()){
  const png=await sharp({create:{width:16,height:16,channels:4,background:color}}).png().toBuffer();
  const image=await store.put(png,'image/png');
  imageIds.push((await pool.query('INSERT INTO product_images(revision_id,object_key,purpose,mime_type,size_bytes,display_order) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',[fixture.revisionId,image.objectKey,index===0?'thumbnail':'detail',image.mimeType,image.sizeBytes,index])).rows[0].id);
 }
 await writeFile('/workspace/w03-manifest.json',JSON.stringify({...fixture,availableId:options[0].id,soldOutId:options[1].id,imageIds,systemId:identity.id}),{mode:0o600,flag:'wx'});
 await writeFile('/tmp/w03-credential.json',JSON.stringify({email:'qa+a0150003-customer@example.invalid',password}),{mode:0o600,flag:'wx'});
 console.info('W03_DETAIL_SEEDED');
}finally{await pool.end();}
