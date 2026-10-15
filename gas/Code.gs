/**
 * 🍚 이유식 육아 앱 백엔드 (Google Apps Script)
 * Code.gs - 단일 파일 풀 스택 백엔드
 * 
 * 구성:
 * 1. CONFIG: 시트명, 상수, 캐시 설정
 * 2. ENTRY: doPost(e), doGet(e), JSON 응답 포맷터
 * 3. AUTH: PIN 검증, HMAC 토큰 발급 및 서명 검증, 무차별 대입 차단
 * 4. VALIDATE: 입력값 검증 및 시트 수식 주입(=+-@) 차단
 * 5. SHEET UTIL: LockService 직렬화, 일괄 getValues/setValues 테이블 유틸
 * 6. SERVICE: Settings, Ingredients, MealItems + CubeLedger 연동, Cube 조작, Presets, DayLog
 * 7. SETUP & MENU: 초기화 setup(), PIN 설정 대화상자, 주간 백업, 셀프 테스트
 */

// =============================================================================
// 1. CONFIG
// =============================================================================
const CONFIG = {
  SHEETS: {
    SETTINGS: 'Settings',
    INGREDIENTS: 'Ingredients',
    MEAL_ITEMS: 'MealItems',
    CUBE_LEDGER: 'CubeLedger',
    DAY_LOG: 'DayLog',
    PRESETS: 'Presets',
    AUDIT_LOG: 'AuditLog'
  },
  SETTINGS: 'Settings',
  INGREDIENTS: 'Ingredients',
  MEAL_ITEMS: 'MealItems',
  CUBE_LEDGER: 'CubeLedger',
  DAY_LOG: 'DayLog',
  PRESETS: 'Presets',
  AUDIT_LOG: 'AuditLog',
  DEFAULT_PINS: {
    EDITOR: '123456',
    VIEWER: '000000'
  },
  SALT_KEY: 'baby_food_salt_2026',
  TOKEN_EXP_DAYS: 30,
  LOCK_TIMEOUT_MS: 20000,
  BRUTE_FORCE_LIMIT: 5,
  BRUTE_FORCE_LOCK_MINUTES: 10,
  APP_VERSION: '1.0.0'
};

// =============================================================================
// 2. ENTRY & ROUTER
// =============================================================================
function doPost(e) {
  try {
    let req;
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('요청 본문(payload)이 비어있습니다.');
    }

    try {
      req = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      throw new Error('요청 형식이 유효한 JSON이 아닙니다: ' + parseErr.message);
    }

    const action = req.action;
    const token = req.token;
    const opId = req.opId || Utilities.getUuid();
    const payload = req.payload || {};

    // 1) 로그인 요청 (토큰 불필요)
    if (action === 'auth.login') {
      const loginResult = handleLogin(payload.pin);
      return makeResponse(true, loginResult, null);
    }

    // 2) 토큰 검증
    const auth = verifyToken(token);
    const role = auth.role; // 'editor' | 'viewer'

    // 3) 권한별 라우팅
    const READ_ACTIONS = ['bootstrap', 'day.get', 'cube.summary'];
    const isWrite = !READ_ACTIONS.includes(action);

    if (isWrite && role !== 'editor') {
      throw new Error('조회 전용(viewer) 권한으로는 데이터를 수정할 수 없습니다.');
    }

    // 4) 쓰기 작업 LockService 직렬화 및 처리
    let data;
    if (isWrite) {
      data = withLock(() => executeAction(action, payload, role, opId));
      logAudit(role, action, opId, 'SUCCESS');
    } else {
      data = executeAction(action, payload, role, opId);
    }

    return makeResponse(true, data, null);
  } catch (err) {
    return makeResponse(false, null, err.message);
  }
}

function doGet(e) {
  const info = {
    service: '이유식 육아 앱 API',
    version: CONFIG.APP_VERSION,
    status: 'ONLINE',
    time: new Date().toISOString()
  };
  return makeResponse(true, info, null);
}

function makeResponse(ok, data, error) {
  const version = getProperty('DATA_VERSION') || '1';
  const res = {
    ok: Boolean(ok),
    data: data || null,
    error: error || null,
    version: String(version)
  };
  return ContentService.createTextOutput(JSON.stringify(res))
    .setMimeType(ContentService.MimeType.JSON);
}

function executeAction(action, payload, role, opId) {
  switch (action) {
    case 'bootstrap':
      return serviceBootstrap(payload.month);
    case 'day.save':
      return serviceDaySave(payload);
    case 'day.copy':
      return serviceDayCopy(payload);
    case 'cube.made':
      return serviceCubeMade(payload);
    case 'cube.adjust':
      return serviceCubeAdjust(payload);
    case 'cube.discard':
      return serviceCubeDiscard(payload);
    case 'ingredient.save':
      return serviceIngredientSave(payload);
    case 'ingredient.archive':
      return serviceIngredientArchive(payload);
    case 'settings.save':
      return serviceSettingsSave(payload);
    case 'preset.save':
      return servicePresetSave(payload);
    case 'preset.delete':
      return servicePresetDelete(payload);
    case 'sync.batch':
      return serviceSyncBatch(payload.ops, role);
    default:
      throw new Error(`알 수 없는 action입니다: ${action}`);
  }
}

