/**
 * store.js - 상태 관리, 캐시 우선 렌더링 및 낙관적 UI 업데이트
 */

import { request, getRole, flushOutbox, generateUuid } from './api.js';
import { getTodayYMD, diffDays } from './dates.js';
import { forecast, calculateRate, recommendBundles, getNewIngredients } from './forecast.js';

const CACHE_KEY = 'baby_food_cached_state';

// 기본 초기 상태
const defaultState = {
  settings: {
    baby_name: '이은',
    birth_date: '2026-04-24',
    solid_start_date: '2026-10-09',
    count_inclusive: 'TRUE',
    warn_stock: '2',
    due_stock: '1',
    lead_days: '0',
    usage_window_days: '7',
    watch_days: '3',
    stage_json: ''
  },
  ingredients: [
    { id: 'ing_rice', name: '쌀미음', category: 'base', color: '#FF8A65', cube_g: 30, track_cube: 'TRUE', usage_mode: 'fixed', daily_rate: 1, active: 'TRUE', sort: 1 },
    { id: 'ing_oat', name: '오트밀', category: 'base', color: '#FFA726', cube_g: 20, track_cube: 'TRUE', usage_mode: 'fixed', daily_rate: 1, active: 'TRUE', sort: 2 },
    { id: 'ing_zuc', name: '애호박', category: 'topping', color: '#66BB6A', cube_g: 10, track_cube: 'TRUE', usage_mode: 'auto', daily_rate: 0, active: 'TRUE', sort: 3 }
  ],
  meals: [], // MealItems
  dayLogs: {}, // { 'YYYY-MM-DD': { date, appetite, tags, memo } }
  cubeSummary: {
    ing_rice: { stock: 5, recentEaten: {}, firstUsed: '2026-10-09', lastMade: '2026-10-08' },
    ing_oat: { stock: 0, recentEaten: {}, firstUsed: null, lastMade: null },
    ing_zuc: { stock: 6, recentEaten: {}, firstUsed: null, lastMade: null }
  },
  madeEvents: [
    { date: '2026-10-08', ingredient_id: 'ing_rice', delta: 12, memo: '초기 쌀미음 제작' }
  ],
  presets: [],
  selectedDate: getTodayYMD(),
  selectedMonth: getTodayYMD().slice(0, 7),
  currentTab: 'home',
  syncStatus: 'synced' // 'synced' | 'syncing' | 'offline' | 'local'
};

class Store {
  constructor() {
    this.state = this.loadCache();
    this.listeners = new Set();
  }

