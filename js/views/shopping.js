// Shopping list: your own items (saved in the database, so phone and computer
// see the same list) plus this week's meal plan list (ticks saved on this device).
import { state, newId, saveShoppingItem, removeShoppingItem } from '../store.js?v=202611241533';
import { icon } from '../icons.js?v=202611241533';
import { esc, toast, saveFailed } from '../ui.js?v=202611241533';
import { planShopping, savePlanTicks } from './recipes.js?v=202611241533';

export const SECTIONS = [
  { id: 'produce', name: 'Fruit & veg', tone: 'sage' },
  { id: 'fridge', name: 'Fridge', tone: 'sky' },
  { id: 'pantry', name: 'Pantry', tone: 'butter' },
  { id: 'home', name: 'Household', tone: 'lavender' },
  { id: 'other', name: 'Other', tone: 'peach' },
];
const sectionOf = (id) => SECTIONS.find((s) => s.id === id) || SECTIONS[SECTIONS.length - 1];

let lastSection = 'other';
let refocus = false;

const toBuy = () => state.shopping.filter((i) => !i.done);

function itemRow(i) {
  return `
    <li class="shop-item">
      <label>
        <input type="checkbox" data-own="${i.id}" ${i.done ? 'checked' : ''}>
        <span><b>${esc(i.name)}</b></span>
      </label>
      <button type="button" class="icon-btn" data-own-remove="${i.id}" aria-label="Remove ${esc(i.name)}">${icon('x', 18)}</button>
    </li>`;
}

function ownHtml() {
  const items = state.shopping;
  if (!items.length) return '<p class="empty">Nothing on your list yet. Add what you need above: milk, washing-up liquid, anything.</p>';
  const ticked = items.filter((i) => i.done).length;
  return `
    <div class="shopping-body">
      ${SECTIONS.map((s) => {
        const list = items.filter((i) => sectionOf(i.section).id === s.id).sort((a, b) => (a.done - b.done) || (a.createdAt < b.createdAt ? -1 : 1));
        return list.length ? `<section class="shopping"><h3>${s.name}</h3><ul class="ticks-list">${list.map(itemRow).join('')}</ul></section>` : '';
      }).join('')}
    </div>
    ${ticked ? `<button type="button" class="btn btn-quiet" id="own-clear">${icon('check', 16)} Clear ${ticked} ticked</button>` : ''}`;
}

function planHtml() {
  const { status, week, ticks } = planShopping();
  if (status === 'loading' || status === 'idle') return '<p class="loading">Loading the meal plan list…</p>';
  if (status === 'error') return '<p class="help">The meal plan list could not be loaded. Reload the page to try again.</p>';
  const list = week?.shopping || [];
  if (!list.length) return '<p class="help">There is no meal plan list for this week.</p>';
  const total = list.reduce((s, sec) => s + sec.items.length, 0);
  const done = Object.values(ticks).filter(Boolean).length;
  return `
    <p class="help"><span id="plan-count">${done} of ${total} ticked</span> · <a href="#/plan">Open the meal plan</a></p>
    <div class="shopping-body" id="plan-list">
      ${list.map((sec, si) => `
        <section class="shopping">
          <h3>${esc(sec.section)}</h3>
          <ul class="ticks-list">
            ${sec.items.map((it, ii) => `<li><label><input type="checkbox" data-shop="${si}-${ii}" ${ticks[`${si}-${ii}`] ? 'checked' : ''}><span><b>${esc(it.name)}</b>${it.qty ? ` ${esc(it.qty)}` : ''}${it.note ? `<small>${esc(it.note)}</small>` : ''}</span></label></li>`).join('')}
          </ul>
        </section>`).join('')}
    </div>
    <button type="button" class="btn btn-quiet" id="plan-reset">Clear ticks</button>`;
}

