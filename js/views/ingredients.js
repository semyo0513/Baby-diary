/**
 * ingredients.js - 재료 관리 뷰
 * 이름, 분류(베이스/토핑), 큐브 1개 용량(cube_g), 소진 방식(fixed/auto), 색상
 */

import { store } from '../store.js';
import { openSheet, closeSheet } from '../ui/sheet.js';
import { showToast } from '../ui/toast.js';

export function renderIngredientsView(container) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  const state = store.getState();
  const ingredients = state.ingredients.filter(i => String(i.active).toUpperCase() !== 'FALSE');

  // 상단 헤더
  const headerRow = document.createElement('div');
  headerRow.style.display = 'flex';
  headerRow.style.alignItems = 'center';
  headerRow.style.justifyContent = 'space-between';
  headerRow.style.marginBottom = '14px';

  const title = document.createElement('h2');
  title.style.fontSize = '1.05rem';
  title.style.fontWeight = '700';
  title.textContent = `🥗 재료 관리 (${ingredients.length}개)`;

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-primary btn-sm';
  addBtn.textContent = '＋ 재료 등록';
  addBtn.onclick = () => {
    openIngredientEditModal(null);
  };

  headerRow.appendChild(title);
  headerRow.appendChild(addBtn);
  container.appendChild(headerRow);

  // 분류별 그룹화 (베이스 / 토핑 / 기타)
  const baseList = ingredients.filter(i => i.category === 'base');
  const toppingList = ingredients.filter(i => i.category !== 'base');

  function renderGroup(titleText, items) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.padding = '14px';
    card.style.marginBottom = '14px';

    const groupTitle = document.createElement('div');
    groupTitle.className = 'card-title';
    groupTitle.style.marginBottom = '10px';
    groupTitle.textContent = `${titleText} (${items.length})`;
    card.appendChild(groupTitle);

    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '8px';

    items.forEach(ing => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.padding = '8px 0';
      row.style.borderBottom = '1px solid var(--border-light)';
      row.style.cursor = 'pointer';
      row.onclick = () => {
        openIngredientEditModal(ing);
      };

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.alignItems = 'center';
      left.style.gap = '10px';

      const dot = document.createElement('span');
      dot.className = 'chip-dot';
      dot.style.width = '12px';
      dot.style.height = '12px';
      dot.style.backgroundColor = ing.color || '#4DB6AC';

      const info = document.createElement('div');
      const name = document.createElement('div');
      name.style.fontWeight = '700';
      name.textContent = ing.name;

      const sub = document.createElement('div');
      sub.style.fontSize = '0.78rem';
      sub.style.color = 'var(--text-muted)';
      const modeStr = ing.usage_mode === 'fixed' ? `매일 ${ing.daily_rate}개 소진` : '최근 7일 평균 소진';
      sub.textContent = `1큐브: ${ing.cube_g}g · ${modeStr}`;

      info.appendChild(name);
      info.appendChild(sub);
      left.appendChild(dot);
      left.appendChild(info);

      const arrow = document.createElement('span');
      arrow.style.color = 'var(--text-light)';
      arrow.textContent = '수정 〉';

      row.appendChild(left);
      row.appendChild(arrow);
      list.appendChild(row);
    });

    card.appendChild(list);
    return card;
  }

  container.appendChild(renderGroup('🍚 베이스 재료 (매일 섭취)', baseList));
  container.appendChild(renderGroup('🥦 토핑 / 기타 재료', toppingList));
}

