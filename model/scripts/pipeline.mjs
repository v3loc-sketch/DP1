// Drives model/harness.html in headless Chromium (software WebGL).
// Usage: node model/scripts/pipeline.mjs <command...>
//   fit            fit camera poses to the reference photo silhouettes -> model/views.json
//   compare <dir>  render every reference view and write side-by-side sheets to <dir>
//   export         public/models/watch-box.glb + watch-box.usdz
//   frames         72 x 1500px WebP turntable frames + poster -> public/spin/
//   video          seamless-loop MP4 -> public/spin/spin.mp4
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const VIEWS_FILE = path.join(ROOT, 'model/views.json');
const OUT_MODELS = path.join(ROOT, 'public/models');
const OUT_SPIN = path.join(ROOT, 'public/spin');
const TMP = path.join(ROOT, '.tmp');

// Reference photos. Images 1 and 3 drive the detail comparison; 2 and 4 are
// low-res and are only used for silhouette/proportions.
export const REFS = {
  img1: {
    file: 'docs/reference/img1_open.webp', w: 1000, h: 698, lid: 100,
    init: { az: 31.9, el: 19.6, dist: 0.8, fov: 17, panX: -0.025, panY: -0.014, roll: 0, lid: 110 },
    ignore: [],
  },
  img3: {
    file: 'docs/reference/img3_back.png', w: 512, h: 512, lid: 0,
    init: { az: 205, el: 34.7, dist: 1.09, fov: 20, panX: -0.0015, panY: 0.002, roll: 0 },
    ignore: [[0, 0, 0.2, 0.17], [0.55, 0.62, 0.75, 0.72]], // ASHRAAFI logo / watermark text
  },
  img2: {
    file: 'docs/reference/img2_closed_top.png', w: 225, h: 225, lid: 0,
    init: { az: -25, el: 45, dist: 1.2, fov: 20, panX: 0, panY: 0, roll: 0 },
    ignore: [],
  },
  img4: {
    file: 'docs/reference/img4_front.png', w: 225, h: 225, lid: 0,
    init: { az: 5, el: 18, dist: 1.2, fov: 20, panX: 0, panY: 0, roll: 0 },
    ignore: [],
  },
};

async function start() {
  const server = await createServer({
    root: ROOT,
    logLevel: 'error',
    server: { port: 5199, strictPort: false },
    optimizeDeps: { include: ['three'] },
  });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 800 } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(url + 'model/harness.html');
  await page.waitForFunction(() => window.harnessReady === true, null, { timeout: 120000 });
  if (process.env.CONFIG_PATCH) await page.evaluate((p) => window.app.setConfig(JSON.parse(p)), process.env.CONFIG_PATCH);
  return { server, browser, page, url };
}

function saveDataURL(dataURL, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(dataURL.split(',')[1], 'base64'));
}

function loadViews() {
  return fs.existsSync(VIEWS_FILE) ? JSON.parse(fs.readFileSync(VIEWS_FILE, 'utf8')) : {};
}

async function cmdFit(page, args) {
  const views = loadViews();
  const freeScale = args.includes('--proportions');
  const only = process.env.FIT_ONLY;
  const dry = !!process.env.FIT_DRY; // report only, keep views.json
  for (const [name, ref] of Object.entries(REFS)) {
    const fw = Math.round(ref.w > ref.h ? 240 : 200 * (ref.w / ref.h));
    const fh = Math.round(fw * ref.h / ref.w);
    const { mask, ignore } = await page.evaluate((o) => window.app.refMask(o), {
      url: '/' + ref.file, w: fw, h: fh, ignoreRects: ref.ignore,
    });
    if (only && only !== name) continue;
    const start = { ...(views[name]?.view || ref.init) };
    const steps = { az: 6, el: 5, dist: 0.15, fov: 3, panX: 0.008, panY: 0.008, roll: 1.5 };
    if (ref.lid) steps.lid = 6;
    if (freeScale) { steps.sz = 0.06; steps.sy = 0.06; start.sz ??= 1; start.sy ??= 1; }
    else { delete start.sz; delete start.sy; }
    const t0 = Date.now();
    const restarts = +(process.env.FIT_RESTARTS || 0);
    const spread = { az: 25, el: 15, fov: 12, size: 0.03, panX: 0.03, panY: 0.03, roll: 8, ...(ref.lid ? { lid: 20 } : {}) };
    const res = await page.evaluate((o) => window.app.fit(o), { mask, ignore, w: fw, h: fh, view: start, steps, restarts, spread, iterations: +(process.env.FIT_ITERS || 300) });
    console.log(name, 'IoU', res.iou.toFixed(4), 'evals', res.evals, `${((Date.now() - t0) / 1000).toFixed(1)}s`, JSON.stringify(res.view));
    if (freeScale) {
      views[name] = { ...(views[name] || {}), proportions: { sz: res.view.sz, sy: res.view.sy, iou: res.iou } };
    } else {
      views[name] = { ...(views[name] || {}), view: res.view, iou: res.iou };
    }
    const sil = await page.evaluate((o) => window.app.silhouetteDataURL(o), { w: fw, h: fh, view: res.view });
    saveDataURL(sil, path.join(TMP, `sil_${name}.png`));
  }
  if (!dry) fs.writeFileSync(VIEWS_FILE, JSON.stringify(views, null, 2));
}

