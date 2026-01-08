// Laftel Plus - Search Page Script

// ========== Constants ==========
const API_BASE = 'https://api.laftel.net';
const COOKIE_NAME = 'at_amss-Co';
const LAFTEL_DOMAIN = 'laftel.net';
const PAGE_SIZE = 100;

// ========== State ==========
const state = {
  filterOptions: {
    genres: [],
    tags: [],
    years: [],
    ending: [
      { id: 'true', name: '완결' },
      { id: 'false', name: '방영중' }
    ]
  },
  filters: {
    search: '',
    sort: 'rank',
    genres: { include: [], exclude: [] },
    tags: { include: [], exclude: [] },
    years: { include: [], exclude: [] },
    ending: [],
    excludeRated: false,
    excludeHate: true,
    viewable: true,
    svod: false
  },
  userData: {
    ratedItems: new Map(),
    wishItems: new Map(),
    hateItems: new Map()
  },
  results: [],
  offset: 0,
  totalCount: 0,
  isLoading: false,
  currentItemId: null
};

// ========== API Functions ==========
async function getToken() {
  const cookie = await chrome.cookies.get({
    url: `https://${LAFTEL_DOMAIN}`,
    name: COOKIE_NAME
  });
  return cookie ? cookie.value : null;
}

async function apiCall(endpoint, options = {}) {
  const token = await getToken();
  console.log('[API] Token:', token ? `${token.substring(0, 10)}...` : 'null');

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  if (token) {
    headers['Authorization'] = `Token ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include'
  });

  if (!response.ok) {
    console.error('[API] Error:', response.status, endpoint);
    throw new Error(`API 오류: ${response.status}`);
  }

  return response.json();
}

// ========== Data Functions ==========
async function loadData(key) {
  const result = await chrome.storage.local.get([key, `${key}_updated`]);
  return {
    data: result[key] || [],
    updatedAt: result[`${key}_updated`] || null
  };
}

async function saveData(key, data) {
  await chrome.storage.local.set({ [key]: data, [`${key}_updated`]: Date.now() });
}

async function loadUserData() {
  const [rated, wish, hate] = await Promise.all([
    loadData('rated_items'),
    loadData('wish_items'),
    loadData('hate_items')
  ]);

  state.userData.ratedItems.clear();
  state.userData.wishItems.clear();
  state.userData.hateItems.clear();

  rated.data.forEach(item => state.userData.ratedItems.set(item.id, item));
  wish.data.forEach(item => state.userData.wishItems.set(item.id, item));
  hate.data.forEach(item => state.userData.hateItems.set(item.id, item));
}

async function loadSettings() {
  const result = await chrome.storage.local.get(['settings', 'filters']);

  // 기본 설정
  const settings = result.settings || { hideRated: false, hideHate: true };
  state.filters.excludeRated = settings.hideRated;
  state.filters.excludeHate = settings.hideHate !== false;
  document.getElementById('exclude-rated').checked = state.filters.excludeRated;
  document.getElementById('exclude-hate').checked = state.filters.excludeHate;

  // 저장된 필터 상태
  const savedFilters = result.filters;
  if (savedFilters) {
    state.filters.sort = savedFilters.sort || 'rank';
    state.filters.genres = savedFilters.genres || { include: [], exclude: [] };
    state.filters.tags = savedFilters.tags || { include: [], exclude: [] };
    state.filters.years = savedFilters.years || { include: [], exclude: [] };
    state.filters.ending = savedFilters.ending || [];
    state.filters.viewable = savedFilters.viewable !== false;
    state.filters.svod = savedFilters.svod || false;

    // UI 반영
    document.getElementById('sort-select').value = state.filters.sort;
    document.getElementById('filter-viewable').checked = state.filters.viewable;
    document.getElementById('filter-svod').checked = state.filters.svod;
  }
}

async function saveSettings() {
  const settings = {
    hideRated: state.filters.excludeRated,
    hideHate: state.filters.excludeHate
  };
  await chrome.storage.local.set({ settings });
}

async function saveFilters() {
  const filters = {
    sort: state.filters.sort,
    genres: state.filters.genres,
    tags: state.filters.tags,
    years: state.filters.years,
    ending: state.filters.ending,
    viewable: state.filters.viewable,
    svod: state.filters.svod
  };
  await chrome.storage.local.set({ filters });
}

// ========== Filter Options ==========
async function fetchFilterOptions() {
  try {
    const data = await apiCall('/api/v1.0/info/discover/');
    // API returns string arrays, not object arrays
    state.filterOptions.genres = data.genres || [];
    state.filterOptions.tags = data.tags || [];
    state.filterOptions.years = data.years?.animation || [];
    state.filterOptions.brands = data.brands || [];
    state.filterOptions.productions = data.productions || [];
  } catch (error) {
    console.error('Failed to fetch filter options:', error);
  }
}

function renderFilterOptions() {
  renderFilterGroup('genre-options', state.filterOptions.genres, 'genres');
  renderFilterGroup('tags-options', state.filterOptions.tags, 'tags');
  renderFilterGroup('years-options', state.filterOptions.years, 'years');
  renderFilterGroup('ending-options', state.filterOptions.ending, 'ending');
}

const FILTER_LIMIT = 6;
let currentFilterModal = null;

function renderFilterGroup(containerId, options, filterKey) {
  const container = document.getElementById(containerId);
  if (!container || !options) return;

  const isAdvanced = ['genres', 'tags', 'years'].includes(filterKey);
  const displayOptions = isAdvanced ? options.slice(0, FILTER_LIMIT) : options;
  const hasMore = isAdvanced && options.length > FILTER_LIMIT;

  container.innerHTML = displayOptions.map(opt => {
    const value = typeof opt === 'string' ? opt : (opt.id || opt.name);
    const label = typeof opt === 'string' ? opt : opt.name;
    const filterState = getFilterState(filterKey, value);
    return `<button class="filter-chip ${filterState}" data-key="${filterKey}" data-value="${value}">${label}</button>`;
  }).join('') + (hasMore ? `<button class="filter-chip more-btn" data-key="${filterKey}">+${options.length - FILTER_LIMIT}개 더보기</button>` : '');

  container.querySelectorAll('.filter-chip:not(.more-btn)').forEach(chip => {
    chip.addEventListener('click', () => toggleFilter(filterKey, chip.dataset.value, chip));
  });

  const moreBtn = container.querySelector('.more-btn');
  if (moreBtn) {
    moreBtn.addEventListener('click', () => openFilterModal(filterKey));
  }
}

function getFilterState(key, value) {
  const filter = state.filters[key];
  if (!filter || !filter.include) return '';
  if (filter.include.includes(value)) return 'include';
  if (filter.exclude.includes(value)) return 'exclude';
  return '';
}

function toggleFilter(key, value, chipEl) {
  const filter = state.filters[key];

  // 간단한 배열 필터 (ending 등)
  if (Array.isArray(filter)) {
    const idx = filter.indexOf(value);
    if (idx === -1) {
      filter.push(value);
      chipEl.classList.add('active');
    } else {
      filter.splice(idx, 1);
      chipEl.classList.remove('active');
    }
    resetAndFetch();
    return;
  }

  // 포함/제외 필터: 미선택 → 포함 → 제외 → 미선택
  const inInclude = filter.include.indexOf(value);
  const inExclude = filter.exclude.indexOf(value);

  if (inInclude === -1 && inExclude === -1) {
    // 미선택 → 포함
    filter.include.push(value);
    chipEl.classList.remove('exclude');
    chipEl.classList.add('include');
  } else if (inInclude !== -1) {
    // 포함 → 제외
    filter.include.splice(inInclude, 1);
    filter.exclude.push(value);
    chipEl.classList.remove('include');
    chipEl.classList.add('exclude');
  } else {
    // 제외 → 미선택
    filter.exclude.splice(inExclude, 1);
    chipEl.classList.remove('exclude', 'include');
  }

  updateActiveFilters();
  resetAndFetch();
}

function updateActiveFilters() {
  const container = document.getElementById('active-filters');
  const tags = [];

  ['genres', 'tags', 'years'].forEach(key => {
    const filter = state.filters[key];
    filter.include.forEach(v => tags.push({ key, value: v, type: 'include', label: `+${v}` }));
    filter.exclude.forEach(v => tags.push({ key, value: v, type: 'exclude', label: `-${v}` }));
  });

  container.innerHTML = tags.map(t =>
    `<span class="active-filter-tag ${t.type}">
      ${t.label}
      <button data-key="${t.key}" data-value="${t.value}" data-type="${t.type}">&times;</button>
    </span>`
  ).join('');

  container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const { key, value, type } = btn.dataset;
      const arr = state.filters[key][type];
      const idx = arr.indexOf(value);
      if (idx !== -1) arr.splice(idx, 1);
      renderFilterOptions();
      updateActiveFilters();
      resetAndFetch();
    });
  });
}

function openFilterModal(filterKey) {
  currentFilterModal = filterKey;
  const options = state.filterOptions[filterKey] || [];
  const modal = document.getElementById('filter-modal');
  const title = document.getElementById('filter-modal-title');
  const list = document.getElementById('filter-modal-list');

  const titles = { genres: '장르', tags: '태그', years: '연도' };
  title.textContent = titles[filterKey] || filterKey;

  list.innerHTML = options.map(opt => {
    const value = typeof opt === 'string' ? opt : (opt.id || opt.name);
    const label = typeof opt === 'string' ? opt : opt.name;
    const filterState = getFilterState(filterKey, value);
    return `<button class="filter-chip ${filterState}" data-value="${value}">${label}</button>`;
  }).join('');

  list.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      toggleFilter(filterKey, chip.dataset.value, chip);
      // 메인 영역 칩 상태도 업데이트
      const mainChip = document.querySelector(`#${filterKey}-options .filter-chip[data-value="${chip.dataset.value}"]`);
      if (mainChip) {
        mainChip.className = chip.className;
      }
    });
  });

  modal.style.display = 'flex';
}

