// Laftel Plus - Sync Engine
// hate_items V2 데이터 모델 + CRDT-like 병합 알고리즘 + Google Drive 동기화 오케스트레이션

const TOMBSTONE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30일

// ========== V2 Data Model ==========

async function loadHateDataV2() {
  const result = await chrome.storage.local.get(['hate_items_v2']);

  if (result.hate_items_v2) {
    return result.hate_items_v2;
  }

  // V1 → V2 마이그레이션
  const v1Result = await chrome.storage.local.get(['hate_items', 'hate_items_updated']);
  const v1Data = v1Result.hate_items || [];
  const v1Timestamp = v1Result.hate_items_updated || Date.now();

  const v2 = {
    version: 2,
    lastSyncedAt: null,
    items: {},
    tombstones: {}
  };

  for (const item of v1Data) {
    v2.items[item.id] = {
      name: item.name,
      img: item.img,
      addedAt: v1Timestamp
    };
  }

  await chrome.storage.local.set({ hate_items_v2: v2 });
  return v2;
}

async function saveHateDataV2(data) {
  await chrome.storage.local.set({ hate_items_v2: data });

  // 레거시 hate_items 배열도 동기화 (기존 코드 호환)
  const legacyArray = Object.entries(data.items).map(([id, item]) => ({
    id: parseInt(id),
    name: item.name,
    img: item.img
  }));
  await chrome.storage.local.set({
    hate_items: legacyArray,
    hate_items_updated: Date.now()
  });
}

// ========== V2 Item Operations ==========

async function addHateItemV2(itemId, name, img) {
  const data = await loadHateDataV2();
  data.items[itemId] = { name, img, addedAt: Date.now() };
  delete data.tombstones[itemId]; // tombstone 제거 (재추가)
  await saveHateDataV2(data);
}

async function removeHateItemV2(itemId) {
  const data = await loadHateDataV2();
  delete data.items[itemId];
  data.tombstones[itemId] = Date.now();
  await saveHateDataV2(data);
}

// ========== Merge Algorithm ==========

function mergeHateData(local, remote) {
  const merged = {
    version: 2,
    lastSyncedAt: Date.now(),
    items: {},
    tombstones: {}
  };

  // 1. tombstones 합집합 (최신 타임스탬프 우선)
  const allTombstoneIds = new Set([
    ...Object.keys(local.tombstones || {}),
    ...Object.keys(remote.tombstones || {})
  ]);
  for (const id of allTombstoneIds) {
    const localTs = (local.tombstones || {})[id] || 0;
    const remoteTs = (remote.tombstones || {})[id] || 0;
    merged.tombstones[id] = Math.max(localTs, remoteTs);
  }

  // 2. items 합집합 (최신 addedAt 우선, tombstone 보다 새로운 것만 살림)
  const allItemIds = new Set([
    ...Object.keys(local.items || {}),
    ...Object.keys(remote.items || {})
  ]);
  for (const id of allItemIds) {
    const localItem = (local.items || {})[id];
    const remoteItem = (remote.items || {})[id];
    const tombstoneTs = merged.tombstones[id] || 0;

    // 더 최신 addedAt을 가진 아이템 선택
    let bestItem;
    if (!localItem) bestItem = remoteItem;
    else if (!remoteItem) bestItem = localItem;
    else bestItem = remoteItem.addedAt > localItem.addedAt ? remoteItem : localItem;

    // 아이템이 tombstone보다 새로우면 살아남음
    if (bestItem.addedAt > tombstoneTs) {
      merged.items[id] = bestItem;
    }
  }

  // 3. 오래된 tombstone 정리 (30일 초과)
  const cutoff = Date.now() - TOMBSTONE_MAX_AGE_MS;
  for (const [id, ts] of Object.entries(merged.tombstones)) {
    if (ts < cutoff) {
      delete merged.tombstones[id];
    }
  }

  return merged;
}

// ========== Sync Orchestration ==========

let syncInProgress = false;

async function performSync(interactive = false) {
  if (syncInProgress) return { status: 'already_syncing' };
  syncInProgress = true;

  try {
    // 1. 토큰 획득
    let token;
    try {
      token = await getAuthToken(interactive);
    } catch (e) {
      if (!interactive) return { status: 'not_signed_in' };
      throw e;
    }

    // 2. 로컬 데이터 로드
    const localData = await loadHateDataV2();

    // 3. 원격 데이터 읽기
    const fileInfo = await findSyncFile(token);
    let remoteData = null;
    if (fileInfo) {
      try {
        remoteData = await readSyncFile(token, fileInfo.id);
      } catch (e) {
        console.warn('[Sync] 원격 데이터 읽기 실패, 로컬 데이터로 덮어쓰기:', e);
      }
    }

    // 4. 병합
    let merged;
    if (!remoteData || !remoteData.version) {
      merged = { ...localData, lastSyncedAt: Date.now() };
    } else {
      merged = mergeHateData(localData, remoteData);
    }

    // 5. Drive에 쓰기
    await writeSyncFile(token, fileInfo?.id, merged);

    // 6. 로컬에 저장
    await saveHateDataV2(merged);

    const itemCount = Object.keys(merged.items).length;
    console.log(`[Sync] 완료: ${itemCount}개 아이템`);
    return { status: 'success', itemCount };
  } catch (error) {
    console.error('[Sync] 실패:', error);
    return { status: 'error', error: error.message };
  } finally {
    syncInProgress = false;
  }
}

// ========== Pull from Cloud ==========

async function pullFromCloud() {
  try {
    const token = await getAuthToken(false);
    const fileInfo = await findSyncFile(token);
    if (!fileInfo) {
      return { status: 'empty' };
    }
    const remoteData = await readSyncFile(token, fileInfo.id);
    if (remoteData && remoteData.version) {
      await saveHateDataV2(remoteData);
      return { status: 'success', itemCount: Object.keys(remoteData.items).length };
    }
    return { status: 'empty' };
  } catch (e) {
    return { status: 'error', error: e.message };
  }
}

// ========== Debounced Sync ==========

let syncDebounceTimer = null;

function debouncedSync() {
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    performSync(false);
    syncDebounceTimer = null;
  }, 5000);
}
