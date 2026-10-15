import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { forecast, calculateRate, recommendBundles, getNewIngredients } from '../js/forecast.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const vectors = JSON.parse(fs.readFileSync(path.join(__dirname, 'vectors.json'), 'utf8'));

test('forecast.js - 3.5 예시 A (베이스 쌀미음) 검증', () => {
  const { today, stock, rate, eatenToday, settings, expected } = vectors.exampleA;

  const result = forecast({ stock, rate, eatenToday, today }, settings);

  assert.equal(result.warn, expected.warn, '제작 권장 시작일이 10/18이어야 합니다.');
  assert.equal(result.due, expected.due, '제작 마감 권장일이 10/19이어야 합니다.');
  assert.equal(result.empty, expected.empty, '소진일이 10/20이어야 합니다.');
});

test('forecast.js - 3.5 예시 B 및 T6 (토핑 애호박) 검증', () => {
  const { today, stock, rate, eatenToday, settings, expected } = vectors.exampleB;

  const result = forecast({ stock, rate, eatenToday, today }, settings);

  assert.equal(result.warn, expected.warn, '제작 권장 시작일이 오늘+9일(10/24)이어야 합니다.');
  assert.equal(result.due, expected.due, '제작 마감 권장일이 오늘+11일(10/26)이어야 합니다.');
});

test('forecast.js - T6 소비율 계산 검증 (auto 모드)', () => {
  const { stock, recent_7days_eaten, window_days, expected_rate } = vectors.T6;

  const ing = { usage_mode: 'auto' };
  const rate = calculateRate(ing, {
    recentEatenSum: recent_7days_eaten,
    windowDays: window_days,
    availableDays: 7
  });

  assert.ok(Math.abs(rate - expected_rate) < 1e-9, '소비 속도가 3/7이어야 합니다.');
});

test('forecast.js - T4 & T5: 큐브 차감 수량 및 실사 수정 delta 계산', () => {
  // T4: 30g / 30g = 1.0 큐브
  const cubeG = 30;
  const grams = 30;
  const cubesUsed = Math.round((grams / cubeG) * 100) / 100;
  assert.equal(cubesUsed, 1.0);

  // 45g / 30g = 1.5 큐브
  const grams45 = 45;
  const cubesUsed45 = Math.round((grams45 / cubeG) * 100) / 100;
  assert.equal(cubesUsed45, 1.5);

  // T5: 실사 재고 수정 (현재 5개 -> 실사 8개: delta = +3)
  const currentStock = 5;
  const inspectedStock = 8;
  const delta = inspectedStock - currentStock;
  assert.equal(delta, 3);
});

test('forecast.js - 3.6 제작일 묶음 추천 (F-13) 그리디 알고리즘 검증', () => {
  const today = '2026-10-15';
  const items = [
    { id: 'rice', name: '쌀미음', warn: '2026-10-18', due: '2026-10-19' },
    { id: 'oat', name: '오트밀', warn: '2026-10-17', due: '2026-10-20' },
    { id: 'zuc', name: '애호박', warn: '2026-10-24', due: '2026-10-26' }
  ];

  const bundles = recommendBundles(items, today);

  // 쌀미음(10/18~10/19)과 오트밀(10/17~10/20)은 10/19에 함께 묶여야 함
  assert.equal(bundles.length, 2);
  assert.equal(bundles[0].date, '2026-10-19');
  assert.equal(bundles[0].items.length, 2);
  const bundle0Names = bundles[0].items.map(it => it.name).sort();
  assert.deepEqual(bundle0Names, ['쌀미음', '오트밀']);

  // 애호박은 10/26에 별도 추천
  assert.equal(bundles[1].date, '2026-10-26');
  assert.equal(bundles[1].items[0].name, '애호박');
});

test('forecast.js - 3.7 새 재료 관찰 대상 확인 (F-11)', () => {
  const today = '2026-10-15';
  const ingredients = [
    { id: 'rice', name: '쌀미음' },
    { id: 'beef', name: '소고기' },
    { id: 'cabbage', name: '양배추' }
  ];

  const firstUsedMap = {
    rice: '2026-10-09', // 6일 경과 -> 관찰 기간 3일 초과
    beef: '2026-10-14', // 1일 경과 -> 관찰 2일차 (새 재료)
    cabbage: '2026-10-15' // 당일 -> 관찰 1일차 (새 재료)
  };

  const newItems = getNewIngredients(ingredients, firstUsedMap, today, 3);
  assert.equal(newItems.length, 2);
  assert.equal(newItems[0].ingredient.name, '소고기');
  assert.equal(newItems[0].dayNumber, 2);
  assert.equal(newItems[1].ingredient.name, '양배추');
  assert.equal(newItems[1].dayNumber, 1);
});
