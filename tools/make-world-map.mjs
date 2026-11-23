// Run from a folder with world-atlas, d3-geo, topojson-client, topojson-simplify,
// i18n-iso-countries and countries-list installed:
//   node make-world-map.mjs <path to life/data/world.json> 0.2
// Builds life/data/world.json: country outlines already projected to SVG paths,
// plus a list of every country with its name and continent.
import fs from 'fs';
import { createRequire } from 'module';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { presimplify, simplify, quantile } from 'topojson-simplify';
const require = createRequire(import.meta.url);
const iso = require('i18n-iso-countries');
iso.registerLocale(require('i18n-iso-countries/langs/en.json'));
const { countries: CL } = require('countries-list');

const out = process.argv[2];
const q = Number(process.argv[3] || 0.35);
let topo = JSON.parse(fs.readFileSync('node_modules/world-atlas/countries-50m.json', 'utf8'));
topo = presimplify(topo);
topo = simplify(topo, quantile(topo, q));

const fc = feature(topo, topo.objects.countries);
const byName = { 'Kosovo': 'XK', 'N. Cyprus': 'CY', 'Somaliland': 'SO', 'Indian Ocean Ter.': 'AU', 'Ashmore and Cartier Is.': 'AU', 'Siachen Glacier': 'IN' };
const feats = fc.features.filter((f) => f.id !== '010'); // no Antarctica
const W = 1000, H = 520;
const projection = geoNaturalEarth1().fitSize([W, H], { type: 'FeatureCollection', features: feats });
const path = geoPath(projection).digits(1);

const shapes = [];
const unknown = [];
for (const f of feats) {
  const code = (f.id && iso.numericToAlpha2(f.id)) || byName[f.properties.name];
  if (!code) { unknown.push(`${f.id} ${f.properties.name}`); continue; }
  const d = path(f);
  if (d) shapes.push({ c: code, d });
}

const names = new Intl.DisplayNames(['en'], { type: 'region' });
const countries = {};
for (const [code, c] of Object.entries(CL)) {
  countries[code] = { n: iso.getName(code, 'en', { select: 'alias' }) || names.of(code) || c.name, ct: c.continent };
}
// A few shorter everyday names.
Object.assign(countries.US, { n: 'United States' });
Object.assign(countries.GB, { n: 'United Kingdom' });
Object.assign(countries.RU, { n: 'Russia' });
Object.assign(countries.KR, { n: 'South Korea' });
Object.assign(countries.KP, { n: 'North Korea' });
Object.assign(countries.IR, { n: 'Iran' });
Object.assign(countries.SY, { n: 'Syria' });
Object.assign(countries.LA, { n: 'Laos' });
Object.assign(countries.VN, { n: 'Vietnam' });
Object.assign(countries.BO, { n: 'Bolivia' });
Object.assign(countries.VE, { n: 'Venezuela' });
Object.assign(countries.TZ, { n: 'Tanzania' });
Object.assign(countries.MD, { n: 'Moldova' });
Object.assign(countries.CZ, { n: 'Czechia' });
Object.assign(countries.TW, { n: 'Taiwan' });
Object.assign(countries.CD, { n: 'DR Congo' });
Object.assign(countries.CG, { n: 'Congo' });

const missingInList = [...new Set(shapes.map((s) => s.c))].filter((c) => !countries[c]);
const data = {
  source: 'Natural Earth 1:50m admin 0 countries (public domain), via world-atlas; names and continents from i18n-iso-countries and countries-list (MIT).',
  w: W, h: H, shapes, countries,
};
fs.writeFileSync(out, JSON.stringify(data));
console.log({ shapes: shapes.length, codesOnMap: new Set(shapes.map((s) => s.c)).size, listed: Object.keys(countries).length, unknown, missingInList, bytes: fs.statSync(out).size, sample: countries.GR, malta: shapes.some((s) => s.c === 'MT'), cyprus: shapes.filter((s) => s.c === 'CY').length });
