import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { basename, isAbsolute, join, parse, resolve } from 'node:path';

const maxBytes = 5 * 1024 * 1024;
const keyPattern = /^quarantine\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/;

function pngCrc(bytes: Buffer, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let index = start; index < end; index++) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function detectImage(bytes: Buffer): { mimeType: string; extension: string } {
  if (bytes.length < 16) throw new Error('Unsupported image');
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    let offset = 8;
    let imageData = false;
    let end = false;
    let chunks = 0;
    while (offset + 12 <= bytes.length) {
      const size = bytes.readUInt32BE(offset);
      if (size > bytes.length - offset - 12) throw new Error('Invalid image container');
      const kind = bytes.toString('ascii', offset + 4, offset + 8);
      if (chunks++ === 0 && (kind !== 'IHDR' || size !== 13)) throw new Error('Invalid image container');
      if (pngCrc(bytes, offset + 4, offset + 8 + size) !== bytes.readUInt32BE(offset + 8 + size)) {
        throw new Error('Invalid image container');
      }
      if (kind === 'IDAT') imageData = true;
      offset += size + 12;
      if (kind === 'IEND') {
        if (size !== 0 || offset !== bytes.length) throw new Error('Invalid image container');
        end = true;
        break;
      }
    }
    if (!imageData || !end) throw new Error('Invalid image container');
    return { mimeType: 'image/png', extension: 'png' };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    if (bytes.length < 4 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
      throw new Error('Invalid image container');
    }
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    if (bytes.length < 20 || bytes.readUInt32LE(4) + 8 !== bytes.length ||
        !['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16))) {
      throw new Error('Invalid image container');
    }
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
