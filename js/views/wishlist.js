// Wishlist: things to buy or save up for, each with a link to the product.
import { state, newId, categoriesOf, vaultBalance, saveWish, removeWish, saveTransaction, removeTransaction } from '../store.js?v=202611231400';
import { icon } from '../icons.js?v=202611231400';
import { esc, money, parseAmount, amountInput, todayISO, shortDate, openSheet, closeSheet, toast, saveFailed } from '../ui.js?v=202611231400';
import { head, showError, categoryChips } from './sheets.js?v=202611231400';
import { budgetNav } from './budget.js?v=202611231400';

const PRIORITIES = [
  { id: 'need', name: 'Need', tone: 'pink', help: 'Something you really need' },
  { id: 'want', name: 'Want', tone: 'butter', help: 'Would be lovely to have' },
  { id: 'someday', name: 'Someday', tone: 'sky', help: 'No rush at all' },
];
const prio = (id) => PRIORITIES.find((p) => p.id === id) || PRIORITIES[1];

let filter = 'all';
export function setFilter(f) { filter = f; }

// Accept "shop.com/item" as well as full links; anything that is not http(s) is refused.
export function cleanUrl(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.href : null;
  } catch { return null; }
}
const domain = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

const active = () => state.wishlist.filter((w) => !w.boughtOn);
const order = (a, b) => PRIORITIES.findIndex((p) => p.id === a.priority) - PRIORITIES.findIndex((p) => p.id === b.priority) || (a.createdAt < b.createdAt ? 1 : -1);

function card(w) {
  const p = prio(w.priority);
  const site = w.url ? domain(w.url) : '';
  return `
    <li class="wish tone-${p.tone}">
      <button type="button" class="wish-main" data-action="wish-edit" data-id="${w.id}">
        <span class="wish-top">
          <span class="pill">${p.name}</span>
          ${w.price ? `<span class="wish-price">${money(w.price)}</span>` : ''}
        </span>
        <span class="wish-name">${esc(w.name)}</span>
        ${site ? `<span class="tile-line">${esc(site)}</span>` : ''}
        ${w.note ? `<span class="tile-line wish-note">${esc(w.note)}</span>` : ''}
      </button>
      <span class="wish-actions">
        ${w.url ? `<a class="btn btn-on-tone" href="${esc(w.url)}" target="_blank" rel="noopener noreferrer">${icon('arrow-up-right', 16)} Open link<span class="visually-hidden"> for ${esc(w.name)} (opens in a new tab)</span></a>` : ''}
        <button type="button" class="btn btn-ghost" data-action="wish-bought" data-id="${w.id}">${icon('check', 16)} Bought it</button>
      </span>
    </li>`;
}

