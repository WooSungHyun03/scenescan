import { ShortlistWorkspace } from "@/domains/locations/components/shortlist-workspace";
import { getLocations } from "@/domains/locations/server/repository";

export default async function ShortlistPage() {
  const locations = await getLocations();

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <div className="mb-8">
        <p className="scene-label">SHORTLIST</p>
        <h1 className="mt-2 text-3xl font-bold">관심 장소</h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-stone-600">
          촬영 후보를 저장하고 지역, 공간 유형, 허가·주차·예상 소음 정보를
          비교하세요.
        </p>
      </div>
      <ShortlistWorkspace locations={locations} />
    </main>
  );
}
