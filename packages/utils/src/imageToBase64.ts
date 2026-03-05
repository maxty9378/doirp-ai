export const imageToBase64 = ({
  size,
  img,
  type = 'image/webp',
}: {
  img: HTMLImageElement;
  size: number;
  type?: string;
}) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  let startX = 0;
  let startY = 0;

  if (img.width > img.height) {
    startX = (img.width - img.height) / 2;
  } else {
    startY = (img.height - img.width) / 2;
  }

  canvas.width = size;
  canvas.height = size;

  ctx.drawImage(
    img,
    startX,
    startY,
    Math.min(img.width, img.height),
    Math.min(img.width, img.height),
    0,
    0,
    size,
    size,
  );

  return canvas.toDataURL(type);
};

/**
 * Convert image URL to base64
 * Uses SSRF-safe fetch on server-side to prevent SSRF attacks
 */
export const imageUrlToBase64 = async (
  imageUrl: string,
): Promise<{ base64: string; mimeType: string }> => {
  try {
    const isServer = typeof window === 'undefined';
    const normalizedImageUrl =
      isServer && imageUrl.startsWith('/f/')
        ? (() => {
            const appUrl = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
            if (!appUrl) return imageUrl;

            try {
              const fileProxyUrl = new URL(imageUrl, appUrl);
              fileProxyUrl.searchParams.set('raw', '1');
              return fileProxyUrl.toString();
            } catch {
              return imageUrl;
            }
          })()
        : isServer
          ? (() => {
              try {
                const parsedUrl = new URL(imageUrl);
                if (parsedUrl.pathname.startsWith('/f/')) {
                  parsedUrl.searchParams.set('raw', '1');
                  return parsedUrl.toString();
                }
                return imageUrl;
              } catch {
                return imageUrl;
              }
            })()
          : imageUrl;

    // Use SSRF-safe fetch on server-side to prevent SSRF attacks
    const res = isServer
      ? await import('@lobechat/ssrf-safe-fetch').then((m) => m.ssrfSafeFetch(normalizedImageUrl))
      : await fetch(normalizedImageUrl);

    const blob = await res.blob();
    const arrayBuffer = await blob.arrayBuffer();

    // Client-side uses btoa, server-side uses Buffer
    const base64 = isServer
      ? Buffer.from(arrayBuffer).toString('base64')
      : btoa(
          new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''),
        );

    return { base64, mimeType: blob.type };
  } catch (error) {
    console.error('Error converting image to base64:', error);
    throw error;
  }
};
