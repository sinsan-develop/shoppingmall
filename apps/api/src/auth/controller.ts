import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Inject,
  NotFoundException, Post, Req, Res, ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { DatabaseService } from '../db/service.js';
import { AuthRepository } from './repository.js';
import { MockPhoneOtp, normalizePhone } from './mock-phone-otp.js';
import { completeAdminSetup } from './onboarding.js';
import type { ActiveRole } from '../access.js';

type RequestHeaders = {
  headers: { cookie?: string; origin?: string };
  socket?: { localAddress?: string; remoteAddress?: string };
};
type CookieResponse = { setHeader: (name: string, value: string) => void };
const cookieName = 'sm_session';

export function readToken(cookie: string | undefined): string | undefined {
  return cookie?.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
}

export function requireOrigin(request: RequestHeaders) {
  const allowed = process.env.WEB_ORIGIN ??
    (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9091');
  if (!allowed || request.headers.origin !== allowed) throw new ForbiddenException();
}

function setSessionCookie(reply: CookieResponse, token: string, maxAge = 86400) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  reply.setHeader('Set-Cookie', `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

@Controller('auth')
export class AuthController {
  private readonly mockCodes = new Map<string, string>();
  private readonly mockPhoneOtp = new MockPhoneOtp((_phone, code, challengeId) => {
    this.mockCodes.set(challengeId, code);
  });

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private repository() {
    const pool = this.database.getPool();
    if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    return new AuthRepository(pool);
  }

  private requireMockOtp() {
    const host = process.env.API_HOST ?? '127.0.0.1';
    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_MOCK_OTP !== '1' ||
        !['127.0.0.1', '::1', 'localhost'].includes(host)) {
      throw new NotFoundException();
    }
  }

  private async customerSession(request: RequestHeaders) {
    const token = readToken(request.headers.cookie);
    if (!token) throw new UnauthorizedException();
    const actor = await this.repository().getSession(token);
    if (!actor) throw new UnauthorizedException();
    if (actor.role !== 'customer') throw new ForbiddenException();
    return actor;
  }

  @Post('mock-phone/start')
  async startMockPhoneEntry(@Req() request: RequestHeaders, @Body() body: unknown) {
    this.requireMockOtp();
    requireOrigin(request);
    if (!body || typeof body !== 'object') throw new BadRequestException();
    const input = body as Record<string, unknown>;
    if (typeof input.phone !== 'string' || !['signup', 'login'].includes(String(input.action))) {
      throw new BadRequestException();
    }
    try {
      const phone = normalizePhone(input.phone);
      const issued = this.mockPhoneOtp.issue(phone, `entry:${input.action}:${phone}`);
      const testCode = this.mockCodes.get(issued.challengeId);
      this.mockCodes.delete(issued.challengeId);
      return { ...issued, testCode, mockOnly: true };
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid phone') throw new BadRequestException();
      throw error;
    }
  }

  @Post('mock-phone/confirm')
  async confirmMockPhoneEntry(@Req() request: RequestHeaders, @Body() body: unknown,
    @Res({ passthrough: true }) reply: CookieResponse) {
    this.requireMockOtp();
    requireOrigin(request);
    if (!body || typeof body !== 'object') throw new BadRequestException();
    const input = body as Record<string, unknown>;
    if (typeof input.phone !== 'string' || typeof input.code !== 'string' ||
        typeof input.challengeId !== 'string' || !['signup', 'login'].includes(String(input.action))) {
      throw new BadRequestException();
    }
    let phone: string;
    try { phone = normalizePhone(input.phone); } catch { throw new BadRequestException(); }
    const proof = this.mockPhoneOtp.verify(input.challengeId, input.code, `entry:${input.action}:${phone}`);
    if (!proof || proof.phone !== phone) throw new UnauthorizedException({ status: 'invalid_mock_otp' });
    try {
      const session = input.action === 'signup'
        ? await this.repository().createPhoneCustomerAfterVerification(phone)
        : await this.repository().loginPhoneAfterVerification(phone);
      setSessionCookie(reply, session.token);
      return { status: 'ok', mockOnly: true };
    } catch (error) {
      if (error instanceof Error && error.message === 'Phone already registered') {
        throw new ConflictException({ status: 'phone_already_registered' });
      }
      if (error instanceof Error && error.message === 'Phone account unavailable') {
        throw new UnauthorizedException({ status: 'phone_account_unavailable' });
      }
      throw error;
    }
  }

  @Post('mock-phone/start-link')
  async startMockPhoneLink(@Req() request: RequestHeaders, @Body() body: unknown) {
    this.requireMockOtp();
    requireOrigin(request);
    const actor = await this.customerSession(request);
    if (!body || typeof body !== 'object' || typeof (body as Record<string, unknown>).phone !== 'string') {
      throw new BadRequestException();
    }
    try {
      const issued = this.mockPhoneOtp.issue((body as { phone: string }).phone, actor.accountId);
      const testCode = this.mockCodes.get(issued.challengeId);
      this.mockCodes.delete(issued.challengeId);
      return { ...issued, testCode, mockOnly: true };
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid phone') throw new BadRequestException();
      throw error;
    }
  }

  @Post('mock-phone/confirm-link')
  async confirmMockPhoneLink(@Req() request: RequestHeaders, @Body() body: unknown) {
    this.requireMockOtp();
    requireOrigin(request);
    const actor = await this.customerSession(request);
    if (!body || typeof body !== 'object') throw new BadRequestException();
    const input = body as Record<string, unknown>;
    if (typeof input.challengeId !== 'string' || typeof input.code !== 'string') throw new BadRequestException();
    const proof = this.mockPhoneOtp.verify(input.challengeId, input.code, actor.accountId);
    if (!proof) throw new UnauthorizedException({ status: 'invalid_mock_otp' });
    try {
      await this.repository().linkPhoneIdentity(actor, proof);
      return { status: 'linked', mockOnly: true };
    } catch (error) {
      if (error instanceof Error && error.message === 'Phone already linked') {
        throw new ConflictException({ status: 'phone_already_linked' });
      }
      throw error;
    }
  }

  @Get('me')
  async me(@Req() request: RequestHeaders) {
    const token = readToken(request.headers.cookie);
    if (!token) throw new UnauthorizedException();
    const session = await this.repository().getSession(token);
    if (!session) throw new UnauthorizedException();
    return session;
  }

  @Post('login')
  async login(@Req() request: RequestHeaders, @Body() body: unknown,
    @Res({ passthrough: true }) reply: CookieResponse) {
    requireOrigin(request);
    if (!body || typeof body !== 'object') throw new BadRequestException();
    const input = body as Record<string, unknown>;
    if (typeof input.email !== 'string' || typeof input.password !== 'string' ||
        input.password.length > 1024 ||
        (input.role !== undefined && !['customer', 'seller', 'admin'].includes(String(input.role))) ||
        (input.sellerId !== undefined && typeof input.sellerId !== 'string')) {
      throw new BadRequestException();
    }
    try {
      const session = await this.repository().loginEmail(
        input.email, input.password, (input.role as ActiveRole | undefined) ?? 'customer',
        input.sellerId as string | undefined,
      );
      setSessionCookie(reply, session.token);
      return { status: 'ok' };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      if (error instanceof Error && ['Invalid credentials', 'Invalid email'].includes(error.message)) {
        throw new UnauthorizedException({ status: 'invalid_credentials' });
      }
      throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    }
  }

  @Post('admin-setup/complete')
  async finishAdminSetup(@Req() request: RequestHeaders, @Body() body: unknown) {
    requireOrigin(request);
    if (!body || typeof body !== 'object') throw new BadRequestException();
    const input = body as Record<string, unknown>;
    if (typeof input.token !== 'string' || typeof input.password !== 'string' ||
        input.token.length > 256 || input.password.length < 12 || input.password.length > 1024) {
      throw new BadRequestException();
    }
    const pool = this.database.getPool();
    if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    try {
      return await completeAdminSetup(pool, input.token, input.password,
        new Date(), request.socket?.remoteAddress ?? 'unknown');
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid action token') {
        throw new UnauthorizedException({ status: 'invalid_or_expired_link' });
      }
      throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    }
  }

  @Post('logout')
  async logout(@Req() request: RequestHeaders, @Res({ passthrough: true }) reply: CookieResponse) {
    requireOrigin(request);
    const token = readToken(request.headers.cookie);
    if (!token) throw new UnauthorizedException();
    await this.repository().logout(token);
    setSessionCookie(reply, '', 0);
    return { status: 'ok' };
  }

  @Post('switch-role')
  async switchRole(@Req() request: RequestHeaders, @Body() body: unknown,
    @Res({ passthrough: true }) reply: CookieResponse) {
    requireOrigin(request);
    const token = readToken(request.headers.cookie);
    if (!token) throw new UnauthorizedException();
    if (!body || typeof body !== 'object') throw new BadRequestException();
    const input = body as Record<string, unknown>;
    if (!['customer', 'seller', 'admin'].includes(String(input.role)) ||
        (input.sellerId !== undefined && typeof input.sellerId !== 'string')) {
      throw new BadRequestException();
    }
    try {
      const session = await this.repository().switchRole(
        token, input.role as ActiveRole, input.sellerId as string | undefined,
      );
      setSessionCookie(reply, session.token);
      return { status: 'ok' };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      if (error instanceof Error && ['Role unavailable', 'Session no longer active'].includes(error.message)) {
        throw new ForbiddenException();
      }
      throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    }
  }
}
