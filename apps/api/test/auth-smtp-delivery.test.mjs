import assert from 'node:assert/strict';
import test from 'node:test';
import * as delivery from '../src/auth/delivery.ts';

const keys = ['AUTH_DELIVERY_MODE', 'APP_ENV', 'API_HOST', 'AUTH_LINK_ORIGIN',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURITY', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'];
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

function configure(overrides = {}) {
  Object.assign(process.env, {
    AUTH_DELIVERY_MODE: 'smtp', AUTH_LINK_ORIGIN: 'https://shop.example.invalid',
    SMTP_HOST: 'mail.example.invalid', SMTP_PORT: '587', SMTP_SECURITY: 'starttls',
    SMTP_USER: 'test-user', SMTP_PASSWORD: 'fake-test-secret',
    SMTP_FROM: 'no-reply@example.invalid', ...overrides,
  });
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
  }
}

test.after(() => {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

test('SMTP boot rejects missing or unsafe configuration without echoing secrets', () => {
  assert.equal(typeof delivery.assertAuthDeliveryBootConfig, 'function');
  const bad = [
    { SMTP_HOST: undefined }, { SMTP_PORT: '0' }, { SMTP_PORT: '65536' },
    { SMTP_PORT: '25abc' }, { SMTP_SECURITY: 'none' }, { SMTP_USER: undefined },
    { SMTP_PASSWORD: undefined }, { SMTP_FROM: 'bad\r\nBcc: victim@example.invalid' },
    { AUTH_LINK_ORIGIN: 'http://shop.example.invalid' },
    { AUTH_LINK_ORIGIN: 'https://user:pass@shop.example.invalid' },
    { AUTH_LINK_ORIGIN: 'https://shop.example.invalid/?secret=abc' },
  ];
  for (const overrides of bad) {
    configure(overrides);
    assert.throws(() => delivery.assertAuthDeliveryBootConfig(process.env), (error) => {
      assert.doesNotMatch(error.message, /fake-test-secret|secret=abc|user:pass|Bcc:/);
      return true;
    });
  }
  configure();
  assert.doesNotThrow(() => delivery.assertAuthDeliveryBootConfig(process.env));
});

test('SMTP permits only signup and reset with exact HTTPS origin and fragment token', async () => {
  configure();
  assert.doesNotThrow(() => delivery.requireAuthDelivery('customer_signup'));
  assert.doesNotThrow(() => delivery.requireAuthDelivery('password_reset'));
  assert.throws(() => delivery.requireAuthDelivery('admin_setup'), /unavailable/i);
  const badLinks = [
    'http://shop.example.invalid/signup#token=secret-token',
    'https://other.example.invalid/signup#token=secret-token',
    'https://user:pass@shop.example.invalid/signup#token=secret-token',
    'https://shop.example.invalid/signup?token=secret-token#token=secret-token',
    'https://shop.example.invalid/admin-setup#token=secret-token',
    'https://shop.example.invalid/signup#other=secret-token',
  ];
  for (const url of badLinks) {
    await assert.rejects(delivery.deliverAuthLink('customer_signup', 'user@example.invalid', url),
      (error) => !error.message.includes('secret-token') && !error.message.includes('user:pass'));
  }
  await assert.rejects(delivery.deliverAuthLink('customer_signup', 'bad-address',
    'https://shop.example.invalid/signup#token=secret-token'), /unavailable/i);
});

test('disabled remains closed and mock remains development loopback only', async () => {
  configure({ AUTH_DELIVERY_MODE: 'disabled' });
  assert.throws(() => delivery.requireAuthDelivery('customer_signup'), /unavailable/i);
  configure({ AUTH_DELIVERY_MODE: 'mock', APP_ENV: 'development', API_HOST: '127.0.0.1',
    AUTH_LINK_ORIGIN: 'http://127.0.0.1:9091' });
  const received = [];
  const sink = async (message) => received.push(message);
  await delivery.deliverAuthLink('customer_signup', 'user@example.invalid',
    'http://127.0.0.1:9091/signup#token=fake', sink);
  assert.equal(received.length, 1);
  process.env.API_HOST = '0.0.0.0';
  assert.throws(() => delivery.requireAuthDelivery('customer_signup', sink), /unavailable/i);
});
