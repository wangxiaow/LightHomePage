import { validWallpaper } from './core.js';
import { MAX_IMAGE_BYTES, isRasterImage, mediaType, readResponseBytes } from './network.js';

export function wallpaperImageUrl(image, size = '1920x1080') {
  if (!validWallpaper(image) || !['1920x1080', '1280x720', '400x240'].includes(size)) throw new Error('Invalid wallpaper');
  const id = image.id.replace('_1920x1080.jpg', `_${size}.jpg`);
  return `https://www.bing.com/th?${new URLSearchParams({ id })}`;
}

export function cloudWallpaperImageUrl(image, size = '1920x1080') {
  const id = new URL(wallpaperImageUrl(image, size)).searchParams.get('id');
  return `/api/image-proxy?${new URLSearchParams({ id })}`;
}

export async function fetchWallpaperBlob(image, { fetcher = fetch, signal, allowCloudFallback = false, cloudOnly = false, onFallback } = {}) {
  async function download(url, remote) {
    const response = await fetcher(url, {
      mode: remote ? 'cors' : 'same-origin', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error',
      signal: signal || AbortSignal.timeout(remote ? 8000 : 20000),
    });
    if (!response.ok || !isRasterImage(response.headers.get('content-type'))) {
      await response.body?.cancel().catch(() => {}); throw new Error('Image unavailable');
    }
    const bytes = await readResponseBytes(response, MAX_IMAGE_BYTES);
    if (!bytes.byteLength) throw new Error('Invalid image size');
    return new Blob([bytes], { type: mediaType(response.headers.get('content-type')) });
  }
  if (cloudOnly) return download(cloudWallpaperImageUrl(image), false);
  try { return await download(wallpaperImageUrl(image), true); }
  catch (error) {
    if (!allowCloudFallback || signal?.aborted) throw error;
    onFallback?.();
    return download(cloudWallpaperImageUrl(image), false);
  }
}
