import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../db/service.js';
import { AuthRepository } from './repository.js';
import { readToken } from './controller.js';
import { assertKakaoMockBootConfig, assertKakaoMockRequest, attestKakaoMockDatabase,
  type KakaoQaBinding } from './kakao-mock-gate.js';
import { KakaoMockError, KakaoMockRegistry } from './kakao-mock-registry.js';

export type KakaoMockRequest = {headers:{origin?:string;cookie?:string};
  socket?:{localAddress?:string;remoteAddress?:string}};
@Injectable()
export class KakaoMockService {
  private registry?: KakaoMockRegistry;
  private binding?: KakaoQaBinding;
  constructor(@Inject(DatabaseService) private readonly database:DatabaseService) {}
  async initialize():Promise<void> {
    this.registry = undefined; this.binding = undefined;
    if (assertKakaoMockBootConfig(process.env) === 'disabled') return;
    const pool = this.database.getPool();
    if (!pool) throw new KakaoMockError(503);
    this.binding = await attestKakaoMockDatabase(pool,process.env);
    this.registry = new KakaoMockRegistry({webOrigin:process.env.WEB_ORIGIN!,identifier:this.binding.identifier});
  }
  private ready(request:KakaoMockRequest) {
    assertKakaoMockRequest(request,process.env);
    const pool = this.database.getPool();
    if (!this.registry || !this.binding || !pool) throw new KakaoMockError(503);
    return {registry:this.registry,binding:this.binding,repository:new AuthRepository(pool)};
  }
  async start(input:unknown,request:KakaoMockRequest) {
    const {registry,repository} = this.ready(request);
    const token = readToken(request.headers.cookie);
    if (token && await repository.getSession(token)) throw new KakaoMockError(409);
    return registry.start(input,request.socket!.remoteAddress!);
  }
  decision(input:unknown,request:KakaoMockRequest) { return this.ready(request).registry.decision(input); }
  async complete(input:unknown,request:KakaoMockRequest) {
    const {registry,binding,repository} = this.ready(request);
    const token = readToken(request.headers.cookie);
    if (token && await repository.getSession(token)) throw new KakaoMockError(409);
    return registry.complete(input,()=>repository.loginMockKakao(binding));
  }
  cancel(input:unknown,request:KakaoMockRequest) { return this.ready(request).registry.cancel(input); }
}
