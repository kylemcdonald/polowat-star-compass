// Star compass from the back of the Weriyaeng shirt (IMG_1863.jpeg), with corrected
// Polowat spellings. The shirt draws east at the top, north on the left and south on the
// right; the rising (east) half and setting (west) half mirror each other about the N-S axis.
// Rising points are named "Tan <star>" and setting points "Tolon <star>".

export const LANGUAGES = {
  polowat: 'Polowat',
  western: 'Western',
};

export const LOCATION = {
  name: 'Polowat Atoll',
  lat: 7.355,
  lon: 149.183,
  utcOffsetHours: 10,
  zoneName: 'UTC+10',
};

// Magnetic declination at Polowat from the World Magnetic Model (WMM2025):
// +3.16 degrees (east of true north) at 2025.0, drifting -0.041 degrees per year.
export const MAGNETIC = { model: 'WMM2025', epoch: 2025.0, declination: 3.162, rate: -0.041 };

export function magneticDeclination(ms) {
  const year = 1970 + ms / (365.25 * 86400000);
  return MAGNETIC.declination + MAGNETIC.rate * (year - MAGNETIC.epoch);
}

export const HEADINGS = {
  rising: { polowat: 'Tan', western: 'Rising' },
  setting: { polowat: 'Tolon', western: 'Setting' },
};

// J2000 positions (RA hours, Dec degrees), V magnitudes and the star's own Polowat name.
export const STARS = {
  polaris: { name: 'Polaris', polowat: 'Wenewenen fuhemwakut', designation: 'α UMi', ra: 2.530303, dec: 89.264109, mag: 1.98 },
  kochab: { name: 'Kochab', polowat: 'Mailapanefang', designation: 'β UMi', ra: 14.845091, dec: 74.155505, mag: 2.07 },
  dubhe: { name: 'Dubhe', polowat: 'Wheleo', designation: 'α UMa', ra: 11.062130, dec: 61.751034, mag: 1.79 },
  schedar: { name: 'Schedar', polowat: 'Iukunik', designation: 'α Cas', ra: 0.675122, dec: 56.537331, mag: 2.24 },
  vega: { name: 'Vega', polowat: 'Meol', designation: 'α Lyr', ra: 18.615649, dec: 38.783692, mag: 0.03 },
  alcyone: { name: 'Alcyone', polowat: 'Mwarigar', designation: 'η Tau (Pleiades)', ra: 3.791414, dec: 24.105136, mag: 2.87, cluster: true },
  aldebaran: { name: 'Aldebaran', polowat: 'Wuun', designation: 'α Tau', ra: 4.598677, dec: 16.509301, mag: 0.87 },
  tarazed: { name: 'Tarazed', polowat: 'Paiyefang', designation: 'γ Aql', ra: 19.770994, dec: 10.613261, mag: 2.72 },
  altair: { name: 'Altair', polowat: 'Mailap', designation: 'α Aql', ra: 19.846388, dec: 8.868322, mag: 0.76 },
  alshain: { name: 'Alshain', polowat: 'Paiyeor', designation: 'β Aql', ra: 19.921889, dec: 6.406763, mag: 3.71 },
  alnilam: { name: 'Alnilam', polowat: 'Elieol', designation: 'ε Ori (Orion’s Belt)', ra: 5.603559, dec: -1.201919, mag: 1.69 },
  gienah: { name: 'Gienah', polowat: 'Haerpwol', designation: 'γ Crv', ra: 12.263437, dec: -17.541929, mag: 2.58 },
  antares: { name: 'Antares', polowat: 'Tumwur', designation: 'α Sco', ra: 16.490128, dec: -26.432002, mag: 1.06 },
  shaula: { name: 'Shaula', polowat: 'Mahariuw', designation: 'λ Sco', ra: 17.560145, dec: -37.103821, mag: 1.62 },
  acrux: { name: 'Acrux', polowat: 'Ubw', designation: 'α Cru', ra: 12.443311, dec: -63.099092, mag: 0.77 },
};

// Extra stars drawn as figures (not compass stars themselves).
export const FIGURES = {
  crux: {
    stars: [
      { id: 'acrux', ra: 12.443311, dec: -63.099092, mag: 0.77 },
      { id: 'gacrux', ra: 12.519433, dec: -57.113213, mag: 1.59 },
      { id: 'mimosa', ra: 12.795350, dec: -59.688764, mag: 1.25 },
      { id: 'imai', ra: 12.252417, dec: -58.748928, mag: 2.79 },
    ],
    lines: [[0, 1], [2, 3]],
  },
  belt: {
    stars: [
      { id: 'mintaka', ra: 5.533445, dec: -0.299092, mag: 2.25 },
      { id: 'alnilam', ra: 5.603559, dec: -1.201919, mag: 1.69 },
      { id: 'alnitak', ra: 5.679313, dec: -1.942572, mag: 1.74 },
    ],
    lines: [[0, 1], [1, 2]],
  },
  aquila: {
    stars: [
      { id: 'tarazed', ra: 19.770994, dec: 10.613261, mag: 2.72 },
      { id: 'altair', ra: 19.846388, dec: 8.868322, mag: 0.76 },
      { id: 'alshain', ra: 19.921889, dec: 6.406763, mag: 3.71 },
    ],
    lines: [[0, 1], [1, 2]],
  },
  scorpiusTail: {
    stars: [
      { id: 'antares', ra: 16.490128, dec: -26.432002, mag: 1.06 },
      { id: 'tau', ra: 16.598044, dec: -28.216017, mag: 2.82 },
      { id: 'epsilon', ra: 16.836059, dec: -34.293232, mag: 2.29 },
      { id: 'mu1', ra: 16.864512, dec: -38.047383, mag: 3.0 },
      { id: 'zeta2', ra: 16.909724, dec: -42.361313, mag: 3.62 },
      { id: 'eta', ra: 17.202554, dec: -43.238919, mag: 3.33 },
      { id: 'theta', ra: 17.622106, dec: -42.997824, mag: 1.86 },
      { id: 'iota1', ra: 17.793079, dec: -40.126997, mag: 2.99 },
      { id: 'kappa', ra: 17.708131, dec: -39.029983, mag: 2.39 },
      { id: 'shaula', ra: 17.560145, dec: -37.103821, mag: 1.62 },
    ],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9]],
  },
};

