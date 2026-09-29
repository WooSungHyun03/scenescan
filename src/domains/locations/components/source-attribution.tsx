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

export function SourceAttribution({
  source,
  sourceUrl,
  label = "정보 출처",
  compact = false,
  showLabel = true,
}: {
  source?: string | null;
  sourceUrl?: string | null;
  label?: string;
  compact?: boolean;
  showLabel?: boolean;
}) {
  const sourceName = getValue(source);
  const sourceAsUrl = getSafeSourceUrl(sourceName);
  const safeSourceUrl = getSafeSourceUrl(sourceUrl) ?? sourceAsUrl;
  const displaySource = sourceName && !sourceAsUrl ? sourceName : null;
  const linkText = displaySource ?? safeSourceUrl ?? "원문 보기";

  return (
    <div className={compact ? "text-xs leading-relaxed" : "text-sm leading-relaxed"}>
      {showLabel && <p className="font-semibold text-stone-600">{label}</p>}
      <div className={showLabel ? "mt-1" : ""}>
        {safeSourceUrl ? (
          <a
            href={safeSourceUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`${label}: ${linkText} (새 창에서 열기)`}
            className="inline-flex min-h-11 items-center gap-1 break-all font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-950"
          >
            <span>{linkText}</span>
            <ExternalLink size={13} className="shrink-0" aria-hidden="true" />
          </a>
        ) : displaySource ? (
          <div>
            <p className="break-words font-medium text-stone-900">{displaySource}</p>
            <p className="mt-0.5 text-stone-500">원문 링크 미제공</p>
          </div>
        ) : (
          <p className="text-stone-500">정보 없음</p>
        )}
      </div>
    </div>
  );
}
