// Bills and subscriptions: things paid every month, every few months or every year.
// Shown under Budget. Bills can vary in amount; then Log asks what was actually paid.
import { state, newId, categoriesOf, categoryById, saveSubscription, removeSubscription, saveTransaction, removeTransaction,
  subscriptionStatus, subscriptionPaid, chargeDateIn, monthlyCost, yearlyCost, lastPaid, billPayments, usualAmount } from '../store.js?v=202611231603';
import { icon } from '../icons.js?v=202611231603';
import { esc, money, parseAmount, amountInput, todayISO, monthOf, fromISO, shortDate, openSheet, closeSheet, toast, saveFailed } from '../ui.js?v=202611231603';
import { head, showError, categoryChips } from './sheets.js?v=202611231603';
import { BRANDS } from '../brands.js?v=202611231603';
import { budgetNav } from './budget.js?v=202611231603';

// The service's logo if we know it; otherwise a bill shows its category icon and a
// subscription its first letter, on the category colour.
const squash = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
export function findBrand(name) {
  const key = squash(name);
  return BRANDS.find((b) => b.aliases.some((a) => key === a || key.startsWith(a)));
}
// ---------- Optical centring ----------
// Logos and letters are placed by where their ink actually is, measured once on a
// small canvas, so lopsided shapes (a cloud, a serif capital) look centred in the circle.

const inkCache = new Map();

// Logos: already centred by their outline; nudge them partway towards their visual
// weight (60%), the way icon designers balance a shape in a circle. In 24-unit space.
function logoNudge(d) {
  if (inkCache.has(d)) return inkCache.get(d);
  let nudge = [0, 0];
  try {
    const S = 4, N = 96, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'); g.scale(S, S); g.fill(new Path2D(d));
    const px = g.getImageData(0, 0, N, N).data;
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { if (px[(y * N + x) * 4 + 3] > 40) { sx += x; sy += y; n++; } }
    if (n) nudge = [-(sx / n / S - 12) * 0.6, -(sy / n / S - 12) * 0.6].map((v) => Math.round(v * 100) / 100);
  } catch { /* keep it centred by its outline */ }
  inkCache.set(d, nudge);
  return nudge;
}

// Letters: measure the drawn capital and return where to place it in a 40 x 40 box.
const LETTER_FONT = '"Instrument Serif", Georgia, serif';
function letterPosition(ch) {
  const key = `letter:${ch}`;
  if (inkCache.has(key)) return inkCache.get(key);
  let pos = [20, 27.5]; // a sensible guess until the font has loaded
  const ready = !document.fonts || document.fonts.check(`100px ${LETTER_FONT}`);
  try {
    const c = document.createElement('canvas'); c.width = 200; c.height = 200;
    const g = c.getContext('2d'); g.font = `400 100px ${LETTER_FONT}`; g.textBaseline = 'alphabetic';
    g.fillText(ch, 50, 150);
    const px = g.getImageData(0, 0, 200, 200).data;
    let minX = 200, minY = 200, maxX = -1, maxY = -1;
    for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) {
      if (px[(y * 200 + x) * 4 + 3] > 60) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    if (maxX >= 0) {
      const k = 22 / 100; // drawn at 100px, shown at 22px
      pos = [20 - ((minX + maxX) / 2 - 50) * k, 20 - ((minY + maxY) / 2 - 150) * k].map((v) => Math.round(v * 100) / 100);
    }
  } catch { /* use the guess */ }
  if (ready) inkCache.set(key, pos);
  return pos;
}