// =============================================================================
// 3. AUTH & SECURITY
// =============================================================================
function handleLogin(pin) {
  if (!pin || typeof pin !== 'string') {
    throw new Error('PIN 번호를 입력해주세요.');
  }

  const cache = CacheService.getScriptCache();
  const lockKey = 'LOGIN_LOCK';
  if (cache.get(lockKey)) {
    throw new Error('PIN 5회 오류로 인해 10분간 로그인이 잠겼습니다. 잠시 후 다시 시도해주세요.');
  }

  const editorHash = getProperty('PIN_EDITOR_HASH') || hashPin(CONFIG.DEFAULT_PINS.EDITOR);
  const viewerHash = getProperty('PIN_VIEWER_HASH') || hashPin(CONFIG.DEFAULT_PINS.VIEWER);

  const inputHash = hashPin(pin.trim());

  let role = null;
  if (inputHash === editorHash) {
    role = 'editor';
  } else if (inputHash === viewerHash) {
    role = 'viewer';
  }

  if (!role) {
    // 실패 카운트 증가
    const failCountKey = 'PIN_FAIL_COUNT';
    const currentFails = parseInt(cache.get(failCountKey) || '0', 10) + 1;
    if (currentFails >= CONFIG.BRUTE_FORCE_LIMIT) {
      cache.put(lockKey, 'LOCKED', CONFIG.BRUTE_FORCE_LOCK_MINUTES * 60);
      cache.remove(failCountKey);
      throw new Error('PIN을 5회 잘못 입력하여 10분간 로그인이 차단되었습니다.');
    } else {
      cache.put(failCountKey, String(currentFails), 600);
      throw new Error(`PIN 번호가 일치하지 않습니다. (오류 ${currentFails}/${CONFIG.BRUTE_FORCE_LIMIT})`);
    }
  }

  // 로그인 성공 시 실패 카운트 초기화
  cache.remove('PIN_FAIL_COUNT');

  const exp = Date.now() + CONFIG.TOKEN_EXP_DAYS * 86400 * 1000;
  const tokenPayload = { role: role, exp: exp };
  const token = signToken(tokenPayload);

  return {
    token: token,
    role: role,
    expiresAt: exp
  };
}

function hashPin(pin) {
  const raw = pin + ':' + CONFIG.SALT_KEY;
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return digest.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

function getHmacSecret() {
  let secret = getProperty('HMAC_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + '-' + Utilities.getUuid();
    setProperty('HMAC_SECRET', secret);
  }
  return secret;
}

function signToken(payload) {
  const secret = getHmacSecret();
  const header = Utilities.base64EncodeWebSafe(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = Utilities.base64EncodeWebSafe(JSON.stringify(payload));
  const unsigned = header + '.' + body;
  const sigBytes = Utilities.computeHmacSha256Signature(unsigned, secret);
  const sig = Utilities.base64EncodeWebSafe(sigBytes);
  return unsigned + '.' + sig;
}

function verifyToken(token) {
  if (!token) throw new Error('인증 토큰이 누락되었습니다. 로그인해 주세요.');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('유효하지 않은 인증 토큰 형식입니다.');

  const unsigned = parts[0] + '.' + parts[1];
  const secret = getHmacSecret();
  const expectedSigBytes = Utilities.computeHmacSha256Signature(unsigned, secret);
  const expectedSig = Utilities.base64EncodeWebSafe(expectedSigBytes);

  if (parts[2] !== expectedSig) {
    throw new Error('토큰 서명이 유효하지 않습니다.');
  }

  const payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[1])).getDataAsString());
  if (payload.exp && Date.now() > payload.exp) {
    throw new Error('인증 세션이 만료되었습니다. 다시 로그인해 주세요.');
  }

  return payload;
}

// =============================================================================
// 4. VALIDATION & SANITIZATION
// =============================================================================
function validateDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`유효하지 않은 날짜 형식(YYYY-MM-DD)입니다: ${dateStr}`);
  }
  return dateStr;
}

function validateGrams(grams) {
  const g = parseFloat(grams);
  if (isNaN(g) || g <= 0 || g > 500) {
    throw new Error(`그램(g)은 0 초과 500 이하이어야 합니다: ${grams}`);
  }
  return g;
}

function sanitizeValue(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') {
    // 수식 주입(=, +, -, @) 방지: 따옴표 접두
    if (/^[=+\-@]/.test(val)) {
      return "'" + val;
    }
    return val;
  }
  return val;
}

// =============================================================================
// 5. SHEET & CONCURRENCY UTILITIES
// =============================================================================
function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet(sheetName) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

