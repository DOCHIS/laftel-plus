# 라프텔 플러스

<p align="center">
  <img src="docs/프로모션.png" alt="라프텔 플러스" width="640">
</p>

<p align="center">
  <strong>라프텔에서 새로운 애니메이션을 더 편리하게 찾아보세요</strong><br>
  평가한 작품과 관심없음을 자동으로 제외하고 취향에 맞는 작품을 검색하세요.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-Extension-4285F4?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome Extension">
  <img src="https://img.shields.io/badge/Manifest-V3-00C853?style=flat-square" alt="Manifest V3">
  <img src="https://img.shields.io/badge/Version-1.1.0-816BFF?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License">
</p>

<p align="center">
  <a href="#-주요-기능">주요 기능</a> •
  <a href="#-설치-방법">설치</a> •
  <a href="#-사용-방법">사용법</a> •
  <a href="#-개발">개발</a>
</p>

---

## ✨ 주요 기능

### 🔍 전용 검색 페이지

확장 프로그램 아이콘 클릭 시 전용 검색 페이지가 열립니다.

- 장르, 태그, 연도, 방영상태 등 다양한 필터
- 무한 스크롤로 편리한 탐색
- 카드 클릭 시 상세 정보 사이드바

### 🎯 확장 프로그램 전용 필터

| 필터 | 설명 |
|------|------|
| 평가한 작품 제외 | 이미 평가한 작품을 목록에서 숨김 |
| 관심없음 제외 | 관심없음으로 표시한 작품 숨김 (기본 ON) |

### 🚀 빠른 액션 버튼

작품 카드에서 바로 상태 변경:

- ✕ 관심없음 토글
- ♡ 보고싶다 토글

### 📋 관심없음 관리

라프텔에서 제공하지 않는 관심없음 목록을 확장 프로그램에서 관리합니다.

- 목록 검색 및 개별 해제
- 장르/연령등급 표시
- 백업/복원 기능 (base64)

### 🔄 데이터 동기화

라프텔에서 평가한 작품과 보고싶다 목록을 수집하여 필터링에 활용합니다.

---

## 📦 설치 방법

### Chrome 웹 스토어

> 🚧 출시 예정

### 수동 설치

1. [Releases](../../releases)에서 최신 버전 다운로드
2. 압축 해제
3. Chrome에서 `chrome://extensions/` 열기
4. **개발자 모드** 활성화
5. **압축해제된 확장 프로그램을 로드합니다** 클릭 후 폴더 선택

---

## 🎮 사용 방법

```text
1️⃣  확장 프로그램 설치 후 라프텔에 로그인
2️⃣  툴바의 확장 프로그램 아이콘 클릭 → 검색 페이지 열림
3️⃣  "데이터 수집" 버튼을 클릭하여 평가/보고싶다 목록 수집
4️⃣  필터를 설정하고 새로운 애니메이션을 찾아보세요
```

---

## 🛠 개발

### 요구사항

- Node.js 18+

### 설치 및 빌드

```bash
# 의존성 설치
npm install

# 빌드 (dist/laftel-plus-{version}.zip 생성)
npm run build

# 정리
npm run clean
```

### 개발 모드

1. `chrome://extensions/` 열기
2. 개발자 모드 활성화
3. 압축해제된 확장 프로그램을 로드합니다 → 프로젝트 폴더 선택
4. 코드 수정 후 확장 프로그램 새로고침

---

## 🔒 권한 안내

| 권한 | 용도 |
|-----|------|
| `storage` | 평가/보고싶다/관심없음 데이터 및 설정 저장 |
| `cookies` | 라프텔 로그인 상태 확인 및 API 인증 |
| `host_permissions` | laftel.net API 호출 |

> 💡 모든 데이터는 브라우저 로컬 스토리지에만 저장되며, 외부 서버로 전송되지 않습니다.

---

## 📄 라이선스

MIT License

---

<p align="center">
  <sub>이 확장 프로그램은 라프텔 공식 서비스가 아닙니다.</sub>
</p>
