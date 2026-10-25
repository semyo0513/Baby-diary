/**
 * api.js - Google Apps Script 백엔드 통신 및 오프라인 outbox 큐
 * 모든 통신은 CORS preflight를 피하기 위해 Content-Type: text/plain POST로 전송
 */

import { CONFIG } from '../config.js';

const STORAGE_KEYS = {
  TOKEN: 'baby_food_token',
  ROLE: 'baby_food_role',
  OUTBOX: 'baby_food_outbox_queue'
};

export function getToken() {
  return localStorage.getItem(STORAGE_KEYS.TOKEN) || '';
}

export function getRole() {
  return localStorage.getItem(STORAGE_KEYS.ROLE) || 'viewer';
}

export function setAuth(token, role) {
  localStorage.setItem(STORAGE_KEYS.TOKEN, token);
  localStorage.setItem(STORAGE_KEYS.ROLE, role);
}

export function clearAuth() {
  localStorage.removeItem(STORAGE_KEYS.TOKEN);
  localStorage.removeItem(STORAGE_KEYS.ROLE);
}

export function isAuthenticated() {
  return Boolean(getToken());
}

/**
 * UUID 생성 유틸
 */
export function generateUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'op_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}

/**
 * 기본 API 호출 함수
 */
export async function request(action, payload = {}, opId = generateUuid()) {
  const gasUrl = CONFIG.GAS_URL;

  const reqBody = {
    action: action,
    token: getToken(),
    opId: opId,
    payload: payload
  };

  // GAS_URL 미설정 시 오프라인/로컬 모드로 처리
  if (!gasUrl || gasUrl.trim() === '') {
    console.warn('[API] GAS_URL이 설정되지 않아 로컬 모드로 동작합니다.');
    return { ok: true, data: null, isLocal: true };
  }

  try {
    const res = await fetch(gasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(reqBody)
    });

    if (!res.ok) {
      throw new Error(`HTTP 오류: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.error || '요청 처리 중 오류가 발생했습니다.');
    }

    return data;
  } catch (err) {
    // 네트워크 실패 시 쓰기 액션이면 outbox에 저장
    const isWrite = !['bootstrap', 'auth.login'].includes(action);
    if (isWrite) {
      enqueueOutbox({ action, payload, opId, timestamp: Date.now() });
    }
    throw err;
  }
}

// =============================================================================
// Outbox 큐 관리 (오프라인 쓰기 동기화)
// =============================================================================

export function getOutbox() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.OUTBOX) || '[]');
  } catch (e) {
    return [];
  }
}

export function setOutbox(queue) {
  localStorage.setItem(STORAGE_KEYS.OUTBOX, JSON.stringify(queue));
}

export function enqueueOutbox(item) {
  const queue = getOutbox();
  // 중복 opId 방지
  if (!queue.some(q => q.opId === item.opId)) {
    queue.push(item);
    setOutbox(queue);
  }
}

/**
 * 대기 중인 outbox 작업 백엔드로 일괄 전송
 */
export async function flushOutbox() {
  const queue = getOutbox();
  if (queue.length === 0 || !CONFIG.GAS_URL || !isAuthenticated()) {
    return { flushed: 0 };
  }

  try {
    const res = await request('sync.batch', { ops: queue });
    // 성공 시 outbox 비우기
    setOutbox([]);
    return { flushed: queue.length, result: res.data };
  } catch (err) {
    console.warn('[Outbox] 동기화 실패 (다음 온라인 시도 대기):', err.message);
    return { flushed: 0, error: err.message };
  }
}

/**
 * PIN 로그인 호출
 */
export async function loginWithPin(pin) {
  const cleanPin = String(pin).trim();
  const res = await request('auth.login', { pin: cleanPin });
  if (res.data && res.data.token) {
    setAuth(res.data.token, res.data.role);
    if (res.data.role === 'editor') {
      localStorage.setItem('baby_food_editor_pin', cleanPin);
    } else {
      localStorage.setItem('baby_food_viewer_pin', cleanPin);
    }
  }
  return res.data;
}
