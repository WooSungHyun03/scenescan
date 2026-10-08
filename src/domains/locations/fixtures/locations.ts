import type { District, Location, LocationCategory, Region } from "@/types/domain";

type Seed = {
  id: string;
  // Stable asset-naming handle, kept as the old "demo-0N" form so
  // public/images/demo-0N.svg never needed renaming when `id` became a
  // UUID (see docs/database.md and the report for this change -- `id` must
  // be UUID-shaped for it to exercise the same code paths a real Supabase
  // row would, e.g. GET /api/locations/[id]/similar's uuid path-param
  // check).
  slug: string;
  name: string;
  category: LocationCategory;
  region: Region;
  // One fixture (demo-10) is deliberately null to exercise the
  // "구/군 unconfirmed" path (docs/database.md) in mock mode too -- never
  // guessed, same rule real import data follows.
  district: District | null;
  address: string;
  latitude: number;
  longitude: number;
  description: string;
  permit: string;
  parking: string;
  hue: number;
  // Fictional, like every other field here -- exercises
  // POST /api/search/text's name/alias/description/tag matching in mock
  // mode. See src/domains/search/server/text-search-aliases.ts for the
  // real (curated, non-fictional) alias dictionary used to parse a query.
  aliases: string[];
  tags: string[];
};

// All names and addresses are fictional. Coordinates only indicate broad demo
// areas; every fixture's region is now "부산" (see the REGION_VALUES comment
// in src/types/location-options.ts), with district varied across fixtures --
// including a shared "busan_haeundae_gu" group (demo-01/02/04) -- so mock
// mode's district filter has something real to exclude/include.
const seeds: Seed[] = [
  { id: "00000000-0000-4000-8000-000000000001", slug: "demo-01", name: "청록 창고", category: "industrial", region: "부산", district: "busan_haeundae_gu", address: "부산 가상 촬영구역 A", latitude: 37.548, longitude: 126.956, description: "높은 천장과 긴 측면 창이 있는 가상 창고 세트입니다.", permit: "문의 필요", parking: "소형 차량 3대", hue: 160, aliases: ["청록 공장"], tags: ["창고", "산업", "빈티지"] },
  { id: "00000000-0000-4000-8000-000000000002", slug: "demo-02", name: "노을 계단", category: "urban", region: "부산", district: "busan_haeundae_gu", address: "부산 가상 촬영구역 B", latitude: 37.566, longitude: 127.012, description: "서향 계단과 넓은 하늘이 있는 가상 거리입니다.", permit: "문의 필요", parking: "인근 가상 주차장", hue: 28, aliases: ["노을계단"], tags: ["계단", "노을", "도심"] },
  { id: "00000000-0000-4000-8000-000000000003", slug: "demo-03", name: "물빛 산책로", category: "nature", region: "부산", district: "busan_suyeong_gu", address: "부산 가상 촬영구역 C", latitude: 35.159, longitude: 129.105, description: "물가와 낮은 수목이 이어지는 가상 산책로입니다.", permit: "문의 필요", parking: "소형 차량 5대", hue: 195, aliases: ["광안리 산책로"], tags: ["바다", "산책", "야경"] },
  { id: "00000000-0000-4000-8000-000000000004", slug: "demo-04", name: "은빛 스튜디오", category: "interior", region: "부산", district: "busan_haeundae_gu", address: "부산 가상 촬영구역 D", latitude: 37.523, longitude: 127.033, description: "부드러운 자연광을 받는 가상 실내 공간입니다.", permit: "문의 필요", parking: "소형 차량 2대", hue: 235, aliases: ["은빛 촬영실"], tags: ["스튜디오", "실내", "자연광"] },
  { id: "00000000-0000-4000-8000-000000000005", slug: "demo-05", name: "벽돌 골목", category: "urban", region: "부산", district: "busan_yeongdo_gu", address: "부산 가상 촬영구역 E", latitude: 37.464, longitude: 126.681, description: "붉은 벽돌과 굽은 동선이 특징인 가상 골목입니다.", permit: "문의 필요", parking: "인근 가상 주차장", hue: 18, aliases: ["붉은 벽돌길"], tags: ["골목", "빈티지", "벽돌"] },
  { id: "00000000-0000-4000-8000-000000000006", slug: "demo-06", name: "솔그늘 언덕", category: "nature", region: "부산", district: "busan_geumjeong_gu", address: "부산 가상 촬영구역 F", latitude: 37.424, longitude: 127.055, description: "완만한 경사와 그늘이 있는 가상 언덕입니다.", permit: "문의 필요", parking: "소형 차량 4대", hue: 105, aliases: ["솔숲 언덕"], tags: ["언덕", "소나무", "그늘"] },
  { id: "00000000-0000-4000-8000-000000000007", slug: "demo-07", name: "파란 작업장", category: "industrial", region: "부산", district: "busan_sasang_gu", address: "부산 가상 촬영구역 G", latitude: 35.105, longitude: 129.035, description: "금속 질감의 벽과 깊은 공간감이 있는 가상 작업장입니다.", permit: "문의 필요", parking: "소형 차량 6대", hue: 210, aliases: ["파란 공방"], tags: ["작업장", "금속", "공업"] },
  { id: "00000000-0000-4000-8000-000000000008", slug: "demo-08", name: "오후의 방", category: "interior", region: "부산", district: "busan_yeongdo_gu", address: "부산 가상 촬영구역 H", latitude: 37.485, longitude: 126.705, description: "따뜻한 색감과 큰 창을 갖춘 가상 실내 공간입니다.", permit: "문의 필요", parking: "소형 차량 1대", hue: 38, aliases: [], tags: ["실내", "창", "따뜻한"] },
  { id: "00000000-0000-4000-8000-000000000009", slug: "demo-09", name: "달빛 광장", category: "urban", region: "부산", district: "busan_busanjin_gu", address: "부산 가상 촬영구역 I", latitude: 37.389, longitude: 127.112, description: "열린 바닥면과 낮은 구조물이 있는 가상 광장입니다.", permit: "문의 필요", parking: "인근 가상 주차장", hue: 265, aliases: ["서면 광장"], tags: ["광장", "야간", "도심"] },
  { id: "00000000-0000-4000-8000-000000000010", slug: "demo-10", name: "갈대 둔치", category: "nature", region: "부산", district: null, address: "부산 가상 촬영구역 J", latitude: 37.512, longitude: 126.923, description: "갈대와 수면이 함께 보이는 가상 둔치입니다.", permit: "문의 필요", parking: "소형 차량 2대", hue: 76, aliases: ["갈대밭"], tags: ["둔치", "갈대", "수변"] },
];

