/**
 * sheet.js - 슬라이드업 바텀 시트 모달 컴포넌트
 * textContent 및 안전한 DOM 생성 활용
 */

let activeOnClose = null;

export function openSheet({ title, content, onClose }) {
  const backdrop = document.getElementById('sheet-backdrop');
  const container = document.getElementById('sheet-container');
  const titleEl = document.getElementById('sheet-title');
  const bodyEl = document.getElementById('sheet-body');
  const closeBtn = document.getElementById('sheet-close-btn');

  if (!backdrop || !container || !bodyEl) return;

  activeOnClose = onClose || null;

  if (titleEl) {
    titleEl.textContent = title || '';
  }

  // 기존 내용 제거
  while (bodyEl.firstChild) {
    bodyEl.removeChild(bodyEl.firstChild);
  }

  if (typeof content === 'string') {
    const p = document.createElement('p');
    p.textContent = content;
    bodyEl.appendChild(p);
  } else if (content instanceof HTMLElement) {
    bodyEl.appendChild(content);
  }

  backdrop.classList.add('open');
  container.classList.add('open');

  // 백드롭 및 닫기 버튼 이벤트
  backdrop.onclick = closeSheet;
  if (closeBtn) {
    closeBtn.onclick = closeSheet;
  }
}

export function closeSheet() {
  const backdrop = document.getElementById('sheet-backdrop');
  const container = document.getElementById('sheet-container');

  if (backdrop) backdrop.classList.remove('open');
  if (container) container.classList.remove('open');

  if (activeOnClose) {
    const cb = activeOnClose;
    activeOnClose = null;
    cb();
  }
}
