let mapsLoaded    = false;
let placesService = null;

// ── Maps API 動的ロード ──────────────────────────────────
export async function loadMapsAPI(apiKey) {
  if (mapsLoaded) return;
  await new Promise((resolve, reject) => {
    const cb = `__mapsReady_${Date.now()}`;
    window[cb] = () => { mapsLoaded = true; resolve(); delete window[cb]; };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?libraries=places&callback=${cb}&key=${apiKey}`;
    s.async = true;
    s.onerror = () => reject(new Error('Maps APIの読み込みに失敗しました'));
    document.head.appendChild(s);
  });
  // attribution div は DOM に挿入しておく（TOS 準拠・一部ブラウザの警告回避）
  const attrDiv = document.createElement('div');
  attrDiv.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';
  document.body.appendChild(attrDiv);
  placesService = new google.maps.places.PlacesService(attrDiv);
}

// ── クエリから地理バイアス座標を取得 ────────────────────────
// 「ENEOS 松任」→ 松任の座標、「十津川村」→ 十津川村の座標。
// 国レベルの曖昧な結果は除外し null を返す。
export function geocodeForBias(query) {
  return new Promise(resolve => {
    // 3秒応答がなければ null にフォールバック（API未有効化・ネット障害対策）
    const timer = setTimeout(() => resolve(null), 3000);
    try {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ address: query, region: 'JP' }, (results, status) => {
        clearTimeout(timer);
        if (status !== 'OK' || !results?.length) { resolve(null); return; }
        const r = results[0];
        if (r.types.includes('country')) { resolve(null); return; }
        const loc = r.geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng() });
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

// ── テキスト検索 ─────────────────────────────────────────
// location + radius でエリアを指定すると地理的に絞り込まれる。
// クエリ由来の座標（30km）> 現在地バイアス（50km）の優先順で呼ばれる。
export function textSearch(query, location = null, radius = 30000) {
  const q = `${query.trim()} ガソリンスタンド`;
  const req = { query: q, type: 'gas_station' };
  if (location) {
    req.location = new google.maps.LatLng(location.lat, location.lng);
    req.radius   = radius;
  }
  return new Promise((resolve, reject) => {
    placesService.textSearch(req, (results, status) => {
      const S = google.maps.places.PlacesServiceStatus;
      if (status === S.OK)               resolve(results);
      else if (status === S.ZERO_RESULTS) resolve([]);
      else reject(new Error(status));
    });
  });
}

// ── 場所詳細取得 ─────────────────────────────────────────
const DETAIL_FIELDS = [
  'place_id', 'name', 'formatted_address', 'formatted_phone_number',
  'opening_hours', 'business_status', 'price_level', 'rating',
  'user_ratings_total', 'photos', 'website', 'url', 'geometry',
  'types', 'vicinity',
];
export function getDetails(placeId) {
  return new Promise((resolve, reject) => {
    placesService.getDetails({ placeId, fields: DETAIL_FIELDS }, (result, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK) resolve(result);
      else reject(new Error(status));
    });
  });
}

// ── Street View メタデータ取得 ───────────────────────────
// 撮影日・パノラマID・カメラ位置を返す。取得失敗時は null。
export async function getStreetViewMeta(lat, lng, apiKey) {
  try {
    const url = `https://maps.googleapis.com/maps/api/streetview/metadata`
      + `?location=${lat},${lng}&radius=100&source=outdoor&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'OK') return null;
    return {
      date:  data.date  ?? null,
      panoId: data.pano_id ?? null,
      svLat:  data.location?.lat ?? lat,
      svLng:  data.location?.lng ?? lng,
    };
  } catch {
    return null;
  }
}

// ── 埋め込みURL ──────────────────────────────────────────
export function getMapEmbedUrl(placeId, apiKey) {
  return `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=place_id:${placeId}`;
}
// SV カメラ位置 (lat, lng) を location に使うことで Embed API が正しい
// パノラマを選択できる。heading でSS方向に向ける。
export function getStreetViewEmbedUrl(lat, lng, apiKey, heading = 0) {
  return `https://www.google.com/maps/embed/v1/streetview?key=${apiKey}`
    + `&location=${lat},${lng}&heading=${Math.round(heading)}&pitch=0&fov=90`;
}
