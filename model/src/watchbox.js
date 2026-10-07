// Procedural 6-slot watch box. Pure code: no scans, no AI-generated assets.
// buildWatchBox() returns a THREE.Group (closed lid by default) plus the
// "OpenLid"/"CloseLid" animation clips used by the glTF export.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from './config.js';
import { makeRibTextures, makeVelvetTextures } from './textures.js';

const VELVET_TILE = 0.045; // metres covered by one repeat of the velvet texture
const RIB_U_TILE = 0.05;

export function makeMaterials(cfg = CONFIG, { forUSDZ = false } = {}) {
  const rib = makeRibTextures();
  const velvet = makeVelvetTextures();
  const black = new THREE.MeshStandardMaterial({
    name: 'BlackAluminium',
    color: cfg.colors.black,
    metalness: 0.45,
    roughness: 0.42,
  });
  const green = new THREE.MeshStandardMaterial({
    name: 'GreenRibbedAluminium',
    color: cfg.colors.aluminumGreen,
    map: rib.color,
    normalMap: rib.normal,
    metalness: 0.6,
    roughness: 0.38,
  });
  const velvetMat = new THREE.MeshPhysicalMaterial({
    name: 'GreenVelvet',
    color: cfg.colors.velvet,
    map: velvet.color,
    normalMap: velvet.normal,
    normalScale: new THREE.Vector2(1, 1),
    roughness: 0.92,
    metalness: 0,
    sheen: 0.55,
    sheenColor: new THREE.Color(cfg.colors.velvetSheen),
    sheenRoughness: 0.42,
  });
  // Alpha-blended glass instead of KHR_materials_transmission: renders the same in
  // model-viewer, Android Scene Viewer, Shopify's viewer and AR Quick Look.
  const glass = new (forUSDZ ? THREE.MeshStandardMaterial : THREE.MeshPhysicalMaterial)({
    name: 'Glass',
    color: '#ffffff',
    roughness: 0.03,
    metalness: 0,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
    ...(forUSDZ ? {} : { ior: 1.5, specularIntensity: 0.6 }),
  });
  return { black, green, velvet: velvetMat, glass };
}

// ---------------------------------------------------------------- helpers
function rbox(w, h, d, r, seg = 2) {
  r = Math.min(r, w / 2 - 1e-5, h / 2 - 1e-5, d / 2 - 1e-5);
  return new RoundedBoxGeometry(w, h, d, seg, Math.max(r, 1e-5));
}

function plane(w, h) {
  return new THREE.PlaneGeometry(w, h);
}

// Collects geometry per material, then merges into one mesh per material.
class Bucket {
  constructor() {
    this.parts = { black: [], green: [], velvet: [], glass: [] };
  }
  add(kind, geom, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] } = {}) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...pos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
      new THREE.Vector3(...scale),
    );
    let g = geom.index ? geom.toNonIndexed() : geom.clone();
    g.applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    }
    g.morphAttributes = {};
    this.parts[kind].push(g);
  }
  build(mats, prefix, offset = null) {
    const meshes = [];
    for (const [kind, list] of Object.entries(this.parts)) {
      if (!list.length) continue;
      let g = mergeGeometries(list, false);
      if (offset) g.translate(-offset.x, -offset.y, -offset.z);
      projectUVs(g, kind, offset);
      g = mergeVertices(g, 1e-6);
      if (kind === 'green' || kind === 'velvet') g.computeTangents?.();
      const mesh = new THREE.Mesh(g, mats[kind]);
      mesh.name = `${prefix}_${kind[0].toUpperCase()}${kind.slice(1)}`;
      mesh.castShadow = kind !== 'glass';
      mesh.receiveShadow = true;
      meshes.push(mesh);
    }
    return meshes;
  }
}