export const mockLocations: Location[] = seeds.map((seed) => {
  const hasNearbyParking = seed.parking.startsWith("인근");

  return {
    id: seed.id,
    name: seed.name,
    description: seed.description,
    category: seed.category,
    region: seed.region,
    district: seed.district,
    aliases: seed.aliases,
    tags: seed.tags,
    address: seed.address,
    point: { latitude: seed.latitude, longitude: seed.longitude },
    images: [{
      id: `${seed.id}-image`,
      locationId: seed.id,
      imageUrl: `/images/${seed.slug}.svg`,
      alt: `${seed.name} 개발용 추상 이미지`,
      source: "SceneScan synthetic fixture",
      sourceUrl: null,
      author: "SceneScan",
      license: "MIT",
      licenseUrl: "https://github.com/WooSungHyun03/scenescan/blob/main/LICENSE",
      lastVerifiedAt: null,
    }],
    permit: {
      type: seed.permit,
      contactName: null,
      contactPhone: null,
      note: "개발용 가상 정보",
      source: "SceneScan synthetic fixture",
      sourceUrl: null,
      referenceDate: null,
      lastVerifiedAt: null,
    },
    parking: [{
      id: `${seed.id}-parking`,
      locationId: hasNearbyParking ? null : seed.id,
      relationship: hasNearbyParking ? "nearby" : "on_site",
      name: seed.parking,
      point: hasNearbyParking
        ? { latitude: seed.latitude + 0.001, longitude: seed.longitude + 0.001 }
        : { latitude: seed.latitude, longitude: seed.longitude },
      capacity: null,
      openingHours: null,
      priceInfo: null,
      source: "synthetic fixture",
      sourceUrl: null,
      referenceDate: null,
      lastVerifiedAt: null,
    }],
    source: "SceneScan synthetic fixture",
    sourceUrl: null,
    author: "SceneScan",
    license: "MIT",
    licenseUrl: "https://github.com/WooSungHyun03/scenescan/blob/main/LICENSE",
    lastVerifiedAt: null,
  };
});
