# Data and image provenance

The ten development locations in `src/domains/locations/fixtures/locations.ts` are invented fixtures. Names, descriptions, addresses, permit details, parking details, and coordinates are for UI development and do not describe real filming locations. The SVG illustrations in `public/images/demo-*.svg` were created for this repository and are covered by the repository MIT license.

The PNG files in `scripts/embeddings/evaluation-images/` are rasterized, cropped, and flipped derivatives of those same project-created SVG illustrations. They are used only for the synthetic CLIP regression evaluation and are also covered by the repository MIT license. They contain no third-party source material.

No FilmKorea or other third-party location database or scraped record is included. Before adding another real source, record its title, owner, source URL, license/permission, attribution requirements, download date, permitted redistribution, and any personal-data review here. If redistribution rights are unclear, do not commit the material.

## Production location images

The files under `public/locations/` are 1280-pixel Wikimedia Commons thumbnails collected on 2026-09-29. They are **not covered by this repository's MIT license**. Each file remains available under the license in the table below. SceneScan made no change beyond Wikimedia's thumbnail resize. Author, source dimensions, source SHA-1, downloaded-file SHA-256, original URL, and exact thumbnail URL are preserved in `data/production/image-licenses.json`.

When redistributing an image, retain the author, linked source page, and linked license. Files marked CC BY-SA must keep the same or a compatible license if adapted.

| Local file / location | Author | License | Wikimedia Commons source |
| --- | --- | --- | --- |
| `ddp-01.jpg` / 동대문디자인플라자 | Eugene Lim | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [source](https://commons.wikimedia.org/wiki/File:Dongdaemun_Design_Plaza_at_night,_Seoul,_Korea.jpg) |
| `ddp-02.jpg` / 동대문디자인플라자 | Dwxn | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [source](https://commons.wikimedia.org/wiki/File:20240601_144028_Dongdaemun_Design_Plaza,_Seoul_08.jpg) |
| `oil-tank-culture-park-01.jpg` / 문화비축기지 | Mvcervi | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [source](https://commons.wikimedia.org/wiki/File:Oil-tank-culture-park.jpg) |
| `oil-tank-culture-park-02.jpg` / 문화비축기지 | 베르니사주 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) | [source](https://commons.wikimedia.org/wiki/File:%EB%AC%B8%ED%99%94%EB%B9%84%EC%B6%95%EA%B8%B0%EC%A7%80_T6.jpg) |
| `seonyudo-park-01.jpg` / 선유도공원 | letsputphotographsontheinternet | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [source](https://commons.wikimedia.org/wiki/File:Seoul_Seonyudo_Park.jpg) |
| `seonyudo-park-02.jpg` / 선유도공원 | Nesnad | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) | [source](https://commons.wikimedia.org/wiki/File:Seonyudo_Park_-_historical_-_2005_June_6_various_-_03.jpg) |
| `incheon-chinatown-01.jpg` / 인천 차이나타운 | Mobius6 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [source](https://commons.wikimedia.org/wiki/File:Chinatown,_incheon_20230430_002.jpg) |
| `incheon-chinatown-02.jpg` / 인천 차이나타운 | Mobius6 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [source](https://commons.wikimedia.org/wiki/File:Chinatown,_incheon_20230430_003.jpg) |
| `songdo-central-park-01.jpg` / 송도 센트럴파크 | Ken Eckert | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [source](https://commons.wikimedia.org/wiki/File:Songdo_Convensia_and_Central_Park_View.jpg) |
| `songdo-central-park-02.jpg` / 송도 센트럴파크 | Raccoon Dog | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [source](https://commons.wikimedia.org/wiki/File:Songdo_Central_Park_at_night.jpg) |
| `gamcheon-culture-village-01.jpg` / 감천문화마을 | Basile Morin | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [source](https://commons.wikimedia.org/wiki/File:Colorful_houses_in_Gamcheon_Culture_Village_at_sunset_in_Busan_South_Korea.jpg) |
| `gamcheon-culture-village-02.jpg` / 감천문화마을 | Bernard Gagnon | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [source](https://commons.wikimedia.org/wiki/File:Gamcheon_Culture_Village.jpg) |
| `busan-cinema-center-01.jpg` / 영화의전당 | 399scout | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [source](https://commons.wikimedia.org/wiki/File:Busan_Cinema_Center.jpg) |
| `busan-cinema-center-02.jpg` / 영화의전당 | 밥풀떼기 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [source](https://commons.wikimedia.org/wiki/File:Busan_Cinema_Center_at_BIFF_2020_-_09.jpg) |
| `suwon-hwaseong-01.jpg` / 수원화성 | Bernard Gagnon | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [source](https://commons.wikimedia.org/wiki/File:Hwaseong_Fortress_01.jpg) |
| `suwon-hwaseong-02.jpg` / 수원화성 | Bernard Gagnon | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [source](https://commons.wikimedia.org/wiki/File:Hwaseong_Fortress_03.jpg) |
| `gwangmyeong-cave-01.jpg` / 광명동굴 | Jjw | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [source](https://commons.wikimedia.org/wiki/File:20230902_Gwangmyeong_Cave_003.jpg) |
| `gwangmyeong-cave-02.jpg` / 광명동굴 | Jjw | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [source](https://commons.wikimedia.org/wiki/File:20230902_Gwangmyeong_Cave_004.jpg) |
| `starfield-library-01.jpg` / 별마당도서관 | Sgroey | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [source](https://commons.wikimedia.org/wiki/File:Starfield_library_1.jpg) |
| `starfield-library-02.jpg` / 별마당도서관 | Sgroey | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [source](https://commons.wikimedia.org/wiki/File:Starfield_library_2.jpg) |

The factual location fields in `data/production/locations.json` were checked against the official/public source URL recorded in each entry. Categories and short descriptions are SceneScan scouting classifications, not statements copied from those sources. Permit and parking details are intentionally not inferred: each location tells users to contact the operating organization and parking is left empty until separately verified.

The chosen CLIP model is downloaded on demand from Hugging Face in real AI mode and is not bundled in this repository. Review the model card and its terms before public release.
