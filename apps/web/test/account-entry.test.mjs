import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LoginPage from '../app/login/page.tsx';
import SignupPage from '../app/signup/page.tsx';
import ForgotPasswordPage from '../app/forgot-password/page.tsx';
import ResetPasswordPage from '../app/reset-password/page.tsx';
import AdminSetupPage from '../app/admin-setup/page.tsx';
import SellerApplyPage from '../app/account/seller/apply/page.tsx';
import AdminSellerApplicationsPage from '../app/account/admin/seller-applications/page.tsx';
import { AccountRoleLinks } from '../app/account/page.tsx';

const render = (page) => renderToStaticMarkup(createElement(page));

test('account entry is role-specific, labelled and includes signup and recovery links', () => {
  const login = render(LoginPage);
  assert.match(login, /href="\/signup"/);
  assert.match(login, /href="\/forgot-password"/);
  assert.match(login, /접속 역할/);
  assert.match(login, /운영자/);
  const signup = render(SignupPage);
  assert.match(signup, /이메일/);
  assert.match(signup, /확인/);
  assert.doesNotMatch(signup, /관리자 가입/);
  assert.match(render(ForgotPasswordPage), /비밀번호 찾기/);
  assert.match(render(ResetPasswordPage), /새 비밀번호/);
  assert.match(render(AdminSetupPage), /관리자.*비밀번호/);
  assert.match(render(SellerApplyPage), /판매자 신청/);
  assert.match(render(AdminSellerApplicationsPage), /판매자 신청.*심사/);
});

test('buyer and admin account menus expose only their respective seller workflows', () => {
  const buyer = renderToStaticMarkup(createElement(AccountRoleLinks, { role: 'customer' }));
  const admin = renderToStaticMarkup(createElement(AccountRoleLinks, { role: 'admin' }));
  assert.match(buyer, /href="\/account\/seller\/apply"/);
  assert.doesNotMatch(buyer, /account\/admin\/seller-applications/);
  assert.match(admin, /href="\/account\/admin\/seller-applications"/);
  assert.doesNotMatch(admin, /account\/seller\/apply/);
});

test('one-time browser links are removed from the address bar before submission', () => {
  for (const file of ['../app/signup/page.tsx', '../app/reset-password/page.tsx',
    '../app/admin-setup/page.tsx']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /window\.location\.hash/);
    assert.match(source, /history\.replaceState/);
    assert.doesNotMatch(source, /localStorage|sessionStorage/);
  }
});
