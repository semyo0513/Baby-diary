/**
 * forecast.js - 소비 속도, 제작일 예측, 묶음 추천 순수 함수
 */

import { addDays } from './dates.js';

const EPS = 1e-9;

/**
 * 날짜 오프셋 적용 후 최소 날짜로 클램프
 */
export function shiftClamp(dateStr, offsetDays, minDate) {
  if (!dateStr) return null;
  const shifted = addDays(dateStr, offsetDays);
  return shifted < minDate ? minDate : shifted;
}

/**
 * 3.4 제작일 계산 알고리즘
 * @param {Object} params
 * @param {number} params.stock 현재 재고
 * @param {number} params.rate 일일 소비 속도 (큐브/일)
 * @param {number} [params.eatenToday=0] 오늘 이미 섭취한 큐브 수
 * @param {string} params.today 오늘 날짜 (YYYY-MM-DD)
 * @param {Object} [s] 설정값
 * @param {number} [s.warn_stock=2] 제작 권장 시작 기준
 * @param {number} [s.due_stock=1] 제작 마감 권장 기준
 * @param {number} [s.lead_days=0] 제작 소요 여유일
 * @returns {Object|null} { warn, due, empty }
 */
export function forecast({ stock, rate, eatenToday = 0, today }, s = { warn_stock: 2, due_stock: 1, lead_days: 0 }) {
  if (!rate || rate <= EPS) return null;

  const warnStock = typeof s.warn_stock === 'number' ? s.warn_stock : 2;
  const dueStock = typeof s.due_stock === 'number' ? s.due_stock : 1;
  const leadDays = typeof s.lead_days === 'number' ? s.lead_days : 0;

  let end = stock - Math.max(0, rate - eatenToday);
  let warn = null;
  let due = null;
  let empty = null;

  for (let k = 0; k <= 90; k++) {
    if (k > 0) end -= rate;
    const d = addDays(today, k);

    if (warn === null && end <= warnStock + EPS) {
      warn = d;
    }
    if (due === null && end <= dueStock + EPS) {
      due = d;
    }
    if (end <= EPS) {
      empty = d;
      break;
    }
  }

  return {
    warn: shiftClamp(warn, -leadDays, today),
    due: shiftClamp(due, -leadDays, today),
    empty
  };
}

/**
 * 재료별 일일 소비율 r 계산
 * @param {Object} ingredient 재료 객체 (usage_mode, daily_rate 등)
 * @param {Object} usageInfo
 * @param {number} usageInfo.recentEatenSum 최근 W일 소진 큐브 합 (오늘 제외)
 * @param {number} [usageInfo.windowDays=7] 계산 윈도우 일수 W
 * @param {number} usageInfo.availableDays 재료 사용 가능 일수 (첫 사용일 또는 이유식 시작일 이후)
 * @returns {number} 일일 소비 큐브 수 r
 */
export function calculateRate(ingredient, { recentEatenSum = 0, windowDays = 7, availableDays = 0 } = {}) {
  if (!ingredient) return 0;

  if (ingredient.usage_mode === 'fixed') {
    const fixedRate = parseFloat(ingredient.daily_rate);
    return isNaN(fixedRate) ? 0 : Math.max(0, fixedRate);
  }

  // auto 모드
  if (!availableDays || availableDays <= 0 || recentEatenSum <= 0) {
    return 0;
  }

  const denominator = Math.min(windowDays, availableDays);
  if (denominator <= 0) return 0;

  return recentEatenSum / denominator;
}

/**
 * 3.6 제작일 묶음 추천 (F-13)
 * 구간 찌르기 그리디 알고리즘
 * @param {Array<{id: string, name: string, warn: string, due: string}>} items
 * @param {string} today
 * @returns {Array<{date: string, items: Array<{id: string, name: string}>}>}
 */
export function recommendBundles(items, today) {
  // 유효한 [warn, due] 구간만 필터링
  const valid = items
    .filter(it => it.warn && it.due && it.warn <= it.due)
    .map(it => ({ ...it }));

  if (valid.length === 0) return [];

  const bundles = [];
  let uncovered = [...valid];

  while (uncovered.length > 0) {
    // 1) due 오름차순 정렬
    uncovered.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));

    // 2) 가장 이른 due를 제작일 D로 선택 (D < today이면 today)
    let d = uncovered[0].due;
    if (d < today) d = today;

    // 3) warn <= D <= due 인 모든 구간 선택
    const covered = [];
    const remaining = [];

    for (const it of uncovered) {
      const minBound = it.warn < today ? today : it.warn;
      if (minBound <= d && d <= it.due) {
        covered.push({ id: it.id, name: it.name });
      } else {
        remaining.push(it);
      }
    }

    // 만약 첫 요소가 범위 불일치로 커버되지 못했다면 강제 포함
    if (covered.length === 0 && uncovered.length > 0) {
      covered.push({ id: uncovered[0].id, name: uncovered[0].name });
      remaining.shift();
    }

    bundles.push({
      date: d,
      items: covered
    });

    uncovered = remaining;
  }

  // 날짜순 정렬
  bundles.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return bundles;
}

/**
 * 3.7 새 재료 관찰 대상 확인
 * @param {Array<Object>} ingredients
 * @param {Object} firstUsedMap { [ingId]: 'YYYY-MM-DD' }
 * @param {string} today
 * @param {number} [watchDays=3]
 * @returns {Array<Object>}
 */
export function getNewIngredients(ingredients, firstUsedMap, today, watchDays = 3) {
  const result = [];
  for (const ing of ingredients) {
    const firstUsed = firstUsedMap[ing.id];
    if (!firstUsed) continue;
    // diff = today - firstUsed
    const diff = Math.round((new Date(today) - new Date(firstUsed)) / 86400000);
    if (diff >= 0 && diff < watchDays) {
      result.push({
        ingredient: ing,
        firstUsedDate: firstUsed,
        dayNumber: diff + 1,
        watchDays
      });
    }
  }
  return result;
}
