import { ExternalLink } from "lucide-react";

function getValue(value: string | null | undefined) {
  return value?.trim() || null;
}

export function getSafeSourceUrl(value: string | null | undefined) {
  const candidate = getValue(value);
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function getVerifiedDate(value: string | null | undefined) {
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

export function getAttributionViewModel({
  source,
  sourceUrl,
  author,
  license,
  licenseUrl,
  lastVerifiedAt,
}: {
  source?: string | null;
  sourceUrl?: string | null;
  author?: string | null;
  license?: string | null;
  licenseUrl?: string | null;
  lastVerifiedAt?: string | null;
}) {
  const sourceName = getValue(source);
  const sourceAsUrl = getSafeSourceUrl(sourceName);
  const explicitSourceUrl = getSafeSourceUrl(sourceUrl);
  return {
    source: sourceName && !sourceAsUrl ? sourceName : null,
    sourceUrl: explicitSourceUrl ?? sourceAsUrl,
    sourceUrlInvalid: Boolean(getValue(sourceUrl) && !explicitSourceUrl),
    author: getValue(author),
    license: getValue(license),
    licenseUrl: getSafeSourceUrl(licenseUrl),
    licenseUrlInvalid: Boolean(getValue(licenseUrl) && !getSafeSourceUrl(licenseUrl)),
    lastVerifiedAt: getVerifiedDate(lastVerifiedAt),
  };
}

function ExternalTextLink({ href, children, ariaLabel }: {
  href: string;
  children: React.ReactNode;
  ariaLabel: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`${ariaLabel} (새 창에서 열기)`}
      className="inline-flex min-h-11 items-center gap-1 break-all font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-950"
    >
      <span>{children}</span>
      <ExternalLink size={13} className="shrink-0" aria-hidden="true" />
    </a>
  );
}

export function SourceAttribution({
  source,
  sourceUrl,
  author,
  license,
  licenseUrl,
  lastVerifiedAt,
  label = "정보 출처",
  compact = false,
  showLabel = true,
  showDetails = false,
}: {
  source?: string | null;
  sourceUrl?: string | null;
  author?: string | null;
  license?: string | null;
  licenseUrl?: string | null;
  lastVerifiedAt?: string | null;
  label?: string;
  compact?: boolean;
  showLabel?: boolean;
  showDetails?: boolean;
}) {
  const attribution = getAttributionViewModel({ source, sourceUrl, author, license, licenseUrl, lastVerifiedAt });
  const hasMetadata = Boolean(
    attribution.source
      || attribution.sourceUrl
      || attribution.sourceUrlInvalid
      || (showDetails && (
        attribution.author
        || attribution.license
        || attribution.licenseUrl
        || attribution.licenseUrlInvalid
        || attribution.lastVerifiedAt
      )),
  );

  return (
    <div className={compact ? "text-xs leading-relaxed" : "text-sm leading-relaxed"}>
      {showLabel && <p className="font-semibold text-stone-600">{label}</p>}
      <div className={`${showLabel ? "mt-1" : ""} space-y-1`}>
        {!hasMetadata ? (
          <p className="text-stone-500">확인된 출처가 없습니다</p>
        ) : (
          <>
            <p className="break-words text-stone-700">
              <span className="font-medium text-stone-900">출처</span>{" "}
              {attribution.source ?? "미확인"}
              {attribution.sourceUrl && (
                <span className="ml-2 inline-block">
                  <ExternalTextLink href={attribution.sourceUrl} ariaLabel={`${label} 원문`}>
                    원문 보기
                  </ExternalTextLink>
                </span>
              )}
            </p>
            {!attribution.sourceUrl && (
              <p className="text-stone-500">
                {attribution.sourceUrlInvalid ? "원문 링크 형식이 올바르지 않습니다" : "원문 링크 미제공"}
              </p>
            )}
            {showDetails && (
              <>
                <p className="break-words text-stone-700">
                  <span className="font-medium text-stone-900">저작자</span>{" "}
                  {attribution.author ?? "미확인"}
                </p>
                <p className="break-words text-stone-700">
                  <span className="font-medium text-stone-900">라이선스</span>{" "}
                  {attribution.license ?? "미확인"}
                  {attribution.licenseUrl && (
                    <span className="ml-2 inline-block">
                      <ExternalTextLink href={attribution.licenseUrl} ariaLabel={`${label} 라이선스`}>
                        조건 보기
                      </ExternalTextLink>
                    </span>
                  )}
                </p>
                {attribution.licenseUrlInvalid && (
                  <p className="text-stone-500">라이선스 링크 형식이 올바르지 않습니다</p>
                )}
                <p className="text-stone-600">
                  <span className="font-medium text-stone-900">최근 확인</span>{" "}
                  {attribution.lastVerifiedAt ?? "미확인"}
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
