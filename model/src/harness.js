// Browser-side harness driven by model/scripts/pipeline.mjs (Playwright).
// Exposes window.app: rendering, silhouette pose-fitting, GLB/USDZ export.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js';
import { buildWatchBox } from './watchbox.js';
import { CONFIG } from './config.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#ffffff');
const pmrem = new THREE.PMREMGenerator(renderer);
// White photo-studio environment: white sweep floor + softboxes, so the
// anodised panels pick up the same bright reflections as in the photos.
function studioEnvironment() {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.62, 0.62, 0.62), side: THREE.BackSide }));
  room.position.y = 2.5;
  env.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.95, 0.95, 0.95) }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.4;
  env.add(floor);
  const box = (w, h, pos, look, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(...look);
    env.add(m);
  };
  box(4, 4, [0, 5.4, 0], [0, 0, 0], 3); // overhead softbox
  box(3, 2, [-3.5, 2, 3], [0, 0, 0], 2.6); // front-left key
  box(2.5, 2, [3.5, 1.6, 2.5], [0, 0, 0], 1.8); // front-right fill
  box(3, 2, [0, 2, -4.5], [0, 0, 0], 1.6); // rim from behind
  return env;
}
scene.environment = pmrem.fromScene(studioEnvironment(), 0.03).texture;
scene.environmentIntensity = 1.15;

const key = new THREE.DirectionalLight('#ffffff', 1.6);
key.position.set(-0.12, 1.0, 0.22);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = key.shadow.camera.bottom = -0.35;
key.shadow.camera.right = key.shadow.camera.top = 0.35;
key.shadow.camera.near = 0.1;
key.shadow.camera.far = 2;
key.shadow.radius = 18;
key.shadow.blurSamples = 25;
key.shadow.bias = -0.0005;
scene.add(key);
const fill = new THREE.DirectionalLight('#ffffff', 0.45);
fill.position.set(0.6, 0.4, -0.3);
scene.add(fill);
// soft light from the camera side, like a photo studio's front softbox
const head = new THREE.DirectionalLight('#ffffff', 0.9);
scene.add(head);
scene.add(head.target);

// Soft contact shadow: a blurred rounded footprint baked to a canvas texture
// (deterministic and identical in every frame of the spin).
function contactShadowTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');
  ctx.filter = 'blur(26px)';
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.roundRect(170, 160, 684, 192, 30);
  ctx.fill();
  ctx.filter = 'blur(6px)';
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.roundRect(206, 196, 612, 120, 10);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const { length: L0, width: W0 } = CONFIG.dimensions;
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(L0 * 1024 / 612, W0 * 512 / 120),
  new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false, toneMapped: false }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0.0002;

let box = buildWatchBox(CONFIG);
const turntable = new THREE.Group();
turntable.add(box.root);
turntable.add(ground);
scene.add(turntable);
const totalH = CONFIG.dimensions.baseHeight + CONFIG.dimensions.lidHeight;

const camera = new THREE.PerspectiveCamera(20, 1, 0.01, 10);

function applyView(v, w, h) {
  const t = v.target ? new THREE.Vector3(...v.target) : new THREE.Vector3(0, totalH / 2, 0);
  const az = THREE.MathUtils.degToRad(v.az), el = THREE.MathUtils.degToRad(v.el);
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  camera.fov = v.fov;
  camera.aspect = w / h;
  // `size` (half-height of the view at the target) keeps framing stable while fov changes
  const dist = v.size ? v.size / Math.tan(THREE.MathUtils.degToRad(v.fov / 2)) : v.dist;
  camera.position.copy(t).addScaledVector(dir, dist);
  camera.up.set(0, 1, 0);
  camera.lookAt(t);
  camera.updateMatrixWorld();
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  camera.position.addScaledVector(right, -(v.panX || 0)).addScaledVector(up, -(v.panY || 0));
  camera.rotateZ(THREE.MathUtils.degToRad(v.roll || 0));
  head.position.copy(camera.position).add(new THREE.Vector3(0, 0.3, 0));
  head.target.position.copy(t);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  box.root.scale.set(1, v.sy || 1, v.sz || 1);
}

function setState({ lid = 0, loop = null, spin = 0 } = {}) {
  box.setLid(lid);
  box.setLoop(loop ?? (lid > 0.5 ? 1 : 0));
  turntable.rotation.y = THREE.MathUtils.degToRad(spin);
}

function render({ w = 800, h = 800, view, lid = 0, loop = null, spin = 0, format = 'image/png', quality = 0.92, groundShadow = true }) {
  renderer.setSize(w, h, false);
  applyView(view, w, h);
  setState({ lid, loop, spin });
  ground.visible = groundShadow;
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL(format, quality);
}

// ---------------- silhouette fitting
const silMat = new THREE.MeshBasicMaterial({ color: '#000000', side: THREE.DoubleSide });
const rt = { target: null, w: 0, h: 0 };
function silhouette(w, h, view, lid) {
  if (!rt.target || rt.w !== w || rt.h !== h) {
    rt.target?.dispose();
    rt.target = new THREE.WebGLRenderTarget(w, h, { samples: 0 });
    rt.w = w; rt.h = h;
  }
  applyView(view, w, h);
  setState({ lid });
  const hidden = [];
  box.root.traverse((o) => { if (o.isMesh && o.material.name === 'Glass') { o.visible = false; hidden.push(o); } });
  ground.visible = false;
  const bg = scene.background;
  scene.background = new THREE.Color('#ffffff');
  scene.overrideMaterial = silMat;
  const tm = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = false;
  renderer.setRenderTarget(rt.target);
  renderer.render(scene, camera);
  const buf = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(rt.target, 0, 0, w, h, buf);
  renderer.setRenderTarget(null);
  renderer.toneMapping = tm;
  renderer.shadowMap.enabled = true;
  scene.overrideMaterial = null;
  scene.background = bg;
  hidden.forEach((o) => (o.visible = true));
  ground.visible = true;
  // flip Y so row 0 = top, like the reference image
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = buf[((h - 1 - y) * w + x) * 4] < 128 ? 1 : 0;
  return m;
}

