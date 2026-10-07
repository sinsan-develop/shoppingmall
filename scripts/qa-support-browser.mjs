// Actual Chrome/CDP QA against the run-scoped S5.2 isolated database only.
import assert from 'node:assert/strict';
import { lstat, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateSupportUiManifest } from '../apps/api/scripts/qa-support-ui-fixture.ts';
import { closeCdpPage, createCdpCommandChannel, openCdpPage,
  visitKeyboardTargets } from './qa-browser-cdp.mjs';
import { assertSupportBrowserBounds,browserClaimStatusVisibleExpression,
  browserNavigationReadyExpression,inspectListDetail } from
  './qa-support-browser-contract.mjs';

const candidate = JSON.parse(process.env.QA_FIXTURE_JSON ?? 'null');
const password = process.env.QA_FIXTURE_PASSWORD;
if (!candidate?.runId || !password) throw new Error('Signed S5.2 fixture is required');
const fixture = validateSupportUiManifest(candidate.runId,candidate,password);
const { web,debugging,evidenceDir,attempt } =
  assertSupportBrowserBounds(process.env,fixture.runId);
const api = 'http://127.0.0.1:9092';
const widths = [
  { width:1920,height:1080,name:'1920' },
  { width:1440,height:900,name:'1440' },
  { width:430,height:844,name:'430' },
];

let page;
let socket;
let channel;
function send(method,params = {}) { return channel.send(method,params); }