function withLock(callback) {
  const lock = LockService.getScriptLock();
  const hasLock = lock.tryLock(CONFIG.LOCK_TIMEOUT_MS);
  if (!hasLock) {
    throw new Error('다른 작업이 진행 중이어서 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.');
  }
  try {
    const res = callback();
    bumpVersion();
    return res;
  } finally {
    lock.releaseLock();
  }
}

function bumpVersion() {
  const current = parseInt(getProperty('DATA_VERSION') || '1', 10);
  const next = String(current + 1);
  setProperty('DATA_VERSION', next);
  return next;
}

function getProperty(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function setProperty(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
}

function readTable(sheetName) {
  const sheet = getSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0].map(h => String(h).trim());
  const rows = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    // 모든 열이 비어있는 행 스킵
    if (row.every(cell => cell === '' || cell === null)) continue;

    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      let val = row[c];
      // 작은따옴표로 이스케이프된 문자열 복원
      if (typeof val === 'string' && val.startsWith("'") && /^[=+\-@]/.test(val.slice(1))) {
        val = val.slice(1);
      }
      obj[headers[c]] = val;
    }
    obj.__rowIndex = i + 1; // 1-indexed row number
    rows.push(obj);
  }
  return rows;
}

function appendRow(sheetName, headers, rowObj) {
  const sheet = getSheet(sheetName);
  const row = headers.map(h => sanitizeValue(rowObj[h]));
  sheet.appendRow(row);
}

function appendRows(sheetName, headers, rowObjs) {
  if (!rowObjs || rowObjs.length === 0) return;
  const sheet = getSheet(sheetName);
  const rows = rowObjs.map(obj => headers.map(h => sanitizeValue(obj[h])));
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, rows.length, headers.length).setValues(rows);
}

function updateCell(sheetName, rowIndex, colIndex, value) {
  const sheet = getSheet(sheetName);
  sheet.getRange(rowIndex, colIndex).setValue(sanitizeValue(value));
}

function logAudit(role, action, opId, result) {
  try {
    const sheet = getSheet(CONFIG.SHEETS.AUDIT_LOG);
    const ts = new Date().toISOString();
    sheet.appendRow([ts, role, action, opId, result]);
  } catch (e) {
    // Audit failure should not break the core flow
  }
}

// =============================================================================
// 6. SERVICES (BUSINESS LOGIC)
// =============================================================================

/**
 * 첫 로딩 및 월 단위 부트스트랩 데이터 반환
 */
function serviceBootstrap(targetMonth) {
  // Settings
  const settingsRows = readTable(CONFIG.SHEETS.SETTINGS);
  const settings = {};
  for (const r of settingsRows) {
    if (r.key) settings[r.key] = r.value;
  }

  // Ingredients (활성 재료)
  const ingRows = readTable(CONFIG.SHEETS.INGREDIENTS);
  const ingredients = ingRows
    .filter(r => String(r.active).toUpperCase() !== 'FALSE')
    .sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0));

  const ingMap = {};
  for (const ing of ingredients) {
    ingMap[ing.id] = ing;
  }

  // MealItems (요청 월 기준 필터링 또는 전체)
  const mealRows = readTable(CONFIG.SHEETS.MEAL_ITEMS);
  const activeMeals = mealRows.filter(m => String(m.deleted).toUpperCase() !== 'TRUE');

  // CubeLedger
  const ledgerRows = readTable(CONFIG.SHEETS.CUBE_LEDGER);
  const activeLedger = ledgerRows.filter(l => String(l.deleted).toUpperCase() !== 'TRUE');

  // 재료별 재고 및 통계 계산
  const cubeSummary = {};
  for (const ing of ingredients) {
    cubeSummary[ing.id] = {
      stock: 0,
      recentEaten: {}, // { 'YYYY-MM-DD': cubes }
      firstUsed: null,
      lastMade: null
    };
  }

  // 1) Ledger delta 합산 (stock & lastMade)
  for (const entry of activeLedger) {
    const ingId = entry.ingredient_id;
    if (!cubeSummary[ingId]) {
      cubeSummary[ingId] = { stock: 0, recentEaten: {}, firstUsed: null, lastMade: null };
    }
    const delta = parseFloat(entry.delta) || 0;
    cubeSummary[ingId].stock = Math.round((cubeSummary[ingId].stock + delta) * 100) / 100;

    if (entry.type === 'made') {
      const d = entry.date;
      if (!cubeSummary[ingId].lastMade || d > cubeSummary[ingId].lastMade) {
        cubeSummary[ingId].lastMade = d;
      }
    }
  }

  // 2) MealItems 기반 firstUsed 및 최근 소진량 집계
  for (const m of activeMeals) {
    const ingId = m.ingredient_id;
    if (!cubeSummary[ingId]) continue;

    const d = m.date;
    if (!cubeSummary[ingId].firstUsed || d < cubeSummary[ingId].firstUsed) {
      cubeSummary[ingId].firstUsed = d;
    }

    const cubes = parseFloat(m.cubes_used) || 0;
    if (cubes > 0) {
      cubeSummary[ingId].recentEaten[d] = Math.round(((cubeSummary[ingId].recentEaten[d] || 0) + cubes) * 100) / 100;
    }
  }

  // DayLog
  const dayLogRows = readTable(CONFIG.SHEETS.DAY_LOG);
  const dayLogs = {};
  for (const dl of dayLogRows) {
    if (dl.date) dayLogs[dl.date] = dl;
  }

  // Presets
  const presetRows = readTable(CONFIG.SHEETS.PRESETS);
  const presets = presetRows.sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0));

  // Made Events (달력 🍳 표시용)
  const madeEvents = activeLedger
    .filter(l => l.type === 'made')
    .map(l => ({
      date: l.date,
      ingredient_id: l.ingredient_id,
      delta: l.delta,
      memo: l.memo
    }));

  return {
    settings: settings,
    ingredients: ingredients,
    items: activeMeals,
    dayLogs: dayLogs,
    madeEvents: madeEvents,
    cubeSummary: cubeSummary,
    presets: presets
  };
}

