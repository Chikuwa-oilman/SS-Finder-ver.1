// ── HTML エスケープ ──────────────────────────────────────
const _esc = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => _esc[c]);
}

// ── ステータスメッセージ ──────────────────────────────────
export function setStatus(msg, type = 'info') {
  const el = document.getElementById('status-msg');
  el.textContent = msg;
  el.className = `status-${type}`;
}
export function clearStatus() {
  const el = document.getElementById('status-msg');
  el.textContent = '';
  el.className = '';
}

// ── 表示切り替え ─────────────────────────────────────────
export function showEl(id) { document.getElementById(id)?.classList.remove('hidden'); }
export function hideEl(id) { document.getElementById(id)?.classList.add('hidden'); }

// ── 検索履歴チップ ───────────────────────────────────────
export function renderHistoryChips(history, onSelect, onClear) {
  const container = document.getElementById('search-history');
  if (!history.length) { container.innerHTML = ''; return; }
  const nodes = history.map(h => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = h.query;
    btn.setAttribute('role', 'listitem');
    btn.addEventListener('click', () => onSelect(h.query));
    return btn;
  });
  const clr = document.createElement('button');
  clr.className = 'chip chip-clear';
  clr.textContent = '履歴を消す';
  clr.addEventListener('click', onClear);
  container.replaceChildren(...nodes, clr);
}

// ── 検索結果リスト ───────────────────────────────────────
const RESULTS_PAGE = 10;

export function renderResultsList(results, onAdd) {
  const ul      = document.getElementById('results-ul');
  const section = document.getElementById('results-list');
  document.getElementById('results-count').textContent = results.length;

  section.querySelectorAll('.results-warn, .btn-more, .btn-collapse').forEach(el => el.remove());

  const makeItem = r => {
    const li = document.createElement('li');
    li.className = 'result-item';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'result-name';
    nameSpan.textContent = r.name;
    const addrSpan = document.createElement('span');
    addrSpan.className = 'result-addr';
    addrSpan.textContent = r.formatted_address ?? r.vicinity ?? '';
    const btn = document.createElement('button');
    btn.className = 'btn-add';
    btn.textContent = '詳細を表示';
    btn.addEventListener('click', () => onAdd(r.place_id, btn));
    li.append(nameSpan, addrSpan, btn);
    return li;
  };

  const renderPage = count => ul.replaceChildren(...results.slice(0, count).map(makeItem));
  renderPage(RESULTS_PAGE);

  if (results.length > RESULTS_PAGE) {
    const warn = document.createElement('p');
    warn.className = 'results-warn';
    warn.textContent = '件数が多いです。検索条件を絞ることをおすすめします。';

    const moreBtn = document.createElement('button');
    moreBtn.className = 'btn-more btn-secondary';
    moreBtn.textContent = `更に表示（${results.length - RESULTS_PAGE}件）`;

    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'btn-collapse btn-secondary hidden';
    collapseBtn.textContent = '折りたたむ';

    moreBtn.addEventListener('click', () => {
      renderPage(results.length);
      moreBtn.classList.add('hidden');
      collapseBtn.classList.remove('hidden');
    });
    collapseBtn.addEventListener('click', () => {
      renderPage(RESULTS_PAGE);
      collapseBtn.classList.add('hidden');
      moreBtn.classList.remove('hidden');
    });

    section.append(warn, moreBtn, collapseBtn);
  }

  showEl('results-list');
}

// ── お気に入りチップ ─────────────────────────────────────
export function renderFavoriteChips(favorites, onSearch) {
  const container = document.getElementById('favorites-list');
  const section   = document.getElementById('favorites-section');
  if (!favorites.length) {
    container.innerHTML = '';
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');
  container.replaceChildren(...favorites.map(f => {
    const btn = document.createElement('button');
    btn.className = 'chip chip-fav';
    btn.textContent = f.name;
    btn.setAttribute('role', 'listitem');
    btn.addEventListener('click', () => onSearch(f.name));
    return btn;
  }));
}
