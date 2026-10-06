import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { ImageQuarantine } from '../src/catalog/image-quarantine.ts';
import { createQuestion, replyToQuestion, publishQuestionMessage } from '../src/support/questions.ts';
import { createPurchaseConfirmation } from '../src/support/confirmations.ts';
import { createReview, approveReview, reportReview } from '../src/support/reviews.ts';
import { createClaim, addClaimEvidence, replyToClaim, approveClaim } from '../src/support/claims.ts';
import { executeMockRefundCase } from '../src/refunds/mock-execution.ts';
import {
  supportUiDatabaseName, supportUiEmails, supportUiUploadRoot,supportUiRecoveryPath,
  isSupportUiImageKey,
  signSupportUiManifest, validateSupportUiManifest,
  validateSupportUiSystemTarget, validateSupportUiTarget, runSupportUiFixture,
} from '../scripts/qa-support-ui-fixture.ts';

const uuid = (digit) => `${digit.repeat(8)}-${digit.repeat(4)}-${digit.repeat(4)}-${digit.repeat(4)}-${digit.repeat(12)}`;
const runId = 'a52c1007';
const password = randomUUID();
if (process.platform !== 'win32' && !process.env.S52_SUPPORT_UI_TEMP_ROOT)
  process.env.S52_SUPPORT_UI_TEMP_ROOT = join(tmpdir(),'shoppingmall-s52-support-ui');

function sampleManifest() {
  const unsigned = {
    runId,emails: supportUiEmails(runId),
    accountIds: ['1','2','3','4','5'].map(uuid),sellerIds: ['6','7'].map(uuid),
    sellerCategoryId: uuid('8'),productCategoryIds: ['9','a'].map(uuid),
    productId: uuid('b'),revisionId: uuid('c'),optionId: uuid('d'),
    addressId: uuid('e'),reservationId: uuid('f'),orderId: uuid('1'),
    shipmentId: uuid('2'),paymentAttemptId: uuid('3'),paymentEventId: uuid('4'),
    initialFulfillmentEventIds: ['5','6','7'].map(uuid),orderStatusEventId: uuid('8'),
    previousFulfillmentSetting: { owoolSellerId: null,updatedBy: null,
      version: 0,updatedAt: '2026-10-07T00:00:00.000Z' },
    seededFulfillmentSettingUpdatedAt: '2026-10-07T00:00:01.000Z',
  };
  return { ...unsigned,signature: signSupportUiManifest(unsigned,password) };
}

test('S5.2 browser fixture accepts only exact local dedicated database and system', () => {
  assert.equal(supportUiDatabaseName(runId),'shoppingmall_s52_support_ui_a52c1007');
  assert.deepEqual(supportUiEmails(runId),[
    'qa+a52c1007-support-customer-a@example.invalid',
    'qa+a52c1007-support-customer-b@example.invalid',
    'qa+a52c1007-support-seller-a@example.invalid',
    'qa+a52c1007-support-owool@example.invalid',
    'qa+a52c1007-support-admin@example.invalid',
  ]);
  const url = `postgresql://qa@127.0.0.1:15440/${supportUiDatabaseName(runId)}`;
  assert.equal(validateSupportUiTarget(url,runId).database,supportUiDatabaseName(runId));
  for (const unsafe of ['postgresql://qa@127.0.0.1:15440/shoppingmall',
    'postgresql://qa@remote.example:5432/shoppingmall_s52_support_ui_a52c1007'])
    assert.throws(() => validateSupportUiTarget(unsafe,runId));
  assert.deepEqual(validateSupportUiSystemTarget(runId,'7693634051273510955',{
    databaseName: supportUiDatabaseName(runId),systemId: '7693634051273510955',
  }),{ databaseName: supportUiDatabaseName(runId),systemId: '7693634051273510955' });
  assert.throws(() => validateSupportUiSystemTarget(runId,'1234567890',{
    databaseName: supportUiDatabaseName(runId),systemId: '7693634051273510955',
  }));
  assert.equal(supportUiUploadRoot(runId),join(process.platform === 'win32'
    ? 'D:\\tmp' : process.env.S52_SUPPORT_UI_TEMP_ROOT,
  'shoppingmall-upload-s52-support-ui-a52c1007'));
  if (process.platform === 'win32') {
    const oldRoot = process.env.S52_SUPPORT_UI_TEMP_ROOT;
    try {
      process.env.S52_SUPPORT_UI_TEMP_ROOT = tmpdir();
      assert.throws(() => supportUiUploadRoot(runId),/D:\\tmp/);
    } finally {
      if (oldRoot === undefined) delete process.env.S52_SUPPORT_UI_TEMP_ROOT;
      else process.env.S52_SUPPORT_UI_TEMP_ROOT = oldRoot;
    }
  }
});

