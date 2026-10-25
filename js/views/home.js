/**
 * home.js - 홈 (오늘) 대시보드 뷰
 * 헤더: 아기 이름, 생후/이유식 일차
 * 카드: 오늘 식단, 큐브 제작 알림, 새 재료 관찰, 빠른 입력
 */

import { store } from '../store.js';
import { getTodayYMD, formatDaySummary, addDays } from '../dates.js';
import { openEntrySheet } from './entrySheet.js';
import { openDaySheet } from './daySheet.js';
import { showToast } from '../ui/toast.js';

export function renderHomeView(container) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  const state = store.getState();
  const settings = state.settings;
  const today = getTodayYMD();
  const isInclusive = String(settings.count_inclusive).toUpperCase() !== 'FALSE';

  const fullHeader = formatDaySummary(
    today,
    settings.baby_name || '이은',
    settings.birth_date,
    settings.solid_start_date,
    isInclusive
  );

  // 1. 상단 아기 정보 배너
  const banner = document.createElement('div');
  banner.className = 'card home-hero-banner';

  const babyTitle = document.createElement('div');
  babyTitle.className = 'home-hero-title';
  babyTitle.textContent = `${settings.baby_name || '이은'}의 이유식 일기 🍚`;

  const dateSub = document.createElement('div');
  dateSub.className = 'home-hero-sub';
  dateSub.textContent = fullHeader;

  banner.appendChild(babyTitle);
  banner.appendChild(dateSub);
  container.appendChild(banner);

  // 2. 큐브 알림 카드 (F-08)
  const allForecasts = store.getAllForecasts();
  const urgentForecasts = allForecasts.filter(f => {
    if (!f.forecast) return false;
    const warn = f.forecast.warn;
    const due = f.forecast.due;
    // 경고일이 오늘 이하이거나 3일 이내인 경우
    return (warn && warn <= addDays(today, 2)) || (due && due <= addDays(today, 3)) || f.stock <= 2;
  });

  if (urgentForecasts.length > 0) {
    const alertCard = document.createElement('div');
    alertCard.className = 'alert-banner-cube';
    alertCard.onclick = () => {
      store.setTab('cubes');
    };

    const icon = document.createElement('span');
    icon.style.fontSize = '1.6rem';
    icon.textContent = '🧊';

    const textWrap = document.createElement('div');
    textWrap.style.flex = '1';

    const alertTitle = document.createElement('div');
    alertTitle.className = 'alert-banner-cube-title';
    alertTitle.textContent = `제작 권장 큐브가 ${urgentForecasts.length}개 있습니다!`;

    const alertDesc = document.createElement('div');
    alertDesc.className = 'alert-banner-cube-desc';
    const names = urgentForecasts.map(f => `${f.ingredient.name}(${f.stock}개)`).join(', ');
    alertDesc.textContent = `${names} → 큐브 탭에서 확인`;

    textWrap.appendChild(alertTitle);
    textWrap.appendChild(alertDesc);

    alertCard.appendChild(icon);
    alertCard.appendChild(textWrap);
    container.appendChild(alertCard);
  }

  // 3. 새 재료 관찰 카드 (F-11)
  const newIngredients = store.getNewIngredientsList();
  if (newIngredients.length > 0) {
    const newCard = document.createElement('div');
    newCard.className = 'alert-banner-new';

    const newHeader = document.createElement('div');
    newHeader.className = 'alert-banner-new-title';
    newHeader.textContent = '🆕 새 재료 적응 관찰 중';
    newCard.appendChild(newHeader);

    const listWrap = document.createElement('div');
    listWrap.style.display = 'flex';
    listWrap.style.flexDirection = 'column';
    listWrap.style.gap = '6px';
    listWrap.style.marginTop = '4px';

    newIngredients.forEach(n => {
      const row = document.createElement('div');
      row.className = 'alert-banner-new-item';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = `• ${n.ingredient.name}`;

      const daySpan = document.createElement('span');
      daySpan.className = 'alert-banner-new-day';
      daySpan.textContent = `${n.dayNumber}일차 관찰 중 (총 ${n.watchDays}일)`;

      row.appendChild(nameSpan);
      row.appendChild(daySpan);
      listWrap.appendChild(row);
    });

    if (newIngredients.length >= 2) {
      const tip = document.createElement('div');
      tip.className = 'alert-banner-new-tip';
      tip.textContent = '💡 새 재료가 2개 이상일 때는 반응 구분이 어려울 수 있으니 컨디션을 유심히 살펴주세요.';
      listWrap.appendChild(tip);
    }

    newCard.appendChild(listWrap);
    container.appendChild(newCard);
  }

  // 4. 오늘 식단 카드
  const mealCard = document.createElement('div');
  mealCard.className = 'card';

  const mealCardHeader = document.createElement('div');
  mealCardHeader.className = 'card-header';

  const mealTitle = document.createElement('div');
  mealTitle.className = 'card-title';
  mealTitle.textContent = '🍽️ 오늘 먹은 이유식';

  const detailBtn = document.createElement('button');
  detailBtn.type = 'button';
  detailBtn.className = 'btn btn-outline btn-sm';
  detailBtn.textContent = '상세/반응';
  detailBtn.onclick = () => {
    openDaySheet(today);
  };

  mealCardHeader.appendChild(mealTitle);
  mealCardHeader.appendChild(detailBtn);
  mealCard.appendChild(mealCardHeader);

  const todayMeals = store.getMealsForDate(today);
  const ingMap = store.getIngredientsMap();

  if (todayMeals.length === 0) {
    const emptyNotice = document.createElement('div');
    emptyNotice.style.textAlign = 'center';
    emptyNotice.style.padding = '18px 0';
    emptyNotice.style.color = 'var(--text-muted)';
    emptyNotice.textContent = '오늘 아직 이유식 기록이 없습니다.';
    mealCard.appendChild(emptyNotice);
  } else {
    // 오늘 총 섭취량 및 준비량 요약 바
    const totalEaten = todayMeals.reduce((acc, m) => acc + (parseFloat(m.grams) || 0), 0);
    const totalPrep = todayMeals.reduce((acc, m) => acc + (parseFloat(m.prepared_grams) || parseFloat(m.grams) || 0), 0);

    const summaryBar = document.createElement('div');
    summaryBar.style.display = 'flex';
    summaryBar.style.alignItems = 'center';
    summaryBar.style.justifyContent = 'space-between';
    summaryBar.style.padding = '8px 12px';
    summaryBar.style.margin = '4px 0 12px 0';
    summaryBar.style.backgroundColor = 'var(--primary-light)';
    summaryBar.style.borderRadius = 'var(--radius-md)';
    summaryBar.style.border = '1px solid var(--primary-border)';

    const totalLabel = document.createElement('span');
    totalLabel.style.fontSize = '0.85rem';
    totalLabel.style.fontWeight = '600';
    totalLabel.style.color = 'var(--text-main)';
    totalLabel.textContent = '🍽️ 오늘 실제 섭취량';

    const totalVal = document.createElement('span');
    totalVal.style.fontSize = '1.05rem';
    totalVal.style.fontWeight = '800';
    totalVal.style.color = 'var(--primary)';
    totalVal.innerHTML = `${totalEaten}g ${totalPrep > totalEaten ? `<small style="font-size:0.75rem; color:var(--text-muted); font-weight:normal;">(분출 ${totalPrep}g)</small>` : '<small style="font-size:0.75rem; color:#2E7D32;">(완밥!)</small>'}`;

    summaryBar.appendChild(totalLabel);
    summaryBar.appendChild(totalVal);
    mealCard.appendChild(summaryBar);

    const mealList = document.createElement('div');
    mealList.style.display = 'flex';
    mealList.style.flexDirection = 'column';
    mealList.style.gap = '8px';
    mealList.style.marginBottom = '14px';

    todayMeals.forEach(m => {
      const ing = ingMap[m.ingredient_id];
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.padding = '8px 0';
      row.style.borderBottom = '1px solid var(--border-light)';

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.alignItems = 'center';
      left.style.gap = '10px';
      left.style.cursor = 'pointer';
      left.onclick = () => {
        openEntrySheet(today, m.meal_no || 1, m);
      };

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

      const name = document.createElement('span');
      name.style.fontWeight = '700';
      name.style.fontSize = '0.92rem';
      name.textContent = `${m.meal_no || 1}끼 ${m.name}`;

      const eatenSpan = document.createElement('span');
      eatenSpan.style.fontWeight = '800';
      eatenSpan.style.fontSize = '0.92rem';
      eatenSpan.style.color = 'var(--primary)';
      eatenSpan.textContent = `실제 섭취 ${m.grams}g`;

      nameRow.appendChild(name);
      nameRow.appendChild(eatenSpan);
      infoCol.appendChild(nameRow);

      const subInfo = document.createElement('div');
      subInfo.style.fontSize = '0.78rem';
      subInfo.style.color = 'var(--text-muted)';
      const isCube = String(m.use_cube).toUpperCase() !== 'FALSE';
      if (isCube) {
        const prep = m.prepared_grams !== undefined ? parseFloat(m.prepared_grams) : parseFloat(m.grams);
        const actual = parseFloat(m.grams);
        const cubes = m.cubes_used || 1;
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
      editBtn.onclick = (e) => {
        e.stopPropagation();
        openEntrySheet(today, m.meal_no || 1, m);
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
      delBtn.onclick = async (e) => {
        e.stopPropagation();
        if (confirm(`${m.name} 기록을 삭제하시겠습니까? (차감된 큐브 재고는 복구됩니다)`)) {
          await store.deleteMealItem(today, m.id);
          showToast(`${m.name} 삭제 및 재고 복구 완료`, 'info');
        }
      };

      right.appendChild(editBtn);
      right.appendChild(delBtn);

      row.appendChild(left);
      row.appendChild(right);
      mealList.appendChild(row);
    });

    mealCard.appendChild(mealList);
  }

  // 오늘 식단 빠른 추가 버튼
  const quickBtnRow = document.createElement('div');
  quickBtnRow.style.display = 'flex';
  quickBtnRow.style.gap = '8px';
  quickBtnRow.style.marginTop = '8px';

  const addMealBtn = document.createElement('button');
  addMealBtn.type = 'button';
  addMealBtn.className = 'btn btn-primary btn-block';
  addMealBtn.textContent = '＋ 오늘 식단 기록하기';
  addMealBtn.onclick = () => {
    openEntrySheet(today);
  };
  quickBtnRow.appendChild(addMealBtn);

  // 어제와 같이 복사 버튼
  const yesterday = addDays(today, -1);
  const yMeals = store.getMealsForDate(yesterday);
  if (yMeals.length > 0 && todayMeals.length === 0) {
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn btn-outline';
    copyBtn.style.whiteSpace = 'nowrap';
    copyBtn.textContent = '어제와 같이';
    copyBtn.onclick = async () => {
      const copiedMeals = [
        {
          meal_no: 1,
          items: yMeals.map(m => ({
            ingredient_id: m.ingredient_id,
            name: m.name,
            grams: m.grams,
            use_cube: String(m.use_cube).toUpperCase() !== 'FALSE'
          }))
        }
      ];
      await store.saveDayMeals(today, copiedMeals, store.getDayLog(yesterday));
      showToast('어제 식단을 복사했습니다!', 'success');
      renderHomeView(container);
    };
    quickBtnRow.appendChild(copyBtn);
  }

  mealCard.appendChild(quickBtnRow);
  container.appendChild(mealCard);

  // 5. 오늘 일일 반응 미리보기
  const dayLog = store.getDayLog(today);
  if (dayLog && (dayLog.appetite || dayLog.tags || dayLog.memo)) {
    const logCard = document.createElement('div');
    logCard.className = 'card';
    logCard.style.padding = '12px 16px';

    const logRow = document.createElement('div');
    logRow.style.display = 'flex';
    logRow.style.alignItems = 'center';
    logRow.style.gap = '10px';

    if (dayLog.appetite) {
      const em = document.createElement('span');
      em.style.fontSize = '1.6rem';
      em.textContent = dayLog.appetite;
      logRow.appendChild(em);
    }

    const logTextWrap = document.createElement('div');
    if (dayLog.tags) {
      const tagSpan = document.createElement('div');
      tagSpan.style.fontSize = '0.8rem';
      tagSpan.style.color = 'var(--text-muted)';
      tagSpan.textContent = dayLog.tags;
      logTextWrap.appendChild(tagSpan);
    }
    if (dayLog.memo) {
      const memoSpan = document.createElement('div');
      memoSpan.style.fontSize = '0.88rem';
      memoSpan.style.fontWeight = '500';
      memoSpan.textContent = dayLog.memo;
      logTextWrap.appendChild(memoSpan);
    }

    logRow.appendChild(logTextWrap);
    logCard.appendChild(logRow);
    container.appendChild(logCard);
  }
}