/**
 * 특정 날짜의 식단 원자적 저장 (F-02, F-07)
 * 기존 식단 소프트 삭제 -> 원장 eaten 소프트 삭제 -> 새 식단 저장 -> 새 eaten 원장 생성
 */
function serviceDaySave(payload) {
  const date = validateDate(payload.date);
  const meals = payload.meals || [];
  const dayLog = payload.dayLog || null;

  const mealSheet = getSheet(CONFIG.MEAL_ITEMS);
  const ledgerSheet = getSheet(CONFIG.CUBE_LEDGER);
  const dayLogSheet = getSheet(CONFIG.DAY_LOG);

  // 1. 기존 MealItems 중 해당 날짜 항목 삭제 처리
  const mealRows = readTable(CONFIG.MEAL_ITEMS);
  const existingMealIds = [];
  for (const m of mealRows) {
    if (m.date === date && String(m.deleted).toUpperCase() !== 'TRUE') {
      existingMealIds.push(m.id);
      // deleted 열(11번째) 업데이트
      updateCell(CONFIG.MEAL_ITEMS, m.__rowIndex, 11, 'TRUE');
      updateCell(CONFIG.MEAL_ITEMS, m.__rowIndex, 10, new Date().toISOString());
    }
  }

  // 2. 기존 CubeLedger 중 해당 날짜의 eaten 행 삭제 처리
  const ledgerRows = readTable(CONFIG.CUBE_LEDGER);
  for (const l of ledgerRows) {
    if (String(l.deleted).toUpperCase() !== 'TRUE' && l.type === 'eaten') {
      if (l.date === date || (l.ref_id && existingMealIds.includes(l.ref_id))) {
        // deleted 열(9번째) 업데이트
        updateCell(CONFIG.CUBE_LEDGER, l.__rowIndex, 9, 'TRUE');
      }
    }
  }

  // 3. 재료 마스터 맵 로드 (cube_g 확인용)
  const ingRows = readTable(CONFIG.INGREDIENTS);
  const ingMap = {};
  for (const ing of ingRows) {
    ingMap[ing.id] = ing;
  }

  // 4. 새 식단 항목 생성 및 CubeLedger eaten 생성
  const nowIso = new Date().toISOString();
  const mealHeaders = ['id', 'date', 'meal_no', 'ingredient_id', 'name', 'grams', 'use_cube', 'cubes_used', 'created_at', 'updated_at', 'deleted'];
  const ledgerHeaders = ['id', 'ts', 'date', 'ingredient_id', 'type', 'delta', 'ref_id', 'memo', 'deleted'];

  const newMealRows = [];
  const newLedgerRows = [];

  for (const m of meals) {
    const mealNo = m.meal_no || 1;
    const items = m.items || [];

    for (const item of items) {
      const ingId = item.ingredient_id;
      const ing = ingMap[ingId];
      const ingName = ing ? ing.name : (item.name || '미등록');
      const grams = validateGrams(item.grams);
      const useCube = item.use_cube !== false; // 기본 true

      const cubeG = ing && parseFloat(ing.cube_g) > 0 ? parseFloat(ing.cube_g) : 30;
      const cubesUsed = useCube ? Math.round((grams / cubeG) * 100) / 100 : 0;
      const mealItemId = Utilities.getUuid();

      newMealRows.push({
        id: mealItemId,
        date: date,
        meal_no: mealNo,
        ingredient_id: ingId,
        name: ingName,
        grams: grams,
        use_cube: useCube ? 'TRUE' : 'FALSE',
        cubes_used: cubesUsed,
        created_at: nowIso,
        updated_at: nowIso,
        deleted: 'FALSE'
      });

      // 큐브 차감 원장 기록
      if (useCube && cubesUsed > 0) {
        newLedgerRows.push({
          id: Utilities.getUuid(),
          ts: nowIso,
          date: date,
          ingredient_id: ingId,
          type: 'eaten',
          delta: -cubesUsed,
          ref_id: mealItemId,
          memo: `${mealNo}끼 ${ingName} ${grams}g 섭취`,
          deleted: 'FALSE'
        });
      }
    }
  }

  appendRows(CONFIG.MEAL_ITEMS, mealHeaders, newMealRows);
  appendRows(CONFIG.CUBE_LEDGER, ledgerHeaders, newLedgerRows);

  // 5. DayLog 업서트
  if (dayLog) {
    const dlRows = readTable(CONFIG.DAY_LOG);
    const existingDl = dlRows.find(dl => dl.date === date);
    const tagsStr = Array.isArray(dayLog.tags) ? dayLog.tags.join(',') : (dayLog.tags || '');

    if (existingDl) {
      updateCell(CONFIG.DAY_LOG, existingDl.__rowIndex, 2, dayLog.appetite || '');
      updateCell(CONFIG.DAY_LOG, existingDl.__rowIndex, 3, tagsStr);
      updateCell(CONFIG.DAY_LOG, existingDl.__rowIndex, 4, dayLog.memo || '');
      updateCell(CONFIG.DAY_LOG, existingDl.__rowIndex, 5, nowIso);
    } else {
      appendRow(CONFIG.DAY_LOG, ['date', 'appetite', 'tags', 'memo', 'updated_at'], {
        date: date,
        appetite: dayLog.appetite || '',
        tags: tagsStr,
        memo: dayLog.memo || '',
        updated_at: nowIso
      });
    }
  }

  return {
    success: true,
    date: date,
    mealCount: newMealRows.length
  };
}

