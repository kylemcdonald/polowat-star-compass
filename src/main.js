import * as A from './astro.js';
import {
  FIGURES,
  HEADINGS,
  HOUSES,
  HOUSE_STEP,
  LANGUAGES,
  LOCATION,
  MAGNETIC,
  STARS,
  magneticDeclination,
} from './compass.js';
import { brightFieldStars } from './brightStars.js';
import { CONSTELLATIONS } from './constellations.js';

const { DEG, RAD } = A;
const LAT = LOCATION.lat;
const LON = LOCATION.lon;
const TZ_MS = LOCATION.utcOffsetHours * 3600000;

const STAR_GOLD = '#ffe51e';
const LABEL_GOLD = '#ffd75d';
const ARC_BLUE = '#1c8dff';
const POS = '#5fd8b0';
const NEG = '#ff8f6b';
const LABEL_FONT = '"Exo 2", "Trebuchet MS", sans-serif';
const CLIP_COS = -0.92;
const MIN_FOV = 15;
const MAX_FOV = 290;
const DEFAULT_FOV = 124;
const CARDINALS = [
  { az: 0, letter: 'N' },
  { az: 90, letter: 'E' },
  { az: 180, letter: 'S' },
  { az: 270, letter: 'W' },
];

// ---------------------------------------------------------------------------
// State

const state = {
  t: defaultTime(),
  playing: true,
  speed: 300,
  yaw: 90,
  pitch: null,
  fov: DEFAULT_FOV,
  show: {
    paths: true,
    labels: true,
    deviation: true,
    milkyway: true,
    fieldStars: true,
    grid: false,
    constellations: false,
    sunMoon: true,
    table: false,
  },
  north: 'true',
  legendOpen: true,
  selected: null,
  hover: null,
  viewTween: null,
  mirror: false,
};

function defaultTime() {
  // Tonight at 20:30 local time.
  const local = new Date(Date.now() + TZ_MS);
  const ms = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 20, 30) - TZ_MS;
  return ms;
}

// ---------------------------------------------------------------------------
// Star data prepared for the current epoch

const compassStarIds = [...new Set(HOUSES.map((house) => house.star))];
const housesByStar = Object.fromEntries(compassStarIds.map((id) => [id, HOUSES.filter((h) => h.star === id)]));
const fieldVectors = brightFieldStars.map(([id, ra, dec, mag]) => ({ id, mag, v: A.radecToVector(ra, dec) }));
// Constellation lines, subdivided every couple of degrees so they bend correctly in the projection.
function densify(line) {
  const out = [];
  for (let i = 0; i < line.length - 1; i += 1) {
    const a = A.radecToVector(line[i][0], line[i][1]);
    const b = A.radecToVector(line[i + 1][0], line[i + 1][1]);
    const angle = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
    const n = Math.max(1, Math.ceil(angle / (2 * DEG)));
    for (let j = 0; j < n; j += 1) {
      const f = j / n;
      const v = [0, 1, 2].map((c) => a[c] * (1 - f) + b[c] * f);
      const len = Math.hypot(v[0], v[1], v[2]);
      out.push(v.map((c) => c / len));
    }
  }
  const last = line[line.length - 1];
  out.push(A.radecToVector(last[0], last[1]));
  return out;
}
const constellationVectors = CONSTELLATIONS.map((c) => ({
  id: c.id,
  name: c.name.toUpperCase(),
  label: A.radecToVector(c.label[0], c.label[1]),
  lines: c.lines.map(densify),
}));
const figureVectors = Object.fromEntries(
  Object.entries(FIGURES).map(([key, figure]) => [
    key,
    { ...figure, vectors: figure.stars.map((s) => ({ ...s, v: A.radecToVector(s.ra, s.dec) })) },
  ]),
);

let epoch = null;

function prepareEpoch(t) {
  if (epoch && Math.abs(t - epoch.t) < 20 * 86400000) {
    return;
  }

  const P = A.precessionMatrix(t);
  const stars = {};

  compassStarIds.forEach((id) => {
    const base = STARS[id];
    const ofDate = A.vectorToRadec(A.apply(P, A.radecToVector(base.ra, base.dec)));
    const rs = A.riseSet(ofDate.dec, LAT);
    const circle = [];
    for (let i = 0; i <= 360; i += 1) {
      circle.push({ h: i - 180, v: A.horizonFromHourAngle(ofDate.dec, i - 180, LAT) });
    }
    stars[id] = { id, ...base, raDate: ofDate.ra, decDate: ofDate.dec, rs, circle, v: A.radecToVector(base.ra, base.dec) };
  });

  const cruxDate = figureVectors.crux.vectors.map((s) => A.vectorToRadec(A.apply(P, s.v)));
  const acrux = stars.acrux;

  const cruxAt = (ha) => cruxDate.map((s) => A.horizonFromHourAngle(s.dec, ha + (acrux.raDate - s.ra) * 15, LAT));
  const tiltAt = (ha) => {
    const pts = cruxAt(ha);
    return A.tiltFromVertical(pts[0], pts[1]);
  };
  const solveTilt = (lo, hi, target) => {
    let a = lo;
    let b = hi;
    const f = (h) => tiltAt(h) - target;
    let fa = f(a);
    for (let i = 0; i < 60; i += 1) {
      const m = (a + b) / 2;
      const fm = f(m);
      if (Math.sign(fm) === Math.sign(fa)) {
        a = m;
        fa = fm;
      } else {
        b = m;
      }
    }
    return (a + b) / 2;
  };

  const houses = HOUSES.map((house) => {
    const star = stars[house.star];
    const nominal = house.k * HOUSE_STEP;
    let ha = null;
    if (house.event === 'rise') ha = star.rs.riseHA;
    if (house.event === 'set') ha = star.rs.setHA;
    if (house.event === 'transit') ha = 0;
    if (house.event === 'tilt45') ha = house.side === 'rising' ? solveTilt(-170, 0, -45) : solveTilt(0, 170, 45);

    if (house.event === 'pole') {
      const amp = Math.asin(Math.cos(star.decDate * DEG) / Math.cos(LAT * DEG)) * RAD;
      return { ...house, nominal, amplitude: amp, ha: null, az: null, delta: null };
    }

    const v = A.horizonFromHourAngle(star.decDate, ha, LAT);
    const { az, alt } = A.vectorToAzAlt(v);
    const exactAz = house.event === 'rise' ? star.rs.riseAz : house.event === 'set' ? star.rs.setAz : az;
    return { ...house, nominal, ha, v, az: exactAz, alt };
  });

  const ghostCrux = houses
    .filter((h) => h.star === 'acrux')
    .map((h) => ({ k: h.k, points: cruxAt(h.ha) }));

  epoch = { t, P, stars, houses, cruxDate, ghostCrux, declination: magneticDeclination(t) };
  applyReference();
}

// Degrees from true north to the north the compass points are counted from.
function northOffset() {
  return state.north === 'magnetic' ? epoch.declination : 0;
}

function toBearing(az) {
  return (((az - northOffset()) % 360) + 360) % 360;
}

// Place the 32 points relative to true or magnetic north and recompute each deviation.
function applyReference() {
  const off = northOffset();
  epoch.houses.forEach((h) => {
    h.ideal = h.nominal + off;
    h.bearing = h.az == null ? null : toBearing(h.az);
    h.delta = h.az == null ? null : A.angleDiff(h.az, h.ideal);
  });
  buildTable();
}

// ---------------------------------------------------------------------------
// WebGL background: sky gradient, Milky Way, ocean

