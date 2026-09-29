import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pages = [
  'page.tsx', 'login/page.tsx', 'products/page.tsx', 'products/[productId]/page.tsx',
  'account/page.tsx', 'account/customer/page.tsx', 'account/seller/products/page.tsx',
  'account/seller/shipping/page.tsx', 'account/admin/catalog/page.tsx',
  'account/admin/proposals/page.tsx', 'account/admin/shipping/page.tsx',
];

test('every product route has one keyboard skip target and a visible focused skip link', () => {
  const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
  assert.match(layout, /<body>\s*<a[^>]+href="#main-content"[^>]*>본문으로 건너뛰기<\/a>/);
  for (const page of pages) {
    const source = readFileSync(new URL(`../app/${page}`, import.meta.url), 'utf8');
    assert.match(source, /<main id="main-content" tabIndex=\{-1\}/, page);
  }
  const css = readFileSync(new URL('../app/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.skip-link:focus-visible\s*\{[^}]*top:\s*12px/);
});
