"use client";

import { ExternalLink, LoaderCircle, Phone, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toPhoneHref } from "@/domains/locations/services/permit-verification";
import {
  locationContactsResponseSchema,
  type LocationContactsResponse,
} from "@/types/location-contact";
import { requestExternalInfo } from "./external-info-request";

type Phase = "loading" | "ready" | "empty" | "error";

const PRESENTATION = {
  permit_contact: {
    label: "촬영 허가 문의",
    description: "공식 원문에서 촬영 허가 또는 촬영 절차 문의처로 확인된 연락처입니다.",
  },
  management_contact: {
    label: "시설 관리 문의",
    description: "시설 운영·관리 기관 연락처입니다. 촬영 허가 담당 여부는 통화 시 별도로 확인해 주세요.",
  },
  place_contact: {
    label: "장소 대표 연락처",
    description: "장소 대표번호이며 촬영 허가 담당번호로 확인된 것은 아닙니다.",
  },
} as const;

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export function PermitContactResults({ response }: { response: LocationContactsResponse }) {
  if (response.contacts.length === 0) {
    const message = response.reason === "large_site_requires_review"
      ? "범위가 넓거나 여러 시설이 포함된 장소라 대표번호를 자동 매칭하지 않았습니다. 공식 운영기관에서 촬영 문의처를 직접 확인해 주세요."
      : response.reason === "ambiguous_provider_match"
        ? "같은 장소로 볼 수 있는 후보가 여러 개라 연락처를 자동 선택하지 않았습니다."
        : response.reason === "no_phone"
          ? "일치하는 장소 후보에 공개 전화번호가 없어 미확인 상태로 남겼습니다."
          : "확인된 촬영 문의처가 없습니다. 공식 운영기관에서 최신 문의 방법을 직접 확인해 주세요.";
    return <p className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">{message}</p>;
  }

  return (
    <div className="space-y-3">
      {response.contacts.map((contact) => {
        const presentation = PRESENTATION[contact.contactType];
        const phoneHref = toPhoneHref(contact.phone);
        const isSuggestion = contact.verification === "provider_suggestion";
        return (
          <article key={contact.id} className="rounded-xl border border-stone-200 bg-stone-50/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-stone-900">{presentation.label}</h4>
              <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                isSuggestion ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"
              }`}>
                {isSuggestion ? "자동 추천 · 미확인" : "공식 원문 검수"}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-stone-600">{presentation.description}</p>
            {isSuggestion && (
              <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs font-semibold text-amber-900">
                Kakao 번호는 장소 대표번호 후보일 뿐 촬영 허가 검증 상태를 높이지 않습니다.
              </p>
            )}
            <p className="mt-3 text-sm font-semibold text-stone-900">{contact.contactName}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {phoneHref && (
                <a href={phoneHref} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-emerald-800 px-3 text-xs font-bold text-white">
                  <Phone size={14} aria-hidden="true" /> {contact.phone}
                </a>
              )}
              <a
                href={contact.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-xs font-bold text-stone-800"
              >
                <ExternalLink size={14} aria-hidden="true" /> 출처 확인
              </a>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-stone-500">
              {contact.source} · 최근 확인 {dateLabel(contact.lastVerifiedAt)}
            </p>
          </article>
        );
      })}
    </div>
  );
}

export function PermitContactList({ locationId }: { locationId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [response, setResponse] = useState<LocationContactsResponse | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const activeController = useRef<AbortController | null>(null);

  const retry = useCallback(() => {
    setPhase("loading");
    setResponse(null);
    setRequestVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    activeController.current?.abort();
    activeController.current = controller;

    const url = `/api/locations/${encodeURIComponent(locationId)}/contacts`;
    void requestExternalInfo({
      key: `contacts:${locationId}`,
      url,
      signal: controller.signal,
      parse(value) {
        const body = locationContactsResponseSchema.parse(value);
        if (body.locationId !== locationId) throw new Error("Contact response location mismatch");
        return body;
      },
    }).then((body) => {
      if (controller.signal.aborted || activeController.current !== controller) return;
      setResponse(body);
      setPhase(body.contacts.length > 0 ? "ready" : "empty");
    }).catch(() => {
      if (!controller.signal.aborted && activeController.current === controller) setPhase("error");
    });

    return () => {
      controller.abort();
      if (activeController.current === controller) activeController.current = null;
    };
  }, [locationId, requestVersion]);

  if (phase === "loading") {
    return (
      <div role="status" className="flex min-h-20 items-center justify-center gap-2 rounded-lg bg-stone-50 text-xs text-stone-600">
        <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> 연락처를 확인하고 있습니다.
      </div>
    );
  }
  if (phase === "error") {
    return (
      <div role="alert" className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
        <p>연락처를 불러오지 못했습니다. 촬영 허가 정보와 다른 장소 정보는 계속 확인할 수 있습니다.</p>
        <button type="button" onClick={retry} className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 font-bold">
          <RefreshCw size={14} aria-hidden="true" /> 다시 확인
        </button>
      </div>
    );
  }
  return response ? <PermitContactResults response={response} /> : null;
}