// UVs are generated from world-space (closed-lid) positions so the rib pitch
// and the velvet pile have a real-world scale and line up across pieces.
function projectUVs(g, kind, offset) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  const ox = offset ? offset.x : 0, oy = offset ? offset.y : 0, oz = offset ? offset.z : 0;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + ox, y = p.getY(i) + oy, z = p.getZ(i) + oz;
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (kind === 'green') {
      u = (ax > az ? z : x) / RIB_U_TILE;
      v = y / CONFIG.ribs.pitch;
    } else {
      const t = VELVET_TILE;
      if (ay >= ax && ay >= az) { u = x / t; v = z / t; }
      else if (ax >= az) { u = z / t; v = y / t; }
      else { u = x / t; v = y / t; }
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function roundedRectShape(hw, hh, r, shape = new THREE.Shape()) {
  r = Math.min(r, hw, hh);
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return shape;
}

function roundedRectPath(hw, hh, r) {
  const p = new THREE.Path();
  roundedRectShape(hw, hh, r, p);
  return p;
}

// Low dome rivet / screw head, axis along +Y before orientation.
const rivetGeom = (r) => {
  const g = new THREE.SphereGeometry(r, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, 0.5, 1);
  return g;
};
// rotation that turns +Y into the given outward face direction
function faceRot(dir) {
  switch (dir) {
    case '+z': return [Math.PI / 2, 0, 0];
    case '-z': return [-Math.PI / 2, 0, 0];
    case '+x': return [0, 0, -Math.PI / 2];
    case '-x': return [0, 0, Math.PI / 2];
    default: return [0, 0, 0];
  }
}

// Pillow: a soft "loaf" built as a superellipsoid with a domed crown.
function pillowGeometry(a, b, c, dome) {
  const e1 = 0.55, e2 = 0.3; // vertical / horizontal squareness
  const sp = (x, e) => Math.sign(x) * Math.pow(Math.abs(x), e);
  const geom = new ParametricGeometry((u, v, target) => {
    const eta = -Math.PI / 2 + v * Math.PI;
    const om = Math.PI - u * 2 * Math.PI; // orientation chosen so faces point outward
    const ce = Math.cos(eta), se = Math.sin(eta);
    let x = a * sp(ce, e1) * sp(Math.cos(om), e2);
    let y = b * sp(se, e1);
    let z = c * sp(ce, e1) * sp(Math.sin(om), e2);
    if (y > 0) {
      const fx = 1 - Math.pow(x / a, 2);
      const fz = 1 - Math.pow(z / c, 4);
      y += dome * Math.max(fx, 0) * Math.max(fz, 0) * (y / b);
    } else {
      y = Math.max(y, -b * 0.92); // flat-ish underside resting on the floor
    }
    target.set(x, y, z);
  }, 40, 28);
  return geom;
}

// Wire loop of the latch: rounded rectangle tube in the XY plane, from y=0
// (pivot on the toggle) up to y=len (where it hooks over the lid catch).
function loopGeometry(innerW, len, wireR) {
  const hw = innerW / 2 + wireR;
  const r = wireR * 2.2;
  const pts = [
    [-hw, 0], [hw, 0], [hw, len], [-hw, len],
  ];
  const path = new THREE.CurvePath();
  const corners = pts.map(([x, y]) => new THREE.Vector3(x, y, 0));
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4], c = corners[(i + 2) % 4];
    const ab = b.clone().sub(a).normalize();
    const bc = c.clone().sub(b).normalize();
    const start = a.clone().addScaledVector(ab, i === 0 ? r : r);
    const end = b.clone().addScaledVector(ab, -r);
    path.add(new THREE.LineCurve3(start, end));
    path.add(new THREE.QuadraticBezierCurve3(end, b.clone(), b.clone().addScaledVector(bc, r)));
  }
  return new THREE.TubeGeometry(path, 64, wireR, 8, true);
}

