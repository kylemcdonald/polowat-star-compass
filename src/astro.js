// Small astronomy toolkit: time, precession, horizon coordinates.
// Horizon frame: x = east, y = north, z = up. Azimuth is measured from north through east.

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export function julianDate(ms) {
  return ms / 86400000 + 2440587.5;
}

export function centuriesSinceJ2000(ms) {
  return (julianDate(ms) - 2451545.0) / 36525;
}

// Greenwich mean sidereal time in degrees.
export function gmstDegrees(ms) {
  const d = julianDate(ms) - 2451545.0;
  const t = d / 36525;
  const gmst = 280.46061837 + 360.98564736629 * d + 0.000387933 * t * t - (t * t * t) / 38710000;
  return ((gmst % 360) + 360) % 360;
}

export function lstDegrees(ms, lonDeg) {
  return (((gmstDegrees(ms) + lonDeg) % 360) + 360) % 360;
}

// 3x3 matrices are row-major arrays of 9 numbers.
export function mul(a, b) {
  const out = new Array(9);
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return out;
}

export function transpose(m) {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

export function apply(m, v) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

// Frame rotations (rotate the coordinate axes by +angle).
function r2(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, 0, -s, 0, 1, 0, s, 0, c];
}

function r3(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, s, 0, -s, c, 0, 0, 0, 1];
}

// IAU 1976 precession, J2000 mean equator -> mean equator of date.
export function precessionMatrix(ms) {
  const t = centuriesSinceJ2000(ms);
  const arcsec = DEG / 3600;
  const zeta = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t * t * t) * arcsec;
  const z = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t * t * t) * arcsec;
  const theta = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t * t * t) * arcsec;
  return mul(r3(-z), mul(r2(theta), r3(-zeta)));
}

// Equator of date -> horizon (east, north, up) for a given local sidereal time and latitude.
export function equatorToHorizonMatrix(lstDeg, latDeg) {
  const lst = lstDeg * DEG;
  const phi = latDeg * DEG;
  const c = Math.cos(lst);
  const s = Math.sin(lst);
  // Hour-angle frame: x toward the meridian, y toward west... (x, y, z) = (cosδ cosH, -cosδ sinH, sinδ)
  const toHourFrame = [c, s, 0, -s, c, 0, 0, 0, 1];
  const sp = Math.sin(phi);
  const cp = Math.cos(phi);
  const toHorizon = [
    0, 1, 0,
    -sp, 0, cp,
    cp, 0, sp,
  ];
  return mul(toHorizon, toHourFrame);
}

// J2000 equatorial -> galactic (Hipparcos definition).
export const EQ_TO_GAL = [
  -0.0548755604, -0.8734370902, -0.4838350155,
  0.4941094279, -0.4448296300, 0.7469822445,
  -0.8676661490, -0.1980763734, 0.4559837762,
];

export function radecToVector(raHours, decDeg) {
  const ra = raHours * 15 * DEG;
  const dec = decDeg * DEG;
  const cd = Math.cos(dec);
  return [cd * Math.cos(ra), cd * Math.sin(ra), Math.sin(dec)];
}

export function vectorToRadec(v) {
  let ra = Math.atan2(v[1], v[0]) * RAD / 15;
  if (ra < 0) ra += 24;
  return { ra, dec: Math.asin(Math.max(-1, Math.min(1, v[2]))) * RAD };
}

export function azAltToVector(azDeg, altDeg) {
  const az = azDeg * DEG;
  const alt = altDeg * DEG;
  const ca = Math.cos(alt);
  return [Math.sin(az) * ca, Math.cos(az) * ca, Math.sin(alt)];
}

export function vectorToAzAlt(v) {
  let az = Math.atan2(v[0], v[1]) * RAD;
  if (az < 0) az += 360;
  return { az, alt: Math.asin(Math.max(-1, Math.min(1, v[2]))) * RAD };
}

// Horizon vector for a star of declination dec (deg) at hour angle H (deg).
export function horizonFromHourAngle(decDeg, haDeg, latDeg) {
  const dec = decDeg * DEG;
  const h = haDeg * DEG;
  const phi = latDeg * DEG;
  const cd = Math.cos(dec);
  const x = cd * Math.cos(h);
  const y = -cd * Math.sin(h);
  const z = Math.sin(dec);
  return [y, -Math.sin(phi) * x + Math.cos(phi) * z, Math.cos(phi) * x + Math.sin(phi) * z];
}

// Geometric rising/setting (altitude 0, no refraction). Returns null if the star never crosses.
export function riseSet(decDeg, latDeg) {
  const cosAz = Math.sin(decDeg * DEG) / Math.cos(latDeg * DEG);
  const cosH = -Math.tan(latDeg * DEG) * Math.tan(decDeg * DEG);
  if (Math.abs(cosAz) > 1 || Math.abs(cosH) > 1) {
    return null;
  }
  const riseAz = Math.acos(cosAz) * RAD;
  const ha = Math.acos(cosH) * RAD;
  return { riseAz, setAz: 360 - riseAz, riseHA: -ha, setHA: ha };
}

