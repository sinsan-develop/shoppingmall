import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('private image preview uses authenticated fetch and an in-origin blob URL', () => {
  const source = readFileSync(new URL('../app/account/private-image.tsx', import.meta.url), 'utf8');
  assert.match(source, /credentials="include"/);
  assert.match(source, /URL\.createObjectURL/);
  assert.match(source, /URL\.revokeObjectURL/);
  assert.match(source, /이미지를 불러오지 못했습니다/);
});

test('seller and operator private previews use the authenticated image component', () => {
  for (const file of ['../app/account/seller/products/page.tsx', '../app/account/admin/proposals/page.tsx']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /<PrivateImage/);
    assert.doesNotMatch(source, /<img className="draft-image-preview"\s+src=\{`\$\{apiOrigin\}/);
  }
});

test('public gallery fetches without credentials and avoids a broken cross-origin image tag', () => {
  const component = readFileSync(new URL('../app/account/private-image.tsx', import.meta.url), 'utf8');
  const detail = readFileSync(new URL('../app/products/[productId]/page.tsx', import.meta.url), 'utf8');
  assert.match(component, /credentials="omit"/);
  assert.match(detail, /<PublicImage/);
  assert.doesNotMatch(detail, /<img className="detail-main-photo"/);
});
