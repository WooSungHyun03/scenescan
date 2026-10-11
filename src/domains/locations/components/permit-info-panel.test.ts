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
  it("keeps the permit source separate and recognizes reviewed permit provenance", () => {
    expect(getPermitPanelViewModel(permit(), new Date("2026-10-03T12:00:00+09:00"))).toMatchObject({
      source: "공식 예약 안내",
      sourceUrl: "https://example.com/permit",
      hasOfficialPermitSource: true,
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

  it("preserves the honest fallback when no permit source was verified", () => {
    expect(getPermitPanelViewModel(permit({
      type: "문의 필요",
      contactName: null,
      contactPhone: null,
      sourceUrl: "https://example.com/location-only",
    }))).toMatchObject({ isReviewed: false, hasOfficialPermitSource: false });
  });

  it("does not treat malformed phone or unsafe URL metadata as permit verification", () => {
    expect(getPermitPanelViewModel(permit({
      contactPhone: "담당자에게 문의",
      sourceUrl: "javascript:alert(1)",
    }))).toMatchObject({
      phoneInvalid: true,
      hasOfficialPermitSource: false,
    });
  });

  it("renders the official permit source, dates, and stale warning separately from contacts", () => {
    const html = renderToStaticMarkup(createElement(PermitInfoPanel, {
      locationId: "11111111-1111-4111-8111-111111111111",
      permit: permit({
        source: "수원문화재단 공식 답변",
        sourceUrl: "https://www.swcf.or.kr/?idx=26798&p=356",
        referenceDate: "2022-07-29",
      }),
    }));

    expect(html).toContain('href="https://www.swcf.or.kr/?idx=26798&amp;p=356"');
    expect(html).toContain("수원문화재단 공식 답변");
    expect(html).toContain("원문 기준");
    expect(html).toContain("1년을 지났습니다");
    expect(html).toContain("연락처를 확인하고 있습니다");
  });
});