async function cmdCompare(page, outDir) {
  const views = loadViews();
  const out = path.resolve(ROOT, outDir);
  fs.mkdirSync(out, { recursive: true });
  for (const [name, ref] of Object.entries(REFS)) {
    if (!views[name]) continue;
    const scale = ref.w < 600 ? 2 : 1.5;
    const w = Math.round(ref.w * scale), h = Math.round(ref.h * scale);
    const v = { ...views[name].view };
    delete v.sz; delete v.sy;
    const d = await page.evaluate((o) => window.app.render(o), { w, h, view: v, lid: v.lid || 0 });
    saveDataURL(d, path.join(out, `render_${name}.png`));
    console.log('rendered', name);
  }
  execFileSync('python3', [path.join(ROOT, 'model/scripts/compose.py'), out], { stdio: 'inherit' });
}

async function cmdExport(page) {
  fs.mkdirSync(OUT_MODELS, { recursive: true });
  const glb = await page.evaluate(() => window.app.exportGLB());
  fs.writeFileSync(path.join(OUT_MODELS, 'watch-box.glb'), Buffer.from(glb, 'base64'));
  const usdz = await page.evaluate(() => window.app.exportUSDZ());
  fs.writeFileSync(path.join(OUT_MODELS, 'watch-box.usdz'), Buffer.from(usdz, 'base64'));
  const s = (f) => (fs.statSync(path.join(OUT_MODELS, f)).size / 1024 / 1024).toFixed(2) + ' MB';
  console.log('GLB', s('watch-box.glb'), 'USDZ', s('watch-box.usdz'));
  console.log(await page.evaluate(() => window.app.stats()));
}

// Turntable camera used for the spin assets: slight elevated angle, product
// filling ~80% of the frame. Frame 0 = front three-quarter view.
const SPIN_VIEW = { az: 0, el: 22, dist: 1.12, fov: 20, panX: 0, panY: -0.004, roll: 0 };
const SPIN_START = -32;

async function cmdFrames(page) {
  fs.mkdirSync(OUT_SPIN, { recursive: true });
  for (let i = 0; i < 72; i++) {
    const d = await page.evaluate((o) => window.app.render(o), {
      w: 1500, h: 1500, view: SPIN_VIEW, spin: SPIN_START + i * 5, format: 'image/webp', quality: 0.9,
    });
    saveDataURL(d, path.join(OUT_SPIN, `frame_${String(i).padStart(3, '0')}.webp`));
    if (i % 12 === 0) console.log('frame', i);
  }
  fs.copyFileSync(path.join(OUT_SPIN, 'frame_000.webp'), path.join(OUT_SPIN, 'poster.webp'));
  const total = fs.readdirSync(OUT_SPIN).filter((f) => f.startsWith('frame_')).reduce((a, f) => a + fs.statSync(path.join(OUT_SPIN, f)).size, 0);
  console.log('72 frames,', (total / 1024 / 1024).toFixed(2), 'MB');
}

