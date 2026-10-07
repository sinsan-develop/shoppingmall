import { supportUiDatabaseName } from '../apps/api/scripts/qa-support-ui-fixture.ts';

export function assertSupportBrowserBounds(env,runId,platform = process.platform) {
  if (platform !== 'win32' || !/^[0-9a-f]{8}$/.test(runId))
    throw new Error('S5.2 browser requires the exact Windows QA run');
  const evidenceDir = `D:\\tmp\\shoppingmall-s52-browser-${runId}-evidence`;
  if (env.QA_WEB_BASE !== 'http://127.0.0.1:9091' ||
      env.QA_CHROME_DEBUGGING !== 'http://127.0.0.1:9229' ||
      env.QA_BROWSER_CONSENT !== `S52_ISOLATED_SUPPORT_${runId}` ||
      env.QA_EVIDENCE_DIR !== evidenceDir ||
      !/^r[1-9]$/.test(env.QA_BROWSER_ATTEMPT ?? ''))
    throw new Error('S5.2 browser inputs must match the isolated run');
  return { web:env.QA_WEB_BASE,debugging:env.QA_CHROME_DEBUGGING,
    evidenceDir,attempt:env.QA_BROWSER_ATTEMPT };
}

export function assertSupportResumeTarget(env,runId) {
  const flow = env.QA_SUPPORT_FLOW ?? 'normal';
  if (flow === 'normal') return null;
  if (flow !== 'resume') throw new Error('Unknown S5.2 browser flow');
  const url = new URL(env.DATABASE_URL ?? '');
  const database = supportUiDatabaseName(runId);
  if (!['postgres:','postgresql:'].includes(url.protocol) ||
      url.hostname !== '127.0.0.1' || url.port !== '15439' ||
      decodeURIComponent(url.pathname.slice(1)) !== database ||
      url.username !== 'postgres' || !url.password ||
      !/^\d{10,}$/.test(env.S52_SUPPORT_UI_DB_SYSTEM_ID ?? ''))
    throw new Error('S5.2 resume requires the exact isolated PostgreSQL target');
  return { database,systemId:env.S52_SUPPORT_UI_DB_SYSTEM_ID,
    databaseUrl:env.DATABASE_URL };
}

export async function inspectListDetail(waitList,openDetail,waitDetail) {
  await waitList();
  await openDetail();
  await waitDetail();
}
import { claimStatusLabel } from '../apps/web/app/account/support-claim-labels.ts';


export function browserClaimStatusVisibleExpression(status) {
  return `document.body.innerText.includes(${JSON.stringify(claimStatusLabel(status))})`;
}

export function browserSelectedClaimStatusExpression(status) {
  return `document.querySelector('section[aria-labelledby="claim-detail-heading"] strong')` +
    `?.textContent?.trim()===${JSON.stringify(claimStatusLabel(status))}`;
}

export function browserNavigationReadyExpression(route) {
  return `location.pathname===${JSON.stringify(route)} && ` +
    "document.readyState!=='loading' && Boolean(document.body)";
}
