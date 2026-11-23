// World map: a scratch map. Countries start covered in foil; marking one as visited
// "scratches" it off and shows its colour. Countries can also be marked "want to go".
import { state, newId, savePlace, removePlace } from '../store.js?v=202611231455';
import { icon } from '../icons.js?v=202611231455';
import { esc, openSheet, closeSheet, toast, saveFailed } from '../ui.js?v=202611231455';
import { head, showError } from './sheets.js?v=202611231455';

const CONTINENTS = {
  EU: { name: 'Europe', tone: 'pink' },
  AS: { name: 'Asia', tone: 'butter' },
  AF: { name: 'Africa', tone: 'peach' },
  NA: { name: 'North America', tone: 'sky' },
  SA: { name: 'South America', tone: 'sage' },
  OC: { name: 'Oceania', tone: 'lavender' },
  AN: { name: 'Antarctica', tone: 'sky' },
};
const TOTAL = 195; // UN members and observer states, the usual "countries of the world"

let MAP = null;
let status = 'idle';
let rerender = () => {};
export const onLoaded = (fn) => { rerender = fn; };
let view = null; // current viewBox [x, y, w, h]
let query = '';
let justScratched = null; // plays the reveal animation once on the next drawing

function load() {
  if (status !== 'idle') return;
  status = 'loading';
  fetch('data/world.json')
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => { MAP = d; view = [0, 0, d.w, d.h]; status = 'ready'; })
    .catch(() => { status = 'error'; })
    .finally(() => rerender());
}
export function retry() { status = 'idle'; rerender(); }

const placeOf = (code) => state.places.find((p) => p.country === code);
const nameOf = (code) => (MAP && MAP.countries[code] ? MAP.countries[code].n : code);
const continentOf = (code) => (MAP && MAP.countries[code] ? MAP.countries[code].ct : '');

function stats() {
  const visited = state.places.filter((p) => p.status === 'visited');
  const conts = new Set(visited.map((p) => continentOf(p.country)).filter(Boolean));
  return { visited, want: state.places.filter((p) => p.status === 'want'), conts };
}

function mapSvg() {
  const paths = MAP.shapes.map((s) => {
    const p = placeOf(s.c);
    const cls = (p ? (p.status === 'visited' ? `land is-visited tone-${CONTINENTS[continentOf(s.c)]?.tone || 'butter'}` : 'land is-want') : 'land')
      + (s.c === justScratched ? ' just-scratched' : '');
    return `<path class="${cls}" data-c="${s.c}" d="${s.d}"><title>${esc(nameOf(s.c))}${p ? (p.status === 'visited' ? ', visited' : ', want to go') : ''}</title></path>`;
  }).join('');
  return `
    <svg class="world" id="world-svg" viewBox="${view.join(' ')}" role="img" aria-label="World map. Visited countries are coloured; the rest are still covered.">
      <defs>
        <pattern id="foil" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" class="foil-base"/>
          <rect width="2" height="6" class="foil-line"/>
        </pattern>
      </defs>
      ${paths}
    </svg>`;
}

function listHtml(list, empty) {
  if (!list.length) return `<p class="empty">${empty}</p>`;
  const groups = {};
  list.forEach((p) => { (groups[continentOf(p.country)] ||= []).push(p); });
  return Object.entries(groups).sort((a, b) => b[1].length - a[1].length).map(([ct, items]) => `
    <h3 class="day">${CONTINENTS[ct]?.name || 'Other'} · ${items.length}</h3>
    <ul class="rows">
      ${items.sort((a, b) => nameOf(a.country).localeCompare(nameOf(b.country))).map((p) => `
        <li>
          <button type="button" class="row" data-action="world-country" data-c="${p.country}">
            <span class="bubble tone-${CONTINENTS[ct]?.tone || 'butter'}">${esc(p.country)}</span>
            <span class="row-main">
              <span class="row-title">${esc(nameOf(p.country))}</span>
              ${p.year || p.note ? `<span class="row-sub wrap">${[p.year, p.note].filter(Boolean).map(esc).join(' · ')}</span>` : ''}
            </span>
          </button>
        </li>`).join('')}
    </ul>`).join('');
}

