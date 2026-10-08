import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';

const name = 'shoppingmall_s52_schema_v6_1007';
const systemId = process.env.S52_SUPPORT_TEST_DB_SYSTEM_ID;

test('pre-purchase question, multiple seller replies and admin publication stay scoped',
  { skip: !systemId }, async () => {
    assert.equal(process.env.PGDATABASE, name);
    const pool = new Pool();
    const client = await pool.connect();
    try {
      const identity = (await client.query(`SELECT current_database() AS name,
        system_identifier::text AS system_id FROM pg_control_system()`)).rows[0];
      assert.deepEqual(identity, { name, system_id: systemId });
      const orderCountBefore = (await client.query('SELECT count(*)::int AS n FROM checkout_orders')).rows[0].n;
      const support = await import('../src/support/questions.ts').catch(() => ({}));
      assert.equal(typeof support.createQuestion, 'function', 'question API must exist');
      await client.query('BEGIN');
      const customer = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
      const stranger = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
      const sellerAccount = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
      const admin = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
      const sellerCategory = (await client.query(`INSERT INTO seller_categories(name)
        VALUES ($1) RETURNING id`, [`s52-question-${randomUUID()}`])).rows[0].id;
      const seller = (await client.query(`INSERT INTO sellers(category_id,display_name)
        VALUES ($1,$2) RETURNING id`, [sellerCategory, `s52-question-${randomUUID()}`])).rows[0].id;
      await client.query(`INSERT INTO account_roles(account_id,role,seller_id)
        VALUES ($1,'seller',$2)`, [sellerAccount, seller]);
      const category = (await client.query(`INSERT INTO product_categories(name)
        VALUES ($1) RETURNING id`, [`s52-question-${randomUUID()}`])).rows[0].id;
      const product = (await client.query(`INSERT INTO products(seller_id,category_id)
        VALUES ($1,$2) RETURNING id`, [seller, category])).rows[0].id;
      const revision = (await client.query(`INSERT INTO product_revisions
        (product_id,version,title,description,origin_label,shipping_mode,status,
         proposed_by_account_id,reviewed_by_account_id,reviewed_at)
        VALUES ($1,1,'질문 시험 상품','설명','산지','seller_direct','approved',$2,$3,now()) RETURNING id`,
      [product, sellerAccount, admin])).rows[0].id;
      await client.query(`INSERT INTO product_publications(product_id,revision_id,published_by_account_id)
        VALUES ($1,$2,$3)`, [product, revision, admin]);
      const input = { customerAccountId: customer, productId: product,
        body: '구매 전에 원산지를 묻습니다', idempotencyKey: randomUUID() };
      const question = await support.createQuestion(client, input);
      assert.equal(question.productId, product);
      assert.equal(question.sellerId, seller);
      assert.equal(question.customerAccountId, customer);
      assert.equal((await client.query('SELECT count(*)::int AS n FROM checkout_orders')).rows[0].n,
        orderCountBefore, 'pre-purchase question creates no order');
      assert.equal((await support.createQuestion(client, input)).id, question.id);
      await assert.rejects(() => support.createQuestion(client, { ...input, body: '다른 내용' }),
        /Support conflict/);
      assert.equal(await support.getCustomerQuestion(client, stranger, question.id), undefined);
      assert.equal(await support.getSellerQuestion(client, randomUUID(), question.id), undefined);
      await assert.rejects(() => support.replyToQuestion(client, {
        questionId: question.id, sellerId: randomUUID(), actorAccountId: sellerAccount,
        body: '무단 답변', idempotencyKey: randomUUID(),
      }), /Support unavailable/);
      await assert.rejects(() => support.replyToQuestion(client, {
        questionId: question.id, sellerId: seller, actorAccountId: stranger,
        body: '역할 없는 계정의 답변', idempotencyKey: randomUUID(),
      }), /Support unavailable/);
      const replyKey = randomUUID();
      const first = await support.replyToQuestion(client, { questionId: question.id,
        sellerId: seller, actorAccountId: sellerAccount, body: '첫 답변', idempotencyKey: replyKey });
      assert.equal((await support.replyToQuestion(client, { questionId: question.id,
        sellerId: seller, actorAccountId: sellerAccount, body: '첫 답변', idempotencyKey: replyKey })).id,
      first.id);
      await assert.rejects(() => support.replyToQuestion(client, { questionId: question.id,
        sellerId: seller, actorAccountId: sellerAccount, body: '변경된 내용', idempotencyKey: replyKey }),
      /Support conflict/);
      const second = await support.replyToQuestion(client, { questionId: question.id,
        sellerId: seller, actorAccountId: sellerAccount, body: '수정 답변', idempotencyKey: randomUUID() });
      assert.notEqual(first.id, second.id);
      assert.deepEqual(await support.listPublicQuestionAnswers(client, product), []);
      await support.publishQuestionMessage(client, { questionId: question.id,
        messageId: first.id, adminAccountId: admin });
      const publishedCount = (await client.query(`SELECT count(*)::int AS n
        FROM support_question_message_events WHERE message_id=$1 AND action='PUBLISHED'`,
      [first.id])).rows[0].n;
      await support.publishQuestionMessage(client, { questionId: question.id,
        messageId: first.id, adminAccountId: admin });
      assert.equal((await client.query(`SELECT count(*)::int AS n
        FROM support_question_message_events WHERE message_id=$1 AND action='PUBLISHED'`,
      [first.id])).rows[0].n, publishedCount, 'same approved answer retry adds no event');
      assert.deepEqual((await support.listPublicQuestionAnswers(client, product)).map((row) => row.answer),
        ['첫 답변']);
      await support.publishQuestionMessage(client, { questionId: question.id,
        messageId: second.id, adminAccountId: admin });
      const publicRows = await support.listPublicQuestionAnswers(client, product);
      assert.deepEqual(publicRows.map((row) => row.answer), ['수정 답변']);
      assert.deepEqual(publicRows.map((row) => row.question), ['구매 전에 원산지를 묻습니다']);
      assert.ok(publicRows.every((row) => !('customerAccountId' in row) && !('sellerAccountId' in row)));
      const history = await support.getCustomerQuestion(client, customer, question.id);
      assert.deepEqual(history.messages.map((row) => row.body), ['첫 답변','수정 답변']);
      assert.deepEqual(history.messages.map((row) => row.events.map((event) => event.action)),
        [['SUBMITTED','PUBLISHED'],['SUBMITTED','PUBLISHED']]);
      await client.query("UPDATE product_revisions SET status='rejected' WHERE id=$1", [revision]);
      assert.deepEqual(await support.listPublicQuestionAnswers(client, product), [],
        'non-approved current revision cannot expose Q&A');
      await client.query("UPDATE product_revisions SET status='approved' WHERE id=$1", [revision]);
      await client.query('DELETE FROM product_publications WHERE product_id=$1', [product]);
      assert.deepEqual(await support.listPublicQuestionAnswers(client, product), [],
        'withdrawn catalog product cannot expose its former public Q&A');
      assert.equal((await support.getCustomerQuestion(client, customer, question.id)).body,
        '구매 전에 원산지를 묻습니다', 'owner history remains private after withdrawal');
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  });
