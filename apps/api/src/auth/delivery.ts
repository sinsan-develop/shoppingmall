import type { AuthActionPurpose } from './action-tokens.js';
import nodemailer from 'nodemailer';

export type MockAuthMessage = { purpose: AuthActionPurpose; email: string; url: string };
export type MockAuthSink = (message: MockAuthMessage) => Promise<void>;

let qaAuthSink: MockAuthSink | undefined;
const loopback = ['127.0.0.1', '::1', 'localhost'];
const emailPattern = /^[^@\s,<>]+@[^@\s,<>]+\.[^@\s,<>]+$/;

function unavailable(): Error { return new Error('Auth delivery unavailable'); }

function smtpConfig(env: NodeJS.ProcessEnv) {
  const host = env.SMTP_HOST;
  const portText = env.SMTP_PORT;
  const security = env.SMTP_SECURITY;
  const user = env.SMTP_USER;
  const password = env.SMTP_PASSWORD;
  const from = env.SMTP_FROM;
  const originText = env.AUTH_LINK_ORIGIN;
  if (!host || !/^[A-Za-z0-9.-]+$/.test(host) || !portText || !/^\d+$/.test(portText) ||
      !security || !['implicit_tls', 'starttls'].includes(security) ||
      !user?.trim() || !password?.trim() || !from || !emailPattern.test(from) || from.length > 254 ||
      !originText) throw unavailable();
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw unavailable();
  let origin: URL;
  try { origin = new URL(originText); } catch { throw unavailable(); }
  if (origin.protocol !== 'https:' || originText !== origin.origin || origin.username ||
      origin.password || origin.search || origin.hash || origin.pathname !== '/') throw unavailable();
  return { host, port, security, user, password, from, origin: origin.origin };
}

export function assertAuthDeliveryBootConfig(env: NodeJS.ProcessEnv): void {
  if (env.AUTH_DELIVERY_MODE === 'smtp') smtpConfig(env);
  else if (env.AUTH_DELIVERY_MODE !== undefined &&
      !['disabled', 'mock'].includes(env.AUTH_DELIVERY_MODE)) throw unavailable();
}

/** Private in-process QA receiver; never exposed by an HTTP route or production mode. */
export function setQaAuthSink(sink?: MockAuthSink): void {
  if (sink && (process.env.AUTH_DELIVERY_MODE !== 'mock' || process.env.APP_ENV !== 'development' ||
      !['127.0.0.1', '::1', 'localhost'].includes(process.env.API_HOST ?? ''))) {
    throw new Error('Auth delivery unavailable');
  }
  qaAuthSink = sink;
}

export function getQaAuthSink(): MockAuthSink | undefined {
  return qaAuthSink;
}

export function requireAuthDelivery(purpose: AuthActionPurpose, mockSink?: MockAuthSink): void {
  if (process.env.AUTH_DELIVERY_MODE === 'smtp') {
    if (!['customer_signup', 'password_reset'].includes(purpose)) throw unavailable();
    smtpConfig(process.env);
    return;
  }
  if (process.env.AUTH_DELIVERY_MODE !== 'mock' || process.env.APP_ENV !== 'development' ||
      !loopback.includes(process.env.API_HOST ?? '') || !mockSink ||
      !['admin_setup', 'customer_signup', 'password_reset'].includes(purpose)) throw unavailable();
  let origin: URL;
  try { origin = new URL(process.env.AUTH_LINK_ORIGIN ?? ''); } catch { throw unavailable(); }
  if (!loopback.includes(origin.hostname) || origin.username || origin.password ||
      origin.search || origin.hash) throw unavailable();
}

export async function deliverAuthLink(purpose: AuthActionPurpose, email: string, url: string,
  mockSink?: MockAuthSink): Promise<void> {
  requireAuthDelivery(purpose, mockSink);
  let link: URL;
  try { link = new URL(url); } catch { throw unavailable(); }
  if (typeof email !== 'string' || !emailPattern.test(email) || email.length > 254) throw unavailable();
  if (process.env.AUTH_DELIVERY_MODE === 'smtp') {
    const config = smtpConfig(process.env);
    const recipient = email.toLowerCase();
    const path = purpose === 'customer_signup' ? '/signup' : '/reset-password';
    if (link.origin !== config.origin || link.pathname !== path || link.search ||
        link.username || link.password || !/^#token=[A-Za-z0-9_-]+$/.test(link.hash) ||
        url !== link.toString()) throw unavailable();
    const transport = nodemailer.createTransport({ host: config.host, port: config.port,
      secure: config.security === 'implicit_tls', requireTLS: config.security === 'starttls',
      auth: { user: config.user, pass: config.password },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 10000,
      disableFileAccess: true, disableUrlAccess: true });
    try {
      const result = await transport.sendMail({ from: config.from, to: recipient,
        subject: purpose === 'customer_signup' ? '회원가입 이메일 확인' : '비밀번호 재설정',
        text: `${purpose === 'customer_signup' ? '회원가입 이메일 확인' : '비밀번호 재설정'} 링크: ${url}` });
      if (result.accepted.length !== 1 || result.accepted[0]?.toLowerCase() !== recipient ||
          result.rejected.length) throw new Error('SMTP recipient rejected');
    } catch {
      throw new Error('Auth delivery failed');
    } finally { transport.close(); }
    return;
  }
  if (link.origin !== process.env.AUTH_LINK_ORIGIN || !loopback.includes(link.hostname) ||
      !link.hash.startsWith('#token=') || link.search || link.username || link.password) throw unavailable();
  await mockSink!({ purpose, email, url });
}
