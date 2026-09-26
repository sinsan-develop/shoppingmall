import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import Page from '../app/page.tsx';

test('web entry point identifies the real build without pretending to sell', () => {
  const html = renderToStaticMarkup(Page());
  assert.match(html, /어울몰/);
  assert.match(html, /서비스 구축 중/);
  assert.doesNotMatch(html, /결제하기/);
});