function serviceBubble(s) {
  const b = findBrand(s.name);
  if (b) {
    const [r, g, bl] = [0, 2, 4].map((i) => parseInt(b.hex.slice(i, i + 2), 16));
    const fg = 0.299 * r + 0.587 * g + 0.114 * bl > 160 ? '#1B1A17' : '#FFFFFF';
    const [nx, ny] = logoNudge(b.path);
    return `<span class="bubble brand" style="background:#${b.hex};color:${fg}" title="${esc(b.title)}"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="${b.path}"${nx || ny ? ` transform="translate(${nx} ${ny})"` : ''}/></svg></span>`;
  }
  const c = categoryById(s.categoryId);
  if (s.kind === 'bill') return `<span class="bubble tone-${c ? c.color : 'butter'}" aria-hidden="true">${icon(c ? c.icon : 'zap', 18)}</span>`;
  const ch = s.name.trim().charAt(0).toUpperCase() || '?';
  const [x, y] = letterPosition(ch);
  return `<span class="bubble monogram tone-${c ? c.color : 'sky'}" aria-hidden="true"><svg viewBox="0 0 40 40" width="40" height="40"><text x="${x}" y="${y}" font-family='${LETTER_FONT}' font-size="22" fill="currentColor">${esc(ch)}</text></svg></span>`;
}

// "4 Nov", or "4 Nov 2027" when it is not this year.
const withYear = (d) => (d.slice(0, 4) === todayISO().slice(0, 4) ? shortDate(d) : `${shortDate(d)} ${d.slice(0, 4)}`);

const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const monthName = (m) => new Date(2026, m - 1, 1).toLocaleDateString('en-GB', { month: 'long' });
const isManual = (s) => s.cycle === 'manual';
const when = (s) => (isManual(s) ? 'added by you when it arrives'
  : s.cycle === 'yearly' ? `every year on ${s.day} ${monthName(s.month)}`
  : (s.every || 1) > 1 ? `every ${s.every} months on the ${ordinal(s.day)}` : `every month on the ${ordinal(s.day)}`);
// 0 = no fixed date: you add each bill yourself when it arrives.
const FREQS = [[1, 'Every month'], [2, 'Every 2 months'], [3, 'Every 3 months'], [4, 'Every 4 months'], [6, 'Every 6 months'], [12, 'Every year'], [0, 'I add it each time']];
const freqOf = (s) => (isManual(s) ? 0 : s.cycle === 'yearly' ? 12 : s.every || 1);
const isBill = (s) => s.kind === 'bill';
const amountText = (s) => (isManual(s)
  ? (billPayments(s).length || s.amount ? `usually about ${money(usualAmount(s))}` : 'no bills added yet')
  : `${s.variable ? 'about ' : ''}${money(s.amount)}`);
