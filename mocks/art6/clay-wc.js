// The clay piece: one lathe-turned mesh whose profile, surface and colour
// follow a "stage" value from 0 to 7, driven by the page's scroll position.
//
//   0 ball · 1 pinched open · 2 pinch bowl · 3 first coils · 4 coils built up
//   5 smoothed and shaped · 6 bisque-fired · 7 glazed
//
// Built by hand, not thrown: pinched, then coiled. The shape is a profile
// curve (radius against height) spun around the vertical axis; the hands show
// in what is added on top of it - thumb dents, rope-like coils, a slightly
// wonky finished form. Every stage's profile is resampled to the same number
// of points, so moving between stages is a plain interpolation.
import * as THREE from "three";
// Watercolour edition of the live site's clay.js: the same hand-built shapes and
// morph, painted like the ink-and-wash drawings (see the "watercolour" style).


/* ---------- Profiles ------------------------------------------------------- */
// Each stage: an outer polyline from the bottom centre up to the rim, and an
// inner one from the rim back down to the floor. Solid stages close the inner
// wall at the top, on the axis.
const PROFILES = [
  { // 0 - a ball of clay
    outer: [[0, 0], [0.5, 0.03], [0.82, 0.22], [0.95, 0.58], [0.88, 0.95], [0.6, 1.17], [0.18, 1.26]],
    inner: [[0.18, 1.26], [0.06, 1.27], [0, 1.27]],
  },
  { // 1 - pinched open: a thumb pressed into the ball
    outer: [[0, 0], [0.6, 0.03], [0.9, 0.24], [0.96, 0.56], [0.84, 0.86], [0.56, 1.02], [0.4, 1.04]],
    inner: [[0.4, 1.04], [0.3, 0.97], [0.22, 0.76], [0.12, 0.62], [0, 0.6]],
  },
  { // 2 - pinched out into a small bowl: the base
    outer: [[0, 0], [0.7, 0.02], [1.0, 0.24], [1.08, 0.55], [1.05, 0.76]],
    inner: [[1.05, 0.76], [0.93, 0.71], [0.88, 0.46], [0.62, 0.26], [0.3, 0.21], [0, 0.2]],
  },
  { // 3 - the first coils laid around the rim
    outer: [[0, 0], [0.7, 0.02], [1.0, 0.24], [1.08, 0.55], [1.07, 0.86], [1.03, 1.12], [1.0, 1.2]],
    inner: [[1.0, 1.2], [0.88, 1.14], [0.92, 0.86], [0.93, 0.6], [0.85, 0.42], [0.6, 0.24], [0.3, 0.21], [0, 0.2]],
  },
  { // 4 - coil after coil, curving in towards a shoulder and neck
    outer: [[0, 0], [0.7, 0.02], [1.0, 0.24], [1.08, 0.55], [1.07, 0.9], [0.96, 1.28], [0.74, 1.58], [0.56, 1.76], [0.53, 1.86]],
    inner: [[0.53, 1.86], [0.42, 1.8], [0.58, 1.58], [0.82, 1.28], [0.95, 0.9], [0.94, 0.6], [0.85, 0.42], [0.6, 0.24], [0.3, 0.21], [0, 0.2]],
  },
  { // 5 - coils smoothed into one skin: belly, shoulder, neck, a rounded lip
    outer: [[0, 0], [0.5, 0], [0.62, 0.07], [0.9, 0.45], [1.04, 0.9], [0.99, 1.3], [0.8, 1.54], [0.61, 1.69], [0.49, 1.8], [0.45, 1.94], [0.5, 2.04], [0.545, 2.09], [0.54, 2.13]],
    inner: [[0.54, 2.13], [0.5, 2.15], [0.46, 2.12], [0.39, 2.01], [0.35, 1.92], [0.37, 1.79], [0.52, 1.66], [0.7, 1.51], [0.87, 1.29], [0.93, 0.9], [0.8, 0.46], [0.48, 0.15], [0.2, 0.13], [0, 0.13]],
  },
];
// Firing shrinks clay a few percent; the glaze firing keeps that shape.
const shrink = (p, k) => ({ outer: p.outer.map(([r, y]) => [r * k, y * k]), inner: p.inner.map(([r, y]) => [r * k, y * k]) });
PROFILES.push(shrink(PROFILES[5], 0.965), shrink(PROFILES[5], 0.965));

