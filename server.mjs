import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { APP_VERSION, SEED_WALLPAPER } from './public/core.js';
import { wallpaperImageUrl } from './public/images.js';
import { MAX_IMAGE_BYTES, MAX_JSON_BYTES, mediaType, isRasterImage, readResponseBytes } from './public/network.js';

const publicDirectory = fileURLToPath(new URL('./public/', import.meta.url));
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/core.js', ['core.js', 'text/javascript; charset=utf-8']],
  ['/images.js', ['images.js', 'text/javascript; charset=utf-8']],
  ['/network.js', ['network.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
  ['/third-party-notices.txt', ['third-party-notices.txt', 'text/plain; charset=utf-8']],
  ['/license.txt', ['license.txt', 'text/plain; charset=utf-8']],
]);
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: https://www.bing.com; connect-src 'self' https://www.bing.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action https://www.baidu.com https://www.google.com https://www.bing.com",
};
const apiSecurityHeaders = { 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; sandbox" };

export function createRateLimiter({ maxEntries = 2000, maxRequests = 100, windowMs = 60000, now = Date.now } = {}) {
  const entries = new Map();
  let nextSweep = 0;
  return {
    allow(address) {
      const time = now();
      if (time >= nextSweep) {
        for (const [key, value] of entries) if (time - value.started >= windowMs) entries.delete(key);
        nextSweep = time + 1000;
      }
      let entry = entries.get(address);
      if (!entry || time - entry.started >= windowMs) {
        if (!entry && entries.size >= maxEntries) return false;
        entry = { started: time, count: 0 }; entries.set(address, entry);
      }
      return ++entry.count <= maxRequests;
    },
  };
}

export function apiTarget(url) {
  if (url.pathname === '/api/bing') return { url: 'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=zh-CN', ttl: 900000, type: 'json' };
  if (['/api/image', '/api/image-proxy'].includes(url.pathname)) {
    const id = url.searchParams.get('id');
    if (!id || !/^OHR\.[\w-]+_(1920x1080|1280x720|400x240)\.jpg$/.test(id) || id.length > 150) return null;
    return { url: `https://www.bing.com/th?${new URLSearchParams({ id })}`, ttl: 86400000, type: url.pathname === '/api/image-proxy' ? 'image' : 'redirect' };
  }
  if (url.pathname === '/api/weather') {
    const lat = url.searchParams.get('latitude'), lon = url.searchParams.get('longitude');
    if (!lat || !lon || !/^-?\d{1,3}(\.\d{1,6})?$/.test(lat) || !/^-?\d{1,3}(\.\d{1,6})?$/.test(lon) || Math.abs(Number(lat)) > 90 || Math.abs(Number(lon)) > 180) return null;
    const params = new URLSearchParams({ latitude: Number(lat).toFixed(3), longitude: Number(lon).toFixed(3), current: 'temperature_2m,weather_code,is_day', daily: 'temperature_2m_max,temperature_2m_min', timezone: 'auto', forecast_days: '1' });
    return { url: `https://api.open-meteo.com/v1/forecast?${params}`, ttl: 1800000, type: 'json' };
  }
  if (url.pathname === '/api/geocode') {
    const name = url.searchParams.get('name')?.trim();
    if (!name || name.length < 2 || name.length > 60) return null;
    return { url: `https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name, count: '6', language: 'zh', format: 'json' })}`, ttl: 86400000, type: 'json' };
  }
  return null;
}

export function createApp({ upstreamFetch = fetch } = {}) {
  const cache = new Map(), pending = new Map(), limiter = createRateLimiter();
  let cacheBytes = 0, pendingImages = 0;
  function cachePut(key, value) {
    if (cache.has(key)) { cacheBytes -= cache.get(key).body.length; cache.delete(key); }
    cache.set(key, value); cacheBytes += value.body.length;
    while (cacheBytes > 24 * 1024 * 1024 || cache.size > 150) {
      const oldestKey = cache.keys().next().value; cacheBytes -= cache.get(oldestKey).body.length; cache.delete(oldestKey);
    }
  }
  async function upstream(target) {
    const cached = cache.get(target.url);
    if (cached && cached.expires > Date.now()) return { ...cached, state: 'HIT' };
    if (pending.has(target.url)) return pending.get(target.url);
    if (pending.size >= 8 || (target.type === 'image' && pendingImages >= 2)) {
      const error = new Error('Upstream capacity reached'); error.code = 'CAPACITY'; throw error;
    }
    if (target.type === 'image') pendingImages++;
    const task = (async () => {
      try {
        const response = await upstreamFetch(target.url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': `BaiyeStartpage/${APP_VERSION}`, Accept: target.type === 'image' ? 'image/jpeg' : 'application/json' }, redirect: 'error' });
        const contentType = mediaType(response.headers.get('content-type'));
        if (!response.ok || (target.type === 'image' ? !isRasterImage(contentType) : contentType !== 'application/json')) {
          await response.body?.cancel().catch(() => {}); throw new Error('Unexpected upstream status or type');
        }
        const body = Buffer.from(await readResponseBytes(response, target.type === 'image' ? MAX_IMAGE_BYTES : MAX_JSON_BYTES));
        if (!body.length) throw new Error('Empty upstream response');
        if (target.type === 'json') JSON.parse(body.toString('utf8'));
        const value = { body, contentType, expires: Date.now() + target.ttl };
        cachePut(target.url, value); return { ...value, state: 'MISS' };
      } catch (error) {
        if (cached && Date.now() - cached.expires < 86400000) return { ...cached, state: 'STALE' };
        throw error;
      }
    })().finally(() => { pending.delete(target.url); if (target.type === 'image') pendingImages--; });
    pending.set(target.url, task); return task;
  }
  function send(response, status, body, headers = {}, head = false) {
    response.writeHead(status, { ...securityHeaders, 'Content-Type': 'application/json; charset=utf-8', ...headers });
    response.end(head ? undefined : body);
  }
  const server = http.createServer({ headersTimeout: 10000, requestTimeout: 15000, keepAliveTimeout: 5000, maxHeaderSize: 8192 }, async (request, response) => {
    const head = request.method === 'HEAD';
    if (!['GET', 'HEAD'].includes(request.method)) { send(response, 405, '{"error":"Method not allowed"}', { Allow: 'GET, HEAD' }); return; }
    if (request.headers['transfer-encoding'] || Number(request.headers['content-length'] || 0) > 0) {
      send(response, 400, '{"error":"Request bodies are not accepted"}', { Connection: 'close' }); return;
    }
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/assets/fallback.jpg') {
        send(response, 302, '', { Location: wallpaperImageUrl(SEED_WALLPAPER), 'Cache-Control': 'public, max-age=86400' }, head); return;
      }
      if (url.pathname.startsWith('/api/')) {
        const target = apiTarget(url);
        if (!target) { send(response, 400, '{"error":"Invalid API request"}', apiSecurityHeaders, head); return; }
        const address = request.socket.remoteAddress || 'local';
        if (!limiter.allow(address)) { send(response, 429, '{"error":"Too many requests"}', { ...apiSecurityHeaders, 'Retry-After': '60' }, head); return; }
        if (target.type === 'redirect') {
          send(response, 302, '', { Location: target.url, 'Cache-Control': 'public, max-age=86400' }, head); return;
        }
        try {
          const result = await upstream(target);
          send(response, 200, result.body, { ...apiSecurityHeaders, 'Content-Type': result.contentType, 'Cache-Control': result.state === 'STALE' ? 'no-store' : `public, max-age=${Math.max(0, Math.floor((result.expires - Date.now()) / 1000))}`, 'X-Cache': result.state, ...(target.type === 'image' ? { 'Content-Disposition': 'attachment; filename="wallpaper.jpg"' } : {}), ...(result.state === 'STALE' ? { Warning: '110 - "Response is stale"' } : {}) }, head);
        } catch (error) { send(response, error.code === 'CAPACITY' ? 503 : 502, '{"error":"Upstream service unavailable"}', { ...apiSecurityHeaders, 'Cache-Control': 'no-store', ...(error.code === 'CAPACITY' ? { 'Retry-After': '1' } : {}) }, head); }
        return;
      }
      const file = files.get(url.pathname);
      if (!file) { send(response, 404, '{"error":"Not found"}', {}, head); return; }
      const body = await readFile(resolve(publicDirectory, file[0]));
      send(response, 200, body, { 'Content-Type': file[1], 'Cache-Control': url.pathname.endsWith('.jpg') ? 'public, max-age=604800' : 'no-cache', 'Content-Length': body.length }, head);
    } catch { send(response, 500, '{"error":"Server error"}', {}, head); }
  });
  server.maxConnections = 256;
  server.maxRequestsPerSocket = 100;
  server.setTimeout(15000, socket => socket.destroy());
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 5173), host = process.env.HOST || '127.0.0.1';
  createApp().listen(port, host, () => console.log(`白页已启动 · http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`));
}
