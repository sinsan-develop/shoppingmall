import assert from 'node:assert/strict';
import test from 'node:test';

for (const controller of ['reviews','claims']) {
  test(`${controller} maps sanitized image failures to exact HTTP statuses`, async () => {
    const module = await import(`../src/support/${controller}.controller.ts`);
    assert.equal(typeof module.handle,'function','the real controller error boundary is testable');
    for (const [message,status] of [
      ['Invalid image',400],
      ['Invalid image size',400],
      ['Image dimensions exceeded',413],
      ['Image too large',413],
    ]) {
      await assert.rejects(module.handle(() => Promise.reject(new Error(message))),
        (error) => error.getStatus?.() === status,`${message} must be HTTP ${status}`);
    }
  });
}