/**
 * 어제 식단 복사 (day.copy)
 */
function serviceDayCopy(payload) {
  const fromDate = validateDate(payload.from);
  const toDate = validateDate(payload.to);

  const mealRows = readTable(CONFIG.MEAL_ITEMS);
  const sourceMeals = mealRows.filter(m => m.date === fromDate && String(m.deleted).toUpperCase() !== 'TRUE');

  if (sourceMeals.length === 0) {
    throw new Error(`${fromDate} 날짜에 저장된 식단이 없습니다.`);
  }

  // 끼니 번호별 그룹화
  const mealMap = {};
  for (const m of sourceMeals) {
    const no = m.meal_no || 1;
    if (!mealMap[no]) mealMap[no] = [];
    mealMap[no].push({
      ingredient_id: m.ingredient_id,
      name: m.name,
      grams: parseFloat(m.grams) || 30,
      use_cube: String(m.use_cube).toUpperCase() !== 'FALSE'
    });
  }

  const meals = Object.keys(mealMap).map(no => ({
    meal_no: parseInt(no, 10),
    items: mealMap[no]
  }));

  // DayLog 복사 옵션
  let dayLog = null;
  const dlRows = readTable(CONFIG.DAY_LOG);
  const sourceDl = dlRows.find(dl => dl.date === fromDate);
  if (sourceDl) {
    dayLog = {
      appetite: sourceDl.appetite,
      tags: sourceDl.tags,
      memo: ''
    };
  }

  return serviceDaySave({
    date: toDate,
    meals: meals,
    dayLog: dayLog
  });
}

/**
 * 큐브 제작 기록 (F-06: cube.made)
 */
function serviceCubeMade(payload) {
  const ingId = payload.ingredient_id;
  const qty = parseFloat(payload.qty);
  const date = validateDate(payload.date || getTodayDateString());
  const memo = payload.memo || '';

  if (isNaN(qty) || qty <= 0) {
    throw new Error('제작 수량은 0보다 커야 합니다.');
  }

  const nowIso = new Date().toISOString();
  appendRow(CONFIG.CUBE_LEDGER, ['id', 'ts', 'date', 'ingredient_id', 'type', 'delta', 'ref_id', 'memo', 'deleted'], {
    id: Utilities.getUuid(),
    ts: nowIso,
    date: date,
    ingredient_id: ingId,
    type: 'made',
    delta: qty,
    ref_id: '',
    memo: memo,
    deleted: 'FALSE'
  });

  return { success: true, ingredient_id: ingId, added: qty };
}

/**
 * 큐브 실사 재고 직접 수정 (F-06: cube.adjust)
 */
