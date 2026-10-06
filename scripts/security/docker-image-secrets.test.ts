import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";

// The production checker is plain ESM so GitHub's preinstalled Node can run
// it before project dependencies are installed on the host runner.
// @ts-expect-error The JavaScript CLI intentionally has no TypeScript declaration file.
const dockerImageSecrets = await import("./assert-docker-image-secrets.mjs");
const {
  findSecretCanaries,
  findSecretCanariesInStream,
  parseSecretCanaries,
} = dockerImageSecrets;

describe("Docker image secret boundary", () => {
  it("requires deliberately fake, non-trivial canaries", () => {
    expect(() => parseSecretCanaries(undefined)).toThrow(/SCENESCAN_SECRET_CANARIES/);
    expect(() => parseSecretCanaries("[]")).toThrow(/at least one/);
    expect(() => parseSecretCanaries('["short"]')).toThrow(/at least 12/);
    expect(parseSecretCanaries('["fake-server-secret-1", "fake-server-secret-1"]'))
      .toEqual([{ label: "secret-canary-1", value: "fake-server-secret-1" }]);
  });

  it("reports labels without returning the secret value", () => {
    const canaries = parseSecretCanaries('["fake-server-secret-value"]');
    const findings = findSecretCanaries("prefix fake-server-secret-value suffix", canaries);
    expect(findings).toEqual(["secret-canary-1"]);
    expect(JSON.stringify(findings)).not.toContain("fake-server-secret-value");
  });

  it("detects a value split across Docker export stream chunks", async () => {
    const canaries = parseSecretCanaries('["fake-server-secret-value"]');
    const stream = Readable.from([Buffer.from("fake-server-"), Buffer.from("secret-value")]);
    await expect(findSecretCanariesInStream(stream, canaries))
      .resolves.toEqual(["secret-canary-1"]);
  });
});
