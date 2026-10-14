import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export class KakaoMockError extends Error {
  constructor(public readonly status: number) { super(status === 401 ? 'invalid_mock_auth' : 'mock_auth_unavailable'); }
}
export type MockSession = { token: string; expiresAt: Date };
type Flow = { generation:number; state: string; challenge: string; client: 'web'|'android'; ticketHash: Buffer;
  codeHash?: Buffer; codeExpires?: number; expires: number; status: 'STARTED'|'APPROVED'|'EXCHANGING'|'CONSUMED'|'CANCELLED'|'FAILED' };
const proof = /^[A-Za-z0-9_-]{43}$/;
const hash = (value: string) => createHash('sha256').update(value).digest();
const same = (value: string, digest: Buffer) => timingSafeEqual(hash(value), digest);
export function mockBody(input: unknown, keys: string[]): Record<string,string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new KakaoMockError(400);
  const body = input as Record<string,unknown>;
  if (Object.keys(body).length !== keys.length || keys.some(key => typeof body[key] !== 'string') ||
      Object.keys(body).some(key => !keys.includes(key))) throw new KakaoMockError(400);
  return body as Record<string,string>;
}

/** Development simulator only. No provider HTTP, account creation or credential storage. */
export class KakaoMockRegistry {
  private readonly flows = new Map<string,Flow>();
  private readonly rate = new Map<string,{ count:number; expires:number }>();
  private generation=0;
  invalidateAuth(){this.generation++;}
  private readonly now: () => number;
  private readonly bytes: (size:number) => Buffer;
  constructor(private readonly config: { webOrigin:string; identifier:string; now?:()=>number; randomBytes?:(size:number)=>Buffer }) {
    let origin: URL;
    try { origin = new URL(config.webOrigin); } catch { throw new KakaoMockError(503); }
    if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || origin.origin !== config.webOrigin ||
      !/^mock:s7:[0-9a-f]{8}:customer-a$/.test(config.identifier)) throw new KakaoMockError(503);
    this.now = config.now ?? Date.now; this.bytes = config.randomBytes ?? randomBytes;
  }
  private token() { return this.bytes(32).toString('base64url'); }
  private flow(id: string): Flow {
    if (!proof.test(id)) throw new KakaoMockError(401);
    const flow = this.flows.get(id);
    if (!flow || flow.expires <= this.now()) { this.flows.delete(id); throw new KakaoMockError(401); }
    return flow;
  }
  private verify(flow: Flow, state: string, verifier: string) {
    if (!proof.test(state) || !proof.test(verifier) || !same(state,hash(flow.state)) ||
      !same(hash(verifier).toString('base64url'), hash(flow.challenge))) throw new KakaoMockError(401);
  }
  start(input: unknown, remoteAddress: string) {
    const body = mockBody(input,['client','state','challenge','method']);
    if (!['web','android'].includes(body.client) || body.method !== 'S256' || !proof.test(body.state) || !proof.test(body.challenge))
      throw new KakaoMockError(400);
    const now = this.now();
    for (const [id,flow] of this.flows) if (flow.expires <= now && flow.status !== 'EXCHANGING') this.flows.delete(id);
    for (const [address,bucket] of this.rate) if (bucket.expires <= now) this.rate.delete(address);
    if (this.flows.size >= 1000 || (this.rate.get(remoteAddress)?.count ?? 0) >= 10) throw new KakaoMockError(429);
    const bucket = this.rate.get(remoteAddress) ?? {count:0,expires:now+300000}; bucket.count++; this.rate.set(remoteAddress,bucket);
    const transactionId = this.token(), ticket = this.token(), expires = now+300000;
    this.flows.set(transactionId, {generation:this.generation,state:body.state,challenge:body.challenge,client:body.client as 'web'|'android',
      ticketHash:hash(ticket),expires,status:'STARTED'});
    const authorize = new URL('/auth/kakao-mock/authorize',this.config.webOrigin);
    authorize.hash = new URLSearchParams({transactionId,decisionTicket:ticket}).toString();
    return {transactionId,authorizeUrl:authorize.href,expiresAt:new Date(expires).toISOString(),mockOnly:true as const};
  }
  decision(input: unknown) {
    const body = mockBody(input,['transactionId','decisionTicket','outcome']);
    if (!['approve','cancel','fail'].includes(body.outcome)) throw new KakaoMockError(400);
    const flow = this.flow(body.transactionId);
    if (!proof.test(body.decisionTicket) || !same(body.decisionTicket,flow.ticketHash)) throw new KakaoMockError(401);
    if (flow.status !== 'STARTED') throw new KakaoMockError(409);
    const returned = new URL(flow.client === 'web' ? `${this.config.webOrigin}/auth/kakao-mock/return` : 'owoolmall-dev://auth/kakao-mock/return');
    const values: Record<string,string> = {transactionId:body.transactionId,state:flow.state};
    if (body.outcome === 'approve') {
      const code = this.token(); flow.codeHash = hash(code); flow.codeExpires = Math.min(flow.expires,this.now()+60000);
      flow.status = 'APPROVED'; values.code = code;
    } else { flow.status = body.outcome === 'cancel' ? 'CANCELLED' : 'FAILED'; values.error = body.outcome === 'cancel' ? 'cancelled' : 'mock_failed'; }
    returned.hash = new URLSearchParams(values).toString();
    return {returnUrl:returned.href,mockOnly:true as const};
  }
  async complete(input: unknown, issueSession:(identifier:string,assertCurrent:()=>void)=>Promise<MockSession>): Promise<MockSession> {
    const body = mockBody(input,['transactionId','state','code','verifier']);
    const flow = this.flow(body.transactionId); this.verify(flow,body.state,body.verifier);
    const assertCurrent=()=>{if(flow.generation!==this.generation)throw new KakaoMockError(409);};
    assertCurrent();
    if (flow.status !== 'APPROVED') throw new KakaoMockError(409);
    if (!flow.codeHash || !proof.test(body.code) || !same(body.code,flow.codeHash) || (flow.codeExpires ?? 0) <= this.now())
      throw new KakaoMockError(401);
    flow.status = 'EXCHANGING';
    try {
      const session = await issueSession(this.config.identifier,assertCurrent); assertCurrent(); flow.status = 'CONSUMED'; return session;
    } catch (error) {
      flow.status = 'FAILED'; throw error instanceof KakaoMockError ? error : new KakaoMockError(503);
    }
  }
  cancel(input: unknown) {
    const body = mockBody(input,['transactionId','state','verifier']);
    const flow = this.flow(body.transactionId); this.verify(flow,body.state,body.verifier);
    if (!['STARTED','APPROVED','CANCELLED'].includes(flow.status)) throw new KakaoMockError(409);
    flow.status = 'CANCELLED'; return {status:'cancelled' as const,mockOnly:true as const};
  }
}
