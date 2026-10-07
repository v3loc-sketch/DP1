// Procedural textures, generated on a canvas and baked into the GLB as images.
// Everything is deterministic (seeded) so re-exports are identical.
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Height field (Float32Array, w*h, tiling) -> tangent-space normal map canvas.
function heightToNormalCanvas(height, w, h, strength) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const at = (x, y) => height[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * strength;
      // canvas rows go downwards, texture v goes upwards
      const dy = (at(x, y - 1) - at(x, y + 1)) * 0.5 * strength;
      let nx = -dx, ny = -dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 4;
      img.data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      img.data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      img.data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function toTexture(c, { srgb = false, mime = 'image/png', name } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.name = name || '';
  t.userData.mimeType = mime;
  t.needsUpdate = true;
  return t;
}

// One rib period in V (the texture repeats once per rib; UVs are scaled so
// that 1 V unit == CONFIG.ribs.pitch). Profile: rounded raised rib with a
// narrow dark groove between ribs, as seen on the extruded panels.
function ribHeight(v) {
  const groove = 0.12; // fraction of the period taken by the groove
  const d = Math.min(v, 1 - v); // distance to groove centre (at v = 0)
  if (d < groove / 2) return 0.1;
  // half-round rib between two grooves
  const r = (v - groove / 2) / (1 - groove) * 2 - 1; // -1..1 across the rib
  return 0.1 + 0.9 * Math.sqrt(Math.max(0, 1 - r * r));
}

export function makeRibTextures() {
  const w = 4, h = 128;
  const height = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const v = 1 - (y + 0.5) / h;
    for (let x = 0; x < w; x++) height[y * w + x] = ribHeight(v);
  }
  const normal = toTexture(heightToNormalCanvas(height, w, h, 14), { name: 'rib_normal' });

  // Baked ambient occlusion in the grooves, multiplied into the base colour.
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    const v = 1 - (y + 0.5) / h;
    const hh = ribHeight(v);
    const ao = 0.35 + 0.65 * Math.pow(Math.min(hh, 1), 0.8);
    const g = Math.round(255 * ao);
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(0, y, w, 1);
  }
  const color = toTexture(c, { srgb: true, name: 'rib_ao_color' });
  return { normal, color };
}

// Fine terry/velvet pile: dense small loops arranged in faint rows, which is
// what gives the lining its "towel" look in image 1. Tiles seamlessly.
export function makeVelvetTextures(size = 256, seed = 7) {
  const rand = rng(seed);
  const w = size, h = size;
  const height = new Float32Array(w * h);
  const loops = size * size * 0.09;
  for (let n = 0; n < loops; n++) {
    // rows every ~4px give the subtle ribbed weave of the pillows
    const row = Math.floor(rand() * (h / 4)) * 4 + rand() * 1.5;
    const cx = rand() * w;
    const cy = row;
    const r = 0.9 + rand() * 1.3;
    const amp = 0.5 + rand() * 0.5;
    const ri = Math.ceil(r + 1);
    for (let oy = -ri; oy <= ri; oy++) {
      for (let ox = -ri; ox <= ri; ox++) {
        const x = Math.floor(cx) + ox, y = Math.floor(cy) + oy;
        const d = Math.hypot(x - cx, (y - cy) * 1.3) / r;
        if (d > 1) continue;
        const idx = ((y + h) % h) * w + ((x + w) % w);
        height[idx] += amp * (1 - d * d);
      }
    }
  }
  let max = 0;
  for (let i = 0; i < height.length; i++) max = Math.max(max, height[i]);
  for (let i = 0; i < height.length; i++) height[i] /= max;

  const normal = toTexture(heightToNormalCanvas(height, w, h, 3.6), { name: 'velvet_normal' });

  // Albedo: tips of the pile slightly lighter, valleys darker.
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const k = 0.7 + 0.38 * height[i] + (rand() - 0.5) * 0.06;
    const g = Math.max(0, Math.min(255, Math.round(232 * k)));
    img.data[i * 4] = g;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = g;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const color = toTexture(c, { srgb: true, mime: 'image/jpeg', name: 'velvet_color' });
  return { normal, color };
}
