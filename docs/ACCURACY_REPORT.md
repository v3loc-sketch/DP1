# Accuracy report: procedural model vs. reference photos

Reference photos: `docs/reference/` (img1 = open box, master for materials; img3 = back view,
master for hinges/seam/corners/lid strip; img2 & img4 = low-res, silhouette only).

## Method

1. **Camera fitting.** For each photo the camera (azimuth, elevation, field of view, distance,
   framing, roll, and for img1 the lid angle) is fitted automatically by maximising the
   silhouette overlap (IoU) between the photo's non-white pixels and the model's silhouette
   (`node model/scripts/pipeline.mjs fit`, results in `model/views.json`).
2. **Side-by-side sheets.** Every pass renders the model from those fitted cameras and builds
   `compare_img1.jpg` / `compare_img3.jpg`: full view plus zoomed crops (latch + loop,
   seam + corner, ribs, pillows, lid border, hinges + stacked rivets, bullnose + glass), and
   `overlay_*.jpg` (50/50 blend) to show misalignment.
3. **Close-ups** (pass 4): `details.jpg` shows hinge, corner/seam, latch closed, latch open,
   lid top and pillows at macro distance. The photos are too small to show these details at
   that scale.

## Silhouette fit (IoU, 1.0 = identical outline)

| Photo | Pass 1 | Pass 4 (final) | Notes |
|---|---|---|---|
| img3 back (master for proportions/hardware) | 0.966 | **0.969** | Free-scale test: best fit at width ×0.987, height ×0.996, so 33 × 10 × 9 cm proportions agree with this photo within ~1.3 %. |
| img1 open | 0.838 | **0.902** | Rose after the lid velvet border was narrowed (see pass 1). The rest is mostly the photo's lid-end perspective and the gap behind the open lid. |
| img4 front (225 px) | 0.922 | 0.927 | Low-res, silhouette only. |
| img2 top (225 px) | 0.840 | 0.911 | Low-res, silhouette only. |

## Pass log: differences found and fixed

**Pass 1** (`docs/comparison/pass1`)
- Lid velvet border too wide. The photo's glass opening is much bigger. I tested borders of
  13.5 / 11 / 9 / 7 / 5 / 3 mm: IoU 0.838 → 0.862 → 0.881 → 0.900 → 0.920 → 0.921.
  **Fixed: 6.5 mm.** This corrects my earlier "12–15 mm" estimate, which counted the lid's
  inner end wall seen in perspective.
- Pillows too low and too flat; dividers too prominent. **Fixed:** the crown now rises
  ~3 mm above the rim with a rounder loaf profile, and the dividers are lower.
- Velvet too light/mint and too smooth. **Fixed:** deeper teal base `#23574a`, less sheen,
  coarser terry pile normal map.
- Ribs too fine and too dark. **Fixed:** pitch 2.6 → 3.1 mm (about 17 ribs on the front, as in
  img1), lighter anodised green, more metallic.
- Latch toggle and loop too small. **Fixed:** plate 17 × 20 mm, bigger lever, 12 mm loop.
- Hinges, rivets and rim lip under-sized. **Fixed:** hinge leaves 10.5 / 8.5 mm with 4 screws,
  rivets 2.6 mm, velvet lip 6.2 mm wide over the rim.
- Hard offset shadow. **Fixed:** light moved overhead.

**Pass 2** (`docs/comparison/pass2`)
- Ribs read as thin dark lines on a flat panel; the photos show half-round ribs with highlights.
  **Fixed:** half-round rib profile in the normal map and baked groove AO.
- Latch still flat. **Fixed:** thicker lever and a raised toggle knuckle; the loop sits in front.
- Pillows still sit below the rim. **Fixed:** they now rise above it (img1).
- Bottom rail thicker than in img3. **Fixed:** 6.5 → 5 mm.
- Exposure lower than the studio photos. **Fixed:** exposure and environment raised.

**Pass 3** (`docs/comparison/pass3`, plus close-ups)
- Back panels far too dark vs img3. The cause was the lighting environment: the photos were
  shot on a white sweep, so the anodised metal reflects a white floor, while the original
  environment had a dark floor. **Fixed:** procedural white studio environment (white floor +
  4 softboxes) and a camera-side fill.
- Velvet speckle too "frosty". **Fixed:** lower albedo contrast and normal strength.

**Pass 4** (`docs/comparison/pass4`): final check after two last fixes:
- The 72-frame sheet showed washed-out end-on frames (grazing reflections on the metal and on
  the glass). **Fixed:** green aluminium metalness 0.72 → 0.6, overhead softbox dimmed.
- The model-viewer test showed milky glass. **Fixed:** switched to alpha-blended glass.

Remaining differences are listed below.

## Component test (headless Chromium, mobile viewport, touch enabled)

- GLB passes the Khronos glTF-Validator: 0 errors, 0 warnings, 2 animations
  (`OpenLid`, `CloseLid`), 37 k triangles, 1.4 MB.
- model-viewer loads it and lists `['OpenLid', 'CloseLid']`. **Tap to open lid** opens the lid
  and holds the open pose; **Close lid** returns it to closed.
