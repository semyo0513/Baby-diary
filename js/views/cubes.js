/**
 * cubes.js - 큐브 재고 대시보드 및 제작 관리 뷰
 * 재료별 재고 현황(임박순), 소진 예정일, 제작 권장 구간,
 * 묶음 제작 추천 배너(F-13), [＋제작], [재고 수정(실사 보정)]
 */

import { store } from '../store.js';
import { getTodayYMD, getDayOfWeek, diffDays, addDays } from '../dates.js';
import { openSheet, closeSheet } from '../ui/sheet.js';
import { createStepper } from '../ui/stepper.js';
import { showToast } from '../ui/toast.js';

export function renderCubesView(container) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  const today = getTodayYMD();
  const allForecasts = store.getAllForecasts();
  const bundles = store.getBundleRecommendations();

  // 1. 상단 묶음 제작 추천 배너 (F-13)
  if (bundles.length > 0) {
    const banner = document.createElement('div');
    banner.className = 'bundle-banner';

    const icon = document.createElement('span');
    icon.style.fontSize = '1.8rem';
    icon.textContent = '💡';

    const textWrap = document.createElement('div');
    textWrap.style.flex = '1';

    const bTitle = document.createElement('div');
    bTitle.className = 'bundle-banner-title';
    bTitle.textContent = '제작일 묶음 추천 (한 번에 만들기)';

    const bList = document.createElement('div');
    bList.style.marginTop = '4px';

    bundles.forEach(b => {
      const p = document.createElement('div');
      p.className = 'bundle-banner-item';
      const dow = getDayOfWeek(b.date);
      const names = b.items.map(it => it.name).join(' + ');
      p.innerHTML = `<span>📅</span> <strong>${b.date.slice(5)}(${dow})</strong> <span>: ${names} 함께 제작</span>`;
      bList.appendChild(p);
    });

    textWrap.appendChild(bTitle);
    textWrap.appendChild(bList);
    banner.appendChild(icon);
    banner.appendChild(textWrap);
    container.appendChild(banner);
  }

  // 2. 재고 목록 헤더
  const headerRow = document.createElement('div');
  headerRow.style.display = 'flex';
  headerRow.style.alignItems = 'center';
  headerRow.style.justifyContent = 'space-between';
  headerRow.style.marginBottom = '12px';

  const title = document.createElement('h2');
  title.style.fontSize = '1.05rem';
  title.style.fontWeight = '700';
  title.textContent = `🧊 냉동 큐브 재고 (${allForecasts.length}종)`;

  const shopBtn = document.createElement('button');
  shopBtn.type = 'button';
  shopBtn.className = 'btn btn-outline btn-sm';
  shopBtn.style.padding = '4px 10px';
  shopBtn.style.fontSize = '0.8rem';
  shopBtn.style.fontWeight = '600';
  shopBtn.textContent = '🛒 장보기 목록';
  shopBtn.onclick = () => {
    openShoppingModal(allForecasts, bundles);
  };

  headerRow.appendChild(title);
  headerRow.appendChild(shopBtn);
  container.appendChild(headerRow);

  // 3. 재료별 큐브 카드 목록
  if (allForecasts.length === 0) {
    const emptyNotice = document.createElement('div');
    emptyNotice.style.textAlign = 'center';
    emptyNotice.style.padding = '30px 0';
    emptyNotice.style.color = 'var(--text-muted)';
    emptyNotice.textContent = '등록된 큐브 재료가 없습니다. 더보기 > 재료 관리에서 등록해주세요.';
    container.appendChild(emptyNotice);
    return;
  }

  allForecasts.forEach(f => {
    const ing = f.ingredient;
    const stock = f.stock;
    const fc = f.forecast;
    const cubeG = parseFloat(ing.cube_g) || 30;

    // 상태 판정 (urgent / warning / safe)
    let statusClass = 'safe';
    let badgeText = '여유';
    let badgeColorClass = 'green';

    if (stock <= 1 || (fc && fc.due && fc.due <= today)) {
      statusClass = 'urgent';
      badgeText = '🔴 마감 임박';
      badgeColorClass = 'red';
    } else if (stock <= 2 || (fc && fc.warn && fc.warn <= today)) {
      statusClass = 'warning';
      badgeText = '🟡 제작 권장';
      badgeColorClass = 'yellow';
    } else {
      badgeText = '🟢 여유';
      badgeColorClass = 'green';
    }

    const card = document.createElement('div');
    card.className = `cube-card ${statusClass}`;

    // 카드 상단
    const cardTop = document.createElement('div');
    cardTop.style.display = 'flex';
    cardTop.style.alignItems = 'center';
    cardTop.style.justifyContent = 'space-between';
    cardTop.style.marginBottom = '8px';

    const leftTitle = document.createElement('div');
    leftTitle.style.display = 'flex';
    leftTitle.style.alignItems = 'center';
    leftTitle.style.gap = '8px';

    const dot = document.createElement('span');
    dot.className = 'chip-dot';
    dot.style.backgroundColor = ing.color || '#4DB6AC';

    const nameSpan = document.createElement('span');
    nameSpan.style.fontSize = '1rem';
    nameSpan.style.fontWeight = '700';
    nameSpan.textContent = ing.name;

    const catSpan = document.createElement('span');
    catSpan.style.fontSize = '0.75rem';
    catSpan.style.color = 'var(--text-muted)';
    catSpan.textContent = ing.category === 'base' ? '베이스' : '토핑';

    leftTitle.appendChild(dot);
    leftTitle.appendChild(nameSpan);
    leftTitle.appendChild(catSpan);

    const badge = document.createElement('span');
    badge.className = `cube-badge ${badgeColorClass}`;
    badge.textContent = badgeText;

    cardTop.appendChild(leftTitle);
    cardTop.appendChild(badge);
    card.appendChild(cardTop);

    // 재고 및 진행 바
    const stockRow = document.createElement('div');
    stockRow.style.display = 'flex';
    stockRow.style.alignItems = 'baseline';
    stockRow.style.justifyContent = 'space-between';
    stockRow.style.marginBottom = '6px';

    const stockText = document.createElement('div');
    stockText.style.fontSize = '1.3rem';
    stockText.style.fontWeight = '800';
    stockText.style.color = stock <= 1 ? 'var(--urgent-red)' : 'var(--text-main)';
    stockText.textContent = `${stock}개 `;

    const gramEq = document.createElement('span');
    gramEq.style.fontSize = '0.82rem';
    gramEq.style.fontWeight = '500';
    gramEq.style.color = 'var(--text-muted)';
    gramEq.textContent = `(약 ${Math.round(stock * cubeG)}g)`;
    stockText.appendChild(gramEq);

    const rateText = document.createElement('div');
    rateText.style.fontSize = '0.78rem';
    rateText.style.color = 'var(--text-muted)';
    const rateMode = ing.usage_mode === 'fixed' ? '고정' : '최근 7일 평균';
    rateText.textContent = `소비 속도: 하루 ${f.rate.toFixed(1)}개 (${rateMode})`;

    stockRow.appendChild(stockText);
    stockRow.appendChild(rateText);
    card.appendChild(stockRow);

    // D-Day 배지 (냉동 보관 기간 및 권장일 알림)
    const lastMade = (f.lastMade || (store.state.cubeSummary[ing.id] && store.state.cubeSummary[ing.id].lastMade)) || null;
    const ddayEl = document.createElement('div');
    if (lastMade) {
      const age = Math.max(0, diffDays(lastMade, today));
      if (age <= 14) {
        const left = 14 - age;
        ddayEl.className = 'cube-dday-badge safe';
        ddayEl.textContent = `❄️ 제작 ${age}일차 (${left > 0 ? `권장 ${left}일 남음` : '권장 14일차'})`;
      } else if (age <= 30) {
        ddayEl.className = 'cube-dday-badge warning';
        ddayEl.textContent = `⚠️ 제작 ${age}일차 (14일 초과, 빠른 소비 권장)`;
      } else {
        ddayEl.className = 'cube-dday-badge danger';
        ddayEl.textContent = `🚨 제작 ${age}일차 (30일 초과, 폐기 권장)`;
      }
    } else {
      ddayEl.className = 'cube-dday-badge none';
      ddayEl.textContent = '❄️ 제작일 기록 없음';
    }
    card.appendChild(ddayEl);

    // 제작 권장 / 소진 예정 날짜 안내
    const scheduleBox = document.createElement('div');
    scheduleBox.style.backgroundColor = 'var(--bg-sub)';
    scheduleBox.style.borderRadius = 'var(--radius-sm)';
    scheduleBox.style.padding = '8px 10px';
    scheduleBox.style.fontSize = '0.82rem';
    scheduleBox.style.lineHeight = '1.5';
    scheduleBox.style.marginBottom = '12px';

    if (fc && fc.warn && fc.due) {
      const warnDow = getDayOfWeek(fc.warn);
      const dueDow = getDayOfWeek(fc.due);
      const emptyDow = fc.empty ? getDayOfWeek(fc.empty) : '';

      scheduleBox.innerHTML = `
        <div>🧊 <strong>제작 권장 구간:</strong> ${fc.warn.slice(5)}(${warnDow}) ~ ${fc.due.slice(5)}(${dueDow})</div>
        <div>⏳ <strong>소진 예정일:</strong> ${fc.empty ? `${fc.empty.slice(5)}(${emptyDow})` : '90일 이상 여유'}</div>
      `;
    } else {
      scheduleBox.textContent = 'ℹ️ 소비 기록이 쌓이면 다음 제작일이 자동 계산됩니다.';
    }
    card.appendChild(scheduleBox);

    // 버튼 액션 ([＋ 제작], [재고 수정])
    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '8px';

    const makeBtn = document.createElement('button');
    makeBtn.type = 'button';
    makeBtn.className = 'btn btn-primary btn-sm';
    makeBtn.style.flex = '1';
    makeBtn.textContent = '＋ 제작 기록';
    makeBtn.onclick = () => {
      openMakeModal(ing);
    };

    const adjustBtn = document.createElement('button');
    adjustBtn.type = 'button';
    adjustBtn.className = 'btn btn-outline btn-sm';
    adjustBtn.style.flex = '1';
    adjustBtn.textContent = '실사 재고 수정';
    adjustBtn.onclick = () => {
      openAdjustModal(ing, stock);
    };

    btnRow.appendChild(makeBtn);
    btnRow.appendChild(adjustBtn);
    card.appendChild(btnRow);

    container.appendChild(card);
  });
}

