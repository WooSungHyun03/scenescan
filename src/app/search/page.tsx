import { getLocations } from "@/domains/locations/server/repository";
import { SearchWorkspace } from "@/domains/search/components/search-workspace";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const examples = await getLocations();
  return <main className="scene-container py-7 sm:py-10"><div className="mb-7"><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">이미지로 촬영 장소 찾기</h1><p className="mt-3 text-muted">원하는 분위기의 사진을 올리고 촬영 후보를 비교해 보세요.</p></div><SearchWorkspace examples={examples} /></main>;
}