  loadCache() {
    try {
      const saved = localStorage.getItem(CACHE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...defaultState,
          ...parsed,
          selectedDate: getTodayYMD(),
          selectedMonth: getTodayYMD().slice(0, 7)
        };
      }
    } catch (e) {
      console.warn('[Store] 캐시 로드 실패:', e);
    }
    return { ...defaultState };
  }

  saveCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('[Store] 캐시 저장 실패:', e);
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.saveCache();
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('[Store] 리스너 호출 오류:', err);
      }
    }
  }

  getState() {
    return this.state;
  }

  setTab(tab) {
    this.state.currentTab = tab;
    this.notify();
  }

  setSelectedDate(dateStr) {
    this.state.selectedDate = dateStr;
    this.notify();
  }

  setSelectedMonth(monthStr) {
    this.state.selectedMonth = monthStr;
    this.notify();
  }

  // ===========================================================================
  // 백엔드 동기화 (Bootstrap)
  // ===========================================================================
  async refreshData() {
    this.state.syncStatus = 'syncing';
    this.notify();

    try {
      const res = await request('bootstrap', { month: this.state.selectedMonth });
      if (res.isLocal) {
        this.state.syncStatus = 'local';
        this.notify();
        return;
      }

      const data = res.data;
      if (data) {
        if (data.settings) this.state.settings = { ...this.state.settings, ...data.settings };
        if (data.ingredients) this.state.ingredients = data.ingredients;
        if (data.items) this.state.meals = data.items;
        if (data.dayLogs) this.state.dayLogs = data.dayLogs;
        if (data.cubeSummary) this.state.cubeSummary = data.cubeSummary;
        if (data.madeEvents) this.state.madeEvents = data.madeEvents;
        if (data.presets) this.state.presets = data.presets;
        this.state.syncStatus = 'synced';
      }

      // 오프라인 큐가 쌓여있다면 flush 시도
      await flushOutbox();
    } catch (err) {
      console.warn('[Store] 동기화 실패 (오프라인 모드 유지):', err.message);
      this.state.syncStatus = 'offline';
    } finally {
      this.notify();
    }
  }

  // ===========================================================================
  // 질의 헬퍼
  // ===========================================================================
  getIngredientsMap() {
    const map = {};
    for (const ing of this.state.ingredients) {
      map[ing.id] = ing;
    }
    return map;
  }

  getMealsForDate(dateStr) {
    return this.state.meals.filter(m => m.date === dateStr && String(m.deleted).toUpperCase() !== 'TRUE');
  }

  getDayLog(dateStr) {
    return this.state.dayLogs[dateStr] || null;
  }

  /**
   * 단일 재료에 대한 실시간 제작일 예측 계산
   */
  getForecastForIngredient(ingId) {
    const ing = this.state.ingredients.find(i => i.id === ingId);
    if (!ing) return null;

    const summary = this.state.cubeSummary[ingId] || { stock: 0, recentEaten: {}, firstUsed: null };
    const today = getTodayYMD();

    // 오늘 먹은 양
    const mealsToday = this.getMealsForDate(today).filter(m => m.ingredient_id === ingId);
    let eatenToday = 0;
    for (const m of mealsToday) {
      eatenToday += parseFloat(m.cubes_used) || 0;
    }

    // 최근 W일간 소진 합
    const windowDays = parseInt(this.state.settings.usage_window_days, 10) || 7;
    let recentSum = 0;
    if (summary.recentEaten) {
      for (const [d, count] of Object.entries(summary.recentEaten)) {
        if (d < today && diffDays(d, today) <= windowDays) {
          recentSum += count;
        }
      }
    }

    // 사용 가능 일수
    let availableDays = windowDays;
    const refDate = summary.firstUsed || this.state.settings.solid_start_date;
    if (refDate) {
      const daysSinceStart = diffDays(refDate, today);
      if (daysSinceStart >= 0) {
        availableDays = Math.min(windowDays, Math.max(1, daysSinceStart));
      }
    }

    const rate = calculateRate(ing, {
      recentEatenSum: recentSum,
      windowDays: windowDays,
      availableDays: availableDays
    });

    const settings = {
      warn_stock: parseFloat(this.state.settings.warn_stock) || 2,
      due_stock: parseFloat(this.state.settings.due_stock) || 1,
      lead_days: parseFloat(this.state.settings.lead_days) || 0
    };

    const fc = forecast({
      stock: summary.stock || 0,
      rate: rate,
      eatenToday: eatenToday,
      today: today
    }, settings);

    return {
      ingredient: ing,
      stock: summary.stock || 0,
      rate: rate,
      forecast: fc
    };
  }

  /**
   * 모든 활성 재료 예측 목록 (임박순 정렬)
   */
  getAllForecasts() {
    const list = [];
    const today = getTodayYMD();

    for (const ing of this.state.ingredients) {
      if (String(ing.active).toUpperCase() === 'FALSE') continue;
      const f = this.getForecastForIngredient(ing.id);
      if (f) list.push(f);
    }

    // 정렬 기준: due_date 오름차순, 없으면 재고 오름차순
    list.sort((a, b) => {
      const dueA = a.forecast ? a.forecast.due : '9999-99-99';
      const dueB = b.forecast ? b.forecast.due : '9999-99-99';
      if (dueA !== dueB) return dueA < dueB ? -1 : 1;
      return a.stock - b.stock;
    });

    return list;
  }

  /**
   * 묶음 제작 추천
   */
  getBundleRecommendations() {
    const forecasts = this.getAllForecasts();
    const items = [];
    for (const f of forecasts) {
      if (f.forecast && f.forecast.warn && f.forecast.due) {
        items.push({
          id: f.ingredient.id,
          name: f.ingredient.name,
          warn: f.forecast.warn,
          due: f.forecast.due
        });
      }
    }
    return recommendBundles(items, getTodayYMD());
  }

  /**
   * 새 재료 관찰 대상 목록
   */
  getNewIngredientsList() {
    const firstUsedMap = {};
    for (const [id, sum] of Object.entries(this.state.cubeSummary)) {
      if (sum.firstUsed) {
        firstUsedMap[id] = sum.firstUsed;
      }
    }
    const watchDays = parseInt(this.state.settings.watch_days, 10) || 3;
    return getNewIngredients(this.state.ingredients, firstUsedMap, getTodayYMD(), watchDays);
  }

  // ===========================================================================
  // 낙관적 UI 상태 변이 (Mutations)
  // ===========================================================================

  /**
   * 식단 저장 (F-02, F-07)
   */
  async saveDayMeals(date, meals, dayLog) {
    const ingMap = this.getIngredientsMap();

    // 1. 기존 날짜 항목 제거 및 재고 복원
    const previousMeals = this.getMealsForDate(date);
    for (const prev of previousMeals) {
      if (String(prev.use_cube).toUpperCase() !== 'FALSE') {
        const ingId = prev.ingredient_id;
        const used = parseFloat(prev.cubes_used) || 0;
        if (this.state.cubeSummary[ingId]) {
          this.state.cubeSummary[ingId].stock = Math.round((this.state.cubeSummary[ingId].stock + used) * 100) / 100;
        }
      }
    }

    this.state.meals = this.state.meals.filter(m => m.date !== date);

    // 2. 새 식단 항목 추가 및 재고 차감
    const nowIso = new Date().toISOString();
    const newItems = [];

    for (const m of meals) {
      const mealNo = m.meal_no || 1;
      for (const it of m.items) {
        const ing = ingMap[it.ingredient_id];
        const ingName = ing ? ing.name : (it.name || '미등록');
        const cubeG = ing && parseFloat(ing.cube_g) > 0 ? parseFloat(ing.cube_g) : 20;
        const grams = parseFloat(it.grams) || 20;
        const useCube = it.use_cube !== false && String(it.use_cube).toUpperCase() !== 'FALSE';

        // 큐브 차감 개수: 지정된 큐브 개수가 있으면 우선 사용 (예: 1개 분출)
        let cubesUsed = 0;
        if (useCube) {
          if (it.cubes_used !== undefined && !isNaN(parseFloat(it.cubes_used))) {
            cubesUsed = parseFloat(it.cubes_used);
          } else {
            cubesUsed = Math.round((grams / cubeG) * 100) / 100;
          }
        }

        const preparedGrams = it.prepared_grams !== undefined && !isNaN(parseFloat(it.prepared_grams))
          ? parseFloat(it.prepared_grams)
          : (useCube ? Math.round(cubesUsed * cubeG) : grams);

        newItems.push({
          id: it.id || generateUuid(),
          date: date,
          meal_no: mealNo,
          ingredient_id: it.ingredient_id,
          name: ingName,
          grams: grams,
          prepared_grams: preparedGrams,
          use_cube: useCube ? 'TRUE' : 'FALSE',
          cubes_used: cubesUsed,
          created_at: nowIso,
          updated_at: nowIso,
          deleted: 'FALSE'
        });

        // 큐브 재고 차감
        if (useCube && cubesUsed > 0 && this.state.cubeSummary[it.ingredient_id]) {
          this.state.cubeSummary[it.ingredient_id].stock = Math.round((this.state.cubeSummary[it.ingredient_id].stock - cubesUsed) * 100) / 100;
        }
      }
    }

    this.state.meals.push(...newItems);

    // 3. DayLog 갱신
    if (dayLog) {
      this.state.dayLogs[date] = {
        date: date,
        appetite: dayLog.appetite || '',
        tags: Array.isArray(dayLog.tags) ? dayLog.tags.join(',') : (dayLog.tags || ''),
        memo: dayLog.memo || '',
        updated_at: nowIso
      };
    }

    // 4. 낙관적 UI 알림
    this.notify();

    // 5. 서버 비동기 전송 및 최신 재고 반영
    try {
      const res = await request('day.save', { date, meals, dayLog });
      if (res && res.data && res.data.cubeSummary) {
        this.state.cubeSummary = res.data.cubeSummary;
        this.notify();
      }
    } catch (err) {
      console.warn('[Store] 서버 저장 지연(오프라인 큐 적재):', err.message);
    }
  }

  /**
   * 식단 항목 단건 삭제 및 재고 복구
   */
  async deleteMealItem(date, itemId) {
    const allItems = this.getMealsForDate(date);
    const target = allItems.find(m => m.id === itemId);
    if (!target) return;

    const remaining = allItems.filter(m => m.id !== itemId);
    const grouped = {};
    for (const r of remaining) {
      const rNo = r.meal_no || 1;
      if (!grouped[rNo]) grouped[rNo] = [];
      grouped[rNo].push({
        id: r.id,
        ingredient_id: r.ingredient_id,
        name: r.name,
        grams: r.grams,
        prepared_grams: r.prepared_grams,
        cubes_used: r.cubes_used,
        use_cube: String(r.use_cube).toUpperCase() !== 'FALSE'
      });
    }

    const payloadMeals = Object.keys(grouped).map(mNo => ({
      meal_no: parseInt(mNo, 10),
      items: grouped[mNo]
    }));

    await this.saveDayMeals(date, payloadMeals, this.getDayLog(date));
  }

  /**
   * 큐브 제작 기록 (cube.made)
   */
  async recordCubeMade(ingId, qty, date, memo) {
    if (!this.state.cubeSummary[ingId]) {
      this.state.cubeSummary[ingId] = { stock: 0, recentEaten: {}, firstUsed: null, lastMade: null };
    }

    this.state.cubeSummary[ingId].stock = Math.round((this.state.cubeSummary[ingId].stock + qty) * 100) / 100;
    this.state.cubeSummary[ingId].lastMade = date;
    this.state.madeEvents.push({ date, ingredient_id: ingId, delta: qty, memo });

    this.notify();

    try {
      await request('cube.made', { ingredient_id: ingId, qty, date, memo });
    } catch (err) {
      console.warn('[Store] 큐브 제작 서버 저장 대기:', err.message);
    }
  }

  /**
   * 큐브 실사 재고 직접 수정 (cube.adjust)
   */
  async adjustCubeStock(ingId, targetStock, date, memo) {
    if (!this.state.cubeSummary[ingId]) {
      this.state.cubeSummary[ingId] = { stock: 0, recentEaten: {}, firstUsed: null, lastMade: null };
    }

    this.state.cubeSummary[ingId].stock = targetStock;
    this.notify();

    try {
      await request('cube.adjust', { ingredient_id: ingId, count: targetStock, date, memo });
    } catch (err) {
      console.warn('[Store] 실사 재고 수정 서버 대기:', err.message);
    }
  }

  /**
   * 재료 저장/수정
   */
  async saveIngredient(ingData) {
    const existingIndex = this.state.ingredients.findIndex(i => i.id === ingData.id);
    if (existingIndex >= 0) {
      this.state.ingredients[existingIndex] = { ...this.state.ingredients[existingIndex], ...ingData };
    } else {
      this.state.ingredients.push({
        ...ingData,
        id: ingData.id || ('ing_' + generateUuid().slice(0, 8)),
        active: 'TRUE'
      });
    }

    this.notify();

    try {
      await request('ingredient.save', ingData);
    } catch (err) {
      console.warn('[Store] 재료 저장 서버 대기:', err.message);
    }
  }

  /**
   * 재료 보관(아카이브)
   */
  async archiveIngredient(ingId) {
    const target = this.state.ingredients.find(i => i.id === ingId);
    if (target) {
      target.active = 'FALSE';
      this.notify();
    }

    try {
      await request('ingredient.archive', { id: ingId });
    } catch (err) {
      console.warn('[Store] 재료 아카이브 서버 대기:', err.message);
    }
  }

  /**
   * 설정 저장
   */
  async saveSettings(newSettings) {
    this.state.settings = { ...this.state.settings, ...newSettings };
    this.notify();

    try {
      await request('settings.save', newSettings);
    } catch (err) {
      console.warn('[Store] 설정 서버 대기:', err.message);
    }
  }
}

export const store = new Store();
