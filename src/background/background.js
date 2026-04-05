// 확장 프로그램 아이콘 클릭 시 검색 페이지 열기
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/search/search.html') });
});

// ========== Cloud Sync (Google Drive) ==========

importScripts('/src/sync/drive-sync.js', '/src/sync/sync-engine.js');

// 30초 간격 자동 동기화 알람 설정
chrome.alarms.create('drive-sync', { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'drive-sync') {
    try {
      const result = await performSync(false);
      if (result.status === 'success') {
        console.log(`[Background Sync] 완료: ${result.itemCount}개 아이템`);
      }
    } catch (e) {
      // 로그인 안 된 상태면 무시
    }
  }
});

// 검색 페이지에서 수동 동기화 요청 처리
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PERFORM_SYNC') {
    performSync(message.interactive).then(sendResponse);
    return true;
  }
  if (message.type === 'CHECK_SIGN_IN') {
    isSignedIn().then(signedIn => sendResponse({ signedIn }));
    return true;
  }
  if (message.type === 'SIGN_OUT') {
    revokeAuthToken().then(() => sendResponse({ status: 'ok' }));
    return true;
  }
  if (message.type === 'PULL_FROM_CLOUD') {
    pullFromCloud().then(sendResponse);
    return true;
  }
  if (message.type === 'GET_SYNC_STATUS') {
    loadHateDataV2().then(data => {
      sendResponse({ lastSyncedAt: data.lastSyncedAt });
    });
    return true;
  }
});
