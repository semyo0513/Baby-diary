/**
 * main.js - 앱 부트스트랩 및 탭 내비게이션 라우터
 */

import { store } from './store.js';
import { isAuthenticated, loginWithPin, flushOutbox } from './api.js';
import { CONFIG } from '../config.js';
import { renderHomeView } from './views/home.js';
import { renderCalendarView } from './views/calendar.js';
import { openEntrySheet } from './views/entrySheet.js';
import { renderCubesView } from './views/cubes.js';
import { renderIngredientsView } from './views/ingredients.js';
import { renderSettingsView } from './views/settings.js';
import { openSheet, closeSheet } from './ui/sheet.js';
import { showToast } from './ui/toast.js';

let activeMoreSubTab = 'ingredients'; // 'ingredients' | 'settings'

function initApp() {
  // 서비스 워커 등록
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      console.log('[SW] Service Worker 등록 성공:', reg.scope);
    }).catch(err => {
      console.warn('[SW] Service Worker 등록 실패:', err);
    });
  }

  // 탭 클릭 이벤트 바인딩
  const tabHome = document.getElementById('tab-home');
  const tabCal = document.getElementById('tab-calendar');
  const tabPlus = document.getElementById('tab-plus');
  const tabCubes = document.getElementById('tab-cubes');
  const tabMore = document.getElementById('tab-more');
  const btnSync = document.getElementById('btn-sync');

  if (tabHome) tabHome.onclick = () => store.setTab('home');
  if (tabCal) tabCal.onclick = () => store.setTab('calendar');
  if (tabPlus) tabPlus.onclick = () => openEntrySheet();
  if (tabCubes) tabCubes.onclick = () => store.setTab('cubes');
  if (tabMore) tabMore.onclick = () => store.setTab('more');

  if (btnSync) {
    btnSync.onclick = async () => {
      btnSync.classList.add('spinning');
      showToast('구글 드라이브와 동기화 중...', 'info', 1500);
      try {
        await flushOutbox();
        await store.refreshData();
        showToast('구글 드라이브 동기화 완료!', 'success');
      } catch (err) {
        showToast('동기화 실패: ' + err.message, 'error');
      } finally {
        btnSync.classList.remove('spinning');
      }
    };
  }

  // 스토어 변경 구독
  store.subscribe(state => {
    updateHeader(state);
    updateTabActive(state.currentTab);
    renderCurrentTab(state);
  });

  // 온라인 / 오프라인 감지
  window.addEventListener('online', async () => {
    showToast('네트워크에 연결되었습니다. 동기화를 진행합니다.', 'info');
    await flushOutbox();
    await store.refreshData();
  });

  window.addEventListener('offline', () => {
    showToast('오프라인 모드로 전환되었습니다. 작성한 내용은 로컬에 저장됩니다.', 'info');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      flushOutbox();
      store.refreshData();
    }
  });

  // 초기 렌더링
  const initial = store.getState();
  updateHeader(initial);
  updateTabActive(initial.currentTab);
  renderCurrentTab(initial);

  // 인증 체크
  if (CONFIG.GAS_URL && !isAuthenticated()) {
    openPinModal();
  } else {
    store.refreshData();
  }
}

function updateHeader(state) {
  const statusEl = document.getElementById('header-sync-status');
  if (!statusEl) return;

  if (!navigator.onLine || state.syncStatus === 'offline') {
    statusEl.textContent = '● 오프라인';
    statusEl.className = 'header-status-badge offline';
  } else if (state.syncStatus === 'syncing') {
    statusEl.textContent = '↻ 동기화 중...';
    statusEl.className = 'header-status-badge';
  } else if (state.syncStatus === 'local') {
    statusEl.textContent = '● 로컬 모드';
    statusEl.className = 'header-status-badge';
  } else {
    statusEl.textContent = '● 동기화됨';
    statusEl.className = 'header-status-badge';
  }
}

function updateTabActive(currentTab) {
  const tabs = ['home', 'calendar', 'cubes', 'more'];
  tabs.forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (el) {
      if (t === currentTab) el.classList.add('active');
      else el.classList.remove('active');
    }
  });
}