/**
 * 큐브 제작 기록 모달 (cube.made)
 */
function openMakeModal(ingredient) {
  let qty = 12; // 기본 트레이 1판 (12구)
  const defaultCubeG = parseFloat(ingredient.cube_g) || 30;

  const wrap = document.createElement('div');

  const title = document.createElement('div');
  title.style.fontSize = '1.05rem';
  title.style.fontWeight = '700';
  title.style.marginBottom = '12px';
  title.textContent = `🍳 ${ingredient.name} 큐브 제작 기록`;
  wrap.appendChild(title);

  const desc = document.createElement('div');
  desc.style.fontSize = '0.85rem';
  desc.style.color = 'var(--text-muted)';
  desc.style.marginBottom = '12px';
  desc.textContent = `새로 만든 큐브 개수를 입력하세요. (1개 ${defaultCubeG}g 기준)`;
  wrap.appendChild(desc);

  const stepper = createStepper({
    value: qty,
    min: 1,
    max: 100,
    step: 1,
    unit: '개',
    onChange: (val) => { qty = val; }
  });
  wrap.appendChild(stepper);

  // 퀵 버튼 (6개, 12개, 18개)
  const quickRow = document.createElement('div');
  quickRow.className = 'chip-group';
  [6, 8, 12, 16, 24].forEach(n => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = `+${n}개`;
    chip.onclick = () => {
      qty = n;
      stepper.setValue(qty);
    };
    quickRow.appendChild(chip);
  });
  wrap.appendChild(quickRow);

  const memoInput = document.createElement('input');
  memoInput.type = 'text';
  memoInput.className = 'form-input';
  memoInput.placeholder = '메모 (선택사항, 예: 유기농 쌀가루)';
  memoInput.style.marginTop = '12px';
  wrap.appendChild(memoInput);

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'btn btn-primary btn-block';
  confirmBtn.style.marginTop = '18px';
  confirmBtn.textContent = '제작 완료 저장';
  confirmBtn.onclick = async () => {
    await store.recordCubeMade(ingredient.id, qty, getTodayYMD(), memoInput.value.trim());
    showToast(`${ingredient.name} 큐브 ${qty}개 추가 완료!`, 'success');
    closeSheet();
  };
  wrap.appendChild(confirmBtn);

  openSheet({
    title: '큐브 제작 기록',
    content: wrap
  });
}

