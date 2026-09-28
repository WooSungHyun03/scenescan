# Backend Security Audit — 컨텍스트 요약 (외부 AI 전달용)

이 문서는 "Backend Security Audit" 작업을 다른 AI에게 프롬프트로 넘길 때, 그 AI가 이 프로젝트를 이해하는 데 필요한 배경 정보를 정리한 것입니다. 코드베이스를 실제로 읽고 확인한 내용만 담았습니다 (2026-09-27 기준, `main` 브랜치).

## 1. 프로젝트 개요

- Next.js App Router 단일 프로젝트 (Vercel Hobby 배포 목표). DB/vector/storage는 Supabase Free.
- 사진 한 장(브라우저에서 CLIP 임베딩 추출) → `POST /api/search` → pgvector 유사도 검색 → 최대 8개 촬영지 추천.
- 4인 팀, 도메인별 소유권 분리: 1) AI/배포, 2) 프론트/UX, 3) 백엔드/애플리케이션(`src/domains/*/server`, `src/app/api`, `src/infrastructure/supabase`, migrations — 이 사용자가 소유), 4) 데이터/지오.
- Public read-only MVP. 로그인/인증 없음. 관리자 쓰기 API 없음 — 데이터 입력은 로컬 스크립트로만.
- 참고 문서: `docs/architecture.md`, `docs/database.md`, `docs/api-contracts.md`, `docs/team-ownership.md`.

## 2. 데이터/요청 흐름

```
브라우저 CLIP(512차원 벡터) → POST /api/search { embedding, filters }
  → Zod 검증 → repository (mock | supabase 분기, NEXT_PUBLIC_USE_MOCK_DATA)
  → Supabase RPC match_location_images (pgvector cosine, <=>)
  → 앱 레벨에서 locations 재조회 후 region/category 필터 + Top 8 그룹핑
```

- 위치 목록(`getLocations`)/상세(`getLocation`)는 API 라우트 없이 서버 컴포넌트가 repository를 직접 호출 (`docs/api-contracts.md`: "API pages currently call repositories directly on the server ... Add a route only when a client needs an HTTP contract"). 즉 외부에 노출된 HTTP 엔드포인트는 사실상 `/api/search`와 `/api/health` 뿐.

## 3. 실제 구현 상태 (파일 기준)

| 영역 | 파일 | 상태 |
|---|---|---|
| Supabase 클라이언트 | `src/infrastructure/supabase/server-client.ts` | anon key만 사용, `import "server-only"`로 클라이언트 번들 차단. 별도 service-role 모듈은 `src/infrastructure`에 없음 (아래 4번 참고) |
| DB 스키마 | `supabase/migrations/20260920000000_initial_schema.sql` | `locations`, `location_images`(embedding vector(512), nullable), `parking`. FK, check constraint(region/category/lat/lng), timestamps 존재 |
| RLS | 같은 migration | 3개 테이블 모두 RLS on, `anon`/`authenticated`에 SELECT만 허용하는 정책. INSERT/UPDATE/DELETE 정책 없음(= 기본 거부) |
| RPC | `match_location_images` | `security invoker`, `search_path`를 `public, extensions`로 고정, threshold는 0–1로 clamp, match_count는 1–200으로 clamp. `anon, authenticated`에 EXECUTE grant |
| Search API 검증 | `src/types/contracts.ts` (`searchRequestSchema`) | embedding 길이 512, 모든 값 finite, all-zero 벡터 거부. filters는 enum(region/category)만 허용 |
| 에러 처리 | `src/shared/errors/application-error.ts`, `src/shared/http/api-error-response.ts` | 에러 코드 4종류뿐: `BAD_REQUEST`, `CONFIGURATION_ERROR`, `DATA_ACCESS_ERROR`, `INTERNAL_ERROR`. 클라이언트에는 `publicMessage`만 반환, 원본 Supabase 에러는 서버 로그(`logger.error`)에만 기록 |
| Import/Seed 스크립트 | `scripts/embeddings/import.ts` | service-role key 사용. `validate-only` / `dry-run` / `apply` 3단계. **`NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`가 설정되어 있으면 즉시 throw**하는 방어 코드 존재 (service-role이 클라 번들 변수 이름으로 잘못 들어오는 실수 차단) |
| Repository 분기 | `src/domains/locations/server/repository.ts` | `NEXT_PUBLIC_USE_MOCK_DATA !== "false"`로 mock/real 스위치. mock/real 모두 동일 함수 시그니처 |
| Search 실행 | `src/domains/locations/server/supabase-repository.ts` | RPC는 `match_count: 200` 고정, 이후 `getSupabaseLocations(filters)`로 **전체 locations를 다시 조회**해서 앱 레벨에서 필터링 (SQL 단계 필터링 아직 미구현 — 티켓에 있는 known limit) |
| 목록 조회 페이지네이션 | `src/domains/locations/server/supabase-repository.ts` `getSupabaseLocations` | limit/offset 없음 — 전체 매칭 row를 한 번에 반환 |
| 비슷한 장소 | `repository.ts`의 `getSimilarLocations` | real 모드에서는 **항상 빈 배열 반환** (`Promise.resolve([])`) — 아직 미구현, UI는 empty state 표시 |
| 환경변수 | `.env.example` | `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `NEXT_PUBLIC_KAKAO_MAP_KEY`, `NEXT_PUBLIC_USE_MOCK_DATA/AI`, 그리고 별도로 `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (NEXT_PUBLIC 접두어 없음 — 클라 번들 안 됨) |