function renderCurrentTab(state) {
  const container = document.getElementById('main-content');
  if (!container) return;

  switch (state.currentTab) {
    case 'home':
      renderHomeView(container);
      break;
    case 'calendar':
      renderCalendarView(container);
      break;
    case 'cubes':
      renderCubesView(container);
      break;
    case 'more':
      renderMoreTabs(container);
      break;
    default:
      renderHomeView(container);
      break;
  }
}

function renderMoreTabs(container) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  // 상단 서브 탭 (재료 관리 / 앱 설정)
  const subNav = document.createElement('div');
  subNav.style.display = 'flex';
  subNav.style.gap = '8px';
  subNav.style.marginBottom = '14px';

  const ingBtn = document.createElement('button');
  ingBtn.type = 'button';
  ingBtn.className = `btn btn-sm ${activeMoreSubTab === 'ingredients' ? 'btn-primary' : 'btn-outline'}`;
  ingBtn.style.flex = '1';
  ingBtn.textContent = '🥗 재료 관리';
  ingBtn.onclick = () => {
    activeMoreSubTab = 'ingredients';
    renderMoreTabs(container);
  };

  const setBtn = document.createElement('button');
  setBtn.type = 'button';
  setBtn.className = `btn btn-sm ${activeMoreSubTab === 'settings' ? 'btn-primary' : 'btn-outline'}`;
  setBtn.style.flex = '1';
  setBtn.textContent = '⚙️ 설정 및 인증';
  setBtn.onclick = () => {
    activeMoreSubTab = 'settings';
    renderMoreTabs(container);
  };

  subNav.appendChild(ingBtn);
  subNav.appendChild(setBtn);
  container.appendChild(subNav);

  const subContainer = document.createElement('div');
  container.appendChild(subContainer);

  if (activeMoreSubTab === 'ingredients') {
    renderIngredientsView(subContainer);
  } else {
    renderSettingsView(subContainer);
  }
}

export function openPinModal() {
  const wrap = document.createElement('div');
  wrap.className = 'pin-modal-content';
  wrap.style.padding = '8px 4px';

  const title = document.createElement('div');
  title.style.fontSize = '1.15rem';
  title.style.fontWeight = '700';
  title.style.marginBottom = '8px';
  title.textContent = '🔐 이유식 앱 로그인';
  wrap.appendChild(title);

  const desc = document.createElement('div');
  desc.style.fontSize = '0.85rem';
  desc.style.color = 'var(--text-muted)';
  desc.style.marginBottom = '16px';
  desc.textContent = '편집용 또는 조회용 PIN 번호를 입력하세요.';
  wrap.appendChild(desc);

  const pinInput = document.createElement('input');
  pinInput.type = 'password';
  pinInput.inputMode = 'numeric';
  pinInput.pattern = '[0-9]*';
  pinInput.className = 'form-input';
  pinInput.placeholder = 'PIN 번호 입력';
  pinInput.style.textAlign = 'center';
  pinInput.style.fontSize = '1.4rem';
  pinInput.style.letterSpacing = '6px';
  pinInput.style.marginBottom = '16px';
  wrap.appendChild(pinInput);

  const loginBtn = document.createElement('button');
  loginBtn.type = 'button';
  loginBtn.className = 'btn btn-primary btn-block';
  loginBtn.textContent = '로그인';

  loginBtn.onclick = async () => {
    const pin = pinInput.value.trim();
    if (!pin) {
      showToast('PIN을 입력해주세요.', 'error');
      return;
    }

    try {
      loginBtn.disabled = true;
      loginBtn.textContent = '확인 중...';
      const auth = await loginWithPin(pin);
      showToast(`${auth.role === 'editor' ? '편집자' : '조회자'} 모드로 로그인되었습니다!`, 'success');
      closeSheet();
      store.refreshData();
    } catch (err) {
      showToast(err.message, 'error', 3500);
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = '로그인';
    }
  };

  wrap.appendChild(loginBtn);

  // 로컬 둘러보기 버튼
  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'btn btn-outline btn-block btn-sm';
  skipBtn.style.marginTop = '10px';
  skipBtn.textContent = '로그인 없이 로컬 데이터로 둘러보기';
  skipBtn.onclick = () => {
    closeSheet();
  };
  wrap.appendChild(skipBtn);

  openSheet({
    title: '인증',
    content: wrap
  });
}

// 앱 실행
document.addEventListener('DOMContentLoaded', initApp);