function closeFilterModal() {
  document.getElementById('filter-modal').style.display = 'none';
  currentFilterModal = null;
}

function clearAllFilters() {
  state.filters.genres = { include: [], exclude: [] };
  state.filters.tags = { include: [], exclude: [] };
  state.filters.years = { include: [], exclude: [] };
  state.filters.ending = [];
  document.querySelectorAll('.filter-chip.include, .filter-chip.exclude, .filter-chip.active').forEach(c => {
    c.classList.remove('include', 'exclude', 'active');
  });
  updateActiveFilters();
  resetAndFetch();
}

// ========== Discover API ==========
async function fetchDiscoverResults(append = false) {
  if (state.isLoading) return;
  state.isLoading = true;
  showLoading(true);

  try {
    const params = new URLSearchParams({
      sort: state.filters.sort,
      offset: append ? state.offset : 0,
      size: PAGE_SIZE
    });

    if (state.filters.viewable) params.append('viewable', 'true');
    if (state.filters.svod) params.append('svod', 'true');
    if (state.filters.search) params.append('keyword', state.filters.search);

    // 포함/제외 필터
    if (state.filters.genres.include.length) params.append('genres', state.filters.genres.include.join(','));
    if (state.filters.genres.exclude.length) params.append('exclude_genres', state.filters.genres.exclude.join(','));
    if (state.filters.tags.include.length) params.append('tags', state.filters.tags.include.join(','));
    if (state.filters.tags.exclude.length) params.append('exclude_tags', state.filters.tags.exclude.join(','));
    if (state.filters.years.include.length) params.append('years', state.filters.years.include.join(','));
    if (state.filters.years.exclude.length) params.append('exclude_years', state.filters.years.exclude.join(','));
    if (state.filters.ending.length) params.append('ending', state.filters.ending[0]);

    const data = await apiCall(`/api/search/v1/discover/?${params.toString()}`);

    if (!append) {
      state.results = [];
      state.offset = 0;
    }

    state.totalCount = data.count;
    state.results.push(...data.results);
    state.offset += data.results.length;

    renderCards(append);
    updateResultsCount();

  } catch (error) {
    console.error('Failed to fetch discover results:', error);
  } finally {
    state.isLoading = false;
    showLoading(false);
  }
}

