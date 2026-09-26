import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');
const bodyMarkup = (html) => html.match(/<body\b[\s\S]*?<\/body>/)?.[0];
const normalizeLineEndings = (value) => value.replace(/\r\n/g, '\n');

for (const role of ['customer', 'seller', 'admin']) {
  test(`${role} flat page keeps the same flow and local role script`, () => {
    const flatHtml = read(`${role}.html`);
    const originalHtml = read(`../${role}.html`);
    assert.match(flatHtml, /href="\.\.\/shared\.css"[\s\S]*href="\.\.\/\.\.\/assets\/owool-flat-v2\.css"/);
    assert.match(flatHtml, new RegExp(`src="\\.\\./${role}\\.js"`));
    assert.match(flatHtml, /<body\b[^>]*\bdata-flat-v2\b[^>]*>/);
    const flatBody = bodyMarkup(flatHtml).replace(' data-flat-v2', '');
    assert.equal(normalizeLineEndings(flatBody), normalizeLineEndings(bodyMarkup(originalHtml)));
  });
}
