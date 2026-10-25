/**
 * daySheet.js - 하루 상세 식단 및 반응 기록 바텀 시트
 * 풀 문장 헤더: 10/15(목) 이은175일차, 이유식7일차
 * 끼니별 식단 목록, 삭제/복구, 반응(이모지), 태그, 메모, 텍스트 복사/공유
 */

import { store } from '../store.js';
import { openSheet, closeSheet } from '../ui/sheet.js';
import { openEntrySheet } from './entrySheet.js';
import { formatDaySummary, getTodayYMD, getDayOfWeek, addDays, diffDays } from '../dates.js';
import { createEmojiChip, createTagChip } from '../ui/chip.js';
import { showToast } from '../ui/toast.js';

export function openDaySheet(dateStr) {
  const state = store.getState();
  const settings = state.settings;
  const isInclusive = String(settings.count_inclusive).toUpperCase() !== 'FALSE';

  const fullHeader = formatDaySummary(
    dateStr,
    settings.baby_name || '아기',
    settings.birth_date,
    settings.solid_start_date,
    isInclusive
  );

  const wrap = document.createElement('div');
  wrap.className = 'day-sheet-content';

  // 풀 문장 헤더
  const header = document.createElement('div');
  header.style.fontSize = '1.1rem';
  header.style.fontWeight = '700';
  header.style.marginBottom = '16px';
  header.style.color = 'var(--text-main)';
  header.textContent = fullHeader;
  wrap.appendChild(header);

  // 식단 목록 렌더링
  const mealsContainer = document.createElement('div');
  mealsContainer.style.marginBottom = '18px';
  wrap.appendChild(mealsContainer);

  function renderMealItems() {
    while (mealsContainer.firstChild) {
      mealsContainer.removeChild(mealsContainer.firstChild);
    }

    const items = store.getMealsForDate(dateStr);
    if (items.length === 0) {
      const emptyNotice = document.createElement('div');
      emptyNotice.style.textAlign = 'center';
      emptyNotice.style.padding = '20px 0';
      emptyNotice.style.color = 'var(--text-muted)';
      emptyNotice.textContent = '아직 기록된 식단이 없습니다.';
      mealsContainer.appendChild(emptyNotice);
      return;
    }

    // 끼니별 그룹화
    const grouped = {};
    for (const it of items) {
      const no = it.meal_no || 1;
      if (!grouped[no]) grouped[no] = [];
      grouped[no].push(it);
    }

    const ingMap = store.getIngredientsMap();

    Object.keys(grouped).sort().forEach(no => {
      const mealCard = document.createElement('div');
      mealCard.className = 'card';
      mealCard.style.padding = '12px 14px';
      mealCard.style.marginBottom = '10px';

      const mealEatenTotal = grouped[no].reduce((acc, it) => acc + (parseFloat(it.grams) || 0), 0);
      const cardHead = document.createElement('div');
      cardHead.style.display = 'flex';
      cardHead.style.alignItems = 'center';
      cardHead.style.justifyContent = 'space-between';
      cardHead.style.marginBottom = '8px';
      cardHead.innerHTML = `
        <span style="font-weight:700; font-size:0.92rem;">🍚 ${no}번째 끼니</span>
        <span style="font-size:0.85rem; font-weight:800; color:var(--primary);">실제 섭취 ${mealEatenTotal}g</span>
      `;
      mealCard.appendChild(cardHead);

      const itemList = document.createElement('div');
      itemList.style.display = 'flex';
      itemList.style.flexDirection = 'column';
      itemList.style.gap = '8px';

      grouped[no].forEach(it => {
        const ing = ingMap[it.ingredient_id];
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'space-between';
        row.style.padding = '4px 0';
        row.style.borderBottom = '1px solid var(--border-light)';

        const left = document.createElement('div');
        left.style.display = 'flex';
        left.style.alignItems = 'center';
        left.style.gap = '10px';

        const dot = document.createElement('span');
        dot.className = 'chip-dot';
        dot.style.backgroundColor = ing ? ing.color : '#4DB6AC';
        dot.style.width = '10px';
        dot.style.height = '10px';

        const infoCol = document.createElement('div');
        infoCol.style.display = 'flex';
        infoCol.style.flexDirection = 'column';
        infoCol.style.gap = '2px';

        const nameRow = document.createElement('div');
        nameRow.style.display = 'flex';
        nameRow.style.alignItems = 'center';
        nameRow.style.gap = '8px';

        const nameTxt = document.createElement('span');
        nameTxt.style.fontWeight = '700';
        nameTxt.style.fontSize = '0.92rem';
        nameTxt.textContent = it.name;

        const eatenSpan = document.createElement('span');
        eatenSpan.style.fontWeight = '800';
        eatenSpan.style.fontSize = '0.92rem';
        eatenSpan.style.color = 'var(--primary)';
        eatenSpan.textContent = `실제 섭취 ${it.grams}g`;

        nameRow.appendChild(nameTxt);
        nameRow.appendChild(eatenSpan);
        infoCol.appendChild(nameRow);

        const subInfo = document.createElement('div');
        subInfo.style.fontSize = '0.78rem';
        subInfo.style.color = 'var(--text-muted)';
        const isCube = String(it.use_cube).toUpperCase() !== 'FALSE';
        if (isCube) {
          const prep = it.prepared_grams !== undefined ? parseFloat(it.prepared_grams) : parseFloat(it.grams);
          const actual = parseFloat(it.grams);
          const cubes = it.cubes_used || 1;
          if (prep > actual) {
            subInfo.innerHTML = `🧊 분출 ${prep}g (${cubes}큐브) 중 <strong>${prep - actual}g 남김</strong>`;
            subInfo.style.color = '#E65100';
          } else {
            subInfo.innerHTML = `🧊 분출 ${prep}g (${cubes}큐브) 완밥`;
          }
        } else {
          subInfo.textContent = '🍳 직접 조리 / 생재료';
        }
        infoCol.appendChild(subInfo);

        left.appendChild(dot);
        left.appendChild(infoCol);

        // 수정 및 삭제 액션 버튼
        const right = document.createElement('div');
        right.style.display = 'flex';
        right.style.alignItems = 'center';
        right.style.gap = '6px';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn btn-outline btn-sm';
        editBtn.style.padding = '2px 8px';
        editBtn.style.fontSize = '0.75rem';
        editBtn.style.minHeight = '26px';
        editBtn.textContent = '수정';
        editBtn.onclick = () => {
          openEntrySheet(dateStr, no, it);
        };

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.style.border = 'none';
        delBtn.style.background = 'transparent';
        delBtn.style.color = 'var(--urgent-red)';
        delBtn.style.cursor = 'pointer';
        delBtn.style.fontSize = '1.2rem';
        delBtn.style.padding = '0 4px';
        delBtn.textContent = '×';
        delBtn.title = '삭제';
        delBtn.onclick = async () => {
          if (confirm(`${it.name} 기록을 삭제하시겠습니까? (차감된 재고는 자동 복구됩니다)`)) {
            await store.deleteMealItem(dateStr, it.id);
            showToast(`${it.name} 삭제 및 재고 복구 완료`, 'info');
            renderMealItems();
          }
        };

        right.appendChild(editBtn);
        right.appendChild(delBtn);

        row.appendChild(left);
        row.appendChild(right);
        itemList.appendChild(row);
      });

      mealCard.appendChild(itemList);
      mealsContainer.appendChild(mealCard);
    });
  }

  renderMealItems();

  // ＋ 끼니 추가 버튼
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-outline btn-block btn-sm';
  addBtn.style.marginBottom = '18px';
  addBtn.textContent = '＋ 재료 추가하기';
  addBtn.onclick = () => {
    openEntrySheet(dateStr);
  };
  wrap.appendChild(addBtn);

  // 일일 반응 및 증상 기록 (F-12)
  const dayLogCard = document.createElement('div');
  dayLogCard.className = 'card';
  dayLogCard.style.padding = '14px';

  const dayLogTitle = document.createElement('div');
  dayLogTitle.className = 'card-title';
  dayLogTitle.textContent = '🌟 하루 반응 및 메모';
  dayLogCard.appendChild(dayLogTitle);

  const existingLog = store.getDayLog(dateStr) || {};
  let currentAppetite = existingLog.appetite || '';
  let currentTags = existingLog.tags ? (typeof existingLog.tags === 'string' ? existingLog.tags.split(',') : existingLog.tags) : [];

  // 반응 이모지 선택
  const emojiRow = document.createElement('div');
  emojiRow.className = 'chip-group';
  const emojis = [
    { emoji: '😋', label: '완밥' },
    { emoji: '🙂', label: '보통' },
    { emoji: '😐', label: '남김' },
    { emoji: '🙅', label: '거부' }
  ];

  function renderEmojis() {
    while (emojiRow.firstChild) emojiRow.removeChild(emojiRow.firstChild);
    emojis.forEach(e => {
      const chip = createEmojiChip(e.emoji, e.label, currentAppetite === e.emoji, () => {
        currentAppetite = e.emoji;
        renderEmojis();
        saveLog();
      });
      emojiRow.appendChild(chip);
    });
  }
  renderEmojis();
  dayLogCard.appendChild(emojiRow);

  // 증상 태그 선택
  const tagRow = document.createElement('div');
  tagRow.className = 'chip-group';
  const defaultTags = ['알레르기 없음', '피부 발진/두드러기', '입가 붉어짐', '설사', '구토', '변비', '가려움/비빔'];

  function renderTags() {
    while (tagRow.firstChild) tagRow.removeChild(tagRow.firstChild);
    defaultTags.forEach(t => {
      const isSel = currentTags.includes(t);
      const chip = createTagChip(t, isSel, () => {
        if (isSel) {
          currentTags = currentTags.filter(x => x !== t);
        } else {
          if (t === '알레르기 없음') {
            currentTags = ['알레르기 없음'];
          } else {
            currentTags = currentTags.filter(x => x !== '알레르기 없음');
            currentTags.push(t);
          }
        }
        renderTags();
        saveLog();
      });
      tagRow.appendChild(chip);
    });
  }
  renderTags();
  dayLogCard.appendChild(tagRow);

  // 메모 인풋
  const memoInput = document.createElement('textarea');
  memoInput.className = 'form-input';
  memoInput.style.height = '64px';
  memoInput.style.padding = '8px';
  memoInput.style.resize = 'none';
  memoInput.placeholder = '특이사항, 아이 컨디션을 기록하세요...';
  memoInput.value = existingLog.memo || '';
  memoInput.onchange = () => {
    saveLog();
  };
  dayLogCard.appendChild(memoInput);

  async function saveLog() {
    const currentMeals = store.getMealsForDate(dateStr);
    const grouped = {};
    for (const m of currentMeals) {
      const no = m.meal_no || 1;
      if (!grouped[no]) grouped[no] = [];
      grouped[no].push(m);
    }
    const payloadMeals = Object.keys(grouped).map(no => ({
      meal_no: parseInt(no, 10),
      items: grouped[no].map(ri => ({
        ingredient_id: ri.ingredient_id,
        name: ri.name,
        grams: ri.grams,
        use_cube: String(ri.use_cube).toUpperCase() !== 'FALSE'
      }))
    }));

    await store.saveDayMeals(dateStr, payloadMeals, {
      appetite: currentAppetite,
      tags: currentTags,
      memo: memoInput.value.trim()
    });
  }

  wrap.appendChild(dayLogCard);

  // 텍스트 복사/공유 버튼 (F-14)
  const shareBtn = document.createElement('button');
  shareBtn.type = 'button';
  shareBtn.className = 'btn btn-outline btn-block';
  shareBtn.style.marginTop = '12px';
  shareBtn.textContent = '📋 식단 텍스트 복사하기';
  shareBtn.onclick = async () => {
    const items = store.getMealsForDate(dateStr);
    const lines = [fullHeader];
    if (items.length > 0) {
      const parts = items.map(it => `${it.name} ${it.grams}g`);
      lines.push(`• 식단: ${parts.join(', ')}`);
    }
    if (currentAppetite) lines.push(`• 반응: ${currentAppetite}`);
    if (currentTags.length > 0) lines.push(`• 태그: ${currentTags.join(', ')}`);
    if (memoInput.value.trim()) lines.push(`• 메모: ${memoInput.value.trim()}`);

    const textToCopy = lines.join('\n');
    try {
      await navigator.clipboard.writeText(textToCopy);
      showToast('식단 요약이 클립보드에 복사되었습니다!', 'success');
    } catch (e) {
      showToast(textToCopy, 'info', 4000);
    }
  };
  wrap.appendChild(shareBtn);

  // 소아과 진료용 리포트 버튼
  const reportBtn = document.createElement('button');
  reportBtn.type = 'button';
  reportBtn.className = 'btn btn-primary btn-block';
  reportBtn.style.marginTop = '8px';
  reportBtn.textContent = '📋 소아과 진료용 식단 리포트 (최근 14일)';
  reportBtn.onclick = () => {
    openPediatricianReportModal(14);
  };
  wrap.appendChild(reportBtn);

  openSheet({
    title: '식단 상세',
    content: wrap
  });
}

