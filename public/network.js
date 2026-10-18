export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_JSON_BYTES = 512 * 1024;
const RASTER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']);

export function mediaType(value) {
  return String(value || '').split(';', 1)[0].trim().toLowerCase();
}
export function isRasterImage(value) { return RASTER_TYPES.has(mediaType(value)); }

// Stop reading at the limit, including chunked and decompressed responses.
export async function readResponseBytes(response, maxBytes) {
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    await response.body?.cancel().catch(() => {});
    throw new Error('Response too large or invalid Content-Length');
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader(), chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new Error('Response too large');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
