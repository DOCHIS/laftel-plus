// Laftel Plus - Content Script
// /finder 페이지에서만 실행되며, 라프텔 Plus 검색 페이지 안내 팝업 표시

(function() {
  'use strict';

  // 이미 표시했는지 확인하는 키
  const BANNER_DISMISS_KEY = 'laftel_plus_banner_dismissed';

  // 오늘 날짜 문자열
  function getTodayString() {
    return new Date().toISOString().split('T')[0];
  }

  // 배너를 이미 닫았는지 확인
  function wasBannerDismissedToday() {
    const dismissed = localStorage.getItem(BANNER_DISMISS_KEY);
    return dismissed === getTodayString();
  }

  // 배너 닫힘 기록
  function markBannerDismissed() {
    localStorage.setItem(BANNER_DISMISS_KEY, getTodayString());
  }

  // 안내 모달 생성
  function createBanner() {
    // 이미 닫았으면 표시하지 않음
    if (wasBannerDismissedToday()) {
      return;
    }

    // 모달이 이미 있으면 생성하지 않음
    if (document.getElementById('laftel-plus-modal')) {
      return;
    }

    const modal = document.createElement('div');
    modal.id = 'laftel-plus-modal';
    modal.innerHTML = `
      <div class="laftel-plus-modal-content">
        <button class="laftel-plus-modal-close" id="laftel-plus-close">&times;</button>
        <div class="laftel-plus-modal-icon">✨</div>
        <h2 class="laftel-plus-modal-title">라프텔 Plus에서<br>더 편리하게 검색하세요!</h2>
        <p class="laftel-plus-modal-desc">평가한 작품과 관심없음을 자동으로 제외하고<br>취향에 맞는 애니메이션을 찾아보세요.</p>
        <button class="laftel-plus-modal-btn" id="laftel-plus-open">검색 페이지 열기</button>
      </div>
    `;

    document.body.appendChild(modal);

    // 검색 페이지 열기 버튼
    document.getElementById('laftel-plus-open').addEventListener('click', () => {
      const searchUrl = chrome.runtime.getURL('src/search/search.html');
      window.open(searchUrl, '_blank');
      modal.remove();
      markBannerDismissed();
    });

    // 닫기 버튼
    document.getElementById('laftel-plus-close').addEventListener('click', () => {
      modal.remove();
      markBannerDismissed();
    });

    // 배경 클릭으로 닫기
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
        markBannerDismissed();
      }
    });
  }

  // DOM 로드 후 실행
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createBanner);
  } else {
    // 약간의 지연을 두고 배너 표시 (페이지 렌더링 후)
    setTimeout(createBanner, 500);
  }
})();
