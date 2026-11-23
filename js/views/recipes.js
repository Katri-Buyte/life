// Recipes and meal plan. All content lives in data/recipes.json and
// data/plans.json, with photos in images/ (see RECIPES_BASE in config.js).
import { RECIPES_BASE } from '../config.js?v=202611231547';
import { TONES } from '../store.js?v=202611231547';
import { icon } from '../icons.js?v=202611231547';
import { esc, todayISO, iso, fromISO } from '../ui.js?v=202611231547';

let DATA = { categories: [], recipes: [] };
let PLANS = { weeks: [] };
let status = 'idle'; // idle | loading | ready | error
let rerender = () => {};
let activeCategory = 'all';
let query = '';
const servingsChosen = {}; // recipe id -> servings picked on its page

export const onLoaded = (fn) => { rerender = fn; };
export function retry() { status = 'idle'; rerender(); }

function load() {
  if (status !== 'idle') return;
  status = 'loading';
  const get = (path) => fetch(RECIPES_BASE + path, { cache: 'no-cache' }).then((res) => { if (!res.ok) throw new Error(res.status); return res.json(); });
  Promise.all([get('data/recipes.json'), get('data/plans.json').catch(() => ({ weeks: [] }))])
    .then(([d, p]) => { DATA = d; PLANS = p; status = 'ready'; })
    .catch(() => { status = 'error'; })
    .finally(() => rerender());
}

// Returns a placeholder while the recipes are loading or if they failed to load.
function notReady(title) {
  load();
  if (status === 'ready') return '';
  const body = status === 'error'
    ? `<div class="panel"><h2>The recipes could not be loaded</h2><p class="help">Reload the page, or try again in a moment.</p><button type="button" class="btn btn-primary" data-action="recipes-retry">Try again</button></div>`
    : '<p class="loading">Loading your recipes…</p>';
  return `<header class="page-head page-head-row"><h1>${title}</h1>${subnav(title === 'Meal plan' ? 'plan' : 'recipes')}</header>${body}`;
}

const subnav = (active) => `
  <nav class="subnav" aria-label="Recipes sections">
    <a href="#/recipes" ${active === 'recipes' ? 'aria-current="page"' : ''}>Recipes</a>
    <a href="#/plan" ${active === 'plan' ? 'aria-current="page"' : ''}>Meal plan</a>
  </nav>`;

// ---------- Shared helpers ----------

const cat = (id) => DATA.categories.find((c) => c.id === id) || { id, name: id };
const tone = (catId) => TONES[Math.max(0, DATA.categories.findIndex((c) => c.id === catId)) % TONES.length];
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');
const imgUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : /^images\/[\w.-]+$/.test(u || '') ? RECIPES_BASE + u : '');
const totalTime = (r) => (r.prepMinutes || 0) + (r.cookMinutes || 0);
const findRecipe = (id) => DATA.recipes.find((r) => r.id === id);
const sorted = () => [...DATA.recipes].sort((a, b) => String(b.added || '').localeCompare(String(a.added || '')) || (imgUrl(b.image) ? 1 : 0) - (imgUrl(a.image) ? 1 : 0));
const num = (n) => Math.round(n).toLocaleString('en-GB');

function art(r) {
  const initial = `<span class="initial" aria-hidden="true">${esc(r.title.trim()[0] || '?')}</span>`;
  const src = imgUrl(r.image);
  return src ? `${initial}<img src="${esc(src)}" alt="" loading="lazy" onerror="this.remove()">` : initial;
}