/**
 * 실사 재고 수정 모달 (cube.adjust)
 */
function openAdjustModal(ingredient, currentStock) {
  let targetCount = currentStock;

  const wrap = document.createElement('div');

  const title = document.createElement('div');
  title.style.fontSize = '1.05rem';
  title.style.fontWeight = '700';
  title.style.marginBottom = '8px';
  title.textContent = `📋 ${ingredient.name} 실사 재고 보정`;
  wrap.appendChild(title);

  const desc = document.createElement('div');
  desc.style.fontSize = '0.85rem';
  desc.style.color = 'var(--text-muted)';
  desc.style.marginBottom = '12px';
  desc.textContent = `냉동실에 남아있는 실제 큐브 개수로 즉시 맞춥니다. (현재 계산된 재고: ${currentStock}개)`;
  wrap.appendChild(desc);

  const stepper = createStepper({
    value: targetCount,
    min: 0,
    max: 200,
    step: 1,
    unit: '개',
    onChange: (val) => { targetCount = val; }
  });
  wrap.appendChild(stepper);

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'btn btn-primary btn-block';
  confirmBtn.style.marginTop = '18px';
  confirmBtn.textContent = '실사 재고 반영하기';
  confirmBtn.onclick = async () => {
    await store.adjustCubeStock(ingredient.id, targetCount, getTodayYMD(), '냉동실 실사 보정');
    showToast(`${ingredient.name} 재고가 ${targetCount}개로 보정되었습니다.`, 'success');
    closeSheet();
  };
  wrap.appendChild(confirmBtn);

  openSheet({
    title: '실사 재고 수정',
    content: wrap
  });
}

