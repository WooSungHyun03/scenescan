# SceneScan brand

SceneScan helps Korean creators compare real places against a visual reference. The identity is a viewfinder containing a simple scene: four open corners and one landscape line. It remains legible at 24 px and uses no camera, map pin, or AI decoration.

Assets: `public/brand/symbol.svg`, `logo-horizontal.svg` (light backgrounds), `logo-dark.svg` (dark backgrounds), `logo-stacked.svg`, and `app-icon.svg`. `src/app/icon.svg` is the browser favicon; `Brand` is the shared accessible header/footer wordmark. Preserve proportions, use clear space of at least one quarter of the symbol, and do not add gradients or shadows. The app icon may crop only its outer background.

The palette is neutral white `#ffffff`, canvas `#f6f7f7`, ink `#182823`, secondary text `#5c6964`, border `#dce3df`, and forest green `#185b4b`. Green identifies the primary action and selected location. Photography remains unfiltered. Surface radius is 8 px; controls are 6 px; shadows are reserved for overlays.

Pretendard Variable 1.3.9 is self-hosted with `next/font/local` and `font-display: swap`. Its SIL Open Font License is included in `public/fonts/OFL.txt`. Font source: https://github.com/orioncactus/pretendard/tree/v1.3.9. Body uses 16 px/1.65, supporting content 14 px/1.6, headings 20–48 px with balanced Korean line breaks. Interactive targets are at least 44 px. Motion is restricted to user-triggered state feedback and respects reduced-motion preferences.

Public copy describes tasks, not implementation: 참고 이미지, 촬영 장소, 검색 결과, 빛의 방향. Mock mode is explicitly identified as a demonstration; missing facts stay unverified. There is no sign-in flow: saved locations are held in the current browser only.

Descriptions without Korean text use neutral Korean guidance in cards and detail summaries. The original text remains accessible in the source disclosure; neither database content nor translations are fabricated.

The global error screen offers an explicit full-page reload for stale deployment chunks and retains the existing retry behavior for application errors. Reloading preserves browser-stored saved locations but does not persist an uploaded reference photo.
