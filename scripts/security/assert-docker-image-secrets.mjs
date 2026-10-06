import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CANARY_ENVIRONMENT_NAME = "SCENESCAN_SECRET_CANARIES";

export function parseSecretCanaries(value) {
  if (!value) {
    throw new Error(`${CANARY_ENVIRONMENT_NAME} must be a JSON array of fake secret values`);
  }

  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (cause) {
    throw new Error(`${CANARY_ENVIRONMENT_NAME} must contain valid JSON`, { cause });
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`${CANARY_ENVIRONMENT_NAME} must contain at least one fake secret value`);
  }

  const values = [...new Set(parsed.map((item) => typeof item === "string" ? item.trim() : ""))];
  if (values.some((item) => item.length < 12)) {
    throw new Error(`${CANARY_ENVIRONMENT_NAME} values must be strings of at least 12 characters`);
  }
  return values.map((value, index) => ({ label: `secret-canary-${index + 1}`, value }));
}

export function findSecretCanaries(content, canaries) {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return canaries
    .filter(({ value }) => buffer.includes(Buffer.from(value)))
    .map(({ label }) => label);
}

export async function findSecretCanariesInStream(stream, canaries) {
  const findings = new Set();
  const maximumLength = Math.max(...canaries.map(({ value }) => Buffer.byteLength(value)));
  let tail = Buffer.alloc(0);

  for await (const rawChunk of stream) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
    const content = Buffer.concat([tail, chunk]);
    for (const label of findSecretCanaries(content, canaries)) findings.add(label);
    tail = content.subarray(Math.max(0, content.length - maximumLength + 1));
  }
  return [...findings];
}

function dockerOutput(args) {
  const result = spawnSync("docker", args, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`docker ${args[0]} failed: ${result.stderr.trim() || "unknown error"}`);
  }
  return result.stdout;
}

async function scanExport(containerId, canaries) {
  const child = spawn("docker", ["export", containerId], { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const findingsPromise = findSecretCanariesInStream(child.stdout, canaries);
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  if (exitCode !== 0) throw new Error(`docker export failed: ${stderr.trim() || `exit ${exitCode}`}`);
  return findingsPromise;
}

export async function assertDockerImageHasNoSecretCanaries(image, canaries) {
  dockerOutput(["image", "inspect", image]);
  const metadata = [
    dockerOutput(["image", "inspect", "--format", "{{json .Config.Env}}", image]),
    dockerOutput(["history", "--no-trunc", "--format", "{{.CreatedBy}}", image]),
  ].join("\n");
  const findings = new Set(findSecretCanaries(metadata, canaries));

  const containerId = dockerOutput(["create", image]).trim();
  try {
    for (const label of await scanExport(containerId, canaries)) findings.add(label);
  } finally {
    dockerOutput(["rm", "--force", containerId]);
  }

  if (findings.size > 0) {
    throw new Error(`Server secret canary found in Docker image metadata or filesystem: ${[...findings].join(", ")}`);
  }
}

async function main() {
  const image = process.argv[2];
  if (!image) throw new Error("Usage: pnpm security:docker-image <image>");
  const canaries = parseSecretCanaries(process.env[CANARY_ENVIRONMENT_NAME]);
  await assertDockerImageHasNoSecretCanaries(image, canaries);
  console.log(`Docker image secret boundary: passed (${canaries.length} canaries)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
