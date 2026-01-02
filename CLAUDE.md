# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

Laftel Plus는 라프텔 애니메이션 스트리밍 사이트(laftel.net)를 개선하는 Chrome 확장 프로그램(Manifest V3)이다. 사용자의 평가/보고싶다/관심없음 상태에 따라 작품 카드를 시각적으로 표시하고, 빠른 액션 버튼을 제공한다.

## 개발 방법

빌드 시스템 없는 바닐라 JavaScript 확장 프로그램이다. 테스트 방법:

1. Chrome에서 `chrome://extensions/` 열기
2. "개발자 모드" 활성화
3. "압축해제된 확장 프로그램을 로드합니다" 클릭 후 이 디렉토리 선택

## 아키텍처

### 3계층 구조

**Background Service Worker** ([src/background/background.js](src/background/background.js))

- 라프텔 API 통신 담당
- `at_amss-Co` 쿠키에서 인증 토큰 추출
- Content Script에 메시지 기반 API 제공
- 액션: `toggleWish`, `toggleHate`, `incrementalSync`, `fullIncrementalSync`

**Content Script** ([src/content/content.js](src/content/content.js))

- 작품 카드에 UI 오버레이/버튼 삽입 (선택자: `a[href*="modal="]`, `a[href*="player="]`)
- 동적 콘텐츠 대응을 위한 MutationObserver 사용
- SPA 네비게이션 감지를 위해 History API 오버라이드
- Map으로 로컬 상태 관리 (`ratedItems`, `wishItems`, `hateItems`)
- 플로팅 동기화 버튼 (좌측 하단)

**Popup** ([src/popup/](src/popup/))

- 페이지네이션 API 호출로 평가/보고싶다 목록 전체 동기화
- 보고싶다 전체 해제 기능
- 관심없음 목록 모달 (검색, 개별 해제, 장르/연령 표시)
- 설정: 관심없는 작품 숨기기(기본 ON), 평가한 작품 숨기기

### 관심없음 데이터

관심없음 상태는 확장 프로그램 로컬 스토리지에만 저장되며, 라프텔 사이트에서 확인할 수 있는 페이지가 없다. Popup에서 목록 확인 및 해제 가능.

### 데이터 흐름

1. Popup/플로팅버튼이 라프텔 API에서 데이터 수집 → `chrome.storage.local`에 저장
2. Content Script가 스토리지에서 읽어 → 카드에 오버레이/버튼 표시
3. 카드에서 버튼 클릭 또는 라프텔 평가 시 → Background Worker 통해 증분 동기화
4. 스토리지 변경 시 → `chrome.storage.onChanged`로 Content Script에 알림

### 주요 CSS 클래스

- `.laftel-plus-rated` / `.laftel-plus-wish` / `.laftel-plus-hate` - 상태별 카드 마킹
- `.laftel-plus-overlay` - 오버레이 컨테이너
- `.laftel-plus-wish-btn` / `.laftel-plus-hate-btn` - 액션 버튼
- `.laftel-plus-hide-rated` / `.laftel-plus-hide-hate` - body 클래스 (설정 기반 숨기기, `/inventory` 페이지 제외)

### 작품 정보 캐시

`item_cache` 스토리지에 작품 ID별 정보 저장:

- `id`, `name`, `img` - 기본 정보
- `genre` - 장르 배열 (예: `["판타지", "액션"]`)
- `medium` - 매체 (예: `"TVA"`, `"MOVIE"`)
- `rating` - 연령 등급 숫자 (12, 15, 19 또는 null=전체)

평가/보고싶다 수집 시 자동 업데이트. 관심없음 목록 표시 시 캐시에서 조회하고, 없으면 `/api/items/v4/{id}/` API로 fallback.

### 연령 등급 색상

관심없음 모달에서 연령 배지 색상:

- 전체(rall): 초록 `#22c55e`
- 12세(r12): 파랑 `#3b82f6`
- 15세(r15): 주황 `#f59e0b`
- 19세(r19): 빨강 `#ef4444`

### 라프텔 API 엔드포인트

- `GET /api/reviews/v1/my_ratings/?sorting=add` - 평가한 작품 목록
- `GET /api/items/v1/wish_item/?sorting=add` - 보고싶다 목록
- `GET /api/items/v4/{id}/` - 개별 작품 정보 (캐시 fallback용)
- `POST /api/v1.0/items/{id}/rate/` - 토글 (`{is_wish: bool}` 또는 `{is_hate: bool}`)

### 증분 동기화 로직

마지막 동기화된 아이템 ID(`rated_last_id`, `wish_last_id`)를 저장하고, 해당 ID가 나올 때까지 페이지네이션하여 새 항목만 가져온다. 최대 10페이지(250개) 제한.
