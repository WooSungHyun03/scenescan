import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIP_EMBEDDING_DIMENSION } from "../../src/lib/ai/embedding-service.ts";
import { parseOutput } from "./contracts.ts";
import { detectImageMime, prepareEmbeddings } from "./pipeline.ts";

const temporaryDirectories: string[] = [];
const uuid = (suffix: number) => `00000000-0000-4000-8000-${suffix.toString().padStart(12, "0")}`;
const entry = (index: number) => ({
  image_id: uuid(index),
  location_id: uuid(index + 100),
  image_path: `./image-${index}.png`,
  image_url: `https://example.com/image-${index}.png`,
  source: "Synthetic test fixture",
  source_url: "https://example.com/license",
});

async function workspace(entries: ReturnType<typeof entry>[]) {
  const directory = await mkdtemp(join(tmpdir(), "scenescan-embeddings-"));
  temporaryDirectories.push(directory);
  const manifestPath = join(directory, "manifest.json");
  const outputPath = join(directory, "output.json");
  await writeFile(manifestPath, JSON.stringify({ schema_version: 1, items: entries }));
  return { manifestPath, outputPath };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

describe("offline embedding pipeline", () => {
  it("detects image bytes instead of trusting extensions", () => {
    expect(detectImageMime(Uint8Array.from([0xff, 0xd8, 0xff]))).toBe("image/jpeg");
    expect(detectImageMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
      .toBe("image/png");
    expect(detectImageMime(Uint8Array.from([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80])))
      .toBe("image/webp");
    expect(() => detectImageMime(Uint8Array.from([1, 2, 3]))).toThrow("corrupt");
  });

  it("batches deterministically, writes metadata, and resumes without model loading", async () => {
    const paths = await workspace([entry(3), entry(1), entry(2)]);
    const extractor = vi.fn(async (images: unknown[]) => (
      images.flatMap((_, index) => new Array(CLIP_EMBEDDING_DIMENSION).fill(index + 0.25))
    ));
    const loadExtractor = vi.fn(async () => extractor);
    const dependencies = {
      transformersVersion: "4.3.0",
      decodeImage: async (path: string) => ({ value: path, width: 800, height: 600 }),
      loadExtractor,
    };

    const first = await prepareEmbeddings({ ...paths, batchSize: 2, retries: 0, resume: true }, dependencies);

    expect(extractor).toHaveBeenCalledTimes(2);
    expect(first.output.items.map(({ image_id }) => image_id)).toEqual([uuid(3), uuid(1), uuid(2)]);
    expect(first.output.items[0]).toMatchObject({
      model_id: "Xenova/clip-vit-base-patch32",
      model_revision: "main",
      transformers_js_version: "4.3.0",
    });
    expect(parseOutput(JSON.parse(await readFile(paths.outputPath, "utf8"))).items).toHaveLength(3);

    const noReload = vi.fn(async () => { throw new Error("model should not load"); });
    const second = await prepareEmbeddings(
      { ...paths, batchSize: 2, retries: 0, resume: true },
      { ...dependencies, loadExtractor: noReload },
    );
    expect(second).toMatchObject({ processed: 0, resumed: 3 });
    expect(noReload).not.toHaveBeenCalled();
  });

  it("retries a transient model error inside the batch", async () => {
    const paths = await workspace([entry(1)]);
    const extractor = vi.fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce(new Array(CLIP_EMBEDDING_DIMENSION).fill(0.5));

    const result = await prepareEmbeddings(
      { ...paths, batchSize: 1, retries: 1, resume: true },
      {
        transformersVersion: "4.3.0",
        decodeImage: async (path) => ({ value: path, width: 10, height: 10 }),
        loadExtractor: async () => extractor,
      },
    );

    expect(extractor).toHaveBeenCalledTimes(2);
    expect(result.output.items).toHaveLength(1);
    expect(result.output.failures).toHaveLength(0);
  });

  it("persists failures and retries only failed items on the next run", async () => {
    const paths = await workspace([entry(1), entry(2)]);
    const first = await prepareEmbeddings(
      { ...paths, batchSize: 2, retries: 0, resume: true },
      {
        transformersVersion: "4.3.0",
        decodeImage: async (path) => {
          if (path.endsWith("image-2.png")) throw new Error("file missing");
          return { value: path, width: 10, height: 10 };
        },
        loadExtractor: async () => async () => new Array(CLIP_EMBEDDING_DIMENSION).fill(0.5),
      },
    );
    expect(first.output.items).toHaveLength(1);
    expect(first.output.failures).toEqual([expect.objectContaining({ image_id: uuid(2), attempts: 1 })]);

    const extractor = vi.fn(async () => new Array(CLIP_EMBEDDING_DIMENSION).fill(0.75));
    const second = await prepareEmbeddings(
      { ...paths, batchSize: 2, retries: 0, resume: true },
      {
        transformersVersion: "4.3.0",
        decodeImage: async (path) => ({ value: path, width: 10, height: 10 }),
        loadExtractor: async () => extractor,
      },
    );

    expect(second).toMatchObject({ processed: 1, resumed: 1 });
    expect(second.output.items).toHaveLength(2);
    expect(second.output.failures).toHaveLength(0);
    expect(extractor).toHaveBeenCalledWith([expect.stringContaining("image-2.png")]);
  });

  it("recomputes an image when its manifest metadata changes", async () => {
    const paths = await workspace([entry(1)]);
    const dependencies = {
      transformersVersion: "4.3.0",
      decodeImage: async (path: string) => ({ value: path, width: 10, height: 10 }),
      loadExtractor: async () => async () => new Array(CLIP_EMBEDDING_DIMENSION).fill(0.5),
    };
    await prepareEmbeddings(
      { ...paths, batchSize: 1, retries: 0, resume: true },
      dependencies,
    );
    await writeFile(paths.manifestPath, JSON.stringify({
      schema_version: 1,
      items: [{ ...entry(1), source: "Updated authorized source" }],
    }));
    const extractor = vi.fn(async () => new Array(CLIP_EMBEDDING_DIMENSION).fill(0.75));

    const result = await prepareEmbeddings(
      { ...paths, batchSize: 1, retries: 0, resume: true },
      { ...dependencies, loadExtractor: async () => extractor },
    );

    expect(result).toMatchObject({ processed: 1, resumed: 0 });
    expect(result.output.items[0].source).toBe("Updated authorized source");
    expect(extractor).toHaveBeenCalledOnce();
  });

  it("rejects incompatible or malformed resume output", async () => {
    const paths = await workspace([entry(1)]);
    await writeFile(paths.outputPath, JSON.stringify({ schema_version: 1, model: {}, items: [], failures: [] }));

    await expect(prepareEmbeddings(
      { ...paths, batchSize: 1, retries: 0, resume: true },
      {
        transformersVersion: "4.3.0",
        decodeImage: async (path) => ({ value: path, width: 10, height: 10 }),
        loadExtractor: async () => async () => [],
      },
    )).rejects.toThrow();
  });
});
