# Synthetic CLIP evaluation images

These PNGs are derived from the project-created `public/images/demo-*.svg` fixtures and remain covered by the repository MIT license. No third-party image or scraped data is included.

- `candidates/`: the full synthetic illustration, rasterized to 384×288.
- `queries/`: an 80×80 center crop of the SVG renderer's 100×100 source frame, resized to 384×288, then horizontally flipped.

The transform removes the exact pixel match while preserving the source illustration's main palette and geometry. The set checks real CLIP inference, cosine scoring, and ranking regression across the four fixture categories. It is intentionally not evidence of production photographic relevance.

The assets were generated with FFmpeg using these filters:

```bash
ffmpeg -i public/images/demo-01.svg -vf "scale=384:288" -frames:v 1 candidates/demo-01.png
ffmpeg -i public/images/demo-01.svg -vf "crop=80:80:10:10,scale=384:288,hflip" -frames:v 1 queries/demo-01-query.png
```
