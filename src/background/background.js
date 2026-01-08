// 확장 프로그램 아이콘 클릭 시 검색 페이지 열기
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/search/search.html') });
});
