'use client';

import { useEffect, useState } from 'react';

function WebpImage({ src, alt, className, onLoad, credentials }: {
  src: string; alt: string; className?: string; onLoad?: () => void;
  credentials: RequestCredentials;
}) {
  const [blobUrl, setBlobUrl] = useState<string>();
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setBlobUrl(undefined);
    setError(false);
    void (async () => {
      try {
        const response = await fetch(src, { credentials, signal: controller.signal,
          cache: 'no-store' });
        if (!response.ok || !response.headers.get('content-type')?.startsWith('image/webp')) {
          throw new Error('Private image unavailable');
        }
        const bytes = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(bytes);
        setBlobUrl(objectUrl);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    })();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, credentials]);

  if (error) return <span role="alert">이미지를 불러오지 못했습니다</span>;
  if (!blobUrl) return <span role="status">사진을 불러오는 중</span>;
  return <img src={blobUrl} alt={alt} className={className}
    onLoad={onLoad} onError={() => setError(true)} />;
}

type ImageProps = { src: string; alt: string; className?: string; onLoad?: () => void };

export function PrivateImage(props: ImageProps) {
  return <WebpImage {...props} credentials="include" />;
}

export function PublicImage(props: ImageProps) {
  return <WebpImage {...props} credentials="omit" />;
}
