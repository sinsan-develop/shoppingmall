import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Inject, Post,
  Req, Res, ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { DatabaseService } from '../db/service.js';
import { AuthRepository } from './repository.js';
import type { ActiveRole } from '../access.js';

type RequestHeaders = { headers: { cookie?: string; origin?: string } };
type CookieResponse = { setHeader: (name: string, value: string) => void };
const cookieName = 'sm_session';

function readToken(cookie: string | undefined): string | undefined {
  return cookie?.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
}

function requireOrigin(request: RequestHeaders) {
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
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private repository() {
    const pool = this.database.getPool();
    if (!pool) throw new ServiceUnavailableException({ status: 'unavailable', dependency: 'database' });
    return new AuthRepository(pool);
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
