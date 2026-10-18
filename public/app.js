import { SETTINGS_KEY, APP_VERSION, SUPPORTS_LUNAR_CALENDAR, SEARCH_HISTORY_KEY, MAX_CUSTOM_ENGINES, DEFAULTS, SEED_WALLPAPER, readSettings, normalizeSettings, getEngines, validSearchTemplate, readSearchHistory, addSearchHistory, validCity, validWallpaper, safeUrl, searchUrl, localDateKey, formatHomeDate, lunarDateText, greetingText, defaultBackgroundPeriod, normalizeBingImages, weatherCondition } from './core.js';
import { wallpaperImageUrl, cloudWallpaperImageUrl, fetchWallpaperBlob } from './images.js';
import { MAX_JSON_BYTES, mediaType, readResponseBytes } from './network.js';

const $ = selector => document.querySelector(selector);
let settings;
try { settings = readSettings(window.localStorage); } catch { settings = normalizeSettings(null); }
let searchHistory;
try { searchHistory = readSearchHistory(window.localStorage); } catch { searchHistory = []; }
let currentWallpaper = settings.pinnedWallpaper || SEED_WALLPAPER;
let wallpapers = [SEED_WALLPAPER];
let wallpaperRequest = null;
let wallpaperSequence = 0;
let wallpaperObjectUrl = null;
let wallpaperState = 'loading';
let pendingWallpaper = null;
let clockTimer, backgroundTimer, midnightTimer, toastTimer, cityTimer, weatherController, cityController;
let weatherRequestKey = '';
let lastWeatherAttempt = 0;
let activeTab = 'appearance';
let storageAvailable = true;

function getCache(key) { try { return JSON.parse(localStorage.getItem(`qiye.${key}.v1`)); } catch { return null; } }
function setCache(key, value) { try { localStorage.setItem(`qiye.${key}.v1`, JSON.stringify(value)); } catch { /* Cached data is optional. */ } }
function toast(message) {
  const target = $('#toast'); target.textContent = message; target.classList.add('is-visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => target.classList.remove('is-visible'), 3200);
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); storageAvailable = true; }
  catch { if (storageAvailable) toast('浏览器存储不可用，本次设置仅在当前页面生效'); storageAvailable = false; }
  $('#save-state').textContent = storageAvailable ? '设置自动保存在当前浏览器' : '存储不可用 · 本次设置仅临时生效';
}