export function render() {
  const left = toBuy().length;
  return `
    <header class="page-head">
      <p class="eyebrow">${left ? `${left} ${left === 1 ? 'thing' : 'things'} to buy` : 'All done'}</p>
      <h1>Shopping list</h1>
    </header>

    <form class="panel shop-add" id="shop-add" novalidate>
      <label for="sh-name" class="shop-add-label">Add an item</label>
      <div class="shop-add-row">
        <input id="sh-name" name="name" class="input" maxlength="60" autocomplete="off" enterkeyhint="done" placeholder="For example: Milk 2 l">
        <button type="submit" class="btn btn-primary">${icon('plus', 16)} Add</button>
      </div>
      <fieldset class="field">
        <legend class="visually-hidden">Where it goes on the list</legend>
        <div class="chips">
          ${SECTIONS.map((s) => `<label class="chip tone-${s.tone}"><input type="radio" name="section" value="${s.id}" ${s.id === lastSection ? 'checked' : ''}><span>${s.name}</span></label>`).join('')}
        </div>
      </fieldset>
      <p class="error" data-error="name" hidden></p>
    </form>

    <section class="panel" id="own-panel" aria-labelledby="h-own">
      <h2 id="h-own" class="shopping-title">${icon('shopping-basket', 20)} Your list</h2>
      ${ownHtml()}
    </section>

    <section class="panel" aria-labelledby="h-plan">
      <h2 id="h-plan" class="shopping-title">${icon('chef-hat', 20)} From this week's meal plan</h2>
      ${planHtml()}
    </section>`;
}

export const title = () => 'Shopping list';

export function mount(root) {
  const form = root.querySelector('#shop-add');
  const input = form.elements.name;
  if (refocus) { refocus = false; input.focus(); }

  form.addEventListener('change', (e) => { if (e.target.name === 'section') lastSection = e.target.value; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = input.value.trim();
    const error = form.querySelector('[data-error="name"]');
    error.hidden = !!name;
    error.textContent = name ? '' : 'Type what you need, then tap Add.';
    if (!name) return;
    lastSection = new FormData(form).get('section') || 'other';
    refocus = true;
    try { await saveShoppingItem({ id: newId(), name, section: lastSection, done: false, createdAt: new Date().toISOString() }); } catch { saveFailed(); }
  });

  const own = root.querySelector('#own-panel');
  own.addEventListener('change', async (e) => {
    const id = e.target.dataset?.own;
    if (!id) return;
    const item = state.shopping.find((i) => i.id === id);
    if (item) try { await saveShoppingItem({ ...item, done: e.target.checked }); } catch { saveFailed(); }
  });

  own.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-own-remove]');
    if (btn) {
      const item = state.shopping.find((i) => i.id === btn.dataset.ownRemove);
      if (!item) return;
      try {
        await removeShoppingItem(item.id);
        toast(`${item.name} removed`, { label: 'Undo', run: () => saveShoppingItem(item).catch(saveFailed) });
      } catch { saveFailed(); }
      return;
    }
    if (e.target.closest('#own-clear')) {
      const done = state.shopping.filter((i) => i.done);
      try {
        for (const i of done) await removeShoppingItem(i.id);
        toast(`${done.length} ticked ${done.length === 1 ? 'item' : 'items'} cleared`, { label: 'Undo', run: async () => { try { for (const i of done) await saveShoppingItem(i); } catch { saveFailed(); } } });
      } catch { saveFailed(); }
    }
  });

  // Meal plan list: ticks stay on this device, shared with the Meal plan page.
  const plan = root.querySelector('#plan-list');
  if (!plan) return;
  const total = plan.querySelectorAll('[data-shop]').length;
  const update = () => {
    const ticks = {};
    plan.querySelectorAll('[data-shop]').forEach((c) => { if (c.checked) ticks[c.dataset.shop] = true; });
    savePlanTicks(ticks);
    root.querySelector('#plan-count').textContent = `${Object.keys(ticks).length} of ${total} ticked`;
  };
  plan.addEventListener('change', (e) => { if (e.target.matches('[data-shop]')) update(); });
  root.querySelector('#plan-reset').addEventListener('click', () => {
    plan.querySelectorAll('[data-shop]').forEach((c) => { c.checked = false; });
    update();
  });
}

// ---------- Home tile ----------

export function homeTile() {
  const left = toBuy().length;
  return `
    <a class="tile tone-sage tile-module" href="#/shopping">
      <span class="tile-icon">${icon('shopping-basket', 22)}</span>
      <span class="tile-name">Shopping list</span>
      <span class="tile-line">${left ? `${left} ${left === 1 ? 'thing' : 'things'} to buy` : 'Your list and the meal plan list'}</span>
    </a>`;
}