function resetAndFetch() {
  state.results = [];
  state.offset = 0;
  saveFilters(); // 필터 상태 저장
  fetchDiscoverResults(false);
}

// ========== Card Rendering ==========
function renderCards(append = false) {
  const grid = document.getElementById('card-grid');
  if (!append) grid.innerHTML = '';

  const filtered = applyClientFilters(state.results);
  const startIdx = append ? grid.children.length : 0;

  for (let i = startIdx; i < filtered.length; i++) {
    const item = filtered[i];
    const card = createCardElement(item);
    grid.appendChild(card);
  }
}

function applyClientFilters(items) {
  return items.filter(item => {
    // 평가한 작품 제외
    if (state.filters.excludeRated && state.userData.ratedItems.has(item.id)) {
      return false;
    }
    // 관심 없는 작품 제외
    if (state.filters.excludeHate && state.userData.hateItems.has(item.id)) {
      return false;
    }
    return true;
  });
}

function createCardElement(item) {
  const div = document.createElement('div');
  div.className = 'anime-card';
  div.dataset.id = item.id;

  const isRated = state.userData.ratedItems.has(item.id);
  const isWish = state.userData.wishItems.has(item.id);
  const isHate = state.userData.hateItems.has(item.id);
  const ratedItem = state.userData.ratedItems.get(item.id);

  if (isRated) div.classList.add('rated');
  if (isHate) div.classList.add('hated');

  const ratingClass = item.rating >= 19 ? 'r19' : item.rating >= 15 ? 'r15' : item.rating >= 12 ? 'r12' : 'rall';
  const ratingText = item.rating >= 19 ? '19' : item.rating >= 15 ? '15' : item.rating >= 12 ? '12' : 'ALL';

  div.innerHTML = `
    <div class="card-image">
      <img src="${item.img || ''}" alt="${item.name}" loading="lazy">
      <div class="card-badges">
        <span class="badge age-rating ${ratingClass}">${ratingText}</span>
        ${item.medium ? `<span class="badge medium">${item.medium}</span>` : ''}
      </div>
      <div class="card-status">
        ${isRated ? `<span class="status-badge rated">★${ratedItem.rating}</span>` : ''}
        ${isWish ? `<span class="status-badge wish">보고싶다</span>` : ''}
      </div>
    </div>
    <div class="card-info">
      <h4 class="card-title">${item.name}</h4>
      <p class="card-genres">${(item.genres || []).slice(0, 3).join(', ')}</p>
    </div>
    <div class="card-actions">
      <button class="action-btn hate-btn ${isHate ? 'active' : ''}" data-action="hate" title="관심없음">✕</button>
      <button class="action-btn wish-btn ${isWish ? 'active' : ''}" data-action="wish" title="보고싶다">${isWish ? '♥' : '♡'}</button>
    </div>
  `;

  // Card click -> open detail
  div.querySelector('.card-image').addEventListener('click', () => openDetail(item.id));
  div.querySelector('.card-info').addEventListener('click', () => openDetail(item.id));

  // Action buttons
  div.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleCardAction(btn.dataset.action, item.id, item);
    });
  });

  return div;
}

