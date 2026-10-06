import assert from 'node:assert/strict';
import test from 'node:test';
import { closeCdpPage, createCdpCommandChannel, openCdpPage } from '../../../scripts/qa-browser-cdp.mjs';

test('CDP open timeout closes the created page instead of hanging', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('/json/new')) return { ok: true, json: async () => ({
      id: 'page-timeout', webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/page/page-timeout',
    }) };
    return { ok: true };
  };
  class NeverOpeningSocket {
    static OPEN = 1;
    static CLOSING = 2;
    readyState = 0;
    close() { this.readyState = 3; }
  }
  await assert.rejects(openCdpPage({ debugging: 'http://127.0.0.1:9229', fetchImpl,
    WebSocketImpl: NeverOpeningSocket, timeoutMs: 10 }), /timed out/i);
  assert.ok(calls.some((url) => url.endsWith('/json/close/page-timeout')));
});

test('CDP cleanup still closes the page when socket close throws', async () => {
  const calls = [];
  await closeCdpPage({ debugging: 'http://127.0.0.1:9229', page: { id: 'page-close' },
    socket: { readyState: 1, close() { throw new Error('socket close failed'); } },
    WebSocketImpl: { CLOSING: 2 }, fetchImpl: async (url) => { calls.push(url); return { ok: true }; } });
  assert.deepEqual(calls, ['http://127.0.0.1:9229/json/close/page-close']);
});

test('CDP command rejects on response timeout', async () => {
  const socket = { readyState: 1, send() {} };
  const channel = createCdpCommandChannel(socket, { WebSocketImpl: { OPEN: 1 }, timeoutMs: 10 });
  await assert.rejects(channel.send('Runtime.evaluate'), /timed out/i);
  assert.equal(channel.pendingCount(), 0);
});

test('CDP command error identifies the failed method', async () => {
  let sent;
  const socket = { readyState: 1, send(value) { sent = JSON.parse(value); } };
  const channel = createCdpCommandChannel(socket, { WebSocketImpl: { OPEN: 1 }, timeoutMs: 1_000 });
  const request = channel.send('Runtime.evaluate', { expression: 'document.body' });
  socket.onmessage({ data: JSON.stringify({ id: sent.id,
    error: { message: 'Object reference chain is too long' } }) });
  await assert.rejects(request,
    /Chrome command failed: Runtime\.evaluate: Object reference chain is too long/);
  assert.equal(channel.pendingCount(), 0);
});

test('keyboard traversal tolerates native date segments that retain the same DOM focus', async () => {
  const { visitKeyboardTargets } =
    await import('../../../scripts/qa-browser-cdp.mjs');
  const sequence = ['0', '1', '1', '1', '1', '2'];
  let presses = 0;

  assert.equal(typeof visitKeyboardTargets, 'function');
  const visited = await visitKeyboardTargets(3, async () => sequence[presses++] ?? null);

  assert.deepEqual([...visited], ['0', '1', '2']);
  assert.equal(presses, 6);
});

test('CDP socket close rejects every pending command', async () => {
  const socket = { readyState: 1, send() {} };
  const channel = createCdpCommandChannel(socket, { WebSocketImpl: { OPEN: 1 }, timeoutMs: 1_000 });
  const first = channel.send('Page.enable');
  const second = channel.send('Runtime.enable');
  socket.onclose();
  await assert.rejects(first, /closed/i);
  await assert.rejects(second, /closed/i);
  assert.equal(channel.pendingCount(), 0);
});
