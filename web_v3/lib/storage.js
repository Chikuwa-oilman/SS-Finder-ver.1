const KEY_API     = 'GMAPS_API_KEY';
const KEY_HISTORY = 'SS_HISTORY';
const KEY_FAVS    = 'SS_FAVORITES';
const MAX_HISTORY = 10;

// ── API Key ──────────────────────────────────────────────
export function getApiKey() {
  const urlKey = new URLSearchParams(location.search).get('gmaps_key');
  if (urlKey) { setApiKey(urlKey); return urlKey; }
  const lsKey = localStorage.getItem(KEY_API);
  if (lsKey) return lsKey;
  return window.CONFIG?.GOOGLE_MAPS_API_KEY ?? null;
}
export function setApiKey(key) { localStorage.setItem(KEY_API, key); }
export function clearApiKey()  { localStorage.removeItem(KEY_API); }

// ── Search History ───────────────────────────────────────
export function getHistory() {
  try { return JSON.parse(localStorage.getItem(KEY_HISTORY) ?? '[]'); }
  catch { return []; }
}
export function addHistory({ query, placeId }) {
  const hist = getHistory().filter(h => h.query !== query);
  hist.unshift({ query, placeId, timestamp: Date.now() });
  localStorage.setItem(KEY_HISTORY, JSON.stringify(hist.slice(0, MAX_HISTORY)));
}
export function clearHistory() { localStorage.removeItem(KEY_HISTORY); }

// ── Favorites ────────────────────────────────────────────
export function getFavorites() {
  try { return JSON.parse(localStorage.getItem(KEY_FAVS) ?? '[]'); }
  catch { return []; }
}
export function toggleFavorite({ placeId, name }) {
  const favs = getFavorites();
  const idx  = favs.findIndex(f => f.placeId === placeId);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.unshift({ placeId, name });
  localStorage.setItem(KEY_FAVS, JSON.stringify(favs));
  return idx < 0; // true = added
}
export function isFavorite(placeId) {
  return getFavorites().some(f => f.placeId === placeId);
}