const fmtDay = (s) => fromISO(s).toLocaleDateString('en-GB', { weekday: 'long' });
const fmtShort = (s) => fromISO(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

// ---------- Quantities ----------

const FRACTIONS = [[0.125, '⅛'], [0.25, '¼'], [0.333, '⅓'], [0.5, '½'], [0.667, '⅔'], [0.75, '¾']];
const METRIC = new Set(['g', 'kg', 'ml', 'l']);
function fmtQty(q, unit) {
  if (q == null || q === '') return '';
  if (typeof q !== 'number') return String(q);
  if (METRIC.has((unit || '').toLowerCase())) {
    return String(q >= 100 ? Math.round(q / 5) * 5 : q >= 10 ? Math.round(q) : Math.round(q * 10) / 10);
  }
  const whole = Math.floor(q + 0.02), rest = q - whole;
  if (rest < 0.06) return String(whole);
  const f = FRACTIONS.reduce((best, x) => (Math.abs(x[0] - rest) < Math.abs(best[0] - rest) ? x : best));
  if (Math.abs(f[0] - rest) > 0.07) return String(Math.round(q * 10) / 10);
  return (whole ? whole + ' ' : '') + f[1];
}

// ---------- Meal plan maths ----------

const MEALS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['snacks', 'Snacks'], ['dinner', 'Dinner']];
const MKEYS = ['calories', 'protein', 'carbs', 'fat', 'fiber'];
const flatItems = (list) => (list || []).flatMap((x) => (x.group ? x.items : [x]));

function itemMacros(it) {
  if (it.recipe) {
    const m = (findRecipe(it.recipe) || {}).macros || {};
    return MKEYS.map((k) => (m[k] || 0) * (it.portion ?? 1));
  }
  const f = (PLANS.foods || {})[it.food];
  if (!f) return MKEYS.map(() => 0);
  return MKEYS.map((k) => (f.macros[k] || 0) * (it.amount ?? 1) / (f.per || 1));
}
const sumItems = (items) => items.reduce((t, it) => itemMacros(it).map((v, n) => t[n] + v), MKEYS.map(() => 0));
const dayTotals = (d) => sumItems(MEALS.flatMap(([k]) => flatItems(d.meals[k])));

function mealSummary(list) {
  return (list || []).map((x) => {
    if (x.group) return x.group;
    if (x.recipe) { const rec = findRecipe(x.recipe); return rec ? rec.title : x.recipe; }
    return String(x.label || x.food).split(',')[0];
  }).join(' + ');
}

