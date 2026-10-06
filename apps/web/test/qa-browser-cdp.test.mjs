import assert from 'node:assert/strict';
import test from 'node:test';
import { closeCdpPage, openCdpPage } from '../../../scripts/qa-browser-cdp.mjs';

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
