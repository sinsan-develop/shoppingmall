import * as Crypto from 'expo-crypto';
import { Linking } from 'react-native';
import type { CustomerApi } from './customer-api';
import { createKakaoMockFlow,type KakaoMockFlow } from './kakao-mock-core';
export type KakaoMockBridge={flow:KakaoMockFlow;subscribe:(handler:(url:string)=>void)=>()=>void};
export const enableKakaoMock=__DEV__&&process.env.EXPO_PUBLIC_ENABLE_KAKAO_MOCK==='1';
export function createKakaoMockBridge(api:CustomerApi):KakaoMockBridge {
  const flow=createKakaoMockFlow({api,randomBytes:()=>Crypto.getRandomBytes(32),
    digest:async text=>{
      const hex=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,text,{encoding:Crypto.CryptoEncoding.HEX});
      return Uint8Array.from(hex.match(/../g)??[],part=>parseInt(part,16));
    },openUrl:url=>Linking.openURL(url)});
  return {flow,subscribe(handler){
    let active=true;
    const listener=Linking.addEventListener('url',event=>{if(active)handler(event.url);});
    void Linking.getInitialURL().then(url=>{if(active&&url)handler(url);}).catch(()=>undefined);
    return()=>{active=false;listener.remove();};
  }};
}
