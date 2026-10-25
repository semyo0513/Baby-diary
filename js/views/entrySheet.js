/**
 * entrySheet.js - 한 끼 다중 큐브 일괄 기록 및 수정 바텀 시트
 * - 한 번의 입력으로 여러 개의 큐브(재료)를 장바구니처럼 담아 한 번에 일괄 기록
 * - 각 큐브별 분출량(큐브 개수 * cube_g)과 실제 섭취량(g)을 각각 또는 전체 완밥으로 손쉽게 조절
 * - 수정 모드 완벽 지원 (editItem 전달 시 해당 항목 및 끼니 편집)
 */

import { store } from '../store.js';
import { openSheet, closeSheet } from '../ui/sheet.js';
import { createIngredientChip } from '../ui/chip.js';
import { createStepper } from '../ui/stepper.js';
import { showToast } from '../ui/toast.js';
import { getTodayYMD, addDays } from '../dates.js';

export function openEntrySheet(initialDate = null, initialMealNo = 1, editItem = null) {
  const isEdit = Boolean(editItem);
  const date = initialDate || (editItem ? editItem.date : null) || store.getState().selectedDate || getTodayYMD();
  const state = store.getState();
  const ingredients = state.ingredients.filter(i => String(i.active).toUpperCase() !== 'FALSE');
  const ingMap = store.getIngredientsMap();

  let mealNo = editItem ? (editItem.meal_no || 1) : initialMealNo;

  // 장바구니에 담긴 큐브 목록
  // [{ ingredient, cubesCount, cubeG, preparedGrams, actualGrams, useCube, id }]
  let selectedItems = [];

  if (editItem) {
    const ing = ingMap[editItem.ingredient_id] || { id: editItem.ingredient_id, name: editItem.name, cube_g: 20, color: '#4DB6AC' };
    const cubeG = parseFloat(ing.cube_g) || 20;
    const cubesCount = editItem.cubes_used !== undefined ? parseFloat(editItem.cubes_used) : 1;
    const preparedGrams = editItem.prepared_grams !== undefined ? parseFloat(editItem.prepared_grams) : Math.round(cubesCount * cubeG);
    const actualGrams = editItem.grams !== undefined ? parseFloat(editItem.grams) : preparedGrams;
    const useCube = editItem.use_cube !== false && String(editItem.use_cube).toUpperCase() !== 'FALSE';

    selectedItems.push({
      id: editItem.id,
      ingredient: ing,
      cubesCount: cubesCount,
      cubeG: cubeG,
      preparedGrams: preparedGrams,
      actualGrams: actualGrams,
      useCube: useCube
    });
  } else {
    // 신규 입력일 때 기본으로 첫 번째 재료 하나 담기
    if (ingredients.length > 0) {
      const firstIng = ingredients[0];
      const cubeG = parseFloat(firstIng.cube_g) || 20;
      selectedItems.push({
        id: null,
        ingredient: firstIng,
        cubesCount: 1,
        cubeG: cubeG,
        preparedGrams: cubeG,
        actualGrams: cubeG,
        useCube: true
      });
    }
  }

  // DOM 래퍼 생성
  const wrap = document.createElement('div');
  wrap.className = 'entry-sheet-content';

  // 1. 상단 날짜 및 끼니 헤더
  const headerRow = document.createElement('div');
  headerRow.style.display = 'flex';
  headerRow.style.alignItems = 'center';
  headerRow.style.justifyContent = 'space-between';
  headerRow.style.marginBottom = '14px';

  const dateLabel = document.createElement('span');
  dateLabel.style.fontWeight = '700';
  dateLabel.style.fontSize = '1.05rem';
  dateLabel.textContent = `${date} ${isEdit ? '(수정 모드)' : ''}`;

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

  // 2. 어제와 같이 퀵 버튼 (신규 등록일 때만)
  if (!isEdit) {
    const yesterdayDate = addDays(date, -1);
    const yesterdayMeals = store.getMealsForDate(yesterdayDate);
    if (yesterdayMeals.length > 0) {
      const copyYesterdayBtn = document.createElement('button');
      copyYesterdayBtn.type = 'button';
      copyYesterdayBtn.className = 'btn btn-outline btn-block btn-sm';
      copyYesterdayBtn.style.marginBottom = '14px';
      copyYesterdayBtn.style.color = 'var(--primary)';
      copyYesterdayBtn.textContent = `⚡ 어제(${yesterdayDate.slice(5)}) 식단 그대로 불러오기`;
      copyYesterdayBtn.onclick = () => {
        selectedItems = yesterdayMeals.map(m => {
          const ing = ingMap[m.ingredient_id] || { id: m.ingredient_id, name: m.name, cube_g: 20, color: '#4DB6AC' };
          const cubeG = parseFloat(ing.cube_g) || 20;
          const cubesCount = m.cubes_used !== undefined ? parseFloat(m.cubes_used) : 1;
          const preparedGrams = m.prepared_grams !== undefined ? parseFloat(m.prepared_grams) : Math.round(cubesCount * cubeG);
          const actualGrams = m.grams !== undefined ? parseFloat(m.grams) : preparedGrams;
          return {
            id: null,
            ingredient: ing,
            cubesCount: cubesCount,
            cubeG: cubeG,
            preparedGrams: preparedGrams,
            actualGrams: actualGrams,
            useCube: m.use_cube !== false && String(m.use_cube).toUpperCase() !== 'FALSE'
          };
        });
        renderAll();
        showToast('어제 식단 구성을 불러왔습니다.', 'info');
      };
      wrap.appendChild(copyYesterdayBtn);
    }
  }

  // 3. 재료 선택 섹션 (다중 선택 안내)
  const ingSection = document.createElement('div');
  ingSection.style.marginBottom = '14px';

  const ingTitleRow = document.createElement('div');
  ingTitleRow.style.display = 'flex';
  ingTitleRow.style.justifyContent = 'space-between';
  ingTitleRow.style.alignItems = 'center';
  ingTitleRow.style.marginBottom = '6px';

  const ingLabel = document.createElement('div');
  ingLabel.className = 'form-label';
  ingLabel.style.margin = '0';
  ingLabel.textContent = '1. 이번 끼니에 사용할 큐브(재료) 터치하여 추가';

  const ingCountHint = document.createElement('span');
  ingCountHint.style.fontSize = '0.78rem';
  ingCountHint.style.color = 'var(--text-muted)';
  ingCountHint.textContent = `선택됨 ${selectedItems.length}개`;

  ingTitleRow.appendChild(ingLabel);
  ingTitleRow.appendChild(ingCountHint);
  ingSection.appendChild(ingTitleRow);

  const ingChipGroup = document.createElement('div');
  ingChipGroup.className = 'chip-group';
  ingSection.appendChild(ingChipGroup);
  wrap.appendChild(ingSection);

  // 4. 선택된 큐브 목록 컨테이너
  const basketSection = document.createElement('div');
  basketSection.style.marginBottom = '14px';

  const basketTitle = document.createElement('div');
  basketTitle.className = 'form-label';
  basketTitle.textContent = '2. 큐브별 분출량 및 실제 섭취량 설정';
  basketSection.appendChild(basketTitle);

  const basketList = document.createElement('div');
  basketList.className = 'multi-cube-list';
  basketSection.appendChild(basketList);
  wrap.appendChild(basketSection);

  // 5. 전체 끼니 요약 및 완밥 원클릭 박스
  const summaryBox = document.createElement('div');
  summaryBox.className = 'multi-summary-box';
  wrap.appendChild(summaryBox);

  // 6. 하단 저장 버튼
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn-primary btn-block';
  saveBtn.style.marginTop = '8px';
  wrap.appendChild(saveBtn);

  // 수정 모드일 때 삭제 버튼
  if (isEdit && editItem) {
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn btn-outline btn-block btn-sm';
    deleteBtn.style.marginTop = '8px';
    deleteBtn.style.color = 'var(--urgent-red)';
    deleteBtn.textContent = '이 식단 항목 삭제 (재고 자동 복구)';
    deleteBtn.onclick = async () => {
      if (confirm(`${editItem.name} 기록을 삭제하시겠습니까? (차감된 큐브 재고는 복구됩니다)`)) {
        await store.deleteMealItem(date, editItem.id);
        showToast(`${editItem.name} 삭제 및 재고 복구 완료`, 'info');
        closeSheet();
      }
    };
    wrap.appendChild(deleteBtn);
  }

  // ---------------------------------------------------------------------------
  // 렌더링 함수들
  // ---------------------------------------------------------------------------

  function renderIngChips() {
    while (ingChipGroup.firstChild) {
      ingChipGroup.removeChild(ingChipGroup.firstChild);
    }

    ingCountHint.textContent = `선택됨 ${selectedItems.length}개`;

    ingredients.forEach(ing => {
      const isSelected = selectedItems.some(it => it.ingredient.id === ing.id);
      const chip = createIngredientChip(ing, isSelected, (clickedIng) => {
        const foundIdx = selectedItems.findIndex(it => it.ingredient.id === clickedIng.id);
        if (foundIdx !== -1) {
          // 이미 있으면 제거 (최소 1개 유지는 안 함, 사용자가 삭제 가능)
          selectedItems.splice(foundIdx, 1);
        } else {
          // 없으면 추가
          const cubeG = parseFloat(clickedIng.cube_g) || 20;
          selectedItems.push({
            id: null,
            ingredient: clickedIng,
            cubesCount: 1,
            cubeG: cubeG,
            preparedGrams: cubeG,
            actualGrams: cubeG,
            useCube: true
          });
        }
        renderAll();
      });
      ingChipGroup.appendChild(chip);
    });
  }

  function renderBasket() {
    while (basketList.firstChild) {
      basketList.removeChild(basketList.firstChild);
    }

    if (selectedItems.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.textAlign = 'center';
      emptyMsg.style.padding = '20px 0';
      emptyMsg.style.color = 'var(--text-muted)';
      emptyMsg.style.fontSize = '0.9rem';
      emptyMsg.textContent = '👆 위 목록에서 사용할 큐브를 터치해 주세요.';
      basketList.appendChild(emptyMsg);
      return;
    }

    selectedItems.forEach((item, idx) => {
      const card = document.createElement('div');
      card.className = 'multi-cube-card';

      // 카드 헤더: 재료명, 색상, 삭제 버튼
      const head = document.createElement('div');
      head.className = 'multi-cube-card-header';

      const title = document.createElement('div');
      title.className = 'multi-cube-card-title';

      const dot = document.createElement('span');
      dot.className = 'chip-dot';
      dot.style.backgroundColor = item.ingredient.color || '#4DB6AC';
      dot.style.width = '10px';
      dot.style.height = '10px';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = item.ingredient.name;

      const cubeGText = document.createElement('span');
      cubeGText.style.fontSize = '0.75rem';
      cubeGText.style.color = 'var(--text-muted)';
      cubeGText.textContent = `(1개당 ${item.cubeG}g)`;

      title.appendChild(dot);
      title.appendChild(nameSpan);
      title.appendChild(cubeGText);

      // 개별 삭제 버튼
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'multi-cube-del-btn';
      delBtn.innerHTML = '&times;';
      delBtn.title = '제거';
      delBtn.onclick = () => {
        selectedItems.splice(idx, 1);
        renderAll();
      };

      head.appendChild(title);
      head.appendChild(delBtn);
      card.appendChild(head);

      // 컨트롤 영역 (분출 큐브 개수 vs 실제 섭취량)
      const controls = document.createElement('div');
      controls.className = 'multi-cube-controls';

      // 1) 분출 큐브 개수
      const col1 = document.createElement('div');
      col1.className = 'multi-cube-control-col';

      const l1 = document.createElement('label');
      l1.textContent = `🧊 분출 큐브 (${item.preparedGrams}g)`;
      col1.appendChild(l1);

      const stepper1 = createStepper({
        value: item.cubesCount,
        min: 0.5,
        max: 10,
        step: 0.5,
        unit: '개',
        onChange: (val) => {
          item.cubesCount = val;
          item.preparedGrams = Math.round(val * item.cubeG);
          // 실제 먹은 양도 자동 완밥으로 연동
          item.actualGrams = item.preparedGrams;
          renderBasket();
          renderSummary();
        }
      });
      col1.appendChild(stepper1);
      controls.appendChild(col1);

      // 2) 실제 먹은 양 (g)
      const col2 = document.createElement('div');
      col2.className = 'multi-cube-control-col';

      const l2 = document.createElement('label');
      l2.style.display = 'flex';
      l2.style.justifyContent = 'space-between';
      l2.innerHTML = `<span>🍽️ 실제 먹은 양</span> <strong style="color:var(--primary);">${item.actualGrams}g</strong>`;
      col2.appendChild(l2);

      const stepper2 = createStepper({
        value: item.actualGrams,
        min: 0,
        max: 300,
        step: 5,
        unit: 'g',
        onChange: (val) => {
          item.actualGrams = val;
          renderSummary();
        }
      });
      col2.appendChild(stepper2);
      controls.appendChild(col2);

      card.appendChild(controls);

      // 퀵 버튼 바 (완밥 버튼 & 큐브 차감 여부)
      const subRow = document.createElement('div');
      subRow.style.display = 'flex';
      subRow.style.alignItems = 'center';
      subRow.style.justifyContent = 'space-between';
      subRow.style.marginTop = '8px';
      subRow.style.fontSize = '0.78rem';

      const cubeToggle = document.createElement('label');
      cubeToggle.style.display = 'flex';
      cubeToggle.style.alignItems = 'center';
      cubeToggle.style.gap = '4px';
      cubeToggle.style.cursor = 'pointer';

      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = item.useCube;
      check.onchange = () => {
        item.useCube = check.checked;
        renderSummary();
      };
      cubeToggle.appendChild(check);
      cubeToggle.appendChild(document.createTextNode('재고 차감'));
      subRow.appendChild(cubeToggle);

      const quickAllBtn = document.createElement('button');
      quickAllBtn.type = 'button';
      quickAllBtn.className = `btn btn-xs ${item.actualGrams === item.preparedGrams ? 'btn-primary' : 'btn-outline'}`;
      quickAllBtn.style.padding = '2px 8px';
      quickAllBtn.textContent = item.actualGrams === item.preparedGrams ? '✓ 완밥' : `완밥 (${item.preparedGrams}g)`;
      quickAllBtn.onclick = () => {
        item.actualGrams = item.preparedGrams;
        renderBasket();
        renderSummary();
      };
      subRow.appendChild(quickAllBtn);

      card.appendChild(subRow);
      basketList.appendChild(card);
    });
  }

  function renderSummary() {
    while (summaryBox.firstChild) {
      summaryBox.removeChild(summaryBox.firstChild);
    }

    if (selectedItems.length === 0) {
      summaryBox.style.display = 'none';
      saveBtn.disabled = true;
      saveBtn.textContent = '재료를 1개 이상 선택해주세요';
      return;
    }

    summaryBox.style.display = 'block';
    saveBtn.disabled = false;

    const totalPrepared = selectedItems.reduce((acc, it) => acc + (it.useCube ? it.preparedGrams : it.actualGrams), 0);
    const totalActual = selectedItems.reduce((acc, it) => acc + it.actualGrams, 0);
    const totalCubes = selectedItems.reduce((acc, it) => acc + (it.useCube ? it.cubesCount : 0), 0);

    const row1 = document.createElement('div');
    row1.className = 'multi-summary-row';
    row1.innerHTML = `
      <span>🧊 총 준비량 (분출)</span>
      <strong>${totalPrepared}g (${totalCubes}개 큐브)</strong>
    `;

    const row2 = document.createElement('div');
    row2.className = 'multi-summary-row';
    row2.style.fontSize = '1.02rem';
    row2.innerHTML = `
      <span style="font-weight:700;">🍽️ 총 실제 섭취량</span>
      <strong style="color:var(--primary); font-size:1.15rem;">${totalActual}g</strong>
    `;

    // 완밥 / 남김 상태 문구
    const statusLine = document.createElement('div');
    statusLine.style.fontSize = '0.82rem';
    statusLine.style.fontWeight = '600';
    statusLine.style.marginTop = '4px';
    statusLine.style.paddingTop = '6px';
    statusLine.style.borderTop = '1px dashed var(--border-color)';

    if (totalActual === totalPrepared) {
      statusLine.style.color = '#2E7D32';
      statusLine.textContent = `😋 모든 큐브를 남김없이 완밥했습니다! (${totalActual}g)`;
    } else if (totalActual < totalPrepared) {
      statusLine.style.color = '#E65100';
      statusLine.textContent = `⚠️ 총 ${totalPrepared}g 중 ${totalActual}g 섭취 (${totalPrepared - totalActual}g 남김) · 큐브는 ${totalCubes}개 차감`;
    } else {
      statusLine.style.color = 'var(--primary)';
      statusLine.textContent = `💡 분출량(${totalPrepared}g)보다 많은 ${totalActual}g 섭취`;
    }

    // 전체 완밥 일괄 적용 버튼
    const allFullBtn = document.createElement('button');
    allFullBtn.type = 'button';
    allFullBtn.className = 'btn btn-outline btn-block btn-sm';
    allFullBtn.style.marginTop = '10px';
    allFullBtn.textContent = '✨ 전체 한 번에 완밥으로 맞추기';
    allFullBtn.onclick = () => {
      selectedItems.forEach(it => {
        it.actualGrams = it.preparedGrams;
      });
      renderBasket();
      renderSummary();
      showToast('모든 큐브를 완밥(분출량)으로 맞췄습니다.', 'success', 1500);
    };

    summaryBox.appendChild(row1);
    summaryBox.appendChild(row2);
    summaryBox.appendChild(statusLine);
    summaryBox.appendChild(allFullBtn);

    saveBtn.textContent = isEdit
      ? `${mealNo}끼 수정사항 저장하기 (${totalActual}g)`
      : `${mealNo}끼 식단 ${selectedItems.length}개 일괄 저장하기 (실제 섭취 ${totalActual}g)`;
  }

  function renderAll() {
    renderIngChips();
    renderBasket();
    renderSummary();
  }

  renderAll();

  // ---------------------------------------------------------------------------
  // 저장 액션 핸들러
  // ---------------------------------------------------------------------------
  saveBtn.onclick = async () => {
    if (selectedItems.length === 0) {
      showToast('재료를 1개 이상 선택해주세요.', 'error');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = '저장 중...';

    try {
      const currentDayMeals = store.getMealsForDate(date);

      // 수정 모드인 경우 해당 editItem 제거 후 새 아이템들로 대체
      // 신규 입력인 경우 기존 끼니 항목 유지 또는 덮어쓰기
      const targetItemId = editItem ? editItem.id : null;
      const otherItems = targetItemId
        ? currentDayMeals.filter(m => m.id !== targetItemId)
        : currentDayMeals;

      const newSavedItems = selectedItems.map(it => ({
        id: it.id || ('item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
        meal_no: mealNo,
        ingredient_id: it.ingredient.id,
        name: it.ingredient.name,
        grams: it.actualGrams,
        prepared_grams: it.useCube ? it.preparedGrams : it.actualGrams,
        cubes_used: it.useCube ? it.cubesCount : 0,
        use_cube: it.useCube
      }));

      const combined = [...otherItems, ...newSavedItems];

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

      const totalActual = selectedItems.reduce((acc, it) => acc + it.actualGrams, 0);
      showToast(`${mealNo}끼 ${selectedItems.length}개 큐브(실제 섭취 ${totalActual}g) 기록 완료!`, 'success');
      closeSheet();
    } catch (err) {
      showToast('저장 중 오류: ' + err.message, 'error');
    } finally {
      saveBtn.disabled = false;
    }
  };

  openSheet({
    title: isEdit ? '식단 기록 수정' : '식단 일괄 기록',
    content: wrap
  });
}