async function evaluate(expression) {
  const result = await send('Runtime.evaluate',{
    expression,returnByValue:true,awaitPromise:true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(expression,label,timeoutMs = 20_000) {
  const deadline = Date.now()+timeoutMs;
  while (Date.now()<deadline) {
    try { if (await evaluate(`Boolean(${expression})`)) return; }
    catch (error) { if (!String(error).includes('context')) throw error; }
    await new Promise((resolve) => setTimeout(resolve,150));
  }
  throw new Error(`Timed out: ${label}`);
}

async function navigate(route) {
  await send('Page.navigate',{ url:`${web}${route}` });
  await waitFor(browserNavigationReadyExpression(route),`navigation ${route}`);
}

async function hydrated(selector) {
  await waitFor(`(() => { const target=document.querySelector(${JSON.stringify(selector)});
    return Boolean(target && Object.keys(target).some((key)=>key.startsWith('__reactProps$')));
  })()`,`hydration ${selector}`);
}

async function setInput(selector,value) {
  await hydrated(selector);
  assert.equal(await evaluate(`(() => {
    const input=document.querySelector(${JSON.stringify(selector)});
    if (!input) return false;
    const proto=input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype :
      input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(input,${JSON.stringify(value)});
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  })()`),true);
}

async function click(selector) {
  await hydrated(selector);
  assert.equal(await evaluate(`(() => { const target=document.querySelector(${JSON.stringify(selector)});
    if (!target || target.disabled) return false; target.click(); return true; })()`),true);
}

async function submit(selector) {
  await hydrated(selector);
  assert.equal(await evaluate(`(() => { const target=document.querySelector(${JSON.stringify(selector)});
    if (!target?.closest('form')) return false; target.closest('form').requestSubmit();
    return true; })()`),true);
}

async function clearSession() {
  await send('Network.clearBrowserCookies');
  await send('Storage.clearDataForOrigin',{
    origin:new URL(web).origin,storageTypes:'local_storage',
  });
}

async function login(role,email) {
  await clearSession();
  await navigate('/login');
  await waitFor("document.querySelector('#login-role') && document.querySelector('#login-email')",
    `${role} login form`);
  await setInput('#login-role',role);
  await setInput('#login-email',email);
  await setInput('#login-password',password);
  await submit('#login-password');
  await waitFor("location.pathname==='/account'",`${role} login`);
}

async function browserJson(route,options = {}) {
  return evaluate(`(async () => { const response=await fetch(${JSON.stringify(api+route)},
    { credentials:'include',cache:'no-store',...${JSON.stringify(options)} });
    return { status:response.status,body:await response.json().catch(()=>null) }; })()`);
}

async function evidence(label) {
  const headings = { 'customer-claim':'#customer-claim-detail-title',
    'seller-claim':'#seller-claims-detail-title',
    'admin-claim':'#claim-detail-heading',
    'admin-review-hidden':'#admin-review-detail-title' };
  for (const size of widths) {
    await send('Emulation.setDeviceMetricsOverride',{
      width:size.width,height:size.height,deviceScaleFactor:1,mobile:size.width===430,
    });
    const dimensions = await evaluate(`({width:innerWidth,
      scrollWidth:document.documentElement.scrollWidth,
      heading:document.querySelector('h1')?.textContent??''})`);
    assert.equal(dimensions.width,size.width);
    assert.ok(dimensions.scrollWidth<=size.width,
      `${label} ${size.name}px overflow ${dimensions.scrollWidth}`);
    const count = await evaluate(`(() => { const selector='a[href],button:not([disabled]),' +
      'input:not([disabled]),select:not([disabled]),textarea:not([disabled]),' +
      '[tabindex]:not([tabindex="-1"])';
      const nodes=[...document.querySelectorAll(selector)].filter((node)=>{
        const style=getComputedStyle(node),rect=node.getBoundingClientRect();
        return style.display!=='none'&&style.visibility!=='hidden'&&rect.width>0&&rect.height>0;
      });
      nodes.forEach((node,index)=>node.dataset.qaFocusIndex=String(index));
      document.body.tabIndex=-1; document.body.focus(); return nodes.length; })()`);
    assert.ok(count>0,`${label} has no keyboard target`);
    const visited=await visitKeyboardTargets(count,async()=>{
      await send('Input.dispatchKeyEvent',{
        type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,
      });
      await send('Input.dispatchKeyEvent',{
        type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,
      });
      return evaluate('document.activeElement?.dataset?.qaFocusIndex??null');
    });
    assert.equal(visited.size,count,
      `${label} ${size.name}px keyboard ${visited.size}/${count}`);
    await evaluate(`document.querySelector(${JSON.stringify(headings[label])})
      ?.scrollIntoView({block:'start'}); true`);
    const image=await send('Page.captureScreenshot',{
      format:'png',captureBeyondViewport:false,
    });
    await writeFile(path.join(evidenceDir,`${attempt}-${label}-${size.name}.png`),
      Buffer.from(image.data,'base64'),{ flag:'wx' });
  }
}

async function uploadClaimEvidence() {
  await hydrated('#claim-evidence-file');
  assert.equal(await evaluate(`(async () => {
    const input=document.querySelector('#claim-evidence-file');
    const canvas=document.createElement('canvas'); canvas.width=2; canvas.height=2;
    canvas.getContext('2d').fillRect(0,0,2,2);
    const blob=await new Promise((resolve)=>canvas.toBlob(resolve,'image/png'));
    if (!blob || !input) return false;
    const files=new DataTransfer();
    files.items.add(new File([blob],'qa-private-evidence.png',{type:'image/png'}));
    input.files=files.files;
    input.dispatchEvent(new Event('change',{bubbles:true}));
    input.closest('form').requestSubmit();
    return true;
  })()`),true);
}

async function assertEvidenceResponse(route,expectedStatus) {
  const status=await evaluate(`fetch(${JSON.stringify(api+route)},
    {credentials:'include',cache:'no-store'}).then((response)=>response.status)`);
  assert.equal(status,expectedStatus,`private evidence boundary ${route}`);
}

const evidenceStat=await lstat(evidenceDir);
assert.ok(evidenceStat.isDirectory()&&!evidenceStat.isSymbolicLink());
assert.equal((await realpath(evidenceDir)).toLowerCase(),path.resolve(evidenceDir).toLowerCase());
const existingEvidence=await readdir(evidenceDir);
if (existingEvidence.some((name) =>
  !/^(?:r[1-9]-)?(?:customer-claim|seller-claim|admin-claim|admin-review-hidden)-(?:1920|1440|430)\.png$/.test(name)))
  throw new Error('S5.2 evidence folder contains an unrelated file');

try {
  ({ page,socket }=await openCdpPage({ debugging }));
  channel=createCdpCommandChannel(socket,{ timeoutMs:10_000 });
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');

  await login('customer',fixture.emails[1]);
  await navigate(`/products/${fixture.productId}`);
  await setInput('#product-question-text','구매 전 가상 원산지 문의');
  await submit('#product-question-text');
  await waitFor("document.body.innerText.includes('문의를 접수했습니다')",'pre-purchase question');

  await login('seller',fixture.emails[3]);
  await navigate('/account/seller/support');
  await waitFor("document.querySelector('#seller-question-list-title')",'owool seller question list');
  await waitFor("document.body.innerText.includes('접수된 문의가 없습니다')",'owool no product question');
  assert.equal((await browserJson('/seller/support/questions?limit=20')).body.items.length,0);

  await login('seller',fixture.emails[2]);
  await navigate('/account/seller/support');
  await inspectListDetail(
    () => waitFor("document.body.innerText.includes('구매 전 가상 원산지 문의')",
      'product seller question list'),
    () => click('section[aria-labelledby="seller-question-list-title"] button'),
    () => waitFor("document.querySelector('#seller-question-reply')",
      'product seller question detail'));
  await setInput('#seller-question-reply','가상 산지의 상품입니다');
  await submit('#seller-question-reply');
  await waitFor("document.body.innerText.includes('답변을 저장했습니다')",'seller question reply');

  await login('admin',fixture.emails[4]);
  await navigate('/account/admin/support/questions');
  await inspectListDetail(
    () => waitFor("document.body.innerText.includes('구매 전 가상 원산지 문의')",
      'admin answered list'),
    () => click('section[aria-labelledby="admin-question-list-title"] button'),
    () => waitFor("document.body.innerText.includes('가상 산지의 상품입니다')",
      'admin answer detail'));
  await click('section[aria-labelledby="admin-question-detail-title"] button');
  await waitFor("document.body.innerText.includes('질문을 상품 Q&A에 공개했습니다')",'admin publishes Q&A');

  await login('customer',fixture.emails[0]);
  await navigate(`/products/${fixture.productId}`);
  await waitFor("document.body.innerText.includes('가상 산지의 상품입니다')",'public Q&A');
  const confirmation=await browserJson('/customer/support/confirmations',{
    method:'POST',headers:{ 'content-type':'application/json',
      'idempotency-key':crypto.randomUUID() },
    body:JSON.stringify({ orderId:fixture.orderId,shipmentOrderId:fixture.shipmentId,
      optionId:fixture.optionId }),
  });
  assert.equal(confirmation.status,200,'approved API-assisted purchase confirmation');
  const review=await browserJson('/customer/support/reviews',{
    method:'POST',headers:{ 'content-type':'application/json',
      'idempotency-key':crypto.randomUUID() },
    body:JSON.stringify({ confirmationId:confirmation.body.id,rating:5,
      text:'가상 구매 확인 리뷰' }),
  });
  assert.equal(review.status,200,'approved API-assisted text review');

  await navigate('/account/customer');
  await setInput('#pending-order-id',fixture.orderId);
  await submit('#pending-order-id');
  await waitFor(`document.querySelector(${JSON.stringify(`#claim-reason-${fixture.optionId}`)})`,
    'customer SHIPPED claim form');
  await setInput(`#claim-code-${fixture.optionId}`,'damaged');
  await setInput(`#claim-reason-${fixture.optionId}`,'가상 훼손 반품 요청');
  await submit(`#claim-reason-${fixture.optionId}`);
  await waitFor("document.body.innerText.includes('클레임을 접수했습니다')",'customer claim');
  await inspectListDetail(
    () => waitFor("document.querySelector('section[aria-labelledby=\"customer-claims-title\"] button')",
      'customer claim list'),
    () => click('section[aria-labelledby="customer-claims-title"] button'),
    () => waitFor("document.querySelector('#claim-evidence-file')",
      'customer evidence form'));
  await uploadClaimEvidence();
  await waitFor("document.body.innerText.includes('비공개 증빙을 등록했습니다')",'private evidence');
  await evidence('customer-claim');
  const claims=await browserJson('/customer/support/claims?limit=20');
  assert.equal(claims.status,200);
  assert.equal(claims.body.items.length,1);
  const claimId=claims.body.items[0].id;
  const detail=await browserJson(`/customer/support/claims/${claimId}`);
  assert.equal(detail.status,200);
  assert.equal(detail.body.evidence.length,1);
  assert.equal(JSON.stringify(detail.body).includes('quarantine/'),false);
  const evidenceRoute=`/customer/support/claims/${claimId}/evidence/${detail.body.evidence[0].id}`;
  await assertEvidenceResponse(evidenceRoute,200);

  await login('customer',fixture.emails[1]);
  await assertEvidenceResponse(evidenceRoute,404);
  assert.equal((await browserJson(`/customer/support/claims/${claimId}`)).status,404);

  await login('seller',fixture.emails[3]);
  await navigate('/account/seller/support');
  await waitFor("document.querySelector('#seller-claims-list-title')",'owool claims');
  await waitFor("document.body.innerText.includes('접수된 클레임이 없습니다')",'owool no product claim');
  assert.equal((await browserJson(`/seller/support/claims/${claimId}`)).status,404);

  await login('seller',fixture.emails[2]);
  await navigate('/account/seller/support');
  await inspectListDetail(
    () => waitFor("document.querySelector('section[aria-labelledby=\"seller-claims-list-title\"] button')",
      'product seller claim list'),
    () => click('section[aria-labelledby="seller-claims-list-title"] button'),
    () => waitFor("document.body.innerText.includes('가상 훼손 반품 요청')",
      'product seller claim detail'));
  await waitFor("document.querySelector('#seller-claim-reply')",'seller claim detail');
  await setInput('#seller-claim-reply','가상 판매자 확인 답변');
  await submit('#seller-claim-reply');
  await waitFor("document.body.innerText.includes('답변과 이력을 저장했습니다')",'seller claim reply');
  await evidence('seller-claim');

  await login('admin',fixture.emails[4]);
  await navigate('/account/admin/support/claims');
  await inspectListDetail(
    () => waitFor("document.querySelector('section[aria-labelledby=\"claim-list-heading\"] button')",
      'admin claim list'),
    () => click('section[aria-labelledby="claim-list-heading"] button'),
    () => waitFor("document.body.innerText.includes('가상 훼손 반품 요청') && document.querySelector('#claim-approve-reason')",
      'admin claim detail'));
  await setInput('#claim-approve-reason','가상 출고 후 정책에 따른 승인');
  await submit('#claim-approve-reason');
  await waitFor("document.body.innerText.includes('최종 결정과 모의 환불 결과를 반영했습니다')",
    'admin mock verified refund');
  await waitFor(browserClaimStatusVisibleExpression('REFUNDED'),'refunded claim');
  await evidence('admin-claim');

  await navigate('/account/admin/support/reviews');
  await inspectListDetail(
    () => waitFor("document.body.innerText.includes('가상 구매 확인 리뷰')",
      'admin pending review list'),
    () => click('section[aria-labelledby="admin-reviews-list-title"] button'),
    () => waitFor("document.body.innerText.includes('이미지가 없습니다')",
      'text-only review detail'));
  await click('section[aria-labelledby="admin-review-detail-title"] button');
  await waitFor("document.body.innerText.includes('리뷰를 공개했습니다')",'admin review approval');

  await login('customer',fixture.emails[1]);
  await navigate(`/products/${fixture.productId}`);
  await waitFor("document.body.innerText.includes('가상 구매 확인 리뷰')",'public review');
  await setInput(`#review-report-${review.body.id}`,'가상 고객 신고 사유');
  await submit(`#review-report-${review.body.id}`);
  await waitFor("document.body.innerText.includes('신고가 접수되었습니다')",'customer report');

  await login('admin',fixture.emails[4]);
  await navigate('/account/admin/support/reviews');
  await setInput('#admin-review-status','APPROVED');
  await inspectListDetail(
    () => waitFor("document.body.innerText.includes('가상 구매 확인 리뷰')",
      'admin reported review list'),
    () => click('section[aria-labelledby="admin-reviews-list-title"] button'),
    () => waitFor("document.body.innerText.includes('가상 고객 신고 사유')",
      'admin report history'));
  await setInput('#admin-review-hide-reason','가상 운영 숨김 사유');
  await submit('#admin-review-hide-reason');
  await waitFor("document.body.innerText.includes('리뷰를 숨겼습니다')",'admin review hide');
  await evidence('admin-review-hidden');
  await login('customer',fixture.emails[1]);
  await navigate(`/products/${fixture.productId}`);
  await waitFor("document.body.innerText.includes('공개된 리뷰가 없습니다')",'hidden review excluded');

  console.info('browser: S5.2 customer, product seller, owool seller and admin paths PASS');
  console.info('browser: Q&A, private claim evidence, mock refund, text review report/hide PASS');
  console.info('browser: 1920, 1440, 430 and keyboard checks PASS');
} finally {
  const errors=await closeCdpPage({ debugging,page,socket });
  await new Promise((resolve)=>setTimeout(resolve,100));
  if (errors.length) throw new AggregateError(errors,'S5.2 Chrome page cleanup failed');
}