const glCanvas = document.getElementById('sky');
const overlay = document.getElementById('overlay');
const ctx = overlay.getContext('2d');
const gl = glCanvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false });
let glProgram = null;
let glUniforms = {};
let milkyReady = false;

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uK;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uFwd;
uniform mat3 uHorToGal;
uniform sampler2D uMilky;
uniform float uMilkyGain;
uniform float uMirror;
out vec4 outColor;
const float PI = 3.14159265358979;

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uK;
  p.x *= uMirror;
  float r2 = dot(p, p);
  vec3 c = vec3(4.0 * p.x, 4.0 * p.y, 4.0 - r2) / (4.0 + r2);
  vec3 d = normalize(c.x * uRight + c.y * uUp + c.z * uFwd);
  float alt = d.z;

  vec3 zenith = vec3(0.008, 0.035, 0.20);
  vec3 band = vec3(0.035, 0.12, 0.33);
  vec3 sky = mix(band, zenith, smoothstep(0.0, 0.5, alt));

  vec3 g = uHorToGal * d;
  float l = atan(g.y, g.x);
  float b = asin(clamp(g.z, -1.0, 1.0));
  vec2 uv = vec2(fract(0.5 - l / (2.0 * PI)), 0.5 - b / PI);
  vec2 dx = dFdx(uv);
  vec2 dy = dFdy(uv);
  dx.x -= floor(dx.x + 0.5);
  dy.x -= floor(dy.x + 0.5);
  vec3 mw = textureGrad(uMilky, uv, dx, dy).rgb;
  mw = max(mw - 0.015, 0.0) * uMilkyGain;

  vec3 skyColor = sky + mw * mix(0.5, 1.0, smoothstep(0.0, 0.35, alt));

  vec3 oceanTop = vec3(0.03, 0.10, 0.30);
  vec3 oceanDeep = vec3(0.006, 0.025, 0.11);
  vec3 ocean = mix(oceanTop, oceanDeep, smoothstep(0.0, -0.45, alt)) + mw * 0.07;

  float aa = fwidth(alt) * 1.5;
  vec3 color = mix(ocean, skyColor, smoothstep(-aa, aa, alt));
  color += vec3(0.05, 0.16, 0.38) * exp(-abs(alt) * 28.0) * 0.55;
  outColor = vec4(color, 1.0);
}`;

function initGL() {
  if (!gl) {
    return;
  }
  const compile = (type, src) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }
    return shader;
  };
  glProgram = gl.createProgram();
  gl.attachShader(glProgram, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(glProgram, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(glProgram);
  if (!gl.getProgramParameter(glProgram, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(glProgram));
  }
  gl.useProgram(glProgram);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(glProgram, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  ['uRes', 'uK', 'uRight', 'uUp', 'uFwd', 'uHorToGal', 'uMilky', 'uMilkyGain', 'uMirror'].forEach((name) => {
    glUniforms[name] = gl.getUniformLocation(glProgram, name);
  });

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  const image = new Image();
  image.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const ext = gl.getExtension('EXT_texture_filter_anisotropic');
    if (ext) {
      gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    }
    milkyReady = true;
    invalidate();
  };
  image.src = 'assets/milkyway-4096.jpg';
  gl.uniform1i(glUniforms.uMilky, 0);
}

// ---------------------------------------------------------------------------
// Camera / projection (stereographic, like a planetarium program)

let W = 0;
let H = 0;
let dpr = 1;
let view = null;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  [glCanvas, overlay].forEach((c) => {
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
  });
}

function makeView() {
  const yaw = state.yaw * DEG;
  const fwd = A.azAltToVector(state.yaw, state.pitch);
  const right = [Math.cos(yaw), -Math.sin(yaw), 0];
  const up = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ];
  const k = (Math.max(W, H) / 2) / (2 * Math.tan((state.fov * DEG) / 4));
  return { fwd, right, up, k, mirror: state.mirror ? -1 : 1 };
}

function project(v) {
  const cz = v[0] * view.fwd[0] + v[1] * view.fwd[1] + v[2] * view.fwd[2];
  if (cz < CLIP_COS) {
    return null;
  }
  const cx = (v[0] * view.right[0] + v[1] * view.right[1] + v[2] * view.right[2]) * view.mirror;
  const cy = v[0] * view.up[0] + v[1] * view.up[1] + v[2] * view.up[2];
  const s = (2 / (1 + cz)) * view.k;
  return { x: W / 2 + cx * s, y: H / 2 - cy * s };
}

function unproject(x, y) {
  const px = ((x - W / 2) / view.k) * view.mirror;
  const py = (H / 2 - y) / view.k;
  const r2 = px * px + py * py;
  const c = [(4 * px) / (4 + r2), (4 * py) / (4 + r2), (4 - r2) / (4 + r2)];
  return [0, 1, 2].map((i) => c[0] * view.right[i] + c[1] * view.up[i] + c[2] * view.fwd[i]);
}

function onScreen(p, margin = 40) {
  return p && p.x > -margin && p.x < W + margin && p.y > -margin && p.y < H + margin;
}

// Pixels covered by one degree near the centre of the view.
function pxPerDegree() {
  return view.k * DEG;
}

// ---------------------------------------------------------------------------
// Drawing helpers

function strokePolyline(points, maxJump) {
  let open = false;
  let prev = null;
  ctx.beginPath();
  points.forEach((v) => {
    const p = v ? project(v) : null;
    if (!p) {
      open = false;
      prev = null;
      return;
    }
    if (open && prev && Math.hypot(p.x - prev.x, p.y - prev.y) > maxJump) {
      open = false;
    }
    if (open) {
      ctx.lineTo(p.x, p.y);
    } else {
      ctx.moveTo(p.x, p.y);
      open = true;
    }
    prev = p;
  });
  ctx.stroke();
}

function starPath(x, y, outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function setFont(weight, size) {
  ctx.font = `${weight} ${size}px ${LABEL_FONT}`;
}

function setSpacing(px) {
  if ('letterSpacing' in ctx) {
    ctx.letterSpacing = `${px}px`;
  }
}

function fmtDelta(d) {
  if (d == null) return '';
  const sign = d > 0.05 ? '+' : d < -0.05 ? '−' : '±';
  return `${sign}${Math.abs(d).toFixed(1)}°`;
}

function deltaColor(d) {
  if (Math.abs(d) < 0.05) return '#e8eefc';
  return d > 0 ? POS : NEG;
}

function cardinalFor(az) {
  const names = ['N', 'NbE', 'NNE', 'NEbN', 'NE', 'NEbE', 'ENE', 'EbN', 'E', 'EbS', 'ESE', 'SEbE', 'SE', 'SEbS', 'SSE', 'SbE',
    'S', 'SbW', 'SSW', 'SWbS', 'SW', 'SWbW', 'WSW', 'WbS', 'W', 'WbN', 'WNW', 'NWbW', 'NW', 'NWbN', 'NNW', 'NbW'];
  return names[Math.round(((az % 360) + 360) % 360 / HOUSE_STEP) % 32];
}

// Draw a block of label lines; returns its bounding box. Lines: { text, weight, size, color, spacing }
function measureLines(lines) {
  let width = 0;
  let height = 0;
  lines.forEach((line) => {
    setFont(line.weight, line.size);
    setSpacing(line.spacing ?? 0);
    const w = ctx.measureText(line.text).width;
    width = Math.max(width, w);
    height += line.size * 1.18;
  });
  setSpacing(0);
  return { width, height };
}

function drawLines(lines, x, y, align) {
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  let cy = y;
  lines.forEach((line) => {
    setFont(line.weight, line.size);
    setSpacing(line.spacing ?? 0);
    ctx.fillStyle = line.color;
    ctx.globalAlpha = line.alpha ?? 1;
    ctx.fillText(line.text, x, cy);
    cy += line.size * 1.18;
  });
  ctx.globalAlpha = 1;
  setSpacing(0);
}

// Polowat name (gold) over the Western name (blue-grey).
function nameLines(polowat, western, scale = 1, opts = {}) {
  const lines = [
    { text: polowat.toUpperCase(), weight: 700, size: 13 * scale, color: LABEL_GOLD, spacing: 0.8 * scale },
  ];
  if (!opts.polowatOnly) {
    lines.push({ text: western.toUpperCase(), weight: 400, size: 10 * scale, color: '#9fb8e8', spacing: 0.5 * scale });
  }
  return lines;
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ---------------------------------------------------------------------------
// Scene layers

let frame = null;

function computeFrame() {
  const lst = A.lstDegrees(state.t, LON);
  const E = A.equatorToHorizonMatrix(lst, LAT);
  const M = A.mul(E, epoch.P);
  const sun = A.sunRadec(state.t);
  const sunV = A.apply(E, A.radecToVector(sun.ra, sun.dec));
  const moon = A.moonRadec(state.t);
  const moonV = A.topocentric(A.apply(E, A.radecToVector(moon.ra, moon.dec)), moon.distance);
  // Phase angle at the Moon (0 = full, 180 = new), from the Sun-Moon elongation.
  const elongation = Math.acos(Math.max(-1, Math.min(1, sunV[0] * moonV[0] + sunV[1] * moonV[1] + sunV[2] * moonV[2])));
  const phaseAngle = Math.PI - elongation;
  return {
    lst, E, M, sunV, moonV, phaseAngle,
    sunAlt: A.vectorToAzAlt(sunV).alt,
    moonLit: (1 + Math.cos(phaseAngle)) / 2,
    moonWaxing: A.angleDiff(moon.ra * 15, sun.ra * 15) > 0,
  };
}

function drawGrid() {
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(120, 175, 255, 0.13)';
  ctx.setLineDash([]);
  for (let alt = 15; alt < 90; alt += 15) {
    const pts = [];
    for (let az = 0; az <= 360; az += 2) pts.push(A.azAltToVector(az, alt));
    strokePolyline(pts, W);
  }
  for (let k = 0; k < 32; k += 1) {
    const pts = [];
    for (let alt = 0; alt <= 90; alt += 2) pts.push(A.azAltToVector(k * HOUSE_STEP + northOffset(), alt));
    ctx.strokeStyle = k % 8 === 0 ? 'rgba(120, 175, 255, 0.22)' : 'rgba(120, 175, 255, 0.09)';
    strokePolyline(pts, W);
  }
}

function pathStyle(id) {
  const active = state.selected === id || state.hover === id;
  const dim = state.selected && state.selected !== id && !active;
  return { active, dim };
}

function drawPaths() {
  const maxJump = Math.max(W, H) * 0.5;
  compassStarIds.forEach((id) => {
    const star = epoch.stars[id];
    const { active, dim } = pathStyle(id);
    const color = active ? LABEL_GOLD : ARC_BLUE;
    const aboveAlpha = active ? 0.95 : dim ? 0.28 : 0.62;
    const belowAlpha = active ? 0.5 : dim ? 0.1 : 0.22;
    const width = active ? 2.4 : 1.6;

    // Split the circle into runs above and below the horizon, inserting the crossing points.
    const runs = [];
    let current = null;
    star.circle.forEach((pt, i) => {
      const above = pt.v[2] >= 0;
      if (!current || current.above !== above) {
        if (current && i > 0) {
          const a = star.circle[i - 1].v;
          const b = pt.v;
          const f = a[2] / (a[2] - b[2]);
          const cross = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, 0];
          current.points.push(cross);
          current = { above, points: [cross] };
        } else {
          current = { above, points: [] };
        }
        runs.push(current);
      }
      current.points.push(pt.v);
    });

    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    runs.forEach((run) => {
      ctx.globalAlpha = run.above ? aboveAlpha : belowAlpha;
      ctx.setLineDash(run.above ? [9, 6] : [3, 6]);
      strokePolyline(run.points, maxJump);
    });
    ctx.setLineDash([]);

    // Arrowheads in the direction of motion.
    ctx.fillStyle = color;
    for (let i = 15; i < 360; i += 30) {
      const v = star.circle[i].v;
      const p = project(v);
      const q = project(star.circle[i + 1].v);
      const o = project(star.circle[i - 1].v);
      if (!p || !q || !o || !onScreen(p)) continue;
      const dx = q.x - o.x;
      const dy = q.y - o.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.5 || len > maxJump) continue;
      const ux = dx / len;
      const uy = dy / len;
      const s = active ? 7 : 5.5;
      ctx.globalAlpha = v[2] >= 0 ? aboveAlpha : belowAlpha;
      ctx.beginPath();
      ctx.moveTo(p.x + ux * s, p.y + uy * s);
      ctx.lineTo(p.x - ux * s * 0.8 - uy * s * 0.7, p.y - uy * s * 0.8 + ux * s * 0.7);
      ctx.lineTo(p.x - ux * s * 0.35, p.y - uy * s * 0.35);
      ctx.lineTo(p.x - ux * s * 0.8 + uy * s * 0.7, p.y - uy * s * 0.8 - ux * s * 0.7);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
}

function drawGhostCrux() {
  const highlight = state.selected === 'acrux' || state.hover === 'acrux';
  epoch.ghostCrux.forEach(({ points }) => {
    const pts = points.map((v) => project(v));
    if (pts.some((p) => !p)) return;
    ctx.strokeStyle = highlight ? 'rgba(255, 215, 93, 0.7)' : 'rgba(255, 229, 30, 0.32)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([2, 3]);
    FIGURES.crux.lines.forEach(([a, b]) => {
      ctx.beginPath();
      ctx.moveTo(pts[a].x, pts[a].y);
      ctx.lineTo(pts[b].x, pts[b].y);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.fillStyle = highlight ? 'rgba(255, 215, 93, 0.8)' : 'rgba(255, 229, 30, 0.4)';
    pts.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, i === 0 ? 2.6 : 1.8, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

function starZoomScale() {
  return Math.min(1.6, Math.max(0.7, (128 / state.fov) ** 0.35));
}

function drawFieldStars() {
  const zs = starZoomScale();
  fieldVectors.forEach((s) => {
    const v = A.apply(frame.M, s.v);
    const p = project(v);
    if (!onScreen(p, 4)) return;
    const r = Math.max(0.55, Math.min(3.0, 2.5 - 0.45 * s.mag)) * zs;
    const alpha = Math.max(0.28, Math.min(1, 1.05 - 0.16 * s.mag)) * (v[2] < 0 ? 0.28 : 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#eef3ff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawFigures() {
  Object.values(figureVectors).forEach((figure) => {
    const pts = figure.vectors.map((s) => {
      const v = A.apply(frame.M, s.v);
      return { v, p: project(v) };
    });
    ctx.strokeStyle = 'rgba(200, 190, 60, 0.55)';
    ctx.lineWidth = 1.4;
    figure.lines.forEach(([a, b]) => {
      const pa = pts[a].p;
      const pb = pts[b].p;
      if (!pa || !pb || Math.hypot(pa.x - pb.x, pa.y - pb.y) > W) return;
      ctx.globalAlpha = pts[a].v[2] < 0 && pts[b].v[2] < 0 ? 0.3 : 1;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    if (figure === figureVectors.crux || figure === figureVectors.belt) {
      pts.forEach(({ v, p }, i) => {
        if (!onScreen(p)) return;
        const mag = figure.vectors[i].mag;
        const r = (5 + Math.max(0, 2.6 - mag) * 2.4) * starZoomScale();
        ctx.globalAlpha = v[2] < 0 ? 0.35 : 0.95;
        ctx.fillStyle = STAR_GOLD;
        starPath(p.x, p.y, r, r * 0.42);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
  });
}

let starScreen = [];
const labelChoice = new Map();

function compassStarLabelHouse(id) {
  const houses = housesByStar[id];
  if (id !== 'acrux') {
    return houses[0];
  }
  // The Southern Cross is named for where it is in its turn around the pole.
  const ha = A.angleDiff(frame.lst, epoch.stars.acrux.raDate * 15);
  let best = houses[0];
  let bestDiff = Infinity;
  houses.forEach((h) => {
    const d = Math.abs(A.angleDiff(ha, h.ha ?? 0));
    if (d < bestDiff) {
      bestDiff = d;
      best = h;
    }
  });
  return best;
}

function drawCompassStars() {
  starScreen = [];
  const zs = starZoomScale();
  compassStarIds.forEach((id) => {
    const star = epoch.stars[id];
    const v = A.apply(frame.M, star.v);
    const p = project(v);
    if (!onScreen(p)) return;
    const active = state.selected === id || state.hover === id;
    const below = v[2] < 0;
    const r = (6 + Math.max(0, 2.8 - star.mag) * 2.6) * zs * (active ? 1.25 : 1);

    ctx.globalAlpha = below ? 0.4 : 1;
    ctx.shadowColor = 'rgba(255, 229, 30, 0.85)';
    ctx.shadowBlur = active ? 16 : 8;
    ctx.fillStyle = STAR_GOLD;
    if (star.cluster) {
      // Pleiades: a little cluster of points.
      [[0, 0], [-0.9, -0.5], [0.8, -0.7], [-0.3, 0.9], [0.9, 0.5], [-1.1, 0.4]].forEach(([dx, dy], i) => {
        ctx.beginPath();
        ctx.arc(p.x + dx * r * 0.7, p.y + dy * r * 0.7, i === 0 ? 2.6 : 1.8, 0, Math.PI * 2);
        ctx.fill();
      });
    } else {
      starPath(p.x, p.y, r, r * 0.42);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    if (active) {
      ctx.strokeStyle = LABEL_GOLD;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    starScreen.push({ id, p, r, v, below, mag: star.mag });
  });
}

const uiBlocks = ['.title-block', '#info', '#legend', '#legend-open', '.view-dock', '.time-dock', '#table'].map((sel) => document.querySelector(sel));

function uiRects() {
  return uiBlocks
    .filter((el) => el && !el.hidden && el.offsetParent !== null)
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
}

function drawStarLabels() {
  // Keep star names clear of the panels drawn over the sky.
  const placed = uiRects();
  const uiCount = placed.length;
  houseScreen.forEach(({ rect }) => placed.push(rect));
  bodyScreen.forEach(({ rect }) => placed.push(rect));
  const scale = Math.min(1.15, Math.max(0.8, starZoomScale()));
  const order = [...starScreen].sort((a, b) => {
    const pa = state.selected === a.id ? -10 : a.mag;
    const pb = state.selected === b.id ? -10 : b.mag;
    return pa - pb;
  });

  order.forEach((s) => {
    const house = compassStarLabelHouse(s.id);
    // Crux is named for where it is in its turn; other stars carry their own name.
    const lines = s.id === 'acrux'
      ? nameLines(house.polowat, `Crux · ${house.western}`, scale)
      : nameLines(STARS[s.id].polowat, house.western, scale);
    const size = measureLines(lines);
    const gap = s.r + 6;
    const candidates = [
      { dx: gap, dy: -size.height / 2, align: 'left' },
      { dx: -gap, dy: -size.height / 2, align: 'right' },
      { dx: gap * 0.7, dy: -size.height - gap * 0.4, align: 'left' },
      { dx: gap * 0.7, dy: gap * 0.4, align: 'left' },
      { dx: -gap * 0.7, dy: -size.height - gap * 0.4, align: 'right' },
      { dx: -gap * 0.7, dy: gap * 0.4, align: 'right' },
      { dx: gap + 30, dy: -size.height - 26, align: 'left', leader: true },
      { dx: gap + 30, dy: 26, align: 'left', leader: true },
      { dx: -gap - 30, dy: -size.height - 26, align: 'right', leader: true },
      { dx: -gap - 30, dy: 26, align: 'right', leader: true },
    ];
    let choice = null;
    let rect = null;
    const previous = labelChoice.get(s.id);
    const tryOrder = previous != null ? [candidates[previous], ...candidates.filter((_, i) => i !== previous)] : candidates;
    for (const c of tryOrder) {
      const x0 = c.align === 'left' ? s.p.x + c.dx : s.p.x + c.dx - size.width;
      const r = { x: x0 - 2, y: s.p.y + c.dy - 2, w: size.width + 4, h: size.height + 4 };
      const hitsStar = starScreen.some((o) => o.id !== s.id && Math.hypot(o.p.x - (r.x + r.w / 2), o.p.y - (r.y + r.h / 2)) < Math.min(r.w, r.h) / 2);
      if (!placed.some((q) => rectsOverlap(q, r)) && !hitsStar) {
        choice = c;
        rect = r;
        labelChoice.set(s.id, candidates.indexOf(c));
        break;
      }
    }
    if (!choice) {
      choice = candidates[0];
      const x0 = s.p.x + choice.dx;
      rect = { x: x0, y: s.p.y + choice.dy, w: size.width, h: size.height };
      // Nowhere free: overlap other names if we must, but never draw under a panel.
      if (placed.slice(0, uiCount).some((q) => rectsOverlap(q, rect))) return;
    }
    placed.push(rect);

    const alpha = s.below ? 0.45 : 1;
    if (choice.leader) {
      ctx.strokeStyle = 'rgba(255, 215, 93, 0.5)';
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(s.p.x + Math.sign(choice.dx) * s.r, s.p.y);
      ctx.lineTo(s.p.x + choice.dx, s.p.y + choice.dy + (choice.dy < 0 ? size.height : 0));
      ctx.stroke();
    }
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 4;
    lines.forEach((l) => {
      l.alpha = alpha;
    });
    drawLines(lines, s.p.x + choice.dx, s.p.y + choice.dy, choice.align);
    ctx.shadowBlur = 0;
    s.labelRect = rect;
  });
}

let houseScreen = [];

function drawHorizon() {
  // Horizon line.
  const pts = [];
  for (let az = 0; az <= 360; az += 1) pts.push(A.azAltToVector(az, 0));
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(28, 141, 255, 0.35)';
  ctx.lineWidth = 6;
  strokePolyline(pts, W);
  ctx.strokeStyle = 'rgba(150, 205, 255, 0.85)';
  ctx.lineWidth = 1.4;
  strokePolyline(pts, W);

  // Minor ticks every 5 degrees.
  ctx.strokeStyle = 'rgba(170, 210, 255, 0.45)';
  ctx.lineWidth = 1;
  const off = northOffset();
  for (let az = 0; az < 360; az += 5) {
    const a = project(A.azAltToVector(az + off, 0));
    const b = project(A.azAltToVector(az + off, -0.6));
    if (!onScreen(a) || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function drawHouses() {
  houseScreen = [];
  const ppd = pxPerDegree();
  const spacing = ppd * HOUSE_STEP;
  const detail = spacing > 62 ? 'full' : spacing > 30 ? 'name' : 'none';
  const scale = Math.min(1.1, Math.max(0.8, spacing / 120));

  epoch.houses.forEach((house) => {
    const tickTop = project(A.azAltToVector(house.ideal, 0));
    const tickBottom = project(A.azAltToVector(house.ideal, -1.6));
    if (!onScreen(tickTop, 80) || !tickBottom) return;
    const active = state.selected === house.star || state.hover === house.star;

    // Ideal house tick.
    ctx.strokeStyle = active ? LABEL_GOLD : '#ffffff';
    ctx.lineWidth = house.k % 8 === 0 ? 2.4 : 1.6;
    ctx.beginPath();
    ctx.moveTo(tickTop.x, tickTop.y);
    ctx.lineTo(tickBottom.x, tickBottom.y);
    ctx.stroke();

    // Where the star really marks this point, and the deviation along the horizon.
    if (state.show.deviation && house.az != null) {
      const color = deltaColor(house.delta);
      const arc = [];
      const steps = Math.max(2, Math.ceil(Math.abs(house.delta) * 2));
      const depth = house.k % 2 === 0 ? -0.25 : -0.85;
      for (let i = 0; i <= steps; i += 1) {
        arc.push(A.azAltToVector(house.ideal + (house.delta * i) / steps, depth));
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = active ? 3.5 : 2.5;
      ctx.globalAlpha = 0.9;
      strokePolyline(arc, W);
      ctx.globalAlpha = 1;

      if (house.event === 'tilt45' || house.event === 'transit') {
        // Drop line from Acrux's position at that moment down to the horizon.
        const drop = [];
        for (let alt = house.alt; alt >= 0; alt -= 0.5) drop.push(A.azAltToVector(house.az, alt));
        drop.push(A.azAltToVector(house.az, 0));
        ctx.strokeStyle = active ? 'rgba(255, 215, 93, 0.85)' : 'rgba(255, 229, 30, 0.45)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);
        strokePolyline(drop, W);
        ctx.setLineDash([]);
        const m = project(house.v);
        if (m) {
          ctx.strokeStyle = active ? LABEL_GOLD : 'rgba(255, 229, 30, 0.7)';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(m.x, m.y, 6, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      const mark = project(A.azAltToVector(house.az, 0));
      if (mark) {
        ctx.fillStyle = STAR_GOLD;
        ctx.strokeStyle = '#1a1300';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(mark.x, mark.y - 5);
        ctx.lineTo(mark.x + 4, mark.y);
        ctx.lineTo(mark.x, mark.y + 5);
        ctx.lineTo(mark.x - 4, mark.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    if (house.event === 'pole' && state.show.deviation) {
      const polaris = A.vectorToAzAlt(A.apply(frame.M, epoch.stars.polaris.v));
      house.liveDelta = A.angleDiff(polaris.az, house.ideal);
      const mark = project(A.azAltToVector(polaris.az, 0));
      if (mark) {
        ctx.fillStyle = STAR_GOLD;
        ctx.beginPath();
        ctx.arc(mark.x, mark.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (detail === 'none' || !state.show.labels) {
      houseScreen.push({ house, rect: { x: tickTop.x - 12, y: tickTop.y - 4, w: 24, h: 24 } });
      return;
    }

    const lines = nameLines(house.polowat, house.western, scale, { polowatOnly: detail === 'name' });
    if (state.show.deviation) {
      let text;
      let color;
      if (house.event === 'pole') {
        const off = northOffset();
        text = off ? `Δ ${fmtDelta(-off)} ±${house.amplitude.toFixed(1)}°` : `±${house.amplitude.toFixed(1)}° · never sets`;
        color = off ? deltaColor(-off) : '#e8eefc';
      } else {
        text = `Δ ${fmtDelta(house.delta)}`;
        color = deltaColor(house.delta);
      }
      lines.unshift({ text, weight: 700, size: 12 * scale, color, spacing: 0.3 });
    }
    const size = measureLines(lines);
    const row = house.k % 2;
    // Push the block outward from the horizon (down when facing the horizon, away from the centre overhead).
    const out = outwardAt(house.ideal);
    const extent = Math.abs(out.x) * size.width + Math.abs(out.y) * size.height;
    const reach = 10 + row * (extent + 8) + extent / 2;
    const cx = tickBottom.x + out.x * reach;
    const cy = tickBottom.y + out.y * reach;
    const x = cx;
    const y = cy - size.height / 2;

    if (row === 1) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tickBottom.x + out.x * 2, tickBottom.y + out.y * 2);
      ctx.lineTo(cx - out.x * (extent / 2 + 3), cy - out.y * (extent / 2 + 3));
      ctx.stroke();
    }
    const rect = { x: x - size.width / 2 - 6, y: y - 4, w: size.width + 12, h: size.height + 6 };
    if (active) {
      ctx.fillStyle = 'rgba(255, 215, 93, 0.12)';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 4;
    drawLines(lines, x, y, 'center');
    ctx.shadowBlur = 0;
    houseScreen.push({ house, rect });
  });
}

// Screen-space unit vector pointing from the horizon at `az` toward the ground.
function outwardAt(az) {
  const a = project(A.azAltToVector(az, 0));
  const b = project(A.azAltToVector(az, -2));
  if (!a || !b) return { x: 0, y: 1 };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

function drawCardinals() {
  const ppd = pxPerDegree();
  const big = Math.min(34, Math.max(18, ppd * 1.9));
  const off = northOffset();
  if (off) drawTrueNorth(8 + 10.5 * 1.2 + big * 1.2 + 10);
  CARDINALS.forEach(({ az: nominal, letter }) => {
    const az = nominal + off;
    const p = project(A.azAltToVector(az, 0));
    if (!onScreen(p, 60)) return;
    const out = outwardAt(az);
    const inward = { x: -out.x, y: -out.y };
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 6;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const heading = nominal === 90 ? HEADINGS.rising : nominal === 270 ? HEADINGS.setting : null;
    const stack = [];
    if (off && nominal === 0) {
      stack.push({ text: 'MAGNETIC', weight: 600, size: 10.5, color: '#9fb8e8' });
    }
    if (heading) {
      stack.push({ text: heading.western.toUpperCase(), weight: 500, size: 10.5, color: '#9fb8e8' });
      stack.push({ text: heading.polowat.toUpperCase(), weight: 700, size: 13, color: LABEL_GOLD });
    }
    stack.push({ text: letter, weight: 700, size: big, color: '#ffffff' });
    let dist = 8;
    stack.forEach((line) => {
      dist += line.size * 0.6;
      setFont(line.weight, line.size);
      setSpacing(line.size < 20 ? 1.2 : 0);
      ctx.fillStyle = line.color;
      ctx.fillText(line.text, p.x + inward.x * dist, p.y + inward.y * dist);
      dist += line.size * 0.6;
    });
    setSpacing(0);
    ctx.shadowBlur = 0;
  });
}

// Small marker for true north while the compass is counted from magnetic north.
// It rises above the magnetic N label so the two never sit side by side.
function drawTrueNorth(reach) {
  const a = project(A.azAltToVector(0, 0));
  if (!onScreen(a, 60)) return;
  const out = outwardAt(0);
  const b = { x: a.x - out.x * reach, y: a.y - out.y * reach };
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.lineWidth = 1.4;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 6;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  setFont(600, 10.5);
  setSpacing(1.2);
  ctx.fillStyle = '#e8eefc';
  ctx.fillText('TRUE NORTH', b.x + (dx / len) * 9, b.y + (dy / len) * 9);
  setSpacing(0);
  ctx.shadowBlur = 0;
}

function drawConstellations() {
  ctx.setLineDash([]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgb(150, 190, 255)';
  const maxJump = Math.max(W, H) * 0.5;
  constellationVectors.forEach((c) => {
    c.lines.forEach((line) => {
      const pts = line.map((v) => A.apply(frame.M, v));
      // Bright above the horizon, faint below; segments that cross keep the bright style.
      const above = pts.map((v, i) => (v[2] >= 0 || pts[i - 1]?.[2] >= 0 || pts[i + 1]?.[2] >= 0 ? v : null));
      const below = pts.map((v) => (v[2] < 0.01 ? v : null));
      ctx.globalAlpha = 0.1;
      strokePolyline(below, maxJump);
      ctx.globalAlpha = 0.4;
      strokePolyline(above, maxJump);
    });
  });
}

// Drawn after the compass labels so names can step aside for them.
function drawConstellationNames() {
  const taken = uiRects();
  houseScreen.forEach(({ rect }) => taken.push(rect));
  starScreen.forEach((s) => {
    if (s.labelRect) taken.push(s.labelRect);
    taken.push({ x: s.p.x - s.r, y: s.p.y - s.r, w: s.r * 2, h: s.r * 2 });
  });
  setFont(500, 10.5);
  setSpacing(2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#a9c4ff';
  constellationVectors.forEach((c) => {
    const v = A.apply(frame.M, c.label);
    const p = project(v);
    if (!onScreen(p, 0)) return;
    const w = ctx.measureText(c.name).width;
    const rect = { x: p.x - w / 2, y: p.y - 7, w, h: 14 };
    if (taken.some((q) => rectsOverlap(q, rect))) return;
    ctx.globalAlpha = v[2] < 0 ? 0.18 : 0.55;
    ctx.fillText(c.name, p.x, p.y);
  });
  ctx.globalAlpha = 1;
  setSpacing(0);
}

let bodyScreen = [];

function glowDisk(p, r, glowR, inner, edge, glowColor) {
  const glow = ctx.createRadialGradient(p.x, p.y, r * 0.6, p.x, p.y, glowR);
  glow.addColorStop(0, glowColor);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
  ctx.fill();
  const disk = ctx.createRadialGradient(p.x - r * 0.25, p.y - r * 0.25, 0, p.x, p.y, r);
  disk.addColorStop(0, inner);
  disk.addColorStop(1, edge);
  ctx.fillStyle = disk;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
}

// Sun and Moon, drawn at their true size when zoomed in and never smaller than a marker.
// The Moon's lit side faces the Sun, with the terminator drawn as a half-ellipse.
function drawSunMoon() {
  const ppd = pxPerDegree();
  const zs = starZoomScale();
  const bodies = [];
  const label = (p, r, text, alpha) => {
    setFont(600, 10.5);
    setSpacing(1.2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#e8eefc';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 4;
    ctx.fillText(text, p.x, p.y + r + 5);
    ctx.shadowBlur = 0;
    setSpacing(0);
    const w = ctx.measureText(text).width + 12;
    return { x: p.x - Math.max(w / 2, r), y: p.y - r, w: Math.max(w, r * 2), h: r * 2 + 19 };
  };

  const sp = project(frame.sunV);
  if (onScreen(sp, 80)) {
    const r = Math.max(ppd * 0.267, 9 * zs);
    const alpha = frame.sunV[2] < 0 ? 0.35 : 1;
    ctx.globalAlpha = alpha;
    glowDisk(sp, r, r * 3.4, '#fffbe3', '#ffcf5a', 'rgba(255, 170, 46, 0.55)');
    bodies.push({ id: 'sun', p: sp, r, rect: label(sp, r, 'SUN', alpha) });
  }

  const mp = project(frame.moonV);
  if (onScreen(mp, 80)) {
    const r = Math.max(ppd * 0.26, 8 * zs);
    const alpha = frame.moonV[2] < 0 ? 0.35 : 1;
    // Screen direction toward the Sun along the sky.
    const s = frame.sunV;
    const m = frame.moonV;
    const d = s[0] * m[0] + s[1] * m[1] + s[2] * m[2];
    const toward = [s[0] - d * m[0], s[1] - d * m[1], s[2] - d * m[2]];
    const len = Math.hypot(toward[0], toward[1], toward[2]) || 1;
    const q = project(m.map((c, i) => c + (toward[i] / len) * 0.01));
    const angle = q ? Math.atan2(q.y - mp.y, q.x - mp.x) : 0;
    const c = Math.cos(frame.phaseAngle);

    ctx.globalAlpha = alpha;
    const glow = ctx.createRadialGradient(mp.x, mp.y, r * 0.8, mp.x, mp.y, r * 2.6);
    glow.addColorStop(0, `rgba(215, 228, 255, ${0.05 + 0.2 * frame.moonLit})`);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(mp.x, mp.y, r * 2.6, 0, Math.PI * 2);
    ctx.fill();
    // Earthshine on the dark side.
    ctx.fillStyle = 'rgba(70, 82, 120, 0.85)';
    ctx.beginPath();
    ctx.arc(mp.x, mp.y, r, 0, Math.PI * 2);
    ctx.fill();
    // Lit part: the sunward half-disk, closed by the terminator.
    ctx.save();
    ctx.translate(mp.x, mp.y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
    ctx.ellipse(0, 0, Math.abs(c) * r, r, 0, Math.PI / 2, -Math.PI / 2, c < 0);
    ctx.closePath();
    ctx.fillStyle = '#f4f1e4';
    ctx.fill();
    ctx.restore();
    const pct = Math.round(frame.moonLit * 100);
    const phase = pct >= 98 ? 'full' : pct <= 2 ? 'new' : `${pct}% ${frame.moonWaxing ? 'waxing' : 'waning'}`;
    bodies.push({ id: 'moon', p: mp, r, rect: label(mp, r, `MOON · ${phase}`, alpha) });
  }
  ctx.globalAlpha = 1;
  return bodies;
}

function render() {
  const now = performance.now();
  view = makeView();
  frame = computeFrame();

  if (gl && glProgram) {
    gl.viewport(0, 0, glCanvas.width, glCanvas.height);
    const horToGal = A.mul(A.EQ_TO_GAL, A.transpose(frame.M));
    gl.uniform2f(glUniforms.uRes, glCanvas.width, glCanvas.height);
    gl.uniform1f(glUniforms.uK, view.k * dpr);
    gl.uniform3fv(glUniforms.uRight, view.right);
    gl.uniform3fv(glUniforms.uUp, view.up);
    gl.uniform3fv(glUniforms.uFwd, view.fwd);
    gl.uniformMatrix3fv(glUniforms.uHorToGal, false, A.transpose(horToGal));
    gl.uniform1f(glUniforms.uMirror, view.mirror);
    gl.uniform1f(glUniforms.uMilkyGain, state.show.milkyway && milkyReady ? 0.85 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (state.show.grid) drawGrid();
  if (state.show.constellations) drawConstellations();
  if (state.show.paths) drawPaths();
  if (state.show.paths) drawGhostCrux();
  if (state.show.fieldStars) drawFieldStars();
  bodyScreen = state.show.sunMoon ? drawSunMoon() : [];
  drawFigures();
  drawCompassStars();
  drawHorizon();
  drawHouses();
  drawCardinals();
  if (state.show.labels) drawStarLabels();
  if (state.show.constellations && state.show.labels) drawConstellationNames();

  return now;
}

// ---------------------------------------------------------------------------
// UI: info panel, table, controls

const infoEl = document.getElementById('info');
const tableEl = document.getElementById('table');
const tableBody = document.getElementById('house-table');
const playBtn = document.getElementById('play');
const speedEl = document.getElementById('speed');
const timeEl = document.getElementById('time-slider');
const dayEl = document.getElementById('day-slider');
const timeLabelEl = document.getElementById('time-label');
const dayLabelEl = document.getElementById('day-label');
const readoutEl = document.getElementById('time-readout');
const sideStackEl = document.querySelector('.side-stack');
const legendEl = document.getElementById('legend');
const legendBodyEl = document.getElementById('legend-body');
const legendOpenBtn = document.getElementById('legend-open');
const X_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

document.getElementById('location-line').textContent = `${LOCATION.name} · ${LAT.toFixed(2)}° N, ${LON.toFixed(2)}° E`;
const tableNoteEl = document.getElementById('table-note');

function tableNote() {
  const north = state.north === 'magnetic'
    ? `magnetic north (declination ${fmtDelta(epoch.declination)} east of true, ${MAGNETIC.model})`
    : 'true north';
  tableNoteEl.innerHTML = `Bearings are degrees clockwise from ${north}. Δ = where the star actually rises, sets or stands
  minus the ideal point (360°/32 = 11.25° apart); <span class="pos">+</span> is clockwise, <span class="neg">−</span> counter‑clockwise.
  Geometric horizon, no refraction.`;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function nameHtml(house, field) {
  return esc(house[field]);
}

function deltaHtml(d) {
  if (d == null) return '';
  const cls = Math.abs(d) < 0.05 ? '' : d > 0 ? 'pos' : 'neg';
  return `<span class="${cls}">${fmtDelta(d)}</span>`;
}

function buildTable() {
  const rows = epoch.houses.map((h) => {
    const star = STARS[h.star];
    const actual = h.event === 'pole' ? `${northOffset() ? `${toBearing(0).toFixed(1)}° ` : ''}±${h.amplitude.toFixed(1)}°` : `${h.bearing.toFixed(1)}°`;
    const how = { rise: 'rises', set: 'sets', transit: 'on meridian', tilt45: 'Crux at 45°', pole: 'circumpolar' }[h.event];
    return `<tr data-k="${h.k}" class="${h.k === 17 ? 'side-break' : ''}">
      <td class="num">${h.nominal.toFixed(2)}°</td>
      <td>${cardinalFor(h.nominal)}</td>
      <td class="pol">${nameHtml(h, 'polowat')}</td>
      <td>${esc(h.western)}</td>
      <td>${esc(star.name)} <small style="color:var(--muted)">${how}</small></td>
      <td class="num">${actual}</td>
      <td class="num">${h.event === 'pole' ? (northOffset() ? deltaHtml(-northOffset()) : '') : deltaHtml(h.delta)}</td>
    </tr>`;
  });
  tableBody.innerHTML = `<thead><tr><th>Point</th><th></th><th>${LANGUAGES.polowat}</th>
    <th>${LANGUAGES.western}</th><th>Star</th><th>Bearing ${state.north === 'magnetic' ? '(mag)' : '(true)'}</th><th>Δ</th></tr></thead><tbody>${rows.join('')}</tbody>`;
  tableNote();
  tableBody.querySelectorAll('tr[data-k]').forEach((tr) => {
    tr.addEventListener('click', () => {
      const house = epoch.houses[Number(tr.dataset.k)];
      select(house.star);
      state.mirror = false;
      lookAt(house.ideal, framingPitch(DEFAULT_FOV), DEFAULT_FOV);
    });
  });
  highlightTable();
}

function highlightTable() {
  tableBody.querySelectorAll('tr[data-k]').forEach((tr) => {
    const house = HOUSES[Number(tr.dataset.k)];
    tr.classList.toggle('is-selected', house.star === state.selected);
  });
}

function fmtLocalTime(ms) {
  const d = new Date(ms + TZ_MS);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function nextEventTime(raDateHours, haDeg) {
  // Next time after state.t when the star is at hour angle haDeg.
  const lstNow = A.lstDegrees(state.t, LON);
  const targetLst = raDateHours * 15 + haDeg;
  const deg = ((targetLst - lstNow) % 360 + 360) % 360;
  return state.t + (deg / 360.98564736629) * 86400000;
}

function legendHtml() {
  return `<div class="legend-row"><span style="color:var(--gold);font-family:var(--label-font);font-weight:700">MAILAP</span><span class="lang">${LANGUAGES.polowat}</span></div>
    <div class="legend-row"><span style="color:#9fb8e8;font-size:0.8rem">ALTAIR</span><span class="lang">${LANGUAGES.western}</span></div>
    <div class="legend-row"><span class="swatch"></span><span>Diurnal path (dotted below the horizon)</span></div>
    <div class="legend-row"><span style="color:#fff">┃</span><span>Ideal compass point, every 11.25°</span></div>
    <div class="legend-row"><span style="color:var(--star-gold)">◆</span><span>Where the star actually rises / sets</span></div>
    <div class="legend-row"><span><span class="pos">+Δ</span> / <span class="neg">−Δ</span></span><span>clockwise / counter‑clockwise of the point</span></div>
    <div class="legend-row"><span style="color:#fff">N</span><span>${state.north === 'magnetic'
    ? `Points counted from magnetic north, ${fmtDelta(epoch.declination)} east of true (${MAGNETIC.model})`
    : 'Points counted from true north'}</span></div>
    <a class="csv-link" data-csv download="polowat-star-names.csv">Download names (.csv)</a>
    <p class="hint">Drag to look around, scroll or pinch to zoom, click a star or a horizon label for details. Space plays / pauses.</p>
    <p class="hint">Made with the supervision of Mario Benito from Inowon in Polowat.</p>
    <p class="hint credits">Milky Way: <a href="https://noirlab.edu/public/images/noirlab2430b/" target="_blank" rel="noopener">NOIRLab/NSF/AURA/E.&nbsp;Slawik/M.&nbsp;Zamani</a>
      (CC&nbsp;BY&nbsp;4.0) · Stars: <a href="https://github.com/astronexus/HYG-Database" target="_blank" rel="noopener">HYG Database</a>
      · Constellations: <a href="https://github.com/ofrohn/d3-celestial" target="_blank" rel="noopener">d3-celestial</a>
      · Magnetic declination: NOAA/BGS World Magnetic Model 2025</p>`;
}

function eventRow(house, star) {
  const titles = { rise: 'Rises', set: 'Sets', transit: 'On the meridian', tilt45: house.side === 'rising' ? 'Leaning 45°, rising side' : 'Leaning 45°, setting side', pole: 'Circumpolar' };
  let detail;
  if (house.event === 'pole') {
    detail = `<dl><dt>Point</dt><dd>${house.nominal.toFixed(2)}° (${cardinalFor(house.nominal)})</dd>
      <dt>Swing</dt><dd>±${house.amplitude.toFixed(2)}° about true north${northOffset() ? ` (${toBearing(0).toFixed(1)}° magnetic)` : ''}, never sets</dd>
      <dt>Now</dt><dd>${deltaHtml(house.liveDelta ?? 0)}</dd></dl>`;
  } else {
    const when = fmtLocalTime(nextEventTime(star.raDate, house.ha));
    const dir = Math.abs(house.delta) < 0.05 ? 'on the point' : `${Math.abs(house.delta).toFixed(1)}° ${house.delta > 0 ? 'clockwise' : 'counter‑clockwise'} of the point`;
    detail = `<dl><dt>Point</dt><dd>${house.nominal.toFixed(2)}° (${cardinalFor(house.nominal)})</dd>
      <dt>Star</dt><dd>${house.bearing.toFixed(2)}°${house.alt > 0.5 ? ` at ${house.alt.toFixed(1)}° altitude` : ''}</dd>
      <dt>Δ</dt><dd>${deltaHtml(house.delta)} · ${dir}</dd>
      <dt>Next</dt><dd>${when} local</dd></dl>`;
  }
  return `<div class="event"><div class="event-title"><span style="color:var(--gold)">${nameHtml(house, 'polowat')}</span>
    <small>${titles[house.event]}</small></div>${detail}</div>`;
}

let lastInfoKey = '';
let lastLegendKey = '';

function updateLegend() {
  const key = `${state.north}|${epoch.declination.toFixed(2)}`;
  if (key === lastLegendKey) return;
  lastLegendKey = key;
  legendBodyEl.innerHTML = legendHtml();
  linkCsv();
}

// The 32 point names as a CSV: one header row, then a row per point clockwise from north.
const csvField = (value) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
const namesCsv = [
  [LANGUAGES.polowat, LANGUAGES.western],
  ...HOUSES.map((h) => [h.polowat, h.western]),
].map((row) => row.map(csvField).join(',')).join('\r\n');
// The byte-order mark lets spreadsheet apps read the accented letters as UTF-8.
const namesCsvUrl = URL.createObjectURL(new Blob(['\ufeff', namesCsv, '\r\n'], { type: 'text/csv;charset=utf-8' }));

function linkCsv() {
  document.querySelectorAll('a[data-csv]').forEach((a) => {
    a.href = namesCsvUrl;
  });
}

function setLegendOpen(open, remember = true) {
  state.legendOpen = open;
  legendEl.hidden = !open;
  legendOpenBtn.hidden = open;
  if (!remember) return;
  try {
    localStorage.setItem('polowat.legend', open ? 'open' : 'closed');
  } catch {
    // Remembering the choice is optional.
  }
}

legendOpenBtn.addEventListener('click', () => setLegendOpen(true));
document.getElementById('legend-close').addEventListener('click', () => setLegendOpen(false));

function updateInfo(force = false) {
  updateLegend();
  if (!frame) return;
  const id = state.selected;
  const key = `${id}|${Math.floor(state.t / 60000)}|${epoch.t}|${state.north}`;
  if (!force && key === lastInfoKey) return;
  lastInfoKey = key;
  sideStackEl.classList.toggle('has-selection', Boolean(id));
  if (!id) {
    infoEl.hidden = true;
    infoEl.innerHTML = '';
    return;
  }
  infoEl.hidden = false;
  const star = epoch.stars[id];
  const houses = epoch.houses.filter((h) => h.star === id);
  const first = houses[0];
  const v = A.apply(frame.M, star.v);
  const now = A.vectorToAzAlt(v);
  const crux = id === 'acrux';
  infoEl.innerHTML = `
    <button type="button" class="modal-close info-close" id="clear-selection" aria-label="Close star details" title="Close (Esc)">${X_ICON}</button>
    <h2>${esc(STARS[id].polowat)}</h2>
    <div class="western">${crux ? 'Southern Cross · Acrux (α Cru)' : `${esc(first.western)}${first.western === star.name ? '' : ` · ${esc(star.name)}`} (${esc(star.designation)})`}</div>
    <dl>
      <dt>Dec (of date)</dt><dd>${star.decDate >= 0 ? '+' : '−'}${Math.abs(star.decDate).toFixed(2)}°</dd>
      <dt>Now</dt><dd>${state.north === 'magnetic' ? 'bearing (mag)' : 'az'} ${toBearing(now.az).toFixed(1)}°, alt ${now.alt.toFixed(1)}°${now.alt < 0 ? ' (below horizon)' : ''}</dd>
    </dl>
    ${houses.map((h) => eventRow(h, star)).join('')}`;
  document.getElementById('clear-selection').addEventListener('click', () => select(null));
}

function select(id) {
  state.selected = id;
  updateInfo(true);
  highlightTable();
}

const DAY_MS = 86400000;

// Local calendar pieces of a UTC instant (Polowat keeps UTC+10 all year).
function localParts(ms) {
  const d = new Date(ms + TZ_MS);
  const year = d.getUTCFullYear();
  const midnight = Date.UTC(year, d.getUTCMonth(), d.getUTCDate()) - TZ_MS;
  const yearStart = Date.UTC(year, 0, 1) - TZ_MS;
  return {
    year,
    midnight,
    yearStart,
    minutes: (ms - midnight) / 60000,
    day: Math.round((midnight - yearStart) / DAY_MS) + 1,
    days: (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY_MS,
  };
}

let lastTimeKey = '';

function updateTimeUI() {
  const sunAlt = frame.sunAlt;
  const key = `${Math.floor(state.t / 60000)}|${state.playing}|${sunAlt.toFixed(0)}`;
  if (key === lastTimeKey) return;
  lastTimeKey = key;
  const p = localParts(state.t);
  const local = new Date(state.t + TZ_MS);
  const day = local.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const phase = sunAlt > 0 ? 'day' : sunAlt > -6 ? 'civil twilight' : sunAlt > -12 ? 'nautical twilight' : sunAlt > -18 ? 'astronomical twilight' : 'night';
  timeLabelEl.textContent = `Time ${fmtLocalTime(state.t)}`;
  dayLabelEl.textContent = day;
  dayEl.max = String(p.days);
  timeEl.value = String(Math.floor(p.minutes));
  dayEl.value = String(p.day);
  readoutEl.innerHTML = `${p.year} · ${LOCATION.zoneName} <small>· sun ${sunAlt.toFixed(0)}° · ${phase}</small>`;
  playBtn.textContent = state.playing ? '❚❚' : '▶';
}

playBtn.addEventListener('click', () => {
  state.playing = !state.playing;
});

speedEl.addEventListener('change', () => {
  state.speed = Number(speedEl.value);
});

const clamp01 = (value) => Math.min(1, Math.max(0, value));

// Range input whose drag locks the pointer, so dragging keeps going past the ends and wraps
// around (e.g. 23:59 -> 00:00). Clicking still jumps to the clicked position. Same control as tntm.
// onChange(wrapped, raw): raw is the unwrapped value during a drag, null for keyboard input.
function loopingRange(input, { period, round, onStart, onChange }) {
  const wrap = (raw) => {
    const min = Number(input.min);
    const p = period();
    const wrapped = min + ((((raw - min) % p) + p) % p);
    return round ? round(wrapped) : wrapped;
  };

  input.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const min = Number(input.min);
    const max = Number(input.max);
    const rect = input.getBoundingClientRect();
    const unitsPerPixel = (max - min) / Math.max(rect.width, 1);
    let current = min + clamp01((event.clientX - rect.left) / Math.max(rect.width, 1)) * (max - min);
    let lastX = event.clientX;
    onStart?.();
    onChange(wrap(current), current);
    input.focus();

    const handleMove = (moveEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return;
      // Locked pointers only report movement; without the lock, follow the cursor.
      const dx = document.pointerLockElement === input ? moveEvent.movementX : moveEvent.clientX - lastX;
      lastX = moveEvent.clientX;
      current += dx * unitsPerPixel;
      onChange(wrap(current), current);
    };
    const stop = (endEvent) => {
      if (endEvent.pointerId !== event.pointerId) return;
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', stop);
      document.removeEventListener('pointercancel', stop);
      if (document.pointerLockElement === input) {
        document.exitPointerLock();
      }
    };
    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', stop);
    document.addEventListener('pointercancel', stop);
    if (event.pointerType === 'mouse') {
      try {
        Promise.resolve(input.requestPointerLock?.()).catch(() => {});
      } catch {
        // Pointer lock is optional; without it the drag still works within the window.
      }
    }
  });

  // Keyboard (arrow keys) still works through the native input.
  input.addEventListener('input', () => {
    onStart?.();
    onChange(Number(input.value), null);
  });
}

let timeDragMidnight = 0;

loopingRange(timeEl, {
  period: () => 1440,
  onStart: () => {
    state.playing = false;
    timeDragMidnight = localParts(state.t).midnight;
  },
  // Dragging past midnight carries on into the next (or previous) day.
  onChange: (minutes, raw) => {
    state.t = raw == null
      ? localParts(state.t).midnight + minutes * 60000
      : timeDragMidnight + Math.round(raw) * 60000;
  },
});

loopingRange(dayEl, {
  period: () => Number(dayEl.max),
  round: Math.floor,
  onChange: (day) => {
    const p = localParts(state.t);
    state.t = p.yearStart + (day - 1) * DAY_MS + (state.t - p.midnight);
  },
});

document.getElementById('now').addEventListener('click', () => {
  state.t = Date.now();
  state.speed = 1;
  speedEl.value = '1';
});

document.querySelectorAll('#facing button').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.zenith) {
      // The whole sky laid out like the shirt: mirrored, east at the top, north on the left.
      state.mirror = true;
      lookAt(270, 90, zenithFov());
    } else {
      state.mirror = false;
      lookAt(Number(btn.dataset.yaw), framingPitch(DEFAULT_FOV), DEFAULT_FOV);
    }
  });
});

function syncFacingButtons() {
  document.querySelectorAll('#facing button').forEach((btn) => {
    const active = btn.dataset.zenith
      ? state.pitch > 80 && state.mirror
      : state.pitch <= 80 && Math.abs(A.angleDiff(state.yaw, Number(btn.dataset.yaw))) < 1;
    btn.classList.toggle('is-active', active);
  });
}

document.querySelectorAll('#toggles button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.toggle;
    state.show[key] = !state.show[key];
    btn.classList.toggle('is-active', state.show[key]);
    if (key === 'table') {
      tableEl.hidden = !state.show.table;
    }
  });
});

function setNorth(north) {
  state.north = north === 'magnetic' ? 'magnetic' : 'true';
  document.querySelectorAll('#north button').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.north === state.north);
  });
  applyReference();
  updateInfo(true);
}

document.querySelectorAll('#north button').forEach((btn) => {
  btn.addEventListener('click', () => setNorth(btn.dataset.north));
});

document.getElementById('table-close').addEventListener('click', () => {
  state.show.table = false;
  tableEl.hidden = true;
  document.querySelector('[data-toggle="table"]').classList.remove('is-active');
});

// Pitch that puts the horizon a little below the middle of the screen, leaving room for its labels.
function framingPitch(fov) {
  const k = (Math.max(W, H) / 2) / (2 * Math.tan((fov * DEG) / 4));
  return 2 * Math.atan((0.15 * H) / (2 * k)) * RAD;
}

// Field of view that fits the whole horizon circle on screen when looking straight up.
function zenithFov() {
  const radius = Math.max(120, Math.min(W, H) / 2 - (W < 760 ? 70 : 105));
  return Math.min(MAX_FOV, 4 * Math.atan((Math.max(W, H) / 2) / radius) * RAD);
}

function lookAt(yaw, pitch, fov) {
  const fromYaw = state.yaw;
  state.viewTween = {
    start: performance.now(),
    duration: 700,
    from: { yaw: fromYaw, pitch: state.pitch, fov: state.fov },
    to: { yaw: fromYaw + A.angleDiff(yaw, fromYaw), pitch, fov: fov ?? state.fov },
  };
}

function stepTween(now) {
  const tw = state.viewTween;
  if (!tw) return;
  const u = Math.min(1, (now - tw.start) / tw.duration);
  const e = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
  state.yaw = tw.from.yaw + (tw.to.yaw - tw.from.yaw) * e;
  state.pitch = tw.from.pitch + (tw.to.pitch - tw.from.pitch) * e;
  state.fov = tw.from.fov + (tw.to.fov - tw.from.fov) * e;
  if (u >= 1) {
    state.yaw = ((state.yaw % 360) + 360) % 360;
    state.viewTween = null;
  }
}

// Pointer interaction: drag to look, wheel / pinch to zoom, click to select.

const pointers = new Map();
let dragMoved = 0;
let pinchStart = null;

function hitTest(x, y) {
  let best = null;
  let bestD = 22;
  starScreen.forEach((s) => {
    const d = Math.hypot(s.p.x - x, s.p.y - y) - s.r * 0.5;
    if (d < bestD) {
      bestD = d;
      best = s.id;
    }
    if (!best && s.labelRect && x >= s.labelRect.x && x <= s.labelRect.x + s.labelRect.w && y >= s.labelRect.y && y <= s.labelRect.y + s.labelRect.h) {
      best = s.id;
    }
  });
  if (best) return best;
  const house = houseScreen.find(({ rect }) => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h);
  return house ? house.house.star : null;
}

overlay.addEventListener('pointerdown', (event) => {
  overlay.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  dragMoved = 0;
  state.viewTween = null;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), fov: state.fov };
  }
});

overlay.addEventListener('pointermove', (event) => {
  const prev = pointers.get(event.pointerId);
  if (!prev) {
    const id = hitTest(event.clientX, event.clientY);
    if (id !== state.hover) state.hover = id;
    overlay.classList.toggle('is-hovering', Boolean(id));
    return;
  }
  const cur = { x: event.clientX, y: event.clientY };
  pointers.set(event.pointerId, cur);
  if (pointers.size === 2 && pinchStart) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    state.fov = Math.min(MAX_FOV, Math.max(MIN_FOV, pinchStart.fov * (pinchStart.dist / Math.max(dist, 1))));
    dragMoved += 10;
    return;
  }
  const dx = cur.x - prev.x;
  const dy = cur.y - prev.y;
  dragMoved += Math.abs(dx) + Math.abs(dy);
  if (dragMoved > 3) overlay.classList.add('is-dragging');
  const radPerPx = 1 / view.k;
  state.yaw = (state.yaw - dx * view.mirror * radPerPx * RAD + 360) % 360;
  state.pitch = Math.min(90, Math.max(-35, state.pitch + dy * radPerPx * RAD));
});

function endPointer(event) {
  if (!pointers.has(event.pointerId)) return;
  pointers.delete(event.pointerId);
  if (pointers.size < 2) pinchStart = null;
  overlay.classList.remove('is-dragging');
  if (dragMoved <= 4 && pointers.size === 0) {
    const id = hitTest(event.clientX, event.clientY);
    select(id === state.selected ? null : id);
  }
}

overlay.addEventListener('pointerup', endPointer);
overlay.addEventListener('pointercancel', endPointer);
overlay.addEventListener('pointerleave', () => {
  if (pointers.size === 0) state.hover = null;
});

overlay.addEventListener('wheel', (event) => {
  event.preventDefault();
  // Scroll only zooms; looking around is done by dragging.
  if (state.viewTween) {
    state.viewTween.to.fov = Math.min(MAX_FOV, Math.max(MIN_FOV, state.viewTween.to.fov * Math.exp(event.deltaY * 0.0012)));
    return;
  }
  state.fov = Math.min(MAX_FOV, Math.max(MIN_FOV, state.fov * Math.exp(event.deltaY * 0.0012)));
}, { passive: false });

window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  if (event.code === 'Space') {
    event.preventDefault();
    state.playing = !state.playing;
  } else if (event.key === 'ArrowLeft') {
    state.yaw = (state.yaw - 5 + 360) % 360;
  } else if (event.key === 'ArrowRight') {
    state.yaw = (state.yaw + 5) % 360;
  } else if (event.key === 'ArrowUp') {
    state.pitch = Math.min(90, state.pitch + 5);
  } else if (event.key === 'ArrowDown') {
    state.pitch = Math.max(-35, state.pitch - 5);
  } else if (event.key === 'Escape') {
    if (state.selected) select(null);
    else if (state.legendOpen) setLegendOpen(false);
  }
});

window.addEventListener('resize', () => {
  resize();
  invalidate();
});

// ---------------------------------------------------------------------------
// Main loop

// Frames are only drawn when the view or the time has changed. The loop keeps running while
// the clock plays or the camera glides, and otherwise sleeps until an input event wakes it.

let rafId = 0;
let lastFrame = null;
let lastRenderKey = '';
let forceRender = true;
let fontsReady = false;

function requestRender() {
  if (!rafId) rafId = requestAnimationFrame(tick);
}

function invalidate() {
  forceRender = true;
  requestRender();
}

function renderKey() {
  // Time steps that move the sky by less than ~0.2 px don't count as a change.
  const pxPerMs = (view ? view.k : 500) * DEG * (360.98564736629 / 86400000);
  const quantum = Math.max(1, 0.2 / pxPerMs);
  return [
    Math.floor(state.t / quantum), state.yaw, state.pitch, state.fov, state.mirror, W, H, dpr,
    state.north, state.selected, state.hover, state.legendOpen, milkyReady, fontsReady,
    JSON.stringify(state.show),
  ].join('|');
}

let renderCount = 0;

function tick(now) {
  rafId = 0;
  const dt = lastFrame == null ? 0 : Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (state.playing) {
    state.t += dt * 1000 * state.speed;
  }
  prepareEpoch(state.t);
  stepTween(now);
  const key = renderKey();
  if (forceRender || key !== lastRenderKey) {
    forceRender = false;
    lastRenderKey = key;
    render();
    renderCount += 1;
    syncFacingButtons();
  }
  updateTimeUI();
  updateInfo();
  if (state.playing || state.viewTween) {
    requestRender();
  } else {
    lastFrame = null;
  }
}

// Any input might change what is drawn; tick() decides whether it actually did.
['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel', 'keydown', 'input', 'change', 'click'].forEach((type) => {
  window.addEventListener(type, requestRender, { capture: true, passive: true });
});

// For checking from the console that idle frames are skipped.
window.polowatRenderCount = () => renderCount;

const params = new URLSearchParams(window.location.search);
if (params.has('t')) state.t = Date.parse(params.get('t')) || state.t;
if (params.has('yaw')) state.yaw = Number(params.get('yaw'));
if (params.has('pitch')) state.pitch = Number(params.get('pitch'));
if (params.has('fov')) state.fov = Number(params.get('fov'));
if (params.has('paused')) state.playing = false;
if (params.has('select')) state.selected = params.get('select');
if (params.has('mirror')) state.mirror = true;
if (params.has('constellations')) state.show.constellations = true;
if (params.get('north') === 'magnetic') state.north = 'magnetic';
document.querySelectorAll('#toggles button').forEach((btn) => {
  btn.classList.toggle('is-active', Boolean(state.show[btn.dataset.toggle]));
});

resize();
if (state.pitch == null) state.pitch = framingPitch(state.fov);
try {
  initGL();
} catch (error) {
  console.error(error);
}
prepareEpoch(state.t);
setNorth(state.north);
speedEl.value = String(state.speed);
let storedLegend = null;
try {
  storedLegend = localStorage.getItem('polowat.legend');
} catch {
  storedLegend = null;
}
// Hidden until asked for with the ? button; after that the last choice is remembered.
setLegendOpen(storedLegend === 'open', false);
document.fonts?.ready?.then(() => {
  fontsReady = true;
  updateInfo(true);
  invalidate();
});
requestRender();