// Two small image blobs: the last daily wallpaper and the pinned wallpaper.
// IndexedDB also works on self-hosted HTTP origins; no service worker is required.
let databasePromise;
function database() {
  if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('qiye-images', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('images');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return databasePromise;
}
async function storedImage(key, value) {
  try {
    const db = await database();
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('images', value === undefined ? 'readonly' : 'readwrite');
      const store = transaction.objectStore('images');
      const request = value === undefined ? store.get(key) : value === null ? store.delete(key) : store.put(value, key);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch { return undefined; }
}
async function fetchJson(url, signal) {
  const response = await fetch(url, { signal: signal || AbortSignal.timeout(12000), credentials: 'omit', redirect: 'error' });
  if (!response.ok || mediaType(response.headers.get('content-type')) !== 'application/json') {
    await response.body?.cancel().catch(() => {}); throw new Error(`Invalid JSON response: HTTP ${response.status}`);
  }
  const data = JSON.parse(new TextDecoder().decode(await readResponseBytes(response, MAX_JSON_BYTES)));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid JSON object');
  if (response.headers.get('X-Cache') === 'STALE' || response.headers.get('X-Baiye-Cache') === 'STALE' || response.headers.get('X-Qiye-Cache') === 'STALE') data._baiyeStale = true;
  return data;
}

function updateClock() {
  clearTimeout(clockTimer);
  const now = new Date();
  const parts = [now.getHours(), now.getMinutes()];
  if (settings.showSeconds) parts.push(now.getSeconds());
  $('#clock').replaceChildren(...parts.flatMap((part, index) => {
    const number = document.createTextNode(String(part).padStart(2, '0'));
    if (!index) return [number];
    const colon = document.createElement('span'); colon.className = 'colon'; colon.textContent = ':';
    return [colon, number];
  }));
  $('#clock').dateTime = now.toISOString();
  $('#date').textContent = formatHomeDate(now);
  const lunar = lunarDateText(now);
  if (lunar) $('#date').title = lunar; else $('#date').removeAttribute('title');
  $('#greeting').textContent = greetingText(settings, now);
  if (!document.hidden && (settings.showClock || settings.showGreeting || settings.showDate)) {
    const interval = settings.showClock && settings.showSeconds ? 1000 : 60000;
    clockTimer = setTimeout(updateClock, interval - Date.now() % interval + 20);
  }
}
function updateDefaultBackground() {
  clearTimeout(backgroundTimer);
  const root = document.documentElement;
  const period = defaultBackgroundPeriod(new Date(), settings.city);
  root.dataset.background = wallpaperObjectUrl ? 'wallpaper' : 'default';
  root.dataset.backgroundPeriod = period;
  $('meta[name="theme-color"]').content = !wallpaperObjectUrl && period === 'day' ? '#edf1f0' : '#536451';
  if (!document.hidden && !wallpaperObjectUrl) backgroundTimer = setTimeout(updateDefaultBackground, 60000 - Date.now() % 60000 + 20);
}
function applySettings() {
  document.documentElement.style.setProperty('--dim', settings.dim / 100);
  $('#clock').hidden = !settings.showClock;
  $('#clock').classList.toggle('with-seconds', settings.showSeconds);
  $('#greeting').hidden = !settings.showGreeting;
  $('#date').hidden = !settings.showDate;
  $('#weather').hidden = !settings.showWeather;
  $('#weather-widget').hidden = !settings.showWeather;
  $('#detail-divider').hidden = !settings.showDate || !settings.showWeather;
  $('.hero-details').hidden = !settings.showDate && !settings.showWeather;
  const hasHero = settings.showGreeting || settings.showClock || settings.showDate || settings.showWeather;
  $('.hero').hidden = !hasHero;
  $('.main-content').classList.toggle('hero-hidden', !hasHero);
  $('#open-wallpapers').hidden = !settings.showWallpaperButton;
  $('#wallpaper-credit').hidden = !settings.showWallpaperInfo;
  $('#toggle-pin').hidden = !settings.showWallpaperMode;
  $('#fullscreen').hidden = !settings.showFullscreen;
  $('#footer-divider').hidden = !settings.showWallpaperMode || !settings.showFullscreen;
  $('.site-footer').hidden = !settings.showWallpaperInfo && !settings.showWallpaperMode && !settings.showFullscreen;
  document.querySelectorAll('[data-setting]').forEach(input => { input.checked = settings[input.dataset.setting]; });
  $('[data-setting="showSeconds"]').disabled = !settings.showClock;
  $('[data-setting="useCustomGreeting"]').disabled = !settings.showGreeting;
  $('#custom-greeting-editor').hidden = !settings.useCustomGreeting;
  $('#custom-greeting').value = settings.customGreeting;
  $('#custom-greeting').disabled = !settings.showGreeting;
  $('#date-setting-note').textContent = SUPPORTS_LUNAR_CALENDAR ? '日期与星期，悬停日期可查看农历' : '显示日期与星期';
  $('#daily-wallpaper').checked = settings.wallpaperMode === 'daily';
  $('#dim-range').value = settings.dim; $('#dim-value').value = `${settings.dim}%`;
  $('#city-note').textContent = `当前城市：${settings.city.name} · 天气每 30 分钟更新`;
  updateEngine(); updateClock(); updateDefaultBackground(); updateWallpaperMetadata(); renderShortcuts();
}
function updateEngine() {
  const engines = getEngines(settings.customEngines), engine = engines[settings.engine];
  $('#engine-tabs').replaceChildren(...Object.entries(engines).map(([id, item]) => {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.engine = id; button.textContent = item.name;
    button.setAttribute('aria-pressed', String(id === settings.engine)); return button;
  }));
  $('#search-input').name = engine.param || 'q';
  $('#search-form').action = engine.action || searchUrl(settings.engine, '', settings.customEngines);
  $('#search-form').target = settings.newTab ? '_blank' : '_self';
  $('#search-form').rel = 'noopener noreferrer';
  renderEngineList();
}
$('#engine-tabs').addEventListener('click', event => {
  const button = event.target.closest('[data-engine]'); if (!button) return;
  settings.engine = button.dataset.engine; saveSettings(); updateEngine(); $('#search-input').focus();
});
function submitSearch(value) {
  const query = value.trim();
  $('#search-input').value = query;
  if (query) { searchHistory = addSearchHistory(searchHistory, query); saveSearchHistory(); renderSearchHistory(); }
  const url = searchUrl(settings.engine, query, settings.customEngines);
  if (settings.newTab) window.open(url, '_blank', 'noopener,noreferrer'); else window.location.assign(url);
}
$('#search-form').addEventListener('submit', event => {
  event.preventDefault(); submitSearch($('#search-input').value);
});
function saveSearchHistory() {
  try { localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory)); }
  catch { toast('浏览器存储不可用，搜索历史仅在当前页面生效'); }
}
function renderSearchHistory() {
  $('#search-history').hidden = searchHistory.length === 0;
  $('#search-history-list').replaceChildren(...searchHistory.map(query => {
    const item = document.createElement('li');
    const search = document.createElement('button'); search.type = 'button'; search.className = 'history-query'; search.textContent = query; search.title = query;
    search.setAttribute('aria-label', `再次搜索：${query}`); search.addEventListener('click', () => submitSearch(query));
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'history-remove'; remove.setAttribute('aria-label', `删除搜索记录：${query}`); remove.title = '删除这条记录'; remove.append(svg('close'));
    remove.addEventListener('click', () => {
      const index = searchHistory.indexOf(query); searchHistory = searchHistory.filter(item => item !== query); saveSearchHistory(); renderSearchHistory();
      const next = $('#search-history-list').children[Math.min(index, searchHistory.length - 1)];
      (next?.querySelector('.history-query') || $('#search-input')).focus();
    });
    item.append(search, remove); return item;
  }));
}
$('#clear-search-history').addEventListener('click', () => {
  searchHistory = []; saveSearchHistory(); renderSearchHistory(); $('#search-input').focus();
});
let pendingEngineRemoval = null, engineDeleteTrigger = null;
const engineDeletePopover = $('#engine-delete-popover');
const nativeEnginePopover = typeof engineDeletePopover.showPopover === 'function';
function closeEngineDelete(restoreFocus = false) {
  const trigger = engineDeleteTrigger;
  pendingEngineRemoval = null; engineDeleteTrigger = null;
  trigger?.setAttribute('aria-expanded', 'false');
  if (nativeEnginePopover && engineDeletePopover.matches(':popover-open')) engineDeletePopover.hidePopover();
  engineDeletePopover.hidden = true;
  if (restoreFocus && trigger?.isConnected) trigger.focus({ preventScroll: true });
}
function openEngineDelete(id, name, trigger) {
  closeEngineDelete();
  pendingEngineRemoval = id; engineDeleteTrigger = trigger;
  trigger.setAttribute('aria-expanded', 'true');
  $('#engine-delete-description').textContent = `确认删除“${name}”吗？`;
  engineDeletePopover.hidden = false;
  if (nativeEnginePopover) engineDeletePopover.showPopover({ source: trigger });
  const anchor = trigger.getBoundingClientRect(), bounds = $('#settings-dialog').getBoundingClientRect();
  const width = engineDeletePopover.offsetWidth, height = engineDeletePopover.offsetHeight;
  const left = Math.max(bounds.left + 12, Math.min(anchor.right - width, bounds.right - width - 12));
  const below = anchor.bottom + 8;
  const top = below + height <= bounds.bottom - 12 ? below : Math.max(bounds.top + 12, anchor.top - height - 8);
  engineDeletePopover.style.left = `${left}px`; engineDeletePopover.style.top = `${top}px`;
  $('#cancel-engine-delete').focus({ preventScroll: true });
}
$('#cancel-engine-delete').addEventListener('click', () => closeEngineDelete(true));
$('#confirm-engine-delete').addEventListener('click', () => {
  const id = pendingEngineRemoval;
  if (!id) return;
  closeEngineDelete();
  settings.customEngines = settings.customEngines.filter(engine => engine.id !== id);
  if (settings.engine === id) settings.engine = 'baidu';
  saveSettings(); updateEngine(); $('#engine-name').focus();
});
engineDeletePopover.addEventListener('toggle', event => {
  if (event.newState === 'closed' && !engineDeletePopover.matches(':popover-open')) closeEngineDelete();
});
document.addEventListener('keydown', event => {
  if (pendingEngineRemoval && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeEngineDelete(true); }
});
document.addEventListener('pointerdown', event => {
  if (!nativeEnginePopover && pendingEngineRemoval && !engineDeletePopover.contains(event.target) && !engineDeleteTrigger?.contains(event.target)) closeEngineDelete();
});
$('.settings-body').addEventListener('scroll', () => closeEngineDelete(), { passive: true });
$('#settings-dialog').addEventListener('close', () => closeEngineDelete());
window.addEventListener('resize', () => closeEngineDelete());
function renderEngineList() {
  closeEngineDelete();
  const engines = Object.entries(getEngines(settings.customEngines));
  $('#engine-list').replaceChildren(...engines.map(([id, engine], index) => {
    const row = document.createElement('div'); row.className = 'engine-list-row';
    const name = document.createElement('span'); name.textContent = engine.name;
    const key = document.createElement('small'); key.textContent = `Alt + ${index + 1}`;
    row.append(name, key);
    if (engine.template) {
      const remove = document.createElement('button'); remove.type = 'button'; remove.setAttribute('aria-label', `删除搜索引擎：${engine.name}`); remove.setAttribute('aria-haspopup', 'dialog'); remove.setAttribute('aria-controls', 'engine-delete-popover'); remove.setAttribute('aria-expanded', 'false'); remove.append(svg('trash'));
      remove.addEventListener('click', () => openEngineDelete(id, engine.name, remove)); row.append(remove);
    } else {
      const builtIn = document.createElement('small'); builtIn.className = 'engine-built-in'; builtIn.textContent = '默认'; row.append(builtIn);
    }
    return row;
  }));
  $('#engine-shortcut-note').textContent = `在首页按 Alt + 1–${engines.length}，按上方顺序切换搜索引擎；按 / 聚焦搜索框。`;
  $('#engine-form').hidden = settings.customEngines.length >= MAX_CUSTOM_ENGINES;
}
$('#engine-form').addEventListener('submit', event => {
  event.preventDefault(); const name = $('#engine-name').value.trim(), template = $('#engine-url').value.trim();
  if (!name || !validSearchTemplate(template)) { toast('请填写名称和包含 {query} 的有效 http 或 https 搜索地址'); return; }
  if (settings.customEngines.length >= MAX_CUSTOM_ENGINES) { toast('最多添加 6 个自定义搜索引擎'); return; }
  if (Object.values(getEngines(settings.customEngines)).some(engine => engine.name.toLowerCase() === name.toLowerCase())) { toast('这个搜索引擎名称已存在'); return; }
  settings.customEngines.push({ id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, name, template });
  saveSettings(); updateEngine(); $('#engine-form').reset(); toast('搜索引擎已添加');
});
document.addEventListener('keydown', event => {
  if (document.querySelector('dialog[open]')) return;
  const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if (event.key === '/' && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); $('#search-input').focus(); }
  if (event.altKey && !event.ctrlKey && !event.metaKey && /^[1-9]$/.test(event.key)) {
    const engine = Object.keys(getEngines(settings.customEngines))[Number(event.key) - 1];
    if (engine) { event.preventDefault(); settings.engine = engine; saveSettings(); updateEngine(); }
  }
  if (event.key === 'Escape' && editing) document.activeElement.blur();
});