test('S5.2 reset requires complete unmodified signed creation manifest', () => {
  const manifest = sampleManifest();
  assert.deepEqual(validateSupportUiManifest(runId,manifest,password),manifest);
  assert.throws(() => validateSupportUiManifest(runId,{ ...manifest,
    accountIds: manifest.accountIds.slice(1) },password));
  assert.throws(() => validateSupportUiManifest(runId,{ ...manifest,
    shipmentId: uuid('9') },password));
  assert.throws(() => validateSupportUiManifest(runId,{ ...manifest,
    initialFulfillmentEventIds: manifest.initialFulfillmentEventIds.slice(1) },password));
  assert.throws(() => validateSupportUiManifest(runId,{ ...manifest,
    emails: [...manifest.emails.slice(0,4),'foreign@example.invalid'] },password));
  assert.throws(() => validateSupportUiManifest(runId,manifest,'different-test-password'));
});

test('S5.2 private image key guard accepts full UUID only', () => {
  assert.equal(isSupportUiImageKey(`quarantine/${uuid('a')}.webp`),true);
  assert.equal(isSupportUiImageKey('quarantine/aaaaaaaa-aaaa-aaaa-aaaaaaaaaaaa.webp'),false);
  assert.equal(isSupportUiImageKey(`../quarantine/${uuid('a')}.webp`),false);
  assert.equal(isSupportUiImageKey(`quarantine/${uuid('a')}.jpg`),false);
});

const databaseUrl = process.env.S52_SUPPORT_UI_TEST_DB_NAME &&
  `postgresql://${encodeURIComponent(process.env.PGUSER ?? '')}@` +
  `${process.env.PGHOST ?? ''}:${process.env.PGPORT ?? ''}/` +
  encodeURIComponent(process.env.S52_SUPPORT_UI_TEST_DB_NAME);
const systemId = process.env.S52_SUPPORT_UI_TEST_DB_SYSTEM_ID;

async function publicTableCounts(pool) {
  const tables = (await pool.query(`SELECT tablename FROM pg_tables
    WHERE schemaname='public' ORDER BY tablename`)).rows.map((row) => row.tablename);
  const counts = {};
  for (const table of tables) {
    const name = `"${table.replaceAll('"','""')}"`;
    counts[table] = (await pool.query(`SELECT count(*)::int AS n FROM ${name}`)).rows[0].n;
  }
  return counts;
}

