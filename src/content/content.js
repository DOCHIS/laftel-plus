// Laftel Plus - Content Script

// 저장된 데이터
let ratedItems = new Map();
let wishItems = new Map();
let hateItems = new Map();
let settings = { hideRated: false, hideHate: true };

// 마킹 제거 헬퍼
const clearMarkings = () => {
  document.querySelectorAll('[data-laftel-plus]').forEach(el => {
    el.removeAttribute('data-laftel-plus');
    el.classList.remove('laftel-plus-rated', 'laftel-plus-wish', 'laftel-plus-hate');
  });
  document.querySelectorAll('.laftel-plus-overlay, .laftel-plus-wish-btn, .laftel-plus-hate-btn').forEach(el => el.remove());
};

// 평가 버튼 클릭 감지 (증분 동기화)
function observeRatingClicks() {
  document.addEventListener('click', async (e) => {
    const ratingBtn = e.target.closest('.jJexfG');
    if (ratingBtn) setTimeout(() => incrementalSync(), 500);
  });
}

// 증분 동기화
async function incrementalSync() {
  const response = await chrome.runtime.sendMessage({ action: 'incrementalSync' });
  if (!response?.success) return;
  await loadStoredData();
  clearMarkings();
  processCards();
}

// 데이터 로드
async function loadStoredData() {
  const result = await chrome.storage.local.get(['rated_items', 'wish_items', 'hate_items', 'settings']);
  ratedItems.clear();
  wishItems.clear();
  hateItems.clear();
  (result.rated_items || []).forEach(item => ratedItems.set(item.id, item));
  (result.wish_items || []).forEach(item => wishItems.set(item.id, item));
  (result.hate_items || []).forEach(item => hateItems.set(item.id, item));
  settings = result.settings || { hideRated: false, hideHate: true };
  applySettings();
}

// 설정 적용 (body 클래스) - inventory 페이지에서는 숨기기 비활성화
function applySettings() {
  const isInventory = location.pathname.startsWith('/inventory');
  document.body.classList.toggle('laftel-plus-hide-rated', settings.hideRated && !isInventory);
  document.body.classList.toggle('laftel-plus-hide-hate', settings.hideHate && !isInventory);
}

