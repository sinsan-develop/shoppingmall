import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import test from 'node:test';
import { SMTPServer } from 'smtp-server';
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

function decodedMailBody(raw) {
  const encoded = raw.split('\r\n\r\n')[1].replace(/=\r\n/g, '');
  const bytes = [];
  for (let index = 0; index < encoded.length; index++) {
    if (encoded[index] === '=' && /^[0-9A-F]{2}$/.test(encoded.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(encoded.slice(index + 1, index + 3), 16));
      index += 2;
    } else bytes.push(encoded.charCodeAt(index));
  }
  return Buffer.from(bytes).toString('utf8');
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

test('isolated TLS SMTP receives one normalized address and only the one-time link',
  { timeout: 20000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shoppingmall-smtp-'));
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    const keyPath = join(directory, 'key.pem');
    const certPath = join(directory, 'cert.pem');
    const cert = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', keyPath, '-out', certPath, '-days', '1', '-subj', '/CN=localhost',
      '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { encoding: 'utf8' });
    assert.equal(cert.status, 0, 'isolated TLS certificate generation must succeed');
    try {
      for (const security of ['implicit_tls', 'starttls']) {
        const received = [];
        let recipient;
        const server = new SMTPServer({ secure: security === 'implicit_tls',
          key: await readFile(keyPath), cert: await readFile(certPath),
          disabledCommands: ['AUTH'], authOptional: true,
          onRcptTo(address, _session, callback) { recipient = address.address; callback(); },
          onData(stream, _session, callback) {
            let source = '';
            stream.on('data', (chunk) => { source += chunk.toString(); });
            stream.on('end', () => { received.push(source); callback(); });
          },
        });
        try {
          await new Promise((resolveListen, reject) => server.listen(0, '127.0.0.1',
            (error) => error ? reject(error) : resolveListen()));
          const port = server.server.address().port;
          const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval',
            "import {deliverAuthLink} from './apps/api/src/auth/delivery.ts'; await deliverAuthLink('customer_signup', 'User@Example.invalid', 'https://shop.example.invalid/signup#token=fakeOneTimeToken');"], {
            cwd: new URL('../../../', import.meta.url),
            env: { ...process.env, NODE_EXTRA_CA_CERTS: certPath, AUTH_DELIVERY_MODE: 'smtp',
              AUTH_LINK_ORIGIN: 'https://shop.example.invalid', SMTP_HOST: '127.0.0.1',
              SMTP_PORT: String(port), SMTP_SECURITY: security, SMTP_USER: 'fake-user',
              SMTP_PASSWORD: 'fake-test-secret', SMTP_FROM: 'no-reply@example.invalid' },
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          const errors = [];
          child.stderr.on('data', (chunk) => errors.push(chunk.toString()));
          const code = await new Promise((resolveExit, reject) => {
            child.on('error', reject); child.on('exit', resolveExit);
          });
          assert.equal(code, 0, `${security}: ${errors.join('').replaceAll('fake-test-secret', '[redacted]')}`);
          assert.equal(recipient, 'user@example.invalid');
          assert.equal(received.length, 1);
          assert.match(decodedMailBody(received[0]),
            /https:\/\/shop\.example\.invalid\/signup#token=fakeOneTimeToken/);
          assert.doesNotMatch(received[0], /fake-test-secret|admin_setup/);
        } finally {
          await new Promise((resolveClose) => server.close(resolveClose));
        }
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

test('STARTTLS refuses a server that offers only plaintext before sending a link',
  { timeout: 15000 }, async () => {
    const commands = [];
    const server = createServer((socket) => {
      socket.write('220 localhost ESMTP\r\n');
      socket.on('data', (data) => {
        const command = data.toString();
        commands.push(command);
        if (/^EHLO /i.test(command)) {
          socket.write('250 localhost\r\n');
          setTimeout(() => socket.end(), 20);
        }
      });
    });
    await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
    try {
      configure({ SMTP_HOST: '127.0.0.1',
        SMTP_PORT: String(server.address().port), SMTP_SECURITY: 'starttls' });
      await assert.rejects(delivery.deliverAuthLink('password_reset', 'user@example.invalid',
        'https://shop.example.invalid/reset-password#token=fakeOneTimeToken'),
      (error) => error.message === 'Auth delivery failed');
      assert.doesNotMatch(commands.join(''), /MAIL FROM|RCPT TO|fakeOneTimeToken|fake-test-secret/i);
    } finally {
      await new Promise((resolveClose) => server.close(resolveClose));
    }
  });

test('isolated DB HTTP signup and reset send only eligible SMTP links and consume each once',
  { skip: !process.env.AUTH_INTAKE_TEST_DB_SYSTEM_ID, timeout: 45000 }, async () => {
    assert.equal(process.env.PGDATABASE, 'shoppingmall_auth_intake_1011');
    assert.equal(new URL(process.env.DATABASE_URL).pathname, '/shoppingmall_auth_intake_1011');
    const directory = await mkdtemp(join(tmpdir(), 'shoppingmall-smtp-'));
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    const keyPath = join(directory, 'key.pem');
    const certPath = join(directory, 'cert.pem');
    const certificate = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', keyPath, '-out', certPath, '-days', '1', '-subj', '/CN=localhost',
      '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { encoding: 'utf8' });
    assert.equal(certificate.status, 0);
    const received = [];
    const recipients = [];
    const server = new SMTPServer({ secure: true, key: await readFile(keyPath),
      cert: await readFile(certPath), disabledCommands: ['AUTH'], authOptional: true,
      onRcptTo(address, _session, callback) { recipients.push(address.address); callback(); },
      onData(stream, _session, callback) {
        let source = '';
        stream.on('data', (chunk) => { source += chunk.toString(); });
        stream.on('end', () => { received.push(source); callback(); });
      },
    });
    try {
      await new Promise((resolveListen, reject) => server.listen(0, '127.0.0.1',
        (error) => error ? reject(error) : resolveListen()));
      const childCode = `
        import assert from 'node:assert/strict';
        import { createHmac, randomUUID } from 'node:crypto';
        import { Pool } from 'pg';
        import { createApp } from './src/app.ts';
        import { processAuthIntakeOnce } from './src/auth/intake-worker.ts';
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        const identity = await pool.query('SELECT current_database() AS name, system_identifier::text AS id FROM pg_control_system()');
        assert.equal(identity.rows[0].name, 'shoppingmall_auth_intake_1011');
        assert.equal(identity.rows[0].id, process.env.AUTH_INTAKE_TEST_DB_SYSTEM_ID);
        const email = 'smtp-flow-' + randomUUID() + '@example.invalid';
        const unknown = 'smtp-unknown-' + randomUUID() + '@example.invalid';
        const oldPassword = 'isolated-smtp-old-password-123';
        const newPassword = 'isolated-smtp-new-password-123';
        const sourceHashes = ['127.0.0.1', '::ffff:127.0.0.1', '::1'].map((source) =>
          createHmac('sha256', process.env.AUTH_AUDIT_HMAC_KEY).update('source:' + source).digest('hex'));
        let app;
        try {
          app = await createApp();
          await app.listen(0, '127.0.0.1');
          const base = 'http://127.0.0.1:' + app.getHttpServer().address().port;
          const post = (path, body) => fetch(base + path, { method: 'POST',
            headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:9091' },
            body: JSON.stringify(body) });
          const signup = await post('/auth/customer-signup/start', { email });
          assert.equal(signup.status, 201);
          assert.deepEqual(await signup.json(), { status: 'accepted' });
          await processAuthIntakeOnce(pool, new Date());
          const signupReply = new Promise((resolve) => process.once('message', resolve));
          process.send({ phase: 'signup', email });
          const signupToken = (await signupReply).token;
          const complete = await post('/auth/customer-signup/complete', { token: signupToken, password: oldPassword });
          assert.equal(complete.status, 201);
          assert.deepEqual(await complete.json(), { status: 'ok' });
          assert.equal((await post('/auth/customer-signup/complete', { token: signupToken, password: oldPassword })).status, 401);
          assert.equal((await post('/auth/login', { email, password: oldPassword })).status, 201);
          const duplicate = await post('/auth/customer-signup/start', { email });
          const unknownStart = await post('/auth/password-reset/start', { email: unknown });
          assert.equal(duplicate.status, 201);
          assert.deepEqual(await duplicate.json(), { status: 'accepted' });
          assert.equal(unknownStart.status, 201);
          assert.deepEqual(await unknownStart.json(), { status: 'accepted' });
          await processAuthIntakeOnce(pool, new Date());
          await processAuthIntakeOnce(pool, new Date());
          process.send({ phase: 'negative' });
          const resetStart = await post('/auth/password-reset/start', { email });
          assert.equal(resetStart.status, 201);
          assert.deepEqual(await resetStart.json(), { status: 'accepted' });
          await processAuthIntakeOnce(pool, new Date());
          const resetReply = new Promise((resolve) => process.once('message', resolve));
          process.send({ phase: 'reset', email });
          const resetToken = (await resetReply).token;
          assert.equal((await post('/auth/password-reset/complete', { token: resetToken, password: newPassword })).status, 201);
          assert.equal((await post('/auth/password-reset/complete', { token: resetToken, password: newPassword })).status, 401);
          assert.equal((await post('/auth/login', { email, password: oldPassword })).status, 401);
          assert.equal((await post('/auth/login', { email, password: newPassword })).status, 201);
          const stored = await pool.query("SELECT count(*)::int AS n FROM account_identities WHERE kind='email' AND identifier=$1 AND verified_at IS NOT NULL", [email]);
          assert.equal(stored.rows[0].n, 1);
          const jobs = await pool.query("SELECT count(*)::int AS n FROM auth_intake_jobs WHERE email=ANY($1::text[]) AND status='done'", [[email, unknown]]);
          assert.equal(jobs.rows[0].n, 4);
          process.send({ phase: 'done' });
        } finally {
          if (app) await app.close();
          const account = await pool.query("SELECT account_id FROM account_identities WHERE kind='email' AND identifier=$1", [email]);
          await pool.query('DELETE FROM auth_intake_jobs WHERE email=ANY($1::text[])', [[email, unknown]]);
          await pool.query('DELETE FROM auth_action_tokens WHERE email=ANY($1::text[])', [[email, unknown]]);
          if (account.rows[0]) {
            const id = account.rows[0].account_id;
            await pool.query('DELETE FROM audit_events WHERE actor_account_id=$1', [id]);
            await pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [id]);
            await pool.query('DELETE FROM account_roles WHERE account_id=$1', [id]);
            await pool.query('DELETE FROM account_identities WHERE account_id=$1', [id]);
            await pool.query('DELETE FROM accounts WHERE id=$1', [id]);
          }
          await pool.query("DELETE FROM auth_security_events WHERE purpose=ANY($1::text[]) AND source_hash=ANY($2::text[])",
            [['customer_signup', 'password_reset'], sourceHashes]);
          await pool.end();
        }
      `;
      const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', childCode], {
        cwd: new URL('../', import.meta.url),
        env: { ...process.env, NODE_EXTRA_CA_CERTS: certPath,
          AUTH_DELIVERY_MODE: 'smtp', APP_ENV: 'development', API_HOST: '127.0.0.1',
          AUTH_LINK_ORIGIN: 'https://shop.example.invalid', WEB_ORIGIN: 'http://127.0.0.1:9091',
          SMTP_HOST: '127.0.0.1', SMTP_PORT: String(server.server.address().port),
          SMTP_SECURITY: 'implicit_tls', SMTP_USER: 'fake-user',
          SMTP_PASSWORD: 'fake-test-secret', SMTP_FROM: 'no-reply@example.invalid' },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      const phases = [];
      child.on('message', (message) => {
        phases.push(message.phase);
        if (message.phase === 'signup' || message.phase === 'reset') {
          const expectedPath = message.phase === 'signup' ? '/signup' : '/reset-password';
          const expectedCount = message.phase === 'signup' ? 1 : 2;
          assert.equal(received.length, expectedCount);
          assert.equal(recipients.at(-1), message.email);
          const match = decodedMailBody(received.at(-1)).match(/https:\/\/shop\.example\.invalid\/[^\s]+/);
          assert.ok(match);
          const link = new URL(match[0]);
          assert.equal(link.pathname, expectedPath);
          assert.equal(link.search, '');
          child.send({ token: link.hash.slice('#token='.length) });
        } else if (message.phase === 'negative') {
          assert.equal(received.length, 1);
        }
      });
      const errors = [];
      child.stderr.on('data', (chunk) => errors.push(chunk.toString()));
      const code = await new Promise((resolveExit, reject) => {
        child.on('error', reject); child.on('exit', resolveExit);
      });
      assert.equal(code, 0, errors.join('').replaceAll('fake-test-secret', '[redacted]'));
      assert.deepEqual(phases, ['signup', 'negative', 'reset', 'done']);
      assert.equal(received.length, 2);
      assert.doesNotMatch(received.join(''), /fake-test-secret|isolated-smtp-.*password/);
    } finally {
      await new Promise((resolveClose) => server.close(resolveClose));
      await rm(directory, { recursive: true, force: true });
    }
  });
