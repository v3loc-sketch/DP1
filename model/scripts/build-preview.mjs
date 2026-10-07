// Assembles preview/: a self-contained folder whose index.html works when
// double-clicked (file://), with no server and no network access.
//  - model-viewer is the UMD build loaded as a classic <script> (Chrome blocks
//    ES-module scripts on file://)
//  - the GLB is embedded as a base64 data URI in a classic script
//  - images / video are plain <img>/<video> sources, which file:// allows
// Usage: node model/scripts/build-preview.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'preview');
const A = path.join(OUT, 'assets');

const copy = (from, to) => {
  fs.mkdirSync(path.dirname(path.join(A, to)), { recursive: true });
  fs.copyFileSync(path.join(ROOT, from), path.join(A, to));
};

fs.rmSync(A, { recursive: true, force: true });
fs.mkdirSync(A, { recursive: true });

copy('node_modules/@google/model-viewer/dist/model-viewer-umd.min.js', 'model-viewer-umd.min.js');
copy('node_modules/@google/model-viewer/LICENSE', 'model-viewer-LICENSE.txt');

const glb = fs.readFileSync(path.join(ROOT, 'public/models/watch-box.glb'));
fs.writeFileSync(
  path.join(A, 'watch-box-glb.js'),
  `// watch-box.glb (${glb.length} bytes) as a data URI, so nothing is fetched over file://\n` +
    `window.WATCH_BOX_GLB = "data:model/gltf-binary;base64,${glb.toString('base64')}";\n`,
);

for (const f of ['img1_open.webp', 'img2_closed_top.png', 'img3_back.png', 'img4_front.png']) {
  copy(`docs/reference/${f}`, `reference/${f}`);
}
for (const n of ['img1', 'img3', 'img2', 'img4']) {
  copy(`docs/comparison/pass4/compare_${n}.jpg`, `comparison/compare_${n}.jpg`);
}
copy('docs/comparison/pass4/details.jpg', 'comparison/details.jpg');

for (let i = 0; i < 72; i++) {
  const f = `frame_${String(i).padStart(3, '0')}.webp`;
  copy(`public/spin/${f}`, `spin/${f}`);
}
copy('public/spin/poster.webp', 'spin/poster.webp');
copy('public/spin/spin.mp4', 'spin/spin.mp4');
copy('public/spin/spin.webm', 'spin/spin.webm');

let total = 0;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) walk(p); else total += fs.statSync(p).size;
});
walk(OUT);
console.log(`preview/ ready: ${(total / 1024 / 1024).toFixed(1)} MB`);