/** Catmull-Rom through the points, then resampled to n points evenly spaced by length. */
function resample(points, n) {
  const dense = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(i + 2, points.length - 1)];
    for (let s = 0; s < 24; s++) {
      const t = s / 24, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push([Math.max(0, f(p0[0], p1[0], p2[0], p3[0])), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  dense.push(points[points.length - 1]);
  const len = [0];
  for (let i = 1; i < dense.length; i++) len.push(len[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const total = len[len.length - 1] || 1;
  const out = [];
  for (let k = 0, j = 0; k < n; k++) {
    const target = (k / (n - 1)) * total;
    while (j < len.length - 2 && len[j + 1] < target) j++;
    const span = len[j + 1] - len[j] || 1, u = (target - len[j]) / span;
    out.push([dense[j][0] + (dense[j + 1][0] - dense[j][0]) * u, dense[j][1] + (dense[j + 1][1] - dense[j][1]) * u]);
  }
  return out;
}
// Resampled profiles per resolution (m points per wall), built on first use.
const sampledCache = new Map();
function sampled(m) {
  if (!sampledCache.has(m)) sampledCache.set(m, PROFILES.map((p) => [...resample(p.outer, m), ...resample(p.inner, m)]));
  return sampledCache.get(m);
}

/* ---------- Stage parameters ---------------------------------------------- */
// How worked the surface looks, the marks of the hands, and the material.
// coils: height of the coil ropes; dents: finger and thumb marks; asym: how
// lopsided - a hand-built piece never quite loses it.
const STAGES = [
  { rough: 0.13, coils: 0, dents: 0, asym: 1, color: "#86593f", roughness: 0.78, clearcoat: 0.1, bump: 1.4 },
  { rough: 0.07, coils: 0, dents: 0.06, asym: 0.6, color: "#87593e", roughness: 0.7, clearcoat: 0.15, bump: 1.2 },
  { rough: 0.04, coils: 0, dents: 0.04, asym: 0.35, color: "#85583d", roughness: 0.66, clearcoat: 0.18, bump: 1.0 },
  { rough: 0.03, coils: 0.085, dents: 0.025, asym: 0.25, color: "#86593f", roughness: 0.66, clearcoat: 0.18, bump: 1.0 },
  { rough: 0.026, coils: 0.075, dents: 0.02, asym: 0.2, color: "#885b40", roughness: 0.68, clearcoat: 0.15, bump: 0.9 },
  { rough: 0.012, coils: 0, dents: 0.006, asym: 0.12, color: "#a9805f", roughness: 0.82, clearcoat: 0.05, bump: 0.6 },
  { rough: 0.01, coils: 0, dents: 0.005, asym: 0.12, color: "#e0b49a", roughness: 0.95, clearcoat: 0, bump: 0.55 },
  { rough: 0.008, coils: 0, dents: 0.004, asym: 0.12, color: "#2f6d72", roughness: 0.14, clearcoat: 1, bump: 0.08 },
];
const BISQUE = new THREE.Color("#e0b49a");
const GLAZE_RIM = new THREE.Color("#7fb3ae");
const GLAZE_POOL = new THREE.Color("#1d4f55");

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));

/* ---------- Noise ---------------------------------------------------------- */
// Small value noise, sampled on the unit circle so it has no seam around the axis.
function hash(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
  let v = 0;
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) {
    const w = (dx ? xf : 1 - xf) * (dy ? yf : 1 - yf) * (dz ? zf : 1 - zf);
    v += w * hash(xi + dx, yi + dy, zi + dz);
  }
  return v * 2 - 1;
}
const fbm = (x, y, z) => noise3(x, y, z) * 0.6 + noise3(x * 2.3, y * 2.3, z * 2.3) * 0.3 + noise3(x * 5.1, y * 5.1, z * 5.1) * 0.1;

/** A grainy texture for the clay's bump map. */
function grainTexture() {
  const size = 256, c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d"), img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 128 + (Math.random() - 0.5) * 90;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 4);
  return t;
}

/** A soft round shadow under the piece. */
function shadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d"), grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, "rgba(0,0,0,0.45)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/* ---------- Styles --------------------------------------------------------- */
// Same shapes and stages in every style; what changes is resolution, material,
// palette (one colour per stage) and lighting, plus an outline or ink lines.
export const STYLES = {
  realistic: { m: 44, segments: 120, material: "physical", toneMap: true, noise: 1 },
  toon: {
    m: 110, segments: 96, material: "toon", noise: 0.18, outline: 0.028, ink: "#2a1d16",
    palette: ["#b8744b", "#b8744b", "#a9653f", "#ad6a44", "#b06e48", "#cf9b70", "#f2c7aa", "#3f9089"],
    glaze: { rim: "#a6dccf", pool: "#2b6f6b", foot: "#f2c7aa" },
  },
  ink: {
    m: 32, segments: 80, material: "flat", noise: 0.45, outline: 0.02, ink: "#2a211b", contours: true,
    palette: ["#eadccb", "#eadccb", "#e7d7c4", "#e7d7c4", "#e7d7c4", "#ecdccb", "#f6d9c6", "#cfe5df"],
    glaze: { rim: "#e7f3ef", pool: "#a9cfc6", foot: "#f6d9c6" },
  },
  lowpoly: {
    m: 9, segments: 12, material: "faceted", noise: 1.1,
    palette: ["#b97650", "#b97650", "#a9673f", "#ab6a44", "#ae6d47", "#c9976d", "#efc3a6", "#2f8088"],
    glaze: { rim: "#6fb9b5", pool: "#21646b", foot: "#efc3a6" },
  },
  watercolour: {
    m: 110, segments: 120, material: "wc", noise: 0.16, outline: 0.016, ink: "#3b2a20", hatch: true, noBoard: true,
    palette: ["#dc9463", "#dc9463", "#da9160", "#db9262", "#dc9464", "#d78d5c", "#f6e2c7", "#4a9188"],
    glaze: { rim: "#d9894f", pool: "#2c6b65", foot: "#f3dcc0" },
  },
  pastel: {
    m: 36, segments: 96, material: "matte", noise: 0.5,
    palette: ["#d6a184", "#d6a184", "#cf9a7c", "#d09c7e", "#d2a083", "#e6c1a6", "#f5ddcc", "#a7cfc0"],
    glaze: { rim: "#dcefe8", pool: "#86b7a6", foot: "#f5ddcc" },
  },
};
const KILN = new THREE.Color("#ff8a3c");

function washGradient() {
  const t = new THREE.DataTexture(new Uint8Array([82, 82, 82, 255, 140, 140, 140, 255, 205, 205, 205, 255, 255, 255, 255, 255]), 4, 1);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Ink hatching under the piece, like the drawings' ground shadow. */
function hatchTexture() {
  const W = 512, H = 256, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  let seed = 3; const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  // A pale wash first, then loose horizontal strokes, denser near the middle.
  const wash = g.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W / 2);
  wash.addColorStop(0, "rgba(150,110,70,.28)"); wash.addColorStop(.7, "rgba(150,110,70,.1)"); wash.addColorStop(1, "rgba(150,110,70,0)");
  g.save(); g.scale(1, H / W); g.fillStyle = wash; g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, 7); g.fill(); g.restore();
  g.strokeStyle = "rgba(40,28,20,.85)"; g.lineCap = "round";
  for (let i = 0; i < 95; i++) {
    const y = H * (.18 + r() * .64), d = Math.abs(y - H / 2) / (H / 2);
    const half = W * (.48 - d * .3) * (.55 + r() * .45), cx = W / 2 + (r() - .5) * W * .12;
    g.lineWidth = 1 + r() * 1.4; g.globalAlpha = .5 + r() * .45 * (1 - d);
    g.beginPath(); g.moveTo(cx - half, y); g.lineTo(cx + half, y + (r() - .5) * 3); g.stroke();
  }
  return new THREE.CanvasTexture(c);
}

