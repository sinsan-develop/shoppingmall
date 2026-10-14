import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readPickedAttachment } from '../src/attachment-picker-core.ts';

test('선택 취소는 파일을 읽거나 삭제하지 않는다', async () => {
  assert.equal(await readPickedAttachment({ canceled: true }, 'file:///cache/', () => { throw Error('접근 금지'); }), undefined);
});
test('앱 캐시 복사본만 읽고 삭제하며 원본 URI는 거부한다', async () => {
  let reads = 0, deletes = 0;
  const open = () => ({ size: 4, arrayBuffer: async () => { reads++; return new Uint8Array([1,2,3,4]).buffer; }, delete: () => { deletes++; } });
  const selected = { canceled: false, assets: [{ uri: 'file:///cache/picker/a.png', name: 'a.png', mimeType: 'image/png' }] };
  assert.equal((await readPickedAttachment(selected, 'file:///cache/', open)).bytes.byteLength, 4);
  assert.equal(reads, 1); assert.equal(deletes, 1);
  await assert.rejects(readPickedAttachment({ ...selected, assets: [{ ...selected.assets[0], uri: 'file:///documents/original.png' }] }, 'file:///cache/', open));
  assert.equal(deletes, 1);
});
test('큰 파일은 메모리에 읽기 전에 거부하고 선택 복사본을 정리한다', async () => {
  let reads = 0, deletes = 0;
  await assert.rejects(readPickedAttachment({ canceled: false, assets: [{ uri: 'file:///cache/a.png', name: 'a.png', mimeType: 'image/png' }] }, 'file:///cache/', () => ({ size: 5 * 1024 * 1024 + 1, arrayBuffer: async () => { reads++; return new ArrayBuffer(0); }, delete: () => { deletes++; } })), /5MB/);
  assert.equal(reads, 0); assert.equal(deletes, 1);
});
