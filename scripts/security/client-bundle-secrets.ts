import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const forbiddenClientBundleNames = [
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "KMA_VILLAGE_FORECAST_SERVICE_KEY",
  "PUBLIC_DATA_PORTAL_SERVICE_KEY",
  "NVIDIA_API_KEY",
  "NEXT_PUBLIC_SUPABASE_SECRET_KEY",
  "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
] as const;

type Finding = {
  file: string;
  token: string;
};

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

export function findClientBundleSecretLeaks(
  directory: string,
  secretValues: readonly string[] = [],
): Finding[] {
  if (!statSync(directory).isDirectory()) {
    throw new Error(`Client bundle path is not a directory: ${directory}`);
  }

  const tokens = [
    ...forbiddenClientBundleNames.map((value) => ({
      label: value,
      value,
    })),
    ...secretValues
      .map((value) => value.trim())
      .filter((value) => value.length >= 8)
      .map((value, index) => ({
        label: `server-secret-value-${index + 1}`,
        value,
      })),
  ];

  return listFiles(directory).flatMap((file) => {
    const content = readFileSync(file);
    return tokens
      .filter(({ value }) => content.includes(Buffer.from(value)))
      .map(({ label }) => ({ file: relative(directory, file), token: label }));
  });
}
