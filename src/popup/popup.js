// Laftel Plus - Popup Script

// API 설정
const API_BASE = 'https://api.laftel.net';
const COOKIE_NAME = 'at_amss-Co';
const LAFTEL_DOMAIN = 'laftel.net';

// 쿠키에서 토큰 가져오기
async function getToken() {
  const cookie = await chrome.cookies.get({
    url: `https://${LAFTEL_DOMAIN}`,
    name: COOKIE_NAME
  });
  return cookie ? cookie.value : null;
}

// API 호출 함수
async function apiCall(endpoint, options = {}) {
  const token = await getToken();
  if (!token) {
    throw new Error('로그인이 필요합니다. 라프텔에 먼저 로그인해주세요.');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    throw new Error(`API 오류: ${response.status}`);
  }

  return response.json();
}

// 페이지네이션으로 전체 데이터 수집
async function fetchAllPages(endpoint, limit = 25, onProgress) {
  const allResults = [];
  let offset = 0;
  let total = 0;

  do {
    const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}offset=${offset}&limit=${limit}`;
    const data = await apiCall(url);

    if (total === 0) {
      total = data.count;
    }

    allResults.push(...data.results);
    offset += limit;

    if (onProgress) {
      onProgress(allResults.length, total);
    }

  } while (allResults.length < total);

  return allResults;
}

// 평가한 작품 목록 수집
async function fetchRatedItems(onProgress) {
  const results = await fetchAllPages('/api/reviews/v1/my_ratings/?sorting=add', 25, onProgress);
  return results.map(r => ({
    id: r.item.id,
    name: r.item.name,
    img: r.item.img,
    rating: r.value,
    avgRating: r.item.avg_rating
  }));
}

// 보고싶다 목록 수집
async function fetchWishItems(onProgress) {
  const results = await fetchAllPages('/api/items/v1/wish_item/?sorting=add', 25, onProgress);
  return results.map(r => ({
    id: r.item.id,
    name: r.item.name,
    img: r.item.img,
    avgRating: r.item.avg_rating
  }));
}

// 로컬 스토리지에 저장
async function saveData(key, data) {
  await chrome.storage.local.set({ [key]: data, [`${key}_updated`]: Date.now() });
}

// 로컬 스토리지에서 로드
async function loadData(key) {
  const result = await chrome.storage.local.get([key, `${key}_updated`]);
  return {
    data: result[key] || [],
    updatedAt: result[`${key}_updated`] || null
  };
}

// 작품 정보 캐시 업데이트
async function updateItemCache(items) {
  const result = await chrome.storage.local.get(['item_cache']);
  const cache = result.item_cache || {};
  items.forEach(item => {
    cache[item.id] = { id: item.id, name: item.name, img: item.img };
  });
  await chrome.storage.local.set({ item_cache: cache });
}

// 작품 정보 가져오기 (캐시 또는 API)
async function getItemInfo(itemId) {
  const result = await chrome.storage.local.get(['item_cache']);
  const cache = result.item_cache || {};
  if (cache[itemId]) return cache[itemId];

  // API fallback
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

// 시간 포맷
function formatTime(timestamp) {
  if (!timestamp) return '없음';
  const date = new Date(timestamp);
  return date.toLocaleString('ko-KR');
}

// UI 업데이트
function updateStatus(message, isError = false) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = isError ? 'error' : '';
}

function updateProgress(current, total, type) {
  const progressEl = document.getElementById('progress');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');

  progressEl.style.display = 'block';
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  progressBar.style.width = `${percent}%`;
  progressText.textContent = `${type}: ${current}/${total}`;
}

function hideProgress() {
  document.getElementById('progress').style.display = 'none';
}

function updateStats(ratedCount, wishCount, hateCount, lastUpdated) {
  document.getElementById('rated-count').textContent = ratedCount;
  document.getElementById('wish-count').textContent = wishCount;
  document.getElementById('hate-count').textContent = hateCount;
  document.getElementById('last-updated').textContent = formatTime(lastUpdated);
}

// 보고싶다 해제 API
async function removeWish(itemId) {
  const token = await getToken();
  if (!token) throw new Error('로그인이 필요합니다.');

  const response = await fetch(`${API_BASE}/api/v1.0/items/${itemId}/rate/`, {
    method: 'POST',
    headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_wish: false })
  });
  if (!response.ok) throw new Error(`API 오류: ${response.status}`);
  return response.json();
}

// 관심없음 해제 API
async function removeHate(itemId) {
  const token = await getToken();
  if (!token) throw new Error('로그인이 필요합니다.');

  const response = await fetch(`${API_BASE}/api/v1.0/items/${itemId}/rate/`, {
    method: 'POST',
    headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_hate: false })
  });
  if (!response.ok) throw new Error(`API 오류: ${response.status}`);
  return response.json();
}

// 보고싶다 전체 해제
async function clearAllWish() {
  const clearBtn = document.getElementById('clear-wish-btn');
  clearBtn.disabled = true;

  try {
    const wish = await loadData('wish_items');

    if (wish.data.length === 0) {
      updateStatus('해제할 보고싶다 목록이 없습니다.', true);
      return;
    }

    const confirmed = confirm(`정말 ${wish.data.length}개의 보고싶다를 전체 해제하시겠습니까?`);
    if (!confirmed) {
      updateStatus('취소되었습니다.');
      return;
    }

    updateStatus('보고싶다 전체 해제 중...');

    let completed = 0;
    const total = wish.data.length;

    for (const item of wish.data) {
      try {
        await removeWish(item.id);
        completed++;
        updateProgress(completed, total, '해제 중');
      } catch (e) {
        console.error(`Failed to remove wish for ${item.id}:`, e);
      }
      // API 부하 방지를 위한 딜레이
      await new Promise(r => setTimeout(r, 100));
    }

    // 로컬 스토리지 비우기
    await saveData('wish_items', []);

    hideProgress();
    updateStatus(`${completed}개 해제 완료!`);
    updateStats(
      (await loadData('rated_items')).data.length,
      0,
      (await loadData('hate_items')).data.length,
      Date.now()
    );

  } catch (error) {
    hideProgress();
    updateStatus(error.message, true);
  } finally {
    clearBtn.disabled = false;
  }
}

// 수집 실행
async function collectData() {
  const collectBtn = document.getElementById('collect-btn');
  collectBtn.disabled = true;

  try {
    updateStatus('평가한 작품 수집 중...');
    const ratedItems = await fetchRatedItems((current, total) => {
      updateProgress(current, total, '평가한 작품');
    });
    await saveData('rated_items', ratedItems);
    await updateItemCache(ratedItems);

    updateStatus('보고싶다 목록 수집 중...');
    const wishItems = await fetchWishItems((current, total) => {
      updateProgress(current, total, '보고싶다');
    });
    await saveData('wish_items', wishItems);
    await updateItemCache(wishItems);

    const hateCount = (await loadData('hate_items')).data.length;
    hideProgress();
    updateStatus(`수집 완료! 평가: ${ratedItems.length}개, 보고싶다: ${wishItems.length}개`);
    updateStats(ratedItems.length, wishItems.length, hateCount, Date.now());

  } catch (error) {
    hideProgress();
    updateStatus(error.message, true);
  } finally {
    collectBtn.disabled = false;
  }
}

// 관심없음 목록 데이터 캐시
let hateListCache = [];

// 관심없음 목록 렌더링
async function renderHateList(filter = '') {
  const hateListEl = document.getElementById('hate-list');

  // 캐시가 없으면 로드
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

  // 필터링
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
      <a class="hate-item-info" href="https://laftel.net/finder?modal=${item.id}" target="_blank">
        <div class="hate-item-title">${item.name || `ID: ${item.id}`}</div>
        ${meta ? `<div class="hate-item-meta">${meta}${item.rating ? ` <span class="hate-item-rating ${ratingClass}">${item.rating}</span>` : ''}</div>` : ''}
      </a>
      <button class="hate-item-remove" data-id="${item.id}">해제</button>
    </div>`;
  }).join('');

  // 해제 버튼 이벤트
  hateListEl.querySelectorAll('.hate-item-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const itemId = parseInt(e.target.dataset.id);
      const itemEl = e.target.closest('.hate-item');
      e.target.disabled = true;

      try {
        await removeHate(itemId);
        const hateData = await loadData('hate_items');
        const newData = hateData.data.filter(i => i.id !== itemId);
        await saveData('hate_items', newData);
        hateListCache = hateListCache.filter(i => i.id !== itemId);
        itemEl.remove();
        document.getElementById('hate-count').textContent = newData.length;
        if (hateListCache.length === 0) {
          hateListEl.innerHTML = '<div class="hate-list-empty">관심없음 목록이 비어있습니다</div>';
        }
      } catch (error) {
        e.target.disabled = false;
        alert('해제 실패: ' + error.message);
      }
    });
  });
}

