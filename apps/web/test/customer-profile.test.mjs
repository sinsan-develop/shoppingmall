import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CustomerProfilePage from '../app/account/customer/page.tsx';

test('customer profile starts private and offers address, consent and deletion-request sections', () => {
  const html = renderToStaticMarkup(createElement(CustomerProfilePage));
  assert.match(html, /고객 정보 확인 중/);
  assert.doesNotMatch(html, /010-\d|qa\+/);
});