function results() {
  const q = query.trim().toLowerCase();
  if (!q) return '';
  const hits = Object.entries(MAP.countries).filter(([code, c]) => c.n.toLowerCase().includes(q) || code.toLowerCase() === q)
    .sort((a, b) => (a[1].n.toLowerCase().startsWith(q) ? 0 : 1) - (b[1].n.toLowerCase().startsWith(q) ? 0 : 1) || a[1].n.localeCompare(b[1].n)).slice(0, 8);
  if (!hits.length) return '<p class="empty">No country by that name.</p>';
  return `<ul class="rows">${hits.map(([code, c]) => {
    const p = placeOf(code);
    return `
      <li>
        <button type="button" class="row" data-action="world-country" data-c="${code}">
          <span class="row-main"><span class="row-title">${esc(c.n)}</span><span class="row-sub">${CONTINENTS[c.ct]?.name || ''}</span></span>
          ${p ? `<span class="status-pill${p.status === 'visited' ? ' is-due' : ''}">${p.status === 'visited' ? 'Been there' : 'Want to go'}</span>` : ''}
        </button>
      </li>`;
  }).join('')}</ul>`;
}

export function render() {
  load();
  const headHtml = '<header class="page-head"><h1>World map</h1></header>';
  if (status !== 'ready') {
    return headHtml + (status === 'error'
      ? `<div class="panel"><h2>The map could not be loaded</h2><p class="help">Reload the page, or try again in a moment.</p><button type="button" class="btn btn-primary" data-action="world-retry">Try again</button></div>`
      : '<p class="loading">Unfolding the map…</p>');
  }
  const s = stats();
  const pct = Math.round((s.visited.length / TOTAL) * 100);

  return `
    ${headHtml}

    <section class="bento bento-3" aria-label="Travel totals">
      <div class="tile tone-butter span-2-sm">
        <span class="tile-icon">${icon('earth', 22)}</span>
        <span class="tile-label">Countries visited</span>
        <span class="figure">${s.visited.length} <small>of ${TOTAL}</small></span>
        <span class="meter" role="img" aria-label="${pct}% of the world"><span style="width:${Math.max(pct, s.visited.length ? 1 : 0)}%"></span></span>
        <span class="tile-line">${pct}% of the world</span>
      </div>
      <div class="tile tone-sage">
        <span class="tile-label">Continents</span>
        <span class="figure figure-sm">${s.conts.size} <small>of 7</small></span>
        <span class="tile-line">${s.conts.size ? [...s.conts].map((c) => CONTINENTS[c].name).join(', ') : 'Scratch your first country'}</span>
      </div>
      <div class="tile tone-lavender">
        <span class="tile-label">Want to go</span>
        <span class="figure figure-sm">${s.want.length}</span>
        <span class="tile-line">${s.want.length ? s.want.slice(0, 3).map((p) => esc(nameOf(p.country))).join(', ') + (s.want.length > 3 ? '…' : '') : 'Your travel wishlist'}</span>
      </div>
    </section>

    <section class="panel map-panel" aria-labelledby="h-map">
      <div class="panel-row">
        <h2 id="h-map">Scratch map</h2>
        <span class="map-zoom" role="group" aria-label="Zoom">
          <button type="button" class="icon-btn" data-action="world-zoom" data-z="out" aria-label="Zoom out">−</button>
          <button type="button" class="icon-btn" data-action="world-zoom" data-z="reset" aria-label="Show the whole world">${icon('earth', 18)}</button>
          <button type="button" class="icon-btn" data-action="world-zoom" data-z="in" aria-label="Zoom in">${icon('plus', 18)}</button>
        </span>
      </div>
      <div class="map-wrap">${mapSvg()}</div>
      <p class="help">Tap a country to scratch it off. Drag to move around, zoom with the buttons or by pinching.</p>
      <div class="legend" aria-hidden="true"><span><i class="swatch-foil"></i>Not yet</span><span><i class="swatch-visited"></i>Been there</span><span><i class="swatch-want"></i>Want to go</span></div>
    </section>

    <section class="panel" aria-labelledby="h-find">
      <h2 id="h-find">Find a country</h2>
      <label class="visually-hidden" for="world-search">Country name</label>
      <input id="world-search" type="search" class="input" placeholder="For example: Portugal" autocomplete="off" value="${esc(query)}">
      <div id="world-results">${results()}</div>
    </section>

    <section class="panel" aria-labelledby="h-been">
      <h2 id="h-been">Been there <small>${s.visited.length}</small></h2>
      ${listHtml(s.visited, 'Nothing scratched yet. Start with where you are: tap Greece on the map, or search for it.')}
    </section>

    <section class="panel" aria-labelledby="h-want">
      <h2 id="h-want">Want to go <small>${s.want.length}</small></h2>
      ${listHtml(s.want, 'Places you dream of. Tap a country and choose Want to go.')}
    </section>

    <p class="help">Map: Natural Earth (public domain).</p>`;
}

