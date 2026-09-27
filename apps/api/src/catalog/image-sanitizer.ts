import sharp from 'sharp';

const maxSourceBytes = 5 * 1024 * 1024;
const maxOutputBytes = 5 * 1024 * 1024;
const maxDimension = 4096;
const maxPixels = 16_000_000;
const formats: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
};

/** Decoding and fresh encoding are required before bytes may be considered for public delivery. */
export async function sanitizeImage(bytes: Buffer, declaredMimeType: string) {
  if (!Buffer.isBuffer(bytes) || !formats[declaredMimeType]) throw new Error('Unsupported image');
  if (bytes.length === 0 || bytes.length > maxSourceBytes) throw new Error('Invalid image size');
  try {
    const pipeline = sharp(bytes, { limitInputPixels: maxPixels, failOn: 'error' });
    const metadata = await pipeline.metadata();
    if (metadata.format !== formats[declaredMimeType]) throw new Error('Image MIME mismatch');
    if (!metadata.width || !metadata.height || metadata.width > maxDimension ||
        metadata.height > maxDimension || metadata.width * metadata.height > maxPixels ||
        (metadata.pages ?? 1) !== 1) throw new Error('Image dimensions exceeded');
    const sanitized = await pipeline.rotate().webp({ quality: 82, effort: 4 }).toBuffer({ resolveWithObject: true });
    if (sanitized.data.length === 0 || sanitized.data.length > maxOutputBytes) throw new Error('Invalid image size');
    return {
      bytes: sanitized.data,
      mimeType: 'image/webp' as const,
      width: sanitized.info.width,
      height: sanitized.info.height,
    };
  } catch (error) {
    if (error instanceof Error && /^(Image MIME mismatch|Image dimensions exceeded|Invalid image size)$/.test(error.message)) {
      throw error;
    }
    throw new Error('Invalid image', { cause: error });
  }
}
