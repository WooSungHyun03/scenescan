import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { APIRequestContext } from "@playwright/test";

function readLocalEnvironment(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of readFileSync(resolve(process.cwd(), ".env.integration.example"), "utf8").split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator > 0) values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return values;
}

const local = readLocalEnvironment();
const baseUrl = local.SUPABASE_URL;
const serviceRoleKey = local.SUPABASE_SERVICE_ROLE_KEY;

function adminHeaders() {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

export async function seedShortlistLocations(request: APIRequestContext, ids: readonly string[]) {
  const response = await request.post(`${baseUrl}/rest/v1/locations?on_conflict=id`, {
    headers: { ...adminHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
    data: ids.map((id, index) => ({
      id,
      name: `관심 장소 E2E ${index + 1}`,
      description: "SceneScan local Auth E2E fixture",
      category: "urban",
      region: "부산",
      address: "부산 로컬 테스트 주소",
      latitude: 35.1 + index * 0.001,
      longitude: 129.0,
    })),
  });
  if (!response.ok()) throw new Error(`Failed to seed shortlist locations: ${response.status()}`);
}

export async function createConfirmedTestUser(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const response = await request.post(`${baseUrl}/auth/v1/admin/users`, {
    headers: adminHeaders(),
    data: { email, password, email_confirm: true },
  });
  if (!response.ok()) throw new Error(`Failed to create confirmed user: ${response.status()}`);
  const body = await response.json() as { id?: unknown };
  if (typeof body.id !== "string") throw new Error("Confirmed user response did not include an id");
  return body.id;
}

export async function cleanupShortlistFixtures(
  request: APIRequestContext,
  locationIds: readonly string[],
  userIds: readonly string[],
) {
  if (locationIds.length > 0) {
    await request.delete(`${baseUrl}/rest/v1/locations?id=in.(${locationIds.join(",")})`, { headers: adminHeaders() });
  }
  for (const userId of userIds) {
    await request.delete(`${baseUrl}/auth/v1/admin/users/${userId}`, { headers: adminHeaders() });
  }
}