// Signed difference a - b wrapped to [-180, 180).
export function angleDiff(a, b) {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

// Low precision solar position (equator of date), good to ~0.01 deg.
export function sunRadec(ms) {
  const n = julianDate(ms) - 2451545.0;
  const L = 280.46 + 0.9856474 * n;
  const g = (357.528 + 0.9856003 * n) * DEG;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
  const eps = (23.439 - 0.0000004 * n) * DEG;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  return { ra: (((ra * RAD) / 15) + 24) % 24, dec: dec * RAD };
}

// Tilt of the line from `foot` to `head` relative to local vertical, in degrees.
// 0 = head straight above foot, positive = head leaning toward the south-east... (clockwise as seen by the viewer).
export function tiltFromVertical(foot, head) {
  const up = [0, 0, 1];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  const k = dot(up, foot);
  const localUp = norm([up[0] - k * foot[0], up[1] - k * foot[1], up[2] - k * foot[2]]);
  // Viewer's right on the sky (looking outward at `foot` with zenith up).
  const localRight = norm(cross(foot, localUp));
  const j = dot(head, foot);
  const axis = [head[0] - j * foot[0], head[1] - j * foot[1], head[2] - j * foot[2]];
  return Math.atan2(dot(axis, localRight), dot(axis, localUp)) * RAD;
}

// Low precision lunar position (Meeus, Astronomical Algorithms ch. 47, largest terms), good to
// ~0.05 deg. Returns geocentric equator-of-date RA (hours), Dec (deg) and distance (Earth radii).
const MOON_LON = [
  // [D, M, M', F, coefficient in 1e-6 deg]
  [0, 0, 1, 0, 6288774], [2, 0, -1, 0, 1274027], [2, 0, 0, 0, 658314], [0, 0, 2, 0, 213618],
  [0, 1, 0, 0, -185116], [0, 0, 0, 2, -114332], [2, 0, -2, 0, 58793], [2, -1, -1, 0, 57066],
  [2, 0, 1, 0, 53322], [2, -1, 0, 0, 45758], [0, 1, -1, 0, -40923], [1, 0, 0, 0, -34720],
  [0, 1, 1, 0, -30383], [2, 0, 0, -2, 15327], [0, 0, 1, 2, -12528], [0, 0, 1, -2, 10980],
  [4, 0, -1, 0, 10675], [0, 0, 3, 0, 10034], [4, 0, -2, 0, 8548], [2, 1, -1, 0, -7888],
  [2, 1, 0, 0, -6766], [1, 0, -1, 0, -5163], [1, 1, 0, 0, 4987], [2, -1, 1, 0, 4036],
];
const MOON_LAT = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200],
];
const MOON_DIST = [
  // coefficient in metres, cosine terms
  [0, 0, 1, 0, -20905355], [2, 0, -1, 0, -3699111], [2, 0, 0, 0, -2955968], [0, 0, 2, 0, -569925],
  [0, 1, 0, 0, 48888], [0, 0, 0, 2, -3149], [2, 0, -2, 0, 246158], [2, -1, -1, 0, -152138],
  [2, 0, 1, 0, -170733], [2, -1, 0, 0, -204586], [0, 1, -1, 0, -129620], [1, 0, 0, 0, 108743],
  [0, 1, 1, 0, 104755],
];

export function moonRadec(ms) {
  const t = centuriesSinceJ2000(ms);
  const Lp = 218.3164477 + 481267.88123421 * t;
  const D = (297.8501921 + 445267.1114034 * t) * DEG;
  const M = (357.5291092 + 35999.0502909 * t) * DEG;
  const Mp = (134.9633964 + 477198.8675055 * t) * DEG;
  const F = (93.2720950 + 483202.0175233 * t) * DEG;
  const E = 1 - 0.002516 * t;
  const sum = (terms, fn) => terms.reduce((acc, [d, m, mp, f, c]) => {
    const e = Math.abs(m) === 1 ? E : Math.abs(m) === 2 ? E * E : 1;
    return acc + c * e * fn(d * D + m * M + mp * Mp + f * F);
  }, 0);
  const lon = (Lp + sum(MOON_LON, Math.sin) / 1e6) * DEG;
  const lat = (sum(MOON_LAT, Math.sin) / 1e6) * DEG;
  const km = 385000.56 + sum(MOON_DIST, Math.cos) / 1000;
  const eps = (23.439291 - 0.0130042 * t) * DEG;
  const x = Math.cos(lat) * Math.cos(lon);
  const y = Math.cos(eps) * Math.cos(lat) * Math.sin(lon) - Math.sin(eps) * Math.sin(lat);
  const z = Math.sin(eps) * Math.cos(lat) * Math.sin(lon) + Math.cos(eps) * Math.sin(lat);
  const ra = Math.atan2(y, x) * RAD / 15;
  return { ra: (ra + 24) % 24, dec: Math.asin(z) * RAD, distance: km / 6378.14 };
}

// Shift a geocentric horizon direction to the observer's eye (parallax), for a body at
// `distance` Earth radii. Spherical Earth: the observer sits one radius up the local vertical.
export function topocentric(v, distance) {
  const p = [v[0] * distance, v[1] * distance, v[2] * distance - 1];
  const len = Math.hypot(p[0], p[1], p[2]);
  return [p[0] / len, p[1] / len, p[2] / len];
}