function nextPlanDay() {
  const today = todayISO();
  return (PLANS.weeks || []).flatMap((w) => w.days).filter((d) => d.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
}

// ---------- Recipes list ----------

const HOME_CATS = ['breakfast', 'mains', 'soups-legumes', 'salads-sides'];

function filtered() {
  const q = query.trim().toLowerCase();
  return sorted().filter((r) => {
    if (activeCategory !== 'all' && r.category !== activeCategory) return false;
    if (!q) return true;
    const hay = [r.title, r.description, cat(r.category).name, ...(r.tags || []), ...(r.ingredients || []).map((i) => i.item)].join(' ').toLowerCase();
    return q.split(/\s+/).every((w) => hay.includes(w));
  });
}

function card(r) {
  const m = r.macros || {};
  return `
    <a class="rcard" href="#/recipes/${encodeURIComponent(r.id)}">
      <span class="rcard-art tone-${tone(r.category)}">${art(r)}${r.speedi ? '<span class="badge">Ninja Speedi</span>' : ''}</span>
      <span class="rcard-body">
        <span class="rcard-title">${esc(r.title)}</span>
        <span class="rcard-sub">${esc(cat(r.category).name)}${totalTime(r) ? ` · ${totalTime(r)} min` : ''}</span>
        ${m.calories != null ? `<span class="rcard-macros">${m.calories} kcal · ${m.protein} g protein</span>` : ''}
      </span>
    </a>`;
}

const gridHtml = () => {
  const list = filtered();
  return list.length ? list.map(card).join('') : '<p class="empty">No recipes match that. Try another word or category.</p>';
};

function chipsHtml() {
  const used = DATA.categories.filter((c) => DATA.recipes.some((r) => r.category === c.id));
  const btn = (id, name, n) => `<button type="button" class="chip-btn" data-cat="${esc(id)}" aria-pressed="${activeCategory === id}">${esc(name)} <small>${n}</small></button>`;
  return btn('all', 'All', DATA.recipes.length) + used.map((c) => btn(c.id, c.name, DATA.recipes.filter((r) => r.category === c.id).length)).join('');
}

function planTile() {
  const d = nextPlanDay();
  if (!d) {
    return `
      <a class="tile tone-butter span-2 tall tile-plan" href="#/plan">
        <span class="tile-icon">${icon('calendar-days', 22)}</span>
        <span class="tile-label">Meal plan</span>
        <span class="tile-name">No plan for the coming days yet</span>
        <span class="tile-line">Ask Claude for next week's plan. Past plans are still here.</span>
      </a>`;
  }
  const today = todayISO();
  const tmr = new Date(); tmr.setDate(tmr.getDate() + 1);
  const when = d.date === today ? 'Today' : d.date === iso(tmr) ? 'Tomorrow' : fmtDay(d.date);
  const t = dayTotals(d);
  return `
    <a class="tile tone-butter span-2 tall tile-plan" href="#/plan">
      <span class="tile-label">Meal plan · ${esc(fmtShort(d.date))}</span>
      <span class="tile-when">${esc(when)}</span>
      <span class="plan-meals">
        ${MEALS.map(([k, label]) => `<span class="plan-meal"><b>${label}</b><span>${esc(mealSummary(d.meals[k])) || 'Nothing planned'}</span></span>`).join('')}
      </span>
      <span class="tile-line"><b>${num(t[0])}</b> kcal · <b>${num(t[1])} g</b> protein · <b>${num(t[2])} g</b> carbs · <b>${num(t[3])} g</b> fat</span>
    </a>`;
}

function categoryTiles() {
  return HOME_CATS.map((id) => {
    const list = sorted().filter((r) => r.category === id);
    const photo = list.find((r) => imgUrl(r.image));
    const n = list.length;
    return `
      <button type="button" class="tile tone-${tone(id)} tile-cat" data-cat-jump="${esc(id)}" ${n ? '' : 'disabled'}>
        ${photo ? `<span class="tile-photo"><img src="${esc(imgUrl(photo.image))}" alt="" loading="lazy" onerror="this.parentNode.remove()"></span>` : `<span class="tile-icon">${icon('utensils', 22)}</span>`}
        <span class="tile-name">${esc(cat(id).name)}</span>
        <span class="tile-line">${n ? `${n} recipe${n === 1 ? '' : 's'}` : 'Coming soon'}</span>
      </button>`;
  }).join('');
}

function renderList() {
  return `
    <header class="page-head page-head-row"><h1>Recipes</h1>${subnav('recipes')}</header>

    <section class="bento" aria-label="Meal plan and main categories">
      ${planTile()}
      ${categoryTiles()}
    </section>

    <section id="recipe-list" class="recipe-list" aria-labelledby="h-all">
      <h2 class="section-title" id="h-all">All recipes</h2>
      <div class="search">
        <label class="visually-hidden" for="recipe-search">Search recipes</label>
        <input id="recipe-search" type="search" class="input" placeholder="Search by name, ingredient or tag" autocomplete="off" value="${esc(query)}">
      </div>
      <div class="chips" role="group" aria-label="Filter by category" id="recipe-chips">${chipsHtml()}</div>
      <div class="rgrid" id="rgrid">${gridHtml()}</div>
    </section>`;
}

function mountList(root) {
  const grid = root.querySelector('#rgrid');
  const chips = root.querySelector('#recipe-chips');
  const pick = (id) => { activeCategory = id; chips.innerHTML = chipsHtml(); grid.innerHTML = gridHtml(); };

  root.querySelector('#recipe-search').addEventListener('input', (e) => { query = e.target.value; grid.innerHTML = gridHtml(); });
  chips.addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (b) pick(b.dataset.cat); });
  root.querySelectorAll('[data-cat-jump]').forEach((b) => b.addEventListener('click', () => {
    pick(b.dataset.catJump);
    root.querySelector('#recipe-list').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }));
}