export function render() {
  const list = active().sort(order);
  const shown = filter === 'all' ? list : list.filter((w) => w.priority === filter);
  const bought = state.wishlist.filter((w) => w.boughtOn).sort((a, b) => (a.boughtOn < b.boughtOn ? 1 : -1));
  const total = list.reduce((n, w) => n + w.price, 0);
  const needs = list.filter((w) => w.priority === 'need');
  const needTotal = needs.reduce((n, w) => n + w.price, 0);
  const unpriced = list.filter((w) => !w.price).length;
  const vault = vaultBalance();

  // Which items the vault could already cover, cheapest needs first.
  let left = vault;
  const affordable = [...list].filter((w) => w.price).sort((a, b) => order(a, b) || a.price - b.price).filter((w) => (left >= w.price ? ((left -= w.price), true) : false)).length;

  return `
    <header class="page-head page-head-row">
      <h1>Budget</h1>
      ${budgetNav('wishlist')}
    </header>

    <section class="bento bento-3" aria-label="Wishlist totals">
      <div class="tile tone-lavender span-2-sm">
        <span class="tile-label">Wishlist total</span>
        <span class="figure">${money(total)}</span>
        <span class="tile-line">${list.length} ${list.length === 1 ? 'item' : 'items'}${unpriced ? `, ${unpriced} without a price` : ''}</span>
      </div>
      <div class="tile tone-pink">
        <span class="tile-label">Needs</span>
        <span class="figure figure-sm">${money(needTotal)}</span>
        <span class="tile-line">${needs.length} ${needs.length === 1 ? 'item' : 'items'}</span>
      </div>
      <a class="tile tone-sage" href="#/budget">
        <span class="tile-label">In your vault</span>
        <span class="figure figure-sm">${money(vault)}</span>
        <span class="tile-line">${list.some((w) => w.price) ? `Enough for ${affordable} of the priced items` : 'Add prices to compare'}</span>
      </a>
    </section>

    <section aria-labelledby="h-wish">
      <div class="section-row">
        <h2 class="section-title" id="h-wish">Wishlist</h2>
        <button type="button" class="btn btn-quiet" data-action="wish-add">${icon('plus', 16)} Add</button>
      </div>
      ${list.length ? `
        <div class="chips" role="group" aria-label="Show">
          ${[['all', 'All'], ...PRIORITIES.map((p) => [p.id, p.name])].map(([id, name]) => `<button type="button" class="chip-btn" data-action="wish-filter" data-filter="${id}" aria-pressed="${filter === id}">${name} <small>${id === 'all' ? list.length : list.filter((w) => w.priority === id).length}</small></button>`).join('')}
        </div>
        ${shown.length ? `<ul class="wish-grid">${shown.map(card).join('')}</ul>` : '<p class="empty">Nothing here with that priority.</p>'}` : `
        <div class="panel">
          <p class="empty">Things you would like to buy, with a link to each one. Mark them Need, Want or Someday, and see how they compare with what is in your vault.</p>
          <button type="button" class="btn btn-primary" data-action="wish-add">${icon('plus', 16)} Add your first item</button>
        </div>`}
    </section>

    ${bought.length ? `
      <details class="panel bought">
        <summary><span class="shopping-title">${icon('gift', 20)} Bought</span><span class="pill pill-plain">${bought.length}</span></summary>
        <ul class="rows">
          ${bought.map((w) => `
            <li class="skip-row">
              <span class="row-main">
                <span class="row-title">${w.url ? `<a href="${esc(w.url)}" target="_blank" rel="noopener noreferrer">${esc(w.name)}</a>` : esc(w.name)}</span>
                <span class="row-sub">${w.price ? `${money(w.price)} · ` : ''}bought ${shortDate(w.boughtOn)}${w.transactionId ? ' · in your expenses' : ''}</span>
              </span>
              <button type="button" class="link" data-action="wish-unbuy" data-id="${w.id}">Back to wishlist</button>
            </li>`).join('')}
        </ul>
      </details>` : ''}`;
}

export const title = () => 'Wishlist';

// ---------- Add / edit ----------

export function openWishSheet(id) {
  const existing = id ? state.wishlist.find((w) => w.id === id) : null;
  const w = existing || { id: newId(), name: '', url: '', price: 0, priority: 'want', note: '', boughtOn: '', transactionId: '', createdAt: new Date().toISOString() };

  const el = openSheet(`
    <form class="form" novalidate>
      ${head(existing ? 'Edit item' : 'Add to wishlist')}

      <div class="field">
        <label for="w-name">What is it</label>
        <input id="w-name" name="name" class="input" maxlength="80" autocomplete="off" placeholder="For example: Linen bedding set" value="${esc(w.name)}" ${existing ? '' : 'autofocus'}>
        <p class="error" data-error="name" hidden></p>
      </div>

      <div class="field">
        <label for="w-url">Link to the item <span class="optional">optional</span></label>
        <input id="w-url" name="url" class="input" type="url" inputmode="url" autocomplete="off" placeholder="Paste the product page address" value="${esc(w.url)}" aria-describedby="w-url-help">
        <p class="help" id="w-url-help">Copy the address from the shop's page and paste it here.</p>
        <p class="error" data-error="url" hidden></p>
      </div>

      <div class="field">
        <label for="w-price">Price in euros <span class="optional">optional</span></label>
        <input id="w-price" name="price" class="input" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${amountInput(w.price)}">
        <p class="error" data-error="price" hidden></p>
      </div>

      <fieldset class="field">
        <legend>Priority</legend>
        <div class="segmented segmented-3">
          ${PRIORITIES.map((p) => `<label><input type="radio" name="priority" value="${p.id}" ${p.id === w.priority ? 'checked' : ''}><span>${p.name}</span></label>`).join('')}
        </div>
        <p class="help" data-prio-help>${prio(w.priority).help}.</p>
      </fieldset>

      <div class="field">
        <label for="w-note">Note <span class="optional">optional</span></label>
        <input id="w-note" name="note" class="input" maxlength="140" autocomplete="off" placeholder="Size, colour, wait for a sale…" value="${esc(w.note)}">
      </div>

      <div class="sheet-actions">
        ${existing ? `<button type="button" class="btn btn-quiet btn-danger" data-delete>${icon('trash-2', 16)} Delete</button>` : '<span></span>'}
        <button type="submit" class="btn btn-primary">${existing ? 'Save changes' : 'Add'}</button>
      </div>
    </form>`);

  const form = el.querySelector('form');
  form.addEventListener('change', (e) => {
    if (e.target.name === 'priority') form.querySelector('[data-prio-help]').textContent = `${prio(e.target.value).help}.`;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const name = String(data.get('name')).trim();
    const url = cleanUrl(data.get('url'));
    const priceText = String(data.get('price')).trim();
    const price = priceText ? parseAmount(priceText) : 0;

    showError(form, 'price', price === null ? 'Type a price, for example 49.90, or leave it empty' : '');
    showError(form, 'url', url === null ? 'That does not look like a web address. Copy it from the shop page and paste it again.' : '');
    showError(form, 'name', name ? '' : 'Say what it is.');
    if (!name || url === null || price === null) return;

    closeSheet();
    try {
      await saveWish({ ...w, name, url, price, priority: data.get('priority'), note: String(data.get('note')).trim() });
      toast(existing ? 'Changes saved' : `${name} added`);
    } catch { saveFailed(); }
  });

  form.querySelector('[data-delete]')?.addEventListener('click', async () => {
    closeSheet();
    try {
      await removeWish(w.id);
      toast(`${w.name} deleted`, { label: 'Undo', run: () => saveWish(w).catch(saveFailed) });
    } catch { saveFailed(); }
  });
}

