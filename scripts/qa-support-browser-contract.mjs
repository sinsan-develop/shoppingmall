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

export async function inspectListDetail(waitList,openDetail,waitDetail) {
  await waitList();
  await openDetail();
  await waitDetail();
}
