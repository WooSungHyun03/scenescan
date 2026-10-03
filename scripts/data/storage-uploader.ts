import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, extname, relative, resolve } from "node:path";
import type { NormalizedLocationOutput } from "./contracts.ts";
import type { EmbeddingManifest } from "../embeddings/contracts.ts";

export type StoragePlanItem = {
  imageId: string;
  locationId: string;
  localPath: string;
  objectPath: string;
  previousUrl: string;
  publicUrl: string;
};

export type StoragePlan = {
  dataset: NormalizedLocationOutput;
  manifest: EmbeddingManifest;
  items: StoragePlanItem[];
};

export function isIdenticalStoredJpeg(bytes: Buffer, stored: { size?: number; contentType?: string; etag?: string }): boolean {
  return stored.size === bytes.length && stored.contentType === "image/jpeg"
    && stored.etag?.replaceAll('"', "") === createHash("md5").update(bytes).digest("hex");
}

function publicObjectUrl(projectUrl: string, bucket: string, objectPath: string): string {
  const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
  return new URL(`/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`, projectUrl).toString();
}

export function buildStoragePlan(
  dataset: NormalizedLocationOutput,
  manifest: EmbeddingManifest,
  manifestPath: string,
  projectUrl: string,
  bucket: string,
  outputDirectory = dirname(manifestPath),
): StoragePlan {
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(bucket)) throw new Error("Storage bucket name is invalid");
  const entriesByUrl = new Map(manifest.items.map((entry) => [entry.image_url, entry]));
  if (entriesByUrl.size !== manifest.items.length) throw new Error("Embedding manifest contains duplicate image URLs");
  const replacementByUrl = new Map<string, string>();
  const items = manifest.items.map((entry) => {
    const extension = extname(entry.image_path).toLowerCase();
    if (extension !== ".jpg" && extension !== ".jpeg") throw new Error(`Storage upload only accepts JPEG: ${entry.image_path}`);
    const objectPath = `${entry.location_id}/${entry.image_id}.jpg`;
    const publicUrl = publicObjectUrl(projectUrl, bucket, objectPath);
    replacementByUrl.set(entry.image_url, publicUrl);
    return {
      imageId: entry.image_id,
      locationId: entry.location_id,
      localPath: resolve(dirname(manifestPath), entry.image_path),
      objectPath,
      previousUrl: entry.image_url,
      publicUrl,
    };
  });

  let replacedImages = 0;
  const remoteDataset = {
    ...dataset,
    locations: dataset.locations.map((location) => ({
      ...location,
      images: location.images.map((image) => {
        const imageUrl = replacementByUrl.get(image.imageUrl);
        if (!imageUrl) throw new Error(`Dataset image is absent from embedding manifest: ${image.imageUrl}`);
        replacedImages += 1;
        return { ...image, imageUrl };
      }),
    })),
  };
  if (replacedImages !== manifest.items.length) {
    throw new Error(`Dataset/manifest image count mismatch: ${replacedImages}/${manifest.items.length}`);
  }
  const localPathByImageId = new Map(items.map((item) => [
    item.imageId,
    relative(outputDirectory, item.localPath).replaceAll("\\", "/"),
  ]));
  const remoteManifest = {
    ...manifest,
    items: manifest.items.map((entry) => ({
      ...entry,
      image_path: localPathByImageId.get(entry.image_id)!,
      image_url: replacementByUrl.get(entry.image_url)!,
    })),
  };
  return { dataset: remoteDataset, manifest: remoteManifest, items };
}

export async function readValidatedJpeg(path: string): Promise<Buffer> {
  const value = await readFile(path);
  if (value.length === 0 || value.length > 5 * 1024 * 1024) throw new Error(`${path} must be between 1 byte and 5 MB`);
  if (value[0] !== 0xff || value[1] !== 0xd8 || value.at(-2) !== 0xff || value.at(-1) !== 0xd9) {
    throw new Error(`${path} is not a complete JPEG`);
  }
  return value;
}
