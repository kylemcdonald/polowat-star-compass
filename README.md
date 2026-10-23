# Polowat star compass

A planetarium-style view of the night sky over Polowat Atoll (7.36° N, 149.18° E),
facing east by default, with the Weriyaeng star compass laid over it.

Made with the supervision of Mario Benito from Inowon in Polowat.

The compass, its 32 points and their names come from a Weriyaeng shirt, with
the Polowat spellings corrected.

- Each direction star's full diurnal circle is drawn: dashed above the horizon,
  dotted below it, with arrowheads showing the direction of motion.
- Each of the 32 compass points (11.25° apart) has a white tick on the horizon. A gold
  diamond marks where the star actually rises or sets, and a coloured arc shows
  the deviation Δ (+ clockwise, − counter-clockwise).
- Names appear in Polowat (gold) and Western (blue-grey). Rising points are
  "Tan …" and setting points "Tolon …"; each star's own label uses its plain
  Polowat name (e.g. Mailap for Altair).
- The Southern Cross points (rising, leaning 45°, meridian, leaning 45°, setting)
  all use Acrux. Ghost crosses show the figure at each of those moments.
- **All** shows the whole sky overhead, laid out like the shirt: east at the top,
  north on the left.
- **Sun & Moon** draws the Sun and the Moon (with its phase), positioned for
  Polowat; the Moon includes the parallax of seeing it from the atoll instead of
  from the centre of the Earth.
- **Constellations** overlays the Western (IAU) constellation figures and names.
- **Reference** sets what the 32 points are lined up on. **True** and
  **Magnetic** set the compass's north. In magnetic mode the points, cardinals,
  bearings and Δ values shift by the local declination (about +3.1° E in 2026,
  from WMM2025). **Mailap** turns the whole compass so its east point, Tan
  Mailap, sits where Altair rises (about 9° north of true east at Polowat).
  Whenever the compass is turned, a dashed marker shows true north.
- **Mannap**, the big bird, is drawn with its head at Sirius and its wings
  reaching to Procyon and Canopus. It is not a compass star. Following Holton et
  al., "East is Not a 'Big Bird'" (*Oceanic Linguistics* 54:2, 2015), Mailap
  (Altair) is not glossed as "big bird" anywhere.
- **Time** and **day of year** sliders work like the ones in tntm: dragging
  locks the pointer, so you can keep dragging past either end. Time carries on
  into the next or previous day; the day wraps around the year. Clicking jumps
  to the clicked position. Time starts paused; ▶ plays it at 5 minutes per second.
- Three icons at the top right open the **Legend** (what the marks mean),
  **Settings** (view direction, layers, true / magnetic north) and **About**
  (location, credits, names download) pages. The panel starts closed and the
  page remembers the last one you opened. Clicking a star opens its details;
  on a phone the details and the panel take turns.
- Frames are only drawn when the view or the time changes. When paused and
  idle, the page draws nothing.
- Built for phones on slow connections: about 430 KB in all (gzipped), with a
  45 KB Milky Way that shows up first and a sharper 290 KB one that replaces
  it. Only large screens on a fast connection fetch the 4096 px panorama.
- It installs as an app (Chrome on Android: menu → **Install app**, or the
  **Install app** button under About) and works offline after the first
  visit. See `sw.js`.

Positions are J2000 values precessed to the date shown. Rising and setting
bearings are geometric, with no refraction. Time is local `UTC+10`.

## Run

No build step. Serve the folder statically:

```sh
python3 -m http.server 8096 --bind 0.0.0.0
```

Offline support needs `https` or `localhost`. Once the page has been opened,
it is served from the browser's cache. On each launch it checks the server in
the background (at most once a minute) and stores the files that changed, so
an edit shows up on the launch after next. List any new file the page needs in
`ASSETS` in `sw.js`.

URL parameters for sharing a view: `t` (ISO time), `yaw`, `pitch`, `fov`,
`play`, `mirror`, `select` (a star id or `mannap`), `constellations`,
`reference` (`true`, `magnetic` or `mailap`; the older `north=magnetic` still works)
(e.g. `?select=acrux&yaw=180&reference=mailap`).

## Data

- `src/compass.js` holds the compass from the shirt, with the corrected Polowat
  spellings.
- `src/brightStars.js` is the bright star list from
  [tntm](https://github.com/kylemcdonald/tntm), derived from the
  [HYG Database](https://github.com/astronexus/HYG-Database) v4.1 (CC BY-SA 4.0).
- `assets/milkyway-{1024,2048,4096}.webp` are downscaled from
  [NOIRLab `noirlab2430b`](https://noirlab.edu/public/images/noirlab2430b/)
  (NOIRLab/NSF/AURA/E. Slawik/M. Zamani, CC BY 4.0), a galactic coordinate
  all-sky panorama.
- `src/constellations.js` is generated from the d3-celestial constellation lines
  and names (https://github.com/ofrohn/d3-celestial, BSD-3-Clause).
- Magnetic declination at Polowat comes from the World Magnetic Model 2025:
  +3.162° at 2025.0, changing −0.041° per year (`MAGNETIC` in `src/compass.js`).
- `assets/fonts/exo2.woff2` is [Exo 2](https://fonts.google.com/specimen/Exo+2)
  (SIL Open Font License 1.1), cut down to Latin and weights 400–700.
