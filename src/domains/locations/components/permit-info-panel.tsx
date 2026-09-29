import {
  ExternalLink,
  FileText,
  Phone,
  ShieldQuestion,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import type { PermitInfo } from "@/types/domain";
import { SourceAttribution } from "./source-attribution";

function getValue(value: string | null | undefined) {
  return value?.trim() || null;
}

function getPhoneHref(phone: string | null) {
  if (!phone) return null;
  const callable = phone.replace(/[^\d+]/g, "");
  return /\d/.test(callable) ? `tel:${callable}` : null;
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
    <div className="flex items-start gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
      <span className="mt-0.5 shrink-0 text-stone-500" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-semibold text-stone-500">{label}</dt>
        <dd className="mt-1 break-words text-sm leading-relaxed">{children}</dd>
      </div>
    </div>
  );
}

export function PermitInfoPanel({
  permit,
  sourceUrl,
}: {
  permit: PermitInfo;
  sourceUrl: string | null;
}) {
  const type = getValue(permit.type);
  const contactName = getValue(permit.contactName);
  const contactPhone = getValue(permit.contactPhone);
  const note = getValue(permit.note);
  const phoneHref = getPhoneHref(contactPhone);

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
            촬영 허가 문의
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">
            제공된 문의 정보를 확인한 뒤 촬영 조건과 절차를 직접 확인해 주세요.
          </p>
        </div>
      </div>

      <dl className="mt-4 space-y-3">
        <PermitField
          icon={<ShieldQuestion size={17} />}
          label="허가 정보 유형"
        >
          <span className={type ? "text-stone-900" : "text-stone-500"}>
            {type ?? "정보 없음"}
          </span>
        </PermitField>

        <PermitField icon={<UserRound size={17} />} label="문의 담당자">
          <span
            className={contactName ? "text-stone-900" : "text-stone-500"}
          >
            {contactName ?? "정보 없음"}
          </span>
        </PermitField>

        <PermitField icon={<Phone size={17} />} label="연락처">
          {phoneHref && contactPhone ? (
            <a
              href={phoneHref}
              className="font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-950"
            >
              {contactPhone}
            </a>
          ) : (
            <span className={contactPhone ? "text-stone-900" : "text-stone-500"}>
              {contactPhone ?? "정보 없음"}
            </span>
          )}
        </PermitField>

        <PermitField icon={<FileText size={17} />} label="참고 사항">
          <span className={note ? "text-stone-900" : "text-stone-500"}>
            {note ?? "정보 없음"}
          </span>
        </PermitField>

        <PermitField icon={<ExternalLink size={17} />} label="정보 출처">
          <SourceAttribution
            sourceUrl={sourceUrl}
            label="장소·허가 정보 출처"
            compact
            showLabel={false}
          />
        </PermitField>
      </dl>

      {!contactName && !contactPhone && (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          등록된 담당자나 연락처가 없습니다. 출처가 제공된 경우 원문에서 최신
          문의 방법을 확인해 주세요.
        </p>
      )}
    </section>
  );
}
