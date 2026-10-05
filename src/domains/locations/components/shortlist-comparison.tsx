"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useMemo, useState, type ReactNode } from "react";
import {
  CalendarClock,
  CarFront,
  Database,
  ExternalLink,
  ImageOff,
  MapPin,
  ShieldQuestion,
  Sun,
} from "lucide-react";
import { sortParkingByDistance } from "@/domains/locations/services/parking-distance";
import {
  DEFAULT_LOCATION_TIME_ZONE,
  formatTimeZoneWithOffset,
  locationDateTimeToInstant,
  resolveLocationTimeZone,
  type ZonedDateTimeResult,
} from "@/domains/locations/services/location-timezone";
import { getSolarPosition } from "@/domains/locations/services/solar-position";
import type { Location, SolarPosition } from "@/types/domain";
import { SourceAttribution } from "./source-attribution";

const categoryLabels: Record<Location["category"], string> = {
  urban: "도시",
  nature: "자연",
  industrial: "산업",
  interior: "실내",
};

function displayValue(value: string | null | undefined) {
  return value?.trim() || "확인된 정보 없음";
}

function getImageSource(location: Location) {
  const candidate = location.images[0]?.imageUrl.trim();
  if (!candidate) return "/images/placeholder.svg";
  if (candidate.startsWith("/") && !candidate.startsWith("//")) return candidate;

  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : "/images/placeholder.svg";
  } catch {
    return "/images/placeholder.svg";
  }
}

