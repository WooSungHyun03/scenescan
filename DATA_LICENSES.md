# Data and image provenance

The ten development locations in `src/domains/locations/fixtures/locations.ts` are invented fixtures. Names, descriptions, addresses, permit details, parking details, and coordinates are for UI development and do not describe real filming locations. The SVG illustrations in `public/images/demo-*.svg` were created for this repository and are covered by the repository MIT license.

The PNG files in `scripts/embeddings/evaluation-images/` are rasterized, cropped, and flipped derivatives of those same project-created SVG illustrations. They are used only for the synthetic CLIP regression evaluation and are also covered by the repository MIT license. They contain no third-party source material.

No FilmKorea or other third-party location database or scraped record is included. Before adding another real source, record its title, owner, source URL, license/permission, attribution requirements, download date, permitted redistribution, and any personal-data review here. If redistribution rights are unclear, do not commit the material.

## Production location images

The production images are 1024-pixel Wikimedia Commons thumbnails collected on 2026-09-29. The ten curated seed locations keep local review copies under `public/locations/`; Wikidata-discovered working files are reproducibly downloaded and ignored by Git. Runtime copies live in the public Supabase Storage `location-images` bucket. They are **not covered by this repository's MIT license**. Each file remains available under its source license, including approved CC0/public-domain declarations. SceneScan made no change beyond Wikimedia's thumbnail resize. The complete human-readable inventory is in [`data/production/IMAGE_LICENSES.md`](data/production/IMAGE_LICENSES.md); author, source dimensions, source SHA-1, downloaded-file SHA-256, original URL, and exact thumbnail URL are preserved in `data/production/image-licenses.json`.

When redistributing an image, retain the author, linked source page, and linked license. Files marked CC BY-SA must keep the same or a compatible license if adapted.

The initial ten locations use the official/public source URL recorded in each entry. The nationwide expansion uses Wikidata CC0 records only when a matching first-level region, address, coordinate, supported place type, and representative Commons image are present. Categories are SceneScan scouting classifications derived from explicit Wikidata types. Permit and parking details are intentionally not inferred: each location tells users to contact the operating organization and parking is left empty until separately verified.

## Busan administrative district (구/군) boundaries

`data/production/boundaries/busan-admdong-2026-07-01.geojson` is a Busan-only subset (206 administrative-dong features across all 16 구/군) of `vuski/admdongkor`'s `ver20260701/HangJeongDong_ver20260701.geojson`, filtered down from the nationwide 34.6MB original by `sido === "26"` (Busan's code) and trimmed to only the `adm_nm`/`sggnm`/`geometry` properties this project actually uses. No key, paid API, or registration was needed -- it is a plain file download from a public GitHub repository.

- **Source**: [`vuski/admdongkor`](https://github.com/vuski/admdongkor), which itself derives the boundaries from Statistics Korea's 통계지리정보서비스 (SGIS, https://sgis.kostat.go.kr).
- **Reference date**: `ver20260701` (2026-07-01), the repository's most recent version folder as of this filtering.
- **License**: CC BY 4.0 for the repository's own processing (`LICENSE-DATA`); the upstream SGIS boundaries carry a persistent Korea Open Government License (KOGL) Type 1 attribution requirement that survives modification. Required attribution, preserved here and reproduced wherever this file is used for a published district judgement:
  > 본 데이터는 통계청 통계지리정보서비스(SGIS, https://sgis.kostat.go.kr)에서 공공누리 제1유형으로 개방한 행정동 경계를 가공한 것이며(가공: vuski/admdongkor, https://github.com/vuski/admdongkor), CC BY 4.0으로 배포됩니다.
- **Redistribution**: permitted with attribution, so the filtered subset is committed directly in this repository rather than only documenting a download step.
- **Used by**: `scripts/data/busan-boundary.ts` (point-in-polygon district judgement + near-boundary/outside-Busan detection), consumed only from this local file -- no network call, no API key.

The chosen CLIP model is downloaded on demand from Hugging Face in real AI mode and is not bundled in this repository. Review the model card and its terms before public release.