function toonGradient() {
  const t = new THREE.DataTexture(new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]), 3, 1);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

/** An "inverted hull" outline: the back faces, pushed out along the normals. */
function outlineMesh(geometry, color, thickness) {
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `vec3 transformed = position + normal * ${thickness.toFixed(4)};`);
  };
  return new THREE.Mesh(geometry, mat);
}

/* ---------- Scene ---------------------------------------------------------- */
/** Toon shading with soft wash bands, plus what makes it read as watercolour:
    pigment that pools unevenly, fine granulation and speckle, colour gathering
    at the edges of a wash, the paper showing through where the light hits,
    and the glaze mottled teal and rust. */
function watercolourMaterial() {
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, side: THREE.DoubleSide, gradientMap: washGradient() });
  const uGlaze = { value: 0 };
  mat.userData.uGlaze = uGlaze;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGlaze = uGlaze;
    sh.vertexShader = sh.vertexShader.replace("void main() {", "varying vec3 vObj;\nvoid main() {\n  vObj = position;");
    sh.fragmentShader = sh.fragmentShader.replace("void main() {", `
      varying vec3 vObj; uniform float uGlaze;
      float wh(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float wn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(mix(wh(i), wh(i + vec3(1,0,0)), f.x), mix(wh(i + vec3(0,1,0)), wh(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(wh(i + vec3(0,0,1)), wh(i + vec3(1,0,1)), f.x), mix(wh(i + vec3(0,1,1)), wh(i + vec3(1,1,1)), f.x), f.y), f.z); }
      float wf(vec3 p){ return wn(p) * .55 + wn(p * 2.3) * .3 + wn(p * 5.1) * .15; }
      void main() {`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <dithering_fragment>", `
      {
        vec3 c = gl_FragColor.rgb;
        vec3 V = normalize(vViewPosition), N = normalize(normal);
        // The glaze: teal that varies in depth and breaks to rust, more so low down and at the rim.
        float m1 = wf(vObj * vec3(5.5, 4.2, 5.5) + 1.7), m2 = wf(vObj * 13. + 9.);
        vec3 teal = mix(vec3(.16, .40, .38), vec3(.36, .62, .56), m2) * (.65 + .55 * max(dot(N, normalize(vec3(-.6, .7, .5))), 0.));
        vec3 rust = mix(vec3(.80, .48, .27), vec3(.90, .62, .38), m2) * (.7 + .45 * max(dot(N, normalize(vec3(-.6, .7, .5))), 0.));
        float breaks = smoothstep(.5, .62, m1 + (.75 - vObj.y) * .16 + (m2 - .5) * .25);
        vec3 glazed = mix(teal, rust, breaks);
        c = mix(c, glazed, uGlaze * .9);
        // Pigment pools unevenly and granulates, like a wash on paper.
        float pool = wf(vObj * 2.4 + 4.);
        c *= .9 + .2 * pool;
        c *= 1. - .07 * smoothstep(.6, .9, wn(vObj * 46.));
        // A few dark speckles, like the dots in the drawings.
        c *= 1. - .5 * step(.9965, wh(floor(vObj * 60.)));
        // Colour gathers at the edge of a wash.
        float edge = 1. - abs(dot(N, V));
        c *= 1. - .16 * smoothstep(.6, .97, edge);
        // Where the light is strongest, the paper shows through.
        float lum = dot(c, vec3(.3, .59, .11));
        c = mix(c, vec3(1.), smoothstep(.62, .9, lum + .1 * (pool - .5)) * .55);
        gl_FragColor.rgb = c;
      }
      #include <dithering_fragment>`);
  };
  return mat;
}

