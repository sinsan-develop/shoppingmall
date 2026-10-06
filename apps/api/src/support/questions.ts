import type { Pool, PoolClient } from 'pg';

type Db = Pool | PoolClient;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validText(value: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 2000)
    throw new Error('Invalid support request');
  return value.trim();
}

export async function createQuestion(db: Db, input: {
  customerAccountId: string; productId: string; body: string; idempotencyKey: string;
}) {
  if (![input.customerAccountId, input.productId, input.idempotencyKey].every((id) => uuid.test(id)))
    throw new Error('Invalid support request');
  const body = validText(input.body);
  const inserted = await db.query<{ id: string; productId: string; sellerId: string;
    customerAccountId: string; body: string }>(`INSERT INTO support_questions
      (product_id,customer_account_id,seller_id,body,idempotency_key)
      SELECT p.id,$1,p.seller_id,$3,$4 FROM products p
      JOIN product_publications pub ON pub.product_id=p.id
      JOIN product_revisions r ON r.id=pub.revision_id AND r.product_id=p.id
      WHERE p.id=$2 AND r.status='approved'
      ON CONFLICT (customer_account_id,idempotency_key) DO NOTHING
      RETURNING id,product_id AS "productId",seller_id AS "sellerId",
        customer_account_id AS "customerAccountId",body`,
  [input.customerAccountId, input.productId, body, input.idempotencyKey]);
  if (inserted.rows[0]) return inserted.rows[0];
  const existing = (await db.query<{ id: string; productId: string; sellerId: string;
    customerAccountId: string; body: string }>(`SELECT id,product_id AS "productId",seller_id AS "sellerId",
      customer_account_id AS "customerAccountId",body FROM support_questions
      WHERE customer_account_id=$1 AND idempotency_key=$2`,
  [input.customerAccountId, input.idempotencyKey])).rows[0];
  if (!existing) throw new Error('Support unavailable');
  if (existing.productId !== input.productId || existing.body !== body)
    throw new Error('Support conflict');
  return existing;
}

async function loadQuestion(db: Db, questionId: string, actorId: string,
  scope: 'customer_account_id' | 'seller_id') {
  if (!uuid.test(questionId) || !uuid.test(actorId)) throw new Error('Invalid support request');
  const question = (await db.query<{ id: string; productId: string; sellerId: string;
    customerAccountId: string; body: string; status: string }>(`SELECT id,
      product_id AS "productId",seller_id AS "sellerId",
      customer_account_id AS "customerAccountId",body,status
      FROM support_questions WHERE id=$1 AND ${scope}=$2`, [questionId, actorId])).rows[0];
  if (!question) return undefined;
  const messages = (await db.query<{ id: string; body: string; authorRole: string;
    createdAt: Date }>(`SELECT id,body,author_role AS "authorRole",created_at AS "createdAt"
      FROM support_question_messages WHERE question_id=$1 ORDER BY message_seq`, [questionId])).rows;
  const events = (await db.query<{ messageId: string; action: string; actorRole: string;
    occurredAt: Date }>(`SELECT message_id AS "messageId",action,actor_role AS "actorRole",
      occurred_at AS "occurredAt" FROM support_question_message_events
      WHERE message_id=ANY($1::uuid[]) ORDER BY event_seq`, [messages.map((row) => row.id)])).rows;
  return { ...question, messages: messages.map((message) => ({ ...message,
    events: events.filter((event) => event.messageId === message.id)
      .map((event) => ({ action: event.action, actorRole: event.actorRole,
        occurredAt: event.occurredAt })),
  })) };
}

export function getCustomerQuestion(db: Db, customerAccountId: string, questionId: string) {
  return loadQuestion(db, questionId, customerAccountId, 'customer_account_id');
}

export function getSellerQuestion(db: Db, sellerId: string, questionId: string) {
  return loadQuestion(db, questionId, sellerId, 'seller_id');
}

