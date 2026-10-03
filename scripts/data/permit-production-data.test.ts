import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseNormalizedLocationOutput } from "./contracts.ts";
import { getPermitFreshness, isValidContactPhone } from "./permit-information.ts";

const reviewedSources = new Map([
  ["동대문디자인플라자", "www.ddp.or.kr"],
  ["문화비축기지", "parks.seoul.go.kr"],
  ["선유도공원", "yeyak.seoul.go.kr"],
  ["수원화성", "www.swcf.or.kr"],
  ["광명동굴", "www.gm.go.kr"],
]);

describe("production permit priority set", () => {
  it("keeps every reviewed source, public contact, and verification timestamp in canonical data", async () => {
    const dataset = parseNormalizedLocationOutput(JSON.parse(
      await readFile("data/production/locations.json", "utf8"),
    ) as unknown);

    for (const [name, hostname] of reviewedSources) {
      const location = dataset.locations.find((candidate) => candidate.name === name);
      expect(location, name).toBeDefined();
      expect(location?.permit.type, name).toBe("기관 직접 문의");
      expect(location?.permit.contactName, name).toBeTruthy();
      expect(isValidContactPhone(location?.permit.contactPhone ?? ""), name).toBe(true);
      expect(new URL(location?.permit.provenance.sourceUrl ?? "").hostname, name).toBe(hostname);
      expect(location?.permit.provenance.lastVerifiedAt, name).toBeTruthy();
    }
  });

  it("marks old source conditions separately from the current link-check date", async () => {
    const dataset = parseNormalizedLocationOutput(JSON.parse(
      await readFile("data/production/locations.json", "utf8"),
    ) as unknown);
    const now = new Date("2026-10-03T18:00:00+09:00");

    for (const name of ["문화비축기지", "수원화성"]) {
      const permit = dataset.locations.find((location) => location.name === name)?.permit;
      expect(getPermitFreshness(permit?.provenance.referenceDate, now), name).toBe("stale");
      expect(getPermitFreshness(permit?.provenance.lastVerifiedAt, now), name).toBe("current");
    }
  });

  it("retains an honest no-contact fallback for every location outside the reviewed set", async () => {
    const dataset = parseNormalizedLocationOutput(JSON.parse(
      await readFile("data/production/locations.json", "utf8"),
    ) as unknown);
    const fallback = dataset.locations.filter((location) => !reviewedSources.has(location.name));

    expect(fallback.length).toBe(dataset.locations.length - reviewedSources.size);
    expect(fallback.every((location) => (
      location.permit.type === "문의 필요"
      && location.permit.contactName === null
      && location.permit.contactPhone === null
    ))).toBe(true);
  });
});
