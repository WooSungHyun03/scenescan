import Image from "next/image";
import Link from "next/link";
import type { Location } from "@/types/domain";

export function LocationCard({ location, similarity }: { location: Location; similarity?: number }) {
  return <Link href={`/locations/${location.id}`} className="scene-panel group block overflow-hidden transition-shadow hover:shadow-md">
    <div className="relative aspect-[4/3] bg-stone-200">
      <Image src={location.images[0]?.imageUrl ?? "/images/placeholder.svg"} alt={location.images[0]?.alt ?? location.name} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="object-cover transition-transform group-hover:scale-[1.02]" />
    </div>
    <div className="p-4">
      <div className="flex items-start justify-between gap-2"><h3 className="text-lg font-semibold">{location.name}</h3>{similarity !== undefined && <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">{process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false" ? "예시 " : ""}{Math.round(similarity * 100)}%</span>}</div>
      <p className="mt-1 text-sm text-stone-600">{location.region} · {location.category}</p>
    </div>
  </Link>;
}
