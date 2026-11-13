# 모아요

가족이 함께 쓰는 가계부. 휴대폰 화면을 먼저 생각하고 만든 웹앱(PWA)이며, 나중에 안드로이드 앱으로 감쌀 예정입니다.

## 구성

| 경로 | 내용 |
|---|---|
| `apps/web` | React 19 + TypeScript + Vite + Tailwind v4 웹앱(PWA) |
| `packages/core` | 웹과 서버 함수가 같이 쓰는 순수 TS 로직(현금일 계산, 금액, 한국 시간) |
| `supabase/migrations` | DB 스키마, 권한(RLS), 가족·초대 RPC |
| `supabase/tests` | 로컬 Postgres 로 돌리는 권한 테스트 |

## 진행 상황

- [x] **P0 기반**: 스키마와 RLS, Google 로그인, 가족 만들기·초대·합류, 앱 틀(하단 탭 / 데스크탑 사이드바), PWA, CI
- [ ] **P1 수동 가계부**: 빠른 입력, 분할·태그, 내역·달력·통계·검색, 날짜 기준 토글, 로컬 우선 동기화
- [ ] **P2 AI 입력**: 영수증·캡처·문자 → 자동 추출, 중복 병합, 확인 필요 함
- [ ] **P3 자동 수집**: 안드로이드 앱(알림 수집)

## 처음 설정하기

### 1. Supabase 프로젝트

1. [supabase.com](https://supabase.com) 에서 무료 프로젝트를 만듭니다. 지역은 **Northeast Asia (Seoul)** 을 고르세요.
2. 대시보드 → **SQL Editor** 에서 `supabase/migrations/` 의 SQL 파일을 이름 순서대로 붙여 넣고 실행합니다.
   (Supabase CLI 를 쓴다면 `supabase link --project-ref <ref>` 후 `supabase db push`)
3. **Project Settings → API** 에서 `Project URL` 과 `anon public` 키를 복사해 둡니다.

### 2. Google 로그인

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → **사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
   - 애플리케이션 유형: **웹 애플리케이션**
   - 승인된 리디렉션 URI: `https://<프로젝트 ref>.supabase.co/auth/v1/callback`
   - (처음이면 OAuth 동의 화면을 먼저 만들어야 합니다. 앱 이름 "모아요", 외부, 테스트 사용자에 가족 Gmail 주소를 넣으면 됩니다.)
2. Supabase 대시보드 → **Authentication → Sign In / Providers → Google** 을 켜고 클라이언트 ID 와 비밀번호를 넣습니다.
3. **Authentication → URL Configuration**
   - Site URL: 배포 주소 (예: `https://moayo.netlify.app`)
   - Redirect URLs: `https://moayo.netlify.app/**`, `http://localhost:5173/**`

### 3. 로컬 실행

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # URL 과 anon 키를 채웁니다
npm run dev                                     # http://localhost:5173
```

### 4. 배포 (Netlify)

레포를 Netlify 에 연결하면 `netlify.toml` 이 빌드 설정을 잡아 줍니다.
**Site settings → Environment variables** 에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 를 넣고 다시 배포하세요.

> anon 키는 브라우저에 공개되는 값입니다. 데이터는 RLS 가 막습니다.
> `service_role` 키는 절대 웹앱 환경변수나 코드에 넣지 마세요.

## 검사

```bash
npm run lint
npm run typecheck
npm test            # packages/core, apps/web 단위 테스트
npm run test:db     # 로컬 Postgres 에 임시 DB 를 만들어 마이그레이션 + RLS 테스트
```

`test:db` 는 `psql` 로 접속할 수 있는 Postgres 16 이 필요합니다(`PGHOST`, `PGUSER`, `PGPASSWORD` 로 지정). CI 에서는 자동으로 돌아갑니다.

## 보안 원칙

- 모든 데이터 행은 `household_id` 로 가족에 묶이고, RLS 로 **같은 가족 구성원만** 읽고 쓸 수 있습니다.
- 가족 만들기, 초대, 합류, 구성원 내보내기는 서버 함수(RPC)로만 할 수 있습니다. 역할(owner/member)은 클라이언트가 바꿀 수 없습니다.
- 초대 코드는 10자리, 1회용, 72시간 유효입니다.
- 실제 DELETE 는 허용하지 않고 `deleted_at` 으로 지웁니다(동기화와 복구를 위해).
