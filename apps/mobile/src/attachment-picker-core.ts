import type { Attachment } from './customer-api';

type Asset = { uri: string; name: string; mimeType?: string; file?: { size: number; arrayBuffer(): Promise<ArrayBuffer> } };
type LocalFile = { size: number; arrayBuffer(): Promise<ArrayBuffer>; delete(): void };
const limit = 5 * 1024 * 1024;
function checkSize(size: number) {
  if (!Number.isFinite(size) || size < 1 || size > limit) throw new Error('첨부는 1바이트 이상 5MB 이하입니다.');
}
export async function readPickedAttachment(
  result: { canceled: boolean; assets?: Asset[] | null }, cacheUri: string,
  open: (uri: string) => LocalFile,
): Promise<Attachment | undefined> {
  if (result.canceled) return undefined;
  const asset = result.assets?.[0];
  if (!asset) throw new Error('선택한 파일이 없습니다.');
  let local: LocalFile | undefined;
  if (!asset.file) {
    const cache = new URL(cacheUri), selected = new URL(asset.uri);
    const prefix = cache.pathname.endsWith('/') ? cache.pathname : `${cache.pathname}/`;
    if (cache.protocol !== 'file:' || selected.protocol !== 'file:' || selected.host !== cache.host || !selected.pathname.startsWith(prefix)) {
      throw new Error('앱 캐시에 복사된 첨부만 읽을 수 있습니다.');
    }
    local = open(asset.uri);
  }
  try {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType ?? '')) throw new Error('PNG·JPEG·WebP만 첨부할 수 있습니다.');
    const file = asset.file ?? local!;
    checkSize(file.size);
    const bytes = await file.arrayBuffer();
    checkSize(bytes.byteLength);
    return { name: asset.name, mimeType: asset.mimeType!, bytes };
  } finally {
    local?.delete();
  }
}