function updateCardUI(itemId) {
  const card = document.querySelector(`.anime-card[data-id="${itemId}"]`);
  if (!card) return;

  const isRated = state.userData.ratedItems.has(itemId);
  const isWish = state.userData.wishItems.has(itemId);
  const isHate = state.userData.hateItems.has(itemId);
  const ratedItem = state.userData.ratedItems.get(itemId);

  card.classList.toggle('rated', isRated);
  card.classList.toggle('hated', isHate);

  const statusDiv = card.querySelector('.card-status');
  statusDiv.innerHTML = `
    ${isRated ? `<span class="status-badge rated">★${ratedItem.rating}</span>` : ''}
    ${isWish ? `<span class="status-badge wish">보고싶다</span>` : ''}
  `;

  const hateBtn = card.querySelector('.hate-btn');
  const wishBtn = card.querySelector('.wish-btn');

  hateBtn.classList.toggle('active', isHate);
  wishBtn.classList.toggle('active', isWish);
  wishBtn.textContent = isWish ? '♥' : '♡';
}

function updateResultsCount() {
  const filtered = applyClientFilters(state.results);
  document.getElementById('results-count').textContent =
    `${filtered.length}개의 작품 (전체 ${state.totalCount}개)`;
}

// ========== Card Actions ==========
async function handleCardAction(action, itemId, item) {
  try {
    if (action === 'hate') {
      await toggleHate(itemId, item);
    } else if (action === 'wish') {
      await toggleWish(itemId, item);
    }
  } catch (error) {
    console.error(`Action ${action} failed:`, error);
    alert('작업 실패: ' + error.message);
  }
}

