import { ShortlistWorkspace } from "@/domains/locations/components/shortlist-workspace";
import { getLocations } from "@/domains/locations/server/repository";

export const dynamic = "force-dynamic";

export default async function ShortlistPage() {
  const locations = await getLocations();

  return (
    <main className="scene-container py-8 sm:py-10">
      <div className="mb-8">
        <h1 className="mt-2 text-3xl font-bold">관심 장소</h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-stone-600">
          저장한 후보 중 2~4곳을 골라 사진, 주소, 촬영 허가, 주차와
          같은 촬영 시각의 태양 조건을 비교하세요.
        </p>
      </div>
      <ShortlistWorkspace locations={locations} />
    </main>
  );
}
