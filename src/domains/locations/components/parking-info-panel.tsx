import {
  Building2,
  CarFront,
  Clock3,
  ExternalLink,
  MapPin,
  ReceiptText,
  Rows3,
} from "lucide-react";
import type { ReactNode } from "react";
import { sortParkingByDistance } from "@/domains/locations/services/parking-distance";
import type { GeoPoint, ParkingInfo } from "@/types/domain";

function getValue(value: string | null | undefined) {
  return value?.trim() || null;
}

function getSafeUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function formatDistance(distanceMeters: number | null) {
  if (distanceMeters === null) return "거리 정보 없음";
  if (distanceMeters < 1_000) return `직선거리 ${Math.round(distanceMeters)}m`;
  return `직선거리 ${(distanceMeters / 1_000).toLocaleString("ko-KR", {
    maximumFractionDigits: 1,
  })}km`;
}

function ParkingField({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0 text-stone-400" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-semibold text-stone-500">{label}</dt>
        <dd className="mt-0.5 break-words text-sm leading-relaxed">{children}</dd>
      </div>
    </div>
  );
}

export function ParkingInfoPanel({
  parking,
  origin,
  locationId,
}: {
  parking: ParkingInfo[];
  origin: GeoPoint;
  locationId: string;
}) {
  const sortedParking = sortParkingByDistance(origin, parking);

  return (
    <section aria-labelledby="parking-title" className="scene-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <CarFront
            size={20}
            className="mt-0.5 shrink-0 text-emerald-800"
            aria-hidden="true"
          />
          <div>
            <h2 id="parking-title" className="text-lg font-semibold">
              주차 정보
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-stone-500">
              촬영 차량 운용 전 운영 시간과 요금을 출처에서 확인해 주세요.
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">
          {sortedParking.length ? `${sortedParking.length}곳` : "정보 없음"}
        </span>
      </div>

      {sortedParking.length ? (
        <div className="mt-5 space-y-4">
          {sortedParking.map(({ parking: item, distanceMeters }, index) => {
            const isOnSite = item.locationId === locationId;
            const name = getValue(item.name);
            const openingHours = getValue(item.openingHours);
            const priceInfo = getValue(item.priceInfo);
            const source = getValue(item.source);
            const sourceUrl = getSafeUrl(source);

            return (
              <article
                key={item.id}
                className={`overflow-hidden rounded-xl border ${
                  isOnSite
                    ? "border-emerald-200 bg-emerald-50/40"
                    : "border-sky-200 bg-sky-50/40"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-inherit px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                      isOnSite
                        ? "bg-emerald-100 text-emerald-900"
                        : "bg-sky-100 text-sky-900"
                    }`}
                  >
                    {isOnSite ? (
                      <Building2 size={13} aria-hidden="true" />
                    ) : (
                      <MapPin size={13} aria-hidden="true" />
                    )}
                    {isOnSite ? "장소 자체 주차" : "주변 공영/민영 주차"}
                  </span>
                  <span className="text-xs font-semibold text-stone-600">
                    {index + 1}. {formatDistance(distanceMeters)}
                  </span>
                </div>

                <div className="p-4">
                  <h3
                    className={`font-semibold ${
                      name ? "text-stone-900" : "text-stone-500"
                    }`}
                  >
                    {name ?? "정보 없음"}
                  </h3>

                  <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                    <ParkingField icon={<Rows3 size={16} />} label="주차구획수">
                      <span
                        className={
                          item.capacity === null
                            ? "text-stone-500"
                            : "text-stone-900"
                        }
                      >
                        {item.capacity === null
                          ? "정보 없음"
                          : `${item.capacity.toLocaleString("ko-KR")}면`}
                      </span>
                    </ParkingField>

                    <ParkingField icon={<Clock3 size={16} />} label="운영 시간">
                      <span
                        className={
                          openingHours ? "text-stone-900" : "text-stone-500"
                        }
                      >
                        {openingHours ?? "정보 없음"}
                      </span>
                    </ParkingField>

                    <ParkingField icon={<ReceiptText size={16} />} label="요금">
                      <span
                        className={
                          priceInfo ? "text-stone-900" : "text-stone-500"
                        }
                      >
                        {priceInfo ?? "정보 없음"}
                      </span>
                    </ParkingField>

                    <ParkingField icon={<ExternalLink size={16} />} label="출처">
                      {sourceUrl ? (
                        <a
                          href={sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-start gap-1 break-all font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-950"
                        >
                          <span>{source}</span>
                          <ExternalLink
                            size={13}
                            className="mt-1 shrink-0"
                            aria-hidden="true"
                          />
                        </a>
                      ) : (
                        <span className={source ? "text-stone-900" : "text-stone-500"}>
                          {source ?? "정보 없음"}
                        </span>
                      )}
                    </ParkingField>
                  </dl>
                </div>
              </article>
            );
          })}

          <p className="rounded-lg bg-stone-100 p-3 text-xs leading-relaxed text-stone-600">
            거리는 장소와 주차장 좌표 사이의 직선거리입니다. 원본 데이터에
            공영·민영 유형이 없는 주변 주차장은 통합 표기합니다.
          </p>
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center">
          <CarFront
            size={24}
            className="mx-auto text-stone-400"
            aria-hidden="true"
          />
          <p className="mt-2 text-sm font-semibold text-stone-700">
            등록된 주차 정보가 없습니다.
          </p>
          <p className="mt-1 text-xs text-stone-500">
            촬영 전 장소 담당자에게 차량 진입과 주변 주차 가능 여부를 확인해
            주세요.
          </p>
        </div>
      )}
    </section>
  );
}
