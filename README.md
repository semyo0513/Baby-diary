# 🍚 이유식 육아 앱 (Baby Food PWA)

매일 먹은 이유식 기록 · 일차 자동 표시 · 냉동 큐브 재고와 다음 제작일 자동 계산 앱입니다.

스택: **Google Sheets(DB)** + **Google Apps Script `Code.gs`(단일 백엔드 API)** + **GitHub Pages(바닐라 JS ES 모듈 PWA 프론트엔드)**

---

## 1. 주요 기능 요약 (P0 / P1)
- **월간 달력 (F-01, F-03, F-08)**: 7열 격자 및 리스트 보기, 생후/이유식 일차(예: `175·이7`), 식단 칩, 제작 권장 구간(🧊), 제작 완료일(🍳), 새 재료 관찰(🆕), 기념일(🎉 100일, 200일, 돌)
- **식단 3탭 간편 기록 (F-02, 4.4)**: 1탭(시트 오픈) → 2탭(재료 칩 터치, 직전 섭취 그램 자동 채움) → 3탭(저장), 어제 식단 1탭 복사
- **큐브 원장 및 재고 자동 차감 (F-06, F-07)**: 식단 저장 시 `그램 ÷ cube_g`로 자동 차감, 수정/삭제 시 자동 복구, 실사 재고 직접 보정
- **제작일 자동 계산 (3.4 알고리즘)**: 소비율 $r$(고정 fixed 또는 최근 7일 auto)과 잔여 재고로 소진일 및 `[warn, due]` 권장 구간 계산 (`EPS = 1e-9`)
- **제작일 묶음 추천 (F-13)**: 구간 찌르기 그리디 알고리즘으로 여러 재료를 한 번에 만드는 최적 날짜 제안
- **PIN 인증 및 보안 (6.6)**: 편집용(editor) / 조회용(viewer) PIN, 솔트 해시, HMAC 세션 토큰, 5회 실패 시 10분 잠금, 시트 수식 주입 방지
- **오프라인 Outbox PWA (6.4, 6.5)**: 네트워크 미연결 시 로컬 캐시 우선 렌더링 + outbox 큐 적재 후 온라인 복귀 시 자동 일괄 동기화

---

## 2. 단위 테스트 실행

Node.js v18 이상 내장 테스트 러너를 사용합니다:

```bash
npm test
# 또는
node --test tests/*.test.js
```

테스트 항목:
1. `tests/dates.test.js`: 일차 계산(T1 10/15 -> 생후 175일, 이유식 7일차), 시작일 이전 미표시(T2), 100일/돌 기념일 계산
2. `tests/forecast.test.js`:
   - 3.5 예시 A (베이스 쌀미음 10/18~10/19 🧊, 10/20 소진)
   - 3.5 예시 B & T6 (토핑 애호박 $r=3/7$, warn=오늘+9일, due=오늘+11일)
   - T4 & T5 (큐브 차감 및 실사 보정 delta 계산)
   - 3.6 묶음 제작 추천 그리디 알고리즘
   - 3.7 새 재료 3일 관찰 감지

---

## 3. 배포 가이드

### 3.1 Google Apps Script 백엔드 배포

1. 구글 드라이브에서 **새 구글 스프레드시트** 생성 (이름: `이은 이유식 다이어리`)
2. 상단 메뉴에서 **확장 프로그램 → Apps Script** 클릭
3. `gas/Code.gs` 파일의 전체 내용을 Apps Script의 `Code.gs`에 붙여넣기
4. 좌측 톱니바퀴(프로젝트 설정) → **「appsscript.json 매니페스트 파일 표시」** 체크
5. 좌측 파일 목록의 `appsscript.json`을 열어 `gas/appsscript.json` 내용으로 교체:
   ```json
   {
     "timeZone": "Asia/Seoul",
     "runtimeVersion": "V8",
     "webapp": {
       "executeAs": "USER_DEPLOYING",
       "access": "ANYONE_ANONYMOUS"
     },
     "exceptionLogging": "STACKDRIVER"
   }
   ```
6. 저장(Ctrl+S / Cmd+S) 후 스프레드시트 탭을 새로고침
7. 스프레드시트 상단 메뉴에 **「🍚 이유식 앱」** 메뉴 생성됨:
   - **`1. 초기 설정 (시트/헤더 생성)`** 클릭 (처음 1회 권한 승인 창이 뜨면 승인 진행)
   - 기본 편집용 PIN(`123456`) 및 조회용 PIN(`000000`)으로 초기화 완료
   - 필요 시 **`2. PIN 재설정`** 메뉴를 통해 비밀번호 변경 가능
8. Apps Script 편집기 우측 상단 **「배포 → 새 배포」** 클릭:
   - 유형: **웹 앱**
   - 설명: `v1.0.0`
   - 다음 사용자 권한으로 실행: **나(USER_DEPLOYING)**
   - 액세스 권한이 있는 사용자: **모든 사용자(ANYONE_ANONYMOUS)**
   - 배포 클릭 후 생성된 **웹 앱 URL** (`https://script.google.com/macros/s/.../exec`) 복사

### 3.2 GitHub Pages 프론트엔드 배포

1. GitHub에 새 저장소 생성 (Public 권장)
2. `config.js`를 열어 `GAS_URL`에 3.1에서 복사한 웹 앱 URL 입력:
   ```javascript
   export const CONFIG = {
     GAS_URL: 'https://script.google.com/macros/s/AKfycbx.../exec'
   };
   ```
3. 저장소에 전체 파일 커밋 & 푸시:
   ```bash
   git init
   git add .
   git commit -m "feat: complete baby food PWA and GAS backend"
   git remote add origin https://github.com/<사용자명>/<저장소명>.git
   git branch -M main
   git push -u origin main
   ```
4. GitHub 저장소 **Settings → Pages** 메뉴 이동:
   - Source: **Deploy from a branch**
   - Branch: **`main` / `/(root)`** 선택 후 Save
5. 몇 분 후 제공되는 GitHub Pages URL로 모바일 브라우저(Safari/Chrome)에서 접속
6. 브라우저에서 **「홈 화면에 추가」**를 누르면 앱 아이콘으로 설치되어 전체 화면 PWA로 구동됩니다.