const monthShort = (d) => fromISO(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

function withStatus() {
  const today = todayISO();
  return state.subscriptions
    .map((s) => {
      const st = subscriptionStatus(s, today);
      // The next payment still to come: for a due one, the one after it.
      const upcoming = st.due ? subscriptionStatus({ ...s, handled: st.month }, today).date : st.date;
      return { s, st, upcoming };
    })
    // Due first, then by date; bills you add yourself (no date) last.
    .sort((a, b) => (a.st.due !== b.st.due ? (a.st.due ? -1 : 1) : (a.st.date || '9999').localeCompare(b.st.date || '9999')));
}

const soonest = (list) => list.filter((x) => x.upcoming).sort((a, b) => a.upcoming.localeCompare(b.upcoming))[0];
const sumOf = (list, fn) => list.reduce((n, s) => n + fn(s), 0);

// Payments that fall in this calendar month and are not paid yet (variable bills at their estimate).
function stillToPay() {
  const month = monthOf(todayISO());
  return state.subscriptions.filter((s) => chargeDateIn(s, month) && !subscriptionPaid(s, month));
}

// Small tile on the Budget overview.
export function summaryTile() {
  const list = withStatus();
  const due = list.filter((x) => x.st.due);
  const left = stillToPay();
  const leftSum = sumOf(left, (s) => s.amount);
  const line = !list.length ? 'Add rent, utilities and the services you pay for'
    : due.length ? `${due.map((x) => esc(x.s.name)).join(', ')} ${due.length === 1 ? 'is' : 'are'} due`
    : left.length ? `${money(leftSum)} still to pay this month`
    : 'Everything for this month is paid';
  return `
    <section class="bento" aria-label="Bills and subscriptions">
      <a class="tile tone-sky span-all tile-subs" href="#/subscriptions">
        <span class="tile-icon">${icon('receipt', 22)}</span>
        <span class="tile-subs-main">
          <span class="tile-label">Bills &amp; subscriptions</span>
          <span class="figure figure-sm">${list.length ? `${money(sumOf(state.subscriptions, monthlyCost))} <small>a month</small>` : 'None yet'}</span>
          <span class="tile-line">${line}</span>
        </span>
        ${due.length ? `<span class="badge">${due.length} due</span>` : ''}
        <span class="tile-subs-go">${icon('chevron-right', 20)}</span>
      </a>
    </section>`;
}

// A bill you add yourself: shows this month's bill if it is in, and an Add button.
function manualRow({ s, st }) {
  const thisMonth = monthOf(todayISO());
  const latest = billPayments(s).find((t) => t.date.startsWith(thisMonth));
  return `
    <li class="jrow">
      <button type="button" class="row" data-action="sub-edit" data-id="${s.id}">
        ${serviceBubble(s)}
        <span class="row-main">
          <span class="row-title">${esc(s.name)}</span>
          <span class="row-sub wrap">${latest ? `This month: ${money(latest.amount)} · ${shortDate(latest.date)}` : `Not added this month · ${amountText(s)}`}</span>
        </span>
      </button>
      <button type="button" class="btn btn-quiet btn-add-bill" data-action="sub-entry" data-id="${s.id}" aria-label="Add a ${esc(s.name)} bill">${icon('plus', 16)} Add</button>
    </li>`;
}

function subRow({ s, st }) {
  if (isManual(s)) return manualRow({ s, st });
  return `
    <li>
      <button type="button" class="row" data-action="sub-edit" data-id="${s.id}">
        ${serviceBubble(s)}
        <span class="row-main">
          <span class="row-title">${esc(s.name)}</span>
          <span class="row-sub wrap">${amountText(s)} ${when(s)}${s.variable ? ' · amount varies' : ''}</span>
        </span>
        <span class="row-end">
          <span class="status-pill${st.due ? ' is-due' : ''}">${st.due ? 'Due' : withYear(st.date)}</span>
          ${st.paidThisMonth ? '<span class="row-sub">Paid this month</span>' : ''}
        </span>
      </button>
    </li>`;
}

function section(kind, list) {
  const bill = kind === 'bill';
  const title = bill ? 'Bills' : 'Subscriptions';
  const items = list.filter((x) => (bill ? isBill(x.s) : !isBill(x.s)));
  const perMonth = sumOf(items.map((x) => x.s), monthlyCost);
  return `
    <section aria-labelledby="h-${kind}">
      <div class="section-row">
        <h2 class="section-title" id="h-${kind}">${title}${items.length ? ` <small class="section-sum">${money(perMonth)} a month</small>` : ''}</h2>
        <button type="button" class="btn btn-quiet" data-action="sub-add" data-kind="${kind}" aria-label="Add ${bill ? 'bill' : 'subscription'}">${icon('plus', 16)} Add</button>
      </div>
      <div class="panel">
        ${items.length
          ? `<ul class="rows">${items.map(subRow).join('')}</ul>`
          : `<p class="empty">${bill
            ? 'Rent, electricity, water, building upkeep. Fixed ones get a payment day; for ones that change, choose "I add it each time" and add each bill when it arrives.'
            : 'Netflix, Spotify, cloud storage: add each one with its price and payment day, and the app reminds you to log each payment.'}</p>`}
      </div>
    </section>`;
}

export function render() {
  const list = withStatus();
  const due = list.filter((x) => x.st.due);
  const next = soonest(list);
  const left = stillToPay();
  const bills = state.subscriptions.filter(isBill);
  const subs = state.subscriptions.filter((s) => !isBill(s));

  return `
    <header class="page-head page-head-row">
      <h1>Budget</h1>
      ${budgetNav('subscriptions')}
    </header>

    <section class="bento bento-3" aria-label="Bills and subscriptions totals">
      <div class="tile tone-sky span-2-sm">
        <span class="tile-label">Bills &amp; subscriptions</span>
        <span class="figure">${money(sumOf(state.subscriptions, monthlyCost))} <small>a month</small></span>
        <span class="tile-line">Bills ${money(sumOf(bills, monthlyCost))} · Subscriptions ${money(sumOf(subs, monthlyCost))} · ${money(sumOf(state.subscriptions, yearlyCost))} a year</span>
      </div>
      <div class="tile tone-pink">
        <span class="tile-label">Still to pay this month</span>
        <span class="figure figure-sm">${money(sumOf(left, (s) => s.amount))}</span>
        <span class="tile-line">${left.length ? `${left.length} ${left.length === 1 ? 'payment' : 'payments'}${due.length ? `, ${due.length} due now` : ''}` : 'All paid'}</span>
      </div>
      <div class="tile tone-butter">
        <span class="tile-label">Next payment</span>
        <span class="figure figure-sm">${next ? esc(next.s.name) : 'None'}</span>
        <span class="tile-line">${next ? `${amountText(next.s)} on ${shortDate(next.upcoming)}` : 'Add a bill or subscription to see it'}</span>
      </div>
    </section>

    ${due.length ? `
    <section class="panel tone-panel tone-pink" aria-labelledby="h-due">
      <h2 id="h-due">Due now</h2>
      <p class="tile-line">Log adds the payment to your expenses on its date. Skip if you were not charged this time.</p>
      <ul class="sub-due">
        ${due.map(({ s, st }) => `
          <li>
            ${serviceBubble(s)}
            <span class="row-main">
              <span class="row-title">${esc(s.name)}</span>
              <span class="row-sub">${amountText(s)} · due ${shortDate(st.date)}</span>
            </span>
            <span class="sub-due-actions">
              <button type="button" class="btn btn-on-tone" data-action="sub-log" data-id="${s.id}">${icon('check', 16)} ${s.variable ? 'Log amount' : `Log ${money(s.amount)}`}</button>
              <button type="button" class="btn btn-ghost" data-action="sub-skip" data-id="${s.id}">Skip</button>
            </span>
          </li>`).join('')}
      </ul>
    </section>` : ''}

    ${section('bill', list)}
    ${section('subscription', list)}`;
}

// ---------- Log or skip a payment ----------

async function record(s, st, amount, date) {
  const before = { ...s };
  const txn = { id: newId(), date, amount, kind: 'expense', categoryId: s.categoryId, note: s.name, createdAt: new Date().toISOString() };
  try {
    await saveTransaction(txn);
    await saveSubscription({ ...s, handled: st.month });
    toast(`${s.name} logged, ${money(amount)}`, { label: 'Undo', run: () => removeTransaction(txn.id).then(() => saveSubscription(before)).catch(saveFailed) });
  } catch { saveFailed(); }
}

export function logPayment(id) {
  const s = state.subscriptions.find((x) => x.id === id);
  if (!s) return;
  const st = subscriptionStatus(s, todayISO());
  if (!s.variable) { record(s, st, s.amount, st.date); return; }

  // A bill whose amount changes: ask what was paid, starting from last time's amount.
  const guess = lastPaid(s) || s.amount;
  const el = openSheet(`
    <form class="form" novalidate>
      ${head(`Log ${esc(s.name)}`)}
      <div class="field">
        <label for="l-amount">Amount paid, in euros</label>
        <input id="l-amount" name="amount" class="input input-amount" inputmode="decimal" autocomplete="off" value="${amountInput(guess)}" aria-describedby="l-amount-help" autofocus>
        <p class="help" id="l-amount-help">${lastPaid(s) ? `Last time you paid ${money(lastPaid(s))}.` : `Your usual amount is ${money(s.amount)}.`}</p>
        <p class="error" data-error="amount" hidden></p>
      </div>
      <div class="field">
        <label for="l-date">Date</label>
        <input id="l-date" name="date" type="date" class="input" value="${st.date}" max="${todayISO()}">
        <p class="error" data-error="date" hidden></p>
      </div>
      <div class="sheet-actions"><span></span><button type="submit" class="btn btn-primary">${icon('check', 16)} Log payment</button></div>
    </form>`);
  const form = el.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = parseAmount(form.elements.amount.value);
    const date = form.elements.date.value;
    showError(form, 'date', !date ? 'Pick the day you paid.' : date > todayISO() ? 'Pick today or earlier.' : '');
    showError(form, 'amount', amount ? '' : 'Type the amount, for example 84.30');
    if (!amount || !date || date > todayISO()) return;
    closeSheet();
    record(s, st, amount, date);
  });
}

