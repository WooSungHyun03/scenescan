import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createSupabaseAdminClient, readSupabaseAdminEnvironment } from "../shared/supabase-admin-client.ts";
import { getIntegrationEnv } from "../../supabase/tests/integration-env.ts";
import { runImport } from "./import.ts";

const env = getIntegrationEnv();

function dataset(locationId: string, parkingName: string) {
  return {
    schemaVersion: 2,
    source: { name: "integration-test-source" },
    locations: [{
      id: locationId,
      name: "임포트 재실행 테스트 장소",
      description: "",
      category: "urban",
      region: "서울",
      address: "주소",
      latitude: 37.5,
      longitude: 127.0,
      permit: { type: "문의 필요", contactName: null, contactPhone: null, note: null, provenance: provenance() },
      parking: [{ relationship: "nearby", name: parkingName, latitude: 37.5, longitude: 127.0, capacity: 3, openingHours: null, priceInfo: null, provenance: provenance() }],
      images: [{ imagePath: "location.jpg", imageUrl: "https://example.com/location.jpg", alt: "설명" }],
      sourceUrl: "https://example.com/source",
      provenance: provenance(),
    }],
  };
}

function provenance() {
  return { source: "integration-test-source", sourceUrl: "https://example.com/source", referenceDate: null, lastVerifiedAt: null };
}

// Moves the manually-run "apply the same input twice, row count must not
// grow" verification (done against a hand-rolled Postgres+PostgREST+JWT
// setup earlier in this project's history -- see docs/data-pipeline.md)
// into an automated test against a real Supabase instance, using the
// actual CLI entry point (runImport), not a re-implementation of it.
describe.skipIf(!env)("locations/parking importer re-run (live Supabase)", () => {
  const adminClient = env ? createSupabaseAdminClient(readSupabaseAdminEnvironment(process.env)) : null!;
  const workspaces: string[] = [];
  const seededLocationIds: string[] = [];

  afterEach(async () => {
    await Promise.all(workspaces.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  afterAll(async () => {
    for (const id of seededLocationIds) await adminClient.from("locations").delete().eq("id", id);
  });

  it("running --apply twice with identical input does not duplicate rows, and --dry-run writes nothing", async () => {
    const locationId = randomUUID();
    seededLocationIds.push(locationId);
    const parkingName = `통합테스트 주차장 ${locationId.slice(0, 8)}`;

    const root = await mkdtemp(join(tmpdir(), "scenescan-import-integration-"));
    workspaces.push(root);
    await writeFile(join(root, "location.jpg"), "synthetic-test-image", "utf8");
    const inputPath = join(root, "input.json");
    await writeFile(inputPath, JSON.stringify(dataset(locationId, parkingName)), "utf8");

    const dryRunReportPath = join(root, "dry-run-report.json");
    await runImport({ inputPath, reportPath: dryRunReportPath, mode: "dry-run", batchSize: 100, imageRoot: root });
    const afterDryRun = await adminClient.from("locations").select("id").eq("id", locationId);
    expect(afterDryRun.data).toEqual([]);

    const applyReportPath1 = join(root, "apply-report-1.json");
    await runImport({ inputPath, reportPath: applyReportPath1, mode: "apply", batchSize: 100, imageRoot: root });
    const afterFirstApply = await adminClient.from("locations").select("id, name").eq("id", locationId);
    expect(afterFirstApply.data).toHaveLength(1);
    const parkingAfterFirst = await adminClient.from("parking").select("id, name").eq("location_id", locationId);
    expect(parkingAfterFirst.data).toHaveLength(1);
    const parkingId = parkingAfterFirst.data![0].id;

    const applyReportPath2 = join(root, "apply-report-2.json");
    await runImport({ inputPath, reportPath: applyReportPath2, mode: "apply", batchSize: 100, imageRoot: root });
    const afterSecondApply = await adminClient.from("locations").select("id").eq("id", locationId);
    expect(afterSecondApply.data).toHaveLength(1); // still exactly one row, not two
    const parkingAfterSecond = await adminClient.from("parking").select("id, name").eq("location_id", locationId);
    expect(parkingAfterSecond.data).toHaveLength(1);
    expect(parkingAfterSecond.data![0].id).toBe(parkingId); // same row, not a new one
  });
});
