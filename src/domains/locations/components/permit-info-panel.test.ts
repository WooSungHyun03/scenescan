import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PermitInfo } from "@/types/domain";
import { getPermitPanelViewModel, PermitInfoPanel } from "./permit-info-panel";

function permit(overrides: Partial<PermitInfo> = {}): PermitInfo {
  return {
    type: "기관 직접 문의",
    contactName: "공식 담당 부서",
    contactPhone: "02-2631-9368",
    note: "시설별 조건은 원문에서 확인",
    source: "공식 예약 안내",
    sourceUrl: "https://example.com/permit",
    referenceDate: "2026-01-01",
    lastVerifiedAt: "2026-10-03T09:00:00+09:00",
    ...overrides,
  };
}

describe("permit info panel view model", () => {
  it("keeps the permit source separate from the location source and exposes a callable contact", () => {
    expect(getPermitPanelViewModel(permit(), new Date("2026-10-03T12:00:00+09:00"))).toMatchObject({
      source: "공식 예약 안내",
      sourceUrl: "https://example.com/permit",
      phoneHref: "tel:0226319368",
      hasContactMethod: true,
      isStale: false,
    });
  });

  it("marks old source conditions as stale even when the URL was checked recently", () => {
    const model = getPermitPanelViewModel(
      permit({ referenceDate: "2022-07-29" }),
      new Date("2026-10-03T12:00:00+09:00"),
    );
    expect(model.isStale).toBe(true);
  });

  it("preserves the honest fallback when no contact method was verified", () => {
    expect(getPermitPanelViewModel(permit({
      type: "문의 필요",
      contactName: null,
      contactPhone: null,
      sourceUrl: "https://example.com/location-only",
    }))).toMatchObject({ isReviewed: false, hasContactMethod: false });
  });

  it("does not treat malformed phone or unsafe URL metadata as a contact method", () => {
    expect(getPermitPanelViewModel(permit({
      contactPhone: "담당자에게 문의",
      sourceUrl: "javascript:alert(1)",
    }))).toMatchObject({
      contactPhone: null,
      phoneHref: null,
      phoneInvalid: true,
      hasContactMethod: false,
    });
  });

  it("renders the official source, callable phone number, dates, and stale warning", () => {
    const html = renderToStaticMarkup(createElement(PermitInfoPanel, {
      permit: permit({
        source: "수원문화재단 공식 답변",
        sourceUrl: "https://www.swcf.or.kr/?idx=26798&p=356",
        referenceDate: "2022-07-29",
      }),
    }));

    expect(html).toContain('href="tel:0226319368"');
    expect(html).toContain('href="https://www.swcf.or.kr/?idx=26798&amp;p=356"');
    expect(html).toContain("수원문화재단 공식 답변");
    expect(html).toContain("원문 기준");
    expect(html).toContain("1년을 지났습니다");
  });
});
