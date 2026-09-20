import { readFile, writeFile } from "node:fs/promises";
import { pipeline, RawImage } from "@huggingface/transformers";

type ManifestEntry = { locationId: string; imagePath: string; imageUrl: string };

async function main() {
  const [manifestPath, outputPath] = process.argv.slice(2);
  if (!manifestPath || !outputPath) throw new Error("Usage: pnpm embeddings:prepare <manifest.json> <output.json>");
  const entries = JSON.parse(await readFile(manifestPath, "utf8")) as ManifestEntry[];
  if (!Array.isArray(entries)) throw new Error("Manifest must be an array");
  const extractor = await pipeline("image-feature-extraction", "Xenova/clip-vit-base-patch32");
  const output = [];
  for (const entry of entries) {
    const image = await RawImage.fromBlob(new Blob([await readFile(entry.imagePath)]));
    const features = await extractor(image);
    const embedding = Array.from(features.data, Number);
    if (embedding.length !== 512) throw new Error(`Unexpected embedding size for ${entry.imagePath}: ${embedding.length}`);
    output.push({ locationId: entry.locationId, imageUrl: entry.imageUrl, embedding });
  }
  await writeFile(outputPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${output.length} embeddings to ${outputPath}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