async function cmdVideo(page) {
  const n = 240; // 1.5 degrees per frame, 24 fps -> 10 s per revolution
  const dir = path.join(TMP, 'video');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < n; i++) {
    const d = await page.evaluate((o) => window.app.render(o), {
      w: 1080, h: 1080, view: SPIN_VIEW, spin: SPIN_START + (i * 360) / n, format: 'image/png',
    });
    saveDataURL(d, path.join(dir, `f_${String(i).padStart(4, '0')}.png`));
    if (i % 60 === 0) console.log('video frame', i);
  }
  fs.mkdirSync(OUT_SPIN, { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '24', '-i', path.join(dir, 'f_%04d.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'slow', '-movflags', '+faststart',
    path.join(OUT_SPIN, 'spin.mp4')], { stdio: 'inherit' });
  console.log('spin.mp4', (fs.statSync(path.join(OUT_SPIN, 'spin.mp4')).size / 1024 / 1024).toFixed(2), 'MB');
  // VP9 copy for browsers without H.264 (e.g. open-source Chromium builds)
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '24', '-i', path.join(dir, 'f_%04d.png'),
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-row-mt', '1', '-pix_fmt', 'yuv420p',
    path.join(OUT_SPIN, 'spin.webm')], { stdio: 'inherit' });
}

// Close-up detail renders (closed lid unless noted) for hardware checks.
const DETAILS = {
  hinge_back: { view: { az: 205, el: 18, dist: 0.22, fov: 20, target: [-0.122, 0.064, -0.05] } },
  latch_closed: { view: { az: 20, el: 12, dist: 0.2, fov: 20, target: [0, 0.058, 0.05] } },
  latch_open: { view: { az: 20, el: 25, dist: 0.24, fov: 20, target: [0, 0.055, 0.05] }, lid: 100 },
  corner_seam: { view: { az: 215, el: 20, dist: 0.2, fov: 20, target: [-0.155, 0.06, -0.04] } },
  pillows_open: { view: { az: 10, el: 40, dist: 0.35, fov: 20, target: [0.06, 0.06, 0] }, lid: 100 },
  lid_top: { view: { az: 0, el: 70, dist: 0.3, fov: 20, target: [0.1, 0.09, 0] } },
};

async function cmdDetails(page, outDir) {
  const out = path.resolve(ROOT, outDir);
  for (const [name, d] of Object.entries(DETAILS)) {
    const u = await page.evaluate((o) => window.app.render(o), { w: 900, h: 700, view: d.view, lid: d.lid || 0 });
    saveDataURL(u, path.join(out, `detail_${name}.png`));
  }
  execFileSync('python3', ['-c', `
import sys,glob
from PIL import Image
fs=sorted(glob.glob(sys.argv[1]+'/detail_*.png'))
ims=[Image.open(f).convert('RGB').resize((450,350)) for f in fs]
sheet=Image.new('RGB',(900,350*((len(ims)+1)//2)),'white')
for i,im in enumerate(ims): sheet.paste(im,((i%2)*450,(i//2)*350))
sheet.save(sys.argv[1]+'/details.jpg',quality=88)
`, out]);
}

async function cmdShot(page, args) {
  // quick look renders: shot <file> <az> <el> <lid> [dist]
  const [file, az, el, lid, dist] = args;
  const d = await page.evaluate((o) => window.app.render(o), {
    w: 900, h: 700, view: { ...SPIN_VIEW, az: +az, el: +el, dist: dist ? +dist : 1.2 }, lid: +lid,
  });
  saveDataURL(d, path.resolve(ROOT, file));
}

const argv = process.argv.slice(2);
const { server, browser, page } = await start();
try {
  for (let i = 0; i < argv.length; i++) {
    const c = argv[i];
    const t0 = Date.now();
    if (c === 'fit') await cmdFit(page, argv);
    else if (c === 'compare') await cmdCompare(page, argv[++i]);
    else if (c === 'export') await cmdExport(page);
    else if (c === 'frames') await cmdFrames(page);
    else if (c === 'video') await cmdVideo(page);
    else if (c === 'details') await cmdDetails(page, argv[++i]);
    else if (c === 'shot') { await cmdShot(page, argv.slice(i + 1, i + 6)); i += 5; }
    else continue;
    console.log(`[${c}] ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
} finally {
  await browser.close();
  await server.close();
}
