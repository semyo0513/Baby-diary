/**
 * settings.js - 설정 뷰
 * 아기 정보(이름, 출생일, 이유식 시작일), 임계값(warn/due/lead),
 * PIN 인증(editor/viewer), 데이터 내보내기(CSV)
 */

import { store } from '../store.js';
import { getRole, clearAuth, isAuthenticated } from '../api.js';
import { showToast } from '../ui/toast.js';
import { openPinModal } from '../main.js';

export function renderSettingsView(container) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  const state = store.getState();
  const s = state.settings;
  const role = getRole();

  // 상단 헤더
  const title = document.createElement('h2');
  title.style.fontSize = '1.05rem';
  title.style.fontWeight = '700';
  title.style.marginBottom = '14px';
  title.textContent = '⚙️ 설정 및 아기 정보';
  container.appendChild(title);

  // 1. 아기 정보 카드
  const babyCard = document.createElement('div');
  babyCard.className = 'card';
  babyCard.innerHTML = `<div class="card-title">👶 아기 정보</div>`;

  const form = document.createElement('form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    await store.saveSettings({
      baby_name: nameInput.value.trim(),
      birth_date: birthInput.value,
      solid_start_date: solidStartInput.value,
      count_inclusive: inclusiveCheck.checked ? 'TRUE' : 'FALSE',
      warn_stock: warnInput.value,
      due_stock: dueInput.value,
      lead_days: leadInput.value,
      usage_window_days: windowInput.value,
      watch_days: watchInput.value
    });
    showToast('설정이 저장되었습니다!', 'success');
  };

  // 아기 이름
  const nameGroup = document.createElement('div');
  nameGroup.className = 'form-group';
  nameGroup.innerHTML = `<label class="form-label">아기 이름</label>`;
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'form-input';
  nameInput.value = s.baby_name || '이은';
  nameGroup.appendChild(nameInput);
  form.appendChild(nameGroup);

  // 출생일
  const birthGroup = document.createElement('div');
  birthGroup.className = 'form-group';
  birthGroup.innerHTML = `<label class="form-label">출생일 (생후 일차 계산 기준)</label>`;
  const birthInput = document.createElement('input');
  birthInput.type = 'date';
  birthInput.className = 'form-input';
  birthInput.value = s.birth_date || '2026-04-24';
  birthGroup.appendChild(birthInput);
  form.appendChild(birthGroup);

  // 이유식 시작일
  const solidGroup = document.createElement('div');
  solidGroup.className = 'form-group';
  solidGroup.innerHTML = `<label class="form-label">이유식 시작일 (1일차)</label>`;
  const solidStartInput = document.createElement('input');
  solidStartInput.type = 'date';
  solidStartInput.className = 'form-input';
  solidStartInput.value = s.solid_start_date || '2026-10-09';
  solidGroup.appendChild(solidStartInput);
  form.appendChild(solidGroup);

  // 당일=1일차 기준 체크박스
  const inclusiveRow = document.createElement('label');
  inclusiveRow.style.display = 'flex';
  inclusiveRow.style.alignItems = 'center';
  inclusiveRow.style.gap = '8px';
  inclusiveRow.style.margin = '10px 0 16px 0';
  inclusiveRow.style.fontSize = '0.9rem';
  inclusiveRow.style.cursor = 'pointer';
  const inclusiveCheck = document.createElement('input');
  inclusiveCheck.type = 'checkbox';
  inclusiveCheck.checked = String(s.count_inclusive).toUpperCase() !== 'FALSE';
  const incTxt = document.createElement('span');
  incTxt.textContent = '당일을 1일차로 계산 (출생일/시작일 = 1일차)';
  inclusiveRow.appendChild(inclusiveCheck);
  inclusiveRow.appendChild(incTxt);
  form.appendChild(inclusiveRow);

  babyCard.appendChild(form);
  container.appendChild(babyCard);

  // 2. 제작일 계산 임계값 카드
  const calcCard = document.createElement('div');
  calcCard.className = 'card';
  calcCard.innerHTML = `
    <div class="card-title">🧊 큐브 제작 예측 기준</div>
    <div class="card-subtitle" style="margin-bottom: 12px;">냉동실 큐브가 남았을 때 제작 알림을 띄우는 기준입니다.</div>
  `;

  // warn_stock & due_stock
  const stockRow = document.createElement('div');
  stockRow.style.display = 'grid';
  stockRow.style.gridTemplateColumns = '1fr 1fr';
  stockRow.style.gap = '10px';

  const warnGroup = document.createElement('div');
  warnGroup.className = 'form-group';
  warnGroup.innerHTML = `<label class="form-label">제작 권장 시작 (개수)</label>`;
  const warnInput = document.createElement('input');
  warnInput.type = 'number';
  warnInput.className = 'form-input';
  warnInput.value = s.warn_stock || 2;
  warnGroup.appendChild(warnInput);

  const dueGroup = document.createElement('div');
  dueGroup.className = 'form-group';
  dueGroup.innerHTML = `<label class="form-label">제작 마감 권장 (개수)</label>`;
  const dueInput = document.createElement('input');
  dueInput.type = 'number';
  dueInput.className = 'form-input';
  dueInput.value = s.due_stock || 1;
  dueGroup.appendChild(dueInput);

  stockRow.appendChild(warnGroup);
  stockRow.appendChild(dueGroup);
  form.appendChild(stockRow);

  // lead_days, usage_window_days, watch_days
  const leadRow = document.createElement('div');
  leadRow.style.display = 'grid';
  leadRow.style.gridTemplateColumns = '1fr 1fr';
  leadRow.style.gap = '10px';

  const leadGroup = document.createElement('div');
  leadGroup.className = 'form-group';
  leadGroup.innerHTML = `<label class="form-label">제작 소요 여유일 (lead)</label>`;
  const leadInput = document.createElement('input');
  leadInput.type = 'number';
  leadInput.className = 'form-input';
  leadInput.value = s.lead_days || 0;
  leadGroup.appendChild(leadInput);

  const windowGroup = document.createElement('div');
  windowGroup.className = 'form-group';
  windowGroup.innerHTML = `<label class="form-label">auto 모드 평균일수 (W)</label>`;
  const windowInput = document.createElement('input');
  windowInput.type = 'number';
  windowInput.className = 'form-input';
  windowInput.value = s.usage_window_days || 7;
  windowGroup.appendChild(windowInput);

  leadRow.appendChild(leadGroup);
  leadRow.appendChild(windowGroup);
  form.appendChild(leadRow);

  const watchGroup = document.createElement('div');
  watchGroup.className = 'form-group';
  watchGroup.innerHTML = `<label class="form-label">새 재료 관찰 기간 (일)</label>`;
  const watchInput = document.createElement('input');
  watchInput.type = 'number';
  watchInput.className = 'form-input';
  watchInput.value = s.watch_days || 3;
  watchGroup.appendChild(watchInput);
  form.appendChild(watchGroup);

  const saveSettingsBtn = document.createElement('button');
  saveSettingsBtn.type = 'submit';
  saveSettingsBtn.className = 'btn btn-primary btn-block';
  saveSettingsBtn.textContent = '설정 변경사항 저장';
  form.appendChild(saveSettingsBtn);

  calcCard.appendChild(form);
  container.appendChild(calcCard);

  // 3. 인증 및 가족 공유 PIN 관리 카드
  const authCard = document.createElement('div');
  authCard.className = 'card';
  authCard.innerHTML = `
    <div class="card-title">🔐 가족 공유 및 PIN 번호 관리</div>
    <div class="card-subtitle" style="margin-bottom: 12px;">가족, 조부모님, 베이비시터와 식단을 함께 기록하거나 조회할 수 있습니다.</div>
  `;

  const authBody = document.createElement('div');
  authBody.style.fontSize = '0.9rem';
  authBody.style.lineHeight = '1.6';

  const roleText = role === 'editor' ? '✍️ 편집자 (Editor - 수정 및 기록 가능)' : '👀 조회자 (Viewer - 읽기 전용)';
  authBody.innerHTML = `
    <div style="margin-bottom: 10px;">현재 나의 접속 권한: <strong>${roleText}</strong></div>
  `;

  const editorPin = s.pin_editor || localStorage.getItem('baby_food_editor_pin') || '123456';
  const viewerPin = s.pin_viewer || localStorage.getItem('baby_food_viewer_pin') || '000000';

  // PIN 표시 그룹
  const pinGroup = document.createElement('div');
  pinGroup.className = 'pin-display-group';

  // 1) 편집용 PIN 항목
  const edItem = document.createElement('div');
  edItem.className = 'pin-item';

  const edHeader = document.createElement('div');
  edHeader.className = 'pin-item-header';
  edHeader.innerHTML = `
    <span class="pin-role-badge editor">✍️ 편집자 PIN</span>
    <span class="pin-role-desc">식단 기록, 큐브 제작 및 수정 가능</span>
  `;

  const edRow = document.createElement('div');
  edRow.className = 'pin-value-row';

  const edInput = document.createElement('input');
  edInput.type = 'text';
  edInput.readOnly = true;
  edInput.className = 'pin-value-display';
  edInput.value = editorPin;

  const edToggleBtn = document.createElement('button');
  edToggleBtn.type = 'button';
  edToggleBtn.className = 'btn btn-outline btn-sm';
  edToggleBtn.style.padding = '4px 8px';
  edToggleBtn.textContent = '숨김';
  edToggleBtn.onclick = () => {
    if (edInput.type === 'text') {
      edInput.type = 'password';
      edToggleBtn.textContent = '보기';
    } else {
      edInput.type = 'text';
      edToggleBtn.textContent = '숨김';
    }
  };

  const edCopyBtn = document.createElement('button');
  edCopyBtn.type = 'button';
  edCopyBtn.className = 'btn btn-outline btn-sm';
  edCopyBtn.style.padding = '4px 10px';
  edCopyBtn.textContent = '복사';
  edCopyBtn.onclick = async () => {
    await navigator.clipboard.writeText(editorPin);
    showToast(`편집용 PIN (${editorPin})이 복사되었습니다!`, 'success');
  };

  edRow.appendChild(edInput);
  edRow.appendChild(edToggleBtn);
  edRow.appendChild(edCopyBtn);
  edItem.appendChild(edHeader);
  edItem.appendChild(edRow);
  pinGroup.appendChild(edItem);

  // 2) 조회용 PIN 항목
  const viItem = document.createElement('div');
  viItem.className = 'pin-item';

  const viHeader = document.createElement('div');
  viHeader.className = 'pin-item-header';
  viHeader.innerHTML = `
    <span class="pin-role-badge viewer">👀 조회자 PIN</span>
    <span class="pin-role-desc">식단 및 캘린더 읽기 전용</span>
  `;

  const viRow = document.createElement('div');
  viRow.className = 'pin-value-row';

  const viInput = document.createElement('input');
  viInput.type = 'text';
  viInput.readOnly = true;
  viInput.className = 'pin-value-display';
  viInput.value = viewerPin;

  const viToggleBtn = document.createElement('button');
  viToggleBtn.type = 'button';
  viToggleBtn.className = 'btn btn-outline btn-sm';
  viToggleBtn.style.padding = '4px 8px';
  viToggleBtn.textContent = '숨김';
  viToggleBtn.onclick = () => {
    if (viInput.type === 'text') {
      viInput.type = 'password';
      viToggleBtn.textContent = '보기';
    } else {
      viInput.type = 'text';
      viToggleBtn.textContent = '숨김';
    }
  };

  const viCopyBtn = document.createElement('button');
  viCopyBtn.type = 'button';
  viCopyBtn.className = 'btn btn-outline btn-sm';
  viCopyBtn.style.padding = '4px 10px';
  viCopyBtn.textContent = '복사';
  viCopyBtn.onclick = async () => {
    await navigator.clipboard.writeText(viewerPin);
    showToast(`조회용 PIN (${viewerPin})이 복사되었습니다!`, 'success');
  };

  viRow.appendChild(viInput);
  viRow.appendChild(viToggleBtn);
  viRow.appendChild(viCopyBtn);
  viItem.appendChild(viHeader);
  viItem.appendChild(viRow);
  pinGroup.appendChild(viItem);

  authBody.appendChild(pinGroup);

  // 가족 공유 버튼
  const shareBtn = document.createElement('button');
  shareBtn.type = 'button';
  shareBtn.className = 'btn btn-primary btn-block';
  shareBtn.style.marginBottom = '10px';
  shareBtn.textContent = '🔗 가족에게 PIN 및 앱 링크 공유하기';
  shareBtn.onclick = async () => {
    const babyName = s.baby_name || '이은';
    const appUrl = window.location.origin + window.location.pathname;
    const shareText = `🍚 [${babyName}의 이유식 일기] 가족 초대 안내\n\n` +
      `👶 아기: ${babyName}\n` +
      `✍️ 편집자 PIN: ${editorPin} (식단 기록/수정)\n` +
      `👀 조회자 PIN: ${viewerPin} (읽기 전용)\n\n` +
      `🔗 바로가기: ${appUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${babyName}의 이유식 일기 가족 초대`,
          text: shareText,
          url: appUrl
        });
        showToast('가족에게 공유되었습니다!', 'success');
      } catch (e) {
        // 취소했거나 미지원 시 클립보드로 복사
        await navigator.clipboard.writeText(shareText);
        showToast('가족 공유 초대 문구가 클립보드에 복사되었습니다!', 'success');
      }
    } else {
      await navigator.clipboard.writeText(shareText);
      showToast('가족 공유 초대 문구가 클립보드에 복사되었습니다! 카톡 등에 붙여넣어 공유하세요.', 'success', 2500);
    }
  };
  authBody.appendChild(shareBtn);

  // PIN 직접 변경 섹션 (토글형)
  const pinChangeBox = document.createElement('div');
  pinChangeBox.style.display = 'none';
  pinChangeBox.style.backgroundColor = 'var(--bg-card)';
  pinChangeBox.style.border = '1px solid var(--border-color)';
  pinChangeBox.style.borderRadius = 'var(--radius-md)';
  pinChangeBox.style.padding = '12px';
  pinChangeBox.style.marginBottom = '12px';

  pinChangeBox.innerHTML = `
    <div style="font-weight:700; margin-bottom:8px; font-size:0.92rem;">✏️ PIN 번호 직접 변경</div>
    <div class="form-group" style="margin-bottom:8px;">
      <label class="form-label" style="font-size:0.8rem;">새 편집자 PIN (숫자 4~8자리)</label>
      <input type="text" id="new-ed-pin" class="form-input" style="height:38px; font-size:0.9rem;" value="${editorPin}">
    </div>
    <div class="form-group" style="margin-bottom:10px;">
      <label class="form-label" style="font-size:0.8rem;">새 조회자 PIN (숫자 4~8자리)</label>
      <input type="text" id="new-vi-pin" class="form-input" style="height:38px; font-size:0.9rem;" value="${viewerPin}">
    </div>
  `;

  const pinSaveBtn = document.createElement('button');
  pinSaveBtn.type = 'button';
  pinSaveBtn.className = 'btn btn-primary btn-block btn-sm';
  pinSaveBtn.textContent = '새 PIN 저장 및 시트 동기화';
  pinSaveBtn.onclick = async () => {
    const newEd = pinChangeBox.querySelector('#new-ed-pin').value.trim();
    const newVi = pinChangeBox.querySelector('#new-vi-pin').value.trim();
    if (!newEd || !newVi) {
      showToast('PIN 번호를 입력해주세요.', 'error');
      return;
    }

    try {
      pinSaveBtn.disabled = true;
      pinSaveBtn.textContent = '저장 중...';

      await store.saveSettings({
        ...s,
        pin_editor: newEd,
        pin_viewer: newVi
      });

      localStorage.setItem('baby_food_editor_pin', newEd);
      localStorage.setItem('baby_food_viewer_pin', newVi);

      showToast('새 PIN 번호가 저장되고 동기화되었습니다!', 'success');
      renderSettingsView(container);
    } catch (err) {
      showToast('PIN 저장 오류: ' + err.message, 'error');
    } finally {
      pinSaveBtn.disabled = false;
      pinSaveBtn.textContent = '새 PIN 저장 및 시트 동기화';
    }
  };
  pinChangeBox.appendChild(pinSaveBtn);
  authBody.appendChild(pinChangeBox);

  // 버튼 행: PIN 변경 토글 & 다른 계정 로그인 / 로그아웃
  const authBtnRow = document.createElement('div');
  authBtnRow.style.display = 'flex';
  authBtnRow.style.gap = '8px';
  authBtnRow.style.marginTop = '4px';

  const togglePinChangeBtn = document.createElement('button');
  togglePinChangeBtn.type = 'button';
  togglePinChangeBtn.className = 'btn btn-outline btn-sm';
  togglePinChangeBtn.style.flex = '1';
  togglePinChangeBtn.textContent = '✏️ PIN 변경';
  togglePinChangeBtn.onclick = () => {
    pinChangeBox.style.display = pinChangeBox.style.display === 'none' ? 'block' : 'none';
  };

  const changePinBtn = document.createElement('button');
  changePinBtn.type = 'button';
  changePinBtn.className = 'btn btn-outline btn-sm';
  changePinBtn.style.flex = '1';
  changePinBtn.textContent = '재로그인';
  changePinBtn.onclick = () => {
    openPinModal();
  };

  const logoutBtn = document.createElement('button');
  logoutBtn.type = 'button';
  logoutBtn.className = 'btn btn-outline btn-sm';
  logoutBtn.style.color = 'var(--urgent-red)';
  logoutBtn.textContent = '로그아웃';
  logoutBtn.onclick = () => {
    clearAuth();
    showToast('로그아웃되었습니다.', 'info');
    openPinModal();
  };

  authBtnRow.appendChild(togglePinChangeBtn);
  authBtnRow.appendChild(changePinBtn);
  authBtnRow.appendChild(logoutBtn);
  authBody.appendChild(authBtnRow);
  authCard.appendChild(authBody);
  container.appendChild(authCard);

  // 4. 데이터 내보내기 (CSV - F-21)
  const exportCard = document.createElement('div');
  exportCard.className = 'card';
  exportCard.innerHTML = `
    <div class="card-title">📂 데이터 백업 및 내보내기</div>
    <div class="card-subtitle" style="margin-bottom: 12px;">병원 진료나 보관용으로 식단 기록을 CSV로 내려받습니다.</div>
  `;

  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.className = 'btn btn-outline btn-block';
  exportBtn.textContent = '📊 식단 기록 CSV 다운로드';
  exportBtn.onclick = () => {
    exportMealsCsv();
  };
  exportCard.appendChild(exportBtn);
  container.appendChild(exportCard);
}

/**
 * 식단 기록 CSV 생성 및 브라우저 다운로드
 */
function exportMealsCsv() {
  const meals = store.getState().meals;
  if (meals.length === 0) {
    showToast('내보낼 식단 기록이 없습니다.', 'info');
    return;
  }

  const headers = ['날짜', '끼니', '재료명', '섭취량(g)', '큐브사용', '사용큐브수'];
  const rows = meals.map(m => [
    m.date,
    `${m.meal_no || 1}끼`,
    `"${m.name || ''}"`,
    m.grams,
    m.use_cube,
    m.cubes_used
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `이유식기록_${store.getState().settings.baby_name || '아기'}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('CSV 파일이 다운로드되었습니다.', 'success');
}
