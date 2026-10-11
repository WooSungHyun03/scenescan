# 상세·후보 비교 외부 정보 smoke test

이 절차는 실제 서비스 키를 등록한 사람이 로컬 또는 배포 환경에서 실행한다. 키 값은 화면, 로그, 이슈, 커밋에 남기지 않는다.

## 사전 조건

- `KMA_VILLAGE_FORECAST_SERVICE_KEY`: 기상청 단기예보 조회서비스 승인이 끝난 일반 인증키
- `KAKAO_LOCAL_REST_API_KEY`: Kakao Developers 앱의 REST API 키
- 지도까지 확인할 때만 `NEXT_PUBLIC_KAKAO_MAP_KEY`: 같은 앱의 JavaScript 키
- Supabase 실데이터를 사용할 때 필요한 기존 서버 환경변수

로컬에서는 위 값을 `.env.local`에 넣고 `pnpm dev`를 다시 시작한다. Vercel 등록은 배포 담당자가 나중에 수행한다.

## 실행 순서

1. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`를 실행한다.
2. 장소 검색에서 서로 가까운 장소 2곳을 관심 장소로 저장한다.
3. `/shortlist`에서 두 장소를 비교 대상으로 선택한다.
4. 개발자 도구 Network에서 같은 `nx, ny`에 해당하는 두 장소가 한 개의 `/weather` 요청만 만드는지 확인한다.
5. 촬영 날짜·시간을 바꾸고 이전 응답이 늦게 도착해도 선택한 시각의 예보가 유지되는지 확인한다.
6. 후보를 펼치기 전에는 해당 후보의 `/parking`, `/contacts` 요청이 없는지 확인한다.
7. 후보 하나를 펼쳐 주차 거리, 장소 대표번호/관리기관/허가 문의 구분, 출처 링크를 확인한다. 접었다 다시 펼쳐도 호출이 반복되지 않아야 한다.
8. 장소명을 눌러 상세로 이동한다. 사진, 지도, 태양, 날씨, 허가 문의, 주차, Similar 순서와 기능을 확인한다.
9. DevTools에서 Offline로 전환해 새로 고친다. 날씨·주차·문의 패널에는 각각 fallback이 나타나고 사진·지도·태양·Similar는 계속 보여야 한다.
10. 모바일 viewport에서 비교표를 좌우로 스크롤하고 펼침 버튼과 전화/외부 링크의 터치 영역을 확인한다.
11. Console에 uncaught exception, hydration error, state update after unmount 경고가 없는지 확인한다.

실제 전화번호는 대표번호 표시와 촬영 허가 담당 표시가 구분되는지만 확인한다. 전화 문의로 촬영 허가 여부를 확인하는 작업은 사용자가 별도로 수행한다.
