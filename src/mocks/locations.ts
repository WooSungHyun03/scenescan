import type { Location, LocationCategory, Region } from "@/types/domain";

type Seed = {
  id: string;
  name: string;
  category: LocationCategory;
  region: Region;
  address: string;
  latitude: number;
  longitude: number;
  description: string;
  permit: string;
  parking: string;
  hue: number;
};

// All names and addresses are fictional. Coordinates only indicate broad demo areas.
const seeds: Seed[] = [
  { id: "demo-01", name: "청록 창고", category: "industrial", region: "서울", address: "서울 가상 촬영구역 A", latitude: 37.548, longitude: 126.956, description: "높은 천장과 긴 측면 창이 있는 가상 창고 세트입니다.", permit: "사전 협의 필요", parking: "소형 차량 3대", hue: 160 },
  { id: "demo-02", name: "노을 계단", category: "urban", region: "서울", address: "서울 가상 촬영구역 B", latitude: 37.566, longitude: 127.012, description: "서향 계단과 넓은 하늘이 있는 가상 거리입니다.", permit: "관리자 문의", parking: "인근 가상 주차장", hue: 28 },
  { id: "demo-03", name: "물빛 산책로", category: "nature", region: "부산", address: "부산 가상 촬영구역 C", latitude: 35.159, longitude: 129.105, description: "물가와 낮은 수목이 이어지는 가상 산책로입니다.", permit: "촬영 전 확인", parking: "소형 차량 5대", hue: 195 },
  { id: "demo-04", name: "은빛 스튜디오", category: "interior", region: "서울", address: "서울 가상 촬영구역 D", latitude: 37.523, longitude: 127.033, description: "부드러운 자연광을 받는 가상 실내 공간입니다.", permit: "예약 필요", parking: "소형 차량 2대", hue: 235 },
  { id: "demo-05", name: "벽돌 골목", category: "urban", region: "인천", address: "인천 가상 촬영구역 E", latitude: 37.464, longitude: 126.681, description: "붉은 벽돌과 굽은 동선이 특징인 가상 골목입니다.", permit: "관리자 문의", parking: "인근 가상 주차장", hue: 18 },
  { id: "demo-06", name: "솔그늘 언덕", category: "nature", region: "경기", address: "경기 가상 촬영구역 F", latitude: 37.424, longitude: 127.055, description: "완만한 경사와 그늘이 있는 가상 언덕입니다.", permit: "촬영 전 확인", parking: "소형 차량 4대", hue: 105 },
  { id: "demo-07", name: "파란 작업장", category: "industrial", region: "부산", address: "부산 가상 촬영구역 G", latitude: 35.105, longitude: 129.035, description: "금속 질감의 벽과 깊은 공간감이 있는 가상 작업장입니다.", permit: "사전 협의 필요", parking: "소형 차량 6대", hue: 210 },
  { id: "demo-08", name: "오후의 방", category: "interior", region: "인천", address: "인천 가상 촬영구역 H", latitude: 37.485, longitude: 126.705, description: "따뜻한 색감과 큰 창을 갖춘 가상 실내 공간입니다.", permit: "예약 필요", parking: "소형 차량 1대", hue: 38 },
  { id: "demo-09", name: "달빛 광장", category: "urban", region: "경기", address: "경기 가상 촬영구역 I", latitude: 37.389, longitude: 127.112, description: "열린 바닥면과 낮은 구조물이 있는 가상 광장입니다.", permit: "관리자 문의", parking: "인근 가상 주차장", hue: 265 },
  { id: "demo-10", name: "갈대 둔치", category: "nature", region: "서울", address: "서울 가상 촬영구역 J", latitude: 37.512, longitude: 126.923, description: "갈대와 수면이 함께 보이는 가상 둔치입니다.", permit: "촬영 전 확인", parking: "소형 차량 2대", hue: 76 },
];

export const mockLocations: Location[] = seeds.map((seed) => ({
  id: seed.id,
  name: seed.name,
  description: seed.description,
  category: seed.category,
  region: seed.region,
  address: seed.address,
  point: { latitude: seed.latitude, longitude: seed.longitude },
  images: [{ id: `${seed.id}-image`, locationId: seed.id, imageUrl: `/images/${seed.id}.svg`, alt: `${seed.name} 개발용 추상 이미지` }],
  permit: { type: seed.permit, contactName: null, contactPhone: null, note: "개발용 가상 정보" },
  parking: [{ id: `${seed.id}-parking`, locationId: seed.id, name: seed.parking, point: { latitude: seed.latitude + 0.001, longitude: seed.longitude + 0.001 }, capacity: null, openingHours: null, priceInfo: null, source: "synthetic fixture" }],
  noiseSources: [],
  sourceUrl: null,
}));
