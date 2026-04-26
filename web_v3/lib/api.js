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
  placesService = new google.maps.places.PlacesService(
    document.createElement('div')
  );
}

// ── テキスト検索 ─────────────────────────────────────────
export function textSearch(query) {
  return new Promise((resolve, reject) => {
    placesService.textSearch({ query }, (results, status) => {
      const S = google.maps.places.PlacesServiceStatus;
      if (status === S.OK)           resolve(results);
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

// ── 埋め込みURL ──────────────────────────────────────────
export function getMapEmbedUrl(placeId, apiKey) {
  return `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=place_id:${placeId}`;
}
export function getStreetViewEmbedUrl(lat, lng, apiKey) {
  return `https://www.google.com/maps/embed/v1/streetview?key=${apiKey}&location=${lat},${lng}&heading=0&pitch=0&fov=90`;
}
