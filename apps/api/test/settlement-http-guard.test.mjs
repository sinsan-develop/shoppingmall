import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.ts';

test('settlement routes deny anonymous read and reject cross-origin completion', async () => {
  const app = await createApp();
  try {
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    for (const route of ['/admin/settlement', '/seller/settlement']) {
      const response = await fetch(`${base}${route}?from=2026-05-01&to=2026-05-20`);
      assert.equal(response.status, 401, route);
    }
    const completion = await fetch(`${base}/admin/settlement/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sellerId: '11111111-1111-4111-8111-111111111111',
        from: '2026-05-01', to: '2026-05-20', reason: 'test' }),
    });
    assert.equal(completion.status, 403);
    const commission = await fetch(`${base}/admin/settlement/commissions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sellerId: '11111111-1111-4111-8111-111111111111',
        requestId: '22222222-2222-4222-8222-222222222222', amountWon: 1000,
        occurredAt: '2026-05-02T00:00:00.000Z', reason: 'test' }),
    });
    assert.equal(commission.status, 403);
  } finally { await app.close(); }
});
