# Data and image provenance

The ten development locations in `src/domains/locations/fixtures/locations.ts` are invented fixtures. Names, descriptions, addresses, permit details, parking details, and coordinates are for UI development and do not describe real filming locations. The SVG illustrations in `public/images/demo-*.svg` were created for this repository and are covered by the repository MIT license.

The PNG files in `scripts/embeddings/evaluation-images/` are rasterized, cropped, and flipped derivatives of those same project-created SVG illustrations. They are used only for the synthetic CLIP regression evaluation and are also covered by the repository MIT license. They contain no third-party source material.

No FilmKorea or other third-party location database or scraped record is included. Before adding another real source, record its title, owner, source URL, license/permission, attribution requirements, download date, permitted redistribution, and any personal-data review here. If redistribution rights are unclear, do not commit the material.

## Production location images

The production images are 1024-pixel Wikimedia Commons thumbnails collected on 2026-09-29. The ten curated seed locations keep local review copies under `public/locations/`; Wikidata-discovered working files are reproducibly downloaded and ignored by Git. Runtime copies live in the public Supabase Storage `location-images` bucket. They are **not covered by this repository's MIT license**. Each file remains available under its source license, including approved CC0/public-domain declarations. SceneScan made no change beyond Wikimedia's thumbnail resize. The complete human-readable inventory is in [`data/production/IMAGE_LICENSES.md`](data/production/IMAGE_LICENSES.md); author, source dimensions, source SHA-1, downloaded-file SHA-256, original URL, and exact thumbnail URL are preserved in `data/production/image-licenses.json`.

When redistributing an image, retain the author, linked source page, and linked license. Files marked CC BY-SA must keep the same or a compatible license if adapted.

The initial ten locations use the official/public source URL recorded in each entry. The nationwide expansion uses Wikidata CC0 records only when a matching first-level region, address, coordinate, supported place type, and representative Commons image are present. Categories are SceneScan scouting classifications derived from explicit Wikidata types. Permit and parking details are intentionally not inferred: each location tells users to contact the operating organization and parking is left empty until separately verified.

The chosen CLIP model is downloaded on demand from Hugging Face in real AI mode and is not bundled in this repository. Review the model card and its terms before public release.