// 관심없음 모달 열기
function openHateModal() {
  document.getElementById('hate-modal').style.display = 'flex';
  document.getElementById('hate-stat').classList.add('active');
  document.getElementById('hate-search').value = '';
  hateListCache = [];
  renderHateList();
}

// 관심없음 모달 닫기
function closeHateModal() {
  document.getElementById('hate-modal').style.display = 'none';
  document.getElementById('hate-stat').classList.remove('active');
  hateListCache = [];
}

// 설정 로드
async function loadSettings() {
  const result = await chrome.storage.local.get(['settings']);
  return result.settings || { hideRated: false, hideHate: true };
}

// 설정 저장
async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
}

// 초기화
document.addEventListener('DOMContentLoaded', async () => {
  // 저장된 데이터 로드
  const rated = await loadData('rated_items');
  const wish = await loadData('wish_items');
  const hate = await loadData('hate_items');

  updateStats(
    rated.data.length,
    wish.data.length,
    hate.data.length,
    rated.updatedAt || wish.updatedAt
  );

  if (rated.data.length === 0 && wish.data.length === 0) {
    updateStatus('데이터가 없습니다. 수집하기를 눌러주세요.');
  } else {
    updateStatus('준비 완료');
  }

  // 설정 로드
  const settings = await loadSettings();
  const hideHateCheckbox = document.getElementById('hide-hate');
  const hideRatedCheckbox = document.getElementById('hide-rated');
  hideHateCheckbox.checked = settings.hideHate;
  hideRatedCheckbox.checked = settings.hideRated;

  // 설정 변경 이벤트
  const handleSettingChange = async (key, value) => {
    const s = await loadSettings();
    s[key] = value;
    await saveSettings(s);
  };
  hideHateCheckbox.addEventListener('change', e => handleSettingChange('hideHate', e.target.checked));
  hideRatedCheckbox.addEventListener('change', e => handleSettingChange('hideRated', e.target.checked));

  // 버튼 이벤트
  document.getElementById('collect-btn').addEventListener('click', collectData);
  document.getElementById('clear-wish-btn').addEventListener('click', clearAllWish);
  document.getElementById('hate-stat').addEventListener('click', openHateModal);
  document.getElementById('hate-modal-close').addEventListener('click', closeHateModal);
  document.getElementById('hate-modal').addEventListener('click', e => {
    if (e.target.id === 'hate-modal') closeHateModal();
  });
  document.getElementById('hate-search').addEventListener('input', e => {
    renderHateList(e.target.value);
  });
});