export async function replyToQuestion(db: Db, input: { questionId: string;
  sellerId: string; actorAccountId: string; body: string; idempotencyKey: string }) {
  if (![input.questionId, input.sellerId, input.actorAccountId, input.idempotencyKey]
    .every((id) => uuid.test(id)))
    throw new Error('Invalid support request');
  const body = validText(input.body);
  const allowed = await db.query(`SELECT 1 FROM support_questions q
    JOIN account_roles r ON r.seller_id=q.seller_id AND r.role='seller'
      AND r.account_id=$3
    WHERE q.id=$1 AND q.seller_id=$2 AND q.status<>'HIDDEN'`,
  [input.questionId, input.sellerId, input.actorAccountId]);
  if (!allowed.rowCount) throw new Error('Support unavailable');
  const message = (await db.query<{ id: string }>(`WITH message AS (
      INSERT INTO support_question_messages
        (question_id,author_account_id,author_role,body,idempotency_key)
      SELECT q.id,$3,'seller',$4,$5 FROM support_questions q
      WHERE q.id=$1 AND q.seller_id=$2 AND q.status<>'HIDDEN'
        AND EXISTS (SELECT 1 FROM account_roles r WHERE r.account_id=$3
          AND r.role='seller' AND r.seller_id=q.seller_id)
      ON CONFLICT (author_account_id,idempotency_key) DO NOTHING
      RETURNING id,question_id
    ), event AS (
      INSERT INTO support_question_message_events(message_id,action,actor_account_id,actor_role)
      SELECT id,'SUBMITTED',$3,'seller' FROM message RETURNING message_id
    ) UPDATE support_questions q SET status='ANSWERED'
      FROM message m,event e WHERE q.id=m.question_id RETURNING m.id`,
  [input.questionId, input.sellerId, input.actorAccountId, body, input.idempotencyKey])).rows[0];
  if (message) return message;
  const existing = (await db.query<{ id: string; questionId: string; body: string }>(`
    SELECT id,question_id AS "questionId",body FROM support_question_messages
    WHERE author_account_id=$1 AND idempotency_key=$2`,
  [input.actorAccountId, input.idempotencyKey])).rows[0];
  if (!existing) throw new Error('Support unavailable');
  if (existing.questionId !== input.questionId || existing.body !== body)
    throw new Error('Support conflict');
  return { id: existing.id };
}

export async function publishQuestionMessage(db: Db, input: { questionId: string;
  messageId: string; adminAccountId: string }) {
  if (![input.questionId, input.messageId, input.adminAccountId].every((id) => uuid.test(id)))
    throw new Error('Invalid support request');
  const result = await db.query(`WITH approved AS (
      UPDATE support_questions q SET status='PUBLISHED'
      WHERE q.id=$1 AND q.status<>'HIDDEN' AND EXISTS (
        SELECT 1 FROM support_question_messages m
        WHERE m.id=$2 AND m.question_id=q.id AND m.author_role='seller')
      RETURNING q.id
    ) INSERT INTO support_question_message_events
      (message_id,action,actor_account_id,actor_role)
      SELECT $2,'PUBLISHED',$3,'admin' FROM approved RETURNING id`,
  [input.questionId, input.messageId, input.adminAccountId]);
  if (!result.rowCount) throw new Error('Support unavailable');
}

export async function listPublicQuestionAnswers(db: Db, productId: string) {
  if (!uuid.test(productId)) throw new Error('Invalid support request');
  return (await db.query<{ questionId: string; question: string; answer: string }>(`
    SELECT q.id AS "questionId",q.body AS question,m.body AS answer
    FROM support_questions q
    JOIN LATERAL (SELECT e.message_id,e.action FROM support_question_message_events e
      JOIN support_question_messages candidate ON candidate.id=e.message_id
      WHERE candidate.question_id=q.id AND e.action IN ('PUBLISHED','HIDDEN')
      ORDER BY e.event_seq DESC LIMIT 1) state ON state.action='PUBLISHED'
    JOIN support_question_messages m ON m.id=state.message_id AND m.author_role='seller'
    WHERE q.product_id=$1 AND q.status<>'HIDDEN'
    ORDER BY q.created_at,q.id`, [productId])).rows;
}
