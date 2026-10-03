import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { findClientBundleSecretLeaks } from "./client-bundle-secrets.ts";

const bundleDirectory = resolve(process.cwd(), ".next", "static");
if (!existsSync(bundleDirectory)) {
  throw new Error("Client bundle is missing; run pnpm build before this check");
}

const findings = findClientBundleSecretLeaks(bundleDirectory, [
  process.env.SUPABASE_SECRET_KEY ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
]);

if (findings.length > 0) {
  const summary = findings
    .map(({ file, token }) => `${file}: ${token}`)
    .join("\n");
  throw new Error(`Server-only Supabase data found in client bundle:\n${summary}`);
}

console.log("Client bundle secret boundary: passed");
