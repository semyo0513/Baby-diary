/**
 * cubes.js - 큐브 재고 대시보드 및 제작 관리 뷰
 * 재료별 재고 현황(임박순), 소진 예정일, 제작 권장 구간,
 * 묶음 제작 추천 배너(F-13), [＋제작], [재고 수정(실사 보정)]
 */

import { store } from '../store.js';
import { getTodayYMD, getDayOfWeek } from '../dates.js';
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

  headerRow.appendChild(title);
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