function updateWallpaperMetadata() {
  const pinned = settings.wallpaperMode === 'fixed';
  $('#toggle-pin').classList.toggle('is-pinned', pinned);
  $('#toggle-pin').setAttribute('aria-pressed', String(pinned));
  $('#toggle-pin').title = pinned ? '恢复每日自动更换' : '固定当前壁纸';
  $('#toggle-pin').disabled = !wallpaperObjectUrl && !pinned;
  $('#wallpaper-mode-label').textContent = pinned ? '已留住风景' : '每日焕新';
  const info = $('#wallpaper-info');
  info.disabled = !wallpaperObjectUrl;
  info.replaceChildren(document.createTextNode(wallpaperObjectUrl ? currentWallpaper.location || currentWallpaper.title : wallpaperState === 'unavailable' ? '风景暂时无法加载' : '风景正在路上'));
  if (wallpaperObjectUrl) info.append(svg('info'));
  $('#wallpaper-source').textContent = wallpaperObjectUrl ? 'Bing 每日壁纸' : '可在设置中选择或刷新壁纸';
  $('#wallpaper-copyright').textContent = currentWallpaper.copyright;
  const link = safeUrl(currentWallpaper.link);
  $('#about-wallpaper-link').href = link && new URL(link).hostname === 'www.bing.com' ? link : 'https://www.bing.com/';
  $('#daily-wallpaper').checked = !pinned;
}
function showWallpaperNotice(message, { busy = false, canRetry = true } = {}) {
  $('#wallpaper-status-message').textContent = message;
  $('#wallpaper-status').hidden = false;
  $('.wallpaper-notice-actions').hidden = !canRetry;
  $('#retry-wallpaper').disabled = busy;
  $('#use-cloud-wallpaper').disabled = busy;
}
async function displayWallpaper(image, cacheKey = 'daily', options = {}) {
  if (!validWallpaper(image)) return false;
  const sequence = ++wallpaperSequence;
  pendingWallpaper = { image, cacheKey, pinOnSuccess: !!options.pinOnSuccess };
  let blob, usedCloud = !!options.cloudOnly;
  try {
    const cached = options.cloudOnly ? null : await storedImage(cacheKey);
    if (cached?.id === image.id && cached.blob instanceof Blob) blob = cached.blob;
    if (!blob) {
      blob = await fetchWallpaperBlob(image, {
        cloudOnly: !!options.cloudOnly, allowCloudFallback: settings.cloudImageFallback,
        onFallback: () => {
          usedCloud = true;
          if (sequence === wallpaperSequence) showWallpaperNotice('暂时无法直连 Bing，正在通过云端中转加载背景。', { busy: true });
        },
      });
    }
    if (sequence !== wallpaperSequence) return false;
    const objectUrl = URL.createObjectURL(blob);
    const preview = new Image(); preview.src = objectUrl;
    try { await preview.decode(); } catch (error) { URL.revokeObjectURL(objectUrl); throw error; }
    if (sequence !== wallpaperSequence) { URL.revokeObjectURL(objectUrl); return false; }
    $('#wallpaper').style.backgroundImage = `url("${objectUrl}")`;
    if (wallpaperObjectUrl) URL.revokeObjectURL(wallpaperObjectUrl);
    wallpaperObjectUrl = objectUrl; currentWallpaper = image; wallpaperState = 'loaded'; updateDefaultBackground(); updateWallpaperMetadata();
    if (options.pinOnSuccess) {
      settings.wallpaperMode = 'fixed'; settings.pinnedWallpaper = image; saveSettings(); updateWallpaperMetadata();
    }
    pendingWallpaper = null;
    if (usedCloud) showWallpaperNotice('已通过云端中转加载背景。', { canRetry: false });
    else $('#wallpaper-status').hidden = true;
    if ($('#settings-dialog').open && activeTab === 'wallpaper') renderWallpaperGrid();
    await storedImage(cacheKey, { id: image.id, blob });
    return true;
  } catch {
    if (sequence === wallpaperSequence) {
      wallpaperState = 'unavailable'; updateWallpaperMetadata();
      const message = usedCloud ? '云端中转暂时无法获取这张图片，已保留本地背景。请稍后重试。' : '暂时无法连接 Bing 图片，可能是当前网络或图片服务异常。已保留本地背景，可重试或通过云端中转加载。';
      $('#wallpaper-note').textContent = message;
      showWallpaperNotice(message);
    }
    return false;
  }
}
async function retryRequestedWallpaper(cloudOnly = false) {
  if (!pendingWallpaper) return;
  const request = pendingWallpaper;
  showWallpaperNotice(cloudOnly ? '正在通过云端中转加载背景…' : '正在重新连接 Bing 图片…', { busy: true });
  await displayWallpaper(request.image, request.cacheKey, { pinOnSuccess: request.pinOnSuccess, cloudOnly });
}
$('#retry-wallpaper').addEventListener('click', () => retryRequestedWallpaper());
$('#use-cloud-wallpaper').addEventListener('click', () => retryRequestedWallpaper(true));
$('#dismiss-wallpaper-status').addEventListener('click', () => { $('#wallpaper-status').hidden = true; });
async function loadWallpapers(force = false) {
  if (wallpaperRequest) return wallpaperRequest;
  wallpaperRequest = (async () => {
    const cached = getCache('wallpapers');
    const cachedImages = Array.isArray(cached?.images) ? cached.images.filter(validWallpaper) : [];
    if (cachedImages.length) wallpapers = cachedImages;
    const fresh = cachedImages.length && cached.date === localDateKey() && Date.now() - cached.fetchedAt < 3600000;
    let failed = false;
    if (force || !fresh) {
      try {
        const images = normalizeBingImages(await fetchJson('/api/bing'));
        if (!images.length) throw new Error('No images');
        wallpapers = images; setCache('wallpapers', { date: localDateKey(), fetchedAt: Date.now(), images });
      } catch { failed = true; }
    }
    if (settings.wallpaperMode === 'daily' && (wallpapers[0].id !== currentWallpaper.id || !wallpaperObjectUrl)) await displayWallpaper(wallpapers[0]);
    if ($('#settings-dialog').open && activeTab === 'wallpaper') renderWallpaperGrid();
    if (failed) {
      $('#wallpaper-note').textContent = '壁纸列表暂时无法更新，已保留上次的风景。可稍后刷新。';
      if (wallpaperState !== 'unavailable') showWallpaperNotice('壁纸列表暂时无法更新，已保留上次的背景，可稍后在设置中刷新。', { canRetry: false });
    } else if (wallpaperState !== 'unavailable') $('#wallpaper-note').textContent = '选择一张壁纸，即可把喜欢的风景留下。';
    return !failed;
  })().finally(() => { wallpaperRequest = null; });
  return wallpaperRequest;
}
async function setPinned(pinned) {
  if (pinned && !wallpaperObjectUrl) { toast('请先加载一张壁纸'); updateWallpaperMetadata(); return; }
  if (pinned) {
    settings.wallpaperMode = 'fixed'; settings.pinnedWallpaper = currentWallpaper;
    const recent = await storedImage('daily');
    if (recent?.id === currentWallpaper.id) await storedImage('pinned', recent);
    else await displayWallpaper(currentWallpaper, 'pinned');
    toast('已留住这张风景，明天也能再见');
  } else {
    settings.wallpaperMode = 'daily'; settings.pinnedWallpaper = null;
    await storedImage('pinned', null); await loadWallpapers(); toast('已开启每日焕新');
  }
  saveSettings(); updateWallpaperMetadata();
  if ($('#settings-dialog').open && activeTab === 'wallpaper') renderWallpaperGrid();
}
$('#toggle-pin').addEventListener('click', async () => {
  $('#toggle-pin').disabled = true;
  try { await setPinned(settings.wallpaperMode !== 'fixed'); } finally { $('#toggle-pin').disabled = false; }
});
$('#daily-wallpaper').addEventListener('change', async event => {
  event.target.disabled = true;
  try { await setPinned(!event.target.checked); } finally { event.target.disabled = false; }
});
$('#refresh-wallpapers').addEventListener('click', async () => {
  const button = $('#refresh-wallpapers'); button.disabled = true;
  try { toast(await loadWallpapers(true) ? '风景已更新' : '暂时连接不上壁纸服务，已保留本地风景'); } finally { button.disabled = false; }
});
function renderWallpaperGrid() {
  const images = [...wallpapers];
  if (!images.some(image => image.id === currentWallpaper.id)) images.unshift(currentWallpaper);
  $('#wallpaper-grid').replaceChildren(...images.map(image => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'wallpaper-choice';
    const active = image.id === currentWallpaper.id;
    button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', `固定壁纸：${image.title}`);
    const picture = document.createElement('img'); picture.src = wallpaperImageUrl(image, '400x240'); picture.alt = image.title; picture.loading = 'lazy'; picture.referrerPolicy = 'no-referrer';
    let thumbnailRetried = false;
    picture.addEventListener('error', () => {
      if (settings.cloudImageFallback && !thumbnailRetried) { thumbnailRetried = true; picture.src = cloudWallpaperImageUrl(image, '400x240'); }
      else { picture.hidden = true; $('#wallpaper-note').textContent = '部分缩略图暂时无法连接 Bing，可重试或开启云端中转加载。'; }
    });
    const label = document.createElement('span'); label.textContent = image.title;
    button.append(picture, label);
    if (active) { const check = svg('check'); check.classList.add('choice-check'); button.append(check); }
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        if (await displayWallpaper(image, 'pinned', { pinOnSuccess: true })) {
          toast('已设为固定壁纸');
        } else toast('这张壁纸暂时无法加载，请稍后再试');
      } finally { button.disabled = false; }
    });
    return button;
  }));
}
$('#dim-range').addEventListener('input', event => {
  settings.dim = Number(event.target.value); document.documentElement.style.setProperty('--dim', settings.dim / 100);
  $('#dim-value').value = `${settings.dim}%`; saveSettings();
});

