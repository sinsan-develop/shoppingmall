import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { basename, isAbsolute, join, parse, resolve } from 'node:path';

const maxBytes = 5 * 1024 * 1024;
const keyPattern = /^quarantine\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/;

function detectImage(bytes: Buffer): { mimeType: string; extension: string } {
  if (bytes.length < 16) throw new Error('Unsupported image');
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { mimeType: 'image/png', extension: 'png' };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return { mimeType: 'image/webp', extension: 'webp' };
  }
  throw new Error('Unsupported image');
}

/** Development-only quarantine. Bytes are not decoded, virus-scanned, or publicly served. */
export class ImageQuarantine {
  private readonly root: string;

  constructor(root: string) {
    if (!root || !isAbsolute(root)) throw new Error('Dedicated absolute upload root required');
    const target = resolve(root);
    if (target === parse(target).root || !basename(target).startsWith('shoppingmall-upload')) {
      throw new Error('Dedicated absolute upload root required');
    }
    this.root = target;
  }

  private pathFor(objectKey: string) {
    if (!keyPattern.test(objectKey)) throw new Error('Invalid object key');
    return join(this.root, 'quarantine', objectKey.slice('quarantine/'.length));
  }

  async put(bytes: Buffer, declaredMimeType: string) {
    if (!Buffer.isBuffer(bytes)) throw new Error('Unsupported image');
    if (bytes.length > maxBytes) throw new Error('Image too large');
    const image = detectImage(bytes);
    if (declaredMimeType !== image.mimeType) throw new Error('Image MIME mismatch');
    const objectKey = `quarantine/${randomUUID()}.${image.extension}`;
    const path = this.pathFor(objectKey);
    await mkdir(join(this.root, 'quarantine'), { recursive: true, mode: 0o700 });
    const handle = await open(path, 'wx', 0o600);
    try {
      await handle.writeFile(bytes);
    } catch (error) {
      await handle.close();
      await unlink(path);
      throw error;
    }
    await handle.close();
    return { objectKey, mimeType: image.mimeType, sizeBytes: bytes.length };
  }

  async read(objectKey: string) { return readFile(this.pathFor(objectKey)); }

  async remove(objectKey: string) { await unlink(this.pathFor(objectKey)); }
}
