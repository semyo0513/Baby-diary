/**
 * entrySheet.js - 식단 기록 및 수정 바텀 시트
 * - 3탭 이내 빠른 입력 (재료 선택 -> 분출/섭취량 확인 -> 저장)
 * - 수정 모드 완벽 지원 (editItem 전달 시 해당 항목 수정)
 * - 20g 분출 후 15g 섭취 시: 큐브는 1개 차감, 실제 섭취량(15g)과 분출량(20g) 각각 별도 기록
 */

import { store } from '../store.js';
import { openSheet, closeSheet } from '../ui/sheet.js';
import { createIngredientChip, createGramChip } from '../ui/chip.js';
import { createStepper } from '../ui/stepper.js';
import { showToast } from '../ui/toast.js';
import { getTodayYMD, addDays } from '../dates.js';

export function openEntrySheet(initialDate = null, initialMealNo = 1, editItem = null) {
  const isEdit = Boolean(editItem);
  const date = initialDate || (editItem ? editItem.date : null) || store.getState().selectedDate || getTodayYMD();
  const state = store.getState();
  const ingredients = state.ingredients.filter(i => String(i.active).toUpperCase() !== 'FALSE');

  let mealNo = editItem ? (editItem.meal_no || 1) : initialMealNo;
  let selectedIng = editItem
    ? (ingredients.find(i => i.id === editItem.ingredient_id) || ingredients[0])
    : (ingredients[0] || null);

  let cubeG = selectedIng && parseFloat(selectedIng.cube_g) > 0 ? parseFloat(selectedIng.cube_g) : 20;

  // 큐브 차감 여부
  let useCube = editItem
    ? (editItem.use_cube !== false && String(editItem.use_cube).toUpperCase() !== 'FALSE')
    : true;

  // 큐브 분출 개수
  let cubesCount = 1;
  if (editItem) {
    cubesCount = editItem.cubes_used !== undefined ? parseFloat(editItem.cubes_used) : 1;
  }

  // 준비/분출량 (g)
  let preparedGrams = editItem && editItem.prepared_grams !== undefined
    ? parseFloat(editItem.prepared_grams)
    : (useCube ? cubesCount * cubeG : cubeG);

  // 실제 섭취량 (g)
  let actualGrams = editItem
    ? parseFloat(editItem.grams)
    : preparedGrams;

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
  dateLabel.textContent = `${date} ${isEdit ? '(수정 모드)' : ''}`;

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

  // 2. 어제와 같이 퀵 버튼 (수정 모드가 아닐 때만 노출)
  if (!isEdit) {
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
        const copiedMeals = [
          {
            meal_no: 1,
            items: yesterdayMeals.map(m => ({
              ingredient_id: m.ingredient_id,
              name: m.name,
              grams: m.grams,
              prepared_grams: m.prepared_grams,
              cubes_used: m.cubes_used,
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
  }

  // 3. 재료 선택 칩 목록
  const ingLabel = document.createElement('div');
  ingLabel.className = 'form-label';
  ingLabel.textContent = '1. 재료 선택';
  wrap.appendChild(ingLabel);

  const ingChipGroup = document.createElement('div');
  ingChipGroup.className = 'chip-group';
  wrap.appendChild(ingChipGroup);

  // 4. 큐브 분출 설정 박스
  const cubeBox = document.createElement('div');
  cubeBox.className = 'card';
  cubeBox.style.padding = '12px 14px';
  cubeBox.style.marginTop = '10px';
  cubeBox.style.marginBottom = '12px';

  const cubeBoxHeader = document.createElement('div');
  cubeBoxHeader.style.display = 'flex';
  cubeBoxHeader.style.alignItems = 'center';
  cubeBoxHeader.style.justifyContent = 'space-between';
  cubeBoxHeader.style.marginBottom = '8px';

  const cubeTitle = document.createElement('div');
  cubeTitle.style.fontWeight = '700';
  cubeTitle.style.fontSize = '0.92rem';
  cubeTitle.textContent = '🧊 냉동 큐브 분출 (꺼낸 개수)';
  cubeBoxHeader.appendChild(cubeTitle);

  // 큐브 차감 여부 토글
  const toggleLabel = document.createElement('label');
  toggleLabel.style.display = 'flex';
  toggleLabel.style.alignItems = 'center';
  toggleLabel.style.gap = '6px';
  toggleLabel.style.fontSize = '0.82rem';
  toggleLabel.style.cursor = 'pointer';

  const toggleCheck = document.createElement('input');
  toggleCheck.type = 'checkbox';
  toggleCheck.checked = useCube;
  toggleCheck.onchange = () => {
    useCube = toggleCheck.checked;
    updateUI();
  };

  const toggleText = document.createElement('span');
  toggleText.textContent = '재고 차감';
  toggleLabel.appendChild(toggleCheck);
  toggleLabel.appendChild(toggleText);
  cubeBoxHeader.appendChild(toggleLabel);
  cubeBox.appendChild(cubeBoxHeader);

  // 큐브 개수 스텝퍼 & 퀵 칩
  const cubeControls = document.createElement('div');

  const cubeStepper = createStepper({
    value: cubesCount,
    min: 0.5,
    max: 10,
    step: 0.5,
    unit: '개',
    onChange: (val) => {
      cubesCount = val;
      preparedGrams = Math.round(cubesCount * cubeG);
      // 먹은 양이 이전 분출량과 동일했으면 자동 동기화
      if (actualGrams === 0 || actualGrams === Math.round((val - 0.5) * cubeG)) {
        actualGrams = preparedGrams;
        eatenStepper.setValue(actualGrams);
      }
      updateUI();
    }
  });
  cubeControls.appendChild(cubeStepper);

  // 큐브 퀵 칩 (1개, 2개, 3개)
  const cubeQuickGroup = document.createElement('div');
  cubeQuickGroup.className = 'chip-group';
  cubeQuickGroup.style.margin = '6px 0 0 0';

  [1, 2, 3, 4].forEach(c => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip ${c === cubesCount ? 'chip-selected' : ''}`;
    chip.textContent = `${c}개 (${c * cubeG}g)`;
    chip.onclick = () => {
      cubesCount = c;
      cubeStepper.setValue(c);
      preparedGrams = Math.round(c * cubeG);
      actualGrams = preparedGrams;
      eatenStepper.setValue(actualGrams);
      updateUI();
    };
    cubeQuickGroup.appendChild(chip);
  });
  cubeControls.appendChild(cubeQuickGroup);
  cubeBox.appendChild(cubeControls);
  wrap.appendChild(cubeBox);

  // 5. 실제 섭취량 (아이에게 먹인 양 g) 박스
  const eatenBox = document.createElement('div');
  eatenBox.className = 'card';
  eatenBox.style.padding = '12px 14px';
  eatenBox.style.marginBottom = '14px';

  const eatenTitle = document.createElement('div');
  eatenTitle.style.fontWeight = '700';
  eatenTitle.style.fontSize = '0.92rem';
  eatenTitle.style.marginBottom = '8px';
  eatenTitle.textContent = '🍽️ 실제 섭취량 (아이가 먹은 g)';
  eatenBox.appendChild(eatenTitle);

  // 실제 섭취량 스텝퍼
  const eatenStepper = createStepper({
    value: actualGrams,
    min: 0,
    max: 300,
    step: 5,
    unit: 'g',
    onChange: (val) => {
      actualGrams = val;
      updateUI();
    }
  });
  eatenBox.appendChild(eatenStepper);

  // 실제 섭취량 퀵 칩 (완밥, 10, 15, 20, 30, 40, 50)
  const eatenQuickGroup = document.createElement('div');
  eatenQuickGroup.className = 'chip-group';
  eatenQuickGroup.style.margin = '8px 0 0 0';

  function renderEatenQuickChips() {
    while (eatenQuickGroup.firstChild) {
      eatenQuickGroup.removeChild(eatenQuickGroup.firstChild);
    }

    // 완밥 칩
    const allChip = document.createElement('button');
    allChip.type = 'button';
    allChip.className = `chip ${actualGrams === preparedGrams ? 'chip-selected' : ''}`;
    allChip.textContent = `완밥 (${preparedGrams}g)`;
    allChip.onclick = () => {
      actualGrams = preparedGrams;
      eatenStepper.setValue(actualGrams);
      updateUI();
    };
    eatenQuickGroup.appendChild(allChip);

    // 일반 그램 칩
    [10, 15, 20, 25, 30, 40, 50].forEach(g => {
      if (g === preparedGrams) return;
      const chip = createGramChip(g, g === actualGrams, (newG) => {
        actualGrams = newG;
        eatenStepper.setValue(actualGrams);
        updateUI();
      });
      eatenQuickGroup.appendChild(chip);
    });
  }
  eatenBox.appendChild(eatenQuickGroup);
  wrap.appendChild(eatenBox);

  // 6. 결과 요약 및 안내 배지
  const statusBadge = document.createElement('div');
  statusBadge.style.borderRadius = 'var(--radius-md)';
  statusBadge.style.padding = '10px 14px';
  statusBadge.style.fontSize = '0.88rem';
  statusBadge.style.fontWeight = '600';
  statusBadge.style.lineHeight = '1.45';
  statusBadge.style.marginBottom = '16px';
  wrap.appendChild(statusBadge);

  function updateUI() {
    cubeG = selectedIng && parseFloat(selectedIng.cube_g) > 0 ? parseFloat(selectedIng.cube_g) : 20;

    if (!useCube) {
      cubeControls.style.opacity = '0.4';
      cubeControls.style.pointerEvents = 'none';
      statusBadge.style.backgroundColor = 'var(--bg-sub)';
      statusBadge.style.color = 'var(--text-main)';
      statusBadge.style.border = '1px solid var(--border-color)';
      statusBadge.textContent = `🍳 직접 조리 / 생재료 ${actualGrams}g 섭취 (큐브 재고 차감 없음)`;
    } else {
      cubeControls.style.opacity = '1';
      cubeControls.style.pointerEvents = 'auto';

      // 퀵 칩 라벨 갱신
      Array.from(cubeQuickGroup.children).forEach((c, idx) => {
        const cnt = idx + 1;
        c.className = `chip ${cnt === cubesCount ? 'chip-selected' : ''}`;
        c.textContent = `${cnt}개 (${cnt * cubeG}g)`;
      });

      renderEatenQuickChips();

      if (actualGrams === preparedGrams) {
        statusBadge.style.backgroundColor = 'var(--safe-green-light)';
        statusBadge.style.color = '#2E7D32';
        statusBadge.style.border = '1px solid #A5D6A7';
        statusBadge.textContent = `😋 ${preparedGrams}g 완밥! · 냉동 큐브 ${cubesCount}개 차감`;
      } else if (actualGrams < preparedGrams) {
        const leftGrams = preparedGrams - actualGrams;
        statusBadge.style.backgroundColor = 'var(--warn-orange-light)';
        statusBadge.style.color = '#E65100';
        statusBadge.style.border = '1px solid #FFE082';
        statusBadge.textContent = `⚠️ 분출 ${preparedGrams}g 중 ${actualGrams}g 섭취 (${leftGrams}g 남김) · 큐브는 ${cubesCount}개 차감`;
      } else {
        statusBadge.style.backgroundColor = 'var(--primary-light)';
        statusBadge.style.color = 'var(--primary)';
        statusBadge.style.border = '1px solid var(--primary-border)';
        statusBadge.textContent = `💡 분출량(${preparedGrams}g)보다 많은 ${actualGrams}g 섭취 · 큐브 ${cubesCount}개 차감`;
      }
    }
  }

  // 재료 칩 렌더링 함수
  function renderIngChips() {
    while (ingChipGroup.firstChild) {
      ingChipGroup.removeChild(ingChipGroup.firstChild);
    }
    ingredients.forEach(ing => {
      const isSel = selectedIng && selectedIng.id === ing.id;
      const chip = createIngredientChip(ing, isSel, (clickedIng) => {
        selectedIng = clickedIng;
        cubeG = parseFloat(clickedIng.cube_g) || 20;

        if (!isEdit) {
          preparedGrams = Math.round(cubesCount * cubeG);
          actualGrams = preparedGrams;
          eatenStepper.setValue(actualGrams);
        }
        updateUI();
        renderIngChips();
      });
      ingChipGroup.appendChild(chip);
    });
  }

  renderIngChips();
  updateUI();

  // 7. 저장 버튼
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn-primary btn-block';
  saveBtn.style.marginTop = '8px';
  saveBtn.textContent = isEdit ? '수정사항 저장하기' : '식단 저장하기';
  saveBtn.onclick = async () => {
    if (!selectedIng) {
      showToast('재료를 선택해주세요.', 'error');
      return;
    }

    const currentDayMeals = store.getMealsForDate(date);
    const targetItemId = editItem ? editItem.id : null;

    // 기존 항목 목록에서 수정 또는 신규 추가
    const otherItems = currentDayMeals.filter(m => m.id !== targetItemId);

    const savedItem = {
      id: targetItemId || ('item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
      meal_no: mealNo,
      ingredient_id: selectedIng.id,
      name: selectedIng.name,
      grams: actualGrams,
      prepared_grams: useCube ? preparedGrams : actualGrams,
      cubes_used: useCube ? cubesCount : 0,
      use_cube: useCube
    };

    const combined = [...otherItems, savedItem];

    // 끼니 번호별 그룹화
    const grouped = {};
    for (const it of combined) {
      const no = it.meal_no || 1;
      if (!grouped[no]) grouped[no] = [];
      grouped[no].push({
        id: it.id,
        ingredient_id: it.ingredient_id,
        name: it.name,
        grams: it.grams,
        prepared_grams: it.prepared_grams,
        cubes_used: it.cubes_used,
        use_cube: it.use_cube !== false && String(it.use_cube).toUpperCase() !== 'FALSE'
      });
    }

    const payloadMeals = Object.keys(grouped).map(no => ({
      meal_no: parseInt(no, 10),
      items: grouped[no]
    }));

    await store.saveDayMeals(date, payloadMeals, store.getDayLog(date));
    showToast(isEdit ? `${selectedIng.name} 식단 수정 완료!` : `${selectedIng.name} ${actualGrams}g 기록 완료!`, 'success');
    closeSheet();
  };

  wrap.appendChild(saveBtn);

  // 수정 모드일 때 삭제 버튼 제공
  if (isEdit) {
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn btn-outline btn-block btn-sm';
    deleteBtn.style.marginTop = '8px';
    deleteBtn.style.color = 'var(--urgent-red)';
    deleteBtn.textContent = '이 식단 기록 삭제 (재고 자동 복구)';
    deleteBtn.onclick = async () => {
      if (confirm(`${editItem.name} 기록을 삭제하시겠습니까? (차감된 큐브 재고는 복구됩니다)`)) {
        await store.deleteMealItem(date, editItem.id);
        showToast(`${editItem.name} 기록 삭제 및 재고 복구 완료`, 'info');
        closeSheet();
      }
    };
    wrap.appendChild(deleteBtn);
  }

  openSheet({
    title: isEdit ? '식단 기록 수정' : '식단 기록',
    content: wrap
  });
}
