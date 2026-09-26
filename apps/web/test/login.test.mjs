import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LoginPage from '../app/login/page.tsx';

test('role login keeps customer, seller and operator paths distinct', () => {
  const html = renderToStaticMarkup(createElement(LoginPage));
  for (const label of ['이메일', '비밀번호', '구매자', '판매자', '운영자', '로그인']) {
    assert.match(html, new RegExp(label));
  }
  assert.doesNotMatch(html, /시험 코드|0000/);
});