function serviceCubeAdjust(payload) {
  const ingId = payload.ingredient_id;
  const targetCount = parseFloat(payload.count);
  const date = validateDate(payload.date || getTodayDateString());
  const memo = payload.memo || '실사 재고 보정';

  if (isNaN(targetCount) || targetCount < 0) {
    throw new Error('재고 수정값은 0 이상이어야 합니다.');
  }

  // 현재 재고 계산
  const ledgerRows = readTable(CONFIG.CUBE_LEDGER);
  let currentStock = 0;
  for (const l of ledgerRows) {
    if (l.ingredient_id === ingId && String(l.deleted).toUpperCase() !== 'TRUE') {
      currentStock += parseFloat(l.delta) || 0;
    }
  }
  currentStock = Math.round(currentStock * 100) / 100;

  const delta = Math.round((targetCount - currentStock) * 100) / 100;
  if (Math.abs(delta) > 0) {
    const nowIso = new Date().toISOString();
    appendRow(CONFIG.CUBE_LEDGER, ['id', 'ts', 'date', 'ingredient_id', 'type', 'delta', 'ref_id', 'memo', 'deleted'], {
      id: Utilities.getUuid(),
      ts: nowIso,
      date: date,
      ingredient_id: ingId,
      type: 'adjust',
      delta: delta,
      ref_id: '',
      memo: memo,
      deleted: 'FALSE'
    });
  }

  return { success: true, ingredient_id: ingId, newStock: targetCount, delta: delta };
}

/**
 * 큐브 폐기 기록 (cube.discard)
 */
function serviceCubeDiscard(payload) {
  const ingId = payload.ingredient_id;
  const qty = parseFloat(payload.qty);
  const date = validateDate(payload.date || getTodayDateString());
  const memo = payload.reason || payload.memo || '폐기';

  if (isNaN(qty) || qty <= 0) {
    throw new Error('폐기 수량은 0보다 커야 합니다.');
  }

  const nowIso = new Date().toISOString();
  appendRow(CONFIG.CUBE_LEDGER, ['id', 'ts', 'date', 'ingredient_id', 'type', 'delta', 'ref_id', 'memo', 'deleted'], {
    id: Utilities.getUuid(),
    ts: nowIso,
    date: date,
    ingredient_id: ingId,
    type: 'discard',
    delta: -qty,
    ref_id: '',
    memo: memo,
    deleted: 'FALSE'
  });

  return { success: true, ingredient_id: ingId, discarded: qty };
}

/**
 * 재료 등록 / 수정 (ingredient.save)
 */
function serviceIngredientSave(payload) {
  const ingRows = readTable(CONFIG.INGREDIENTS);
  const id = payload.id || ('ing_' + Utilities.getUuid().slice(0, 8));
  const existing = ingRows.find(r => r.id === id);

  const rowData = {
    id: id,
    name: payload.name || '새 재료',
    category: payload.category || 'topping',
    color: payload.color || '#4DB6AC',
    cube_g: parseFloat(payload.cube_g) || 30,
    track_cube: payload.track_cube !== false ? 'TRUE' : 'FALSE',
    usage_mode: payload.usage_mode || 'auto',
    daily_rate: parseFloat(payload.daily_rate) || 0,
    shelf_life_days: payload.shelf_life_days || '',
    active: payload.active !== false ? 'TRUE' : 'FALSE',
    sort: parseInt(payload.sort, 10) || (ingRows.length + 1),
    created_at: payload.created_at || new Date().toISOString()
  };

  const headers = ['id', 'name', 'category', 'color', 'cube_g', 'track_cube', 'usage_mode', 'daily_rate', 'shelf_life_days', 'active', 'sort', 'created_at'];

  if (existing) {
    for (let c = 0; c < headers.length; c++) {
      const colName = headers[c];
      updateCell(CONFIG.INGREDIENTS, existing.__rowIndex, c + 1, rowData[colName]);
    }
  } else {
    appendRow(CONFIG.INGREDIENTS, headers, rowData);
  }

  return { success: true, id: id };
}

/**
 * 재료 보관(비활성화) (ingredient.archive)
 */
function serviceIngredientArchive(payload) {
  const id = payload.id;
  const ingRows = readTable(CONFIG.INGREDIENTS);
  const target = ingRows.find(r => r.id === id);
  if (!target) {
    throw new Error(`해당 ID의 재료를 찾을 수 없습니다: ${id}`);
  }

  updateCell(CONFIG.INGREDIENTS, target.__rowIndex, 10, 'FALSE'); // active = FALSE
  return { success: true, id: id };
}

/**
 * 설정 저장 (settings.save)
 */
function serviceSettingsSave(payload) {
  const currentSettings = readTable(CONFIG.SHEETS.SETTINGS);
  const settingMap = {};
  for (const s of currentSettings) {
    settingMap[s.key] = s;
  }

  for (const key of Object.keys(payload)) {
    const val = String(payload[key]);
    if (settingMap[key]) {
      updateCell(CONFIG.SHEETS.SETTINGS, settingMap[key].__rowIndex, 2, val);
    } else {
      appendRow(CONFIG.SHEETS.SETTINGS, ['key', 'value'], { key: key, value: val });
    }
  }

  return { success: true };
}

/**
 * 프리셋 저장 (preset.save)
 */