/**
 * 이번 주 장보기 목록 모달 (체크리스트 & 1클릭 카톡/클립보드 공유)
 */
export function openShoppingModal(forecasts, bundles) {
  const today = getTodayYMD();

  // 1. 추천 대상 재료 선별
  const candidateMap = new Map();

  (bundles || []).forEach(b => {
    b.items.forEach(it => {
      candidateMap.set(it.id, {
        id: it.id,
        name: it.name,
        reason: `${b.date.slice(5)} 묶음제작 추천`,
        checked: false
      });
    });
  });

  (forecasts || []).forEach(f => {
    const ing = f.ingredient;
    const stock = f.stock;
    const due = f.forecast ? f.forecast.due : null;
    const warn = f.forecast ? f.forecast.warn : null;

    let reason = '';
    if (stock <= 1) {
      reason = `재고 부족 (${stock}개 남음)`;
    } else if (stock <= 2) {
      reason = `재고 여유 적음 (${stock}개)`;
    } else if (due && due <= addDays(today, 7)) {
      reason = `${due.slice(5)} 소진 예정`;
    } else if (warn && warn <= addDays(today, 5)) {
      reason = `${warn.slice(5)} 제작 권장`;
    }

    if (reason && !candidateMap.has(ing.id)) {
      candidateMap.set(ing.id, {
        id: ing.id,
        name: ing.name,
        reason: reason,
        checked: false
      });
    }
  });

  let shoppingItems = Array.from(candidateMap.values());
  if (shoppingItems.length === 0) {
    shoppingItems = [
      { id: 'custom-1', name: '한우 안심/우둔살', reason: '필수 단백질 추천', checked: false },
      { id: 'custom-2', name: '유기농 쌀가루', reason: '기본 베이스 추천', checked: false }
    ];
  }

  const wrap = document.createElement('div');
  wrap.style.padding = '4px 0';

  const desc = document.createElement('div');
  desc.style.fontSize = '0.85rem';
  desc.style.color = 'var(--text-muted)';
  desc.style.marginBottom = '12px';
  desc.textContent = '부족한 큐브 재료와 장보실 품목을 체크하고 가족에게 간편하게 공유하세요.';
  wrap.appendChild(desc);

  // 추가 입력창
  const addRow = document.createElement('div');
  addRow.className = 'shopping-add-row';

  const addInput = document.createElement('input');
  addInput.type = 'text';
  addInput.className = 'form-input';
  addInput.placeholder = '직접 추가할 장보기 품목 (예: 애호박 1개, 지퍼백)';
  addInput.style.flex = '1';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-outline btn-sm';
  addBtn.textContent = '＋ 추가';
  addBtn.onclick = () => {
    const val = addInput.value.trim();
    if (!val) return;
    shoppingItems.push({
      id: 'custom-' + Date.now(),
      name: val,
      reason: '직접 추가',
      checked: false
    });
    addInput.value = '';
    renderList();
  };

  addInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addBtn.click();
    }
  };

  addRow.appendChild(addInput);
  addRow.appendChild(addBtn);
  wrap.appendChild(addRow);

  // 목록 컨테이너
  const listEl = document.createElement('div');
  listEl.className = 'shopping-list';
  wrap.appendChild(listEl);

  function renderList() {
    while (listEl.firstChild) listEl.removeChild(listEl.firstChild);

    if (shoppingItems.length === 0) {
      const em = document.createElement('div');
      em.style.textAlign = 'center';
      em.style.padding = '16px';
      em.style.color = 'var(--text-muted)';
      em.style.fontSize = '0.85rem';
      em.textContent = '장보기 품목이 없습니다. 위 입력창에서 추가해주세요.';
      listEl.appendChild(em);
      return;
    }

    shoppingItems.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = `shopping-item ${item.checked ? 'checked' : ''}`;

      const left = document.createElement('div');
      left.className = 'shopping-item-left';

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.className = 'shopping-item-check';
      chk.checked = item.checked;
      chk.onchange = () => {
        item.checked = chk.checked;
        if (chk.checked) row.classList.add('checked');
        else row.classList.remove('checked');
      };

      const nameLabel = document.createElement('label');
      nameLabel.style.cursor = 'pointer';
      nameLabel.style.display = 'flex';
      nameLabel.style.alignItems = 'center';
      nameLabel.style.gap = '6px';
      nameLabel.onclick = () => {
        chk.checked = !chk.checked;
        chk.dispatchEvent(new Event('change'));
      };

      const nameSpan = document.createElement('span');
      nameSpan.className = 'shopping-item-name';
      nameSpan.textContent = item.name;

      const reasonSpan = document.createElement('span');
      reasonSpan.className = 'shopping-item-reason';
      reasonSpan.textContent = `(${item.reason})`;

      nameLabel.appendChild(nameSpan);
      nameLabel.appendChild(reasonSpan);

      left.appendChild(chk);
      left.appendChild(nameLabel);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'shopping-item-del';
      delBtn.textContent = '×';
      delBtn.title = '삭제';
      delBtn.onclick = () => {
        shoppingItems.splice(idx, 1);
        renderList();
      };

      row.appendChild(left);
      row.appendChild(delBtn);
      listEl.appendChild(row);
    });
  }

  renderList();

  // 하단 액션 버튼 (공유 & 복사)
  const actRow = document.createElement('div');
  actRow.style.display = 'flex';
  actRow.style.gap = '8px';
  actRow.style.marginTop = '16px';

  function buildShoppingText() {
    const babyName = store.getState().settings.baby_name || '이은';
    const lines = [
      `🛒 [${babyName}의 이유식 장보기 목록] (${today})`,
      '--------------------------------'
    ];
    shoppingItems.forEach(it => {
      const mark = it.checked ? '✅' : '⬜';
      lines.push(`${mark} ${it.name} - ${it.reason}`);
    });
    lines.push('--------------------------------');
    lines.push('🍚 이유식 일기에서 작성됨');
    return lines.join('\n');
  }

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'btn btn-outline btn-sm';
  copyBtn.style.flex = '1';
  copyBtn.textContent = '📋 텍스트 복사';
  copyBtn.onclick = async () => {
    const text = buildShoppingText();
    try {
      await navigator.clipboard.writeText(text);
      showToast('장보기 목록이 복사되었습니다!', 'success');
    } catch (e) {
      showToast(text, 'info', 4000);
    }
  };

  const shareBtn = document.createElement('button');
  shareBtn.type = 'button';
  shareBtn.className = 'btn btn-primary btn-sm';
  shareBtn.style.flex = '1.2';
  shareBtn.textContent = '💬 카톡/가족 공유하기';
  shareBtn.onclick = async () => {
    const text = buildShoppingText();
    const babyName = store.getState().settings.baby_name || '이은';
    if (navigator.share) {
      try {
        await navigator.share({
          title: `[${babyName} 이유식] 이번 주 장보기 목록`,
          text: text
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          await navigator.clipboard.writeText(text);
          showToast('장보기 목록이 복사되었습니다!', 'success');
        }
      }
    } else {
      await navigator.clipboard.writeText(text);
      showToast('장보기 목록이 클립보드에 복사되었습니다! 카톡에 붙여넣으세요.', 'success');
    }
  };

  actRow.appendChild(copyBtn);
  actRow.appendChild(shareBtn);
  wrap.appendChild(actRow);

  openSheet({
    title: '🛒 이번 주 장보기 목록',
    content: wrap
  });
}

