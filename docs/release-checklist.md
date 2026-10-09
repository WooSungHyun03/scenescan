# SceneScan release checklist

이 문서는 저장소 검증이 끝난 뒤 배포 담당자가 Production에 적용하는 순서입니다. 체크박스는 실제 대상 프로젝트에서 직접 확인한 뒤에만 완료로 표시합니다. PR CI 성공은 Vercel 배포, Supabase migration, 실제 SMTP 전달, 실제 CLIP/Kakao 동작의 성공을 뜻하지 않습니다.

## 1. 배포 전 고정값과 백업

- [ ] 배포할 Git commit SHA와 현재 정상 Vercel deployment URL을 기록한다.
- [ ] Supabase Dashboard에서 데이터베이스 백업/PITR 가능 여부를 확인하고, Free plan이면 최소한 사용자 소유 테이블과 운영 catalog의 검증된 export를 별도 보관한다.
- [ ] `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`가 같은 commit에서 통과한다.
- [ ] `pnpm audit --prod --audit-level high`가 high/critical 취약점 없이 통과한다.
- [ ] Docker가 가능한 환경에서 `docker build`, `/api/health`, key-free `pnpm test:e2e`를 통과한다.
- [ ] `pnpm supabase:start` 후 `pnpm test:integration`과 `pnpm test:e2e:auth`가 통과한다. 이 검증은 로컬 Mailpit과 로컬 DB만 사용한다.
- [ ] `.github/workflows/ci.yml`의 `verify`와 `Local Auth, Mailpit, and RLS` job이 모두 성공했다.

## 2. Supabase migration 적용 순서