function weatherKey(city) { return `${city.latitude.toFixed(3)},${city.longitude.toFixed(3)}`; }
function renderWeather(data, stale = false) {
  const condition = weatherCondition(data.current.weather_code, !!data.current.is_day);
  $('#weather-icon use').setAttribute('href', `#i-${condition.icon}`);
  $('#weather-text').textContent = `${Math.round(data.current.temperature_2m)}°  ${settings.city.name} · ${condition.label}${stale ? '（缓存）' : ''}`;
  const low = data.daily?.temperature_2m_min?.[0], high = data.daily?.temperature_2m_max?.[0];
  $('#weather').title = `${settings.city.name}${Number.isFinite(low) && Number.isFinite(high) ? ` ${Math.round(low)}° / ${Math.round(high)}°` : ''}${stale ? ' · 上次获取的天气' : ''} · 点击更换城市`;
}
function validWeather(data) { return Number.isFinite(data?.current?.temperature_2m) && Number.isFinite(data?.current?.weather_code); }
async function loadWeather(force = false) {
  if (!settings.showWeather || document.hidden) return;
  const city = settings.city, key = weatherKey(city);
  if (weatherRequestKey === key) return;
  const cached = getCache('weather');
  const sameCity = cached?.key === key && validWeather(cached.data);
  const age = sameCity ? Date.now() - cached.fetchedAt : Infinity;
  if (sameCity) renderWeather(cached.data, age >= 1800000 || !!cached.data._baiyeStale || !!cached.data._qiyeStale);
  if (!force && age < 1800000) return;
  if (!force && Date.now() - lastWeatherAttempt < 60000 && weatherRequestKey === '') return;
  weatherController?.abort(); const controller = new AbortController(); weatherController = controller;
  weatherRequestKey = key; lastWeatherAttempt = Date.now();
  if (!sameCity) { $('#weather-text').textContent = `${city.name} · 获取天气中`; $('#weather').title = '点击更换城市'; }
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const data = await fetchJson(`/api/weather?latitude=${city.latitude}&longitude=${city.longitude}`, controller.signal);
    if (!validWeather(data)) throw new Error('Invalid weather');
    if (key !== weatherKey(settings.city) || !settings.showWeather || controller.signal.aborted) return;
    setCache('weather', { key, fetchedAt: data._baiyeStale ? 0 : Date.now(), data }); renderWeather(data, !!data._baiyeStale);
  } catch {
    if (weatherController !== controller || key !== weatherKey(settings.city)) return;
    if (sameCity) renderWeather(cached.data, true);
    else { $('#weather-text').textContent = `${city.name} · 天气暂不可用`; $('#weather').title = '天气服务暂时不可用 · 点击更换城市'; }
  } finally { clearTimeout(timeout); if (weatherController === controller) weatherRequestKey = ''; }
}
async function selectCity(city) {
  if (!validCity(city)) return;
  settings.city = city; saveSettings(); updateDefaultBackground(); $('#city-input').value = ''; $('#city-results').replaceChildren();
  $('#city-note').textContent = `当前城市：${city.name} · 天气每 30 分钟更新`;
  await loadWeather(true); toast(`天气城市已设为${city.name}`);
}
const commonCities = [
  ['北京', 39.9042, 116.4074], ['上海', 31.2304, 121.4737], ['广州', 23.1291, 113.2644], ['深圳', 22.5431, 114.0579],
  ['杭州', 30.2741, 120.1551], ['成都', 30.5728, 104.0668], ['南京', 32.0603, 118.7969], ['武汉', 30.5928, 114.3055],
  ['西安', 34.3416, 108.9398], ['重庆', 29.5630, 106.5516], ['天津', 39.0842, 117.2009], ['苏州', 31.2989, 120.5853],
].map(([name, latitude, longitude]) => ({ name, latitude, longitude, admin1: '中国' }));
function renderCities(cities) {
  $('#city-results').replaceChildren(...cities.map(city => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = city.name;
    const detail = document.createElement('small'); detail.textContent = [city.admin1, city.country].filter(Boolean).join(' · ');
    button.append(detail); button.addEventListener('click', () => { cityController?.abort(); clearTimeout(cityTimer); selectCity({ name: city.name, latitude: city.latitude, longitude: city.longitude }); });
    return button;
  }));
}
$('#city-input').addEventListener('input', () => {
  clearTimeout(cityTimer); cityController?.abort();
  const query = $('#city-input').value.trim();
  if (query.length < 2) { $('#city-results').replaceChildren(); return; }
  const localCities = commonCities.filter(city => city.name.includes(query.replace(/市$/, '')));
  renderCities(localCities);
  cityTimer = setTimeout(async () => {
    const controller = new AbortController(); cityController = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const data = await fetchJson(`/api/geocode?name=${encodeURIComponent(query)}`, controller.signal);
      if (query !== $('#city-input').value.trim() || controller.signal.aborted) return;
      const cities = (data.results || []).filter(validCity);
      renderCities(cities.length ? cities : localCities);
      if (!cities.length && !localCities.length) $('#city-results').textContent = '没有找到城市，可尝试拼音或英文名。';
    } catch {
      if (cityController !== controller || query !== $('#city-input').value.trim()) return;
      if (!localCities.length) $('#city-results').textContent = '城市服务暂不可用，可搜索常见国内城市或使用定位。';
    } finally { clearTimeout(timeout); }
  }, 450);
});
$('#locate-city').addEventListener('click', () => {
  if (!navigator.geolocation) { toast('浏览器不支持定位，请输入城市名'); return; }
  const button = $('#locate-city'); button.disabled = true;
  navigator.geolocation.getCurrentPosition(async position => {
    try {
      await selectCity({ name: '当前位置', latitude: Number(position.coords.latitude.toFixed(3)), longitude: Number(position.coords.longitude.toFixed(3)) });
    } finally { button.disabled = false; }
  }, () => { button.disabled = false; toast('定位未成功，请输入城市名；浏览器定位需要 HTTPS 或本机访问'); }, { timeout: 10000, maximumAge: 3600000 });
});