// ---------- Add a bill by hand ----------

export function openBillEntry(id) {
  const s = state.subscriptions.find((x) => x.id === id);
  if (!s) return;
  const past = billPayments(s);
  const el = openSheet(`
    <form class="form" novalidate>
      ${head(`Add ${esc(s.name)} bill`)}
      <div class="field">
        <label for="e-amount">Amount, in euros</label>
        <input id="e-amount" name="amount" class="input input-amount" inputmode="decimal" autocomplete="off" placeholder="0.00" aria-describedby="e-amount-help" autofocus>
        <p class="help" id="e-amount-help">${past.length ? `Last bill: ${money(past[0].amount)} in ${monthShort(past[0].date)}. Usually about ${money(usualAmount(s))}.` : 'Type the amount on the bill.'}</p>
        <p class="error" data-error="amount" hidden></p>
      </div>
      <div class="field">
        <label for="e-date">Date paid</label>
        <input id="e-date" name="date" type="date" class="input" value="${todayISO()}" max="${todayISO()}">
        <p class="error" data-error="date" hidden></p>
      </div>
      <p class="help">It is added to your expenses under ${esc((categoryById(s.categoryId) || {}).name || 'its category')} and shows on this bill.</p>
      <div class="sheet-actions"><span></span><button type="submit" class="btn btn-primary">${icon('plus', 16)} Add bill</button></div>
    </form>`);
  const form = el.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseAmount(form.elements.amount.value);
    const date = form.elements.date.value;
    showError(form, 'date', !date ? 'Pick the day you paid it.' : date > todayISO() ? 'Pick today or earlier.' : '');
    showError(form, 'amount', amount ? '' : 'Type the amount, for example 84.30');
    if (!amount || !date || date > todayISO()) return;
    const txn = { id: newId(), date, amount, kind: 'expense', categoryId: s.categoryId, note: s.name, createdAt: new Date().toISOString() };
    closeSheet();
    try {
      await saveTransaction(txn);
      toast(`${s.name} bill added, ${money(amount)}`, { label: 'Undo', run: () => removeTransaction(txn.id).catch(saveFailed) });
    } catch { saveFailed(); }
  });
}

