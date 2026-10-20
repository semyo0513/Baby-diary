/**
 * daySheet.js - 하루 상세 식단 및 반응 기록 바텀 시트
 * 풀 문장 헤더: 10/15(목) 이은175일차, 이유식7일차
 * 끼니별 식단 목록, 삭제/복구, 반응(이모지), 태그, 메모, 텍스트 복사/공유
 */

import { store } from '../store.js';
import { openSheet, closeSheet } from '../ui/sheet.js';
import { openEntrySheet } from './entrySheet.js';
import { formatDaySummary } from '../dates.js';
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

      const cardHead = document.createElement('div');
      cardHead.style.fontWeight = '700';
      cardHead.style.fontSize = '0.92rem';
      cardHead.style.marginBottom = '8px';
      cardHead.textContent = `🍚 ${no}번째 끼니`;
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

        const left = document.createElement('div');
        left.style.display = 'flex';
        left.style.alignItems = 'center';
        left.style.gap = '8px';

        const dot = document.createElement('span');
        dot.className = 'chip-dot';
        dot.style.backgroundColor = ing ? ing.color : '#4DB6AC';

        const nameTxt = document.createElement('span');
        nameTxt.style.fontWeight = '600';
        nameTxt.textContent = it.name;

        const gramsTxt = document.createElement('span');
        gramsTxt.style.color = 'var(--text-muted)';
        gramsTxt.style.fontSize = '0.85rem';
        const isCube = String(it.use_cube).toUpperCase() !== 'FALSE';
        let infoStr = `${it.grams}g`;
        if (isCube) {
          if (it.prepared_grams && parseFloat(it.prepared_grams) !== parseFloat(it.grams)) {
            infoStr += ` (분출 ${it.prepared_grams}g / ${it.cubes_used}큐브)`;
          } else {
            infoStr += ` (${it.cubes_used || 1}큐브)`;
          }
        }
        gramsTxt.textContent = infoStr;

        left.appendChild(dot);
        left.appendChild(nameTxt);
        left.appendChild(gramsTxt);

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
  const defaultTags = ['알레르기 없음', '변비', '설사', '발진', '구토'];

  function renderTags() {
    while (tagRow.firstChild) tagRow.removeChild(tagRow.firstChild);
    defaultTags.forEach(t => {
      const isSel = currentTags.includes(t);
      const chip = createTagChip(t, isSel, () => {
        if (isSel) {
          currentTags = currentTags.filter(x => x !== t);
        } else {
          currentTags.push(t);
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

  openSheet({
    title: '식단 상세',
    content: wrap
  });
}
