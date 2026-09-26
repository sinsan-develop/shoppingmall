import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';

type Challenge = {
  phone: string;
  accountId: string;
  codeHash: Buffer;
  expiresAt: number;
  attempts: number;
};

function normalizePhone(value: string): string {
  if (typeof value !== 'string') throw new Error('Invalid phone');
  const digits = value.replace(/-/g, '');
  if (!/^01[016789]\d{7,8}$/.test(digits)) throw new Error('Invalid phone');
  return digits;
}

function digest(code: string) {
  return createHash('sha256').update(code).digest();
}

/** Development-only verifier. The caller decides how to deliver the generated code. */
export class MockPhoneOtp {
  private readonly challenges = new Map<string, Challenge>();

  constructor(
    private readonly deliver: (phone: string, code: string) => void,
    private readonly now: () => number = Date.now,
    private readonly generateCode: () => string = () => String(randomInt(100000, 1000000)),
  ) {}

  issue(phoneInput: string, accountId: string) {
    const phone = normalizePhone(phoneInput);
    if (!accountId) throw new Error('Account required');
    const code = this.generateCode();
    if (!/^\d{6}$/.test(code)) throw new Error('Invalid OTP generator');
    const challengeId = randomUUID();
    const expiresAt = this.now() + 5 * 60_000;
    this.challenges.set(challengeId, { phone, accountId, codeHash: digest(code), expiresAt, attempts: 0 });
    this.deliver(phone, code);
    return { challengeId, expiresAt: new Date(expiresAt) };
  }

  verify(challengeId: string, code: string, accountId: string): { phone: string; accountId: string } | undefined {
    const item = this.challenges.get(challengeId);
    if (!item || item.accountId !== accountId) return undefined;
    if (item.expiresAt < this.now() || item.attempts >= 5) {
      this.challenges.delete(challengeId);
      return undefined;
    }
    item.attempts += 1;
    if (typeof code !== 'string' || !/^\d{6}$/.test(code) || !timingSafeEqual(item.codeHash, digest(code))) {
      if (item.attempts >= 5) this.challenges.delete(challengeId);
      return undefined;
    }
    this.challenges.delete(challengeId);
    return { phone: item.phone, accountId: item.accountId };
  }
}
