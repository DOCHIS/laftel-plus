# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

Laftel Plus는 라프텔 애니메이션 스트리밍 사이트(laftel.net)를 위한 Chrome 확장 프로그램(Manifest V3)이다. 자체 검색 페이지를 통해 평가/보고싶다/관심없음 상태를 필터링하여 새로운 애니메이션을 찾을 수 있다. Google Drive를 통한 클라우드 동기화로 멀티 디바이스에서 관심없음 목록을 유지할 수 있다.

## 개발 방법

바닐라 JavaScript 확장 프로그램이다. 테스트 방법:

1. Chrome에서 `chrome://extensions/` 열기
2. "개발자 모드" 활성화
3. "압축해제된 확장 프로그램을 로드합니다" 클릭 후 이 디렉토리 선택

빌드: `npm run build` → `dist/laftel-plus-{version}.zip` 생성

## 아키텍처

### 파일 구조

```
src/
├── background/
│   └── background.js    # 아이콘 클릭, 클라우드 동기화 알람/메시지 핸들링
├── content/
│   ├── content.js       # /finder 페이지 안내 모달
│   └── content.css
├── sync/
│   ├── drive-sync.js    # Google Drive API 래퍼 (인증, 파일 CRUD)
│   └── sync-engine.js   # V2 데이터 모델, CRDT 병합, 동기화 오케스트레이션
└── search/
    ├── search.html      # 메인 검색 페이지
    ├── search.js        # 검색 로직, 필터, API 통신, 동기화 UI
    └── search.css
```

### Background Service Worker ([src/background/background.js](src/background/background.js))

- 확장 프로그램 아이콘 클릭 시 검색 페이지를 새 탭으로 열기
- `importScripts`로 sync 모듈 로드
- `chrome.alarms`로 30초 간격 자동 클라우드 동기화
- `chrome.runtime.onMessage`로 검색 페이지의 동기화 요청 처리 (PERFORM_SYNC, CHECK_SIGN_IN, SIGN_OUT, PULL_FROM_CLOUD, GET_SYNC_STATUS)

### Content Script ([src/content/content.js](src/content/content.js))

- `/finder` 페이지에서만 실행 (modal 파라미터 없을 때)
- "라프텔 Plus에서 더 편리하게 검색하세요" 안내 모달 표시
- 하루에 한 번만 표시 (localStorage로 dismiss 상태 저장)

### Sync Module ([src/sync/](src/sync/))

**drive-sync.js**: Google Drive appData API 래퍼
- `getAuthToken(interactive)` — `chrome.identity.getAuthToken()` 래퍼
- `isSignedIn()` — 로그인 상태 확인
- `revokeAuthToken()` — 로그아웃
- `findSyncFile(token)` — appDataFolder에서 동기화 파일 검색
- `readSyncFile(token, fileId)` — 파일 읽기
- `writeSyncFile(token, fileId, data)` — 파일 생성/업데이트

**sync-engine.js**: 동기화 엔진
- `loadHateDataV2()` / `saveHateDataV2(data)` — V2 데이터 로드/저장 (V1 마이그레이션 포함)
- `mergeHateData(local, remote)` — CRDT-like 병합 알고리즘
- `performSync(interactive)` — 전체 동기화 흐름 (로드 → 읽기 → 병합 → 쓰기 → 저장)
- `pullFromCloud()` — 클라우드 데이터로 로컬 덮어쓰기

### Search Page ([src/search/](src/search/))

**메인 기능:**
- 좌측 사이드바: 필터 옵션 (장르, 태그, 연도, 방영상태, 정렬)
- 우측 콘텐츠: 카드 그리드 + 무한 스크롤
- 상세 사이드바: 카드 클릭 시 iframe으로 라프텔 상세 페이지 표시
- 설정 드롭다운: 타이틀 옆 ⚙ 버튼 → 데이터 동기화, 내 데이터 관리, 클라우드 동기화

**확장 프로그램 전용 필터:**
- 평가한 작품 제외
- 관심없음 제외 (기본 ON)

**카드 액션 버튼:**
- ✕ 관심없음 토글
- ♡ 보고싶다 토글

**통합 기능:**
- 데이터 수집(동기화) - 라프텔에서 평가/보고싶다 목록 수집
- 관심없음 목록 관리 모달 (작품수 배지 표시)
- 보고싶다 전체 해제
- 클라우드 동기화 (Google Drive) - 로그인/로그아웃, 수동 동기화, 불러오기
- 클라우드 동기화 (Google Drive) - 로그인/로그아웃, 수동 동기화, 클라우드에서 불러오기

### 데이터 저장

`chrome.storage.local` 사용:

| 키 | 내용 |
|---|------|
| `rated_items` | 평가한 작품 배열 `[{id, name, img, rating}]` |
| `wish_items` | 보고싶다 배열 `[{id, name, img}]` |
| `hate_items` | 관심없음 배열 `[{id, name, img}]` (레거시, V2와 동기화) |
| `hate_items_v2` | 관심없음 V2 `{version, lastSyncedAt, items: {id: {name, img, addedAt}}, tombstones: {id: timestamp}}` |
| `settings` | 설정 `{hideRated, hideHate}` |
| `filters` | 필터 상태 `{sort, genres, tags, years, ...}` |
| `item_cache` | 작품 정보 캐시 `{[id]: {name, img, genre, ...}}` |

### 클라우드 동기화 (Google Drive appData)

- Google Drive `appDataFolder`에 `laftel-plus-hate-items.json` 파일로 저장
- `drive.appdata` 스코프만 사용 (유저 파일 접근 불가)
- CRDT-like 병합: tombstone 기반으로 추가/삭제/재추가 안전 수렴
- 30초 간격 자동 동기화 (`chrome.alarms`)
- hate 변경 시 5초 debounce 후 자동 동기화
- 검색 페이지 → `chrome.runtime.sendMessage` → background service worker에서 처리

### 라프텔 API 엔드포인트

| 용도 | 메서드 | URL |
|------|--------|-----|
| 필터 옵션 | GET | `/api/v1.0/info/discover/` |
| 작품 목록 | GET | `/api/search/v1/discover/?sort=rank&viewable=true&offset=0&size=100` |
| 평가 목록 | GET | `/api/reviews/v1/my_ratings/?sorting=add` |
| 보고싶다 목록 | GET | `/api/items/v1/wish_item/?sorting=add` |
| 작품 상세 | GET | `/api/items/v4/{id}/` |
| 토글 | POST | `/api/v1.0/items/{id}/rate/` - `{is_wish: bool}` 또는 `{is_hate: bool}` |

### 인증

- **라프텔**: `chrome.cookies.get()`으로 `at_amss-Co` 쿠키에서 토큰 추출, `Authorization: Token {token}` 헤더
- **Google Drive**: `chrome.identity.getAuthToken()`으로 OAuth 토큰, `Authorization: Bearer {token}` 헤더

### 연령 등급 색상

| 등급 | 클래스 | 색상 |
|------|--------|------|
| 전체 | `rall` | `#22c55e` |
| 12세 | `r12` | `#3b82f6` |
| 15세 | `r15` | `#f59e0b` |
| 19세 | `r19` | `#ef4444` |
