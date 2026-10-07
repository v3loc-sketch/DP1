# 6-Slot Watch Box – free 360° / 3D / AR product viewer

Everything here is generated **from code**: a procedural Three.js model, procedural PBR textures,
and headless-Chromium rendering. No AI image/video generation and no paid services are used.

| Deliverable | File(s) |
|---|---|
| Procedural model (config, textures, geometry) | `model/src/config.js`, `model/src/textures.js`, `model/src/watchbox.js` |
| GLB (1.4 MB, closed lid, `OpenLid` + `CloseLid` clips) | `public/models/watch-box.glb` |
| USDZ for iPhone/iPad AR Quick Look | `public/models/watch-box.usdz` |
| 72-frame spin, 5° steps, 1500×1500 WebP, white bg | `public/spin/frame_000.webp` … `frame_071.webp` |
| Poster image | `public/spin/poster.webp` |
| Seamless-loop MP4 (+ VP9 WebM copy) | `public/spin/spin.mp4`, `public/spin/spin.webm` |
| React component | `src/components/ProductSpin360/` |
| Shopify Storefront loader | `src/lib/shopifyModel3d.ts` |
| **Offline preview page**: double-click `preview/index.html`, no install or server needed | `preview/` (rebuild with `node model/scripts/build-preview.mjs`) |
| Photo-vs-render comparisons (4 passes) | `docs/comparison/pass1` … `pass4`, report in `docs/ACCURACY_REPORT.md` |

---

## 1. Changing dimensions / re-generating assets

All measurements are in **one object**: `model/src/config.js` → `CONFIG.dimensions`
(metres; currently the *unverified* estimate 33 × 10 × 9 cm, base 6.5 cm, lid 2.5 cm).
Every rail, hinge, pillow and rivet is derived from it.

```bash
npm install
npm run model:export     # GLB + USDZ           -> public/models/
npm run model:frames     # 72 WebP frames+poster -> public/spin/
npm run model:video      # spin.mp4              -> public/spin/  (needs ffmpeg)
npm run model:all        # all three
node model/scripts/pipeline.mjs fit                       # re-fit cameras to the photos
node model/scripts/pipeline.mjs compare docs/comparison/passN details docs/comparison/passN
```

The pipeline starts a Vite dev server, opens `model/harness.html` in headless Chromium
(software WebGL works fine), and writes the files. Set `CHROMIUM_PATH` if Chromium isn't at
`/opt/pw-browsers/chromium` (any Chrome/Chromium works, or run `npx playwright install chromium`
and set `CHROMIUM_PATH` to what it prints).

Preview locally: `npm run dev` → http://localhost:5173 (add `?mode=images` to test the
image-sequence fallback).

---

## 2. Moving the viewer into your Lovable project

1. **Install the one dependency**: in Lovable ask *"add the npm package @google/model-viewer"*
   (or `npm i @google/model-viewer` if you sync the repo to GitHub and work locally).
2. **Copy these folders/files** into the same paths in your Lovable project (via the GitHub
   sync, or paste each file into Lovable's code editor):
   - `src/components/ProductSpin360/` (4 files: `ProductSpin360.tsx`, `ImageSequenceSpin.tsx`,
     `model-viewer.d.ts`, `index.ts`)
   - `src/lib/shopifyModel3d.ts` (only if you load models from Shopify, see §3)
   - `public/models/` and `public/spin/` (the GLB/USDZ and the 72 frames + poster + MP4)
3. **Use it** on your product page:

```tsx
import { ProductSpin360, frameUrls } from '@/components/ProductSpin360';

<ProductSpin360
  alt="6-slot watch box, green aluminium with glass lid"
  src="/models/watch-box.glb"
  iosSrc="/models/watch-box.usdz"
  poster="/spin/poster.webp"
  frames={frameUrls('/spin/frame_', 72)}   // fallback (no WebGL / model error)
/>
```

Props: `mode` (`'auto' | '3d' | 'images'`), `autoRotate`, `openLabel`, `closeLabel`,
`arLabel`, `className`, `style`. The box is square (`aspect-ratio: 1/1`); pass
`style={{ aspectRatio: '4 / 3' }}` or a Tailwind `className` to change it.

What it does:
- drag to rotate, slow auto-rotate (stops while the user interacts), pinch / scroll zoom;
- `touch-action="pan-y"`: horizontal drags rotate, vertical swipes still scroll the page;
- **Tap to open lid** plays the GLB's `OpenLid` clip (0→100° in 1.5 s; the wire loop swings off
  the catch first), then the button becomes **Close lid** (`CloseLid` clip);
- poster image and progress bar while loading; AR button ("View in your room") on supported
  phones: Scene Viewer on Android, Quick Look on iOS using the USDZ;
- automatic fallback to the 72-frame drag-to-spin viewer if WebGL is unavailable or the model
  fails to load. Arrow keys also rotate it.

To use the MP4 somewhere else (e.g. a collection page or social):
`<video src="/spin/spin.mp4" autoPlay muted loop playsInline poster="/spin/poster.webp" />`.

---

## 3. Loading the GLB from Shopify product media (Model3d)

1. Shopify admin → **Products → your watch box → Media → Add media** → upload
   `public/models/watch-box.glb`. Shopify stores it as a **3D model** (`Model3d`) and also
   creates a USDZ version for iOS automatically.
2. Get a **Storefront API** public access token (Shopify admin → Settings → Apps and sales
   channels → Develop apps → your app → Storefront API, with the
   `unauthenticated_read_product_listings` scope; or the Headless channel). If your Lovable
   project already has the Shopify integration connected, reuse its domain and token.
3. Add to your Lovable project's environment (`.env`):
   ```
   VITE_SHOPIFY_STORE_DOMAIN=your-shop.myshopify.com
   VITE_SHOPIFY_STOREFRONT_TOKEN=xxxxxxxxxxxxxxxx   # public storefront token, safe for the browser
   VITE_SHOPIFY_API_VERSION=2026-07
   ```
4. Use the hook:

```tsx
import { ProductSpin360, frameUrls } from '@/components/ProductSpin360';
import { useProductModel } from '@/lib/shopifyModel3d';

export function ProductMedia({ handle }: { handle: string }) {
  const { model } = useProductModel(handle);
  return (
    <ProductSpin360
      alt={model?.alt ?? 'Watch box'}
      src={model?.glb ?? '/models/watch-box.glb'}       // local file until Shopify answers
      iosSrc={model?.usdz ?? '/models/watch-box.usdz'}
      poster={model?.poster ?? '/spin/poster.webp'}
      frames={frameUrls('/spin/frame_', 72)}
    />
  );
}
```

The query it runs (validated against the Storefront API schema):

```graphql
query ProductModel3d($handle: String!) {
  product(handle: $handle) {
    media(first: 20) {
      nodes {
        mediaContentType
        alt
        previewImage { url width height }
        ... on Model3d { sources { url mimeType format filesize } }
      }
    }
  }
}
```

Note: keep the `OpenLid`/`CloseLid` clip names. Shopify serves the GLB you upload as-is, so the
lid animation keeps working. The 72 frames are not Shopify media, so serve them from `public/`
(or upload them to Shopify **Files** and pass the CDN URLs to `frames`).

---

## 4. How accuracy was checked

See `docs/ACCURACY_REPORT.md`. Camera poses for each reference photo were **fitted
automatically** by maximising silhouette overlap (IoU) between the photo and the render. Every
pass then renders the model from exactly those poses and builds side-by-side sheets with zoomed
crops (`compare_img1.jpg`, `compare_img3.jpg`) plus close-up hardware renders (`details.jpg`).
