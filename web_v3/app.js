import {
  getApiKey, setApiKey, clearApiKey,
  getHistory, addHistory, clearHistory,
  getFavorites, toggleFavorite, isFavorite,
} from './lib/storage.js';
import {
  loadMapsAPI, textSearch, getDetails, geocodeForBias,
  getMapEmbedUrl, getStreetViewEmbedUrl, getStreetViewMeta,
} from './lib/api.js';
import {
  setStatus, clearStatus, showEl, hideEl,
  renderHistoryChips, renderResultsList, renderFavoriteChips,
  escHtml,
} from './lib/ui.js';

let apiKey = null;
const compareItems = []; // 最大3件

// ── 初期化 ───────────────────────────────────────────────
async function init() {
  apiKey = getApiKey();
  if (apiKey) {
    try {
      await loadMapsAPI(apiKey);
      document.getElementById('btn-search').disabled = false;
      setStatus('APIキーが設定されています。', 'info');
      setTimeout(clearStatus, 2000);
    } catch {
      setStatus('Maps APIの読み込みに失敗しました。APIキーを確認してください。', 'error');
      showEl('api-settings');
    }
  } else {
    showEl('api-settings');
    setStatus('APIキーを設定してください。', 'warn');
  }
  renderHistoryChips(getHistory(), runSearch, onClearHistory);
  renderFavoriteChips(getFavorites(), runSearch);
  bindEvents();
}

function onClearHistory() {
  clearHistory();
  renderHistoryChips([], runSearch, onClearHistory);
}

// ── イベントバインド ──────────────────────────────────────
function bindEvents() {
  document.getElementById('search-form').addEventListener('submit', e => {
    e.preventDefault();
    const q = document.getElementById('input-query').value.trim();
    if (q) runSearch(q);
  });

  document.getElementById('btn-api-toggle').addEventListener('click', () => {
    document.getElementById('api-settings').classList.toggle('hidden');
  });

  document.getElementById('btn-save-key').addEventListener('click', async () => {
    const key = document.getElementById('input-api-key').value.trim();
    if (!key) return;
    setApiKey(key);
    apiKey = key;
    hideEl('api-settings');
    setStatus('APIキーを保存しています...', 'info');
    try {
      await loadMapsAPI(key);
      document.getElementById('btn-search').disabled = false;
      setStatus('APIキーを保存しました。', 'info');
      setTimeout(clearStatus, 2000);
    } catch {
      setStatus('Maps APIの読み込みに失敗しました。キーを確認してください。', 'error');
    }
  });

  document.getElementById('btn-clear-key').addEventListener('click', () => {
    clearApiKey();
    document.getElementById('btn-search').disabled = true;
    document.getElementById('input-api-key').value = '';
    setStatus('APIキーをクリアしました。', 'info');
  });
}

// ── 検索実行 ─────────────────────────────────────────────
async function runSearch(query) {
  document.getElementById('input-query').value = query;
  clearStatus();
  hideEl('results-list');
  setStatus('検索中...', 'info');
  showEl('btn-cancel');
  document.getElementById('btn-search').disabled = true;

  let aborted = false;
  const cancelBtn = document.getElementById('btn-cancel');
  const onCancel = () => { aborted = true; resetSearchUI(); clearStatus(); };
  cancelBtn.addEventListener('click', onCancel, { once: true });

  try {
    // クエリをジオコードして地名座標を取得（例:「松任」→ 石川県の座標）
    // 失敗・タイムアウト時は location=null でバイアスなし検索にフォールバック
    const queryBias = await geocodeForBias(query).catch(() => null);
    const results   = await textSearch(query, queryBias);
    if (aborted) return;
    if (!results.length) {
      setStatus('スタンドが見つかりませんでした。', 'warn');
      return;
    }
    addHistory({ query, placeId: results[0].place_id });
    renderHistoryChips(getHistory(), runSearch, onClearHistory);

    if (results.length === 1) {
      setStatus('1件見つかりました。詳細を読み込んでいます...', 'success');
      await addToCompare(results[0].place_id, null);
    } else {
      setStatus(`${results.length}件見つかりました。`, 'success');
      renderResultsList(results, addToCompare);
    }
  } catch (err) {
    if (!aborted) setStatus(`エラー: ${err.message}`, 'error');
  } finally {
    resetSearchUI();
  }
}

function resetSearchUI() {
  hideEl('btn-cancel');
  if (apiKey) document.getElementById('btn-search').disabled = false;
}

// ── 比較に追加 ───────────────────────────────────────────
async function addToCompare(placeId, btn) {
  if (compareItems.length >= 3) {
    setStatus('比較は最大3件までです。', 'warn'); return;
  }
  if (compareItems.some(i => i.place_id === placeId)) {
    setStatus('すでに追加されています。', 'info'); return;
  }
  if (btn) { btn.disabled = true; btn.textContent = '読込中...'; }
  try {
    const details = await getDetails(placeId);
    const lat     = details.geometry.location.lat();
    const lng     = details.geometry.location.lng();
    const svMeta  = await getStreetViewMeta(lat, lng, apiKey);
    compareItems.push(details);
    renderCompareCard(details, svMeta);
    showEl('compare-section');
    if (btn) btn.textContent = '追加済み';
  } catch (err) {
    setStatus(`詳細取得に失敗しました: ${err.message}`, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '詳細を表示'; }
  }
}

