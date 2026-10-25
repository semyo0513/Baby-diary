/**
 * calendar.js - 월간 달력 및 리스트 보기
 * 생후/이유식 일차, 식단 칩, 🧊 제작 권장, 🍳 제작 완료, 🎉 기념일
 * 좌우 스와이프 월 이동 및 하루 시트 연동
 */

import { store } from '../store.js';
import { getTodayYMD, getMonthGrid, parseYMD, addDays, formatCellSubtext, formatDaySummary, getAnniversaries } from '../dates.js';
import { openDaySheet } from './daySheet.js';
import { openEntrySheet } from './entrySheet.js';

let isListView = false;

export function renderCalendarView(container) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  const state = store.getState();
  const settings = state.settings;
  const currentMonthStr = state.selectedMonth || getTodayYMD().slice(0, 7);
  const parts = currentMonthStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const today = getTodayYMD();

  const isInclusive = String(settings.count_inclusive).toUpperCase() !== 'FALSE';
  const anniversaries = getAnniversaries(settings.birth_date, isInclusive);

  // 1. 달력 상단 내비게이션 바
  const navBar = document.createElement('div');
  navBar.className = 'cal-nav-bar';

  // 월 이동 컨트롤 (◀ 2026년 10월 ▶)
  const monthTitleWrap = document.createElement('div');
  monthTitleWrap.className = 'cal-month-title';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'btn-icon';
  prevBtn.textContent = '◀';
  prevBtn.onclick = () => {
    let prevY = year;
    let prevM = month - 1;
    if (prevM < 1) { prevM = 12; prevY -= 1; }
    store.setSelectedMonth(`${prevY}-${String(prevM).padStart(2, '0')}`);
  };

  const titleSpan = document.createElement('span');
  titleSpan.textContent = `${year}년 ${month}월`;

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn-icon';
  nextBtn.textContent = '▶';
  nextBtn.onclick = () => {
    let nextY = year;
    let nextM = month + 1;
    if (nextM > 12) { nextM = 1; nextY += 1; }
    store.setSelectedMonth(`${nextY}-${String(nextM).padStart(2, '0')}`);
  };

  const todayBtn = document.createElement('button');
  todayBtn.type = 'button';
  todayBtn.className = 'btn btn-outline btn-sm';
  todayBtn.style.marginLeft = '8px';
  todayBtn.textContent = '오늘';
  todayBtn.onclick = () => {
    store.setSelectedMonth(today.slice(0, 7));
  };

  monthTitleWrap.appendChild(prevBtn);
  monthTitleWrap.appendChild(titleSpan);
  monthTitleWrap.appendChild(nextBtn);
  monthTitleWrap.appendChild(todayBtn);
  navBar.appendChild(monthTitleWrap);

  // 격자 / 리스트 전환 버튼
  const toggleWrap = document.createElement('div');
  toggleWrap.className = 'cal-view-toggle';

  const gridBtn = document.createElement('button');
  gridBtn.type = 'button';
  gridBtn.className = `cal-toggle-btn ${!isListView ? 'active' : ''}`;
  gridBtn.textContent = '격자';
  gridBtn.onclick = () => {
    isListView = false;
    renderCalendarView(container);
  };

  const listBtn = document.createElement('button');
  listBtn.type = 'button';
  listBtn.className = `cal-toggle-btn ${isListView ? 'active' : ''}`;
  listBtn.textContent = '리스트';
  listBtn.onclick = () => {
    isListView = true;
    renderCalendarView(container);
  };

  toggleWrap.appendChild(gridBtn);
  toggleWrap.appendChild(listBtn);
  navBar.appendChild(toggleWrap);

  container.appendChild(navBar);

  // 2. 범례 (Legend)
  const legend = document.createElement('div');
  legend.style.display = 'flex';
  legend.style.gap = '12px';
  legend.style.fontSize = '0.75rem';
  legend.style.color = 'var(--text-muted)';
  legend.style.padding = '0 6px 8px 6px';
  legend.innerHTML = `
    <span>🧊 제작 권장</span>
    <span>🍳 제작 완료</span>
    <span>🆕 새 재료</span>
    <span>🎉 기념일</span>
  `;
  container.appendChild(legend);

  // 각 날짜별 🧊 (제작 권장 구간) 계산
  const allForecasts = store.getAllForecasts();
  const warnDatesMap = {}; // { 'YYYY-MM-DD': ['쌀미음', ...] }
  allForecasts.forEach(f => {
    if (f.forecast && f.forecast.warn && f.forecast.due) {
      let cur = f.forecast.warn;
      while (cur <= f.forecast.due) {
        if (!warnDatesMap[cur]) warnDatesMap[cur] = [];
        warnDatesMap[cur].push(f.ingredient.name);
        cur = addDays(cur, 1);
      }
    }
  });

  // 제작 완료(🍳) 날짜 맵
  const madeDatesMap = {};
  state.madeEvents.forEach(evt => {
    if (evt.date) madeDatesMap[evt.date] = true;
  });

  // 새 재료 첫 도입일 맵
  const firstUsedDatesMap = {};
  Object.values(state.cubeSummary).forEach(s => {
    if (s.firstUsed) firstUsedDatesMap[s.firstUsed] = true;
  });

  // 3. 뷰 렌더링 (리스트 or 격자)
  if (isListView) {
    renderListView(container, year, month, settings, isInclusive, warnDatesMap, madeDatesMap);
  } else {
    renderGridView(container, year, month, today, settings, isInclusive, warnDatesMap, madeDatesMap, firstUsedDatesMap, anniversaries);
  }

  // 좌우 스와이프로 월 이동 지원
  setupSwipe(container, year, month);
}