export function createClay(canvas, { reducedMotion = false, style: styleName = "toon" } = {}) {
  const style = STYLES[styleName] ?? STYLES.toon;
  const M = style.m, SEGMENTS = style.segments, SAMPLED = sampled(M);
  canvas.dataset.style = STYLES[styleName] ? styleName : "toon";

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = style.toneMap ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);

  const soft = style.material === "matte";
  scene.add(new THREE.HemisphereLight(0xfff3e6, 0x3b2a20, soft ? 1.5 : style.toneMap ? 0.9 : 0.8));
  const key = new THREE.DirectionalLight(0xfff1e0, soft ? 1.3 : style.toneMap ? 2.4 : 2.0);
  key.position.set(3, 5, 4);
  if (style.material === "wc") { key.position.set(-4, 4.5, 4.5); key.intensity = 2.1; scene.children.find((o) => o.isHemisphereLight).intensity = .5; }
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xc9dcff, style.toneMap ? 1.2 : 0.5);
  rim.position.set(-4, 3, -3);
  scene.add(rim);
  const kiln = new THREE.PointLight(0xff7a2a, 0, 8);
  kiln.position.set(0, 0.6, 1.6);
  scene.add(kiln);

  // Geometry: a grid of (profile point) x (angle), rebuilt in place each frame.
  const rows = SAMPLED[0].length, cols = SEGMENTS + 1;
  const positions = new Float32Array(rows * cols * 3);
  const colors = new Float32Array(rows * cols * 3);
  const uvs = new Float32Array(rows * cols * 2);
  const index = [];
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < SEGMENTS; j++) {
    const a = i * cols + j, b = a + cols;
    index.push(a, b, a + 1, b, b + 1, a + 1);
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    uvs[(i * cols + j) * 2] = j / SEGMENTS;
    uvs[(i * cols + j) * 2 + 1] = i / (rows - 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(index);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));

  const material = {
    physical: () => new THREE.MeshPhysicalMaterial({ vertexColors: true, side: THREE.DoubleSide, bumpMap: grainTexture(), clearcoatRoughness: 0.35 }),
    toon: () => new THREE.MeshToonMaterial({ vertexColors: true, side: THREE.DoubleSide, gradientMap: toonGradient() }),
    flat: () => new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
    faceted: () => new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true, roughness: 0.85 }),
    matte: () => new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1, metalness: 0 }),
    wc: () => watercolourMaterial(),
  }[style.material]();
  const piece = new THREE.Group();
  piece.add(new THREE.Mesh(geometry, material));
  if (style.outline) piece.add(outlineMesh(geometry, style.ink, style.outline));
  scene.add(piece);

  // Ink contours: rings around the outer wall and a few lines down it, the
  // way a potter sketches a form.
  let contours = null, ringRows = [], meridians = [];
  if (style.contours) {
    for (let i = 2; i < M - 1; i += 3) ringRows.push(i);
    for (let k = 0; k < 12; k++) meridians.push(Math.round((k / 12) * SEGMENTS));
    const count = ringRows.length * SEGMENTS + meridians.length * (M - 1);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 6), 3));
    contours = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: style.ink, transparent: true, opacity: 0.5 }));
    piece.add(contours);
  }

  // The wooden board the piece is built on - there is no wheel.
  const boardMat = {
    physical: () => new THREE.MeshStandardMaterial({ color: 0xa47a52, roughness: 0.8, transparent: true }),
    toon: () => new THREE.MeshToonMaterial({ color: 0xc9a06f, gradientMap: toonGradient(), transparent: true }),
    flat: () => new THREE.MeshBasicMaterial({ color: 0xe9dcc8, transparent: true }),
    faceted: () => new THREE.MeshStandardMaterial({ color: 0xb38a5c, flatShading: true, roughness: 0.8, transparent: true }),
    matte: () => new THREE.MeshStandardMaterial({ color: 0xdcc7ae, roughness: 1, transparent: true }),
    wc: () => new THREE.MeshBasicMaterial({ transparent: true }),
  }[style.material]();
  const boardGeo = new THREE.CylinderGeometry(1.45, 1.45, 0.09, style.material === "faceted" ? 10 : 64);
  const wheel = new THREE.Group();
  wheel.add(new THREE.Mesh(boardGeo, boardMat));
  if (style.outline) wheel.add(outlineMesh(boardGeo, style.ink, style.outline * 0.8));
  wheel.position.y = -0.05;
  if (!style.noBoard) scene.add(wheel);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 3.4),
    new THREE.MeshBasicMaterial({ map: style.hatch ? hatchTexture() : shadowTexture(), transparent: true, depthWrite: false, opacity: style.material === "flat" ? 0.35 : 1 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.09;
  if (style.hatch) { shadow.scale.set(1.25, 0.62, 1); shadow.position.y = -0.005; }
  scene.add(shadow);

  const palette = style.palette?.map((c) => new THREE.Color(c));
  const gz = style.glaze ? { rim: new THREE.Color(style.glaze.rim), pool: new THREE.Color(style.glaze.pool), foot: new THREE.Color(style.glaze.foot) } : { rim: GLAZE_RIM, pool: GLAZE_POOL, foot: BISQUE };
  const profile = SAMPLED[0].map((p) => [...p]);
  const base = new THREE.Color(), tmp = new THREE.Color();
  let stage = 0, shown = -1, spin = 0, last = performance.now(), running = true;

  function build(s) {
    const k = Math.min(Math.floor(s), SAMPLED.length - 2), t = smooth(clamp01(s - k));
    const A = SAMPLED[k], B = SAMPLED[k + 1], P = STAGES[k], Q = STAGES[k + 1];
    for (let i = 0; i < rows; i++) {
      profile[i][0] = lerp(A[i][0], B[i][0], t);
      profile[i][1] = lerp(A[i][1], B[i][1], t);
    }
    const n0 = style.noise;
    const rough = lerp(P.rough, Q.rough, t) * n0, asym = lerp(P.asym, Q.asym, t);
    const coils = lerp(P.coils, Q.coils, t), dents = lerp(P.dents, Q.dents, t);
    const height = Math.max(...profile.map((p) => p[1]));
    const glaze = clamp01(s - 6); // 0 before the glaze firing, 1 once glazed
    // The kiln: a warm glow that peaks halfway through the bisque firing.
    const glow = Math.max(0, 1 - Math.abs(s - 5.55) / 0.55);
    if (palette) base.copy(palette[k]).lerp(palette[k + 1], t);
    else base.set(P.color).lerp(tmp.set(Q.color), t);

    for (let i = 0; i < rows; i++) {
      const [r0, y] = profile[i];
      const inside = i >= M;
      const along = i / (rows - 1);
      for (let j = 0; j < cols; j++) {
        const a = (j / SEGMENTS) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        // Hand-worked roughness and the lopsidedness of a hand-built piece.
        let r = r0;
        if (r0 > 0.002) {
          r += rough * fbm(ca * 1.6 + 3, y * 2.2, sa * 1.6 + 7);
          r += asym * 0.06 * n0 * fbm(ca * 0.8 + 11, y * 1.1 + 2, sa * 0.8 - 5);
          r += asym * 0.07 * r0 * Math.cos(a - 0.8) + asym * 0.04 * r0 * Math.cos(2 * a + 1.3);
          // Thumb and finger dents pressed into the surface.
          r -= dents * Math.min(1, n0 * 2) * Math.pow(Math.max(0, noise3(ca * 2.6 + 1, y * 3.2, sa * 2.6 + 4)), 2) * 2.2;
          // Coils: rope-like rings stacked above the pinched base, each one
          // rolled by hand, so a little thicker or thinner around its length.
          if (coils > 0 && y > 0.66) {
            const ph = (y - 0.66) / 0.13, f = ph - Math.floor(ph);
            const rope = Math.sqrt(Math.max(0, 1 - Math.pow(2 * f - 1, 2)));
            r += coils * (rope - 0.62) * (1 + 0.35 * noise3(ca * 2 + Math.floor(ph) * 3.1, Math.floor(ph), sa * 2)) * (inside ? 0.7 : 1);
          }
        }
        const v = (i * cols + j) * 3;
        positions[v] = Math.max(0, r) * ca;
        positions[v + 1] = y;
        positions[v + 2] = Math.max(0, r) * sa;

        // Colour: the stage's clay colour; once glazed, a bare foot ring,
        // glaze pooling darker low and inside, and breaking lighter at the rim.
        tmp.copy(base);
        if (glaze > 0) {
          const foot = !inside && y < height * 0.045;
          if (foot) tmp.copy(gz.foot);
          else {
            const rimBreak = clamp01(1 - Math.abs(along - 0.5) * 14);
            tmp.lerp(gz.pool, (inside ? 0.35 : 0) + clamp01(0.25 - y / height) * 0.8);
            tmp.lerp(gz.rim, rimBreak * 0.7);
            tmp.lerp(gz.foot, 1 - glaze);
          }
        }
        if (style.material !== "physical" && glow > 0) tmp.lerp(KILN, glow * 0.3);
        colors[v] = tmp.r; colors[v + 1] = tmp.g; colors[v + 2] = tmp.b;
      }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.computeVertexNormals();
    // Weld the seam's normals so no line shows where the circle closes.
    const nrm = geometry.attributes.normal;
    for (let i = 0; i < rows; i++) {
      const a = i * cols, b = a + SEGMENTS;
      for (let c = 0; c < 3; c++) {
        const avg = (nrm.array[a * 3 + c] + nrm.array[b * 3 + c]) / 2;
        nrm.array[a * 3 + c] = nrm.array[b * 3 + c] = avg;
      }
    }
    nrm.needsUpdate = true;

    if (contours) {
      const out = contours.geometry.attributes.position.array;
      let o = 0;
      const put = (vi) => { out[o++] = positions[vi * 3]; out[o++] = positions[vi * 3 + 1]; out[o++] = positions[vi * 3 + 2]; };
      for (const i of ringRows) for (let j = 0; j < SEGMENTS; j++) { put(i * cols + j); put(i * cols + j + 1); }
      for (const j of meridians) for (let i = 0; i < M - 1; i++) { put(i * cols + j); put((i + 1) * cols + j); }
      contours.geometry.attributes.position.needsUpdate = true;
      contours.geometry.computeBoundingSphere();
    }

    if (style.material === "physical") {
      material.roughness = lerp(P.roughness, Q.roughness, t);
      material.clearcoat = lerp(P.clearcoat, Q.clearcoat, t);
      material.bumpScale = lerp(P.bump, Q.bump, t) * 0.6;
      material.emissive.setRGB(0.55, 0.16, 0.02).multiplyScalar(glow * 0.35);
    } else if (style.material === "wc") {
      material.userData.uGlaze.value = glaze;
    } else if (style.material === "matte") {
      material.roughness = lerp(1, 0.4, glaze);
    }
    kiln.intensity = glow * (style.toneMap ? 18 : 6);
    // The board stays while the piece is being made, and is left behind for the kiln.
    const onBoard = clamp01((5.3 - s) / 0.5);
    wheel.children.forEach((m) => { m.material.opacity = onBoard; });
    wheel.visible = onBoard > 0.01;
    canvas.dataset.stage = s.toFixed(2);
    canvas.dataset.glow = glow.toFixed(2);
    return glow;
  }

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Frame the tallest stage with room to spare, whatever the canvas shape.
    const dist = Math.max(7.2, 5.8 / Math.min(camera.aspect, 1.1));
    camera.position.set(0, 2.2, dist);
    camera.lookAt(0, 1.0, 0);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    // A slow turn, so every side of the piece shows.
    if (!reducedMotion) spin += dt * 0.3;
    piece.rotation.y = spin;
    if (Math.abs(stage - shown) > 0.0005) { build(stage); shown = stage; }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running) { last = performance.now(); requestAnimationFrame(frame); }
  });

  return {
    setStage(s) { stage = Math.min(7, Math.max(0, s)); },
    get stage() { return stage; },
  };
}
