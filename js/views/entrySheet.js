/**
 * entrySheet.js - 3탭 이내 빠른 식단 기록 바텀 시트
 * 1탭: 시트 열림 (기본: 오늘, 최근 끼니)
 * 2탭: 재료 칩 선택 (직전 그램 자동 채움, 퀵 칩 선택)
 * 3탭: 저장 (즉시 낙관적 반영)
 */

import { store } from '../store.js';
import { openSheet, closeSheet } from '../ui/sheet.js';
import { createIngredientChip, createGramChip } from '../ui/chip.js';
import { createStepper } from '../ui/stepper.js';
import { showToast } from '../ui/toast.js';
import { getTodayYMD, addDays } from '../dates.js';

export function openEntrySheet(initialDate = null, initialMealNo = 1) {
  const date = initialDate || store.getState().selectedDate || getTodayYMD();
  const state = store.getState();
  const ingredients = state.ingredients.filter(i => String(i.active).toUpperCase() !== 'FALSE');

  let selectedIng = ingredients[0] || null;
  let grams = selectedIng ? (selectedIng.cube_g || 30) : 30;
  let useCube = true;
  let mealNo = initialMealNo;

  // 컨테이너 엘리먼트 빌드
  const wrap = document.createElement('div');
  wrap.className = 'entry-sheet-content';

  // 1. 날짜 및 끼니 헤더
  const headerRow = document.createElement('div');
  headerRow.style.display = 'flex';
  headerRow.style.alignItems = 'center';
  headerRow.style.justifyContent = 'space-between';
  headerRow.style.marginBottom = '14px';

  const dateLabel = document.createElement('span');
  dateLabel.style.fontWeight = '700';
  dateLabel.style.fontSize = '1.05rem';
  dateLabel.textContent = date;

  // 끼니 선택 (1끼, 2끼, 3끼)
  const mealNoGroup = document.createElement('div');
  mealNoGroup.style.display = 'flex';
  mealNoGroup.style.gap = '6px';

  [1, 2, 3].forEach(no => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-sm ${no === mealNo ? 'btn-primary' : 'btn-outline'}`;
    btn.textContent = `${no}끼`;
    btn.onclick = () => {
      mealNo = no;
      Array.from(mealNoGroup.children).forEach((c, idx) => {
        c.className = `btn btn-sm ${idx + 1 === mealNo ? 'btn-primary' : 'btn-outline'}`;
      });
    };
    mealNoGroup.appendChild(btn);
  });

  headerRow.appendChild(dateLabel);
  headerRow.appendChild(mealNoGroup);
  wrap.appendChild(headerRow);

  // 2. 어제와 같이 퀵 버튼
  const yesterdayDate = addDays(date, -1);
  const yesterdayMeals = store.getMealsForDate(yesterdayDate);
  if (yesterdayMeals.length > 0) {
    const copyYesterdayBtn = document.createElement('button');
    copyYesterdayBtn.type = 'button';
    copyYesterdayBtn.className = 'btn btn-outline btn-block btn-sm';
    copyYesterdayBtn.style.marginBottom = '14px';
    copyYesterdayBtn.style.color = 'var(--primary)';
    copyYesterdayBtn.textContent = `⚡ 어제(${yesterdayDate.slice(5)}) 식단 그대로 복사하기`;
    copyYesterdayBtn.onclick = async () => {
      // 어제 식단 복사
      const copiedMeals = [
        {
          meal_no: 1,
          items: yesterdayMeals.map(m => ({
            ingredient_id: m.ingredient_id,
            name: m.name,
            grams: m.grams,
            use_cube: String(m.use_cube).toUpperCase() !== 'FALSE'
          }))
        }
      ];
      await store.saveDayMeals(date, copiedMeals, store.getDayLog(yesterdayDate));
      showToast('어제 식단을 복사했습니다.', 'success');
      closeSheet();
    };
    wrap.appendChild(copyYesterdayBtn);
  }

  // 3. 재료 칩 목록
  const ingLabel = document.createElement('div');
  ingLabel.className = 'form-label';
  ingLabel.textContent = '재료 선택 (2번째 탭)';
  wrap.appendChild(ingLabel);

  const ingChipGroup = document.createElement('div');
  ingChipGroup.className = 'chip-group';
  wrap.appendChild(ingChipGroup);

  // 4. 그램 및 큐브 환산 UI
  const gramLabel = document.createElement('div');
  gramLabel.className = 'form-label';
  gramLabel.style.marginTop = '12px';
  gramLabel.textContent = '섭취량 (g)';
  wrap.appendChild(gramLabel);

  // 큐브 환산 정보 표시
  const cubeConversionBadge = document.createElement('div');
  cubeConversionBadge.style.fontSize = '0.9rem';
  cubeConversionBadge.style.fontWeight = '600';
  cubeConversionBadge.style.color = 'var(--primary)';
  cubeConversionBadge.style.marginBottom = '8px';

  function updateConversionText() {
    if (!selectedIng) return;
    const cubeG = parseFloat(selectedIng.cube_g) || 30;
    const cubes = Math.round((grams / cubeG) * 100) / 100;
    cubeConversionBadge.textContent = `💡 ${grams}g = 약 ${cubes}개 큐브 (1개 ${cubeG}g 기준)`;
  }

  // 퀵 그램 칩 (10, 20, 30, 50)
  const quickGramGroup = document.createElement('div');
  quickGramGroup.className = 'chip-group';
  [10, 20, 30, 40, 50].forEach(g => {
    const chip = createGramChip(g, g === grams, (newG) => {
      grams = newG;
      stepper.setValue(grams);
      updateConversionText();
      Array.from(quickGramGroup.children).forEach(c => c.classList.remove('chip-selected'));
      chip.classList.add('chip-selected');
    });
    quickGramGroup.appendChild(chip);
  });
  wrap.appendChild(quickGramGroup);

  // 스텝퍼
  const stepper = createStepper({
    value: grams,
    min: 5,
    max: 300,
    step: 5,
    unit: 'g',
    onChange: (newVal) => {
      grams = newVal;
      updateConversionText();
    }
  });
  wrap.appendChild(stepper);
  wrap.appendChild(cubeConversionBadge);

  // 5. 큐브 차감 여부 토글
  const toggleRow = document.createElement('label');
  toggleRow.style.display = 'flex';
  toggleRow.style.alignItems = 'center';
  toggleRow.style.gap = '8px';
  toggleRow.style.margin = '14px 0';
  toggleRow.style.fontSize = '0.9rem';
  toggleRow.style.cursor = 'pointer';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = useCube;
  checkbox.onchange = () => { useCube = checkbox.checked; };

  const toggleText = document.createElement('span');
  toggleText.textContent = '🧊 냉동 큐브 재고에서 자동 차감하기';

  toggleRow.appendChild(checkbox);
  toggleRow.appendChild(toggleText);
  wrap.appendChild(toggleRow);

  // 재료 칩 렌더링 함수
  function renderIngChips() {
    while (ingChipGroup.firstChild) {
      ingChipGroup.removeChild(ingChipGroup.firstChild);
    }
    ingredients.forEach(ing => {
      const isSel = selectedIng && selectedIng.id === ing.id;
      const chip = createIngredientChip(ing, isSel, (clickedIng) => {
        selectedIng = clickedIng;
        // 직전 섭취 그램 또는 큐브 기본 용량 자동 채움
        const prevMeals = store.getState().meals.filter(m => m.ingredient_id === clickedIng.id);
        if (prevMeals.length > 0) {
          grams = parseFloat(prevMeals[prevMeals.length - 1].grams) || clickedIng.cube_g || 30;
        } else {
          grams = clickedIng.cube_g || 30;
        }
        stepper.setValue(grams);
        updateConversionText();
        renderIngChips();
      });
      ingChipGroup.appendChild(chip);
    });
  }

  renderIngChips();
  updateConversionText();

  // 6. 저장 버튼 (3번째 탭)
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn-primary btn-block';
  saveBtn.style.marginTop = '16px';
  saveBtn.textContent = '저장하기 (3번째 탭)';
  saveBtn.onclick = async () => {
    if (!selectedIng) {
      showToast('재료를 선택해주세요.', 'error');
      return;
    }

    const currentDayMeals = store.getMealsForDate(date);
    // 기존 같은 끼니가 있으면 병합, 없으면 새 끼니 생성
    let mealBucket = currentDayMeals.find(m => (m.meal_no || 1) === mealNo);
    const existingItems = currentDayMeals
      .filter(m => (m.meal_no || 1) === mealNo)
      .map(m => ({
        ingredient_id: m.ingredient_id,
        name: m.name,
        grams: m.grams,
        use_cube: String(m.use_cube).toUpperCase() !== 'FALSE'
      }));

    existingItems.push({
      ingredient_id: selectedIng.id,
      name: selectedIng.name,
      grams: grams,
      use_cube: useCube
    });

    const otherMeals = [];
    const grouped = {};
    for (const m of currentDayMeals) {
      const no = m.meal_no || 1;
      if (no === mealNo) continue;
      if (!grouped[no]) grouped[no] = [];
      grouped[no].push({
        ingredient_id: m.ingredient_id,
        name: m.name,
        grams: m.grams,
        use_cube: String(m.use_cube).toUpperCase() !== 'FALSE'
      });
    }

    const payloadMeals = [
      { meal_no: mealNo, items: existingItems },
      ...Object.keys(grouped).map(no => ({ meal_no: parseInt(no, 10), items: grouped[no] }))
    ];

    await store.saveDayMeals(date, payloadMeals, store.getDayLog(date));
    showToast(`${selectedIng.name} ${grams}g 기록 완료!`, 'success');
    closeSheet();
  };

  wrap.appendChild(saveBtn);

  openSheet({
    title: '식단 기록',
    content: wrap
  });
}
