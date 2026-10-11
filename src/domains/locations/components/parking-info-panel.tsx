"use client";

import {
  Building2,
  CarFront,
  Clock3,
  ExternalLink,
  LoaderCircle,
  MapPin,
  Navigation,
  Phone,
  RefreshCw,
  ReceiptText,
  Rows3,
} from "lucide-react";
import type { ReactNode } from "react";
import { sortParkingByDistance } from "@/domains/locations/services/parking-distance";
import type { GeoPoint, ParkingInfo } from "@/types/domain";
import { NEARBY_PARKING_RADIUS_OPTIONS } from "@/types/place-discovery";
import { useParkingDiscovery } from "./parking-discovery-context";
import { SourceAttribution } from "./source-attribution";

function getValue(value: string | null | undefined) {
  return value?.trim() || null;
}

function formatDistance(distanceMeters: number | null) {
  if (distanceMeters === null) return "거리 정보 없음";
  if (distanceMeters < 1_000) return `직선거리 ${Math.round(distanceMeters)}m`;
  return `직선거리 ${(distanceMeters / 1_000).toLocaleString("ko-KR", {
    maximumFractionDigits: 1,
  })}km`;
}

export function getParkingRelationshipPresentation(relationship: ParkingInfo["relationship"]) {
  return relationship === "on_site"
    ? { isOnSite: true, label: "장소 자체 주차" }
    : { isOnSite: false, label: "주변 공영/민영 주차" };
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
    <div className="relative pl-7">
      <dt className="text-xs font-semibold text-stone-500">
        <span className="absolute left-0 top-0.5 text-stone-500" aria-hidden="true">{icon}</span>
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-sm leading-relaxed">{children}</dd>
    </div>
  );
}