export const title = () => 'World map';

// ---------- Panning and zooming ----------

function setView(svg, v) {
  const [, , w, h] = v;
  const W = MAP.w, H = MAP.h;
  const nw = Math.min(W, Math.max(W / 12, w));
  const nh = nw * (H / W);
  const cx = v[0] + w / 2, cy = v[1] + h / 2;
  const x = Math.min(W - nw, Math.max(0, cx - nw / 2));
  const y = Math.min(H - nh, Math.max(0, cy - nh / 2));
  view = [x, y, nw, nh];
  svg.setAttribute('viewBox', view.map((n) => Math.round(n * 10) / 10).join(' '));
}

export function zoom(dir) {
  const svg = document.getElementById('world-svg');
  if (!svg || !MAP) return;
  if (dir === 'reset') { setView(svg, [0, 0, MAP.w, MAP.h]); return; }
  const k = dir === 'in' ? 0.6 : 1 / 0.6;
  const [x, y, w, h] = view;
  setView(svg, [x + (w - w * k) / 2, y + (h - h * k) / 2, w * k, h * k]);
}

export function mount(root) {
  if (status !== 'ready') return;
  const svg = root.querySelector('#world-svg');
  const pointers = new Map();
  let start = null;
  let moved = false;

  const toMap = (clientX, clientY) => {
    const r = svg.getBoundingClientRect();
    return [view[0] + ((clientX - r.left) / r.width) * view[2], view[1] + ((clientY - r.top) / r.height) * view[3]];
  };

  svg.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    svg.setPointerCapture(e.pointerId);
    start = { view: [...view], pts: new Map(pointers) };
    moved = false;
  });
  svg.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId) || !start) return;
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    const r = svg.getBoundingClientRect();
    const scale = start.view[2] / r.width;
    if (pointers.size === 1 && start.pts.size === 1) {
      const [sx, sy] = [...start.pts.values()][0];
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      if (moved) setView(svg, [start.view[0] - dx * scale, start.view[1] - dy * scale, start.view[2], start.view[3]]);
    } else if (pointers.size === 2 && start.pts.size === 2) {
      // Pinch: scale around the midpoint of the two fingers.
      const [a0, b0] = [...start.pts.values()];
      const [a1, b1] = [...pointers.values()];
      const d0 = Math.hypot(a0[0] - b0[0], a0[1] - b0[1]);
      const d1 = Math.hypot(a1[0] - b1[0], a1[1] - b1[1]);
      if (!d0 || !d1) return;
      moved = true;
      const k = d0 / d1;
      const mid = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2];
      const mx = start.view[0] + ((mid[0] - r.left) / r.width) * start.view[2];
      const my = start.view[1] + ((mid[1] - r.top) / r.height) * start.view[3];
      const w = start.view[2] * k, h = start.view[3] * k;
      setView(svg, [mx - (mx - start.view[0]) * k, my - (my - start.view[1]) * k, w, h]);
    }
  });
  const end = (e) => {
    pointers.delete(e.pointerId);
    start = pointers.size ? { view: [...view], pts: new Map(pointers) } : null;
  };
  svg.addEventListener('pointerup', (e) => {
    // The map holds on to the pointer while dragging, so find the country under the finger.
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const target = under && under.closest ? under.closest('#world-svg [data-c]') : null;
    const wasTap = !moved && pointers.size === 1;
    end(e);
    if (wasTap && target) openCountry(target.dataset.c);
  });
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [mx, my] = toMap(e.clientX, e.clientY);
    const k = e.deltaY < 0 ? 0.8 : 1.25;
    setView(svg, [mx - (mx - view[0]) * k, my - (my - view[1]) * k, view[2] * k, view[3] * k]);
  }, { passive: false });

  const search = root.querySelector('#world-search');
  search.addEventListener('input', () => { query = search.value; root.querySelector('#world-results').innerHTML = results(); });
}