// 카드에서 작품 ID 추출
function extractItemId(element) {
  const href = element.getAttribute('href');
  if (!href) return null;
  const match = href.match(/(?:modal|player)=(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

// API 토글 헬퍼
async function sendToggle(action, itemId, value) {
  const response = await chrome.runtime.sendMessage({ action, itemId, ...value });
  if (!response.success) throw new Error(response.error);
  return response.data;
}

// 토글 버튼 클릭 핸들러 생성
function createToggleHandler(action, itemsMap, storageKey, className, labels) {
  return async (e, cardElement, itemId) => {
    e.preventDefault();
    e.stopPropagation();
    const btn = e.currentTarget;
    const isActive = itemsMap.has(itemId);
    const newState = !isActive;

    btn.disabled = true;
    btn.classList.add('loading');

    try {
      await sendToggle(action, itemId, { [action === 'toggleWish' ? 'isWish' : 'isHate']: newState });
      if (newState) {
        itemsMap.set(itemId, { id: itemId });
        btn.classList.add('active');
        btn.title = labels.off;
        cardElement.classList.add(className);
      } else {
        itemsMap.delete(itemId);
        btn.classList.remove('active');
        btn.title = labels.on;
        cardElement.classList.remove(className);
      }
      await chrome.storage.local.set({ [storageKey]: Array.from(itemsMap.values()), [`${storageKey}_updated`]: Date.now() });
    } catch (error) {
      console.error(`[Laftel Plus] ${labels.error}:`, error);
      alert(`${labels.error}: ${error.message}`);
    } finally {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  };
}

const handleWishClick = createToggleHandler('toggleWish', wishItems, 'wish_items', 'laftel-plus-wish', { on: '보고싶다 추가', off: '보고싶다 해제', error: '보고싶다 토글 실패' });
const handleHateClick = createToggleHandler('toggleHate', hateItems, 'hate_items', 'laftel-plus-hate', { on: '관심 없음', off: '관심 없음 해제', error: '관심 없음 토글 실패' });

// 오버레이 생성 헬퍼
const createOverlay = (className, html) => {
  const overlay = document.createElement('div');
  overlay.className = `laftel-plus-overlay ${className}`;
  overlay.innerHTML = html;
  return overlay;
};

// 버튼 생성 헬퍼
const createBtn = (className, icon, title, handler) => {
  const btn = document.createElement('button');
  btn.className = className;
  btn.innerHTML = icon;
  btn.title = title;
  btn.addEventListener('click', handler);
  return btn;
};

// 카드에 상태 표시
function markCard(cardElement, itemId) {
  if (cardElement.dataset.laftelPlus) return;
  cardElement.dataset.laftelPlus = 'processed';

  const isRated = ratedItems.has(itemId);
  const isWish = wishItems.has(itemId);
  const isHate = hateItems.has(itemId);

  if (getComputedStyle(cardElement).position === 'static') cardElement.style.position = 'relative';

  if (isRated) {
    cardElement.classList.add('laftel-plus-rated');
    const ratedData = ratedItems.get(itemId);
    cardElement.appendChild(createOverlay('laftel-plus-rated-overlay', `<span class="laftel-plus-label">평가한 작품</span><span class="laftel-plus-badge">&#9733; ${ratedData.rating}</span>`));
  } else {
    if (isWish) {
      cardElement.classList.add('laftel-plus-wish');
      cardElement.appendChild(createOverlay('laftel-plus-wish-overlay', '<span class="laftel-plus-label">보고싶다</span>'));
    }
    if (isHate) {
      cardElement.classList.add('laftel-plus-hate');
      cardElement.appendChild(createOverlay('laftel-plus-hate-overlay', '<span class="laftel-plus-label">관심 없음</span>'));
    }
    cardElement.appendChild(createBtn('laftel-plus-hate-btn' + (isHate ? ' active' : ''), '&#128078;', isHate ? '관심 없음 해제' : '관심 없음', e => handleHateClick(e, cardElement, itemId)));
    cardElement.appendChild(createBtn('laftel-plus-wish-btn' + (isWish ? ' active' : ''), '&#10084;', isWish ? '보고싶다 해제' : '보고싶다 추가', e => handleWishClick(e, cardElement, itemId)));
  }
}

// 모든 카드 처리
function processCards() {
  document.querySelectorAll('a[href*="modal="], a[href*="player="]').forEach(card => {
    const itemId = extractItemId(card);
    if (itemId) markCard(card, itemId);
  });
}

// MutationObserver로 동적 로드 대응
function observeDOM() {
  const observer = new MutationObserver(mutations => {
    if (mutations.some(m => m.addedNodes.length > 0)) {
      clearTimeout(observeDOM.timeout);
      observeDOM.timeout = setTimeout(processCards, 100);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// SPA 페이지 이동 감지
function observeNavigation() {
  let lastUrl = location.href;
  const checkUrl = () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      applySettings(); // inventory 페이지 여부 재확인
      setTimeout(processCards, 200);
    }
  };
  window.addEventListener('popstate', checkUrl);
  const wrap = fn => function(...args) { fn.apply(this, args); checkUrl(); };
  history.pushState = wrap(history.pushState);
  history.replaceState = wrap(history.replaceState);
}

// 플로팅 버튼 생성
function createFloatingButton() {
  const btn = document.createElement('button');
  btn.id = 'laftel-plus-floating-btn';
  btn.className = 'laftel-plus-floating-btn';
  btn.innerHTML = '<span class="laftel-plus-floating-icon">&#8635;</span><span class="laftel-plus-floating-text"><span class="laftel-plus-floating-title">라프텔 Plus</span><span class="laftel-plus-floating-label">동기화</span></span>';
  btn.title = '평가/보고싶다 업데이트';
  btn.addEventListener('click', handleFloatingButtonClick);
  document.body.appendChild(btn);
}

// 플로팅 버튼 클릭 핸들러
async function handleFloatingButtonClick() {
  const btn = document.getElementById('laftel-plus-floating-btn');
  if (!btn || btn.disabled) return;

  btn.disabled = true;
  btn.classList.add('loading');

  try {
    const response = await chrome.runtime.sendMessage({ action: 'fullIncrementalSync' });
    if (!response?.success) throw new Error(response?.error || '동기화 실패');
    await loadStoredData();
    clearMarkings();
    processCards();
    btn.classList.add('success');
    setTimeout(() => btn.classList.remove('success'), 1000);
  } catch (error) {
    console.error('[Laftel Plus] 동기화 실패:', error);
    btn.classList.add('error');
    setTimeout(() => btn.classList.remove('error'), 1000);
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}

// 스토리지 변경 감지
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.settings) {
    settings = changes.settings.newValue || { hideRated: false, hideHate: true };
    applySettings();
  }
  if (changes.rated_items || changes.wish_items || changes.hate_items) {
    loadStoredData().then(() => { clearMarkings(); processCards(); });
  }
});

// 초기화
async function init() {
  await loadStoredData();
  observeRatingClicks();
  const setup = () => { createFloatingButton(); processCards(); observeNavigation(); observeDOM(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
}

init();
