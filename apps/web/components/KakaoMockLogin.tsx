'use client';
import { useEffect,useRef,useState } from 'react';
import { createKakaoMockClient,parseKakaoMockAuthorize,parseKakaoMockReturn,KakaoMockHttpError,withKakaoAuthLock } from '../lib/kakao-mock-client';
const api=process.env.NEXT_PUBLIC_API_ORIGIN??'http://127.0.0.1:9092',origin='http://127.0.0.1:9091';
export const kakaoMockEnabled=process.env.NODE_ENV!=='production'&&process.env.NEXT_PUBLIC_ENABLE_KAKAO_MOCK==='1';
const failure='모의 로그인을 완료하지 못했습니다. 다시 시작해 주세요';
async function send(path:string,body?:unknown):Promise<unknown>{
  const response=await fetch(`${api}${path}`,{method:body===undefined?'GET':'POST',credentials:'include',
    headers:body===undefined?{}:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!response.ok)throw new KakaoMockHttpError(response.status);return response.json();
}
export function KakaoMockLogin({enabled=kakaoMockEnabled,customer,onReady}: {
  enabled?:boolean;customer:boolean;onReady?:(cancel:(()=>Promise<void>)|undefined)=>void}){
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const flow=useRef<ReturnType<typeof createKakaoMockClient>|undefined>(undefined),popup=useRef<Window|null>(null);
  const active=useRef(true);
  useEffect(()=>{
    if(!enabled||!customer||window.location.origin!==origin)return;
    active.current=true;
    const client=createKakaoMockClient({apiOrigin:api,webOrigin:origin,send,serialize:task=>withKakaoAuthLock(task,true),randomBytes:()=>crypto.getRandomValues(new Uint8Array(32)),
      digest:async text=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))});
    flow.current=client;
    const cancel=async()=>{await client.cancel();popup.current?.close();popup.current=null;if(active.current)setBusy(false);};
    onReady?.(cancel);
    const receive=(event:MessageEvent)=>{
      if(event.origin!==origin||!popup.current||event.source!==popup.current)return;
      void client.acceptReturn(event,popup.current).then(()=>{if(active.current){popup.current?.close();window.location.assign('/account');}})
        .catch(()=>{if(active.current){setMessage(failure);setBusy(false);popup.current?.close();popup.current=null;}});
    };
    window.addEventListener('message',receive);
    const timer=window.setInterval(()=>{if(popup.current?.closed)void cancel().catch(()=>{if(active.current)setMessage(failure);});},500);
    return()=>{active.current=false;client.invalidate();flow.current=undefined;onReady?.(undefined);
      window.removeEventListener('message',receive);window.clearInterval(timer);popup.current?.close();popup.current=null;};
  },[enabled,customer,onReady]);
  if(!enabled||!customer)return null;
  async function start(){
    if(busy||!flow.current)return;
    const opened=window.open('about:blank','_blank','popup,width=480,height=620');
    if(!opened){setMessage('팝업을 허용한 뒤 다시 시작해 주세요');return;}
    popup.current=opened;setBusy(true);setMessage('');
    try{const result=await flow.current.start();if(opened.closed){await flow.current.cancel();setBusy(false);return;}opened.location.replace(result.authorizeUrl);}
    catch{opened.close();popup.current=null;setBusy(false);setMessage(failure);}
  }
  async function cancel(){try{await flow.current?.cancel();popup.current?.close();popup.current=null;setBusy(false);}catch{setMessage(failure);}}
  return <section aria-label="개발용 모의 인증"><p>개발용 가상 고객만 접속합니다. 실제 카카오 로그인이 아닙니다.</p>
    <button type="button" disabled={busy} onClick={()=>void start()}>카카오 모의 로그인</button>
    {busy?<button type="button" onClick={()=>void cancel()}>모의 로그인 취소</button>:null}
    {message?<p role="alert">{message}</p>:null}</section>;
}
export function KakaoMockAuthorize(){
  const proof=useRef<ReturnType<typeof parseKakaoMockAuthorize>|undefined>(undefined);
  const initialized=useRef(false);
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{
    if(initialized.current)return;initialized.current=true;
    const url=window.location.href;window.history.replaceState(null,'',window.location.pathname);
    if(!kakaoMockEnabled||window.location.origin!==origin){setMessage(failure);return;}
    try{proof.current=parseKakaoMockAuthorize(url,origin);setReady(true);}catch{setMessage(failure);}
    // The proof belongs only to this mounted component. Strict effect replay must
    // not erase it; a real reload creates a new component with no fragment/proof.
  },[]);
  async function decide(outcome:'approve'|'cancel'|'fail'){
    if(!proof.current||busy)return;
    const input=proof.current;proof.current=undefined;setBusy(true);
    try{
      const result=await send('/auth/kakao-mock/decision',{...input,outcome}) as {returnUrl:string;mockOnly:boolean};
      if(result.mockOnly!==true)throw new Error(failure);
      const returned=new URL(result.returnUrl);
      if(returned.protocol==='owoolmall-dev:'&&returned.hostname==='auth'&&!returned.port&&returned.pathname==='/kakao-mock/return'&&
        !returned.search&&!returned.username&&!returned.password)
        parseKakaoMockReturn(`${origin}/auth/kakao-mock/return${returned.hash}`,origin);
      else parseKakaoMockReturn(result.returnUrl,origin);
      proof.current=undefined;window.location.replace(result.returnUrl);
    }catch{proof.current=undefined;setReady(false);setMessage(failure);}finally{setBusy(false);}
  }
  return <main><p>개발 전용·실제 카카오 아님</p><h1>가상 고객 모의 승인</h1><p>준비된 가상 고객만 접속합니다.</p>
    <button disabled={!ready||busy} onClick={()=>void decide('approve')}>모의 승인</button>
    <button disabled={!ready||busy} onClick={()=>void decide('cancel')}>모의 취소</button>
    <button disabled={!ready||busy} onClick={()=>void decide('fail')}>모의 실패</button>
    {message?<p role="alert">{message}</p>:null}</main>;
}
export function KakaoMockReturn(){
  const [message,setMessage]=useState('모의 인증 복귀를 확인합니다'),handled=useRef(false);
  useEffect(()=>{
    if(handled.current)return;handled.current=true;
    const url=window.location.href;window.history.replaceState(null,'',window.location.pathname);
    try{
      if(!kakaoMockEnabled||!window.opener||window.location.origin!==origin)throw new Error(failure);
      window.opener.postMessage(parseKakaoMockReturn(url,origin),origin);setMessage('원래 로그인 화면에서 결과를 확인해 주세요');
    }catch{setMessage('원래 로그인 화면에서 모의 인증을 다시 시작해 주세요');}
  },[]);
  return <main><h1>모의 인증 복귀</h1><p role="status">{message}</p></main>;
}
