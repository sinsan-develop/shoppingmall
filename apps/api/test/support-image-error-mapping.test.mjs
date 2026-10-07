import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

for (const controller of ['reviews','claims']) {
  test(`${controller} maps invalid sanitized image input to client errors`, () => {
    const source = readFileSync(new URL(`../src/support/${controller}.controller.ts`,
      import.meta.url),'utf8');
    const start = source.indexOf('async function handle');
    const mapping = source.slice(start,source.indexOf('\n}\n',start) + 2);
    for (const message of ['Invalid image','Image dimensions exceeded','Invalid image size'])
      assert.match(mapping,new RegExp(`['"]${message}['"]`),message);
    assert.match(mapping,/BadRequestException\(\{ status: 'invalid_image' \}\)/);
  });
}