// ---------- Bought it ----------

export function openBoughtSheet(id) {
  const w = state.wishlist.find((x) => x.id === id);
  if (!w) return;
  const shopping = categoriesOf('expense').find((c) => c.name === 'Shopping') || categoriesOf('expense')[0];

  const el = openSheet(`
    <form class="form" novalidate>
      ${head('Bought it')}
      <p class="help">${esc(w.name)} moves to your Bought list.</p>

      <label class="check-row">
        <input type="checkbox" name="log" checked>
        <span>Also add it to my expenses</span>
      </label>

      <div data-log>
        <div class="field">
          <label for="b-amount">What you paid, in euros</label>
          <input id="b-amount" name="amount" class="input input-amount" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${amountInput(w.price)}">
          <p class="error" data-error="amount" hidden></p>
        </div>
        <fieldset class="field">
          <legend>Category</legend>
          <div class="chips">${categoryChips('expense', shopping ? shopping.id : '')}</div>
        </fieldset>
      </div>

      <div class="field">
        <label for="b-date">Date</label>
        <input id="b-date" name="date" type="date" class="input" value="${todayISO()}" max="${todayISO()}">
        <p class="error" data-error="date" hidden></p>
      </div>

      <div class="sheet-actions"><span></span><button type="submit" class="btn btn-primary">${icon('check', 16)} Mark as bought</button></div>
    </form>`);

  const form = el.querySelector('form');
  form.elements.log.addEventListener('change', (e) => { form.querySelector('[data-log]').hidden = !e.target.checked; });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const log = !!data.get('log');
    const amount = parseAmount(data.get('amount'));
    const date = data.get('date');
    showError(form, 'date', !date ? 'Pick the day you bought it.' : date > todayISO() ? 'Pick today or earlier.' : '');
    if (log) showError(form, 'amount', amount ? '' : 'Type what you paid, for example 49.90');
    if (!date || date > todayISO() || (log && !amount)) return;

    const before = { ...w };
    const txn = log ? { id: newId(), date, amount, kind: 'expense', categoryId: data.get('categoryId'), note: w.name, createdAt: new Date().toISOString() } : null;
    closeSheet();
    try {
      if (txn) await saveTransaction(txn);
      await saveWish({ ...w, boughtOn: date, transactionId: txn ? txn.id : '' });
      toast(txn ? `Bought, and ${money(amount)} added to expenses` : 'Moved to Bought', {
        label: 'Undo',
        run: async () => { try { if (txn) await removeTransaction(txn.id); await saveWish(before); } catch { saveFailed(); } },
      });
    } catch { saveFailed(); }
  });
}

// Back to the wishlist. The expense, if one was logged, is left alone: it was real spending.
export async function unbuy(id) {
  const w = state.wishlist.find((x) => x.id === id);
  if (!w) return;
  try {
    await saveWish({ ...w, boughtOn: '', transactionId: '' });
    toast(w.transactionId ? 'Back on the wishlist. Its expense stays in Budget; delete it there if it was a mistake.' : 'Back on the wishlist');
  } catch { saveFailed(); }
}

// ---------- Home tile ----------

export function homeTile() {
  const list = active();
  const total = list.reduce((n, w) => n + w.price, 0);
  return `
    <a class="tile tone-lavender tile-module" href="#/wishlist">
      <span class="tile-icon">${icon('gift', 22)}</span>
      <span class="tile-name">Wishlist</span>
      <span class="tile-line">${list.length ? `${list.length} ${list.length === 1 ? 'item' : 'items'} · ${money(total)}` : 'Things to save up for'}</span>
    </a>`;
}