function servicePresetSave(payload) {
  const presetRows = readTable(CONFIG.SHEETS.PRESETS);
  const id = payload.id || ('preset_' + Utilities.getUuid().slice(0, 8));
  const existing = presetRows.find(r => r.id === id);

  const itemsJson = typeof payload.items === 'object' ? JSON.stringify(payload.items) : (payload.items_json || '[]');
  const rowData = {
    id: id,
    name: payload.name || '식단 조합',
    items_json: itemsJson,
    sort: parseInt(payload.sort, 10) || (presetRows.length + 1)
  };

  const headers = ['id', 'name', 'items_json', 'sort'];
  if (existing) {
    for (let c = 0; c < headers.length; c++) {
      updateCell(CONFIG.SHEETS.PRESETS, existing.__rowIndex, c + 1, rowData[headers[c]]);
    }
  } else {
    appendRow(CONFIG.SHEETS.PRESETS, headers, rowData);
  }

  return { success: true, id: id };
}

/**
 * 프리셋 삭제 (preset.delete)
 */
function servicePresetDelete(payload) {
  const id = payload.id;
  const sheet = getSheet(CONFIG.SHEETS.PRESETS);
  const presetRows = readTable(CONFIG.SHEETS.PRESETS);
  const target = presetRows.find(r => r.id === id);
  if (target) {
    sheet.deleteRow(target.__rowIndex);
  }
  return { success: true, id: id };
}

/**
 * 오프라인 배치 동기화 (sync.batch)
 */
function serviceSyncBatch(ops, role) {
  if (!ops || !Array.isArray(ops)) return [];
  const results = [];
  for (const op of ops) {
    try {
      const res = executeAction(op.action, op.payload, role, op.opId);
      results.push({ opId: op.opId, ok: true, data: res });
    } catch (err) {
      results.push({ opId: op.opId, ok: false, error: err.message });
    }
  }
  return results;
}

function getTodayDateString() {
  const now = new Date();
  return Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd');
}

// =============================================================================
// 7. SETUP, MENU & BACKUP
// =============================================================================

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🍚 이유식 앱')
    .addItem('1. 초기 설정 (시트/헤더 생성)', 'setup')
    .addItem('2. PIN 재설정 (편집/조회)', 'setPinsDialog')
    .addItem('3. 데이터 백업 생성', 'backupSheet')
    .addItem('4. 백엔드 셀프 테스트', '_selfTest')
    .addToUi();
}

/**
 * 스프레드시트 초기 생성 및 서식 지정
 */