// ── Street View ヘルパー ─────────────────────────────────
// カメラ位置から建物方向への方位角を計算（真北=0、時計回り）
function computeBearing(fromLat, fromLng, toLat, toLng) {
  const toRad = deg => deg * Math.PI / 180;
  const φ1 = toRad(fromLat), φ2 = toRad(toLat);
  const Δλ = toRad(toLng - fromLng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
// "2023-04" → "2023年4月撮影"
function formatSvDate(dateStr) {
  const [y, m] = dateStr.split('-');
  return m ? `${y}年${parseInt(m, 10)}月撮影` : `${y}年撮影`;
}

// ── 比較カードレンダリング ───────────────────────────────
function renderCompareCard(d, svMeta = null) {
  const grid = document.getElementById('compare-grid');
  const card = document.createElement('article');
  card.className = 'compare-card';
  card.dataset.placeId = d.place_id;

  const isFav    = isFavorite(d.place_id);
  const hours    = d.opening_hours?.weekday_text?.map(t => `<li>${escHtml(t)}</li>`).join('') ?? '<li>情報なし</li>';
  const status   = { OPERATIONAL: '営業中', CLOSED_TEMPORARILY: '一時休業', CLOSED_PERMANENTLY: '閉業' }[d.business_status] ?? '不明';
  const photo    = d.photos?.[0]?.getUrl({ maxWidth: 400, maxHeight: 240 });
  const lat      = d.geometry.location.lat();
  const lng      = d.geometry.location.lng();
  const name     = escHtml(d.name);
  const addr     = escHtml(d.formatted_address ?? d.vicinity ?? '—');
  const phone    = escHtml(d.formatted_phone_number ?? '—');

  // svMeta があればカメラ座標を location に使い、camera→SS の向きを heading に設定する
  // Embed API は pano パラメータが不安定なため location 指定で統一する
  const svHeading  = svMeta ? computeBearing(svMeta.svLat, svMeta.svLng, lat, lng) : 0;
  const svLat      = svMeta?.svLat ?? lat;
  const svLng      = svMeta?.svLng ?? lng;
  const svSrc      = getStreetViewEmbedUrl(svLat, svLng, apiKey, svHeading);
  const svDateText = svMeta?.date ? formatSvDate(svMeta.date) : null;

  card.innerHTML = `
    <header class="card-header">
      <h3 class="card-name">${name}</h3>
      <div class="card-actions">
        <button class="btn-fav${isFav ? ' active' : ''}" title="${isFav ? 'お気に入り解除' : 'お気に入り追加'}">★</button>
        <button class="btn-close" title="閉じる">✕</button>
      </div>
    </header>
    ${photo ? `<img class="card-photo" src="${escHtml(photo)}" alt="${name}の写真" loading="lazy">` : ''}
    <dl class="info-grid">
      <dt>住所</dt><dd>${addr}</dd>
      <dt>電話</dt><dd>${phone}</dd>
      <dt>状態</dt><dd class="status-badge">${status}</dd>
      <dt>営業時間</dt><dd><ul class="hours-list">${hours}</ul></dd>
      ${d.website ? `<dt>ウェブ</dt><dd><a href="${escHtml(d.website)}" target="_blank" rel="noopener noreferrer">公式サイト ↗</a></dd>` : ''}
      ${d.url ? `<dt>地図</dt><dd><a href="${escHtml(d.url)}" target="_blank" rel="noopener noreferrer">Googleマップで見る ↗</a></dd>` : ''}
    </dl>
    <div class="embeds">
      <iframe class="map-embed" src="${getMapEmbedUrl(d.place_id, apiKey)}"
        loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen
        title="${name}の地図"></iframe>
      <div class="sv-wrap">
        <iframe class="sv-embed" src="${svSrc}"
          loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen
          title="${name}のストリートビュー"></iframe>
        ${svDateText ? `<p class="sv-date">撮影: ${escHtml(svDateText)}</p>` : ''}
      </div>
    </div>
  `;

  card.querySelector('.btn-close').addEventListener('click', () => {
    const idx = compareItems.findIndex(i => i.place_id === d.place_id);
    if (idx >= 0) compareItems.splice(idx, 1);
    card.remove();
    if (!grid.children.length) hideEl('compare-section');
  });

  card.querySelector('.btn-fav').addEventListener('click', e => {
    const added = toggleFavorite({ placeId: d.place_id, name: d.name });
    e.currentTarget.classList.toggle('active', added);
    e.currentTarget.title = added ? 'お気に入り解除' : 'お気に入り追加';
    renderFavoriteChips(getFavorites(), runSearch);
  });

  grid.appendChild(card);
}

init();
