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
  banner.className = 'card';
  banner.style.background = 'linear-gradient(135deg, #FFF5F2, #FFFDFB)';
  banner.style.border = '1px solid var(--primary-border)';
  banner.style.padding = '18px 16px';

  const babyTitle = document.createElement('div');
  babyTitle.style.fontSize = '1.25rem';
  babyTitle.style.fontWeight = '800';
  babyTitle.style.color = 'var(--primary)';
  babyTitle.style.marginBottom = '4px';
  babyTitle.textContent = `${settings.baby_name || '이은'}의 이유식 일기 🍚`;

  const dateSub = document.createElement('div');
  dateSub.style.fontSize = '0.95rem';
  dateSub.style.fontWeight = '600';
  dateSub.style.color = 'var(--text-main)';
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
    alertCard.className = 'bundle-banner';
    alertCard.style.cursor = 'pointer';
    alertCard.onclick = () => {
      store.setTab('cubes');
    };

    const icon = document.createElement('span');
    icon.style.fontSize = '1.6rem';
    icon.textContent = '🧊';

    const textWrap = document.createElement('div');
    textWrap.style.flex = '1';

    const alertTitle = document.createElement('div');
    alertTitle.style.fontWeight = '700';
    alertTitle.style.fontSize = '0.92rem';
    alertTitle.style.color = '#00796B';
    alertTitle.textContent = `제작 권장 큐브가 ${urgentForecasts.length}개 있습니다!`;

    const alertDesc = document.createElement('div');
    alertDesc.style.fontSize = '0.8rem';
    alertDesc.style.color = 'var(--text-muted)';
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
    newCard.className = 'card';
    newCard.style.backgroundColor = 'var(--accent-gold-light)';
    newCard.style.borderColor = 'var(--accent-gold)';

    const newHeader = document.createElement('div');
    newHeader.className = 'card-title';
    newHeader.style.color = '#E65100';
    newHeader.textContent = '🆕 새 재료 적응 관찰 중';
    newCard.appendChild(newHeader);

    const listWrap = document.createElement('div');
    listWrap.style.display = 'flex';
    listWrap.style.flexDirection = 'column';
    listWrap.style.gap = '6px';
    listWrap.style.marginTop = '8px';

    newIngredients.forEach(n => {
      const row = document.createElement('div');
      row.style.fontSize = '0.88rem';
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';

      const nameSpan = document.createElement('span');
      nameSpan.style.fontWeight = '600';
      nameSpan.textContent = `• ${n.ingredient.name}`;

      const daySpan = document.createElement('span');
      daySpan.style.color = 'var(--text-muted)';
      daySpan.textContent = `${n.dayNumber}일차 관찰 중 (총 ${n.watchDays}일)`;

      row.appendChild(nameSpan);
      row.appendChild(daySpan);
      listWrap.appendChild(row);
    });

    if (newIngredients.length >= 2) {
      const tip = document.createElement('div');
      tip.style.fontSize = '0.78rem';
      tip.style.color = '#E65100';
      tip.style.marginTop = '6px';
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

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.alignItems = 'center';
      left.style.gap = '8px';

      const dot = document.createElement('span');
      dot.className = 'chip-dot';
      dot.style.backgroundColor = ing ? ing.color : '#4DB6AC';

      const name = document.createElement('span');
      name.style.fontWeight = '600';
      name.textContent = `${m.meal_no || 1}끼 ${m.name}`;

      const grams = document.createElement('span');
      grams.style.fontSize = '0.88rem';
      grams.style.color = 'var(--text-muted)';
      grams.textContent = `${m.grams}g`;

      left.appendChild(dot);
      left.appendChild(name);
      left.appendChild(grams);
      row.appendChild(left);
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