function openIngredientEditModal(existing = null) {
  const isEdit = Boolean(existing);
  const wrap = document.createElement('div');

  const form = document.createElement('form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) {
      showToast('재료 이름을 입력해주세요.', 'error');
      return;
    }

    const payload = {
      id: existing ? existing.id : undefined,
      name: name,
      category: categorySelect.value,
      color: selectedColor,
      cube_g: parseFloat(cubeGInput.value) || 30,
      track_cube: trackCubeCheck.checked,
      usage_mode: usageModeSelect.value,
      daily_rate: parseFloat(dailyRateInput.value) || 0
    };

    await store.saveIngredient(payload);
    showToast(isEdit ? '재료 정보가 수정되었습니다.' : '새 재료가 등록되었습니다.', 'success');
    closeSheet();
  };

  // 재료 이름
  const nameGroup = document.createElement('div');
  nameGroup.className = 'form-group';
  const nameLabel = document.createElement('label');
  nameLabel.className = 'form-label';
  nameLabel.textContent = '재료 이름';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'form-input';
  nameInput.placeholder = '예: 소고기, 단호박';
  nameInput.value = existing ? existing.name : '';
  nameGroup.appendChild(nameLabel);
  nameGroup.appendChild(nameInput);
  form.appendChild(nameGroup);

  // 분류
  const catGroup = document.createElement('div');
  catGroup.className = 'form-group';
  const catLabel = document.createElement('label');
  catLabel.className = 'form-label';
  catLabel.textContent = '분류';
  const categorySelect = document.createElement('select');
  categorySelect.className = 'form-input';
  categorySelect.innerHTML = `
    <option value="base" ${existing && existing.category === 'base' ? 'selected' : ''}>베이스 (쌀미음, 오트밀 등 매일 먹는 주식)</option>
    <option value="topping" ${!existing || existing.category === 'topping' ? 'selected' : ''}>토핑 (채소, 고기 등)</option>
  `;
  catGroup.appendChild(catLabel);
  catGroup.appendChild(categorySelect);
  form.appendChild(catGroup);

  // 큐브 1개 용량 (cube_g)
  const cubeGGroup = document.createElement('div');
  cubeGGroup.className = 'form-group';
  const cubeGLabel = document.createElement('label');
  cubeGLabel.className = 'form-label';
  cubeGLabel.textContent = '큐브 1개 용량 (g)';
  const cubeGInput = document.createElement('input');
  cubeGInput.type = 'number';
  cubeGInput.className = 'form-input';
  cubeGInput.value = existing ? existing.cube_g : 30;
  cubeGGroup.appendChild(cubeGLabel);
  cubeGGroup.appendChild(cubeGInput);
  form.appendChild(cubeGGroup);

  // 소진 방식 (fixed / auto)
  const modeGroup = document.createElement('div');
  modeGroup.className = 'form-group';
  const modeLabel = document.createElement('label');
  modeLabel.className = 'form-label';
  modeLabel.textContent = '소진 예측 방식';
  const usageModeSelect = document.createElement('select');
  usageModeSelect.className = 'form-input';
  usageModeSelect.innerHTML = `
    <option value="auto" ${!existing || existing.usage_mode === 'auto' ? 'selected' : ''}>자동(auto) - 최근 7일 실제 소진 평균</option>
    <option value="fixed" ${existing && existing.usage_mode === 'fixed' ? 'selected' : ''}>고정(fixed) - 매일 정해진 큐브 수 소진</option>
  `;
  modeGroup.appendChild(modeLabel);
  modeGroup.appendChild(usageModeSelect);
  form.appendChild(modeGroup);

  // 고정 소비율 인풋
  const dailyRateGroup = document.createElement('div');
  dailyRateGroup.className = 'form-group';
  dailyRateGroup.style.display = (existing && existing.usage_mode === 'fixed') ? 'block' : 'none';
  const dailyRateLabel = document.createElement('label');
  dailyRateLabel.className = 'form-label';
  dailyRateLabel.textContent = '하루 고정 소비 큐브 수';
  const dailyRateInput = document.createElement('input');
  dailyRateInput.type = 'number';
  dailyRateInput.step = '0.5';
  dailyRateInput.className = 'form-input';
  dailyRateInput.value = existing ? (existing.daily_rate || 1) : 1;
  dailyRateGroup.appendChild(dailyRateLabel);
  dailyRateGroup.appendChild(dailyRateInput);
  form.appendChild(dailyRateGroup);

  usageModeSelect.onchange = () => {
    dailyRateGroup.style.display = usageModeSelect.value === 'fixed' ? 'block' : 'none';
  };

  // 재고 관리 여부 체크박스
  const trackRow = document.createElement('label');
  trackRow.style.display = 'flex';
  trackRow.style.alignItems = 'center';
  trackRow.style.gap = '8px';
  trackRow.style.margin = '10px 0 14px 0';
  const trackCubeCheck = document.createElement('input');
  trackCubeCheck.type = 'checkbox';
  trackCubeCheck.checked = !existing || String(existing.track_cube).toUpperCase() !== 'FALSE';
  const trackTxt = document.createElement('span');
  trackTxt.textContent = '냉동 큐브 재고 및 제작일 자동 계산 대상';
  trackRow.appendChild(trackCubeCheck);
  trackRow.appendChild(trackTxt);
  form.appendChild(trackRow);

  // 색상 선택 팔레트 (다양한 28종 이유식 컬러 + 직접 선택)
  const colorGroup = document.createElement('div');
  colorGroup.className = 'form-group';
  const colorLabel = document.createElement('label');
  colorLabel.className = 'form-label';
  colorLabel.textContent = '재료 색상 (달력 및 식단 칩 표시용)';
  colorGroup.appendChild(colorLabel);

  const colors = [
    // 곡물/베이스 (오트밀, 쌀, 감자, 곡류)
    '#A1887F', '#8D6E63', '#D7CCC8', '#BCAAA4',
    // 채소/그린 (애호박, 시금치, 청경채, 브로콜리, 아보카도, 완두콩)
    '#81C784', '#66BB6A', '#4CAF50', '#2E7D32', '#9CCC65', '#AEEA00',
    // 육류/단백질 (소고기, 닭고기, 연어, 비트)
    '#E57373', '#EF5350', '#D32F2F', '#C2185B', '#FF8A65', '#FF7043',
    // 비타민/옐로우/오렌지 (당근, 단호박, 파프리카, 옥수수)
    '#FFA726', '#FF9800', '#F57C00', '#FFB74D', '#FDD835', '#FBC02D',
    // 특수/퍼플/베리/해조류 (자색고구마, 블루베리, 흑미, 미역, 큐브)
    '#BA68C8', '#AB47BC', '#8E24AA', '#5C6BC0', '#4DB6AC', '#26A69A'
  ];
  let selectedColor = existing ? existing.color : colors[0];

  const paletteWrap = document.createElement('div');
  paletteWrap.className = 'palette-grid';

  const swatches = [];
  colors.forEach(c => {
    const swatch = document.createElement('div');
    swatch.className = `palette-swatch ${c.toLowerCase() === selectedColor.toLowerCase() ? 'active' : ''}`;
    swatch.style.backgroundColor = c;
    swatch.title = c;
    swatch.onclick = () => {
      selectedColor = c;
      customInput.value = c;
      previewDot.style.backgroundColor = c;
      hexCode.textContent = c.toUpperCase();
      swatches.forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
    };
    swatches.push(swatch);
    paletteWrap.appendChild(swatch);
  });
  colorGroup.appendChild(paletteWrap);

  // 직접 색상 선택 커스텀 로우
  const customRow = document.createElement('div');
  customRow.className = 'palette-custom-row';

  const customLabel = document.createElement('span');
  customLabel.style.fontSize = '0.85rem';
  customLabel.style.fontWeight = '600';
  customLabel.textContent = '🎨 커스텀 색상:';

  const customInput = document.createElement('input');
  customInput.type = 'color';
  customInput.className = 'palette-color-input';
  customInput.value = selectedColor.startsWith('#') && selectedColor.length === 7 ? selectedColor : '#FF8A65';

  const previewDot = document.createElement('span');
  previewDot.className = 'chip-dot';
  previewDot.style.width = '14px';
  previewDot.style.height = '14px';
  previewDot.style.backgroundColor = selectedColor;

  const hexCode = document.createElement('span');
  hexCode.style.fontSize = '0.8rem';
  hexCode.style.fontFamily = 'monospace';
  hexCode.textContent = selectedColor.toUpperCase();

  customInput.oninput = () => {
    selectedColor = customInput.value;
    previewDot.style.backgroundColor = selectedColor;
    hexCode.textContent = selectedColor.toUpperCase();
    swatches.forEach(s => s.classList.remove('active'));
  };

  customRow.appendChild(customLabel);
  customRow.appendChild(customInput);
  customRow.appendChild(previewDot);
  customRow.appendChild(hexCode);
  colorGroup.appendChild(customRow);

  form.appendChild(colorGroup);

  // 저장 버튼
  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn btn-primary btn-block';
  submitBtn.style.marginTop = '14px';
  submitBtn.textContent = isEdit ? '수정사항 저장' : '등록하기';
  form.appendChild(submitBtn);

  // 삭제(보관) 버튼 (수정 모드일 때만)
  if (isEdit) {
    const archiveBtn = document.createElement('button');
    archiveBtn.type = 'button';
    archiveBtn.className = 'btn btn-outline btn-block btn-sm';
    archiveBtn.style.marginTop = '8px';
    archiveBtn.style.color = 'var(--urgent-red)';
    archiveBtn.textContent = '이 재료 보관(비활성화)';
    archiveBtn.onclick = async () => {
      if (confirm(`'${existing.name}' 재료를 보관 처리하시겠습니까? 과거 기록은 보존됩니다.`)) {
        await store.archiveIngredient(existing.id);
        showToast('재료가 보관되었습니다.', 'info');
        closeSheet();
      }
    };
    form.appendChild(archiveBtn);
  }

  wrap.appendChild(form);

  openSheet({
    title: isEdit ? '재료 정보 수정' : '새 재료 등록',
    content: wrap
  });
}
