import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CustomerProfilePage from '../app/account/customer/page.tsx';
import { DeletionRequestControls } from '../app/account/customer/deletion-request-controls.tsx';

test('customer profile starts private and offers address, consent and deletion-request sections', () => {
  const html = renderToStaticMarkup(createElement(CustomerProfilePage));
  assert.match(html, /고객 정보 확인 중/);
  assert.doesNotMatch(html, /010-\d|qa\+/);
});

test('deletion request requires an in-page confirmation with cancel and explicit submit', () => {
  const callbacks = { onBegin() {}, onCancel() {}, onConfirm() {} };
  const initial = renderToStaticMarkup(createElement(DeletionRequestControls,
    { ...callbacks, confirming: false, busy: false }));
  assert.match(initial, /탈퇴 요청 접수/);
  assert.doesNotMatch(initial, /요청 접수 확인/);
  const confirmation = renderToStaticMarkup(createElement(DeletionRequestControls,
    { ...callbacks, confirming: true, busy: false }));
  assert.match(confirmation, /탈퇴 요청 확인/);
  assert.match(confirmation, /실제 계정 삭제는 운영 검토 후 진행됩니다/);
  assert.match(confirmation, /요청 접수 확인/);
  assert.match(confirmation, /취소/);
  assert.doesNotMatch(confirmation, /window\.confirm/);
});
