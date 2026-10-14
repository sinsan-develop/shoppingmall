import { getDocumentAsync } from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { readPickedAttachment } from './attachment-picker-core';

export async function pickAttachment() {
  const result = await getDocumentAsync({
    type: ['image/png', 'image/jpeg', 'image/webp'], multiple: false, copyToCacheDirectory: true,
  });
  return readPickedAttachment(result, Paths.cache.uri, uri => new File(uri));
}
