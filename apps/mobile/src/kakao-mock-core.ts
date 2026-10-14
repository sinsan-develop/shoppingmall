import { CustomerApiError,type CustomerApi } from './customer-api';
const pattern=/^[A-Za-z0-9_-]{43}$/;
const failure=()=>new Error('모의 로그인을 완료하지 못했습니다. 다시 시작해 주세요');
function base64url(bytes:Uint8Array){
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';let out='';
  for(let i=0;i<bytes.length;i+=3){
    const n=(bytes[i]<<16)|((bytes[i+1]??0)<<8)|(bytes[i+2]??0);
    out+=alphabet[(n>>>18)&63]+alphabet[(n>>>12)&63];
    if(i+1<bytes.length)out+=alphabet[(n>>>6)&63];if(i+2<bytes.length)out+=alphabet[n&63];
  }return out;
}
function fragments(url:URL,keys:string[]){
  if(url.search||url.username||url.password)throw failure();const out:Record<string,string>={};
  for(const [key,value]of new URLSearchParams(url.hash.slice(1))){
    if(!keys.includes(key)||Object.hasOwn(out,key))throw failure();out[key]=value;
  }return out;
}
export function createKakaoMockFlow(config:{api:Pick<CustomerApi,'startKakaoMock'|'completeKakaoMock'|'cancelKakaoMock'|'me'>;
  randomBytes:()=>Uint8Array;digest:(value:string)=>Promise<Uint8Array>;openUrl:(url:string)=>Promise<unknown>}){
  let pending:{transactionId:string;state:string;verifier:string;expires:number}|undefined;
  let generation=0,starting=false,exchange:Promise<boolean>|undefined;
  const random=()=>{const bytes=config.randomBytes();if(bytes.length!==32)throw failure();return base64url(bytes);};
  return {
    async start(){
      if(starting||exchange||pending)throw failure();starting=true;const current=++generation;
      try{
        const state=random(),verifier=random(),digest=await config.digest(verifier);if(digest.length!==32)throw failure();
        const result=await config.api.startKakaoMock({client:'android',state,challenge:base64url(digest),method:'S256'});
        const url=new URL(result.authorizeUrl),parts=fragments(url,['transactionId','decisionTicket']),expires=Date.parse(result.expiresAt);
        if(result.mockOnly!==true||url.origin!=='http://127.0.0.1:9091'||url.pathname!=='/auth/kakao-mock/authorize'||
          Object.keys(parts).length!==2||!pattern.test(parts.decisionTicket)||!pattern.test(result.transactionId)||
          parts.transactionId!==result.transactionId||!Number.isFinite(expires)||expires<=Date.now()||current!==generation)throw failure();
        pending={transactionId:result.transactionId,state,verifier,expires:Math.min(expires,Date.now()+300000)};await config.openUrl(result.authorizeUrl);
      }catch{pending=undefined;throw failure();}finally{starting=false;}
    },
    async handleReturn(value:string):Promise<boolean>{
      if(!pending||exchange)return false;
      let parts:Record<string,string>;
      try{
        const url=new URL(value);parts=fragments(url,['transactionId','state','code','error']);
        if(url.protocol!=='owoolmall-dev:'||url.hostname!=='auth'||url.port||url.pathname!=='/kakao-mock/return'||
          Object.keys(parts).length!==3||parts.transactionId!==pending.transactionId||parts.state!==pending.state||
          !pattern.test(parts.transactionId)||!pattern.test(parts.state)||pending.expires<=Date.now()||
          (parts.code?!pattern.test(parts.code)||!!parts.error:!['cancelled','mock_failed'].includes(parts.error)))return false;
      }catch{return false;}
      const flow=pending,current=generation;pending=undefined;if(parts.error)return false;
      const result=(async()=>{
        try{await config.api.completeKakaoMock({transactionId:flow.transactionId,state:flow.state,code:parts.code,verifier:flow.verifier});}
        catch(error){if(!(error instanceof CustomerApiError&&error.code==='offline'))throw failure();}
        const actor=await config.api.me(false);if(actor.role!=='customer'||current!==generation)throw failure();return true;
      })();exchange=result;
      try{return await result;}catch{throw failure();}finally{exchange=undefined;}
    },
    async cancel(){
      if(exchange){try{await exchange;}catch{/* The next auth action can now start. */}}
      if(starting)throw failure();
      if(pending&&pending.expires<=Date.now()){pending=undefined;generation++;return;}
      if(pending){const flow=pending;await config.api.cancelKakaoMock({transactionId:flow.transactionId,state:flow.state,verifier:flow.verifier});pending=undefined;}
      generation++;
    },
    invalidate(){generation++;pending=undefined;},
  };
}
export type KakaoMockFlow=ReturnType<typeof createKakaoMockFlow>;