/**
 * 소아과 진료용 식단 및 알레르기 관찰 리포트 모달 (최근 N일간 종합)
 */
export function openPediatricianReportModal(days = 14) {
  const today = getTodayYMD();
  const startDate = addDays(today, -(days - 1));
  const state = store.getState();
  const settings = state.settings;
  const babyName = settings.baby_name || '이은';
  const ingMap = store.getIngredientsMap();

  // 1. 기간 내 일자별 데이터 수집
  const dateList = [];
  let curr = startDate;
  while (curr <= today) {
    dateList.push(curr);
    curr = addDays(curr, 1);
  }

  let totalIntake = 0;
  let recordedDaysCount = 0;
  const allergyList = [];
  const dailyReports = [];

  // 전체 기간 중 각 재료의 첫 시도일 추적 (신규 재료 판별용)
  const allMeals = state.meals || [];
  const firstSeenMap = {};
  allMeals.forEach(m => {
    if (!firstSeenMap[m.ingredient_id] || m.date < firstSeenMap[m.ingredient_id]) {
      firstSeenMap[m.ingredient_id] = m.date;
    }
  });

  const periodNewIngredients = [];
  Object.keys(firstSeenMap).forEach(id => {
    const fDate = firstSeenMap[id];
    if (fDate >= startDate && fDate <= today) {
      const name = ingMap[id]?.name || id;
      periodNewIngredients.push({ name, date: fDate });
    }
  });

  dateList.forEach(d => {
    const meals = store.getMealsForDate(d);
    const dayLog = store.getDayLog(d) || {};
    const dayEaten = meals.reduce((sum, m) => sum + (parseFloat(m.grams) || 0), 0);

    let tags = [];
    if (dayLog.tags) {
      tags = typeof dayLog.tags === 'string' ? dayLog.tags.split(',').map(s => s.trim()).filter(Boolean) : dayLog.tags;
    }

    if (dayEaten > 0) {
      totalIntake += dayEaten;
      recordedDaysCount++;
    }

    // 알레르기/이상반응 여부 체크
    const symptomTags = tags.filter(t => t !== '알레르기 없음');
    const memo = dayLog.memo || '';
    const hasSymptomMemo = /발진|두드러기|설사|구토|가려움|알레르기/.test(memo);

    if (symptomTags.length > 0 || hasSymptomMemo) {
      allergyList.push({
        date: d,
        tags: symptomTags,
        memo: memo,
        ingredients: [...new Set(meals.map(m => m.name))].join(', ')
      });
    }

    if (meals.length > 0 || dayLog.appetite || tags.length > 0 || memo) {
      dailyReports.push({
        date: d,
        dow: getDayOfWeek(d),
        eatenGrams: dayEaten,
        meals: meals,
        appetite: dayLog.appetite || '',
        tags: tags,
        memo: memo
      });
    }
  });

  const avgIntake = recordedDaysCount > 0 ? Math.round(totalIntake / recordedDaysCount) : 0;

  // 2. 모달 DOM 생성
  const wrap = document.createElement('div');
  wrap.className = 'pediatrician-report';

  // 아기 정보 & 기간 헤더 카드
  const headerCard = document.createElement('div');
  headerCard.className = 'report-header-card';
  headerCard.innerHTML = `
    <div style="font-weight: 800; font-size: 1.05rem; margin-bottom: 4px;">🏥 [소아과 진료용] ${babyName} 식단 & 알레르기 리포트</div>
    <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.5;">
      • 분석 기간: <strong>${startDate} ~ ${today}</strong> (최근 ${days}일간)<br>
      • 생년월일: ${settings.birth_date || '미등록'} | 이유식 시작일: ${settings.solid_start_date || '미등록'}
    </div>
  `;
  wrap.appendChild(headerCard);

  // 핵심 요약 스탯 (일평균, 총 기록일, 신규재료, 이상반응)
  const statGrid = document.createElement('div');
  statGrid.style.display = 'grid';
  statGrid.style.gridTemplateColumns = 'repeat(4, 1fr)';
  statGrid.style.gap = '6px';
  statGrid.style.margin = '10px 0 14px 0';

  const stats = [
    { label: '일평균 섭취', val: `${avgIntake}g`, color: 'var(--primary)' },
    { label: '식단 기록일', val: `${recordedDaysCount}일`, color: 'var(--text-main)' },
    { label: '신규 시도', val: `${periodNewIngredients.length}종`, color: '#2E7D32' },
    { label: '주의 반응', val: `${allergyList.length}건`, color: allergyList.length > 0 ? 'var(--urgent-red)' : 'var(--text-muted)' }
  ];

  stats.forEach(st => {
    const box = document.createElement('div');
    box.style.background = 'var(--bg-sub)';
    box.style.borderRadius = 'var(--radius-sm)';
    box.style.padding = '8px 4px';
    box.style.textAlign = 'center';
    box.innerHTML = `
      <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600;">${st.label}</div>
      <div style="font-size: 1.05rem; font-weight: 800; color: ${st.color}; margin-top: 2px;">${st.val}</div>
    `;
    statGrid.appendChild(box);
  });
  wrap.appendChild(statGrid);

  // 알레르기/이상반응 경고 박스
  if (allergyList.length > 0) {
    const alertBox = document.createElement('div');
    alertBox.className = 'report-allergy-alert';

    const alertTitle = document.createElement('div');
    alertTitle.className = 'report-allergy-title';
    alertTitle.textContent = `🚨 진료 상담 필요: 특이 반응/증상 기록 (${allergyList.length}건)`;
    alertBox.appendChild(alertTitle);

    allergyList.forEach(al => {
      const row = document.createElement('div');
      row.style.fontSize = '0.82rem';
      row.style.marginTop = '4px';
      row.style.lineHeight = '1.4';
      const tagText = al.tags.length > 0 ? `[${al.tags.join(', ')}]` : '';
      const memoText = al.memo ? ` - ${al.memo}` : '';
      row.innerHTML = `<strong>• ${al.date.slice(5)}</strong>: <span style="color:var(--urgent-red); font-weight:700;">${tagText}</span> (섭취: ${al.ingredients || '기록 없음'})${memoText}`;
      alertBox.appendChild(row);
    });

    wrap.appendChild(alertBox);
  }

  // 신규 재료 박스
  if (periodNewIngredients.length > 0) {
    const newBox = document.createElement('div');
    newBox.style.background = '#E8F5E9';
    newBox.style.border = '1px solid #A5D6A7';
    newBox.style.borderRadius = 'var(--radius-sm)';
    newBox.style.padding = '8px 10px';
    newBox.style.fontSize = '0.82rem';
    newBox.style.marginBottom = '12px';
    newBox.style.color = '#1B5E20';

    const itemsStr = periodNewIngredients.map(it => `<strong>${it.name}</strong>(${it.date.slice(5)} 첫시도)`).join(', ');
    newBox.innerHTML = `🌱 <strong>기간 내 처음 시도한 재료:</strong> ${itemsStr}`;
    wrap.appendChild(newBox);
  }

  // 식단 상세 테이블
  const tableTitle = document.createElement('div');
  tableTitle.style.fontWeight = '700';
  tableTitle.style.fontSize = '0.9rem';
  tableTitle.style.marginBottom = '6px';
  tableTitle.textContent = `📋 최근 ${days}일 일자별 식단 상세`;
  wrap.appendChild(tableTitle);

  const tableWrap = document.createElement('div');
  tableWrap.style.overflowX = 'auto';
  tableWrap.style.marginBottom = '14px';

  const table = document.createElement('table');
  table.className = 'report-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th style="width: 22%;">날짜</th>
        <th style="width: 40%;">식단 및 섭취량</th>
        <th style="width: 20%;">반응/증상</th>
        <th style="width: 18%;">메모</th>
      </tr>
    </thead>
    <tbody>
      ${dailyReports.reverse().map(r => {
        const mealSummary = r.meals.map(m => `${m.name} ${m.grams}g`).join(', ') || '-';
        const reactionStr = [r.appetite, ...r.tags].filter(Boolean).join(' ') || '-';
        return `
          <tr>
            <td><strong>${r.date.slice(5)}</strong><br><small style="color:var(--text-muted);">(${r.dow})</small></td>
            <td>
              <div style="font-weight:700; color:var(--primary);">${r.eatenGrams}g</div>
              <small style="color:var(--text-muted);">${mealSummary}</small>
            </td>
            <td>${reactionStr}</td>
            <td><small>${r.memo || '-'}</small></td>
          </tr>
        `;
      }).join('')}
    </tbody>
  `;
  tableWrap.appendChild(table);
  wrap.appendChild(tableWrap);

  // 텍스트 생성 헬퍼
  function buildReportText() {
    const lines = [
      `🏥 [소아과 진료용 이유식 리포트]`,
      `• 아기: ${babyName} (${settings.birth_date ? `생년월일: ${settings.birth_date}` : ''})`,
      `• 조회 기간: ${startDate} ~ ${today} (${days}일간)`,
      `• 일평균 섭취량: ${avgIntake}g (총 ${recordedDaysCount}일 기록)`,
      '--------------------------------'
    ];

    if (periodNewIngredients.length > 0) {
      lines.push(`🌱 [기간 내 첫 시도 재료]`);
      lines.push(periodNewIngredients.map(it => `- ${it.name} (${it.date} 첫시도)`).join('\n'));
      lines.push('--------------------------------');
    }

    if (allergyList.length > 0) {
      lines.push(`🚨 [특이 반응 및 알레르기 관찰 (${allergyList.length}건)]`);
      allergyList.forEach(al => {
        lines.push(`• ${al.date}: [${al.tags.join(', ')}] ${al.memo ? `(${al.memo})` : ''} / 섭취: ${al.ingredients}`);
      });
      lines.push('--------------------------------');
    } else {
      lines.push(`✅ [특이 이상반응 없음]`);
      lines.push('--------------------------------');
    }

    lines.push(`📋 [일자별 식단 요약]`);
    dailyReports.forEach(r => {
      const mealParts = r.meals.map(m => `${m.name} ${m.grams}g`).join(', ');
      const reactionParts = [r.appetite, ...r.tags].filter(Boolean).join(' ');
      lines.push(`• ${r.date}(${r.dow}) [${r.eatenGrams}g]: ${mealParts} ${reactionParts ? `| 반응: ${reactionParts}` : ''} ${r.memo ? `| 메모: ${r.memo}` : ''}`);
    });

    lines.push('--------------------------------');
    lines.push('🍚 이유식 일기에서 출력됨');
    return lines.join('\n');
  }

  // 액션 버튼 행 (복사, 공유, 인쇄)
  const actRow = document.createElement('div');
  actRow.style.display = 'grid';
  actRow.style.gridTemplateColumns = '1fr 1fr 1fr';
  actRow.style.gap = '8px';
  actRow.style.marginTop = '12px';

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'btn btn-outline btn-sm';
  copyBtn.textContent = '📋 텍스트 복사';
  copyBtn.onclick = async () => {
    const text = buildReportText();
    try {
      await navigator.clipboard.writeText(text);
      showToast('소아과 진료용 리포트가 복사되었습니다!', 'success');
    } catch (e) {
      showToast(text, 'info', 4000);
    }
  };

  const shareBtn = document.createElement('button');
  shareBtn.type = 'button';
  shareBtn.className = 'btn btn-primary btn-sm';
  shareBtn.textContent = '💬 공유하기';
  shareBtn.onclick = async () => {
    const text = buildReportText();
    if (navigator.share) {
      try {
        await navigator.share({
          title: `[소아과 리포트] ${babyName} 이유식 식단 기록`,
          text: text
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          await navigator.clipboard.writeText(text);
          showToast('리포트가 복사되었습니다!', 'success');
        }
      }
    } else {
      await navigator.clipboard.writeText(text);
      showToast('리포트가 복사되었습니다! 카톡 등에 붙여넣으세요.', 'success');
    }
  };

  const printBtn = document.createElement('button');
  printBtn.type = 'button';
  printBtn.className = 'btn btn-outline btn-sm';
  printBtn.textContent = '🖨️ 인쇄/PDF';
  printBtn.onclick = () => {
    window.print();
  };

  actRow.appendChild(copyBtn);
  actRow.appendChild(shareBtn);
  actRow.appendChild(printBtn);
  wrap.appendChild(actRow);

  openSheet({
    title: '🏥 소아과 진료용 식단 리포트',
    content: wrap
  });
}