// ---------------------------------------------------------------- builder
export function buildWatchBox(cfg = CONFIG, opts = {}) {
  const mats = opts.materials || makeMaterials(cfg, opts);
  const { length: L, width: W, baseHeight: Hb, lidHeight: Hl } = cfg.dimensions;
  const F = cfg.frame, I = cfg.interior, LD = cfg.lid, HG = cfg.hinge, LT = cfg.latch, RV = cfg.rivet;
  const hx = L / 2, hz = W / 2, Ht = Hb + Hl;
  const base = new Bucket();
  const lid = new Bucket();
  const rivet = rivetGeom(RV.radius);

  // ---------- frame helper (shared by base and lid)
  function frameRing(bucket, y0, y1, railH, railD, where) {
    const yc = where === 'bottom' ? y0 + railH / 2 : y1 - railH / 2;
    const len = L - F.post * 0.6;
    const wid = W - F.post * 0.6;
    for (const s of [-1, 1]) {
      bucket.add('black', rbox(len, railH, railD, F.railRadius), { pos: [0, yc, s * (hz - railD / 2)] });
      bucket.add('black', rbox(railD, railH, wid, F.railRadius), { pos: [s * (hx - railD / 2), yc, 0] });
    }
  }
  function ribbedPanels(bucket, y0, y1) {
    const h = y1 - y0, yc = (y0 + y1) / 2;
    for (const s of [-1, 1]) {
      bucket.add('green', plane(L - F.post, h), {
        pos: [0, yc, s * (hz - F.panelInset)], rot: [0, s > 0 ? 0 : Math.PI, 0],
      });
      bucket.add('green', plane(W - F.post, h), {
        pos: [s * (hx - F.panelInset), yc, 0], rot: [0, s * Math.PI / 2, 0],
      });
    }
  }
  function posts(bucket, y0, y1) {
    const h = y1 - y0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      bucket.add('black', rbox(F.post, h, F.post, F.postRadius, 3), {
        pos: [sx * (hx - F.post / 2), (y0 + y1) / 2, sz * (hz - F.post / 2)],
      });
    }
  }
  function rivetsOnFaces(bucket, y) {
    const d = RV.fromCorner;
    const lift = 0.0001;
    for (const s of [-1, 1]) for (const e of [-1, 1]) {
      bucket.add('black', rivet, { pos: [e * (hx - d), y, s * (hz + lift)], rot: faceRot(s > 0 ? '+z' : '-z') });
      bucket.add('black', rivet, { pos: [s * (hx + lift), y, e * (hz - d)], rot: faceRot(s > 0 ? '+x' : '-x') });
    }
  }

  // ---------- BASE exterior
  ribbedPanels(base, 0, Hb);
  posts(base, 0, Hb);
  frameRing(base, 0, Hb, F.bottomRail, F.railDepth, 'bottom');
  frameRing(base, 0, Hb, F.baseSeamRail, F.wall, 'top');
  base.add('black', plane(L - 0.002, W - 0.002), { pos: [0, 0.0003, 0], rot: [Math.PI / 2, 0, 0] });
  rivetsOnFaces(base, F.bottomRail / 2); // rivets at the lower panel corners
  rivetsOnFaces(base, Hb - F.baseSeamRail / 2); // lower rivet of each stacked pair at the seam

  // ---------- BASE interior (velvet)
  const ix = hx - F.wall, iz = hz - F.wall;
  base.add('velvet', plane(2 * ix, 2 * iz), { pos: [0, I.floorHeight, 0], rot: [-Math.PI / 2, 0, 0] });
  for (const s of [-1, 1]) {
    const h = Hb - I.floorHeight, yc = (Hb + I.floorHeight) / 2;
    base.add('velvet', plane(2 * ix, h), { pos: [0, yc, s * iz], rot: [0, s > 0 ? Math.PI : 0, 0] });
    base.add('velvet', plane(2 * iz, h), { pos: [s * ix, yc, 0], rot: [0, -s * Math.PI / 2, 0] });
  }
  // velvet wrapped over the top rim
  const lipOut = I.lipWidth - 0.0008;
  for (const s of [-1, 1]) {
    base.add('velvet', rbox(2 * ix + 2 * lipOut, I.lipHeight * 2, I.lipWidth, I.lipHeight * 0.95), {
      pos: [0, Hb, s * (iz + lipOut - I.lipWidth / 2)],
    });
    base.add('velvet', rbox(I.lipWidth, I.lipHeight * 2, 2 * iz + 2 * lipOut, I.lipHeight * 0.95), {
      pos: [s * (ix + lipOut - I.lipWidth / 2), Hb, 0],
    });
  }
  // pillows + dividers
  const n = I.slots, td = I.dividerThickness;
  const slot = (2 * ix - (n - 1) * td) / n;
  const pz = 2 * iz - 2 * I.pillowGapToWall;
  const pTop = Hb - I.pillowTopBelowRim;
  const pb = (pTop - I.pillowDome - I.floorHeight) / 2;
  const pillow = pillowGeometry(slot / 2 + 0.0006, pb, pz / 2, I.pillowDome);
  const dh = Hb - I.dividerTopBelowRim - I.floorHeight;
  for (let k = 0; k < n; k++) {
    const x = -ix + slot / 2 + k * (slot + td);
    base.add('velvet', pillow, { pos: [x, I.floorHeight + pb * 0.92, 0] });
    if (k < n - 1) {
      base.add('velvet', rbox(td, dh, 2 * iz - 0.0004, td * 0.45, 3), {
        pos: [x + slot / 2 + td / 2, I.floorHeight + dh / 2, 0],
      });
    }
  }

  // ---------- LATCH (base part): toggle plate + lever
  const plateTop = Hb - 0.0006;
  base.add('black', rbox(LT.plateWidth, LT.plateHeight, 0.0013, 0.0004), {
    pos: [0, plateTop - LT.plateHeight / 2, hz + 0.00065],
  });
  base.add('black', rbox(LT.leverWidth, LT.leverLength, 0.0034, 0.0007), {
    pos: [0, plateTop - 0.0012 - LT.leverLength / 2, hz + 0.0013 + 0.0017],
  });
  // raised toggle knuckle near the bottom of the lever (where the loop pivots)
  base.add('black', rbox(LT.leverWidth * 0.75, 0.0035, 0.0052, 0.0012), {
    pos: [0, plateTop - 0.0012 - LT.leverLength * 0.85, hz + 0.0028],
  });
  // lever pivot barrel + pivot rivet on the plate
  base.add('black', new THREE.CylinderGeometry(0.0011, 0.0011, LT.leverWidth + 0.002, 12), {
    pos: [0, plateTop - 0.0018, hz + 0.0022], rot: [0, 0, Math.PI / 2],
  });
  base.add('black', rivet, { pos: [LT.plateWidth / 2 - 0.0018, plateTop - LT.plateHeight * 0.45, hz + 0.0013], rot: faceRot('+z') });

  // ---------- HINGES (base leaves + knuckles)
  const knuckleZ = -hz - HG.thickness - HG.knuckleRadius * 0.35;
  const hingeXs = [-1, 1].map((s) => s * (hx - HG.centerFromEnd));
  const screw = rivetGeom(HG.screwRadius);
  for (const x of hingeXs) {
    base.add('black', rbox(HG.width, HG.baseLeafHeight, HG.thickness, 0.0004), {
      pos: [x, Hb - 0.0004 - HG.baseLeafHeight / 2, -hz - HG.thickness / 2],
    });
    // centre knuckle on the base, outer knuckles go with the lid
    base.add('black', new THREE.CylinderGeometry(HG.knuckleRadius, HG.knuckleRadius, HG.width * 0.34, 14), {
      pos: [x, Hb, knuckleZ], rot: [0, 0, Math.PI / 2],
    });
    for (const sx of [-1, 1]) {
      base.add('black', screw, {
        pos: [x + sx * HG.width * 0.3, Hb - 0.0004 - HG.baseLeafHeight * 0.48, -hz - HG.thickness],
        rot: faceRot('-z'),
      });
    }
  }

  // ---------- LID (built in closed world coordinates, re-centred on the hinge axis)
  const lidY0 = Hb;
  const bnH = LD.bullnoseHeight;
  ribbedPanels(lid, lidY0, Ht - bnH * 0.5);
  posts(lid, lidY0, Ht - bnH * 0.5);
  frameRing(lid, lidY0, Ht, F.lidSeamRail, F.railDepth, 'bottom');
  rivetsOnFaces(lid, lidY0 + F.lidSeamRail / 2); // upper rivet of each stacked pair

  // rolled / bullnose top frame
  {
    const s = bnH * 0.42; // bevel radius
    const depth = Math.max(bnH - 2 * s, 0.0003);
    const outer = roundedRectShape(hx - s, hz - s, LD.bullnoseCornerRadius - s);
    const ihx = hx - LD.bullnoseWidth + s, ihz = hz - LD.bullnoseWidth + s;
    outer.holes.push(roundedRectPath(ihx, ihz, 0.0015 + s));
    const g = new THREE.ExtrudeGeometry(outer, {
      depth, bevelEnabled: true, bevelThickness: s, bevelSize: s, bevelSegments: 6, curveSegments: 10,
    });
    g.rotateX(-Math.PI / 2);
    lid.add('black', g, { pos: [0, Ht - bnH + s, 0] });
  }
  // glass pane
  const gx = hx - LD.bullnoseWidth + 0.0025, gz = hz - LD.bullnoseWidth + 0.0025;
  const glassY = Ht - bnH * 0.55;
  lid.add('glass', new THREE.BoxGeometry(2 * gx, LD.glassThickness, 2 * gz), { pos: [0, glassY, 0] });
  // velvet border on the underside of the glass
  const lix = hx - F.railDepth - 0.0006, liz = hz - F.railDepth - 0.0006;
  {
    const t = LD.velvetBorderThickness;
    const sh = roundedRectShape(lix, liz, 0.001);
    sh.holes.push(roundedRectPath(lix - LD.velvetBorder, liz - LD.velvetBorder, 0.0015));
    const g = new THREE.ExtrudeGeometry(sh, {
      depth: t - 0.0016, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0006, bevelSegments: 3, curveSegments: 6,
    });
    g.rotateX(-Math.PI / 2);
    lid.add('velvet', g, { pos: [0, glassY - LD.glassThickness / 2 - t + 0.0008, 0] });
  }
  // velvet lining of the lid side walls
  {
    const y0 = lidY0 + 0.0002, y1 = glassY - LD.glassThickness / 2 - 0.0005;
    const h = y1 - y0, yc = (y0 + y1) / 2;
    for (const s of [-1, 1]) {
      lid.add('velvet', plane(2 * lix, h), { pos: [0, yc, s * liz], rot: [0, s > 0 ? Math.PI : 0, 0] });
      lid.add('velvet', plane(2 * liz, h), { pos: [s * lix, yc, 0], rot: [0, -s * Math.PI / 2, 0] });
    }
  }
  // catch plate on the lid front rail
  const catchY = lidY0 + F.lidSeamRail * 0.5 + 0.0004;
  lid.add('black', rbox(LT.catchWidth, LT.catchHeight, 0.0012, 0.0004), { pos: [0, catchY, hz + 0.0006] });
  lid.add('black', rbox(LT.catchWidth * 0.62, 0.0012, 0.0026, 0.0004), {
    pos: [0, catchY + LT.catchHeight / 2 - 0.0006, hz + 0.0016],
  });
  for (const sx of [-1, 1]) {
    lid.add('black', rivet, { pos: [sx * LT.catchWidth * 0.38, catchY - 0.0004, hz + 0.0012], rot: faceRot('+z') });
  }
  // hinge lid leaves + outer knuckles
  for (const x of hingeXs) {
    lid.add('black', rbox(HG.width, HG.lidLeafHeight, HG.thickness, 0.0004), {
      pos: [x, Hb + 0.0004 + HG.lidLeafHeight / 2, -hz - HG.thickness / 2],
    });
    for (const sx of [-1, 1]) {
      lid.add('black', new THREE.CylinderGeometry(HG.knuckleRadius, HG.knuckleRadius, HG.width * 0.32, 14), {
        pos: [x + sx * HG.width * 0.335, Hb, knuckleZ], rot: [0, 0, Math.PI / 2],
      });
      lid.add('black', screw, {
        pos: [x + sx * HG.width * 0.3, Hb + 0.0004 + HG.lidLeafHeight * 0.55, -hz - HG.thickness],
        rot: faceRot('-z'),
      });
    }
  }

  // ---------- assemble
  const root = new THREE.Group();
  root.name = 'WatchBox';
  for (const m of base.build(mats, 'Base')) root.add(m);

  const pivot = new THREE.Vector3(0, Hb, knuckleZ);
  const lidNode = new THREE.Group();
  lidNode.name = 'Lid';
  lidNode.position.copy(pivot);
  for (const m of lid.build(mats, 'Lid', pivot)) lidNode.add(m);
  root.add(lidNode);

  // wire loop: pivots on the toggle lever, hooks over the catch when closed
  const loopPivotY = plateTop - 0.0012 - LT.leverLength * 0.85;
  const loopZ = hz + 0.0052;
  const hookY = catchY + LT.catchHeight / 2 - 0.0002;
  const loopLen = hookY - loopPivotY;
  const loopNode = new THREE.Group();
  loopNode.name = 'LatchLoop';
  loopNode.position.set(0, loopPivotY, loopZ);
  const loopMesh = new THREE.Mesh(loopGeometry(LT.loopInnerWidth, loopLen, LT.wireRadius), mats.black);
  loopMesh.name = 'LatchLoop_Wire';
  loopMesh.castShadow = true;
  loopNode.add(loopMesh);
  root.add(loopNode);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = o.material.name !== 'Glass'; o.receiveShadow = true; } });

  const api = {
    root,
    lid: lidNode,
    loop: loopNode,
    materials: mats,
    // 0 = closed, cfg.lid.openAngleDeg = fully open
    setLid(deg) { lidNode.rotation.set(-THREE.MathUtils.degToRad(deg), 0, 0); },
    // 0 = hooked on the catch (pointing up), 1 = hanging down
    setLoop(t) { loopNode.rotation.set(Math.PI * t, 0, 0); },
    clips: makeClips(cfg),
    info: { loopLen, pivot, slot },
  };
  return api;
}