// ---------- One country ----------

export function openCountry(code) {
  if (!MAP) return;
  const existing = placeOf(code);
  const p = existing || { id: newId(), country: code, status: 'visited', year: '', note: '', createdAt: new Date().toISOString() };
  const current = existing ? existing.status : 'none';
  const ct = CONTINENTS[continentOf(code)];

  const el = openSheet(`
    <form class="form" novalidate>
      ${head(esc(nameOf(code)))}
      <p class="help">${ct ? ct.name : ''}</p>

      <fieldset class="segmented segmented-3">
        <legend class="visually-hidden">Status</legend>
        <label><input type="radio" name="status" value="visited" ${current === 'visited' || current === 'none' ? 'checked' : ''}><span>Been there</span></label>
        <label><input type="radio" name="status" value="want" ${current === 'want' ? 'checked' : ''}><span>Want to go</span></label>
        <label><input type="radio" name="status" value="none" ${existing ? '' : ''}><span>Not yet</span></label>
      </fieldset>

      <div class="field" data-year>
        <label for="w-year">When <span class="optional">optional</span></label>
        <input id="w-year" name="year" class="input" maxlength="30" autocomplete="off" placeholder="For example: 2019, or Summer 2023" value="${esc(p.year)}">
      </div>

      <div class="field">
        <label for="w-note" data-note-label>${current === 'want' ? 'Why, or what to see' : 'A favourite memory'} <span class="optional">optional</span></label>
        <input id="w-note" name="note" class="input" maxlength="140" autocomplete="off" value="${esc(p.note)}">
      </div>

      <div class="sheet-actions"><span></span><button type="submit" class="btn btn-primary">${existing ? 'Save' : `${icon('sparkles', 16)} Scratch it`}</button></div>
    </form>`);

  const form = el.querySelector('form');
  const sync = () => {
    const st = new FormData(form).get('status');
    form.querySelector('[data-year]').hidden = st !== 'visited';
    form.querySelector('[data-note-label]').firstChild.textContent = st === 'want' ? 'Why, or what to see ' : 'A favourite memory ';
    form.elements.note.disabled = st === 'none';
    form.querySelector('button[type=submit]').innerHTML = st === 'visited' && !existing ? `${icon('sparkles', 16)} Scratch it` : 'Save';
  };
  form.addEventListener('change', sync);
  sync();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const st = data.get('status');
    closeSheet();
    try {
      if (st === 'none') {
        if (existing) {
          await removePlace(existing.id);
          toast(`${nameOf(code)} is covered again`, { label: 'Undo', run: () => savePlace(existing).catch(saveFailed) });
        }
        return;
      }
      const firstVisit = st === 'visited' && !(existing && existing.status === 'visited');
      if (firstVisit) { justScratched = code; setTimeout(() => { justScratched = null; }, 1500); }
      await savePlace({ ...p, status: st, year: st === 'visited' ? String(data.get('year') || '').trim() : '', note: String(data.get('note') || '').trim() });
      if (st === 'visited') {
        toast(existing && existing.status === 'visited' ? 'Saved' : `${nameOf(code)} scratched off!`);
      } else {
        toast(`${nameOf(code)} added to Want to go`);
      }
    } catch { saveFailed(); }
  });
}

// ---------- Home tile ----------

export function homeTile() {
  const visited = state.places.filter((p) => p.status === 'visited').length;
  const want = state.places.filter((p) => p.status === 'want').length;
  return `
    <a class="tile tone-sage tile-module" href="#/world">
      <span class="tile-icon">${icon('earth', 22)}</span>
      <span class="tile-name">World map</span>
      <span class="tile-line">${visited || want ? `${visited} ${visited === 1 ? 'country' : 'countries'} visited${want ? ` · ${want} to go` : ''}` : 'Scratch off where you have been'}</span>
    </a>`;
}
