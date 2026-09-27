import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { ImageQuarantine } from '../src/catalog/image-quarantine.ts';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');

test('staged image keys are server-generated, private and never user paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shoppingmall-upload-test-'));
  try {
    const store = new ImageQuarantine(root);
    const first = await store.put(png, 'image/png');
    assert.match(first.objectKey, /^quarantine\/[0-9a-f-]{36}\.webp$/);
    assert.equal(first.mimeType, 'image/webp');
    const diskPath = resolve(root, first.objectKey);
    assert.ok(diskPath.startsWith(resolve(root) + '\\') || diskPath.startsWith(resolve(root) + '/'));
    const stored = await readFile(diskPath);
    assert.equal(first.sizeBytes, stored.length);
    assert.notDeepEqual(stored, png);
    assert.equal((await sharp(stored).metadata()).format, 'webp');
    const metadata = await stat(diskPath);
    if (process.platform !== 'win32') assert.equal(metadata.mode & 0o077, 0);
    await assert.rejects(store.read('../outside.png'), /Invalid object key/);
    await assert.rejects(store.remove('../outside.png'), /Invalid object key/);
    await store.remove(first.objectKey);
    await assert.rejects(readFile(diskPath), { code: 'ENOENT' });
  } finally {
    if (resolve(root).startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/')) &&
        root.includes('shoppingmall-upload-test-')) await rm(root, { recursive: true, force: true });
  }
});

test('staging rejects unsupported bytes, declared MIME mismatch and oversized files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shoppingmall-upload-test-'));
  try {
    const store = new ImageQuarantine(root);
    await assert.rejects(store.put(Buffer.from('<svg></svg>'), 'image/svg+xml'), /Unsupported image/);
    await assert.rejects(store.put(png, 'image/jpeg'), /Image MIME mismatch/);
    await assert.rejects(store.put(Buffer.alloc(5 * 1024 * 1024 + 1), 'image/png'), /Image too large/);
  } finally {
    if (resolve(root).startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/')) &&
        root.includes('shoppingmall-upload-test-')) await rm(root, { recursive: true, force: true });
  }
});

test('staging rejects truncated containers and appended bytes even when the signature matches', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shoppingmall-upload-test-'));
  try {
    const store = new ImageQuarantine(root);
    await assert.rejects(store.put(png.subarray(0, 24), 'image/png'), /Invalid image container/);
    await assert.rejects(store.put(Buffer.concat([png, Buffer.from('hidden')]), 'image/png'), /Invalid image container/);
    const corruptPng = Buffer.from(png);
    corruptPng[20] ^= 1;
    await assert.rejects(store.put(corruptPng, 'image/png'), /Invalid image container/);
    await assert.rejects(store.put(Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.alloc(20)]), 'image/jpeg'), /Invalid image container/);
    const malformedWebp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(20)]);
    await assert.rejects(store.put(malformedWebp, 'image/webp'), /Invalid image container/);
  } finally {
    if (resolve(root).startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/')) &&
        root.includes('shoppingmall-upload-test-')) await rm(root, { recursive: true, force: true });
  }
});
