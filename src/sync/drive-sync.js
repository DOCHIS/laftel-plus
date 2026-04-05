// Laftel Plus - Google Drive appData Sync
// Google Drive API를 직접 fetch()로 호출 (SDK 불필요)
console.log('[drive-sync.js] 로드됨');

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const SYNC_FILENAME = 'laftel-plus-hate-items.json';

// ========== Authentication ==========

async function getAuthToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!token) {
        reject(new Error('토큰을 가져올 수 없습니다'));
      } else {
        resolve(token);
      }
    });
  });
}

async function revokeAuthToken() {
  try {
    const token = await getAuthToken(false);
    if (token) {
      await fetch('https://accounts.google.com/o/oauth2/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `token=${token}`
      });
      return new Promise((resolve) => {
        chrome.identity.removeCachedAuthToken({ token }, resolve);
      });
    }
  } catch (e) {
    // 토큰이 없으면 무시
  }
}

async function isSignedIn() {
  try {
    await getAuthToken(false);
    return true;
  } catch {
    return false;
  }
}

// ========== Drive File Operations ==========

async function driveApiFetch(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers
    }
  });

  if (response.status === 401) {
    // 토큰 만료 — 캐시에서 제거 후 재시도
    await new Promise(resolve => chrome.identity.removeCachedAuthToken({ token }, resolve));
    throw new Error('AUTH_EXPIRED');
  }

  if (!response.ok) {
    throw new Error(`Drive API 오류: ${response.status}`);
  }

  return response;
}

async function findSyncFile(token) {
  const response = await driveApiFetch(
    `${DRIVE_API}/files?spaces=appDataFolder&q=name%3D'${SYNC_FILENAME}'&fields=files(id,modifiedTime)`,
    token
  );
  const data = await response.json();
  return data.files?.[0] || null;
}

async function readSyncFile(token, fileId) {
  const response = await driveApiFetch(
    `${DRIVE_API}/files/${fileId}?alt=media`,
    token
  );
  return response.json();
}

async function writeSyncFile(token, fileId, data) {
  const jsonBody = JSON.stringify(data);

  if (fileId) {
    // 기존 파일 업데이트
    await driveApiFetch(
      `${DRIVE_UPLOAD_API}/files/${fileId}?uploadType=media`,
      token,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: jsonBody
      }
    );
  } else {
    // 새 파일 생성 (appDataFolder)
    const metadata = JSON.stringify({
      name: SYNC_FILENAME,
      parents: ['appDataFolder']
    });

    const boundary = '---laftelplus' + Date.now();
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      metadata,
      `--${boundary}`,
      'Content-Type: application/json',
      '',
      jsonBody,
      `--${boundary}--`
    ].join('\r\n');

    await driveApiFetch(
      `${DRIVE_UPLOAD_API}/files?uploadType=multipart`,
      token,
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body
      }
    );
  }
}