test('S5.2 signed seed, full support/refund flow and fail-closed reset leave zero owned residue',
  { skip: !databaseUrl || !systemId },async () => {
    const password = randomUUID();
    const manifestPath = supportUiRecoveryPath(runId);
    validateSupportUiTarget(databaseUrl,runId);
    const pool = new Pool({ connectionString:databaseUrl });
    let manifest;
    let originalFailure;
    try {
      const target = (await pool.query(`SELECT current_database() AS "databaseName",
        system_identifier::text AS "systemId" FROM pg_control_system()`)).rows[0];
      assert.deepEqual(target,{ databaseName:supportUiDatabaseName(runId),systemId });
      const initialCounts = await publicTableCounts(pool);
      const initialSetting = (await pool.query(`SELECT owool_seller_id,updated_by,
        version,updated_at::text FROM fulfillment_settings WHERE id=1`)).rows[0];
      await assert.rejects(runSupportUiFixture('seed',runId,databaseUrl,password,
        undefined,'999999999999'),/system identifier/);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n,0);
      manifest = await runSupportUiFixture('seed',runId,databaseUrl,password,undefined,systemId);
      if (process.platform === 'win32') {
        const target = manifestPath.replaceAll("'","''");
        const acl = execFileSync('powershell.exe',['-NoProfile','-NonInteractive',
          '-Command',`$a=[System.IO.File]::GetAccessControl('${target}'); ` +
          '$r=@($a.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])); ' +
          '$self=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; ' +
          'if ($a.AreAccessRulesProtected -and $r.Count -eq 1 -and ' +
          '$r[0].IdentityReference.Value ' +
          '-eq $self) { "private" } else { "unsafe" }'],
        { encoding:'utf8',stdio:'pipe',timeout:10000 });
        assert.equal(acl.trim(),'private');
      } else assert.equal((await lstat(manifestPath)).mode & 0o077,0);
      assert.equal(manifest.accountIds.length,5);
      const snapshot = (await pool.query(`SELECT product.seller_id AS "productSeller",
        shipment.seller_id AS "shipmentSeller",line.seller_id AS "lineSeller",
        fulfillment.fulfillment_seller_id AS "fulfillmentSeller",fulfillment.status
        FROM products product JOIN shipment_order_lines line ON line.product_id=product.id
        JOIN shipment_orders shipment ON shipment.id=line.shipment_order_id
        JOIN shipment_fulfillments fulfillment ON fulfillment.shipment_order_id=shipment.id
        WHERE product.id=$1`,[manifest.productId])).rows[0];
      assert.deepEqual(snapshot,{ productSeller:manifest.sellerIds[0],
        shipmentSeller:null,lineSeller:manifest.sellerIds[0],
        fulfillmentSeller:manifest.sellerIds[1],status:'SHIPPED' });

      await assert.rejects(runSupportUiFixture('reset',runId,databaseUrl,password,
        JSON.stringify({ ...manifest,orderId:randomUUID() }),systemId),/signature|manifest/);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n,5);

      const question = await createQuestion(pool,{ customerAccountId:manifest.accountIds[1],
        productId:manifest.productId,body:'구매 전 원산지 문의',idempotencyKey:randomUUID() });
      const reply = await replyToQuestion(pool,{ questionId:question.id,
        sellerId:manifest.sellerIds[0],actorAccountId:manifest.accountIds[2],
        body:'가상 산지 상품입니다',idempotencyKey:randomUUID() });
      await publishQuestionMessage(pool,{ questionId:question.id,messageId:reply.id,
        adminAccountId:manifest.accountIds[4] });
      await assert.rejects(createPurchaseConfirmation(pool,{
        customerAccountId:manifest.accountIds[1],orderId:manifest.orderId,
        shipmentOrderId:manifest.shipmentId,optionId:manifest.optionId,
        idempotencyKey:randomUUID() }),/Support unavailable/);
      const confirmation = await createPurchaseConfirmation(pool,{
        customerAccountId:manifest.accountIds[0],orderId:manifest.orderId,
        shipmentOrderId:manifest.shipmentId,optionId:manifest.optionId,
        idempotencyKey:randomUUID() });
      const review = await createReview(pool,{ confirmationId:confirmation.id,
        customerAccountId:manifest.accountIds[0],rating:5,body:'가상 리뷰',
        idempotencyKey:randomUUID() });
      await approveReview(pool,{ reviewId:review.id,adminAccountId:manifest.accountIds[4],
        idempotencyKey:randomUUID() });
      await reportReview(pool,{ reviewId:review.id,customerAccountId:manifest.accountIds[1],
        reason:'가상 신고' });
      const claim = await createClaim(pool,{ customerAccountId:manifest.accountIds[0],
        orderId:manifest.orderId,shipmentOrderId:manifest.shipmentId,
        optionId:manifest.optionId,kind:'RETURN',reasonCode:'damaged',
        reason:'가상 훼손 클레임',quantity:1,idempotencyKey:randomUUID() });
      const store = new ImageQuarantine(supportUiUploadRoot(runId));
      const bytes = await sharp({ create:{ width:2,height:2,channels:3,
        background:{ r:100,g:50,b:20 } } }).png().toBuffer();
      const evidence = await addClaimEvidence(pool,{ claimId:claim.id,
        customerAccountId:manifest.accountIds[0],idempotencyKey:randomUUID(),
        bytes,mimeType:'image/png',store });
      assert.ok(evidence.id);
      await replyToClaim(pool,{ claimId:claim.id,sellerId:manifest.sellerIds[0],
        actorAccountId:manifest.accountIds[2],body:'가상 답변',idempotencyKey:randomUUID() });
      await approveClaim(pool,{ claimId:claim.id,adminAccountId:manifest.accountIds[4],
        reason:'가상 승인',idempotencyKey:randomUUID() },
      { APP_ENV:'development',PAYMENT_MODE:'mock' });
      const refund = (await pool.query(`SELECT id FROM refund_cases
        WHERE post_shipment_claim_id=$1`,[claim.id])).rows[0];
      assert.ok(refund?.id);
      await executeMockRefundCase(pool,refund.id);

      const badAudit = (await pool.query(`INSERT INTO audit_events
        (actor_account_id,active_role,action,target_type,target_id)
        VALUES ($1,'admin','qa.foreign','account',$2) RETURNING id`,
      [manifest.accountIds[4],randomUUID()])).rows[0].id;
      await assert.rejects(runSupportUiFixture('reset',runId,databaseUrl,password,
        JSON.stringify(manifest),systemId),/foreign audit/);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM audit_events WHERE id=$1',
        [badAudit])).rows[0].n,1);
      await pool.query('DELETE FROM audit_events WHERE id=$1',[badAudit]);

      const rogue = join(supportUiUploadRoot(runId),'quarantine','foreign.webp');
      await writeFile(rogue,Buffer.from('foreign test file'));
      await assert.rejects(runSupportUiFixture('reset',runId,databaseUrl,password,
        JSON.stringify(manifest),systemId),/foreign image (key|file)/);
      await unlink(rogue);

      const image = (await pool.query(`SELECT id,object_key FROM support_claim_evidence
        WHERE id=$1`,[evidence.id])).rows[0];
      await pool.query('UPDATE support_claim_evidence SET object_key=$2 WHERE id=$1',
        [evidence.id,`quarantine/${randomUUID()}.webp`]);
      await assert.rejects(runSupportUiFixture('reset',runId,databaseUrl,password,
        JSON.stringify(manifest),systemId),/foreign image (key|file)/);
      await pool.query('UPDATE support_claim_evidence SET object_key=$2 WHERE id=$1',
        [evidence.id,image.object_key]);

      await pool.query('UPDATE fulfillment_settings SET version=version+1 WHERE id=1');
      await assert.rejects(runSupportUiFixture('reset',runId,databaseUrl,password,
        JSON.stringify(manifest),systemId),/setting ownership/);
      await pool.query('UPDATE fulfillment_settings SET version=$1 WHERE id=1',
        [manifest.previousFulfillmentSetting.version+1]);
      const removed = await runSupportUiFixture('reset',runId,databaseUrl,password,
        JSON.stringify(manifest),systemId);
      assert.deepEqual(removed,{ accounts:5,sellers:2,products:1,orders:1,shipments:1 });
      manifest = undefined;
      await assert.rejects(lstat(manifestPath),(error) => error?.code === 'ENOENT');
      const residue = (await pool.query(`SELECT
        (SELECT count(*)::int FROM accounts) AS accounts,
        (SELECT count(*)::int FROM support_questions) AS questions,
        (SELECT count(*)::int FROM support_reviews) AS reviews,
        (SELECT count(*)::int FROM support_claims) AS claims,
        (SELECT count(*)::int FROM support_claim_evidence) AS evidence,
        (SELECT count(*)::int FROM refund_cases) AS refunds,
        (SELECT count(*)::int FROM refund_events) AS refund_events,
        (SELECT count(*)::int FROM audit_events) AS audits`)).rows[0];
      assert.ok(Object.values(residue).every((n) => n === 0),JSON.stringify(residue));
      assert.deepEqual(await publicTableCounts(pool),initialCounts);
      assert.deepEqual((await pool.query(`SELECT owool_seller_id,updated_by,
        version,updated_at::text FROM fulfillment_settings WHERE id=1`)).rows[0],
      initialSetting);
      await assert.rejects(lstat(supportUiUploadRoot(runId)),
        (error) => error?.code === 'ENOENT');
    } catch (error) { originalFailure = error; }
    finally {
      let cleanupFailure;
      try {
        if (manifest) {
          await runSupportUiFixture('reset',runId,databaseUrl,password,
            JSON.stringify(manifest),systemId);
        }
      } catch (error) { cleanupFailure = error; }
      finally { await pool.end(); }
      if (cleanupFailure && originalFailure)
        throw new AggregateError([originalFailure,cleanupFailure],
          'S5.2 fixture test failed and signed cleanup left exact QA residue');
      if (cleanupFailure) throw cleanupFailure;
    }
    if (originalFailure) throw originalFailure;
  });
