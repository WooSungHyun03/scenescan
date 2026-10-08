export const LOCATION_CATEGORY_VALUES = ["urban", "nature", "industrial", "interior"] as const;

// DEPRECATED (부산 district 전환, see docs/database.md and docs/api-contracts.md):
// the catalog is being narrowed from all 17 first-level regions to Busan
// only. `region` is kept at a single fixed value for the length of the
// transition so existing callers (DB rows, UI, stored sessions) do not break
// while `district` (below) becomes the real filter dimension. Planned
// removal: once every consumer reads `district` instead of `region` and the
// production catalog's non-Busan rows have been retired/migrated out (data
// pipeline follow-up, not part of this contract change), drop this constant,
// `Region`, `Location.region`, and `LocationFilter.region` together with a
// migration that drops the `locations.region` column.
export const REGION_VALUES = ["부산"] as const;

// Busan's 16 구/군. Internal keys are busan-prefixed and romanized so they
// never collide with another city's district of the same Korean name (중구,
// 서구, 동구, 남구, 북구, 강서구 all exist in other cities too) -- applying the
// prefix uniformly to all 16, not just the 6 that currently collide, keeps
// the key scheme consistent if districts for another city are ever added.
// This is the single source of truth: UI option lists, the Zod filter
// schema, and the `locations.district` DB check constraint must all derive
// from (or be kept in exact sync with) this list -- do not hand-write a
// second copy of these keys anywhere.
export const DISTRICT_LABELS = {
  busan_jung_gu: "중구",
  busan_seo_gu: "서구",
  busan_dong_gu: "동구",
  busan_yeongdo_gu: "영도구",
  busan_busanjin_gu: "부산진구",
  busan_dongnae_gu: "동래구",
  busan_nam_gu: "남구",
  busan_buk_gu: "북구",
  busan_haeundae_gu: "해운대구",
  busan_saha_gu: "사하구",
  busan_geumjeong_gu: "금정구",
  busan_gangseo_gu: "강서구",
  busan_yeonje_gu: "연제구",
  busan_suyeong_gu: "수영구",
  busan_sasang_gu: "사상구",
  busan_gijang_gun: "기장군",
} as const;

export const DISTRICT_VALUES = Object.keys(DISTRICT_LABELS) as (keyof typeof DISTRICT_LABELS)[];
