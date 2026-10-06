import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { DatabaseService } from '../src/db/service.ts';
import { hashSessionToken } from '../src/auth/credentials.ts';

const name = 'shoppingmall_s52_schema_v6_1007';
const origin = 'http://127.0.0.1:9091';
const systemId = process.env.S52_SUPPORT_TEST_DB_SYSTEM_ID;

test('question HTTP uses actual customer, seller and admin grants without leaking private metadata',
  { skip: !systemId }, async () => {
    assert.equal(process.env.PGDATABASE, name);
    assert.equal(new URL(process.env.DATABASE_URL).pathname, `/${name}`);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    let app;
    try {
      const identity = (await client.query(`SELECT current_database() AS name,
        system_identifier::text AS system_id FROM pg_control_system()`)).rows[0];
      assert.deepEqual(identity, { name, system_id: systemId });
      await client.query('BEGIN');
      const ordersBefore = (await client.query('SELECT count(*)::int AS n FROM checkout_orders')).rows[0].n;
      const ids = [];
      for (let i = 0; i < 6; i++)
        ids.push((await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id);
      const [customer, otherCustomer, sellerAccount, otherSellerAccount, admin] = ids;
      const sellerCategory = (await client.query(`INSERT INTO seller_categories(name)
        VALUES ($1) RETURNING id`, [`s52-http-${randomUUID()}`])).rows[0].id;
      const sellers = [];
      for (let i = 0; i < 2; i++)
        sellers.push((await client.query(`INSERT INTO sellers(category_id,display_name)
          VALUES ($1,$2) RETURNING id`, [sellerCategory, `s52-http-${randomUUID()}`])).rows[0].id);
      const [seller, otherSeller] = sellers;
      for (const account of [customer, otherCustomer])
        await client.query("INSERT INTO account_roles(account_id,role) VALUES ($1,'customer')", [account]);
      await client.query("INSERT INTO account_roles(account_id,role,seller_id) VALUES ($1,'seller',$2)",
        [sellerAccount, seller]);
      await client.query("INSERT INTO account_roles(account_id,role,seller_id) VALUES ($1,'seller',$2)",
        [otherSellerAccount, otherSeller]);
      await client.query("INSERT INTO account_roles(account_id,role) VALUES ($1,'admin')", [admin]);
      const category = (await client.query(`INSERT INTO product_categories(name)
        VALUES ($1) RETURNING id`, [`s52-http-${randomUUID()}`])).rows[0].id;
      const product = (await client.query(`INSERT INTO products(seller_id,category_id)
        VALUES ($1,$2) RETURNING id`, [seller, category])).rows[0].id;
      const revision = (await client.query(`INSERT INTO product_revisions
        (product_id,version,title,description,origin_label,shipping_mode,status,
         proposed_by_account_id,reviewed_by_account_id,reviewed_at)
        VALUES ($1,1,'HTTP 문의 상품','시험 설명','시험 산지','seller_direct','approved',$2,$3,now()) RETURNING id`,
      [product, sellerAccount, admin])).rows[0].id;
      await client.query(`INSERT INTO product_publications(product_id,revision_id,published_by_account_id)
        VALUES ($1,$2,$3)`, [product, revision, admin]);
      const cookies = new Map();
      for (const [account, role, sellerId] of [
        [customer,'customer',null], [otherCustomer,'customer',null],
        [sellerAccount,'seller',seller], [otherSellerAccount,'seller',otherSeller],
        [admin,'admin',null],
      ]) {
        const token = randomUUID();
        await client.query(`INSERT INTO auth_sessions(token_hash,account_id,role,seller_id,expires_at)
          VALUES ($1,$2,$3,$4,now()+interval '1 hour')`,
        [hashSessionToken(token), account, role, sellerId]);
        cookies.set(account, `sm_session=${token}`);
      }
      app = await createApp();
      app.get(DatabaseService).getPool = () => client;
      await app.listen(0, '127.0.0.1');
      const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
      const request = (path, method, actor, body, key) => fetch(base + path, {
        method, headers: { cookie: cookies.get(actor), origin, 'content-type': 'application/json',
          ...(key ? { 'idempotency-key': key } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const questionKey = randomUUID();
      const created = await request('/customer/support/questions','POST',customer,
        { productId: product, text: '구매 전에 배송을 묻습니다' }, questionKey);
      assert.equal(created.status, 200);
      const question = await created.json();
      assert.equal(question.sellerId, seller);
      const otherCreated = await request('/customer/support/questions','POST',otherCustomer,
        { productId: product, text: '다른 고객의 비공개 문의' },randomUUID());
      assert.equal(otherCreated.status, 200);
      const otherQuestion = await otherCreated.json();
      const ownSecondResponse = await request('/customer/support/questions','POST',customer,
        { productId: product, text: '고객의 두 번째 문의' },randomUUID());
      assert.equal(ownSecondResponse.status, 200);
      const ownSecond = await ownSecondResponse.json();
      const ownList = await request('/customer/support/questions','GET',customer);
      assert.equal(ownList.status, 200);
      assert.deepEqual(new Set((await ownList.json()).items.map(({ id }) => id)),
        new Set([question.id,ownSecond.id]));
      assert.deepEqual((await (await request('/customer/support/questions','GET',otherCustomer))
        .json()).items.map(({ id }) => id), [otherQuestion.id]);
      const ownPage = await (await request('/customer/support/questions?limit=1','GET',customer)).json();
      assert.equal(ownPage.items.length, 1);
      assert.ok(ownPage.nextCursor);
      const ownNext = await (await request(`/customer/support/questions?limit=1&cursor=${ownPage.nextCursor}`,
        'GET',customer)).json();
      assert.deepEqual(new Set([ownPage.items[0].id,ownNext.items[0].id]),
        new Set([question.id,ownSecond.id]));
      assert.equal(ownNext.nextCursor, null);
      const sellerList = await request('/seller/support/questions','GET',sellerAccount);
      assert.equal(sellerList.status, 200);
      assert.deepEqual(new Set((await sellerList.json()).items.map(({ id }) => id)),
        new Set([question.id,otherQuestion.id,ownSecond.id]));
      assert.deepEqual((await (await request('/seller/support/questions','GET',otherSellerAccount))
        .json()).items, []);
      const sellerPage = await (await request('/seller/support/questions?limit=1','GET',sellerAccount)).json();
      assert.equal(sellerPage.items.length, 1);
      assert.ok(sellerPage.nextCursor);
      const adminList = await request('/admin/support/questions?limit=1','GET',admin);
      assert.equal(adminList.status, 200);
      const firstPage = await adminList.json();
      assert.equal(firstPage.items.length, 1);
      assert.ok(firstPage.nextCursor);
      const secondPage = await (await request(`/admin/support/questions?limit=1&cursor=${firstPage.nextCursor}`,
        'GET',admin)).json();
      assert.equal(secondPage.items.length, 1);
      assert.ok(secondPage.nextCursor);
      const thirdPage = await (await request(`/admin/support/questions?limit=1&cursor=${secondPage.nextCursor}`,
        'GET',admin)).json();
      assert.equal(thirdPage.items.length, 1);
      assert.equal(thirdPage.nextCursor, null);
      assert.deepEqual(new Set([firstPage.items[0].id,secondPage.items[0].id,thirdPage.items[0].id]),
        new Set([question.id,otherQuestion.id,ownSecond.id]));
      assert.equal((await request('/admin/support/questions?limit=0','GET',admin)).status, 400);
      assert.equal((await request('/admin/support/questions?limit=50','GET',admin)).status, 200);
      assert.equal((await request('/admin/support/questions?limit=51','GET',admin)).status, 400);
      assert.equal((await request('/admin/support/questions?cursor=bad','GET',admin)).status, 400);
      assert.equal((await request('/seller/support/questions?limit=51','GET',sellerAccount)).status, 400);
      assert.equal((await request('/customer/support/questions?limit=0','GET',customer)).status, 400);
      assert.equal((await request('/customer/support/questions?status=ANSWERED','GET',customer)).status, 400);
      assert.deepEqual((await (await request('/admin/support/questions?status=ANSWERED','GET',admin))
        .json()).items, []);
      assert.equal((await request('/admin/support/questions','GET',customer)).status, 403);
      assert.equal((await request(`/customer/support/questions/${question.id}`,'GET',otherCustomer)).status, 404);
      assert.equal((await request(`/seller/support/questions/${question.id}`,'GET',otherSellerAccount)).status, 404);
      assert.equal((await request(`/seller/support/questions/${question.id}/replies`,'POST',
        otherSellerAccount,{ text: '무단 답변' },randomUUID())).status, 404);
      assert.equal((await request(`/seller/support/questions/${question.id}/replies`,'POST',
        customer,{ text: '고객 권한 오용' },randomUUID())).status, 403);
      const replyKey = randomUUID();
      const answer = await request(`/seller/support/questions/${question.id}/replies`,'POST',
        sellerAccount,{ text: '판매자 답변' },replyKey);
      assert.equal(answer.status, 200);
      const message = await answer.json();
      assert.equal((await request(`/admin/support/questions/${question.id}`,'GET',customer)).status, 403);
      assert.equal((await request(`/admin/support/questions/${question.id}`,'GET',sellerAccount)).status, 403);
      const pending = await request('/admin/support/questions?status=ANSWERED','GET',admin);
      assert.equal(pending.status, 200);
      assert.deepEqual((await pending.json()).items.map(({ id }) => id), [question.id]);
      const adminDetail = await request(`/admin/support/questions/${question.id}`,'GET',admin);
      assert.equal(adminDetail.status, 200);
      const reviewable = await adminDetail.json();
      assert.equal(reviewable.body, '구매 전에 배송을 묻습니다');
      assert.deepEqual(reviewable.messages.map(({ id, body }) => ({ id, body })),
        [{ id: message.id, body: '판매자 답변' }]);
      assert.deepEqual(reviewable.messages[0].events.map(({ action }) => action), ['SUBMITTED']);
      const retry = await request(`/seller/support/questions/${question.id}/replies`,'POST',
        sellerAccount,{ text: '판매자 답변' },replyKey);
      assert.equal(retry.status, 200);
      assert.equal((await retry.json()).id, message.id);
      assert.equal((await request(`/seller/support/questions/${question.id}/replies`,'POST',
        sellerAccount,{ text: '다른 답변' },replyKey)).status, 409);
      const publicPath = `/catalog/products/${product}/questions`;
      assert.deepEqual(await (await fetch(base + publicPath)).json(), []);
      assert.equal((await request(`/admin/support/questions/${question.id}/publish`,'POST',
        customer,{ messageId: message.id })).status, 403);
      assert.equal((await request(`/admin/support/questions/${question.id}/publish`,'POST',
        admin,{ messageId: message.id })).status, 200);
      assert.equal((await request(`/admin/support/questions/${question.id}/publish`,'POST',
        admin,{ messageId: message.id })).status, 200);
      assert.equal((await client.query(`SELECT count(*)::int AS n FROM support_question_message_events
        WHERE message_id=$1 AND action='PUBLISHED'`, [message.id])).rows[0].n, 1);
      const approvedDetail = await (await request(`/admin/support/questions/${question.id}`,
        'GET',admin)).json();
      assert.deepEqual(approvedDetail.messages[0].events.map(({ action }) => action),
        ['SUBMITTED','PUBLISHED']);
      const publicRows = await (await fetch(base + publicPath)).json();
      assert.deepEqual(publicRows, [{ questionId: question.id,
        question: '구매 전에 배송을 묻습니다', answer: '판매자 답변' }]);
      assert.equal(JSON.stringify(publicRows).includes(customer), false);
      assert.equal(JSON.stringify(publicRows).includes(sellerAccount), false);
      await client.query('DELETE FROM product_publications WHERE product_id=$1', [product]);
      assert.deepEqual(await (await fetch(base + publicPath)).json(), []);
      assert.equal((await request(`/customer/support/questions/${question.id}`,'GET',customer)).status, 200);
      assert.equal((await client.query('SELECT count(*)::int AS n FROM checkout_orders')).rows[0].n,
        ordersBefore);
    } finally {
      if (app) await app.close();
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  });
