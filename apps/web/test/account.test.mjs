import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AccountPage from '../app/account/page.tsx';

test('account entry explains authenticated role without exposing data before session check', () => {
  const html = renderToStaticMarkup(createElement(AccountPage));
  assert.match(html, /계정 확인 중/);
  assert.doesNotMatch(html, /qa\+|010-\d/);
});