// ---------- One recipe ----------

function ingredientsHtml(r, servings) {
  const k = servings / (r.servings || 1);
  let out = '', group = null, open = false;
  (r.ingredients || []).forEach((i) => {
    if ((i.group || '') !== (group ?? '')) {
      if (open) out += '</ul>';
      group = i.group || '';
      if (group) out += `<h3>${esc(group)}</h3>`;
      out += '<ul class="ticks-list">'; open = true;
    } else if (!open) { out += '<ul class="ticks-list">'; open = true; }
    const qty = fmtQty(typeof i.qty === 'number' ? i.qty * k : i.qty, i.unit);
    const amount = [qty, i.unit].filter(Boolean).join(' ');
    out += `<li><label><input type="checkbox"><span>${amount ? `<b>${esc(amount)}</b> ` : ''}${esc(i.item)}${i.note ? `, ${esc(i.note)}` : ''}</span></label></li>`;
  });
  return out + (open ? '</ul>' : '');
}

function speediHtml(s) {
  if (!s || !(s.steps || []).length) return '';
  const cell = (label, value) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`;
  return `
    <section class="panel tone-panel tone-lavender" aria-labelledby="h-speedi">
      <div class="panel-row">
        <h2 id="h-speedi">Ninja Speedi</h2>
        <span class="pill">${s.origin === 'recipe' ? 'From the recipe' : 'Adapted, check the first time'}</span>
      </div>
      ${s.steps.map((st) => `
        <div class="speedi-step">
          ${st.food ? `<p class="speedi-food">${esc(st.food)}</p>` : ''}
          <dl class="facts">
            ${cell('Setting', st.fn)}${cell('Temperature', `${st.temp}°C`)}${cell('Time', st.time)}${cell('Crisper tray', st.tray)}${cell('Water', st.water || 'None')}
          </dl>
          ${st.note ? `<p class="tile-line">${esc(st.note)}</p>` : ''}
        </div>`).join('')}
      ${s.note ? `<p class="tile-line">${esc(s.note)}</p>` : ''}
    </section>`;
}

function renderRecipe(id) {
  const r = findRecipe(id);
  if (!r) return `<div class="panel"><h2>That recipe is not in the book</h2><a class="btn btn-quiet" href="#/recipes">Back to all recipes</a></div>`;
  const m = r.macros || {}, src = r.source || {};
  const servings = servingsChosen[r.id] || r.servings || 1;
  const macro = (t, v, unit, label) => `<div class="tile tone-${t} tile-macro"><span class="figure figure-sm">${v != null ? esc(v) : '?'}${unit}</span><span class="tile-line">${label}</span></div>`;
  const hasPhoto = imgUrl(r.image);

  return `
    <article class="recipe">
      <a class="back" href="#/recipes">${icon('chevron-left', 18)} All recipes</a>

      <div class="recipe-top">
        <header class="page-head">
          <p class="eyebrow">${esc(cat(r.category).name)}</p>
          <h1>${esc(r.title)}</h1>
          ${r.description ? `<p class="desc">${esc(r.description)}</p>` : ''}
          ${(r.tags || []).length ? `<p class="tags">${r.tags.map((t) => `<span class="pill pill-plain">${esc(t)}</span>`).join('')}</p>` : ''}
        </header>
        <figure class="recipe-figure">
          <div class="recipe-art tone-${tone(r.category)}">${art(r)}</div>
          ${hasPhoto && safeUrl(src.url) ? `<figcaption>Photo: <a href="${esc(safeUrl(src.url))}" target="_blank" rel="noopener noreferrer">${esc(src.name || 'original recipe')}</a></figcaption>` : ''}
        </figure>
      </div>

      <section class="bento bento-facts" aria-label="Time and servings">
        ${r.prepMinutes ? `<div class="tile tone-sky tile-fact"><span class="tile-label">Prep</span><span class="figure figure-sm">${r.prepMinutes} min</span></div>` : ''}
        ${r.cookMinutes ? `<div class="tile tone-peach tile-fact"><span class="tile-label">Cook</span><span class="figure figure-sm">${r.cookMinutes} min</span></div>` : ''}
        <div class="tile tone-butter tile-fact">
          <span class="tile-label">Servings</span>
          <span class="stepper">
            <button type="button" data-step="-1" aria-label="Fewer servings">−</button>
            <span class="figure figure-sm" id="servings" aria-live="polite">${servings}</span>
            <button type="button" data-step="1" aria-label="More servings">${icon('plus', 18)}</button>
          </span>
        </div>
      </section>

      <section aria-labelledby="h-macros">
        <div class="section-row">
          <h2 class="section-title" id="h-macros">Macros per serving</h2>
          <span class="pill pill-plain">${r.macrosEstimated === 'partial' ? 'Partly estimated' : r.macrosEstimated ? 'Estimated' : 'From the source'}</span>
        </div>
        <div class="bento bento-macros">
          ${macro('butter', m.calories, '', 'Kcal')}${macro('pink', m.protein, ' g', 'Protein')}${macro('sky', m.carbs, ' g', 'Carbs')}${macro('peach', m.fat, ' g', 'Fat')}${macro('sage', m.fiber, ' g', 'Fibre')}
        </div>
      </section>

      ${speediHtml(r.speedi)}

      <div class="recipe-cols">
        <section class="panel" aria-labelledby="h-ing">
          <h2 id="h-ing">Ingredients</h2>
          <div id="ing" class="ing">${ingredientsHtml(r, servings)}</div>
        </section>
        <section class="panel" aria-labelledby="h-method">
          <h2 id="h-method">Method</h2>
          <ol class="steps">${(r.steps || []).map((s) => `<li><span>${esc(s)}</span></li>`).join('')}</ol>
          ${r.notes ? `<div class="note"><p class="tile-label">Notes</p><p>${esc(r.notes)}</p></div>` : ''}
          ${src.name || src.url ? `<p class="help">Source: ${safeUrl(src.url) ? `<a href="${esc(safeUrl(src.url))}" target="_blank" rel="noopener noreferrer">${esc(src.name || src.url)}</a>` : esc(src.name)}</p>` : ''}
        </section>
      </div>
    </article>`;
}

function mountRecipe(root, id) {
  const r = findRecipe(id);
  if (!r) return;
  root.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    const current = servingsChosen[r.id] || r.servings || 1;
    const next = Math.max(1, Math.min(48, current + Number(b.dataset.step)));
    servingsChosen[r.id] = next;
    root.querySelector('#servings').textContent = next;
    root.querySelector('#ing').innerHTML = ingredientsHtml(r, next);
  }));
}

export const recipesView = {
  title: (param) => (param && status === 'ready' && findRecipe(decodeURIComponent(param)) ? findRecipe(decodeURIComponent(param)).title : 'Recipes'),
  render: (param) => notReady('Recipes') || (param ? renderRecipe(decodeURIComponent(param)) : renderList()),
  mount: (root, param) => {
    if (status !== 'ready') return;
    if (param) mountRecipe(root, decodeURIComponent(param)); else mountList(root);
  },
};

// ---------- Meal plan ----------

const portionLabel = (p) => (p === 1 ? '1 serving' : `${fmtQty(p, '')} serving`);

function itemHtml(it) {
  if (it.recipe) {
    const rec = findRecipe(it.recipe);
    return `<li><a href="#/recipes/${encodeURIComponent(it.recipe)}">${esc(rec ? rec.title : it.recipe)}</a> <span class="portion">${esc(portionLabel(it.portion ?? 1))}</span></li>`;
  }
  const f = (PLANS.foods || {})[it.food] || {};
  return `<li>${esc(it.label || `${it.amount} ${f.unit || ''} ${f.name || it.food}`)}</li>`;
}

function mealHtml(list) {
  if (!list || !list.length) return '<p class="help">Nothing planned</p>';
  return list.map((x) => (x.group
    ? `<div class="meal-group"><p class="meal-group-name">${x.recipe ? `<a href="#/recipes/${encodeURIComponent(x.recipe)}">${esc(x.group)}</a>` : esc(x.group)}</p><ul>${x.items.map(itemHtml).join('')}</ul></div>`
    : `<ul>${itemHtml(x)}</ul>`)).join('');
}

function barHtml(label, value, target, unit) {
  const pct = target ? value / target : 0;
  const state = pct > 1.08 && label !== 'Protein' ? 'over' : pct < 0.85 ? 'under' : 'ok';
  const word = state === 'over' ? ' <em>over</em>' : state === 'under' ? ' <em>low</em>' : '';
  return `<div class="mbar is-${state}">
    <div class="mbar-top"><span>${label}${word}</span><b>${num(value)}${unit}<small> / ${target.toLocaleString('en-GB')}${unit}</small></b></div>
    <div class="mbar-track"><i style="width:${Math.min(100, pct * 100).toFixed(1)}%"></i></div>
  </div>`;
}

const totalsHtml = (t, T) => barHtml('Kcal', t[0], T.calories, '') + barHtml('Protein', t[1], T.protein, ' g') + barHtml('Carbs', t[2], T.carbs, ' g') + barHtml('Fat', t[3], T.fat, ' g') +
  `<p class="help">Fibre ${num(t[4])} g</p>`;

function pickWeek(start) {
  const weeks = [...(PLANS.weeks || [])].sort((a, b) => a.start.localeCompare(b.start));
  if (!weeks.length) return { weeks, week: null };
  if (start) return { weeks, week: weeks.find((w) => w.start === start) || null };
  const today = todayISO();
  const end = (w) => w.days[w.days.length - 1].date;
  return { weeks, week: weeks.find((w) => w.start <= today && end(w) >= today) || weeks.find((w) => w.start > today) || weeks[weeks.length - 1] };
}

// Shopping list ticks are saved in this browser only.
const shopKey = (week) => `life.shop.${week.start}`;
const loadTicks = (week) => { try { return JSON.parse(localStorage.getItem(shopKey(week)) || '{}'); } catch { return {}; } };

function shoppingHtml(week) {
  const list = week.shopping || [];
  if (!list.length) return '';
  const ticks = loadTicks(week);
  const total = list.reduce((s, sec) => s + sec.items.length, 0);
  const done = Object.values(ticks).filter(Boolean).length;
  return `
    <details class="panel shopping" id="shopping">
      <summary><span class="shopping-title">${icon('shopping-basket', 20)} Shopping list</span><span class="pill pill-plain" id="shop-count">${done} of ${total} ticked</span></summary>
      <div class="shopping-body">
        ${list.map((sec, si) => `
          <section>
            <h3>${esc(sec.section)}</h3>
            <ul class="ticks-list">
              ${sec.items.map((it, ii) => `<li><label><input type="checkbox" data-shop="${si}-${ii}" ${ticks[`${si}-${ii}`] ? 'checked' : ''}><span><b>${esc(it.name)}</b>${it.qty ? ` ${esc(it.qty)}` : ''}${it.note ? `<small>${esc(it.note)}</small>` : ''}</span></label></li>`).join('')}
            </ul>
          </section>`).join('')}
      </div>
      <button type="button" class="btn btn-quiet" id="shop-reset">Clear ticks</button>
    </details>`;
}

function renderPlan(start) {
  const { weeks, week } = pickWeek(start);
  const head = (title) => `<header class="page-head page-head-row"><div><p class="eyebrow">Meal plan</p><h1>${title}</h1></div>${subnav('plan')}</header>`;
  if (!week) return `${head('No plan yet')}<p class="empty">There is no meal plan for this week. Ask Claude to plan one.</p>`;

  const T = PLANS.targets;
  const idx = weeks.indexOf(week), prev = weeks[idx - 1], next = weeks[idx + 1];
  const totals = week.days.map(dayTotals);
  const avg = MKEYS.map((_, n) => totals.reduce((s, t) => s + t[n], 0) / totals.length);
  const today = todayISO();
  const last = week.days[week.days.length - 1].date;
  const range = `${week.start.slice(0, 7) === last.slice(0, 7) ? fromISO(week.start).getDate() : fmtShort(week.start)} to ${fmtShort(last)}`;
  const hasToday = week.days.some((d) => d.date === today);

  return `
    ${head(esc(range))}

    ${prev || next || hasToday ? `
    <nav class="week-nav" aria-label="Weeks">
      ${prev ? `<a class="btn btn-quiet" href="#/plan/${prev.start}">${icon('chevron-left', 16)} Previous week</a>` : ''}
      ${hasToday ? `<button type="button" class="btn btn-quiet" data-scroll="day-${today}">Go to today</button>` : ''}
      ${next ? `<a class="btn btn-quiet" href="#/plan/${next.start}">Next week ${icon('chevron-right', 16)}</a>` : ''}
    </nav>` : ''}

    <section class="panel" aria-labelledby="h-avg">
      <h2 id="h-avg">Daily average <small>Target ${T.calories.toLocaleString('en-GB')} kcal · ${T.protein} g protein · ${T.carbs} g carbs · ${T.fat} g fat</small></h2>
      <div class="mbars">${totalsHtml(avg, T)}</div>
    </section>

    ${shoppingHtml(week)}

    <div class="days">
      ${week.days.map((d, n) => `
        <article class="panel day-card${d.date === today ? ' is-today' : ''}" id="day-${d.date}">
          <header class="panel-row">
            <h2>${esc(fmtDay(d.date))} <small>${esc(fmtShort(d.date))}</small></h2>
            ${d.date === today ? '<span class="pill">Today</span>' : ''}
          </header>
          <div class="day-body">
            <div class="day-meals">
              ${MEALS.map(([k, label]) => `<section class="meal"><h3>${label}</h3>${mealHtml(d.meals[k])}</section>`).join('')}
              ${d.prep ? `<p class="note"><b>Prep</b> ${esc(d.prep)}</p>` : ''}
            </div>
            <div class="mbars">${totalsHtml(totals[n], T)}</div>
          </div>
        </article>`).join('')}
    </div>
    ${PLANS.note ? `<p class="help">${esc(PLANS.note)}</p>` : ''}`;
}

function mountPlan(root, start) {
  root.querySelector('[data-scroll]')?.addEventListener('click', (e) => {
    document.getElementById(e.currentTarget.dataset.scroll)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  });

  const box = root.querySelector('#shopping');
  const { week } = pickWeek(start);
  if (!box || !week) return;
  const total = box.querySelectorAll('[data-shop]').length;
  const update = () => {
    const ticks = {};
    box.querySelectorAll('[data-shop]').forEach((c) => { if (c.checked) ticks[c.dataset.shop] = true; });
    try { localStorage.setItem(shopKey(week), JSON.stringify(ticks)); } catch { /* storage unavailable */ }
    box.querySelector('#shop-count').textContent = `${Object.keys(ticks).length} of ${total} ticked`;
  };
  box.addEventListener('change', (e) => { if (e.target.matches('[data-shop]')) update(); });
  box.querySelector('#shop-reset').addEventListener('click', () => {
    box.querySelectorAll('[data-shop]').forEach((c) => { c.checked = false; });
    update();
  });
}

export const planView = {
  title: () => 'Meal plan',
  render: (param) => notReady('Meal plan') || renderPlan(param),
  mount: (root, param) => { if (status === 'ready') mountPlan(root, param); },
};
