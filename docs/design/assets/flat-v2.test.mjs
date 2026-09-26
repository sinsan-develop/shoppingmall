import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), 'utf8');
const bodyMarkup = (html) => html.match(/<body\b[\s\S]*?<\/body>/)?.[0];

test('flat home preserves v1 content and loads styles in order', () => {
  const flatHome = read('home-flat-v2.html');
  const originalHome = read('home-v1.html');
  assert.match(flatHome, /href="owool-static-v1\.css"[\s\S]*href="owool-flat-v2\.css"/);
  assert.match(flatHome, /<body data-flat-v2>/);
  const flatBody = bodyMarkup(flatHome).replace('<body data-flat-v2>', '<body>').replace(/\r\n/g, '\n');
  const originalBody = bodyMarkup(originalHome).replace(/\r\n/g, '\n');
  assert.equal(flatBody, originalBody);
});

test('flat rules are scoped and remove depth without changing type sizes', () => {
  const flatCss = read('owool-flat-v2.css');
  assert.match(flatCss, /body\[data-flat-v2\]/);
  assert.match(flatCss, /box-shadow:\s*none/);
  assert.doesNotMatch(flatCss, /font-size\s*:/);
});