function ComparisonImage({ location }: { location: Location }) {
  const [failed, setFailed] = useState(false);
  const image = location.images[0];
  const alt = image?.alt.trim() || `${displayValue(location.name)} 대표 이미지`;

  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-stone-100">
      {failed ? (
        <div
          role="img"
          aria-label={`${alt} - 이미지를 불러올 수 없습니다`}
          className="flex h-full flex-col items-center justify-center gap-2 px-3 text-center text-stone-500"
        >
          <ImageOff size={24} aria-hidden="true" />
          <span className="text-xs font-medium">사진을 불러올 수 없습니다</span>
        </div>
      ) : (
        <Image
          src={getImageSource(location)}
          alt={alt}
          fill
          loading="eager"
          unoptimized
          sizes="(max-width: 640px) 75vw, 240px"
          className="object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

function MissingValue({ children = "확인된 정보 없음" }: { children?: ReactNode }) {
  return <span className="text-stone-500">{children}</span>;
}

function PermitSummary({ location }: { location: Location }) {
  const fields = [
    ["유형", location.permit.type],
    ["담당자", location.permit.contactName],
    ["연락처", location.permit.contactPhone],
    ["참고", location.permit.note],
  ] as const;

  return (
    <dl className="space-y-2.5">
      {fields.map(([label, value]) => (
        <div key={label}>
          <dt className="text-[11px] font-semibold text-stone-500">{label}</dt>
          <dd className="mt-0.5 break-words leading-relaxed">
            {value?.trim() ? value : <MissingValue />}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function formatDistance(distanceMeters: number | null) {
  if (distanceMeters === null) return "거리 정보 없음";
  if (distanceMeters < 1_000) return `${Math.round(distanceMeters)}m`;
  return `${(distanceMeters / 1_000).toLocaleString("ko-KR", {
    maximumFractionDigits: 1,
  })}km`;
}

function ParkingSummary({ location }: { location: Location }) {
  const nearbyParking = sortParkingByDistance(location.point, location.parking)
    .filter(({ parking }) => parking.relationship === "nearby")
    .slice(0, 2);

  if (!nearbyParking.length) {
    return <MissingValue>등록된 주변 주차 정보가 없습니다.</MissingValue>;
  }

  return (
    <div className="space-y-3">
      {nearbyParking.map(({ parking, distanceMeters }) => (
        <article key={parking.id} className="rounded-lg bg-sky-50 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-stone-900">
              {displayValue(parking.name)}
            </p>
            <span className="shrink-0 text-xs font-semibold text-sky-800">
              {formatDistance(distanceMeters)}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-stone-600">
            {parking.capacity === null
              ? "주차구획 정보 없음"
              : `${parking.capacity.toLocaleString("ko-KR")}면`}
            {" · "}
            {displayValue(parking.openingHours)}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">
            요금 {displayValue(parking.priceInfo)}
          </p>
          <div className="mt-2 border-t border-sky-100 pt-2">
            <SourceAttribution
              source={parking.source}
              sourceUrl={parking.sourceUrl}
              lastVerifiedAt={parking.lastVerifiedAt}
              label="주차 정보 출처"
              compact
              showLabel={false}
            />
          </div>
        </article>
      ))}
      {location.parking.filter((item) => item.relationship === "nearby").length > 2 && (
        <p className="text-xs text-stone-500">
          가까운 2곳만 표시했습니다. 상세 화면에서 전체 정보를 확인하세요.
        </p>
      )}
    </div>
  );
}

function SolarSummary({
  point,
  dateTimeResult,
  hasCompleteInput,
}: {
  point: Location["point"];
  dateTimeResult: ZonedDateTimeResult | null;
  hasCompleteInput: boolean;
}) {
  if (!hasCompleteInput) {
    return <MissingValue>위에서 촬영 날짜와 시간을 선택해 주세요.</MissingValue>;
  }

  if (!dateTimeResult?.ok) {
    return (
      <span className="text-red-700">
        {dateTimeResult?.code === "NONEXISTENT_LOCAL_TIME"
          ? "시간대 전환으로 존재하지 않는 촬영 시각입니다."
          : "선택한 날짜와 시간을 해석할 수 없습니다."}
      </span>
    );
  }

  let position: SolarPosition;
  try {
    position = getSolarPosition(point, dateTimeResult.instant);
  } catch {
    return <span className="text-red-700">태양 조건을 계산하지 못했습니다.</span>;
  }

  return (
    <div>
      <span
        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
          position.isAboveHorizon
            ? "bg-amber-100 text-amber-900"
            : "bg-indigo-100 text-indigo-900"
        }`}
      >
        {position.isAboveHorizon ? "지평선 위" : "지평선 아래"}
      </span>
      <dl className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <dt className="text-[11px] font-semibold text-stone-500">방위각</dt>
          <dd className="mt-0.5 font-bold tabular-nums">
            {position.azimuthDegrees.toFixed(1)}°
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold text-stone-500">고도</dt>
          <dd className="mt-0.5 font-bold tabular-nums">
            {position.altitudeDegrees.toFixed(1)}°
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function ShortlistComparison({
  locations,
  timeZone,
}: {
  locations: Location[];
  timeZone?: string;
}) {
  const dateInputId = useId();
  const timeInputId = useId();
  const timeZoneNoteId = useId();
  const [shootDate, setShootDate] = useState("");
  const [shootTime, setShootTime] = useState("");
  const hasCompleteInput = Boolean(shootDate && shootTime);
  const locationTimeZone = resolveLocationTimeZone(timeZone);
  const dateTimeResult = useMemo(() => {
    if (!hasCompleteInput) return null;
    return locationDateTimeToInstant({
      date: shootDate,
      time: shootTime,
      timeZone: locationTimeZone,
    });
  }, [hasCompleteInput, locationTimeZone, shootDate, shootTime]);
  const timeZoneLabel = formatTimeZoneWithOffset(
    locationTimeZone,
    dateTimeResult?.ok ? dateTimeResult.instant : new Date(),
  );
  const timeZoneName = locationTimeZone === DEFAULT_LOCATION_TIME_ZONE ? "한국 표준시 · " : "";

  return (
    <section className="mt-10" aria-labelledby="comparison-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="comparison-title" className="mt-1 text-2xl font-bold">
            후보 장소 비교
          </h2>
          <p className="mt-2 text-sm text-stone-600">
            선택한 2~4곳의 촬영 조건을 같은 기준으로 확인하세요.
          </p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-900">
          {locations.length} / 4곳 선택
        </span>
      </div>

      {locations.length < 2 ? (
        <div className="scene-panel mt-5 border-dashed px-6 py-10 text-center">
          <p className="font-semibold text-stone-800">
            비교하려면 위 목록에서 장소를 2곳 이상 선택해 주세요.
          </p>
          <p className="mt-2 text-sm text-stone-500">
            한 번에 최대 4곳까지 비교할 수 있습니다.
          </p>
        </div>
      ) : (
        <>
          <div className="scene-panel mt-5 p-4">
            <div className="flex items-start gap-2">
              <CalendarClock size={18} className="mt-0.5 shrink-0 text-emerald-800" aria-hidden="true" />
              <div>
                <h3 className="font-semibold">태양 조건 비교 시각</h3>
                <p className="mt-1 text-xs leading-relaxed text-stone-500">
                  모든 후보에 같은 촬영 시각을 적용합니다.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label htmlFor={dateInputId} className="text-sm font-semibold text-stone-800">
                촬영 날짜
                <input
                  id={dateInputId}
                  type="date"
                  aria-describedby={timeZoneNoteId}
                  value={shootDate}
                  onChange={(event) => setShootDate(event.target.value)}
                  className="mt-2 block w-full rounded-md border border-stone-300 bg-white p-2.5 font-normal focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <label htmlFor={timeInputId} className="text-sm font-semibold text-stone-800">
                촬영 시간
                <input
                  id={timeInputId}
                  type="time"
                  step={60}
                  aria-describedby={timeZoneNoteId}
                  value={shootTime}
                  onChange={(event) => setShootTime(event.target.value)}
                  className="mt-2 block w-full rounded-md border border-stone-300 bg-white p-2.5 font-normal focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </label>
            </div>
            <p id={timeZoneNoteId} className="mt-3 text-xs text-stone-500">
              촬영지 시간대: <strong className="font-semibold text-stone-700">{timeZoneName}{timeZoneLabel}</strong>
              <span className="mt-0.5 block">기기의 시스템 시간대와 관계없이 모든 후보에 같은 절대 시각을 적용합니다.</span>
            </p>
          </div>

          <p className="mt-4 text-xs font-medium text-stone-500 sm:hidden">
            비교표는 좌우로 스크롤할 수 있습니다.
          </p>
          <div
            role="region"
            aria-label="후보 장소 비교표, 가로로 스크롤 가능"
            tabIndex={0}
            className="scene-panel mt-2 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 sm:mt-5"
          >
            <table className="w-full min-w-max border-collapse text-left text-sm">
              <caption className="sr-only">
                선택된 촬영 후보의 이미지, 주소, 허가, 주변 주차, 태양 조건 비교표
              </caption>
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  <th scope="col" className="sticky left-0 z-10 w-36 bg-stone-50 p-4 font-semibold text-stone-600">
                    비교 항목
                  </th>
                  {locations.map((location) => (
                    <th key={location.id} scope="col" className="w-64 min-w-64 p-4 align-top">
                      <ComparisonImage location={location} />
                      <Link
                        href={`/locations/${location.id}`}
                        className="mt-3 inline-flex items-center gap-1 font-bold text-emerald-900 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-700"
                      >
                        {displayValue(location.name)}
                        <ExternalLink size={13} aria-hidden="true" />
                      </Link>
                      <p className="mt-1 text-xs font-normal text-stone-500">
                        {location.region} · {categoryLabels[location.category]}
                      </p>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <ComparisonRow icon={<MapPin size={16} />} label="주소" locations={locations}>
                  {(location) => displayValue(location.address)}
                </ComparisonRow>
                <ComparisonRow icon={<ShieldQuestion size={16} />} label="허가 정보" locations={locations}>
                  {(location) => <PermitSummary location={location} />}
                </ComparisonRow>
                <ComparisonRow icon={<CarFront size={16} />} label="주변 주차" locations={locations}>
                  {(location) => <ParkingSummary location={location} />}
                </ComparisonRow>
                <ComparisonRow icon={<Sun size={16} />} label="태양 조건" locations={locations}>
                  {(location) => (
                    <SolarSummary
                      point={location.point}
                      dateTimeResult={dateTimeResult}
                      hasCompleteInput={hasCompleteInput}
                    />
                  )}
                </ComparisonRow>
                <ComparisonRow icon={<Database size={16} />} label="데이터 출처" locations={locations}>
                  {(location) => (
                    <SourceAttribution
                      sourceUrl={location.sourceUrl}
                      label={`${displayValue(location.name)} 데이터 출처`}
                      compact
                      showLabel={false}
                    />
                  )}
                </ComparisonRow>
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function ComparisonRow({
  icon,
  label,
  locations,
  children,
}: {
  icon: ReactNode;
  label: string;
  locations: Location[];
  children: (location: Location) => ReactNode;
}) {
  return (
    <tr className="border-b border-stone-100 last:border-0">
      <th scope="row" className="sticky left-0 z-10 bg-white p-4 align-top font-semibold text-stone-600">
        <span className="flex items-center gap-2">
          <span aria-hidden="true">{icon}</span>
          {label}
        </span>
      </th>
      {locations.map((location) => (
        <td key={location.id} className="w-64 min-w-64 p-4 align-top leading-relaxed text-stone-800">
          {children(location)}
        </td>
      ))}
    </tr>
  );
}