function iou(a, b, ignore) {
  let inter = 0, uni = 0;
  for (let i = 0; i < a.length; i++) {
    if (ignore && ignore[i]) continue;
    const x = a[i], y = b[i];
    if (x & y) inter++;
    if (x | y) uni++;
  }
  return uni ? inter / uni : 0;
}

function decodeMask(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function fit({ mask, ignore, w, h, view, steps, iterations = 400, restarts = 0, spread = {} }) {
  const ref = decodeMask(mask);
  const ign = ignore ? decodeMask(ignore) : null;
  const toSize = (v) => {
    const o = { ...v };
    if (o.size == null) o.size = o.dist * Math.tan(THREE.MathUtils.degToRad(o.fov / 2));
    delete o.dist;
    return o;
  };
  const score = (vv) => (vv.fov < 4 || vv.fov > 60 ? -1 : iou(silhouette(w, h, vv, vv.lid || 0), ref, ign));
  let evals = 0;
  function descend(start) {
    const v = { ...start };
    const st = { ...steps };
    if (st.dist) { st.size = st.dist * 0.18; delete st.dist; }
    let best = score(v); evals++;
    let local = 0;
    while (local < iterations) {
      let improved = false;
      for (const k of Object.keys(st)) {
        for (const sgn of [1, -1]) {
          const c = { ...v, [k]: v[k] + sgn * st[k] };
          const s = score(c); evals++; local++;
          if (s > best) { best = s; Object.assign(v, c); improved = true; break; }
        }
      }
      if (!improved) {
        let tiny = true;
        for (const k of Object.keys(st)) { st[k] *= 0.5; if (st[k] > (steps[k] ?? steps.dist * 0.18) / 64) tiny = false; }
        if (tiny) break;
      }
    }
    return { v, best };
  }
  const base = toSize(view);
  // coarse random search around the start, then refine the best few
  const cands = [{ v: base, s: score(base) }];
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < restarts; i++) {
    const c = { ...base };
    for (const [k, r] of Object.entries(spread)) c[k] = base[k] + rnd() * r;
    cands.push({ v: c, s: score(c) }); evals++;
  }
  cands.sort((a, b) => b.s - a.s);
  let bestRes = null;
  for (const c of cands.slice(0, restarts ? 4 : 1)) {
    const r = descend(c.v);
    if (!bestRes || r.best > bestRes.best) bestRes = r;
  }
  const out = { ...bestRes.v };
  out.dist = out.size / Math.tan(THREE.MathUtils.degToRad(out.fov / 2));
  delete out.size;
  return { view: out, iou: bestRes.best, evals };
}

function silhouetteDataURL({ w, h, view }) {
  const m = silhouette(w, h, view, view.lid || 0);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < m.length; i++) {
    const g = m[i] ? 0 : 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

// ---------------- export
function toB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function exportGLB() {
  const fresh = buildWatchBox(CONFIG);
  fresh.setLid(0);
  fresh.setLoop(0);
  const exporter = new GLTFExporter();
  const glb = await exporter.parseAsync(fresh.root, {
    binary: true,
    animations: fresh.clips,
    onlyVisible: true,
    maxTextureSize: 1024,
  });
  return toB64(glb);
}

async function exportUSDZ() {
  const fresh = buildWatchBox(CONFIG, { forUSDZ: true });
  fresh.setLid(0);
  fresh.setLoop(0);
  const holder = new THREE.Scene();
  holder.add(fresh.root);
  const exporter = new USDZExporter();
  const data = await exporter.parseAsync(holder, {
    quickLookCompatible: true,
    ar: { anchoring: { type: 'plane' }, planeAnchoring: { alignment: 'horizontal' } },
  });
  return toB64(data);
}

function stats() {
  let tris = 0, meshes = 0;
  box.root.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return { tris, meshes, info: { loopLen: box.info.loopLen, slot: box.info.slot } };
}

// Binary mask of a reference photo (1 = product, 0 = white background).
async function refMask({ url, w, h, threshold = 238, ignoreRects = [] }) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const m = new Uint8Array(w * h), ig = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const mn = Math.min(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
    m[i] = mn < threshold ? 1 : 0;
  }
  for (const [x0, y0, x1, y1] of ignoreRects) {
    for (let y = Math.floor(y0 * h); y < Math.ceil(y1 * h); y++)
      for (let x = Math.floor(x0 * w); x < Math.ceil(x1 * w); x++) ig[y * w + x] = 1;
  }
  const enc = (a) => { let s = ''; for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); };
  return { mask: enc(m), ignore: enc(ig) };
}

// Rebuild the box with a partial config override (used for A/B tests).
function setConfig(patch) {
  const merge = (a, b) => {
    for (const [k, v] of Object.entries(b)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) merge(a[k], v); else a[k] = v;
    }
  };
  merge(CONFIG, patch);
  turntable.remove(box.root);
  box = buildWatchBox(CONFIG);
  turntable.add(box.root);
  return CONFIG;
}

window.app = { setConfig, refMask, render, fit, silhouetteDataURL, exportGLB, exportUSDZ, stats, CONFIG, renderer };
window.harnessReady = true;
