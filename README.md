# 인천대학교 연속간행물실 근무 대시보드 — Frontend

React 19 + TypeScript + Vite로 구현한 근무 관리 화면이다. 이 저장소에서 화면·스타일·로고·글꼴·Vercel 설정을 독립적으로 관리한다.

API·인증·SQLite·백업·서버 배포는 [백엔드 저장소](https://github.com/eatyummydance200/library-dashboard-backend)에서 관리한다. 백엔드 소스나 상위 폴더의 파일 없이 이 레포만으로 설치·빌드할 수 있다.

## 기능과 구조

- 대시보드의 이전·현재·다음 근무자, 당직 연락처, 이슈, 태깅 현황
- 09:00~22:00, 30분 단위 시간표와 주당 근무·데스크 시간·오픈·마감 집계
- 근무자·선생님 연락처, 이슈 작성·완료, 연도별 태깅, 월별 과월호 배정·완료 체크
- 로그인·계정·비밀번호 변경·관리자 DB 백업 다운로드

```text
src/               React 화면, API 호출, 타입, 날짜 처리
static/            CSS, INU 로고, 글꼴과 라이선스
scripts/assets.mjs 글꼴 준비·무결성 검증
public/            빌드 때 복사되는 글꼴 라이선스
vite.config.ts     개발 API 프록시·기본 경로
vercel.json        배포 경로·API 프록시·보안 헤더
```

원래 레포의 `frontend/` 내용을 이 레포 루트로 옮겼다. 공유하던 CSS·로고·글꼴 라이선스도 함께 옮겼다. 이전 서버 렌더링 HTML·JavaScript와 전용 테스트는 원래 레포의 분리 전 Git 이력에서 확인한다.

## 로컬 실행과 빌드

Node.js 22를 사용한다. 먼저 별도 백엔드를 `PORT=8090`, `APP_BASE_PATH=/library-dashboard`, `COOKIE_SECURE=false`로 실행한다. 관리자·DB 환경변수는 백엔드 README를 따른다.

```bash
npm ci
npm run dev
```

Vite가 안내하는 주소의 `/library-dashboard/`를 연다. 개발 프록시는 `/library-dashboard/api/*`만 `http://127.0.0.1:8090`으로 전달한다. 백엔드 포트를 바꾸면 `vite.config.ts`의 프록시 주소도 맞춘다.

```bash
npm run build
npm run preview
```

빌드는 글꼴 무결성 검증 → 엄격한 TypeScript 검사 → Vite 번들 생성 순서이며 결과는 `dist/`에 생성한다. 첫 실행에서는 공식 Pretendard v1.3.9 글꼴을 다운로드하므로 네트워크 연결이 필요하다. 이후에는 저장된 글꼴을 재사용하고 매번 SHA-256을 확인한다. `static/fonts/OFL.txt`는 `public/OFL.txt`를 거쳐 배포된다.

`npm run preview`는 정적 번들 확인용이다. API 프록시는 개발 서버와 Vercel에 설정되어 있으므로 로그인·저장 검증에는 백엔드를 연결한 `npm run dev` 또는 Vercel을 사용한다. CI는 PR과 `main` push에서 `npm ci`, `npm run build`를 실행한다.

## Vercel 배포 설정

| 항목 | 값 |
| --- | --- |
| 연결 저장소 | `eatyummydance200/library-dashboard-frontend` |
| Root Directory | 레포 루트 (`.`), 기존 `frontend` 지정 해제 |
| Node.js | `22.x` |
| Framework | `Vite` |
| Install / Build | `npm ci` / `npm run build` |
| Output | `dist` |

상위 폴더의 파일을 포함하는 옵션은 필요 없다. `vercel.json`은 루트에서 화면 경로로 이동하고 `/library-dashboard/assets/*`를 번들 자산으로, 화면 경로를 `index.html`로 연결한다.

`/library-dashboard/api/*`는 `https://eatyummydance200.tail72d30b.ts.net/library-dashboard/api/*`로 전달한다. API 응답은 캐시하지 않으며 브라우저는 프론트 출처의 HttpOnly·Secure·SameSite 세션 쿠키와 CSRF 헤더를 사용한다. 별도 CORS 허용은 필요 없다. API 서버 주소가 바뀌면 `vercel.json`의 프록시 대상도 갱신한다.

프론트 저장소를 먼저 연결·검증한 뒤 API 전용 백엔드를 배포한다. 백엔드는 이전 HTML 로그인·업무 화면을 제공하지 않으므로 사용자는 프론트 주소로 접속한다. Java API 서버와 기존 공개 API 주소는 계속 가동되어야 한다.

이름·연락처는 로그인 후 API에서 읽는다. 비밀번호·관리자 환경변수·SQLite·서버 비밀값을 프론트 코드·공개 환경변수·번들에 넣지 않는다. 세션 만료·서버 재시작 후에는 다시 로그인한다.

## 디자인 자산

Pretendard와 INU Blue/Yellow 스타일을 사용한다. 사용자 제공 INU 워드마크는 외부 홈페이지 링크 없이 표시한다. 공식 브랜드 출처는 [인천대학교 UI](https://www.inu.ac.kr/inu/728/subview.do), 글꼴 라이선스는 [OFL.txt](static/fonts/OFL.txt)다.

## 커밋 컨벤션

백엔드와 같은 태그를 프론트 작업에 맞춰 적용한다. 제목은 `이모지 태그 : 변경 내용` 형식이며 철자·대소문자와 콜론 앞뒤 공백을 유지한다. 한 커밋에는 하나의 목적을 담는다.

| 태그 | 설명 |
| --- | --- |
| ⚙️ Setting : | React·TypeScript·Vite 개발 환경과 도구 설정 |
| ✅ Test : | 컴포넌트·화면·사용자 흐름 테스트 작성 및 수정 |
| ✨ Feature : | 화면·컴포넌트·사용자 기능 및 UI 구현 |
| 🌍 Ci : | 프론트 빌드·CI·Vercel 배포 설정 |
| 🪲 Fix : | 화면 표시·인터랙션·API 연동 버그 수정 |
| 📄 Docs : | 실행 방법·컴포넌트·UI 관련 문서 작성 및 수정 |
| 🔧 Chore : | 의존성·정적 자산 등 자잘한 유지보수 |
| 🔨 Refactor : | 동작을 유지하는 컴포넌트·훅·스타일 구조 개선 |

```text
⚙️ Setting : Vite 개발 API 프록시 설정
✅ Test : 로그인 화면의 오류 표시 테스트 추가
✨ Feature : 시간표 요일 선택 화면 구현
🌍 Ci : Vercel 배포 루트 경로 수정
🪲 Fix : 태깅 저장 후 체크 상태 표시 오류 수정
📄 Docs : 프론트 로컬 실행 방법 추가
🔧 Chore : 사용하지 않는 이미지 정리
🔨 Refactor : 계정 화면의 공통 입력 컴포넌트 분리
```

새 화면·스타일 구현은 `Feature`, 잘못된 UI·반응형 표시 수정은 `Fix`, 동작을 유지하는 구조 개선은 `Refactor`를 사용한다. 본문이 필요하면 제목 다음 한 줄을 비우고 변경 이유·영향을 적는다. PR을 squash merge할 때도 같은 제목 형식을 사용한다.
