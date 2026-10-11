import {
  ExternalLink,
  FileText,
  ShieldQuestion,
} from "lucide-react";
import type { ReactNode } from "react";
import { getPermitFreshness, toPhoneHref } from "@/domains/locations/services/permit-verification";
import type { PermitInfo } from "@/types/domain";
import { getSafeSourceUrl, SourceAttribution } from "./source-attribution";
import { PermitContactList } from "./permit-contact-list";

function getValue(value: string | null | undefined) {
  return value?.trim() || null;
}

function getDateLabel(value: string | null | undefined) {
  const candidate = getValue(value);
  if (!candidate) return null;
  const date = new Date(candidate);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(date);
}

export function getPermitPanelViewModel(permit: PermitInfo, now = new Date()) {
  const type = getValue(permit.type);
  const rawContactPhone = getValue(permit.contactPhone);
  const phoneHref = toPhoneHref(rawContactPhone);
  const safeSourceUrl = getSafeSourceUrl(permit.sourceUrl);
  const isReviewed = Boolean(type && type !== "문의 필요" && safeSourceUrl);
  const verificationFreshness = getPermitFreshness(permit.lastVerifiedAt, now);
  const referenceFreshness = getPermitFreshness(permit.referenceDate, now);
  return {
    type,
    phoneInvalid: Boolean(rawContactPhone && !phoneHref),
    note: getValue(permit.note),
    source: getValue(permit.source),
    sourceUrl: getValue(permit.sourceUrl),
    referenceDate: getDateLabel(permit.referenceDate),
    lastVerifiedAt: getDateLabel(permit.lastVerifiedAt),
    isStale: verificationFreshness === "stale" || referenceFreshness === "stale",
    isReviewed,
    hasOfficialPermitSource: Boolean(isReviewed && safeSourceUrl),
  };
}

function PermitField({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="relative border-b border-line py-3 pl-8">
      <dt className="text-xs font-semibold text-stone-500">
        <span className="absolute left-0 top-3.5 text-stone-500" aria-hidden="true">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm leading-relaxed">{children}</dd>
    </div>
  );
}

export function PermitInfoPanel({ locationId, permit }: { locationId: string; permit: PermitInfo }) {
  const details = getPermitPanelViewModel(permit);

  return (
    <section aria-labelledby="permit-title" className="scene-panel p-5">
      <div className="flex items-start gap-3">
        <ShieldQuestion
          size={20}
          className="mt-0.5 shrink-0 text-emerald-800"
          aria-hidden="true"
        />
        <div>
          <h2 id="permit-title" className="text-lg font-semibold">
            촬영 허가
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">
            제공된 문의 정보를 확인한 뒤 촬영 조건과 절차를 직접 확인해 주세요.
          </p>
        </div>
      </div>

      <dl className="mt-4 space-y-3">
        <PermitField
          icon={<ShieldQuestion size={17} />}
          label="허가 안내"
        >
          <span className={details.type ? "text-stone-900" : "text-stone-500"}>
            {details.type ?? "확인된 정보 없음"}
          </span>
        </PermitField>

        <PermitField icon={<FileText size={17} />} label="참고 사항">
          <span className={details.note ? "text-stone-900" : "text-stone-500"}>
            {details.note ?? "확인된 정보 없음"}
          </span>
        </PermitField>

        <PermitField icon={<ExternalLink size={17} />} label="정보 출처">
          <SourceAttribution
            source={details.source}
            sourceUrl={details.sourceUrl}
            label={details.isReviewed ? "촬영 허가 정보 출처" : "장소 정보 출처"}
            compact
            showLabel={false}
          />
        </PermitField>

        <PermitField icon={<FileText size={17} />} label="정보 기준일">
          <span className={details.lastVerifiedAt ? "text-stone-900" : "text-stone-500"}>
            {details.referenceDate ? `원문 기준 ${details.referenceDate}` : "원문 기준일 미제공"}
            {" · "}
            {details.lastVerifiedAt ? `최근 확인 ${details.lastVerifiedAt}` : "최근 확인일 미제공"}
          </span>
        </PermitField>
      </dl>

      <div className="mt-5">
        <h3 className="mb-3 text-sm font-bold text-stone-900">확인된 문의 연락처</h3>
        <PermitContactList key={locationId} locationId={locationId} />
      </div>

      {details.isStale && (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          원문 기준일 또는 최근 확인일이 1년을 지났습니다. 담당 기관 원문에서 현재 조건과 연락처를 다시 확인해 주세요.
        </p>
      )}

      {details.phoneInvalid && (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          저장된 연락처 형식이 올바르지 않아 전화 링크를 표시하지 않았습니다. 공식 원문에서 연락 방법을 확인해 주세요.
        </p>
      )}

      {!details.hasOfficialPermitSource && (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          공식 원문으로 확인된 촬영 허가 안내가 없습니다. 대표번호가 표시되더라도 촬영 허가 담당번호로 간주하지 마세요.
        </p>
      )}
    </section>
  );
}