function setup() {
  const ss = getSpreadsheet();

  // 1. Settings 시트
  const sSheet = getSheet(CONFIG.SHEETS.SETTINGS);
  if (sSheet.getLastRow() === 0) {
    sSheet.appendRow(['key', 'value']);
    sSheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#EFEBE9');
    sSheet.appendRow(['baby_name', '이은']);
    sSheet.appendRow(['birth_date', '2026-04-24']);
    sSheet.appendRow(['solid_start_date', '2026-10-09']);
    sSheet.appendRow(['count_inclusive', 'TRUE']);
    sSheet.appendRow(['warn_stock', '2']);
    sSheet.appendRow(['due_stock', '1']);
    sSheet.appendRow(['lead_days', '0']);
    sSheet.appendRow(['usage_window_days', '7']);
    sSheet.appendRow(['watch_days', '3']);
    sSheet.appendRow(['stage_json', '']);
  }

  // 2. Ingredients 시트
  const iSheet = getSheet(CONFIG.SHEETS.INGREDIENTS);
  if (iSheet.getLastRow() === 0) {
    const headers = ['id', 'name', 'category', 'color', 'cube_g', 'track_cube', 'usage_mode', 'daily_rate', 'shelf_life_days', 'active', 'sort', 'created_at'];
    iSheet.appendRow(headers);
    iSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#EFEBE9');
    const nowIso = new Date().toISOString();
    // 초기 재료 3종 (쌀미음, 오트밀, 애호박)
    iSheet.appendRow(['ing_rice', '쌀미음', 'base', '#FF8A65', 30, 'TRUE', 'fixed', 1, '', 'TRUE', 1, nowIso]);
    iSheet.appendRow(['ing_oat', '오트밀', 'base', '#FFA726', 20, 'TRUE', 'fixed', 1, '', 'TRUE', 2, nowIso]);
    iSheet.appendRow(['ing_zuc', '애호박', 'topping', '#66BB6A', 10, 'TRUE', 'auto', 0, '', 'TRUE', 3, nowIso]);
  }

  // 3. MealItems 시트
  const mSheet = getSheet(CONFIG.SHEETS.MEAL_ITEMS);
  if (mSheet.getLastRow() === 0) {
    const headers = ['id', 'date', 'meal_no', 'ingredient_id', 'name', 'grams', 'use_cube', 'cubes_used', 'created_at', 'updated_at', 'deleted'];
    mSheet.appendRow(headers);
    mSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#EFEBE9');
    // 날짜 열(2번째) 일반 텍스트 서식 지정
    mSheet.getRange('B:B').setNumberFormat('@');
  }

  // 4. CubeLedger 시트
  const lSheet = getSheet(CONFIG.SHEETS.CUBE_LEDGER);
  if (lSheet.getLastRow() === 0) {
    const headers = ['id', 'ts', 'date', 'ingredient_id', 'type', 'delta', 'ref_id', 'memo', 'deleted'];
    lSheet.appendRow(headers);
    lSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#EFEBE9');
    // 날짜 열(3번째) 일반 텍스트 서식 지정
    lSheet.getRange('C:C').setNumberFormat('@');
  }

  // 5. DayLog 시트
  const dSheet = getSheet(CONFIG.SHEETS.DAY_LOG);
  if (dSheet.getLastRow() === 0) {
    const headers = ['date', 'appetite', 'tags', 'memo', 'updated_at'];
    dSheet.appendRow(headers);
    dSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#EFEBE9');
    dSheet.getRange('A:A').setNumberFormat('@');
  }

  // 6. Presets 시트
  const pSheet = getSheet(CONFIG.SHEETS.PRESETS);
  if (pSheet.getLastRow() === 0) {
    const headers = ['id', 'name', 'items_json', 'sort'];
    pSheet.appendRow(headers);
    pSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#EFEBE9');
  }

  // 7. AuditLog 시트
  const aSheet = getSheet(CONFIG.SHEETS.AUDIT_LOG);
  if (aSheet.getLastRow() === 0) {
    const headers = ['ts', 'role', 'action', 'opId', 'result'];
    aSheet.appendRow(headers);
    aSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#EFEBE9');
  }

  // Script Properties 기본값 세팅
  if (!getProperty('PIN_EDITOR_HASH')) {
    setProperty('PIN_EDITOR_HASH', hashPin(CONFIG.DEFAULT_PINS.EDITOR));
  }
  if (!getProperty('PIN_VIEWER_HASH')) {
    setProperty('PIN_VIEWER_HASH', hashPin(CONFIG.DEFAULT_PINS.VIEWER));
  }
  if (!getProperty('DATA_VERSION')) {
    setProperty('DATA_VERSION', '1');
  }

  SpreadsheetApp.getUi().alert('초기 설정이 완료되었습니다!\n기본 편집용 PIN: 123456\n기본 조회용 PIN: 000000');
}

/**
 * PIN 설정 대화상자
 */
function setPinsDialog() {
  const ui = SpreadsheetApp.getUi();
  const editorRes = ui.prompt('편집용 PIN 설정', '새 편집용 PIN 번호(숫자 4~8자리 권장)를 입력하세요:', ui.ButtonSet.OK_CANCEL);
  if (editorRes.getSelectedButton() === ui.Button.OK) {
    const newEditorPin = editorRes.getResponseText().trim();
    if (newEditorPin) {
      setProperty('PIN_EDITOR_HASH', hashPin(newEditorPin));
    }
  }

  const viewerRes = ui.prompt('조회용 PIN 설정', '새 조회용(읽기 전용) PIN 번호를 입력하세요:', ui.ButtonSet.OK_CANCEL);
  if (viewerRes.getSelectedButton() === ui.Button.OK) {
    const newViewerPin = viewerRes.getResponseText().trim();
    if (newViewerPin) {
      setProperty('PIN_VIEWER_HASH', hashPin(newViewerPin));
    }
  }

  ui.alert('PIN 변경이 완료되었습니다.');
}

/**
 * 주간 백업 생성 (F-20)
 */
function backupSheet() {
  const ss = getSpreadsheet();
  const name = `[백업] ${ss.getName()} - ${getTodayDateString()}`;
  const copy = DriveApp.getFileById(ss.getId()).makeCopy(name);
  SpreadsheetApp.getUi().alert(`백업이 성공적으로 생성되었습니다.\n파일 이름: ${name}\n파일 ID: ${copy.getId()}`);
}

/**
 * 백엔드 자체 무결성 테스트
 */
function _selfTest() {
  const ui = SpreadsheetApp.getUi();
  try {
    const boot = serviceBootstrap(getTodayDateString().slice(0, 7));
    if (!boot || !boot.settings || !boot.ingredients) {
      throw new Error('부트스트랩 데이터 조회 실패');
    }
    const tokenRes = handleLogin(CONFIG.DEFAULT_PINS.EDITOR);
    const auth = verifyToken(tokenRes.token);
    if (auth.role !== 'editor') {
      throw new Error('토큰 역할 검증 실패');
    }
    ui.alert('✅ 백엔드 자체 테스트 통과!\n- 시트 DB 읽기 정상\n- 토큰 발급 및 HMAC 서명 정상');
  } catch (err) {
    ui.alert('❌ 자체 테스트 실패: ' + err.message);
  }
}
