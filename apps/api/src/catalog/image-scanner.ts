import { createConnection } from 'node:net';

export type ClamdOptions = { host: '127.0.0.1' | '::1'; port: number; timeoutMs?: number };

/** ClamAV has no authentication on its TCP socket; only a local daemon is accepted. */
export async function scanImageWithClamd(bytes: Buffer, options: ClamdOptions): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 5000;
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > 5 * 1024 * 1024 ||
      !options || !['127.0.0.1', '::1'].includes(options.host) ||
      !Number.isInteger(options.port) || options.port < 1 || options.port > 65535 ||
      !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) {
    throw new Error('Image scan unavailable');
  }
  const size = Buffer.alloc(4);
  size.writeUInt32BE(bytes.length);
  const payload = Buffer.concat([Buffer.from('zINSTREAM\0'), size, bytes, Buffer.alloc(4)]);

  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host: options.host, port: options.port });
    let settled = false;
    let response = Buffer.alloc(0);
    const timer = setTimeout(() => finish(new Error('Image scan unavailable')), timeoutMs);
    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve();
    }
    socket.once('connect', () => socket.write(payload));
    socket.on('data', (chunk: Buffer) => {
      response = Buffer.concat([response, chunk]);
      if (response.length > 512) { finish(new Error('Image scan unavailable')); return; }
      const terminator = response.indexOf(0);
      if (terminator < 0) return;
      if (terminator !== response.length - 1) { finish(new Error('Image scan unavailable')); return; }
      const verdict = response.toString('utf8', 0, terminator);
      if (verdict === 'stream: OK') finish();
      else if (/^stream: .+ FOUND$/.test(verdict)) finish(new Error('Image scan rejected'));
      else finish(new Error('Image scan unavailable'));
    });
    socket.once('error', () => finish(new Error('Image scan unavailable')));
    socket.once('close', () => finish(new Error('Image scan unavailable')));
  });
}
