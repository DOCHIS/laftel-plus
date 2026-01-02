// Background service worker
const API_BASE = 'https://api.laftel.net';

// 토큰 가져오기
const getToken = async () => {
  const cookie = await chrome.cookies.get({ url: 'https://laftel.net', name: 'at_amss-Co' });
  if (!cookie) throw new Error('로그인이 필요합니다.');
  return cookie.value;
};

// API 호출 헬퍼
const api = async (endpoint, body = null) => {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : null
  });
  if (!res.ok) throw new Error(`API 오류: ${res.status}`);
  return res.json();
};

// 증분 동기화 헬퍼
const incrementalSyncHelper = async (endpoint, storageKey, mapper) => {
  const token = await getToken();
  const stored = await chrome.storage.local.get([storageKey, `${storageKey.replace('_items', '')}_last_id`]);
  const existingItems = stored[storageKey] || [];
  const lastIdKey = `${storageKey.replace('_items', '')}_last_id`;
  const lastId = stored[lastIdKey] || null;
  const existingIds = new Set(existingItems.map(i => i.id));

  const newItems = [];
  let offset = 0, foundLastId = false, firstItemId = null;

  while (!foundLastId) {
    const res = await fetch(`${API_BASE}${endpoint}&offset=${offset}&limit=25`, {
      headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error(`API 오류: ${res.status}`);

    const data = await res.json();
    if (!data.results.length) break;

    for (const r of data.results) {
      if (!firstItemId) firstItemId = r.item.id;
      if (lastId && r.item.id === lastId) { foundLastId = true; break; }
      newItems.push(mapper(r));
    }

    if (!lastId || offset >= 225) break; // 첫 동기화거나 최대 10페이지
    offset += 25;
  }

  const itemsToAdd = newItems.filter(i => !existingIds.has(i.id));
  const updatedItems = existingItems.map(e => newItems.find(n => n.id === e.id) || e);
  const mergedItems = [...itemsToAdd, ...updatedItems];

  await chrome.storage.local.set({
    [storageKey]: mergedItems,
    [`${storageKey}_updated`]: Date.now(),
    [lastIdKey]: firstItemId || lastId
  });

  return { added: itemsToAdd.length, total: mergedItems.length };
};

// 평가 증분 동기화
const incrementalSync = () => incrementalSyncHelper(
  '/api/reviews/v1/my_ratings/?sorting=add',
  'rated_items',
  r => ({ id: r.item.id, name: r.item.name, img: r.item.img, rating: r.value, avgRating: r.item.avg_rating })
);

// 보고싶다 증분 동기화
const incrementalWishSync = () => incrementalSyncHelper(
  '/api/items/v1/wish_item/?sorting=add',
  'wish_items',
  r => ({ id: r.item.id, name: r.item.name, img: r.item.img, avgRating: r.item.avg_rating })
);

// 전체 증분 동기화
const fullIncrementalSync = async () => ({
  rated: await incrementalSync(),
  wish: await incrementalWishSync()
});

// 토글 API
const toggleRate = (itemId, payload) => api(`/api/v1.0/items/${itemId}/rate/`, payload);

// 메시지 핸들러
const handlers = {
  toggleWish: r => toggleRate(r.itemId, { is_wish: r.isWish }),
  toggleHate: r => toggleRate(r.itemId, { is_hate: r.isHate }),
  incrementalSync,
  fullIncrementalSync
};

chrome.runtime.onMessage.addListener((req, _, res) => {
  const handler = handlers[req.action];
  if (handler) {
    handler(req).then(data => res({ success: true, data })).catch(e => res({ success: false, error: e.message }));
    return true;
  }
});