function svg(name) {
  const result = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); result.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `#i-${name}`); result.append(use); return result;
}
function shortcutIcon(shortcut) {
  const span = document.createElement('span'); span.className = 'shortcut-icon';
  span.textContent = ['github', 'bilibili'].includes(shortcut.icon) ? shortcut.name.slice(0, 1) : shortcut.icon || shortcut.name.slice(0, 1);
  return span;
}
function renderShortcuts() {
  const links = settings.shortcuts.map(shortcut => {
    const link = document.createElement('a'); link.className = 'shortcut'; link.href = shortcut.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    const name = document.createElement('span'); name.className = 'shortcut-name'; name.textContent = shortcut.name;
    link.append(shortcutIcon(shortcut), name); return link;
  });
  if (settings.shortcuts.length > 0 && settings.shortcuts.length < 8) {
    const add = document.createElement('button'); add.type = 'button'; add.className = 'shortcut shortcut-add'; add.title = '添加常用网站';
    const icon = document.createElement('span'); icon.className = 'shortcut-icon'; icon.append(svg('plus'));
    const label = document.createElement('span'); label.textContent = '添加'; add.append(icon, label); add.addEventListener('click', () => openSettings('shortcuts')); links.push(add);
  }
  $('#shortcuts').replaceChildren(...links);
  $('#shortcuts').hidden = !settings.showShortcuts || settings.shortcuts.length === 0;
  renderShortcutList();
}
function renderShortcutList() {
  $('#shortcut-list').replaceChildren(...settings.shortcuts.map((shortcut, index) => {
    const row = document.createElement('div'); row.className = 'shortcut-list-row';
    const icon = document.createElement('span'); icon.className = 'list-icon'; icon.textContent = shortcut.name.slice(0, 1);
    const description = document.createElement('div'); description.textContent = shortcut.name;
    const url = document.createElement('small'); url.textContent = shortcut.url; description.append(url);
    const remove = document.createElement('button'); remove.type = 'button'; remove.setAttribute('aria-label', `删除${shortcut.name}`); remove.append(svg('trash'));
    remove.addEventListener('click', () => { settings.shortcuts.splice(index, 1); saveSettings(); renderShortcuts(); });
    row.append(icon, description, remove); return row;
  }));
  $('#shortcut-form').hidden = settings.shortcuts.length >= 8;
  $('#shortcuts-empty').hidden = settings.shortcuts.length > 0;
}
$('#shortcut-form').addEventListener('submit', event => {
  event.preventDefault(); const name = $('#shortcut-name').value.trim(), url = safeUrl($('#shortcut-url').value);
  if (!name || !url) { toast('请输入网站名称和有效的 http 或 https 地址'); return; }
  if (settings.shortcuts.length >= 8) { toast('最多添加 8 个网站'); return; }
  settings.shortcuts.push({ name: name.slice(0, 12), url, icon: name.slice(0, 1) }); saveSettings(); renderShortcuts(); $('#shortcut-form').reset(); toast('常用网站已添加');
});