export async function skipPayment(id) {
  const s = state.subscriptions.find((x) => x.id === id);
  if (!s) return;
  const st = subscriptionStatus(s, todayISO());
  const before = { ...s };
  try {
    await saveSubscription({ ...s, handled: st.month });
    toast(`${s.name} skipped this time`, { label: 'Undo', run: () => saveSubscription(before).catch(saveFailed) });
  } catch { saveFailed(); }
}

// ---------- Add / edit ----------

const defaultCategory = (kind) => {
  const list = categoriesOf('expense');
  return list.find((c) => c.name === (kind === 'bill' ? 'Home & bills' : 'Other')) || list[0];
};

export function openSubscriptionSheet(id, kind = 'subscription') {
  const existing = id ? state.subscriptions.find((x) => x.id === id) : null;
  const k = existing ? existing.kind || 'subscription' : kind;
  const cat = defaultCategory(k);
  const s = existing || { id: newId(), kind: k, name: '', amount: 0, variable: false, cycle: 'monthly', every: 1, day: 1, month: 1, categoryId: cat ? cat.id : '', handled: '', createdAt: new Date().toISOString() };
  const nextDate = existing ? subscriptionStatus(s, todayISO()).date || '' : '';
  const noun = k === 'bill' ? 'bill' : 'subscription';
  const manual = isManual(s);
  const history = existing ? billPayments(s).slice(0, 6) : [];

  const el = openSheet(`
    <form class="form" novalidate>
      ${head(existing ? `Edit ${noun}` : `Add ${noun}`)}

      <fieldset class="segmented">
        <legend class="visually-hidden">Type</legend>
        <label><input type="radio" name="kind" value="bill" ${k === 'bill' ? 'checked' : ''}><span>Bill</span></label>
        <label><input type="radio" name="kind" value="subscription" ${k !== 'bill' ? 'checked' : ''}><span>Subscription</span></label>
      </fieldset>

      <div class="field">
        <label for="s-name">Name</label>
        <input id="s-name" name="name" class="input" maxlength="40" autocomplete="off" placeholder="${k === 'bill' ? 'For example: Electricity' : 'For example: Netflix'}" value="${esc(s.name)}" ${existing ? '' : 'autofocus'}>
        <p class="help">Use the name you write on the expense, so payments you log by hand are recognised.</p>
        <p class="error" data-error="name" hidden></p>
      </div>

      <div class="field">
        <label for="s-amount" data-amount-label>${manual ? 'Usual amount in euros <span class="optional">optional</span>' : s.variable ? 'Usual amount in euros' : 'Amount in euros'}</label>
        <input id="s-amount" name="amount" class="input input-amount" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${amountInput(s.amount)}">
        <p class="help" data-manual-help ${manual ? '' : 'hidden'}>Only a guess until you add real bills; after that the app uses the average of your last three.</p>
        <p class="error" data-error="amount" hidden></p>
      </div>

      <label class="check-row" data-variable ${k === 'bill' && !manual ? '' : 'hidden'}>
        <input type="checkbox" name="variable" ${s.variable ? 'checked' : ''}>
        <span>The amount changes each time</span>
      </label>

      <fieldset class="field">
        <legend>How often</legend>
        <div class="chips">
          ${FREQS.map(([n, label]) => `<label class="chip" ${n === 0 ? `data-manual-chip ${k === 'bill' ? '' : 'hidden'}` : ''}><input type="radio" name="freq" value="${n}" ${freqOf(s) === n ? 'checked' : ''}><span>${label}</span></label>`).join('')}
        </div>
        <p class="help" data-manual-note ${manual ? '' : 'hidden'}>No fixed day or amount. Use the Add button next to the bill each time one arrives.</p>
      </fieldset>

      <div class="field" data-date-field ${manual ? 'hidden' : ''}>
        <label for="s-date">Next payment</label>
        <input id="s-date" name="date" type="date" class="input" value="${nextDate}" aria-describedby="s-date-help">
        <p class="help" id="s-date-help" data-date-help>${existing ? `Currently ${when(s)}.` : 'The app repeats it on the same day each time.'}</p>
        <p class="error" data-error="date" hidden></p>
      </div>

      <fieldset class="field">
        <legend>Category</legend>
        <div class="chips" data-cats>${categoryChips('expense', s.categoryId)}</div>
        <p class="error" data-error="categoryId" hidden></p>
      </fieldset>

      ${history.length ? `
      <div class="field">
        <p class="field-title">Recent payments</p>
        <ul class="history-list">
          ${history.map((t) => `<li><span>${monthShort(t.date)} <small>${shortDate(t.date)}</small></span><b>${money(t.amount)}</b></li>`).join('')}
        </ul>
        <p class="help">Usually about ${money(usualAmount(s))} · about ${money(monthlyCost(s))} a month on average.</p>
      </div>` : ''}

      <div class="sheet-actions">
        ${existing ? `<button type="button" class="btn btn-quiet btn-danger" data-delete>${icon('trash-2', 16)} Delete</button>` : '<span></span>'}
        <button type="submit" class="btn btn-primary">${existing ? 'Save changes' : 'Add'}</button>
      </div>
    </form>`);

  const form = el.querySelector('form');

  const shape = (data, dt) => {
    const freq = Number(data.get('freq'));
    return { cycle: freq === 12 ? 'yearly' : 'monthly', every: freq === 12 ? 1 : freq, day: dt.getDate(), month: dt.getMonth() + 1 };
  };
  // Spell out what the picked date means, e.g. "every 2 months on the 3rd".
  const isManualPicked = () => new FormData(form).get('freq') === '0';
  // Show only what fits: bills you add each time need no date, no "varies" box,
  // and only an optional usual amount.
  const sync = () => {
    const bill = new FormData(form).get('kind') === 'bill';
    const chip = form.querySelector('[data-manual-chip]');
    chip.hidden = !bill;
    if (!bill && isManualPicked()) form.querySelector('input[name=freq][value="1"]').checked = true;
    const m = bill && isManualPicked();
    form.querySelector('[data-date-field]').hidden = m;
    form.querySelector('[data-variable]').hidden = !bill || m;
    form.querySelector('[data-manual-note]').hidden = !m;
    form.querySelector('[data-manual-help]').hidden = !m;
    form.querySelector('[data-amount-label]').innerHTML = m ? 'Usual amount in euros <span class="optional">optional</span>'
      : form.elements.variable.checked && bill ? 'Usual amount in euros' : 'Amount in euros';
  };
  form.addEventListener('change', (e) => {
    if (e.target.name === 'kind' && !existing) form.querySelector('[data-cats]').innerHTML = categoryChips('expense', (defaultCategory(e.target.value) || {}).id);
    sync();
    const d = form.elements.date.value;
    if (d && !isManualPicked()) form.querySelector('[data-date-help]').textContent = `Repeats ${when(shape(new FormData(form), fromISO(d)))}.`;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const name = String(data.get('name')).trim();
    const categoryId = data.get('categoryId');
    const kindNow = data.get('kind');

    if (kindNow === 'bill' && isManualPicked()) {
      const text = String(data.get('amount')).trim();
      const usual = text ? parseAmount(text) : 0;
      showError(form, 'categoryId', categoryId ? '' : 'Pick a category.');
      showError(form, 'amount', usual === null ? 'Type a number, for example 80, or leave it empty' : '');
      showError(form, 'name', name ? '' : 'Give it a name.');
      if (!name || usual === null || !categoryId) return;
      closeSheet();
      try {
        // day and month are not used for these bills; they are kept valid for the database.
        await saveSubscription({ ...s, kind: 'bill', name, amount: usual, variable: true, cycle: 'manual', every: 1, day: s.day || 1, month: s.month || 1, categoryId, handled: '' });
        toast(existing ? 'Changes saved' : `${name} added. Use Add next to it when a bill arrives.`);
      } catch { saveFailed(); }
      return;
    }

    const amount = parseAmount(data.get('amount'));
    const date = data.get('date');
    showError(form, 'categoryId', categoryId ? '' : 'Pick a category.');
    showError(form, 'date', date ? '' : 'Pick the date of the next payment.');
    showError(form, 'amount', amount ? '' : 'Type the amount, for example 12.99');
    showError(form, 'name', name ? '' : 'Give it a name.');
    if (!name || !amount || !date || !categoryId) return;

    const dt = fromISO(date);
    const next = { ...s, kind: kindNow, name, amount, variable: kindNow === 'bill' && !!data.get('variable'), categoryId, ...shape(data, dt) };
    // If the next payment is in the future, this month's earlier payment (if any) is
    // already behind you, so do not ask to log it.
    const today = todayISO();
    const thisMonth = monthOf(today);
    const thisDate = chargeDateIn(next, thisMonth);
    if (date > today && thisDate && thisDate < date && monthOf(date) !== thisMonth) next.handled = thisMonth;

    closeSheet();
    try {
      await saveSubscription(next);
      toast(existing ? 'Changes saved' : `${name} added`);
    } catch { saveFailed(); }
  });

  form.querySelector('[data-delete]')?.addEventListener('click', async () => {
    closeSheet();
    try {
      await removeSubscription(s.id);
      toast(`${s.name} deleted`, { label: 'Undo', run: () => saveSubscription(s).catch(saveFailed) });
    } catch { saveFailed(); }
  });
}
