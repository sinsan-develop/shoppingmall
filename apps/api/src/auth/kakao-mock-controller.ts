import { Body, Controller, HttpCode, HttpException, Inject, Post, Req, Res } from '@nestjs/common';
import { setSessionCookie } from './controller.js';
import { KakaoMockService, type KakaoMockRequest } from './kakao-mock-service.js';
import { KakaoMockError } from './kakao-mock-registry.js';

@Controller('auth/kakao-mock')
export class KakaoMockController {
  constructor(@Inject(KakaoMockService) private readonly service:KakaoMockService) {}
  private async safe<T>(run:()=>Promise<T>|T):Promise<T> {
    try { return await run(); }
    catch (error) {
      const status = error instanceof KakaoMockError ? error.status : 503;
      throw new HttpException({status:status === 401 ? 'invalid_mock_auth' : 'mock_auth_unavailable'},status);
    }
  }
  @Post('start')
  @HttpCode(200)
  start(@Body() body:unknown,@Req() request:KakaoMockRequest) { return this.safe(()=>this.service.start(body,request)); }
  @Post('decision')
  @HttpCode(200)
  decision(@Body() body:unknown,@Req() request:KakaoMockRequest) { return this.safe(()=>this.service.decision(body,request)); }
  @Post('cancel')
  @HttpCode(200)
  cancel(@Body() body:unknown,@Req() request:KakaoMockRequest) { return this.safe(()=>this.service.cancel(body,request)); }
  @Post('complete')
  @HttpCode(200)
  complete(@Body() body:unknown,@Req() request:KakaoMockRequest,
    @Res({passthrough:true}) reply:{setHeader:(name:string,value:string)=>void}) {
    return this.safe(async()=>{
      const session = await this.service.complete(body,request);
      setSessionCookie(reply,session.token);
      return {status:'ok',mockOnly:true};
    });
  }
}
