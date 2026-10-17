# Polowat night sky

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
- **True / Magnetic** sets which north the 32 points are counted from. In
  magnetic mode the points, cardinals, bearings and Δ values shift by the local
  declination (about +3.1° E in 2026, from WMM2025), and a dashed marker shows
  true north.
- **Time** and **day of year** sliders work like the ones in tntm: dragging
  locks the pointer, so you can keep dragging past either end. Time carries on
  into the next or previous day; the day wraps around the year. Clicking jumps
  to the clicked position.
- The legend starts hidden; it opens and closes with **?** / **×**, and the page
  remembers which you chose. Clicking a star opens its details below the legend.
- Frames are only drawn when the view or the time changes. When paused and
  idle, the page draws nothing.

Positions are J2000 values precessed to the date shown. Rising and setting
bearings are geometric, with no refraction. Time is local `UTC+10`.

## Run

No build step. Serve the folder statically:

```sh
python3 -m http.server 8096 --bind 0.0.0.0
```

URL parameters for sharing a view: `t` (ISO time), `yaw`, `pitch`, `fov`,
`paused`, `mirror`, `select`, `constellations`, `north=magnetic`
(e.g. `?select=acrux&yaw=180&north=magnetic`).

## Data

- `src/compass.js` holds the compass from the shirt, with the corrected Polowat
  spellings.
- `src/brightStars.js` is the bright star list from
  [tntm](https://github.com/kylemcdonald/tntm), derived from the
  [HYG Database](https://github.com/astronexus/HYG-Database) v4.1 (CC BY-SA 4.0).
- `assets/milkyway-4096.jpg` is downscaled from
  [NOIRLab `noirlab2430b`](https://noirlab.edu/public/images/noirlab2430b/)
  (NOIRLab/NSF/AURA/E. Slawik/M. Zamani, CC BY 4.0), a galactic coordinate
  all-sky panorama.
- `src/constellations.js` is generated from the d3-celestial constellation lines
  and names (https://github.com/ofrohn/d3-celestial, BSD-3-Clause).
- Magnetic declination at Polowat comes from the World Magnetic Model 2025:
  +3.162° at 2025.0, changing −0.041° per year (`MAGNETIC` in `src/compass.js`).
