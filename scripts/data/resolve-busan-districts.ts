import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import type { District } from "../../src/types/domain.ts";
import {
  crossCheckNamedDistrict,
  loadBusanDistrictBoundaries,
  resolveDistrictByBoundary,
  type BusanBoundaryData,
} from "./busan-boundary.ts";
import { parseCollectionManifest } from "./collect-commons.ts";

/**
 * Applies the official boundary-based district judgement (see
 * scripts/data/busan-boundary.ts and DATA_LICENSES.md's "Busan
 * administrative district boundaries" entry) to every Busan location in
 * the commons manifest whose district is still null. Only ever writes a
 * district back for a location where BOTH checks pass:
 *
 * 1. The coordinate resolves to exactly one district and is not within
 *    100m of that district's own boundary (resolveDistrictByBoundary).
 * 2. The location's own name/description does not name a *different*
 *    district than the boundary judgement (crossCheckNamedDistrict).
 *
 * Anything else stays district: null and is recorded in the report's
 * `needsReview` list with the specific reason -- never guessed.
 */

export type DistrictJudgement =
  | { id: string; name: string; status: "confirmed"; district: District; admName: string; distanceToBoundaryMeters: number }
  | { id: string; name: string; status: "needs-review"; reason: "NOT_IN_ANY_DISTRICT_BOUNDARY" }
  | { id: string; name: string; status: "needs-review"; reason: "NEAR_DISTRICT_BOUNDARY"; nearestDistricts: District[]; distanceToBoundaryMeters: number }
  | { id: string; name: string; status: "needs-review"; reason: "NAME_MISMATCH"; boundaryDistrict: District; namedDistricts: District[] };

export function judgeBusanDistrict(
  location: { id: string; name: string; description: string; latitude: number; longitude: number },
  boundaries: BusanBoundaryData,
): DistrictJudgement {
  const boundaryResult = resolveDistrictByBoundary([location.longitude, location.latitude], boundaries);
  if (boundaryResult.status === "needs-review") {
    return boundaryResult.reason === "NOT_IN_ANY_DISTRICT_BOUNDARY"
      ? { id: location.id, name: location.name, status: "needs-review", reason: "NOT_IN_ANY_DISTRICT_BOUNDARY" }
      : {
        id: location.id, name: location.name, status: "needs-review", reason: "NEAR_DISTRICT_BOUNDARY",
        nearestDistricts: boundaryResult.nearestDistricts, distanceToBoundaryMeters: boundaryResult.distanceToBoundaryMeters,
      };
  }
  const crossCheck = crossCheckNamedDistrict(`${location.name} ${location.description}`, boundaryResult.district);
  if (crossCheck.status === "conflict") {
    return {
      id: location.id, name: location.name, status: "needs-review", reason: "NAME_MISMATCH",
      boundaryDistrict: boundaryResult.district, namedDistricts: crossCheck.namedDistricts,
    };
  }
  return {
    id: location.id, name: location.name, status: "confirmed", district: boundaryResult.district,
    admName: boundaryResult.admName, distanceToBoundaryMeters: boundaryResult.distanceToBoundaryMeters,
  };
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

async function main(): Promise<void> {
  const [manifestPath, boundaryPath, reportPath] = process.argv.slice(2);
  if (!manifestPath || !boundaryPath || !reportPath) {
    throw new Error("Usage: node resolve-busan-districts.ts <commons-manifest.json> <boundary.geojson> <report.json>");
  }
  const manifest = parseCollectionManifest(JSON.parse(await readFile(manifestPath, "utf8")) as unknown);
  const boundaries = await loadBusanDistrictBoundaries(boundaryPath);

  const judgements: DistrictJudgement[] = [];
  let confirmedCount = 0;
  for (const location of manifest.locations) {
    if (location.region !== "부산" || location.district) continue;
    const judgement = judgeBusanDistrict(location, boundaries);
    judgements.push(judgement);
    if (judgement.status === "confirmed") {
      location.district = judgement.district;
      confirmedCount += 1;
    }
  }

  await writeJsonAtomic(manifestPath, parseCollectionManifest(manifest));
  await writeJsonAtomic(reportPath, {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    boundaryDataSource: boundaryPath,
    evaluated: judgements.length,
    confirmed: confirmedCount,
    needsReview: judgements.length - confirmedCount,
    judgements,
  });
  console.log(`Busan district judgement: evaluated=${judgements.length}, confirmed=${confirmedCount}, needsReview=${judgements.length - confirmedCount}`);
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