## 4. 현재 티켓(위 목록)이 "이미 어느 정도 되어 있는지" 판단 근거

- **RLS/Public Read 정책**: 이미 구현됨 (public read-only, write policy 없음). 감사 시 "정말 anon/authenticated에 write 권한이 없는지", RPC의 `security invoker` + `search_path` 고정이 의도대로 작동하는지 재검증이 핵심.
- **Supabase Client 분리**: anon 클라이언트는 `server-only`로 분리되어 있음. 그러나 service-role 클라이언트는 `src/infrastructure` 하위 모듈이 아니라 `scripts/embeddings/import.ts` 안에 있음 — 티켓이 요구하는 "server-only guard가 걸린 별도 모듈" 구조와 완전히 일치하는지는 감사에서 확인 필요.
- **SQL 단계 Metadata Filtering**: 미구현. RPC가 region/category를 모르고 top-200만 뽑은 뒤 앱에서 필터링 — 데이터가 늘어나면 실제 상위 매치가 필터링 과정에서 누락될 수 있음(이미 `docs/architecture.md`의 known limit에 명시됨).
- **API Structured Error**: 미구현. 지금은 범용 4종 코드뿐이고 `LOCATION_NOT_FOUND` 같은 세분화된 코드가 없음. 게다가 위치 상세/목록은 API 라우트 자체가 없어서(서버 컴포넌트 직접 호출) 이 에러 계약이 애초에 HTTP 레벨에 존재하지 않음 — 감사 AI에게 "이 부분은 아직 설계 단계"라고 알려줘야 함.
- **Pagination/Limit 방어**: `match_count`는 RPC에서 1–200으로 clamp되어 있지만, 목록 조회(`getSupabaseLocations`)에는 limit이 전혀 없음 — 감사에서 주목할 실제 포인트.
- **Seed/Import Interface**: 이미 구현되어 있고 (`validate-only/dry-run/apply`, FK/RPC preflight, service-role 오사용 방어) 상당히 성숙한 상태.
- **Backend Security Audit** 자체가 이번 티켓 — 아래 5번이 감사 AI가 실제로 봐야 할 체크리스트.

## 5. 감사 AI에게 구체적으로 확인시켜야 할 포인트

1. `src/infrastructure/supabase/server-client.ts`: anon key 클라이언트가 정말 클라이언트 컴포넌트에 import될 수 없는 구조인지 (server-only 패키지 신뢰 + import 그래프 확인).
2. `supabase/migrations/20260920000000_initial_schema.sql`의 RLS 정책과 `match_location_images` RPC: `security invoker`인데 실행 권한(`grant execute ... to anon, authenticated`)이 RLS를 우회할 수 있는 경로가 없는지, `search_path` 고정이 스키마 인젝션을 막는지.
3. `src/app/api/search/route.ts` + `src/types/contracts.ts`: Zod 스키마가 실제로 모든 악의적 입력(길이 조작, NaN/Infinity, 초대형 배열, 프로토타입 오염 등)을 막는지.
4. `src/domains/locations/server/supabase-repository.ts`: `.eq("id", id)` 등에서 raw SQL 문자열 결합이 없는지(현재는 Supabase JS client의 query builder만 사용 — 문자열 결합 없음, 확인 요망), 잘못된 형식의 `id`(UUID 아님)가 들어왔을 때 500/503으로 새는지 여부.
5. `scripts/embeddings/import.ts` 및 관련 `importer.ts`/`contracts.ts`: service-role 키가 로그에 찍히지 않는지, `--apply` 모드가 실수로 프로덕션에 실행될 위험은 없는지.
6. `src/shared/observability/logger.ts`: 에러 객체 직렬화 시 `stack`은 `NODE_ENV !== "production"`에서만 포함 — 프로덕션에서 정말 그렇게 동작하는지, 그리고 Supabase 에러의 `cause.message`에 민감정보(쿼리 파라미터, 키 일부 등)가 섞여 나가지 않는지.
7. payload size: `/api/search`가 body 크기 제한 없이 `request.json()`을 호출 — Next.js 기본 제한 외에 별도 제한이 있는지 확인 필요.
8. `.env*`가 `.gitignore`에 포함되어 있고 `.env.example`만 커밋됨 — 실제 git history에 키가 노출된 적 없는지 별도 확인(`git log -p -- .env*` 등)은 감사 스코프에 포함할지 결정 필요.

## 6. 감사 AI에게 주지시킬 제약

- Mock 모드(`NEXT_PUBLIC_USE_MOCK_DATA=true`)에서는 Supabase를 아예 호출하지 않으므로, 실제 Supabase 프로젝트가 없어도 코드 리딩만으로 감사 가능해야 함.
- 이 프로젝트는 로그인/세션이 없는 완전 공개 서비스이므로 "인증 우회" 류 취약점은 해당사항 없음 — 초점은 (a) anon 권한으로 쓰기 가능 여부, (b) RPC/쿼리 파라미터 조작으로 인한 DoS/과도한 데이터 유출, (c) 시크릿 노출, (d) 입력 검증 누락.
- 실제로 고칠지 여부는 이 요약을 만든 시점 이후 사람이 판단 — 감사 AI는 "발견 + 근거 파일/라인 + 재현 시나리오" 형태로만 보고하면 됨.