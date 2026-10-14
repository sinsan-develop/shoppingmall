import { useEffect,useRef,useState } from 'react';
import { Pressable,Text,View } from 'react-native';
import type { KakaoMockBridge } from './kakao-mock-bridge';
export function KakaoMockLogin({bridge,onBegin,onSignedIn,onReady}:{bridge:KakaoMockBridge;
  onBegin:()=>void;onSignedIn:()=>void;onReady:(cancel:(()=>Promise<void>)|undefined)=>void}){
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const locked=useRef(false),active=useRef(true);
  useEffect(()=>{
    active.current=true;
    onReady(async()=>{await bridge.flow.cancel();locked.current=false;if(active.current)setBusy(false);});
    const unsubscribe=bridge.subscribe(url=>{
      void bridge.flow.handleReturn(url).then(accepted=>{
        if(!active.current)return;
        if(accepted){locked.current=false;setBusy(false);onSignedIn();}
        else {setMessage('인증 복귀를 확인하지 못했습니다. 취소하거나 다시 시작해 주세요');}
      }).catch(()=>{if(active.current){locked.current=false;setBusy(false);setMessage('모의 로그인을 완료하지 못했습니다. 다시 시작해 주세요');}});
    });
    return()=>{active.current=false;unsubscribe();bridge.flow.invalidate();onReady(undefined);};
  },[bridge,onReady,onSignedIn]);
  async function start(){if(locked.current)return;locked.current=true;setBusy(true);setMessage('');onBegin();
    try{await bridge.flow.start();}catch{locked.current=false;setBusy(false);setMessage('모의 로그인을 시작하지 못했습니다. 다시 시도해 주세요');}}
  async function cancel(){try{await bridge.flow.cancel();locked.current=false;setBusy(false);setMessage('모의 로그인을 취소했습니다');}
    catch{setMessage('진행 중인 인증을 확인한 뒤 다시 취소해 주세요');}}
  return <View><Text>개발용 가상 고객·실제 카카오 로그인 아님</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="카카오 모의 로그인" accessibilityState={{disabled:busy}}
      disabled={busy} onPress={()=>void start()}><Text>카카오 모의 로그인</Text></Pressable>
    {busy?<Pressable accessibilityRole="button" accessibilityLabel="모의 로그인 취소" onPress={()=>void cancel()}><Text>모의 로그인 취소</Text></Pressable>:null}
    {message?<Text accessibilityRole="alert">{message}</Text>:null}</View>;
}