먼저 대상 프로젝트를 연결한 뒤 원격 상태를 확인한다. Production에 바로 쓰기 전에 별도 staging 또는 새 로컬 stack에서 전체 migration을 처음부터 적용한다.

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase migration list
pnpm supabase:start
pnpm test:integration
```

원격에는 `supabase/migrations/` 파일을 timestamp 오름차순으로 적용한다. 현재 순서는 다음과 같다.

1. `20260920000000_initial_schema.sql`
2. `20260928000000_similar_locations.sql`
3. `20260929000000_scale_location_catalog.sql`
4. `20261001000000_location_attribution.sql`
5. `20261001000001_location_import_metadata.sql`
6. `20261001000002_drop_import_metadata_defaults.sql`
7. `20261001000003_match_location_images_filters.sql`
8. `20261001000004_parking_upsert_key.sql`
9. `20261001000005_location_images_storage_bucket.sql`
10. `20261002000000_filtered_location_search.sql`
11. `20261002000001_match_location_images_filtered_model.sql`
12. `20261003000000_permit_provenance.sql`
13. `20261004000000_static_parking_metadata.sql`
14. `20261004000001_structured_noise_sources.sql`
15. `20261004000002_model_safe_similar_search.sql`
16. `20261006000000_user_shortlist.sql`
17. `20261008000000_busan_district_contract.sql`
18. `20261008000001_remove_noise_sources.sql`
19. `20261009000000_text_search.sql`

- [ ] `npx supabase migration list`의 Local/Remote 항목이 일치한다.
- [ ] `user_shortlist`는 `(user_id, location_id)` unique/PK, 두 FK cascade, RLS enabled 상태다.
- [ ] anon 사용자는 catalog를 읽을 수 있지만 쓸 수 없고, authenticated 사용자는 자신의 `user_shortlist`만 SELECT/INSERT/DELETE할 수 있다.
- [ ] migration 적용 중 실패하면 앱 배포를 중단한다. 이미 적용된 migration 파일을 수정하거나 timestamp를 재사용하지 않는다.

## 3. 환경변수 경계

### 브라우저 공개 변수

아래 값은 빌드 시 브라우저에 포함될 수 있다.

| 변수 | Production 기준 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 대상 Supabase HTTPS URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 권장 browser-safe publishable key |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 구형 프로젝트에서만 임시 fallback |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | Kakao JavaScript 앱 키 |
| `NEXT_PUBLIC_USE_MOCK_DATA` | 실데이터 준비 후 `false` |
| `NEXT_PUBLIC_USE_MOCK_AI` | 실제 CLIP 검증 준비 후 `false` |
| `NEXT_PUBLIC_CLIP_DEVICE` | 기본 `wasm`; 검증된 경우에만 `webgpu` |

### 서버 전용 변수

아래 값은 Vercel의 Production 서버 환경에만 둔다. 이름 앞에 `NEXT_PUBLIC_`를 붙이지 않는다.

| 변수 | 용도 |
| --- | --- |
| `SUPABASE_URL` | 관리자 작업 대상 URL |
| `SUPABASE_SECRET_KEY` | 계정 삭제·관리 작업의 현재 server secret |
| `SUPABASE_SERVICE_ROLE_KEY` | 이전 프로젝트의 임시 fallback; 새 설정은 secret key 우선 |
| `KMA_VILLAGE_FORECAST_SERVICE_KEY` | 승인된 기상청 단기예보 서비스 전용 키 |
| `PUBLIC_DATA_PORTAL_SERVICE_KEY` | 오프라인 주차 수집 도구 전용; 일반 Vercel runtime에는 불필요 |
| `NVIDIA_API_KEY` | 텍스트 검색 의도 구조화(P1, 기본 OFF) 전용. 비어 있거나 `NVIDIA_INTENT_ENABLED=false`면 외부 호출이 전혀 없다 |
| `NVIDIA_INTENT_ENABLED` | 위 기능의 kill switch. Production 기본값은 `false` |
| `NVIDIA_INTENT_MODEL` | 선택: allowlist(`src/infrastructure/nvidia/intent-models.ts`) 외 값은 시작 시 검증 실패 |

- [ ] `.env.local`, SMTP password, server secret은 Git에 없다.
- [ ] Vercel Preview에 Production server secret을 자동 복제하지 않았다.
- [ ] `NVIDIA_API_KEY`도 다른 server secret과 동일하게 다룬다 -- Preview에 자동 복제하지 않고, 사용 약관·요금 확인 전에는 `NVIDIA_INTENT_ENABLED=true`로 켜지 않는다.
- [ ] 환경변수 변경 뒤 새 deployment를 만들었다. `NEXT_PUBLIC_*`는 기존 build를 재시작하는 것만으로 바뀌지 않는다.
- [ ] CI의 client-bundle 검사와 Docker image canary 검사가 통과했다.

## 4. Auth, SMTP, callback

- [ ] Supabase Auth의 Site URL은 canonical HTTPS Production origin이다.
- [ ] Redirect allow-list에는 정확히 `https://<domain>/auth/callback`과 `https://<domain>/auth/recovery`가 있다.
- [ ] 의도하지 않은 wildcard, 외부 origin, preview domain이 없다.
- [ ] custom SMTP host, port, username, password, verified sender email/name을 secret 설정에 등록했다.
- [ ] 발신 도메인의 SPF와 DKIM을 확인하고 팀 정책에 맞는 DMARC를 설정했다.
- [ ] Confirm signup, Reset password, Password changed notification에 `supabase/templates/`의 한국어 template을 반영했다.
- [ ] 가입 확인과 recovery template의 `{{ .ConfirmationURL }}`을 그대로 유지했다.
- [ ] resend 최소 간격은 60초 이상이다.
- [ ] 실제 받은편지함에서 가입 확인, recovery, password 변경 알림을 각각 한 번 확인했다. Mailpit 성공을 실메일 성공으로 대체하지 않는다.

세부 설정은 [Auth email setup](auth-email-setup.md)을 따른다.

## 5. Production 데이터 적재

무단 이미지 재다운로드나 출처가 검토되지 않은 URL import는 금지한다. `public/locations/*.jpg` 복원이 필요하면 승인된 Commons manifest와 license manifest 절차만 사용한다.

```bash
pnpm data:validate data/production/locations.json data-work/reports/release-metadata.json \
  --metadata-only \
  --embedding-manifest data/production/embeddings-manifest.json \
  --image-licenses data/production/image-licenses.json
pnpm embeddings:import data/production/embeddings.json --validate-only
pnpm embeddings:audit-schema
```

