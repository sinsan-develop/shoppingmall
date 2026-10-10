import type { AuthActionPurpose } from './action-tokens.js';

export type MockAuthMessage = { purpose: AuthActionPurpose; email: string; url: string };
export type MockAuthSink = (message: MockAuthMessage) => Promise<void>;

export async function deliverAuthLink(purpose: AuthActionPurpose, email: string, url: string,
  mockSink?: MockAuthSink): Promise<void> {
  const unavailable = () => new Error('Auth delivery unavailable');
  const loopback = ['127.0.0.1', '::1', 'localhost'];
  if (process.env.AUTH_DELIVERY_MODE !== 'mock' || process.env.APP_ENV !== 'development' ||
      !loopback.includes(process.env.API_HOST ?? '') || !mockSink ||
      !['admin_setup', 'customer_signup', 'password_reset'].includes(purpose)) throw unavailable();
  let link: URL;
  try { link = new URL(url); } catch { throw unavailable(); }
  if (link.origin !== process.env.AUTH_LINK_ORIGIN || !loopback.includes(link.hostname) ||
      !link.hash.startsWith('#token=') || link.search || link.username || link.password ||
      typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw unavailable();
  await mockSink({ purpose, email, url });
}
