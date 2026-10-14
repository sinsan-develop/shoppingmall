import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LoginPage from '../app/login/page.tsx';
import { KakaoMockLogin, KakaoMockAuthorize, KakaoMockReturn } from '../components/KakaoMockLogin.tsx';

test('role login keeps customer, seller and operator paths distinct', () => {
  const html = renderToStaticMarkup(createElement(LoginPage));
  for (const label of ['이메일', '비밀번호', '구매자', '판매자', '운영자', '로그인']) {
    assert.match(html, new RegExp(label));
  }
  assert.doesNotMatch(html, /시험 코드|0000/);
});

test('카카오 모의 인증은 명시된 개발 고객 화면에서만 표시한다',()=>{
  for(const props of [{enabled:false,customer:true},{enabled:true,customer:false}])
    assert.doesNotMatch(renderToStaticMarkup(createElement(KakaoMockLogin,props)),/카카오 모의 로그인/);
  const html=renderToStaticMarkup(createElement(KakaoMockLogin,{enabled:true,customer:true}));
  assert.match(html,/카카오 모의 로그인/);assert.match(html,/실제 카카오/);
  assert.doesNotMatch(html,/mock:s7|verifier|decisionTicket/);
});
test('모의 공급자와 복귀 화면은 code 없는 정적 안내를 표시한다',()=>{
  const authorize=renderToStaticMarkup(createElement(KakaoMockAuthorize));
  assert.match(authorize,/가상 고객/);assert.match(authorize,/승인/);assert.match(authorize,/취소/);assert.match(authorize,/실패/);
  const returned=renderToStaticMarkup(createElement(KakaoMockReturn));assert.match(returned,/복귀/);
  assert.doesNotMatch(authorize+returned,/mock:s7|decisionTicket|verifier/);
});
