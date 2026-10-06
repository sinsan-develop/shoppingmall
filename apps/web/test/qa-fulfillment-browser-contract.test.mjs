import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const scriptUrl = new URL('../../../scripts/qa-fulfillment-browser.mjs', import.meta.url);

test('fulfillment browser runner covers three roles, three viewports and keyboard use', async () => {
  const source = await readFile(scriptUrl, 'utf8');
  for (const role of ['customer', 'seller', 'admin']) assert.match(source, new RegExp(`['\"]${role}['\"]`));
  for (const width of [1920, 1440, 430]) assert.match(source, new RegExp(`width:\\s*${width}`));
  assert.match(source, /Input\.dispatchKeyEvent/);
  assert.match(source, /scrollWidth/);
  assert.match(source, /QA_FIXTURE_JSON/);
  assert.match(source, /QA_CHROME_DEBUGGING/);
  assert.doesNotMatch(source, /sms|email provider|push provider|payment provider/i);
});
