import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { scanImageWithClamd } from '../src/catalog/image-scanner.ts';

test('real isolated ClamAV accepts re-encoded WebP and rejects harmless EICAR test pattern', {
  skip: process.env.CLAMD_INTEGRATION !== '1',
}, async () => {
  const clean = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#ffffff' } })
    .webp().toBuffer();
  const scanner = { host: '127.0.0.1', port: 3310, timeoutMs: 15000 };
  await scanImageWithClamd(clean, scanner);
  const eicar = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
  assert.equal(eicar.length, 68);
  await assert.rejects(scanImageWithClamd(eicar, scanner), /Image scan rejected/);
});