export function ParkingInfoPanel({
  parking,
  origin,
}: {
  parking: ParkingInfo[];
  origin: GeoPoint;
}) {
  const sortedParking = sortParkingByDistance(origin, parking);
  const discovery = useParkingDiscovery();

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
          {sortedParking.length ? `등록 정보 ${sortedParking.length}곳` : "등록 정보 없음"}
        </span>
      </div>

      {sortedParking.length ? (
        <div className="mt-5 space-y-4">
          <h3 className="text-sm font-semibold text-stone-800">검증된 등록 주차 정보</h3>
          {sortedParking.map(({ parking: item, distanceMeters }, index) => {
            const relationship = getParkingRelationshipPresentation(item.relationship);
            const isOnSite = relationship.isOnSite;
            const name = getValue(item.name);
            const openingHours = getValue(item.openingHours);
            const priceInfo = getValue(item.priceInfo);
            const source = getValue(item.source);

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
                    {relationship.label}
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
                    {name ?? "확인된 정보 없음"}
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
                          ? "확인된 정보 없음"
                          : `${item.capacity.toLocaleString("ko-KR")}면`}
                      </span>
                    </ParkingField>

                    <ParkingField icon={<Clock3 size={16} />} label="운영 시간">
                      <span
                        className={
                          openingHours ? "text-stone-900" : "text-stone-500"
                        }
                      >
                        {openingHours ?? "확인된 정보 없음"}
                      </span>
                    </ParkingField>

                    <ParkingField icon={<ReceiptText size={16} />} label="요금">
                      <span
                        className={
                          priceInfo ? "text-stone-900" : "text-stone-500"
                        }
                      >
                        {priceInfo ?? "확인된 정보 없음"}
                      </span>
                    </ParkingField>

                    <ParkingField icon={<ExternalLink size={16} />} label="출처">
                      <SourceAttribution
                        source={source}
                        sourceUrl={item.sourceUrl}
                        lastVerifiedAt={item.lastVerifiedAt ?? item.referenceDate}
                        label="주차 정보 출처"
                        compact
                        showLabel={false}
                        showVerification
                      />
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
            검증된 등록 주차 정보가 없습니다.
          </p>
          <p className="mt-1 text-xs text-stone-500">
            촬영 전 장소 담당자에게 차량 진입과 주변 주차 가능 여부를 확인해
            주세요.
          </p>
        </div>
      )}

      {discovery && (
        <div className="mt-6 border-t border-stone-200 pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="font-semibold text-stone-900">현재 위치 주변 주차장 후보</h3>
              <p className="mt-1 text-xs leading-relaxed text-stone-500">
                Kakao Local의 PK6 주차장 검색 결과를 현재 장소와의 직선거리순으로 표시합니다.
              </p>
            </div>
            <fieldset className="flex flex-wrap gap-2" aria-label="주차장 검색 반경">
              <legend className="sr-only">주차장 검색 반경</legend>
              {NEARBY_PARKING_RADIUS_OPTIONS.map((radius) => (
                <button
                  key={radius}
                  type="button"
                  onClick={() => discovery.setRadiusMeters(radius)}
                  aria-pressed={discovery.radiusMeters === radius}
                  className={`min-h-10 rounded-lg border px-3 text-xs font-bold transition-colors ${
                    discovery.radiusMeters === radius
                      ? "border-emerald-800 bg-emerald-800 text-white"
                      : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
                  }`}
                >
                  {radius / 1_000}km
                </button>
              ))}
            </fieldset>
          </div>

          {discovery.phase === "loading" && (
            <div role="status" className="mt-4 flex min-h-24 items-center justify-center gap-2 rounded-xl bg-stone-50 text-sm text-stone-600">
              <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
              주변 주차장을 확인하고 있습니다.
            </div>
          )}

          {discovery.phase === "error" && (
            <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <p>{discovery.errorMessage}</p>
              <button
                type="button"
                onClick={discovery.retry}
                className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-300 bg-white px-3 font-bold"
              >
                <RefreshCw size={15} aria-hidden="true" /> 다시 확인
              </button>
            </div>
          )}

          {discovery.phase === "empty" && (
            <p className="mt-4 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center text-sm text-stone-600">
              선택한 반경 안에서 제공된 주차장 후보가 없습니다.
            </p>
          )}

          {discovery.phase === "ready" && (
            <div className="mt-4 space-y-3" aria-live="polite">
              {discovery.candidates.map((candidate, index) => {
                const selected = discovery.activeCandidateId === candidate.id;
                const telephone = candidate.phone?.replace(/[^0-9+]/gu, "") ?? null;
                return (
                  <article
                    key={candidate.id}
                    className={`rounded-xl border p-4 transition-colors ${
                      selected
                        ? "border-emerald-700 bg-emerald-50 ring-2 ring-emerald-200"
                        : "border-stone-200 bg-white"
                    }`}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-emerald-800">
                          {index + 1}. 주변 후보 · {formatDistance(candidate.distanceMeters)}
                        </p>
                        <h4 className="mt-1 break-words font-semibold text-stone-900">{candidate.name}</h4>
                        <p className="mt-1 break-words text-sm text-stone-600">
                          {candidate.address ?? "주소 미제공"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => discovery.setActiveCandidateId(candidate.id)}
                        aria-pressed={selected}
                        aria-label={`지도에서 ${candidate.name} 선택`}
                        className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg border border-stone-300 px-2.5 text-xs font-bold text-stone-700 hover:bg-stone-50"
                      >
                        <MapPin size={14} aria-hidden="true" /> 지도
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {telephone && candidate.phone && (
                        <a
                          href={`tel:${telephone}`}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-stone-100 px-3 text-xs font-bold text-stone-800"
                        >
                          <Phone size={14} aria-hidden="true" /> {candidate.phone}
                        </a>
                      )}
                      {candidate.placeUrl && (
                        <a
                          href={candidate.placeUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[#fee500] px-3 text-xs font-bold text-stone-900"
                        >
                          <Navigation size={14} aria-hidden="true" /> 카카오맵에서 보기
                        </a>
                      )}
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] text-stone-500">
                      <div className="rounded-lg bg-stone-50 p-2"><dt>요금</dt><dd className="mt-0.5 font-semibold">미제공</dd></div>
                      <div className="rounded-lg bg-stone-50 p-2"><dt>주차구획수</dt><dd className="mt-0.5 font-semibold">미제공</dd></div>
                      <div className="rounded-lg bg-stone-50 p-2"><dt>운영 시간</dt><dd className="mt-0.5 font-semibold">미제공</dd></div>
                    </dl>
                    <p className="mt-3 text-[11px] text-stone-500">출처 · {candidate.source}</p>
                  </article>
                );
              })}
            </div>
          )}

          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
            주변 후보는 실시간 빈자리, 요금, 운영 시간, 촬영 차량 진입·주차 허용 여부를 뜻하지 않습니다. 방문 전에 주차장과 장소 운영기관에 직접 확인해 주세요.
          </p>
        </div>
      )}
    </section>
  );
}
