const proof = /^[A-Za-z0-9_-]{43}$/;
export async function withKakaoAuthLock<T>(task:()=>Promise<T>,requireLock=false):Promise<T>{
  const enabled=process.env.NODE_ENV!=='production'&&process.env.NEXT_PUBLIC_ENABLE_KAKAO_MOCK==='1';
  if(enabled&&typeof window!=='undefined'&&window.location.origin==='http://127.0.0.1:9091'&&
    typeof navigator!=='undefined'&&navigator.locks)
    return navigator.locks.request('owoolmall-development-auth',{mode:'exclusive'},task);
  if(requireLock)throw new Error('이 브라우저에서는 모의 인증을 사용할 수 없습니다. 이메일 로그인을 이용해 주세요');
  return task();
}
export class KakaoMockHttpError extends Error {
  constructor(public readonly status:number){super('모의 인증 요청 실패');}
}
const failed = () => new Error('모의 로그인을 완료하지 못했습니다. 다시 시작해 주세요');
type Values = Record<string,string>;
export type MockReturn = {transactionId:string;state:string;code?:string;error?:string};
export type MockStart = {transactionId:string;authorizeUrl:string;expiresAt:string;mockOnly:true;state:string};
function parse(url:string,origin:string,path:string,allowed:string[]):Values {
  const value = new URL(url),base = new URL(origin);
  if (base.protocol!=='http:' || base.hostname!=='127.0.0.1' || base.origin!==origin ||
    value.origin!==origin || value.pathname!==path || value.search || value.username || value.password) throw failed();
  const params = new URLSearchParams(value.hash.slice(1)),result:Values = {};
  for (const [key,item] of params) {
    if (!allowed.includes(key) || Object.hasOwn(result,key)) throw failed();
    result[key]=item;
  }
  return result;
}
function returned(value:unknown):MockReturn {
  if (!value || typeof value!=='object' || Array.isArray(value)) throw failed();
  const data = value as Values;
  if (Object.keys(data).length!==3 || Object.keys(data).some(key=>!['transactionId','state','code','error'].includes(key)) ||
    !proof.test(data.transactionId) || !proof.test(data.state) ||
    (data.code ? !proof.test(data.code)||!!data.error : !['cancelled','mock_failed'].includes(data.error))) throw failed();
  return {transactionId:data.transactionId,state:data.state,...(data.code?{code:data.code}:{error:data.error})};
}
export function parseKakaoMockReturn(url:string,origin:string):MockReturn {
  return returned(parse(url,origin,'/auth/kakao-mock/return',['transactionId','state','code','error']));
}
export function parseKakaoMockAuthorize(url:string,origin:string) {
  const result = parse(url,origin,'/auth/kakao-mock/authorize',['transactionId','decisionTicket']);
  if (Object.keys(result).length!==2 || !proof.test(result.transactionId) || !proof.test(result.decisionTicket)) throw failed();
  return {transactionId:result.transactionId,decisionTicket:result.decisionTicket};
}
const encode = (value:Uint8Array) => btoa(String.fromCharCode(...value)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export function createKakaoMockClient(config:{apiOrigin:string;webOrigin:string;
  send:(path:string,body?:unknown)=>Promise<unknown>;randomBytes:()=>Uint8Array;digest:(value:string)=>Promise<Uint8Array>;
  serialize?:<T>(task:()=>Promise<T>)=>Promise<T>}) {
  const api = new URL(config.apiOrigin),web = new URL(config.webOrigin);
  if (api.protocol!=='http:' || api.hostname!=='127.0.0.1' || api.origin!==config.apiOrigin ||
    web.protocol!=='http:' || web.hostname!=='127.0.0.1' || web.origin!==config.webOrigin) throw failed();
  let generation=0,pending:{transactionId:string;state:string;verifier:string;expires:number}|undefined;
  let starting=false,exchanging:Promise<{role:string;accountId:string}>|undefined;
  const serialize=config.serialize??(<T>(task:()=>Promise<T>)=>task());
  const random = () => {const bytes=config.randomBytes();if(bytes.length!==32)throw failed();return encode(bytes);};
  async function me() {
    const value=await config.send('/auth/me') as {role?:string;accountId?:string};
    if(value?.role!=='customer' || typeof value.accountId!=='string' || !value.accountId)throw failed();
    return {role:value.role,accountId:value.accountId};
  }
  return {
    async start():Promise<MockStart> {
      if(pending||starting||exchanging)throw failed();starting=true;const current=++generation;
      try {
        const state=random(),verifier=random(),digest=await config.digest(verifier);
        if(digest.length!==32)throw failed();
        const value=await serialize(()=>config.send('/auth/kakao-mock/start',{client:'web',state,challenge:encode(digest),method:'S256'})) as MockStart;
        const authorization=parseKakaoMockAuthorize(value.authorizeUrl,config.webOrigin),expires=Date.parse(value.expiresAt);
        if(current!==generation || value.mockOnly!==true || authorization.transactionId!==value.transactionId ||
          !Number.isFinite(expires)||expires<=Date.now()||expires>Date.now()+300000)throw failed();
        pending={transactionId:value.transactionId,state,verifier,expires};return {...value,state};
      } catch {throw failed();} finally {starting=false;}
    },
    async acceptReturn(event:{origin:string;source:unknown;data:unknown},expectedWindow:unknown) {
      if(!expectedWindow || event.origin!==config.webOrigin || event.source!==expectedWindow || !pending || exchanging)throw failed();
      const data=returned(event.data),flow=pending,current=generation;
      if(data.transactionId!==flow.transactionId || data.state!==flow.state || flow.expires<=Date.now())throw failed();
      pending=undefined;
      if(data.error)throw new Error(data.error==='cancelled'?'모의 로그인을 취소했습니다':'모의 공급자 실패입니다. 다시 시작해 주세요');
      const exchange=serialize(async()=>{
        // Network loss may follow a committed Set-Cookie: query me, never retry the code.
        try {await config.send('/auth/kakao-mock/complete',{transactionId:flow.transactionId,state:flow.state,code:data.code,verifier:flow.verifier});}
        catch (error) { if(error instanceof KakaoMockHttpError)throw failed(); }
        const account=await me();if(current!==generation)throw failed();return account;
      });
      exchanging=exchange;
      try{return await exchange;}catch{throw failed();}finally{exchanging=undefined;}
    },
    async cancel() {
      if(exchanging){try{await exchanging;}catch{/* A following manual login can now safely start. */}}
      if(starting)throw failed();
      if(pending){const flow=pending;await config.send('/auth/kakao-mock/cancel',
        {transactionId:flow.transactionId,state:flow.state,verifier:flow.verifier});pending=undefined;}
      generation++;
    },
    invalidate(){pending=undefined;generation++;},
  };
}
