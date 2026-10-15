import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseYMD,
  utcMidnight,
  diffDays,
  addDays,
  getDayOfWeek,
  getBabyDays,
  getSolidDays,
  formatDaySummary,
  formatCellSubtext,
  getAnniversaries
} from '../js/dates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const vectors = JSON.parse(fs.readFileSync(path.join(__dirname, 'vectors.json'), 'utf8'));

test('dates.js - 기본 날짜 파싱 및 연산', () => {
  assert.deepEqual(parseYMD('2026-10-15'), { year: 2026, month: 10, day: 15 });
  assert.equal(diffDays('2026-10-09', '2026-10-15'), 6);
  assert.equal(addDays('2026-10-15', 3), '2026-10-18');
  assert.equal(addDays('2026-10-15', -7), '2026-10-08');
  assert.equal(getDayOfWeek('2026-10-15'), '목');
});

test('dates.js - T1: 이유식 7일차, 생후 175일차 검증', () => {
  const { birth_date, solid_start_date, target_date, count_inclusive, expected_baby_day, expected_solid_day } = vectors.T1;

  const babyDays = getBabyDays(target_date, birth_date, count_inclusive);
  const solidDays = getSolidDays(target_date, solid_start_date, count_inclusive);

  assert.equal(babyDays, expected_baby_day, '생후 일차가 175일차여야 합니다.');
  assert.equal(solidDays, expected_solid_day, '이유식 일차가 7일차여야 합니다.');

  const summary = formatDaySummary(target_date, '이은', birth_date, solid_start_date, count_inclusive);
  assert.equal(summary, '10/15(목) 이은175일차, 이유식7일차');

  const subtext = formatCellSubtext(target_date, birth_date, solid_start_date, count_inclusive);
  assert.equal(subtext, '175·이7');
});

test('dates.js - T2: 이유식 시작일 이전 날짜 미표시 검증', () => {
  const { solid_start_date, target_date, expected_solid_day } = vectors.T2;

  const solidDays = getSolidDays(target_date, solid_start_date, true);
  assert.equal(solidDays, expected_solid_day, '이유식 시작일 전은 null이어야 합니다.');

  const subtext = formatCellSubtext(target_date, '2026-04-24', solid_start_date, true);
  assert.equal(subtext, '168·이-');
});

test('dates.js - 기념일(100일, 200일, 첫돌) 계산', () => {
  const birthDate = '2026-04-24';
  const anniversaries = getAnniversaries(birthDate, true);

  // 4/24 출생 -> 100일차는 4/24 + 99일 = 2026-08-01
  assert.equal(anniversaries['2026-08-01'], '100일 🎉');
  assert.equal(anniversaries['2027-04-24'], '첫돌 🎉');
});