function switchTab(tab) {
  closeEngineDelete();
  activeTab = tab;
  document.querySelectorAll('[data-tab]').forEach(button => { const selected = button.dataset.tab === tab; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; });
  document.querySelectorAll('[role=tabpanel]').forEach(panel => { panel.hidden = panel.id !== `panel-${tab}`; });
  if (tab === 'wallpaper') { renderWallpaperGrid(); loadWallpapers(); }
  $('.settings-body').scrollTop = 0;
}
function openSettings(tab = 'appearance') { switchTab(tab); if (!$('#settings-dialog').open) $('#settings-dialog').showModal(); revealSettingsButton(); }
$('#open-settings').addEventListener('click', () => openSettings());
$('#open-wallpapers').addEventListener('click', () => openSettings('wallpaper'));
$('#weather').addEventListener('click', () => { openSettings(); $('#city-input').focus(); });
$('#close-settings').addEventListener('click', () => $('#settings-dialog').close());
let settingsIdleTimer;
function revealSettingsButton() {
  clearTimeout(settingsIdleTimer);
  $('#open-settings').classList.remove('is-idle');
  if (document.hidden || document.querySelector('dialog[open]') || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  settingsIdleTimer = setTimeout(() => {
    if (!document.querySelector('dialog[open]') && !$('#open-settings').matches(':focus-visible')) $('#open-settings').classList.add('is-idle');
  }, 10000);
}
for (const event of ['pointermove', 'pointerdown', 'keydown', 'wheel']) document.addEventListener(event, revealSettingsButton, { passive: true });
$('#open-settings').addEventListener('focus', revealSettingsButton);
$('#open-settings').addEventListener('blur', revealSettingsButton);
window.addEventListener('focus', revealSettingsButton);
document.addEventListener('visibilitychange', revealSettingsButton);
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('close', revealSettingsButton));
document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab)));
$('.settings-tabs').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault(); const tabs = [...document.querySelectorAll('[data-tab]')].map(button => button.dataset.tab); let index = tabs.indexOf(activeTab);
  index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
  switchTab(tabs[index]); $(`#tab-${tabs[index]}`).focus();
});
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
}));
document.querySelectorAll('[data-setting]').forEach(input => input.addEventListener('change', () => {
  const key = input.dataset.setting; settings[key] = input.checked;
  if (key === 'showWeather' && !settings.showWeather) { weatherController?.abort(); weatherRequestKey = ''; }
  saveSettings(); applySettings(); if (key === 'showWeather' && settings.showWeather) loadWeather(true);
  if (key === 'cloudImageFallback' && activeTab === 'wallpaper') renderWallpaperGrid();
  if (key === 'cloudImageFallback' && settings.cloudImageFallback && pendingWallpaper) retryRequestedWallpaper();
}));
$('#custom-greeting').addEventListener('input', event => {
  settings.customGreeting = event.target.value.slice(0, 80); saveSettings(); updateClock();
});
$('#wallpaper-info').addEventListener('click', () => {
  $('#info-title').textContent = currentWallpaper.title; $('#info-description').textContent = currentWallpaper.copyright;
  const date = currentWallpaper.date; $('#info-date').textContent = `${date.slice(0, 4)} 年 ${Number(date.slice(4, 6))} 月 ${Number(date.slice(6, 8))} 日 · Bing 每日壁纸`;
  const link = safeUrl(currentWallpaper.link); $('#info-link').href = link && new URL(link).hostname === 'www.bing.com' ? link : 'https://www.bing.com/'; $('#info-dialog').showModal();
});
$('#close-info').addEventListener('click', () => $('#info-dialog').close());
$('#reset-settings').addEventListener('click', () => $('#confirm-dialog').showModal());
$('#cancel-reset').addEventListener('click', () => $('#confirm-dialog').close());
$('#confirm-reset').addEventListener('click', async () => {
  weatherController?.abort(); cityController?.abort(); clearTimeout(cityTimer); weatherRequestKey = ''; lastWeatherAttempt = 0;
  settings = normalizeSettings(DEFAULTS); saveSettings(); applySettings(); $('#confirm-dialog').close();
  pendingWallpaper = null; $('#wallpaper-status').hidden = true;
  $('#city-input').value = ''; $('#city-results').replaceChildren();
  await storedImage('pinned', null); await loadWallpapers(); loadWeather(true); toast('已恢复默认设置');
});
$('#fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { toast('当前浏览器暂不支持全屏'); }
});
document.addEventListener('fullscreenchange', () => { $('#fullscreen').setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '进入全屏'); });
function scheduleMidnight() {
  clearTimeout(midnightTimer); const next = new Date(); next.setHours(24, 0, 2, 0);
  midnightTimer = setTimeout(() => { updateClock(); if (settings.wallpaperMode === 'daily') loadWallpapers(true); scheduleMidnight(); }, next - Date.now());
}
document.addEventListener('visibilitychange', () => {
  updateClock(); updateDefaultBackground(); if (!document.hidden) { if (settings.wallpaperMode === 'daily') loadWallpapers(); loadWeather(); scheduleMidnight(); }
});
window.addEventListener('online', () => { if (pendingWallpaper) retryRequestedWallpaper(); else loadWallpapers(true); loadWeather(true); });
window.addEventListener('storage', event => {
  if (event.key === SEARCH_HISTORY_KEY || event.key === null) { searchHistory = readSearchHistory(localStorage); renderSearchHistory(); }
  if (event.key !== SETTINGS_KEY && event.key !== null) return;
  settings = readSettings(localStorage); applySettings(); loadWeather(true);
  if (settings.wallpaperMode === 'fixed') displayWallpaper(settings.pinnedWallpaper, 'pinned'); else loadWallpapers();
});
$('#about-version').textContent = APP_VERSION;
applySettings(); renderSearchHistory(); scheduleMidnight(); revealSettingsButton();
const cachedWallpapers = getCache('wallpapers');
if (settings.wallpaperMode === 'fixed') displayWallpaper(settings.pinnedWallpaper, 'pinned');
else if (Array.isArray(cachedWallpapers?.images) && validWallpaper(cachedWallpapers.images[0])) displayWallpaper(cachedWallpapers.images[0]);
const idle = window.requestIdleCallback || (callback => setTimeout(callback, 200));
idle(() => { loadWallpapers(); loadWeather(); }, { timeout: 1200 });
setInterval(() => { if (!document.hidden) loadWeather(); }, 1800000);
