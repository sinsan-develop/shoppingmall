import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('./', import.meta.url);
const read = (name) => readFileSync(new URL(name, root), 'utf8');
const roles = ['customer', 'seller', 'admin'];

for (const role of roles) {
  test(`${role} has an independent local entry point`, () => {
    const html = read(`${role}.html`);
    const script = read(`${role}.js`);
    assert.match(html, /href="shared\.css"/);
    assert.match(html, new RegExp(`<script defer src="${role}\\.js"><\\/script>`));
    assert.match(html, new RegExp(`data-${role}-prototype`));
    assert.match(html, /가상/);
    assert.match(html, /data-action="reset"[^>]*>처음부터 다시 보기/);
    for (const other of roles.filter((item) => item !== role)) {
      assert.doesNotMatch(html, new RegExp(`src="${other}\\.js"`));
      assert.doesNotMatch(script, new RegExp(`require\\(['"]\\./${other}`));
    }
    assert.doesNotMatch(script, /\b(localStorage|sessionStorage|fetch|XMLHttpRequest)\b/);
    assert.doesNotMatch(html, /<script[^>]+src="https?:\/\//);
  });
}

test('review guide links each prototype and states the mock boundary', () => {
  const guide = read('README.md');
  for (const role of roles) assert.match(guide, new RegExp(`\\(${role}\\.html\\)`));
  assert.match(guide, /새로고침/);
  assert.match(guide, /실제 결제/);
  assert.match(guide, /브라우저.*미검증/);
});

test('review guide retains v1 and links adopted flat v2 comparisons', () => {
  const guide = read('README.md');
  for (const role of roles) {
    assert.match(guide, new RegExp(`\\(${role}\\.html\\)`));
    assert.match(guide, new RegExp(`\\(flat-v2/${role}\\.html\\)`));
  }
  assert.match(guide, /home-flat-v2\.html/);
  assert.match(guide, /제품 시각 기준으로 채택/);
  assert.match(guide, /실제 브라우저.*미검증/);
  assert.match(guide, /실제 결제/);
});

test('customer checkout heading uses the current shipment count', () => {
  assert.match(read('customer.html'), /data-shipment-count/);
  assert.match(read('customer.js'), /\[data-shipment-count\]/);
});
