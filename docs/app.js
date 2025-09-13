(() => {
  const $ = (id) => document.getElementById(id);

  // APIキーの取得優先度:
  // 1) URLパラメータ `?gmaps_key=...`（あれば LocalStorage に保存）
  // 2) LocalStorage `GMAPS_API_KEY`
  // 3) web/config.js の window.CONFIG.GOOGLE_MAPS_API_KEY
  const params = new URLSearchParams(window.location.search);
  const keyFromUrl = (params.get("gmaps_key") || "").trim();
  if (keyFromUrl) {
    try { localStorage.setItem("GMAPS_API_KEY", keyFromUrl); } catch (_) {}
  }
  let API_KEY = keyFromUrl;
  if (!API_KEY) {
    try { API_KEY = (localStorage.getItem("GMAPS_API_KEY") || "").trim(); } catch (_) { API_KEY = ""; }
  }
  if (!API_KEY) {
    API_KEY = ((window.CONFIG && window.CONFIG.GOOGLE_MAPS_API_KEY) || "").trim();
  }
  const message = $("message");
  const nameEl = $("info-name");
  const addrEl = $("info-address");
  const phoneEl = $("info-phone");
  const hoursEl = $("info-hours");
  const openNowEl = $("info-open-now");
  const brandEl = $("info-brand");
  const operatorEl = $("info-operator");
  const holidayEl = $("info-holiday");
  const ratingEl = $("info-rating");
  const websiteEl = $("info-website");
  const gmapsEl = $("info-gmaps");
  const mapFrame = $("map-frame");
  const svFrame = $("sv-frame");
  const candidatesWrap = $("candidates-wrap");
  const candidatesEl = $("candidates");
  const moreNamesTopEl = $("more-names-top");
  // 詳細検索は削除
  const compareWrap = $("compare-wrap");
  const compareEl = $("compare");
  const compareList = [];
  const formEl = $("search-form");
  const searchBtn = $("search-btn");
  const cancelBtn = $("cancel-btn");
  // APIキー設定UI
  const keySetup = document.getElementById('key-setup');
  const apiKeyInput = document.getElementById('api-key-input');
  const apiKeySave = document.getElementById('api-key-save');
  const apiKeyClear = document.getElementById('api-key-clear');
  const openKeySetupBtn = document.getElementById('open-key-setup');
  // エリア入力・現在地ボタンは削除
  const areaEl = null;
  const geoBtn = null;
  let isLoading = false;
  let currentOp = null; // 現在の検索操作（キャンセル用）
  let userLocation = null; // {lat, lng}

  const hasKey = () => API_KEY && API_KEY.trim().length > 0;

  const setMessage = (text, type = "info") => {
    message.textContent = text;
    message.className = `message ${type}${isLoading ? " loading" : ""}`;
  };

  function showKeySetup(visible) {
    if (!keySetup) return;
    keySetup.classList.toggle('hidden', !visible);
    if (visible && apiKeyInput) apiKeyInput.value = (API_KEY || '').trim();
  }

  // 初期：キー未設定ならUIを出して検索を無効化
  if (!hasKey()) {
    showKeySetup(true);
    if (searchBtn) searchBtn.disabled = true;
    setMessage('APIキーが設定されていません。上の「APIキー設定」から保存してください。', 'warn');
  }

  if (openKeySetupBtn) {
    openKeySetupBtn.onclick = () => {
      showKeySetup(true);
    };
  }

  if (apiKeySave) {
    apiKeySave.onclick = () => {
      const v = (apiKeyInput?.value || '').trim();
      if (!v) { setMessage('キーが空です。入力してください。', 'warn'); return; }
      try { localStorage.setItem('GMAPS_API_KEY', v); } catch (_) {}
      setMessage('APIキーを保存しました。ページを再読み込みします…', 'success');
      setTimeout(() => { location.reload(); }, 400);
    };
  }

  if (apiKeyClear) {
    apiKeyClear.onclick = () => {
      try { localStorage.removeItem('GMAPS_API_KEY'); } catch (_) {}
      setMessage('APIキーを削除しました。ページを再読み込みします…', 'success');
      setTimeout(() => { location.reload(); }, 400);
    };
  }

  function createOp() {
    const listeners = [];
    return {
      aborted: false,
      onCancel(fn) { listeners.push(fn); },
      cancel() {
        if (this.aborted) return;
        this.aborted = true;
        listeners.forEach((fn) => { try { fn(); } catch (_) {} });
      }
    };
  }

  const beginLoading = (text = "検索中…") => {
    isLoading = true;
    setMessage(text, "info");
    formEl && formEl.classList.add("is-loading");
    if (searchBtn) searchBtn.disabled = true;
    if (cancelBtn) {
      cancelBtn.classList.remove("hidden");
      cancelBtn.disabled = false;
    }
    currentOp = createOp();
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        currentOp && currentOp.cancel();
        setMessage("操作をキャンセルしました。", "warn");
        endLoading();
      };
    }
  };

  const endLoading = () => {
    isLoading = false;
    // 直後に setMessage が呼ばれる前提。見た目だけ先に通常状態へ戻す
    message.classList.remove("loading");
    formEl && formEl.classList.remove("is-loading");
    if (searchBtn) searchBtn.disabled = false;
    if (cancelBtn) {
      cancelBtn.disabled = true;
      cancelBtn.classList.add("hidden");
      cancelBtn.onclick = null;
    }
    currentOp = null;
  };

  const clearInfo = () => {
    nameEl.textContent = "-";
    addrEl.textContent = "-";
    phoneEl.textContent = "-";
    hoursEl.textContent = "-";
    brandEl.textContent = "-";
    operatorEl.textContent = "-";
    holidayEl.textContent = "-";
    mapFrame.removeAttribute("src");
    svFrame.removeAttribute("src");
  };

  const formatHours = (opening) => {
    if (!opening) return "不明";
    if (opening.weekday_text && opening.weekday_text.length) {
      return opening.weekday_text.join(" / ");
    }
    return "不明";
  };

  const inferHoliday = (opening) => {
    if (!opening || !opening.weekday_text || !opening.weekday_text.length) return "不明";
    const lines = opening.weekday_text;
    const closedDays = [];
    for (const line of lines) {
      const [day, rest] = line.split(":");
      const body = (rest || line).toLowerCase();
      if (/(定休日|closed)/i.test(line) || /(closed)/i.test(body)) {
        closedDays.push(day ? day.trim() : line.trim());
      }
    }
    if (closedDays.length > 0) return closedDays.join(" / ");
    return "なし（推定）";
  };

  const buildMapEmbedUrl = (placeId) =>
    `https://www.google.com/maps/embed/v1/place?key=${API_KEY}&q=place_id:${encodeURIComponent(placeId)}`;

  const buildStreetViewEmbedUrl = (lat, lng) =>
    `https://www.google.com/maps/embed/v1/streetview?key=${API_KEY}&location=${lat},${lng}&heading=0&pitch=0&fov=80`;

  // LatLng 抽出ヘルパー（Places の LatLng オブジェクト/リテラル両対応）
  function toNumberLatLng(latlngLike) {
    if (!latlngLike) return null;
    try {
      let lat, lng;
      if (typeof latlngLike.lat === 'function') {
        lat = latlngLike.lat();
        lng = latlngLike.lng();
      } else {
        lat = latlngLike.lat;
        lng = latlngLike.lng;
      }
      lat = Number(lat);
      lng = Number(lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    } catch (_) {}
    return null;
  }

  // ブランド推定（website を最優先、次に名称）
  function detectBrand(details) {
    const website = details.website || "";
    const name = details.name || "";
    const domain = (() => {
      try { return new URL(website).hostname.toLowerCase(); } catch (_) { return website.toLowerCase(); }
    })();
    const text = `${domain} ${name}`.toLowerCase();
    const rules = [
      { brand: 'ENEOS', patterns: [/eneos/] },
      { brand: '出光（apollostation）', patterns: [/apollostation/, /idss\./, /idemitsu/] },
      { brand: 'コスモ', patterns: [/cosmo/] },
      { brand: 'キグナス', patterns: [/kygnus/] },
      { brand: 'JA-SS', patterns: [/ja-ss/, /zennoh/, /\bja\b/] },
      { brand: 'Shell', patterns: [/shell/] },
      { brand: 'ESSO/Mobil', patterns: [/esso/, /mobil/] }
    ];
    for (const r of rules) {
      if (r.patterns.some((p) => p.test(text))) return r.brand;
    }
    // フォールバック：types から gas_station なら、名称の先頭語を仮ブランドに
    if ((details.types || []).includes('gas_station')) {
      const first = (name || '').split(' ')[0].trim();
      if (first) return first;
    }
    return '不明';
  }

  // カード高さをそろえる（コンテナ内の .card）
  function equalizeCardHeights(container) {
    if (!container) return;
    const cards = container.querySelectorAll('.card');
    let max = 0;
    cards.forEach((c) => { c.style.minHeight = ''; });
    cards.forEach((c) => { max = Math.max(max, c.offsetHeight || 0); });
    if (max > 0) cards.forEach((c) => { c.style.minHeight = `${max}px`; });
  }

  // 店舗名の括弧内から運営会社を推定（例: "...（烏丸）" → "烏丸（推定）"）
  function inferOperatorFromName(name) {
    if (!name || typeof name !== 'string') return '';
    const s = name.trim();
    let m = s.match(/（([^（）]+)）/); // 全角括弧優先
    if (!m) m = s.match(/\(([^()]+)\)/); // 半角括弧
    if (m && m[1]) {
      let op = m[1].trim();
      // 例外対応: （株）などの会社形態だけは除外
      // また、先頭に会社形態が付く場合は取り除く（例: （株）烏丸 → 烏丸）
      const corpPrefixes = /^(（株）|\(株\)|㈱|株|株式会社|（有）|\(有\)|㈲|有|有限会社)\s*/;
      op = op.replace(corpPrefixes, '').trim();
      // 除外: 中身が空、または会社形態だけの場合は推定しない
      if (!op || ['株','㈱','有','㈲'].includes(op)) return '';
      return `${op}（推定）`;
    }
    return '';
  }

  // 近傍のストリートビューを探して、pano 付きの埋め込みURLを返す
  // 段階: 屋外250m → 屋内含む500m → だめなら location 指定で Embed に委ねる
  const resolveStreetViewEmbed = async (lat, lng, op) => {
    try {
      await loadMapsJsIfNeeded(op);
    } catch (e) {
      return "";
    }
    const sv = new google.maps.StreetViewService();
    const loc = { lat: Number(lat), lng: Number(lng) };
    const tryOnce = (req) => new Promise((resolve) => {
      const onAbort = () => resolve(null);
      if (op) op.onCancel(onAbort);
      sv.getPanorama(req, (data, status) => {
        const OK = google.maps.StreetViewStatus.OK;
        if (status === OK && data && data.location) {
          resolve(data);
        } else {
          resolve(null);
        }
      });
    });
    // 1) 屋外優先 250m
    let data = await tryOnce({ location: loc, radius: 250, source: google.maps.StreetViewSource.OUTDOOR });
    // 2) ダメなら屋内も含めて 500m
    if (!data) data = await tryOnce({ location: loc, radius: 500 });
    if (!data || !data.location) {
      // 3) 最後の手段として location 指定の埋め込みで最近傍に委ねる
      return `https://www.google.com/maps/embed/v1/streetview?key=${API_KEY}&location=${loc.lat},${loc.lng}&pitch=0&fov=80`;
    }

    const pano = data.location.pano;
    let headingParam = "";
    try {
      if (google.maps.geometry && google.maps.geometry.spherical) {
        const from = data.location.latLng; // Street View の位置
        const to = new google.maps.LatLng(loc.lat, loc.lng); // 施設位置
        const h = google.maps.geometry.spherical.computeHeading(from, to); // -180..180
        const heading = Math.round(((h % 360) + 360) % 360); // 0..360
        headingParam = `&heading=${heading}`;
      }
    } catch (_) {}
    return `https://www.google.com/maps/embed/v1/streetview?key=${API_KEY}&pano=${encodeURIComponent(pano)}${headingParam}&pitch=0&fov=80`;
  };

  // Google Maps JavaScript API（Placesライブラリ）を動的ロード
  const loadMapsJsIfNeeded = (op) => {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.maps && window.google.maps.places) {
        resolve();
        return;
      }
      const existing = document.querySelector('script[data-mapsjs-loader]');
      let timeoutId;
      const onLoad = () => { clearTimeout(timeoutId); resolve(); };
      const onError = () => { clearTimeout(timeoutId); reject(new Error('Google Maps JavaScript API の読み込みに失敗しました。拡張機能やネットワーク設定を確認してください。')); };
      const onTimeout = () => { reject(new Error('Google Maps JavaScript API の読み込みがタイムアウトしました。ネットワークや拡張機能を確認してください。')); };
      const onAbort = () => { clearTimeout(timeoutId); reject(new Error('ユーザーがキャンセルしました')); };
      if (op) op.onCancel(onAbort);
      if (existing) {
        existing.addEventListener('load', onLoad);
        existing.addEventListener('error', onError);
        timeoutId = setTimeout(onTimeout, 15000);
        return;
      }
      const script = document.createElement('script');
      script.async = true;
      script.defer = true;
      script.dataset.mapsjsLoader = 'true';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(API_KEY)}&libraries=places,geometry&language=ja`;
      script.onload = onLoad;
      script.onerror = onError;
      timeoutId = setTimeout(onTimeout, 15000);
      document.head.appendChild(script);
    });
  };

  // エリア文字列をジオコードして座標取得
  async function geocodeArea(area, op) {
    if (!area) return null;
    await loadMapsJsIfNeeded(op);
    return new Promise((resolve) => {
      const geo = new google.maps.Geocoder();
      const req = { address: area, componentRestrictions: { country: 'JP' } };
      const onAbort = () => resolve(null);
      if (op) op.onCancel(onAbort);
      geo.geocode(req, (results, status) => {
        if (status === 'OK' && results && results.length) {
          const loc = results[0].geometry?.location;
          const n = toNumberLatLng(loc);
          resolve(n || null);
        } else {
          resolve(null);
        }
      });
    });
  }

  // テキストから「地域っぽい」トークンを抽出（例: 京都市、奈良県、天理市 など）
  function extractAreaFromQuery(text) {
    if (!text) return { area: '', name: text };
    const seps = /[\s\u3000]+/g; // 半角/全角スペース
    const parts = text.split(seps).filter(Boolean);
    if (parts.length <= 1) return { area: '', name: text };
    const areaSuffix = /(都|道|府|県|市|区|町|村)$/;
    const candidates = parts.filter(p => areaSuffix.test(p) || /京都|大阪|奈良|兵庫|滋賀|和歌山|東京|神奈川|愛知|福岡/.test(p));
    if (candidates.length) {
      const name = parts.filter(p => !candidates.includes(p)).join(' ');
      // 単一トークン（=全部エリアとして解釈される）なら、エリア扱いにしない
      if (!name.trim()) return { area: '', name: text };
      const area = candidates.join(' ');
      return { area, name };
    }
    return { area: '', name: text };
  }

  const normalizeApiError = (where, status, errorMessage) => {
    const base = `${where}エラー: ${status}`;
    const tipMap = {
      REQUEST_DENIED: "APIキーの権限やリファラ制限の可能性。Places API と Maps Embed API を有効化し、課金/HTTPリファラ(例: http://localhost/*) を確認してください。",
      OVER_QUERY_LIMIT: "クォータ上限を超えました。時間をおいて再試行してください。",
      INVALID_REQUEST: "パラメータ不足/不正の可能性。検索語や place_id を確認してください。",
      NOT_FOUND: "対象が見つかりませんでした。",
      ZERO_RESULTS: "結果がありませんでした。"
    };
    const tip = tipMap[status] || "詳細はブラウザのコンソールを確認してください。";
    return `${base}${errorMessage ? `（${errorMessage}）` : ""}。${tip}`;
  };

  const MAX_RESULTS = 20; // 表示・集計の上限（APIの一般的な1ページ上限）

  const findPlaces = async (text, op, bias) => {
    await loadMapsJsIfNeeded(op);
    const service = new google.maps.places.PlacesService(document.createElement('div'));
    const gasWords = ["ガソリン", "スタンド", "SS", "給油所", "gas station"];
    const brandWords = [
      "ENEOS","エネオス","出光","apollostation","コスモ","昭和シェル","キグナス",
      "ESSO","Mobil","エッソ","モービル","ジェネラル","JA"
    ];
    let q = text || "";
    const lower = q.toLowerCase();
    const hasGas = gasWords.some((w) => lower.includes(w.toLowerCase()));
    const hasBrand = brandWords.some((w) => lower.includes(w.toLowerCase()));
    if (!hasGas && !hasBrand) {
      q = `${q} ガソリンスタンド`;
    }
    // API には「SS」も補助語として付与（名称一致の精度を上げる）
    const request = { query: `${q} SS`, type: 'gas_station', region: 'JP', language: 'ja' };
    if (bias && Number.isFinite(bias.lat) && Number.isFinite(bias.lng)) {
      request.location = new google.maps.LatLng(bias.lat, bias.lng);
      request.radius = Math.max(1000, Math.min(80000, bias.radius || 30000));
    }
    return new Promise((resolve, reject) => {
      const collected = [];
      const seen = new Set();
      const qOrig = (text || '').replace(/\s+|　+/g, ' ').trim();
      const nameTokens = qOrig.split(/\s+/).filter(t => t && t !== 'ガソリンスタンド');
      const areaTokens = (bias && bias.areaText) ? bias.areaText.split(/\s+/) : [];
      const phrase = qOrig.toLowerCase();
      const brandTokens = [
        'eneos','エネオス','出光','apollostation','コスモ','昭和シェル','シェル','shell',
        'キグナス','esso','mobil','エッソ','モービル','ja','ja-ss','全農','zennoh'
      ];
      const queryHasBrand = brandTokens.some(t => phrase.includes(t));

      const score = (c) => {
        let s = 0;
        const nm = (c.name || '').toLowerCase();
        const addr = (c.formatted_address || '').toLowerCase();
        if (phrase && nm.includes(phrase)) s += 300;
        if (phrase && (nm.endsWith(phrase + 'ss') || nm.includes(phrase + ' ss'))) s += 600;
        if (phrase && nm.startsWith(phrase)) s += 120;
        const brandHit = brandTokens.find(t => nm.includes(t));
        if (brandHit) s += queryHasBrand ? 240 : 80;
        nameTokens.forEach(t => {
          const lt = t.toLowerCase();
          if (lt.length >= 2) {
            if (nm.includes(lt)) s += 20;
            if (nm.startsWith(lt)) s += 10;
          }
        });
        areaTokens.forEach(t => {
          const lt = t.toLowerCase();
          if (lt.length >= 2 && addr.includes(lt)) s += 5;
        });
        return -s;
      };

      let overallTimeout = setTimeout(() => reject(new Error('検索がタイムアウトしました。')), 20000);
      const onAbort = () => { clearTimeout(overallTimeout); reject(new Error('ユーザーがキャンセルしました')); };
      if (op) op.onCancel(onAbort);

      const handle = (results, status, pagination) => {
        const OK = google.maps.places.PlacesServiceStatus.OK;
        const ZERO = google.maps.places.PlacesServiceStatus.ZERO_RESULTS;
        if (status === OK || (results && results.length)) {
          (results || []).forEach(r => {
            if ((r.types || []).includes('gas_station')) {
              if (!seen.has(r.place_id)) { seen.add(r.place_id); collected.push(r); }
            }
          });
          if (pagination && pagination.hasNextPage) {
            // 少し待ってから次ページ
            setTimeout(() => pagination.nextPage(), 1200);
            return;
          }
          clearTimeout(overallTimeout);
          let list = nameTokens.length ? collected.slice().sort((a,b) => score(a) - score(b)) : collected;
          if (list.length > MAX_RESULTS) list = list.slice(0, MAX_RESULTS);
          resolve(list);
          return;
        }
        if (status === ZERO) {
          clearTimeout(overallTimeout);
          resolve([]);
          return;
        }
        clearTimeout(overallTimeout);
        reject(new Error(normalizeApiError('検索', status)));
      };

      try {
        service.textSearch(request, handle);
      } catch (e) {
        clearTimeout(overallTimeout);
        reject(e);
      }
    });
  };

  const getDetails = async (placeId, op) => {
    await loadMapsJsIfNeeded(op);
    const service = new google.maps.places.PlacesService(document.createElement('div'));
    const request = {
      placeId,
      fields: [
        'name',
        'formatted_address',
        'formatted_phone_number',
        'opening_hours',
        'geometry',
        'types',
        'business_status',
        'rating',
        'user_ratings_total',
        'website',
        'url'
      ],
      language: 'ja'
    };
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error('詳細取得がタイムアウトしました。')), 15000);
      const onAbort = () => { clearTimeout(timeoutId); reject(new Error('ユーザーがキャンセルしました')); };
      if (op) op.onCancel(onAbort);
      service.getDetails(request, (result, status) => {
        clearTimeout(timeoutId);
        const OK = google.maps.places.PlacesServiceStatus.OK;
        if (status === OK && result) return resolve(result);
        return reject(new Error(normalizeApiError('詳細取得', status)));
      });
    });
  };

  const hideSingle = () => {
    // 隠すのは result グリッドとその中身の iframes だけにする
    document.getElementById("result").classList.add("hidden");
  };

  const showSingle = () => {
    document.getElementById("result").classList.remove("hidden");
  };

  const hideCandidates = () => {
    candidatesWrap.classList.add("hidden");
    candidatesEl.innerHTML = "";
    if (moreNamesTopEl) { moreNamesTopEl.textContent = ""; moreNamesTopEl.classList.add("hidden"); }
  };

  const showCandidates = () => {
    candidatesWrap.classList.remove("hidden");
  };

  function renderCompareCard(placeId, details) {
    const card = document.createElement("div");
    card.className = "card";
    const brandGuess = detectBrand(details);
    const locNum = toNumberLatLng(details.geometry?.location);
    const lat = locNum?.lat;
    const lng = locNum?.lng;
    const mapSrc = buildMapEmbedUrl(placeId);
    const svIframe = document.createElement("iframe");
    svIframe.loading = "lazy";
    svIframe.referrerPolicy = "no-referrer-when-downgrade";
    svIframe.allowFullscreen = true;
    if (lat && lng) {
      resolveStreetViewEmbed(lat, lng, currentOp).then((url) => {
        if (url) {
          svIframe.src = url;
        } else {
          svIframe.replaceWith(Object.assign(document.createElement('div'), { className: 'helper', textContent: 'ストリートビューは未取得' }));
        }
      });
    } else {
      svIframe.replaceWith(Object.assign(document.createElement('div'), { className: 'helper', textContent: 'ストリートビューは未取得' }));
    }
    const ratingText = (typeof details.rating === 'number')
      ? `${details.rating.toFixed(1)}${(typeof details.user_ratings_total === 'number') ? `（${details.user_ratings_total}件）` : ''}`
      : '-';
    const websiteHtml = details.website ? `<a href="${details.website}" target="_blank" rel="noopener">${details.website}</a>` : '-';
    const gmapsHtml = details.url ? `<a href="${details.url}" target="_blank" rel="noopener">Googleマップで開く</a>` : '-';

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px">
        <h3 style="margin:0">${details.name || "名称不明"}</h3>
        <button class="btn btn-danger btn-sm" data-close="${placeId}">× 閉じる</button>
      </div>
      <dl class="info" style="margin:12px 0">
        <dt>住所</dt><dd>${details.formatted_address || "不明"}</dd>
        <dt>電話</dt><dd>${details.formatted_phone_number || "不明"}</dd>
        <dt>営業時間</dt><dd>${formatHours(details.opening_hours)}</dd>
        <dt>営業状況</dt><dd>${(details.opening_hours && typeof details.opening_hours.open_now==='boolean') ? (details.opening_hours.open_now ? '営業中' : '営業時間外') : '不明'}</dd>
        <dt>ブランド</dt><dd>${brandGuess}</dd>
        <dt>運営会社</dt><dd>${inferOperatorFromName(details.name) || '不明（将来対応）'}</dd>
        <dt>定休日</dt><dd>${inferHoliday(details.opening_hours)}</dd>
        <dt>評価</dt><dd>${ratingText}</dd>
        <dt>公式サイト</dt><dd>${websiteHtml}</dd>
        <dt>Google地図</dt><dd>${gmapsHtml}</dd>
      </dl>
      <div class="map-wrap" style="margin-bottom:10px">
        <iframe loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen src="${mapSrc}"></iframe>
      </div>
      <div class="map-wrap"></div>
    `;
    const mapWraps = card.querySelectorAll(".map-wrap");
    if (mapWraps[1]) {
      mapWraps[1].appendChild(svIframe);
    }
    const closeBtn = card.querySelector("[data-close]");
    closeBtn.addEventListener("click", () => removeFromCompare(placeId));
    return card;
  }

  function renderCompare() {
    if (compareList.length === 0) {
      compareWrap.classList.add("hidden");
      compareEl.innerHTML = "";
      return;
    }
    compareWrap.classList.remove("hidden");
    compareEl.innerHTML = "";
    compareList.forEach(({ placeId, details }) => {
      compareEl.appendChild(renderCompareCard(placeId, details));
    });
    // 高さそろえ
    equalizeCardHeights(compareEl);
  }

  function addToCompare(placeId, details) {
    if (compareList.find((x) => x.placeId === placeId)) {
      setMessage("すでに比較枠に追加されています。", "info");
      return;
    }
    if (compareList.length >= 3) {
      setMessage("比較枠は最大3件までです。1件閉じてから追加してください。", "warn");
      return;
    }
    compareList.push({ placeId, details });
    renderCompare();
    setMessage("比較枠に追加しました。", "success");
  }

  function removeFromCompare(placeId) {
    const idx = compareList.findIndex((x) => x.placeId === placeId);
    if (idx >= 0) {
      compareList.splice(idx, 1);
      renderCompare();
      setMessage("比較枠から削除しました。", "info");
    }
  }

  const renderCandidateCard = (candidate, details) => {
    const card = document.createElement("div");
    card.className = "card";
    const brandGuess = detectBrand(details);

    const locNum = toNumberLatLng(details.geometry?.location);
    const lat = locNum?.lat;
    const lng = locNum?.lng;

    const mapSrc = buildMapEmbedUrl(candidate.place_id);
    const svIframe = document.createElement("iframe");
    svIframe.loading = "lazy";
    svIframe.referrerPolicy = "no-referrer-when-downgrade";
    svIframe.allowFullscreen = true;
    if (lat && lng) {
      resolveStreetViewEmbed(lat, lng, currentOp).then((url) => {
        if (url) {
          svIframe.src = url;
        } else {
          svIframe.replaceWith(Object.assign(document.createElement('div'), { className: 'helper', textContent: 'ストリートビューは未取得' }));
        }
      });
    } else {
      svIframe.replaceWith(Object.assign(document.createElement('div'), { className: 'helper', textContent: 'ストリートビューは未取得' }));
    }

    const ratingText = (typeof details.rating === 'number')
      ? `${details.rating.toFixed(1)}${(typeof details.user_ratings_total === 'number') ? `（${details.user_ratings_total}件）` : ''}`
      : '-';
    const websiteHtml = details.website ? `<a href="${details.website}" target="_blank" rel="noopener">${details.website}</a>` : '-';
    const gmapsHtml = details.url ? `<a href="${details.url}" target="_blank" rel="noopener">Googleマップで開く</a>` : '-';

    card.innerHTML = `
      <h3 style="margin-top:0">${details.name || "名称不明"}</h3>
      <dl class="info" style="margin-bottom:12px">
        <dt>住所</dt><dd>${details.formatted_address || "不明"}</dd>
        <dt>電話</dt><dd>${details.formatted_phone_number || "不明"}</dd>
        <dt>営業時間</dt><dd>${formatHours(details.opening_hours)}</dd>
        <dt>営業状況</dt><dd>${(details.opening_hours && typeof details.opening_hours.open_now==='boolean') ? (details.opening_hours.open_now ? '営業中' : '営業時間外') : '不明'}</dd>
        <dt>ブランド</dt><dd>${brandGuess}</dd>
        <dt>運営会社</dt><dd>${inferOperatorFromName(details.name) || '不明（将来対応）'}</dd>
        <dt>定休日</dt><dd>${inferHoliday(details.opening_hours)}</dd>
        <dt>評価</dt><dd>${ratingText}</dd>
        <dt>公式サイト</dt><dd>${websiteHtml}</dd>
        <dt>Google地図</dt><dd>${gmapsHtml}</dd>
      </dl>
      <div class="map-wrap" style="margin-bottom:10px">
        <iframe loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen src="${mapSrc}"></iframe>
      </div>
      <div class="map-wrap"></div>
    `;
    const mapWraps = card.querySelectorAll(".map-wrap");
    if (mapWraps[1]) {
      mapWraps[1].appendChild(svIframe);
    }
    const actions = document.createElement("div");
    actions.className = "actions";
    const addBtn = document.createElement("button");
    addBtn.className = "btn btn-secondary btn-sm";
    addBtn.textContent = "比較に追加";
    addBtn.addEventListener("click", () => addToCompare(candidate.place_id, details));
    actions.appendChild(addBtn);
    card.appendChild(actions);
    return card;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    let q = $("query").value.trim();
    if (!q) return;
    // クエリから「地域」らしき語を抽出（ユーザーの area 入力が優先）
    let areaText = (areaEl && areaEl.value.trim()) || '';
    if (!areaText) {
      const parsed = extractAreaFromQuery(q);
      areaText = parsed.area;
      q = parsed.name;
    }
    if (!hasKey()) {
      setMessage("APIキーが設定されていません。web/config.js を作成してください。", "error");
      return;
    }
    beginLoading("検索中…");
    clearInfo();
    let slowTimer1, slowTimer2;
    try {
      slowTimer1 = setTimeout(() => {
        setMessage("検索中…（通信が遅いです。ネットワークやキー設定を確認してください）", "warn");
      }, 8000);
      // バイアス（エリア > 現在地）を計算
      let bias = null;
      if (areaText) {
        const loc = await geocodeArea(areaText, currentOp);
        if (loc) {
          // 都道府県なら広め、市区町村なら狭めに
          const wide = /(都|道|府|県)/.test(areaText);
          bias = { lat: loc.lat, lng: loc.lng, radius: wide ? 60000 : 25000, areaText };
        }
      }
      // 現在地バイアスはUI撤去のため使用しない
      const candidates = await findPlaces(q, currentOp, bias);
      clearTimeout(slowTimer1);
      if (!candidates || candidates.length === 0) {
        setMessage("見つかりませんでした。別のキーワードでお試しください。", "warn");
        endLoading();
        return;
      }
      if (candidates.length === 1) {
        // 単一候補：従来の単体表示を使う
        hideCandidates();
        const only = candidates[0];
        setMessage("1件ヒット。詳細取得中…", "info");
        slowTimer2 = setTimeout(() => {
          setMessage("詳細取得中…（通信が遅延しています）", "warn");
        }, 8000);
        const details = await getDetails(only.place_id, currentOp);
        clearTimeout(slowTimer2);

        // 基本情報の表示
        nameEl.textContent = details.name || "不明";
        addrEl.textContent = details.formatted_address || "不明";
        phoneEl.textContent = details.formatted_phone_number || "不明";
        hoursEl.textContent = formatHours(details.opening_hours);
        if (openNowEl) {
          const on = details.opening_hours && typeof details.opening_hours.open_now === 'boolean'
            ? (details.opening_hours.open_now ? '営業中' : '営業時間外')
            : '不明';
          openNowEl.textContent = on;
        }

        const brandGuess = detectBrand(details);
        brandEl.textContent = brandGuess || "不明";
        const opGuess = inferOperatorFromName(details.name);
        operatorEl.textContent = opGuess || "不明（将来対応）";
        holidayEl.textContent = inferHoliday(details.opening_hours);

        // 評価/サイト/地図
        if (ratingEl) {
          const r = details.rating;
          const n = details.user_ratings_total;
          ratingEl.textContent = (typeof r === 'number') ? `${r.toFixed(1)}${(typeof n === 'number') ? `（${n}件）` : ''}` : '-';
        }
        if (websiteEl) {
          websiteEl.innerHTML = details.website ? `<a href="${details.website}" target="_blank" rel="noopener">${details.website}</a>` : '-';
        }
        if (gmapsEl) {
          gmapsEl.innerHTML = details.url ? `<a href="${details.url}" target="_blank" rel="noopener">Googleマップで開く</a>` : '-';
        }

        mapFrame.src = buildMapEmbedUrl(only.place_id);
        const locNum = toNumberLatLng(details.geometry?.location);
        const lat = locNum?.lat;
        const lng = locNum?.lng;
        if (lat && lng) {
          const svUrl = await resolveStreetViewEmbed(lat, lng, currentOp);
          if (svUrl) {
            svFrame.src = svUrl;
          } else {
            svFrame.removeAttribute("src");
          }
        } else {
          svFrame.removeAttribute("src");
        }

        showSingle();
        setMessage("1件ヒット。詳細を表示しました。", "success");
        endLoading();
      } else {
        // 複数候補：最大5件のカードを並べて表示
        hideSingle();
        candidatesEl.innerHTML = "";
        setMessage(`${candidates.length}件ヒット。上位候補の詳細取得中…${candidates.length >= MAX_RESULTS ? `（最大${MAX_RESULTS}件まで表示。必要に応じてキーワードを詳しくしてください）` : ''}` , "info");
        slowTimer2 = setTimeout(() => {
          setMessage("詳細取得中…（通信が遅延しています）", "warn");
        }, 8000);
        const top = candidates.slice(0, 5);
        const detailsList = await Promise.all(
          top.map((c) => getDetails(c.place_id, currentOp).catch((e) => null))
        );
        clearTimeout(slowTimer2);
        top.forEach((c, i) => {
          const d = detailsList[i];
          if (!d) return; // 失敗したものはスキップ
          const card = renderCandidateCard(c, d);
          candidatesEl.appendChild(card);
        });
        // 残り候補（名前のみ）
        const rest = candidates.slice(5);
        if (moreNamesTopEl) {
          if (rest.length > 0) {
            const names = rest.map((x) => x.name).filter(Boolean);
            moreNamesTopEl.textContent = `残り ${rest.length} 件: ${names.join(' / ')}`;
            moreNamesTopEl.classList.remove("hidden");
          } else {
            moreNamesTopEl.textContent = "";
            moreNamesTopEl.classList.add("hidden");
          }
        }
        showCandidates();
        setMessage(`${candidates.length}件ヒット。上位候補を表示しました。${candidates.length >= MAX_RESULTS ? `（最大${MAX_RESULTS}件まで表示。必要に応じてキーワードを詳しくしてください）` : ''}` , "success");
        // 高さそろえ（描画後に複数回）
        equalizeCardHeights(candidatesEl);
        setTimeout(() => equalizeCardHeights(candidatesEl), 400);
        setTimeout(() => equalizeCardHeights(candidatesEl), 1200);
        endLoading();
      }
    } catch (err) {
      console.error(err);
      setMessage(err && err.message ? err.message : "エラーが発生しました。時間をあけて再度お試しください。", "error");
      endLoading();
    }
  };

  document.getElementById("search-form").addEventListener("submit", onSubmit);

  // 詳細検索の開閉
  // 詳細検索トグルは削除済み

  // 現在地取得ボタン
  if (geoBtn) {
    geoBtn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        setMessage('このブラウザは位置情報に対応していません。', 'warn');
        return;
      }
      setMessage('現在地を取得中…', 'info');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setMessage('現在地を利用します。キーワードを入力して検索してください。', 'success');
        },
        (err) => {
          console.error(err);
          setMessage('現在地の取得に失敗しました。許可設定をご確認ください。', 'error');
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    });
  }

  // 初期メッセージ
  if (!hasKey()) {
    setMessage("まず web/config.js を作成し、APIキーを設定してください。", "warn");
  } else {
    setMessage("検索したいガソリンスタンド名を入力してください。", "info");
  }

  // リサイズ時も高さをそろえる
  window.addEventListener('resize', () => {
    equalizeCardHeights(candidatesEl);
    equalizeCardHeights(compareEl);
  });
})();
