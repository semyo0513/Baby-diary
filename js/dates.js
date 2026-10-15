/**
 * dates.js - 날짜 및 일차 계산 순수 함수
 * 시간대·서머타임 오차 방지를 위해 모든 계산은 YYYY-MM-DD 문자열 및 UTC 자정 정수 일수 기준
 */

const KOREAN_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * YYYY-MM-DD 문자열을 { year, month, day } 숫자로 분해
 */
export function parseYMD(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return { year, month, day };
}

/**
 * YYYY-MM-DD 문자열의 UTC 밀리초 자정 타임스탬프 반환
 */
export function utcMidnight(dateStr) {
  const p = parseYMD(dateStr);
  if (!p) return NaN;
  return Date.UTC(p.year, p.month - 1, p.day);
}

/**
 * 두 날짜 간격 (dateB - dateA) 정수 일수 계산
 */
export function diffDays(dateA, dateB) {
  const utcA = utcMidnight(dateA);
  const utcB = utcMidnight(dateB);
  if (isNaN(utcA) || isNaN(utcB)) return 0;
  return Math.round((utcB - utcA) / 86400000);
}

/**
 * dateStr 기준 n일 후(또는 음수 시 전)의 YYYY-MM-DD 반환
 */
export function addDays(dateStr, n) {
  const p = parseYMD(dateStr);
  if (!p) return '';
  const date = new Date(Date.UTC(p.year, p.month - 1, p.day + n));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 요일 문자열 반환 (일, 월, 화, 수, 목, 금, 토)
 */
export function getDayOfWeek(dateStr) {
  const p = parseYMD(dateStr);
  if (!p) return '';
  const date = new Date(Date.UTC(p.year, p.month - 1, p.day));
  return KOREAN_WEEKDAYS[date.getUTCDay()];
}

/**
 * 생후 N일차 계산
 * inclusive가 true이면 출생일 = 1일차
 */
export function getBabyDays(targetDate, birthDate, inclusive = true) {
  if (!targetDate || !birthDate) return null;
  const diff = diffDays(birthDate, targetDate);
  const days = diff + (inclusive ? 1 : 0);
  return days > 0 ? days : null;
}

/**
 * 이유식 N일차 계산
 * 시작일 이전은 null 반환
 * inclusive가 true이면 시작일 = 1일차
 */
export function getSolidDays(targetDate, solidStartDate, inclusive = true) {
  if (!targetDate || !solidStartDate) return null;
  const diff = diffDays(solidStartDate, targetDate);
  if (diff < 0) return null;
  return diff + (inclusive ? 1 : 0);
}

/**
 * 풀 문장 헤더 생성
 * 예: 10/15(목) 이은175일차, 이유식7일차
 */
export function formatDaySummary(targetDate, babyName = '아기', birthDate = '', solidStartDate = '', inclusive = true) {
  const p = parseYMD(targetDate);
  if (!p) return targetDate || '';
  const dow = getDayOfWeek(targetDate);
  const babyDays = getBabyDays(targetDate, birthDate, inclusive);
  const solidDays = getSolidDays(targetDate, solidStartDate, inclusive);

  let result = `${p.month}/${p.day}(${dow})`;
  if (babyDays !== null) {
    result += ` ${babyName}${babyDays}일차`;
  }
  if (solidDays !== null) {
    result += `, 이유식${solidDays}일차`;
  }
  return result;
}

/**
 * 달력 셀 축약 표기 (예: 175·이7 또는 168·이-)
 */
export function formatCellSubtext(targetDate, birthDate = '', solidStartDate = '', inclusive = true) {
  const babyDays = getBabyDays(targetDate, birthDate, inclusive);
  const solidDays = getSolidDays(targetDate, solidStartDate, inclusive);

  const bStr = babyDays !== null ? String(babyDays) : '-';
  const sStr = solidDays !== null ? `이${solidDays}` : '이-';
  return `${bStr}·${sStr}`;
}

/**
 * 기념일 계산 (100일, 200일, 300일, 1돌)
 */
export function getAnniversaries(birthDate, inclusive = true) {
  if (!birthDate) return {};
  const p = parseYMD(birthDate);
  if (!p) return {};

  const d100 = addDays(birthDate, inclusive ? 99 : 100);
  const d200 = addDays(birthDate, inclusive ? 199 : 200);
  const d300 = addDays(birthDate, inclusive ? 299 : 300);

  // 1돌: 1년 후 같은 월/일 (윤년 고려)
  const dFirstBirthday = `${p.year + 1}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;

  return {
    [d100]: '100일 🎉',
    [d200]: '200일 🎉',
    [d300]: '300일 🎉',
    [dFirstBirthday]: '첫돌 🎉'
  };
}

/**
 * 월간 달력 격자(일~토) 날짜 배열 생성
 * 이전 달/다음 달 패딩 포함 (항상 7열)
 */
export function getMonthGrid(year, month) {
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const startingDayOfWeek = firstDay.getUTCDay(); // 0(일) ~ 6(토)

  const startDate = addDays(`${year}-${String(month).padStart(2, '0')}-01`, -startingDayOfWeek);

  const grid = [];
  let curr = startDate;
  // 6주(42일) 또는 5주 고정 격자
  for (let i = 0; i < 42; i++) {
    const p = parseYMD(curr);
    grid.push({
      date: curr,
      year: p.year,
      month: p.month,
      day: p.day,
      isCurrentMonth: p.month === month,
      dayOfWeek: getDayOfWeek(curr)
    });
    curr = addDays(curr, 1);
  }
  return grid;
}

/**
 * Asia/Seoul 기준 오늘 날짜 (YYYY-MM-DD) 반환
 */
export function getTodayYMD() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(now);
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}
