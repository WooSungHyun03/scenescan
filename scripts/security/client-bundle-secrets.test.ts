import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { findClientBundleSecretLeaks } from "./client-bundle-secrets";

const temporaryDirectories: string[] = [];

function createBundle(): string {
  const directory = mkdtempSync(join(tmpdir(), "scenescan-client-bundle-"));
  temporaryDirectories.push(directory);
  mkdirSync(join(directory, "chunks"));
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("client bundle secret boundary", () => {
  it("accepts a client bundle containing only public Supabase configuration", () => {
    const directory = createBundle();
    writeFileSync(
      join(directory, "chunks", "app.js"),
      "NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );

    expect(findClientBundleSecretLeaks(directory, ["server-only-sentinel"]))
      .toEqual([]);
  });

  it("reports forbidden variable names without printing the secret value", () => {
    const directory = createBundle();
    writeFileSync(
      join(directory, "chunks", "app.js"),
      "SUPABASE_SECRET_KEY=server-only-sentinel",
    );

    const findings = findClientBundleSecretLeaks(
      directory,
      ["server-only-sentinel"],
    );

    expect(findings).toEqual([
      { file: join("chunks", "app.js"), token: "SUPABASE_SECRET_KEY" },
      { file: join("chunks", "app.js"), token: "server-secret-value-1" },
    ]);
    expect(JSON.stringify(findings)).not.toContain("server-only-sentinel");
  });
});
