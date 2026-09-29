import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import test from 'node:test';
import { scanImageWithClamd } from '../src/catalog/image-scanner.ts';

const image = Buffer.from('sanitized-webp-test-bytes');

async function withScanner(reply, run) {
  let received;
  const server = createServer((socket) => {
    let input = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      input = Buffer.concat([input, chunk]);
      if (input.length < 14) return;
      const size = input.readUInt32BE(10);
      if (input.length < 18 + size) return;
      received = input;
      if (reply !== null) socket.end(Buffer.from(reply));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { await run(server.address().port, () => received); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('scanner streams only sanitized bytes with ClamAV framing and accepts only exact clean reply', async () => {
  await withScanner('stream: OK\0', async (port, received) => {
    await scanImageWithClamd(image, { host: '127.0.0.1', port, timeoutMs: 1000 });
    const size = Buffer.alloc(4);
    size.writeUInt32BE(image.length);
    assert.deepEqual(received(), Buffer.concat([Buffer.from('zINSTREAM\0'), size, image, Buffer.alloc(4)]));
  });
});

test('scanner fails closed for infection, daemon errors, malformed replies and missing configuration', async () => {
  for (const reply of ['stream: Eicar-Signature FOUND\0', 'stream: INSTREAM size limit exceeded ERROR\0', 'PONG\0']) {
    await withScanner(reply, async (port) => {
      await assert.rejects(scanImageWithClamd(image, { host: '127.0.0.1', port, timeoutMs: 1000 }),
        /Image scan rejected|Image scan unavailable/);
    });
  }
  await assert.rejects(scanImageWithClamd(image, { host: '0.0.0.0', port: 3310 }), /Image scan unavailable/);
  await assert.rejects(scanImageWithClamd(image, { host: '127.0.0.1', port: 0 }), /Image scan unavailable/);
});

test('scanner times out and closes the connection when daemon does not answer', async () => {
  await withScanner(null, async (port) => {
    await assert.rejects(scanImageWithClamd(image, { host: '127.0.0.1', port, timeoutMs: 50 }),
      /Image scan unavailable/);
  });
});