async function toggleHate(itemId, item) {
  const isHate = state.userData.hateItems.has(itemId);
  const newState = !isHate;

  await apiCall(`/api/v1.0/items/${itemId}/rate/`, {
    method: 'POST',
    body: JSON.stringify({ is_hate: newState })
  });

  const hateData = await loadData('hate_items');
  if (newState) {
    hateData.data.push({ id: itemId, name: item.name, img: item.img });
    state.userData.hateItems.set(itemId, { id: itemId, name: item.name, img: item.img });
  } else {
    hateData.data = hateData.data.filter(i => i.id !== itemId);
    state.userData.hateItems.delete(itemId);
  }
  await saveData('hate_items', hateData.data);

  updateCardUI(itemId);
  if (state.filters.excludeHate) {
    renderCards(false);
  }
}

async function toggleWish(itemId, item) {
  const isWish = state.userData.wishItems.has(itemId);
  const newState = !isWish;

  await apiCall(`/api/v1.0/items/${itemId}/rate/`, {
    method: 'POST',
    body: JSON.stringify({ is_wish: newState })
  });

  const wishData = await loadData('wish_items');
  if (newState) {
    wishData.data.push({ id: itemId, name: item.name, img: item.img });
    state.userData.wishItems.set(itemId, { id: itemId, name: item.name, img: item.img });
  } else {
    wishData.data = wishData.data.filter(i => i.id !== itemId);
    state.userData.wishItems.delete(itemId);
  }
  await saveData('wish_items', wishData.data);

  updateCardUI(itemId);
}

// ========== Detail Sidebar ==========
function openDetail(itemId) {
  const sidebar = document.getElementById('detail-sidebar');
  const overlay = document.getElementById('detail-overlay');
  const iframe = document.getElementById('detail-iframe');
  iframe.src = `https://laftel.net/finder?modal=${itemId}`;
  sidebar.style.display = 'flex';
  overlay.style.display = 'block';
  state.currentItemId = itemId;
}

function closeDetail() {
  const sidebar = document.getElementById('detail-sidebar');
  const overlay = document.getElementById('detail-overlay');
  const iframe = document.getElementById('detail-iframe');
  sidebar.style.display = 'none';
  overlay.style.display = 'none';
  iframe.src = '';
  state.currentItemId = null;
}

// ========== My Data Modal (통합) ==========
let hateListCache = [];

async function getItemInfo(itemId) {
  const result = await chrome.storage.local.get(['item_cache']);
  const cache = result.item_cache || {};
  if (cache[itemId]) return cache[itemId];

  try {
    const data = await apiCall(`/api/items/v4/${itemId}/`);
    const img = data.images?.[0]?.img_url || '';
    const info = {
      id: data.id,
      name: data.name,
      img,
      genre: data.genre || [],
      medium: data.medium || '',
      rating: data.max_episode_rating?.rating || null
    };
    cache[itemId] = info;
    await chrome.storage.local.set({ item_cache: cache });
    return info;
  } catch (e) {
    return { id: itemId, name: `ID: ${itemId}`, img: '', genre: [], medium: '', rating: null };
  }
}

