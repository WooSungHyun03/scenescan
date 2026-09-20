import { SearchWorkspace } from "@/features/search/components/search-workspace";
import { getLocations } from "@/server/repositories/locations";

export default async function SearchPage() {
  const examples = await getLocations();
  return <main className="mx-auto max-w-6xl px-5 py-10"><div className="mb-8"><p className="scene-label">SEARCH</p><h1 className="mt-2 text-3xl font-bold">이미지로 장소 찾기</h1></div><SearchWorkspace examples={examples} /></main>;
}
