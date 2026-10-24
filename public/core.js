// Keep the original browser storage namespace so renaming does not reset existing preferences.
export const SETTINGS_KEY = 'qiye.settings.v1';
export const APP_VERSION = '0.1.6-Beta';
export const SEARCH_HISTORY_KEY = 'qiye.search-history.v1';
export const MAX_CUSTOM_ENGINES = 6;
export const MAX_SEARCH_HISTORY = 20;
export const ENGINES = Object.freeze({
  baidu: { name: '百度', home: 'https://www.baidu.com/', action: 'https://www.baidu.com/s', param: 'wd' },
  google: { name: 'Google', home: 'https://www.google.com/', action: 'https://www.google.com/search', param: 'q' },
  bing: { name: 'Bing', home: 'https://www.bing.com/', action: 'https://www.bing.com/search', param: 'q' },
});
export const SEED_WALLPAPER = Object.freeze({
  id: 'OHR.DolbadarnWales_ZH-CN3649667806_1920x1080.jpg', date: '20261017',
  title: '75载，风华正茂', location: '多巴达恩城堡，威尔士',
  copyright: '多巴达恩城堡，兰贝里斯，斯诺登尼亚国家公园，威尔士 (© joe daniel price/Getty Images)',
  link: 'https://www.bing.com/search?q=多巴达恩城堡',
});
export const DEFAULTS = Object.freeze({
  version: 2, engine: 'baidu', showGreeting: true, useCustomGreeting: false, customGreeting: '', showClock: true, timeZone: '', showSeconds: false, showDate: true,
  showWeather: true, showShortcuts: true, showWallpaperButton: false, showWallpaperInfo: true,
  showWallpaperMode: false, showFullscreen: true, cloudImageFallback: false,
  newTab: false, dim: 25, wallpaperMode: 'daily', pinnedWallpaper: null,
  city: { name: '北京', latitude: 39.9042, longitude: 116.4074 },
  shortcuts: [], customEngines: [], engineOrder: ['baidu', 'google', 'bing'], hiddenEngines: [], googleNoticeDismissed: false,
});
const LEGACY_SHORTCUTS = new Map([
  ['GitHub', { url: 'https://github.com/', icon: 'github' }], ['知乎', { url: 'https://www.zhihu.com/', icon: '知' }],
  ['哔哩哔哩', { url: 'https://www.bilibili.com/', icon: 'bilibili' }], ['豆瓣', { url: 'https://www.douban.com/', icon: '豆' }],
]);
export function safeUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function validSearchTemplate(value) {
  if (typeof value !== 'string' || value.length > 2000 || !value.includes('{query}')) return false;
  const url = safeUrl(value.trim().replaceAll('{query}', 'baiye-query-marker'));
  return !!url && !new URL(url).origin.includes('baiye-query-marker');
}
export function normalizeCustomEngines(raw) {
  const engines = [], ids = new Set(), names = new Set(Object.values(ENGINES).map(engine => engine.name.toLowerCase()));
  if (!Array.isArray(raw)) return engines;
  for (const engine of raw) {
    if (!engine || typeof engine.id !== 'string' || !/^custom-[\w-]{1,80}$/.test(engine.id) ||
      typeof engine.name !== 'string' || !engine.name.trim() || engine.name.trim().length > 20 || !validSearchTemplate(engine.template)) continue;
    const name = engine.name.trim();
    if (ids.has(engine.id) || names.has(name.toLowerCase())) continue;
    engines.push({ id: engine.id, name, template: engine.template.trim() });
    ids.add(engine.id); names.add(name.toLowerCase());
    if (engines.length === MAX_CUSTOM_ENGINES) break;
  }
  return engines;
}
export function normalizeEngineOrder(raw) {
  const order = Array.isArray(raw) ? raw.filter(id => typeof id === 'string' && Object.hasOwn(ENGINES, id)) : [];
  return [...new Set([...order, ...Object.keys(ENGINES)])];
}
function normalizeHiddenEngines(raw, engineOrder) {
  const hidden = Array.isArray(raw) ? normalizeEngineOrder(engineOrder).filter(id => raw.includes(id)) : [];
  // Always keep at least one built-in engine available, even after custom engines are removed.
  return hidden.length === Object.keys(ENGINES).length ? hidden.slice(1) : hidden;
}
export function getEngines(customEngines = [], engineOrder, hiddenEngines = []) {
  const hidden = normalizeHiddenEngines(hiddenEngines, engineOrder);
  return Object.fromEntries([
    ...normalizeEngineOrder(engineOrder).filter(id => !hidden.includes(id)).map(id => [id, ENGINES[id]]),
    ...normalizeCustomEngines(customEngines).map(engine => [engine.id, engine]),
  ]);
}
export function normalizeSearchHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(query => typeof query === 'string' && query.trim() && query.trim().length <= 2000).map(query => query.trim()))].slice(0, MAX_SEARCH_HISTORY);
}
export function readSearchHistory(storage) {
  try { return normalizeSearchHistory(JSON.parse(storage.getItem(SEARCH_HISTORY_KEY))); } catch { return []; }
}
export function addSearchHistory(history, query) {
  return normalizeSearchHistory([query, ...history]);
}
export function validCity(city) {
  return !!city && typeof city.name === 'string' && city.name.trim().length > 0 && city.name.length <= 60 &&
    typeof city.latitude === 'number' && Number.isFinite(city.latitude) && Math.abs(city.latitude) <= 90 &&
    typeof city.longitude === 'number' && Number.isFinite(city.longitude) && Math.abs(city.longitude) <= 180;
}
export function validWallpaper(image) {
  return !!image && typeof image.id === 'string' && /^OHR\.[\w-]+_1920x1080\.jpg$/.test(image.id) &&
    typeof image.title === 'string' && typeof image.copyright === 'string' && typeof image.date === 'string' && /^\d{8}$/.test(image.date);
}
export function normalizeTimeZone(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 100) return '';
  try { return new Intl.DateTimeFormat('en', { timeZone: value.trim() }).resolvedOptions().timeZone; }
  catch { return ''; }
}
export function normalizeSettings(raw) {
  const result = structuredClone(DEFAULTS);
  if (!raw || typeof raw !== 'object') return result;
  result.customEngines = normalizeCustomEngines(raw.customEngines);
  result.engineOrder = normalizeEngineOrder(raw.engineOrder);
  result.hiddenEngines = normalizeHiddenEngines(raw.hiddenEngines, result.engineOrder);
  const engines = getEngines(result.customEngines, result.engineOrder, result.hiddenEngines);
  result.engine = Object.hasOwn(engines, raw.engine) ? raw.engine : Object.keys(engines)[0];
  for (const key of ['showGreeting', 'useCustomGreeting', 'showClock', 'showSeconds', 'showDate', 'showWeather', 'showShortcuts', 'showWallpaperButton', 'showWallpaperInfo', 'showWallpaperMode', 'showFullscreen', 'cloudImageFallback', 'newTab', 'googleNoticeDismissed']) {
    if (typeof raw[key] === 'boolean') result[key] = raw[key];
  }
  if (typeof raw.customGreeting === 'string') result.customGreeting = raw.customGreeting.trim().slice(0, 80);
  result.timeZone = normalizeTimeZone(raw.timeZone);
  if (typeof raw.dim === 'number' && Number.isFinite(raw.dim)) result.dim = Math.round(Math.max(0, Math.min(65, raw.dim)));
  if (validCity(raw.city)) result.city = { name: raw.city.name.trim(), latitude: raw.city.latitude, longitude: raw.city.longitude };
  if (validWallpaper(raw.pinnedWallpaper) && raw.wallpaperMode === 'fixed') {
    result.wallpaperMode = 'fixed'; result.pinnedWallpaper = raw.pinnedWallpaper;
  }
  if (Array.isArray(raw.shortcuts)) result.shortcuts = raw.shortcuts.filter(s => s && typeof s.name === 'string' && s.name.trim() && safeUrl(s.url)).slice(0, 8).map(s => ({ name: s.name.trim().slice(0, 12), url: safeUrl(s.url), icon: ['github', 'bilibili', '知', '豆'].includes(s.icon) ? s.icon : s.name.trim().slice(0, 1) }));
  // Remove only the prototype's seeded links; preserve user-created links on upgrade.
  if (raw.version !== 2) result.shortcuts = result.shortcuts.filter(s => {
    const seed = LEGACY_SHORTCUTS.get(s.name);
    return !seed || seed.url !== s.url || seed.icon !== s.icon;
  });
  return result;
}
export function readSettings(storage) {
  try { return normalizeSettings(JSON.parse(storage.getItem(SETTINGS_KEY))); } catch { return normalizeSettings(null); }
}
export function searchUrl(engine, query, customEngines = []) {
  const engines = getEngines(customEngines);
  const selected = Object.hasOwn(engines, engine) ? engines[engine] : ENGINES.baidu;
  const text = query.trim();
  if (!text) return selected.home || new URL(selected.template.replaceAll('{query}', '')).origin + '/';
  if (selected.template) return new URL(selected.template.replaceAll('{query}', encodeURIComponent(text))).href;
  const url = new URL(selected.action); url.searchParams.set(selected.param, text); return url.href;
}
export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
let supportsLunarCalendar = false;
try {
  supportsLunarCalendar = new Intl.DateTimeFormat('zh-CN-u-ca-chinese').resolvedOptions().calendar === 'chinese';
} catch { /* Older browsers may not support the Chinese calendar. */ }
export const SUPPORTS_LUNAR_CALENDAR = supportsLunarCalendar;
let homeFormatters;
function getHomeFormatters(timeZone = '') {
  if (homeFormatters?.timeZone === timeZone) return homeFormatters;
  const options = timeZone ? { timeZone } : {};
  homeFormatters = {
    timeZone,
    clock: new Intl.DateTimeFormat('en-GB', { ...options, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }),
    date: new Intl.DateTimeFormat('zh-CN', { ...options, month: 'long', day: 'numeric', weekday: 'long' }),
    lunar: SUPPORTS_LUNAR_CALENDAR ? new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { ...options, month: 'long', day: 'numeric' }) : null,
  };
  return homeFormatters;
}
export function formatClockParts(date = new Date(), timeZone = '') {
  const parts = getHomeFormatters(timeZone).clock.formatToParts(date);
  return ['hour', 'minute', 'second'].map(type => parts.find(part => part.type === type).value);
}
export function formatHomeDate(date = new Date(), timeZone = '') {
  return getHomeFormatters(timeZone).date.formatToParts(date).map(part => part.type === 'weekday' ? ` ${part.value}` : part.value).join('');
}
export function lunarDateText(date = new Date(), timeZone = '') {
  const lunarFormatter = getHomeFormatters(timeZone).lunar;
  if (!lunarFormatter) return '';
  const parts = lunarFormatter.formatToParts(date);
  const month = parts.find(part => part.type === 'month')?.value;
  const day = Number(parts.find(part => part.type === 'day')?.value);
  const numbers = '一二三四五六七八九十';
  const dayText = day <= 10 ? `初${numbers[day - 1]}` : day < 20 ? `十${numbers[day - 11]}` : day === 20 ? '二十' : day < 30 ? `廿${numbers[day - 21]}` : '三十';
  return month && day >= 1 && day <= 30 ? `农历${month}${dayText}` : '';
}
export function greetingText(settings, date = new Date()) {
  const custom = typeof settings.customGreeting === 'string' ? settings.customGreeting.trim().slice(0, 80) : '';
  if (settings.useCustomGreeting && custom) return custom;
  const hour = Number(formatClockParts(date, settings.timeZone)[0]);
  return hour < 6 ? '夜色温柔，记得好好休息。' : hour < 11 ? '晨光正好，开启新的一天。' : hour < 14 ? '日子很慢，今天也很好。' : hour < 18 ? '把午后的时光，留一点给自己。' : '晚风轻轻，愿你此刻自在。';
}
// NOAA's solar-position approximation, with the sunrise/sunset horizon at 90.833°.
// UTC keeps the selected city's daylight independent of the device's time zone.
// https://gml.noaa.gov/grad/solcalc/solareqns.PDF
export function defaultBackgroundPeriod(date = new Date(), city = DEFAULTS.city) {
  if (!validCity(city)) return date.getHours() >= 6 && date.getHours() < 18 ? 'day' : 'night';
  const radians = Math.PI / 180;
  const year = date.getUTCFullYear(), yearStart = Date.UTC(year, 0, 1);
  const day = Math.floor((date.getTime() - yearStart) / 86400000) + 1;
  const daysInYear = (Date.UTC(year + 1, 0, 1) - yearStart) / 86400000;
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const gamma = 2 * Math.PI / daysInYear * (day - 1 + (utcHours - 12) / 24);
  const equationOfTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const hourAngle = (utcHours * 60 + equationOfTime + 4 * city.longitude) / 4 - 180;
  const latitude = city.latitude * radians;
  const cosZenith = Math.sin(latitude) * Math.sin(declination) + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle * radians);
  return cosZenith >= Math.cos(90.833 * radians) ? 'day' : 'night';
}
export function normalizeBingImages(data) {
  if (!Array.isArray(data?.images)) return [];
  return data.images.map(item => {
    let id;
    try { id = new URL(item.url, 'https://www.bing.com').searchParams.get('id'); } catch { return null; }
    const image = { id, date: item.startdate, title: String(item.title || '今日风景').slice(0, 100), copyright: String(item.copyright || '').slice(0, 500), location: String(item.copyright || '').split(' (')[0].split('（')[0], link: 'https://www.bing.com/' };
    const link = safeUrl(item.copyrightlink);
    if (link && new URL(link).hostname === 'www.bing.com') image.link = link;
    return validWallpaper(image) ? image : null;
  }).filter(Boolean).slice(0, 8);
}
export function weatherCondition(code, isDay = true) {
  if (code === 0) return { label: isDay ? '晴' : '晴夜', icon: isDay ? 'sun' : 'moon' };
  if ([1, 2].includes(code)) return { label: '多云', icon: 'cloud' };
  if (code === 3) return { label: '阴', icon: 'cloud' };
  if ([45, 48].includes(code)) return { label: '雾', icon: 'cloud' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: '雪', icon: 'snow' };
  if ([95, 96, 99].includes(code)) return { label: '雷雨', icon: 'rain' };
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: '雨', icon: 'rain' };
  return { label: '天气', icon: 'cloud' };
}