async function renderHateList(filter = '') {
  const hateListEl = document.getElementById('hate-list');

  if (hateListCache.length === 0) {
    const hate = await loadData('hate_items');
    if (hate.data.length === 0) {
      hateListEl.innerHTML = '<div class="hate-list-empty">관심없음 목록이 비어있습니다</div>';
      return;
    }
    hateListEl.innerHTML = '<div class="hate-list-empty">로딩 중...</div>';
    hateListCache = await Promise.all(
      hate.data.map(async item => {
        const info = await getItemInfo(item.id);
        return { ...item, ...info };
      })
    );
  }

  const filtered = filter
    ? hateListCache.filter(item => item.name?.toLowerCase().includes(filter.toLowerCase()))
    : hateListCache;

  if (filtered.length === 0) {
    hateListEl.innerHTML = '<div class="hate-list-empty">검색 결과가 없습니다</div>';
    return;
  }

  hateListEl.innerHTML = filtered.map(item => {
    const genreText = item.genre?.slice(0, 2).join('·') || '';
    const metaparts = [genreText, item.medium].filter(Boolean);
    const meta = metaparts.length ? metaparts.join(' | ') : '';
    const ratingClass = item.rating >= 19 ? 'r19' : item.rating >= 15 ? 'r15' : item.rating >= 12 ? 'r12' : 'rall';
    return `
    <div class="hate-item" data-id="${item.id}">
      <img class="hate-item-img" src="${item.img || ''}" alt="" onerror="this.style.display='none'">
      <div class="hate-item-info" data-id="${item.id}">
        <div class="hate-item-title">${item.name || `ID: ${item.id}`}</div>
        ${meta ? `<div class="hate-item-meta">${meta}${item.rating ? ` <span class="hate-item-rating ${ratingClass}">${item.rating}</span>` : ''}</div>` : ''}
      </div>
      <button class="hate-item-remove" data-id="${item.id}">해제</button>
    </div>`;
  }).join('');

  hateListEl.querySelectorAll('.hate-item-info').forEach(info => {
    info.addEventListener('click', () => {
      closeMyDataModal();
      openDetail(parseInt(info.dataset.id));
    });
  });

  hateListEl.querySelectorAll('.hate-item-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const itemId = parseInt(e.target.dataset.id);
      const itemEl = e.target.closest('.hate-item');
      e.target.disabled = true;

      try {
        await apiCall(`/api/v1.0/items/${itemId}/rate/`, {
          method: 'POST',
          body: JSON.stringify({ is_hate: false })
        });
        const hateData = await loadData('hate_items');
        const newData = hateData.data.filter(i => i.id !== itemId);
        await saveData('hate_items', newData);
        hateListCache = hateListCache.filter(i => i.id !== itemId);
        state.userData.hateItems.delete(itemId);
        itemEl.remove();
        if (hateListCache.length === 0) {
          hateListEl.innerHTML = '<div class="hate-list-empty">관심없음 목록이 비어있습니다</div>';
        }
        renderCards(false);
      } catch (error) {
        e.target.disabled = false;
        alert('해제 실패: ' + error.message);
      }
    });
  });
}

function openMyDataModal(tab = 'hate-list') {
  const modal = document.getElementById('my-data-modal');
  modal.style.display = 'flex';
  switchMyDataTab(tab);
  if (tab === 'hate-list') {
    document.getElementById('hate-search').value = '';
    hateListCache = [];
    renderHateList();
  }
}

function closeMyDataModal() {
  document.getElementById('my-data-modal').style.display = 'none';
  document.getElementById('import-input').value = '';
  hateListCache = [];
}

