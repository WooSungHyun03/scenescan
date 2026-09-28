# Data and image provenance

The ten development locations in `src/domains/locations/fixtures/locations.ts` are invented fixtures. Names, descriptions, addresses, permit details, parking details, and coordinates are for UI development and do not describe real filming locations. The SVG illustrations in `public/images/demo-*.svg` were created for this repository and are covered by the repository MIT license.

The PNG files in `scripts/embeddings/evaluation-images/` are rasterized, cropped, and flipped derivatives of those same project-created SVG illustrations. They are used only for the synthetic CLIP regression evaluation and are also covered by the repository MIT license. They contain no third-party source material.

No FilmKorea or other third-party location database, photograph, or scraped record is included. Before adding a real source, record its title, owner, source URL, license/permission, attribution requirements, download date, permitted redistribution, and any personal-data review here. If redistribution rights are unclear, do not commit the material.

The chosen CLIP model is downloaded on demand from Hugging Face in real AI mode and is not bundled in this repository. Review the model card and its terms before public release.