/**
 * 7열 월간 달력 격자 렌더링
 */
function renderGridView(container, year, month, today, settings, isInclusive, warnDatesMap, madeDatesMap, firstUsedDatesMap, anniversaries) {
  // 요일 헤더
  const weekdays = document.createElement('div');
  weekdays.className = 'cal-weekdays';
  ['일', '월', '화', '수', '목', '금', '토'].forEach(w => {
    const sp = document.createElement('span');
    sp.textContent = w;
    weekdays.appendChild(sp);
  });
  container.appendChild(weekdays);

  // 격자 날짜 셀
  const gridWrap = document.createElement('div');
  gridWrap.className = 'cal-grid';

  const gridDays = getMonthGrid(year, month);
  const ingMap = store.getIngredientsMap();

  gridDays.forEach(cell => {
    const cellEl = document.createElement('div');
    cellEl.className = `cal-cell ${!cell.isCurrentMonth ? 'other-month' : ''} ${cell.date === today ? 'is-today' : ''}`;
    cellEl.onclick = () => {
      openDaySheet(cell.date);
    };

    // 해당 일자 식단 및 섭취량 계산
    const dayMeals = store.getMealsForDate(cell.date);
    const dayTotalEaten = dayMeals.reduce((acc, m) => acc + (parseFloat(m.grams) || 0), 0);

    // 1) 셀 상단: 일자 + 그날 먹은 량(g) + 아이콘(🧊, 🍳, 🆕, 🎉)
    const cellHeader = document.createElement('div');
    cellHeader.className = 'cal-cell-header';

    const dayNum = document.createElement('span');
    dayNum.className = 'cal-day-num';
    dayNum.textContent = String(cell.day);
    cellHeader.appendChild(dayNum);

    // 달력 상단에 오늘/그날 먹은 양(g) 표시
    if (dayTotalEaten > 0) {
      const eatenTop = document.createElement('span');
      eatenTop.className = 'cal-eaten-top';
      eatenTop.textContent = `${dayTotalEaten}g`;
      eatenTop.title = `총 섭취량: ${dayTotalEaten}g`;
      cellHeader.appendChild(eatenTop);
    }

    const iconsWrap = document.createElement('div');
    iconsWrap.className = 'cal-icons';

    if (warnDatesMap[cell.date]) {
      const ice = document.createElement('span');
      ice.textContent = '🧊';
      iconsWrap.appendChild(ice);
    }
    if (madeDatesMap[cell.date]) {
      const pan = document.createElement('span');
      pan.textContent = '🍳';
      iconsWrap.appendChild(pan);
    }
    if (firstUsedDatesMap[cell.date]) {
      const nw = document.createElement('span');
      nw.textContent = '🆕';
      iconsWrap.appendChild(nw);
    }
    if (anniversaries[cell.date]) {
      const party = document.createElement('span');
      party.textContent = '🎉';
      iconsWrap.appendChild(party);
    }

    cellHeader.appendChild(iconsWrap);
    cellEl.appendChild(cellHeader);

    // 2) 셀 축약 일차 표기: 175·이7
    const subtext = document.createElement('div');
    subtext.className = 'cal-subtext';
    subtext.textContent = formatCellSubtext(cell.date, settings.birth_date, settings.solid_start_date, isInclusive);
    cellEl.appendChild(subtext);

    // 3) 하단 식단 큐브 칩 (최대 2개 표시 + 추가분)
    if (dayMeals.length > 0) {
      const chipContainer = document.createElement('div');
      chipContainer.className = 'cal-cell-chips';

      const visible = dayMeals.slice(0, 2);
      visible.forEach(m => {
        const ing = ingMap[m.ingredient_id];
        const chip = document.createElement('div');
        chip.className = 'cal-meal-chip';

        const dot = document.createElement('span');
        dot.className = 'chip-dot';
        dot.style.width = '6px';
        dot.style.height = '6px';
        dot.style.backgroundColor = ing ? ing.color : '#4DB6AC';

        const text = document.createElement('span');
        text.textContent = `${m.name}${m.grams}`;

        chip.appendChild(dot);
        chip.appendChild(text);
        chipContainer.appendChild(chip);
      });

      if (dayMeals.length > 2) {
        const more = document.createElement('div');
        more.className = 'cal-more-chip';
        more.textContent = `+${dayMeals.length - 2}`;
        chipContainer.appendChild(more);
      }

      cellEl.appendChild(chipContainer);
    }

    gridWrap.appendChild(cellEl);
  });

  container.appendChild(gridWrap);
}

