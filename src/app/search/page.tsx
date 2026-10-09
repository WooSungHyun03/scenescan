import { getLocations } from "@/domains/locations/server/repository";
import { SearchWorkspace } from "@/domains/search/components/search-workspace";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const examples = await getLocations();
  return (
    <main className="scene-container pb-12 sm:pb-20">
      <header className="scene-page-header">
        <p className="scene-kicker">Visual search</p>
        <h1 className="scene-page-title">부산 촬영 장소 찾기</h1>
        <p className="scene-page-description">
          사진을 올리거나 문장으로 설명하고, 지역과 공간 종류를 선택해 촬영 후보를 한눈에 비교하세요.
        </p>
      </header>
      <SearchWorkspace examples={examples} />
    </main>
  );
}