function switchMyDataTab(tabName) {
  // 탭 버튼 활성화
  document.querySelectorAll('.modal-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  // 탭 컨텐츠 표시
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tabName}`);
  });
  // 관심없음 목록 탭 선택 시 목록 로드
  if (tabName === 'hate-list' && hateListCache.length === 0) {
    renderHateList();
  }
}

async function exportHateData() {
  const hate = await loadData('hate_items');
  const json = JSON.stringify(hate.data);
  const base64 = btoa(unescape(encodeURIComponent(json)));

  // 파일로 다운로드
  const blob = new Blob([base64], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `laftel-plus-backup-${new Date().toISOString().split('T')[0]}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function importHateData(merge = false) {
  const input = document.getElementById('import-input').value.trim();
  if (!input) {
    alert('백업 문자열을 입력해주세요.');
    return;
  }

  try {
    const json = decodeURIComponent(escape(atob(input)));
    const imported = JSON.parse(json);

    if (!Array.isArray(imported)) {
      throw new Error('Invalid format');
    }

    const currentHate = await loadData('hate_items');
    let newData;

    if (merge) {
      const existingIds = new Set(currentHate.data.map(i => i.id));
      const toAdd = imported.filter(i => !existingIds.has(i.id));
      newData = [...currentHate.data, ...toAdd];
    } else {
      newData = imported;
    }

    await saveData('hate_items', newData);
    await loadUserData();
    renderCards(false);
    closeMyDataModal();
    showToast(`${merge ? '병합' : '교체'} 완료! (${newData.length}개)`);
  } catch (e) {
    alert('잘못된 백업 문자열입니다.');
  }
}

// ========== Sync ==========
async function fetchAllPages(endpoint, limit = 25, onProgress) {
  const allResults = [];
  let offset = 0;
  let total = 0;

  do {
    const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}offset=${offset}&limit=${limit}`;
    const data = await apiCall(url);

    if (total === 0) total = data.count;
    allResults.push(...data.results);
    offset += limit;

    if (onProgress) onProgress(allResults.length, total);
  } while (allResults.length < total);

  return allResults;
}

async function collectData() {
  const modal = document.getElementById('sync-modal');
  const progressBar = document.getElementById('sync-progress-bar');
  const progressText = document.getElementById('sync-progress-text');

  modal.style.display = 'flex';

  try {
    progressText.textContent = '평가한 작품 수집 중...';
    const ratedResults = await fetchAllPages('/api/reviews/v1/my_ratings/?sorting=add', 25, (c, t) => {
      progressBar.style.width = `${(c / t) * 50}%`;
      progressText.textContent = `평가한 작품: ${c}/${t}`;
    });
    const ratedItems = ratedResults.map(r => ({
      id: r.item.id,
      name: r.item.name,
      img: r.item.img,
      rating: r.value
    }));
    await saveData('rated_items', ratedItems);

    progressText.textContent = '보고싶다 목록 수집 중...';
    const wishResults = await fetchAllPages('/api/items/v1/wish_item/?sorting=add', 25, (c, t) => {
      progressBar.style.width = `${50 + (c / t) * 50}%`;
      progressText.textContent = `보고싶다: ${c}/${t}`;
    });
    const wishItems = wishResults.map(r => ({
      id: r.item.id,
      name: r.item.name,
      img: r.item.img
    }));
    await saveData('wish_items', wishItems);

    await loadUserData();
    renderCards(false);
    modal.style.display = 'none';
    showToast(`수집 완료! 평가: ${ratedItems.length}개, 보고싶다: ${wishItems.length}개`);

  } catch (error) {
    modal.style.display = 'none';
    showToast('수집 실패: ' + error.message);
  }
}

// ========== Clear Wish ==========
async function clearAllWish() {
  const wishData = await loadData('wish_items');

  if (wishData.data.length === 0) {
    alert('해제할 보고싶다 목록이 없습니다.');
    return;
  }

  if (!confirm(`정말 ${wishData.data.length}개의 보고싶다를 전체 해제하시겠습니까?`)) {
    return;
  }

  const modal = document.getElementById('sync-modal');
  const progressBar = document.getElementById('sync-progress-bar');
  const progressText = document.getElementById('sync-progress-text');
  modal.style.display = 'flex';

  let completed = 0;
  const total = wishData.data.length;

  try {
    for (const item of wishData.data) {
      await apiCall(`/api/v1.0/items/${item.id}/rate/`, {
        method: 'POST',
        body: JSON.stringify({ is_wish: false })
      });
      completed++;
      progressBar.style.width = `${(completed / total) * 100}%`;
      progressText.textContent = `해제 중: ${completed}/${total}`;
      await new Promise(r => setTimeout(r, 100));
    }

    await saveData('wish_items', []);
    await loadUserData();
    renderCards(false);
    modal.style.display = 'none';
    showToast(`${completed}개 해제 완료!`);
  } catch (error) {
    modal.style.display = 'none';
    alert('해제 실패: ' + error.message);
  }
}

// ========== Infinite Scroll ==========
function setupInfiniteScroll() {
  const sentinel = document.getElementById('sentinel');
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !state.isLoading && state.offset < state.totalCount) {
      fetchDiscoverResults(true);
    }
  }, { rootMargin: '200px' });
  observer.observe(sentinel);
}

// ========== UI Helpers ==========
function showLoading(show) {
  document.getElementById('loading-spinner').style.display = show ? 'flex' : 'none';
}

function setupCollapsibleSections() {
  document.querySelectorAll('.filter-title[data-toggle]').forEach(title => {
    title.addEventListener('click', () => {
      title.closest('.filter-section').classList.toggle('collapsed');
    });
  });
}

// ========== Event Listeners ==========
function setupEventListeners() {
  // Sort
  document.getElementById('sort-select').addEventListener('change', (e) => {
    state.filters.sort = e.target.value;
    resetAndFetch();
  });

  // Extension filters
  document.getElementById('exclude-rated').addEventListener('change', (e) => {
    state.filters.excludeRated = e.target.checked;
    saveSettings();
    renderCards(false);
    updateResultsCount();
  });

  document.getElementById('exclude-hate').addEventListener('change', (e) => {
    state.filters.excludeHate = e.target.checked;
    saveSettings();
    renderCards(false);
    updateResultsCount();
  });

  // 시청 옵션 필터
  document.getElementById('filter-viewable').addEventListener('change', (e) => {
    state.filters.viewable = e.target.checked;
    resetAndFetch();
  });

  document.getElementById('filter-svod').addEventListener('change', (e) => {
    state.filters.svod = e.target.checked;
    resetAndFetch();
  });

  // Clear filters
  document.getElementById('clear-filters-btn').addEventListener('click', clearAllFilters);

  // Sidebar toggle
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('collapsed');
    document.getElementById('sidebar-expand').style.display = 'flex';
  });

  document.getElementById('sidebar-expand').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('collapsed');
    document.getElementById('sidebar-expand').style.display = 'none';
  });

  // Sidebar buttons
  document.getElementById('sync-btn').addEventListener('click', collectData);
  document.getElementById('my-data-btn').addEventListener('click', () => openMyDataModal('hate-list'));

  // Detail sidebar
  document.getElementById('detail-close').addEventListener('click', closeDetail);
  document.getElementById('detail-overlay').addEventListener('click', closeDetail);

  // Filter modal
  document.getElementById('filter-modal-close').addEventListener('click', closeFilterModal);
  document.getElementById('filter-modal').addEventListener('click', (e) => {
    if (e.target.id === 'filter-modal') closeFilterModal();
  });

  // My Data modal (통합 모달)
  document.getElementById('my-data-modal-close').addEventListener('click', closeMyDataModal);
  document.getElementById('my-data-modal').addEventListener('click', (e) => {
    if (e.target.id === 'my-data-modal') closeMyDataModal();
  });
  // 탭 전환
  document.querySelectorAll('.modal-tab').forEach(tab => {
    tab.addEventListener('click', () => switchMyDataTab(tab.dataset.tab));
  });
  // 관심없음 검색
  document.getElementById('hate-search').addEventListener('input', (e) => {
    renderHateList(e.target.value);
  });
  // 백업/복원
  document.getElementById('export-btn').addEventListener('click', exportHateData);
  document.getElementById('import-merge-btn').addEventListener('click', () => importHateData(true));
  document.getElementById('import-replace-btn').addEventListener('click', () => importHateData(false));
  // 보고싶다 전체 해제
  document.getElementById('clear-wish-btn').addEventListener('click', clearAllWish);

  // Storage changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      if (changes.rated_items || changes.wish_items || changes.hate_items) {
        loadUserData().then(() => {
          renderCards(false);
          updateResultsCount();
        });
      }
    }
  });
}

// ========== Toast ==========
function showToast(message, duration = 2000) {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ========== Initialization ==========
async function init() {
  await loadUserData();
  await loadSettings();
  await fetchFilterOptions();
  renderFilterOptions();
  updateActiveFilters(); // 저장된 필터 태그 표시
  setupEventListeners();
  setupCollapsibleSections();
  setupInfiniteScroll();
  await fetchDiscoverResults();
}

document.addEventListener('DOMContentLoaded', init);
