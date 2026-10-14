import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LoginPage from '../app/login/page.tsx';
import { KakaoMockLogin, KakaoMockAuthorize, KakaoMockReturn } from '../components/KakaoMockLogin.tsx';

test('개발 StrictMode 재실행 뒤에도 fragment를 남기지 않고 명시 승인만 한 번 처리한다',async t=>{
  // Reuse existing renderer/build dependencies; no new SDK or test dependency.
  const localRequire=createRequire(import.meta.url),mobileRequire=createRequire(new URL('../../mobile/package.json',import.meta.url));
  const {build}=mobileRequire('esbuild'),React=localRequire('react'),{act,create}=mobileRequire('react-test-renderer');
  const bundle=await build({stdin:{contents:'export {KakaoMockAuthorize} from "./components/KakaoMockLogin";',
    resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',
    external:['react','react/jsx-runtime'],define:{'process.env.NODE_ENV':'"development"','process.env.NEXT_PUBLIC_ENABLE_KAKAO_MOCK':'"1"'}});
  const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(localRequire,mod,mod.exports);
  const origin='http://127.0.0.1:9091',id='T'.repeat(43),ticket='D'.repeat(43),requests=[],redirects=[];
  const previous={window:globalThis.window,fetch:globalThis.fetch,act:globalThis.IS_REACT_ACT_ENVIRONMENT};
  const location={origin,pathname:'/auth/kakao-mock/authorize',href:`${origin}/auth/kakao-mock/authorize#transactionId=${id}&decisionTicket=${ticket}`,
    replace:url=>redirects.push(url)};
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  globalThis.window={location,history:{replaceState:(_state,_title,path)=>{location.href=origin+path;}}};
  globalThis.fetch=async(url,init)=>{requests.push({url,body:JSON.parse(init.body)});return new Response(JSON.stringify({mockOnly:true,
    returnUrl:`${origin}/auth/kakao-mock/return#transactionId=${id}&state=${'S'.repeat(43)}&code=${'C'.repeat(43)}`}),{status:200});};
  let tree;
  t.after(async()=>{if(tree)await act(()=>tree.unmount());globalThis.window=previous.window;globalThis.fetch=previous.fetch;globalThis.IS_REACT_ACT_ENVIRONMENT=previous.act;});
  await act(async()=>{tree=create(React.createElement(React.StrictMode,null,React.createElement(mod.exports.KakaoMockAuthorize)));});
  assert.equal(location.href,`${origin}/auth/kakao-mock/authorize`);assert.equal(requests.length,0);
  const approve=tree.root.findAllByType('button')[0];assert.equal(approve.props.disabled,false);
  await act(async()=>{approve.props.onClick();approve.props.onClick();});
  assert.equal(requests.length,1,'effect replay must not erase the proof needed for explicit approval');
  assert.deepEqual(requests[0].body,{transactionId:id,decisionTicket:ticket,outcome:'approve'});assert.equal(redirects.length,1);
  await act(()=>tree.unmount());
  await act(async()=>{tree=create(React.createElement(React.StrictMode,null,React.createElement(mod.exports.KakaoMockAuthorize)));});
  const afterReload=tree.root.findAllByType('button')[0];assert.equal(afterReload.props.disabled,true);
  await act(async()=>afterReload.props.onClick());assert.equal(requests.length,1,'reload without fragment must not restore the old proof');
});

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