/**
 * 리스트 보기 렌더링
 */
function renderListView(container, year, month, settings, isInclusive, warnDatesMap, madeDatesMap) {
  const listWrap = document.createElement('div');
  listWrap.style.display = 'flex';
  listWrap.style.flexDirection = 'column';
  listWrap.style.gap = '10px';

  // 해당 월 1일 ~ 말일
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const ingMap = store.getIngredientsMap();

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayMeals = store.getMealsForDate(dateStr);
    const dayLog = store.getDayLog(dateStr);
    const isWarn = Boolean(warnDatesMap[dateStr]);
    const isMade = Boolean(madeDatesMap[dateStr]);

    const card = document.createElement('div');
    card.className = 'card';
    card.style.padding = '12px 14px';
    card.style.marginBottom = '6px';
    card.style.cursor = 'pointer';
    card.onclick = () => {
      openDaySheet(dateStr);
    };

    const topRow = document.createElement('div');
    topRow.style.display = 'flex';
    topRow.style.alignItems = 'center';
    topRow.style.justifyContent = 'space-between';
    topRow.style.marginBottom = '6px';

    const fullHead = document.createElement('div');
    fullHead.style.fontWeight = '700';
    fullHead.style.fontSize = '0.92rem';
    fullHead.textContent = formatDaySummary(dateStr, settings.baby_name || '이은', settings.birth_date, settings.solid_start_date, isInclusive);

    const badges = document.createElement('div');
    badges.style.display = 'flex';
    badges.style.gap = '4px';

    const dayEatenTotal = dayMeals.reduce((acc, m) => acc + (parseFloat(m.grams) || 0), 0);
    if (dayEatenTotal > 0) {
      badges.appendChild(createBadge(`🍽️ ${dayEatenTotal}g`, 'var(--primary-light)', 'var(--primary)'));
    }
    if (isWarn) badges.appendChild(createBadge('🧊 제작 권장', 'var(--accent-ice-light)', '#0288D1'));
    if (isMade) badges.appendChild(createBadge('🍳 제작', 'var(--accent-gold-light)', '#F57C00'));

    topRow.appendChild(fullHead);
    topRow.appendChild(badges);
    card.appendChild(topRow);

    if (dayMeals.length > 0) {
      const itemsList = document.createElement('div');
      itemsList.style.display = 'flex';
      itemsList.style.flexWrap = 'wrap';
      itemsList.style.gap = '6px';

      dayMeals.forEach(m => {
        const ing = ingMap[m.ingredient_id];
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.style.padding = '3px 8px';
        chip.style.fontSize = '0.78rem';
        chip.style.minHeight = '24px';

        const dot = document.createElement('span');
        dot.className = 'chip-dot';
        dot.style.width = '7px';
        dot.style.height = '7px';
        dot.style.backgroundColor = ing ? ing.color : '#4DB6AC';

        const txt = document.createElement('span');
        txt.textContent = `${m.name} ${m.grams}g`;

        chip.appendChild(dot);
        chip.appendChild(txt);
        itemsList.appendChild(chip);
      });

      card.appendChild(itemsList);
    } else {
      const emptyTxt = document.createElement('div');
      emptyTxt.style.fontSize = '0.8rem';
      emptyTxt.style.color = 'var(--text-light)';
      emptyTxt.textContent = '기록 없음 (탭하여 추가)';
      card.appendChild(emptyTxt);
    }

    if (dayLog && (dayLog.appetite || dayLog.memo)) {
      const logTxt = document.createElement('div');
      logTxt.style.fontSize = '0.8rem';
      logTxt.style.color = 'var(--text-muted)';
      logTxt.style.marginTop = '4px';
      logTxt.textContent = `${dayLog.appetite || ''} ${dayLog.memo || ''}`;
      card.appendChild(logTxt);
    }

    listWrap.appendChild(card);
  }

  container.appendChild(listWrap);
}

function createBadge(text, bg, color) {
  const b = document.createElement('span');
  b.style.fontSize = '0.72rem';
  b.style.fontWeight = '600';
  b.style.padding = '2px 6px';
  b.style.borderRadius = '4px';
  b.style.backgroundColor = bg;
  b.style.color = color;
  b.textContent = text;
  return b;
}

function setupSwipe(el, year, month) {
  let startX = 0;
  let startY = 0;

  el.ontouchstart = (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  };

  el.ontouchend = (e) => {
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const diffX = endX - startX;
    const diffY = endY - startY;

    if (Math.abs(diffX) > 60 && Math.abs(diffY) < 40) {
      if (diffX < 0) {
        // 다음 달
        let nextY = year;
        let nextM = month + 1;
        if (nextM > 12) { nextM = 1; nextY += 1; }
        store.setSelectedMonth(`${nextY}-${String(nextM).padStart(2, '0')}`);
      } else {
        // 이전 달
        let prevY = year;
        let prevM = month - 1;
        if (prevM < 1) { prevM = 12; prevY -= 1; }
        store.setSelectedMonth(`${prevY}-${String(prevM).padStart(2, '0')}`);
      }
    }
  };
}