// Lid opens 0 -> 100 deg over 1.5 s (ease-in-out); the wire loop is flipped
// off the catch during the first ~0.35 s, while the lid has barely moved.
function makeClips(cfg) {
  const dur = cfg.lid.openDuration;
  const maxRad = THREE.MathUtils.degToRad(cfg.lid.openAngleDeg);
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const steps = 30;
  const q = new THREE.Quaternion();
  const ax = new THREE.Vector3(1, 0, 0);
  function track(node, fn, t0, t1) {
    const times = [], values = [];
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      times.push(t0 + f * (t1 - t0));
      q.setFromAxisAngle(ax, fn(f));
      values.push(q.x, q.y, q.z, q.w);
    }
    return new THREE.QuaternionKeyframeTrack(`${node}.quaternion`, times, values);
  }
  const loopEnd = 0.35;
  const open = new THREE.AnimationClip('OpenLid', dur, [
    track('Lid', (f) => -maxRad * ease(f), 0, dur),
    track('LatchLoop', (f) => Math.PI * ease(f), 0, loopEnd),
  ]);
  const close = new THREE.AnimationClip('CloseLid', dur, [
    track('Lid', (f) => -maxRad * (1 - ease(f)), 0, dur),
    track('LatchLoop', (f) => Math.PI * (1 - ease(f)), dur - loopEnd, dur),
  ]);
  return [open, close];
}
