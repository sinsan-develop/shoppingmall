import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { sanitizeImage } from '../src/catalog/image-sanitizer.ts';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');

test('decodes and re-encodes accepted image without carrying source metadata or bytes', async () => {
  const source = await sharp(png).withMetadata({ orientation: 6 }).png().toBuffer();
  const result = await sanitizeImage(source, 'image/png');
  assert.equal(result.mimeType, 'image/webp');
  assert.equal(result.width, 1);
  assert.equal(result.height, 1);
  assert.notDeepEqual(result.bytes, source);
  const decoded = await sharp(result.bytes).metadata();
  assert.equal(decoded.format, 'webp');
  assert.equal(decoded.exif, undefined);
  assert.equal(decoded.icc, undefined);
});

test('rejects false MIME, malformed raster, SVG and pixel-limit excess', async () => {
  await assert.rejects(sanitizeImage(png, 'image/jpeg'), /Image MIME mismatch/);
  await assert.rejects(sanitizeImage(Buffer.from('<svg></svg>'), 'image/svg+xml'), /Unsupported image/);
  await assert.rejects(sanitizeImage(png.subarray(0, 30), 'image/png'), /Invalid image/);
  const oversized = await sharp({ create: { width: 4097, height: 1, channels: 3, background: '#ffffff' } })
    .png().toBuffer();
  await assert.rejects(sanitizeImage(oversized, 'image/png'), /Image dimensions exceeded/);
});