// The 32 points, clockwise from north. `event` says how the star marks the point:
// rise / set = where it crosses the horizon, transit = on the meridian,
// tilt45 = bearing of Acrux when the Southern Cross leans 45 degrees, pole = circumpolar.
export const HOUSES = [
  { k: 0, star: 'polaris', event: 'pole', polowat: 'Wenewenen fuhemwakut', western: 'Polaris' },
  { k: 1, star: 'kochab', event: 'rise', polowat: 'Tan Mailapanefang', western: 'Beta Ursa Minor' },
  { k: 2, star: 'dubhe', event: 'rise', polowat: 'Tan Wheleo', western: 'Alpha Ursa Major' },
  { k: 3, star: 'schedar', event: 'rise', polowat: 'Tan Iukunik', western: 'Alpha Cassiopeia' },
  { k: 4, star: 'vega', event: 'rise', polowat: 'Tan Meol', western: 'Vega' },
  { k: 5, star: 'alcyone', event: 'rise', polowat: 'Tan Mwarigar', western: 'Pleiades' },
  { k: 6, star: 'aldebaran', event: 'rise', polowat: 'Tan Wuun', western: 'Aldebaran' },
  { k: 7, star: 'tarazed', event: 'rise', polowat: 'Tan Paiyefang', western: 'Gamma Aquila' },
  { k: 8, star: 'altair', event: 'rise', polowat: 'Tan Mailap', western: 'Altair' },
  { k: 9, star: 'alshain', event: 'rise', polowat: 'Tan Paiyeor', western: 'Beta Aquila' },
  { k: 10, star: 'alnilam', event: 'rise', polowat: 'Tan Elieol', western: 'Orion’s Belt' },
  { k: 11, star: 'gienah', event: 'rise', polowat: 'Tan Haerpwol', western: 'Gamma Corvus' },
  { k: 12, star: 'antares', event: 'rise', polowat: 'Tan Tumwur', western: 'Antares' },
  { k: 13, star: 'shaula', event: 'rise', polowat: 'Tan Mahariuw', western: 'Shaula' },
  { k: 14, star: 'acrux', event: 'rise', polowat: 'Tan Ubw', western: 'Rising Crux' },
  { k: 15, star: 'acrux', event: 'tilt45', side: 'rising', polowat: 'Maechmeh', western: 'Crux rising at 45°' },
  { k: 16, star: 'acrux', event: 'transit', polowat: 'Wenewenenubw', western: 'Crux at meridian' },
  { k: 17, star: 'acrux', event: 'tilt45', side: 'setting', polowat: 'Maechemelotou', western: 'Crux setting at 45°' },
  { k: 18, star: 'acrux', event: 'set', polowat: 'Tolon Ubw', western: 'Setting Crux' },
  { k: 19, star: 'shaula', event: 'set', polowat: 'Tolon Mahariuw', western: 'Shaula' },
  { k: 20, star: 'antares', event: 'set', polowat: 'Tolon Tumwur', western: 'Antares' },
  { k: 21, star: 'gienah', event: 'set', polowat: 'Tolon Haerpwol', western: 'Gamma Corvus' },
  { k: 22, star: 'alnilam', event: 'set', polowat: 'Tolon Elieol', western: 'Orion’s Belt' },
  { k: 23, star: 'alshain', event: 'set', polowat: 'Tolon Paiyeor', western: 'Beta Aquila' },
  { k: 24, star: 'altair', event: 'set', polowat: 'Tolon Mailap', western: 'Altair' },
  { k: 25, star: 'tarazed', event: 'set', polowat: 'Tolon Paiyefang', western: 'Gamma Aquila' },
  { k: 26, star: 'aldebaran', event: 'set', polowat: 'Tolon Wuun', western: 'Aldebaran' },
  { k: 27, star: 'alcyone', event: 'set', polowat: 'Tolon Mwarigar', western: 'Pleiades' },
  { k: 28, star: 'vega', event: 'set', polowat: 'Tolon Meol', western: 'Vega' },
  { k: 29, star: 'schedar', event: 'set', polowat: 'Tolon Iukunik', western: 'Alpha Cassiopeia' },
  { k: 30, star: 'dubhe', event: 'set', polowat: 'Tolon Wheleo', western: 'Alpha Ursa Major' },
  { k: 31, star: 'kochab', event: 'set', polowat: 'Tolon Mailapanefang', western: 'Beta Ursa Minor' },
];

export const HOUSE_STEP = 360 / 32;