- [ ] metadata, remote URL, attribution/license, 17개 region 계약 검증이 성공했다.
- [ ] 로컬 원본이 필요한 작업은 승인된 asset 복원 후 `--require-local-assets --image-root .`로 별도 검증했다.
- [ ] Storage upload와 location import를 먼저 `--dry-run`으로 실행해 대상 project와 건수를 확인했다.
- [ ] location/parking을 먼저 적재한 뒤 image/embedding을 적재했다. FK 순서를 바꾸지 않았다.
- [ ] apply 로그에 예상 건수만 있고 provider key, email, JWT, embedding 원문이 출력되지 않았다.
- [ ] Production apply는 단 한 명의 담당자가 한 번 실행하고 결과 보고서를 보관했다.

정확한 명령과 승인된 이미지 복원 절차는 [data pipeline](../scripts/data/README.md)과 [offline embeddings](offline-embeddings.md)을 따른다.

## 6. 배포와 smoke

- [ ] GitHub의 Vercel 연동 하나만 배포를 수행한다. GitHub Actions에 중복 deploy workflow를 추가하지 않는다.
- [ ] Vercel deployment가 Ready이고 `/api/health`가 200이다.
- [ ] 보안 header(CSP, HSTS, Referrer-Policy, Permissions-Policy, nosniff, frame deny)가 Production 응답에 있다.
- [ ] 공개 홈·검색·상세가 로그아웃 상태에서 열린다.
- [ ] 프로젝트 소유 evaluation image 한 장으로 real CLIP 검색을 정확히 한 번 실행하고 결과가 1~8개인지 확인한다.
- [ ] 실제 Kakao 지도에 marker가 하나 이상 보이고 등록한 Production domain에서 SDK 오류가 없다.
- [ ] region/category filter, 부산 region 회귀, 상세/태양 정보가 정상이다.
- [ ] 로그인 후 관심 장소 저장이 새로고침과 두 번째 기기에서 보이며 다른 계정과 섞이지 않는다.
- [ ] 회원탈퇴 smoke가 필요하면 전용 테스트 계정만 사용한다. 공용 장소·이미지나 다른 사용자를 삭제하지 않는다.

저비용 자동 smoke는 `.github/workflows/production-smoke.yml`을 수동 실행한다. 이 workflow는 health, real CLIP 결과 수, Kakao marker만 검사하고 한 번의 검색만 사용한다. Production SMTP와 계정 삭제는 자동화하지 않는다.

## 7. Rollback

- [ ] 실패 유형을 앱 build, 환경변수, migration, 데이터, 외부 provider 장애로 먼저 구분한다.
- [ ] 앱 회귀는 기록해 둔 이전 Vercel deployment로 rollback한다.
- [ ] 잘못된 환경변수는 이전 값을 복원하고 반드시 재배포한다. 노출 가능성이 있으면 해당 key를 먼저 revoke/rotate한다.
- [ ] 외부 KMA/Kakao/SMTP 장애는 provider 기능을 실패 상태로 유지하고 catalog 검색을 계속 공개한다. 임의 데이터로 성공처럼 표시하지 않는다.
- [ ] migration은 기존 파일을 역편집하지 않는다. additive corrective migration을 검토하고, 데이터 손실 가능성이 있으면 먼저 백업을 복원하거나 팀 승인을 받는다.
- [ ] catalog import 오류는 저장해 둔 승인 export/manifest를 기준으로 복원한다. 출처 없는 이미지 재다운로드나 전체 table 삭제로 되돌리지 않는다.
- [ ] Auth/RLS 이상 시 계정 기반 shortlist 쓰기를 중단하고 공개 검색만 유지한다. server secret을 브라우저 변수로 옮기는 임시조치는 금지한다.
- [ ] rollback 후 `/api/health`, 공개 검색, 로그인 격리, 보안 header를 다시 확인하고 사고 기록에 commit/deployment/migration 상태를 남긴다.

## 완료 판정

저장소 작업은 CI와 로컬 재현이 성공하면 완료할 수 있다. Production 출시는 배포 담당자가 위 Production 항목을 실제로 실행해 증거를 남기기 전에는 완료로 표시하지 않는다.