- `touch-action="pan-y"` is set, so vertical swipes scroll the page.
- `?mode=images` fallback: dragging changes the frame.

## Detail checklist (final state)

| # | Detail | Result | Evidence / note |
|---|---|---|---|
| 1 | Long narrow case, ~3.3:1, deep base, shallow lid | PASS | img3 IoU 0.969; free-scale fit within 1.3 % |
| 2 | Base ≈ 72 %, lid ≈ 28 % of height | PASS | 6.5 / 2.5 cm; seam lines up in img3 overlay |
| 3 | No feet / nothing on bottom | PASS (not visible in photos) | flat black bottom plate |
| 4 | Matte black aluminium on all 12 edges | PASS | |
| 5 | Rounded vertical corner posts | PASS | `details.jpg` corner |
| 6 | Double black rail at the lid/base seam | PASS | compare_img3 crops |
| 7 | Rivets near the panel corners | PASS | bottom-rail corners on every face |
| 7b | Two stacked round rivets at each end of the seam | PASS | `details.jpg` corner/hinge |
| 8 | Opaque matte dark-green aluminium panels (not glass) | PASS | |
| 9 | Fine horizontal ribs, full length, front/back/ends | PASS | ~17 ribs on the front |
| 10 | Clear glass window, only transparent part | PASS | alpha-blended physical glass (10 % opacity, IOR 1.5); the background shows through pure white, as in img1 |
| 10b | Thick rolled/bullnose black top frame, rounded corners | PASS | `details.jpg` lid top |
| 11 | Lid sides = short green ribbed strip (about 4–6 ribs) | PASS | ~4 ribs visible between bullnose and seam rail |
| 12 | Velvet border inside lid around the glass | PASS (width changed) | 6.5 mm from the silhouette fit, not 12–15 mm |
| 13 | Small black catch plate, lid front rail, centred | PASS | `details.jpg` latch closed |
| 14 | Lid opens to ~100° | PASS | `OpenLid` clip 0→100° over 1.5 s; img1 fit gave ~105–109° |
| 15 | Swing toggle on the base, no keyhole, rectangular wire loop | PASS (simplified) | the lever does not flip up in the animation, only the loop swings (see below) |
| 16 | Two back hinges with screws, ~1/8 of the length from each end | PASS | hinges land on the photo's hinges in the img3 overlay; 4 screws each |
| 17 | Deep teal velvet (#23574a); lighter look from lighting only | PASS | lighter tones come from sheen + white studio, not a different colour |
| 18 | Velvet floor, walls, and lining wrapped over the top rim | PASS | rim lip 6.2 mm |
| 19 | Exactly 6 plush rounded pillows in one row | PASS | |
| 20 | 5 velvet dividers, tops below the pillow crowns | PASS | |
| 21 | Pillows near the seam, below the glass | PASS | crown ~1–3 mm above the rim, ~15 mm clear of the lid's velvet border |

## Known remaining differences (honest list)

- **Dimensions are unverified.** img3 agrees with 33 × 10 × 9 cm within ~1.3 %, but a photo
  can only check *ratios*, never absolute size. Absolute size matters for AR ("view in your
  room"), so please replace `CONFIG.dimensions` with the supplier's numbers and re-export.
- **Latch mechanism is simplified.** img1 shows the toggle lever flipped up and standing out
  from the panel when open. In the model the lever stays flat, and only the wire loop swings
  off the catch and hangs down (to about 55 % of the panel, matching img1 rather than "one
  third"). Closed, the loop goes up over the catch plate. No photo shows the closed latch
  closer than 225 px, so its exact closed look is a guess.
- **Velvet texture** is a procedural terry/pile normal map. Up close it reads finer and more
  uniform than the real towel-like pile in img1. The colour matches; the macro texture is an
  approximation.
- **Rib look.** The ribs are a baked normal map, not real geometry (on purpose, for the 3 MB
  budget). At grazing angles the silhouette edge is straight, where real ribs would show a
  tiny corrugation.
- **Panel tint.** img1 shows darker green panels, img3 greyer and lighter ones (different
  photo setups). The model sits between the two.
- **Glass** is alpha-blended (10 % opacity), not refractive. A first version used
  `KHR_materials_transmission`, but in the model-viewer test it rendered milky white, and
  Android Scene Viewer doesn't support transmission at all, so it was replaced. Reflections are
  correct; refraction through the 2.5 mm pane is not simulated (invisible at this thickness).
- **Dividers in img3** look taller relative to the pillows than in img1. I followed img1, the
  master for the interior.
- **Not visible in any photo:** the bottom (no feet, labels or pads assumed), the inside of the
  hinge knuckles, the screw-head type (domed heads modelled), the lid stop/stay mechanism (none
  modelled), and the exact rivet count on the ends.
- **USDZ** has no lid animation (AR Quick Look shows the closed box). The USDZ is 3.6 MB; the GLB is 1.4 MB.
- **model-viewer uses its own "neutral" lighting**, not the white-studio lighting used for the
  frames and MP4, so the live 3D view is slightly less bright on the panels than the spin images.
