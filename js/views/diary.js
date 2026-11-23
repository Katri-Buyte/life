// Diary: a daily entry with small trackers and a few gentle questions.
// It saves while you type, so nothing is lost if the app closes.
import { state, dayEntry, patchJournalDay, persistJournalDay, saveJournalSettings } from '../store.js?v=202611231417';
import { icon } from '../icons.js?v=202611231417';
import { esc, iso, todayISO, fromISO, openSheet, closeSheet, toast, saveFailed } from '../ui.js?v=202611231417';
import { head, showError } from './sheets.js?v=202611231417';
import { journalNav, currentDay, ENERGY } from './journal.js?v=202611231417';

export const TRACKERS = [
  { id: 'water', name: 'Water', unit: 'glasses', icon: 'droplet', tone: 'sky', goal: 8, step: 1, max: 30 },
  { id: 'steps', name: 'Steps', unit: 'steps', icon: 'footprints', tone: 'sage', goal: 7000, step: 500, max: 60000 },
  { id: 'sleep', name: 'Sleep', unit: 'hours', icon: 'moon', tone: 'lavender', goal: 7.5, step: 0.5, max: 16 },
  { id: 'movement', name: 'Movement', unit: 'min', icon: 'dumbbell', tone: 'pink', goal: 30, step: 5, max: 600 },
  { id: 'outside', name: 'Time outside', unit: 'min', icon: 'sun', tone: 'butter', goal: 20, step: 5, max: 900 },
  { id: 'cooked', name: 'Home-cooked meals', unit: 'meals', icon: 'chef-hat', tone: 'peach', goal: 2, step: 1, max: 6 },
];

// A different question each day, in our own words.
const QUESTIONS = [
  'What did my body need today, and did I give it that?',
  'When did I feel most like myself today?',
  'What am I avoiding, and what is the smallest step towards it?',
  'What would I tell a friend who had my day?',
  'Which moment from today do I want to remember?',
  'What took more energy than it was worth?',
  'Who made my day a little better?',
  'What did I learn about myself today?',
  'Where did I rush, and what would slowing down have looked like?',
  'What am I looking forward to this week?',
  'What is one thing I could stop doing?',
  'What felt hard today, and how did I get through it?',
  'What does enough look like for tomorrow?',
  'What made me smile today?',
];
const questionFor = (date) => { const [y, m, d] = date.split('-').map(Number); return QUESTIONS[(Math.floor(Date.UTC(y, m - 1, d) / 86400000) + 5) % QUESTIONS.length]; };

const goalOf = (t) => {
  const g = Number((state.journalSettings.goals || {})[t.id]);
  return g > 0 ? g : t.goal;
};
const fmt = (t, v) => (t.id === 'steps' ? Math.round(v).toLocaleString('en-GB') : String(Math.round(v * 10) / 10));
// For editable boxes: no thousands separator, so 6500 is not read back as 6.5.
const plain = (t, v) => String(t.id === 'steps' ? Math.round(v) : Math.round(v * 10) / 10);
const readNumber = (t, text) => Number(t.id === 'steps' ? String(text).replace(/\D/g, '') : String(text).replace(',', '.').replace(/[^\d.]/g, ''));
const addDays = (date, n) => { const d = fromISO(date); d.setDate(d.getDate() + n); return iso(d); };
const niceDate = (date) => fromISO(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

// Average over the 7 days before this one, counting only days with a value.
function average(t, date) {
  const vals = Array.from({ length: 7 }, (_, i) => Number(((dayEntry(addDays(date, -(i + 1))) || {}).trackers || {})[t.id]))
    .filter((v) => v > 0);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function trackerCard(t, entry, date) {
  const v = Number((entry.trackers || {})[t.id]) || 0;
  const goal = goalOf(t);
  const pct = Math.min(100, Math.round((v / goal) * 100));
  const avg = average(t, date);
  return `
    <div class="tile tone-${t.tone} tracker" data-tracker-card="${t.id}">
      <span class="tracker-head"><span class="tile-icon">${icon(t.icon, 20)}</span><span class="tile-label">${t.name}</span></span>
      <span class="tracker-value">
        <label class="visually-hidden" for="tr-${t.id}">${t.name}, in ${t.unit}</label>
        <input id="tr-${t.id}" class="tracker-input" data-tracker="${t.id}" inputmode="decimal" autocomplete="off" value="${v ? plain(t, v) : ''}" placeholder="0">
        <span class="tracker-unit">${t.unit}</span>
      </span>
      <span class="meter" role="img" aria-label="${pct}% of your goal"><span data-meter style="width:${pct}%"></span></span>
      <span class="tracker-foot">
        <span class="tile-line">Goal ${fmt(t, goal)}${avg !== null ? ` · 7-day avg ${fmt(t, avg)}` : ''}</span>
        <span class="tracker-steps">
          <button type="button" class="step-btn" data-step="${t.id}" data-by="-1" aria-label="${t.name} minus ${t.step}">−</button>
          <button type="button" class="step-btn" data-step="${t.id}" data-by="1" aria-label="${t.name} plus ${t.step}">${icon('plus', 16)}</button>
        </span>
      </span>
    </div>`;
}

const field = (key, label, entry, opts = {}) => `
  <div class="field">
    <label for="a-${key}" class="${opts.quiet ? 'quiet-label' : ''}">${label}</label>
    <textarea id="a-${key}" class="input textarea diary-text" data-answer="${key}" rows="${opts.rows || 2}" maxlength="4000" placeholder="${opts.placeholder || ''}">${esc((entry.answers || {})[key] || '')}</textarea>
  </div>`;

function pastEntries(date) {
  const has = (d) => d.note || d.mood || Object.values(d.trackers || {}).some((v) => Number(v) > 0) || Object.values(d.answers || {}).some((v) => String(v).trim());
  const list = state.journalDays.filter((d) => d.date !== date && has(d)).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 14);
  if (!list.length) return '';
  const snippet = (d) => {
    const a = d.answers || {};
    const text = [a.entry, a.wentWell, a.qotd, a.grateful1, d.note].find((x) => x && String(x).trim()) || '';
    return text.length > 110 ? text.slice(0, 110) + '…' : text;
  };
  return `
    <section class="panel" aria-labelledby="h-past">
      <h2 id="h-past">Earlier entries</h2>
      <ul class="rows">
        ${list.map((d) => {
          const tr = d.trackers || {};
          const bits = [d.mood || (d.energy ? ENERGY[d.energy] : ''), tr.water ? `${fmt(TRACKERS[0], tr.water)} glasses` : '', tr.steps ? `${fmt(TRACKERS[1], tr.steps)} steps` : '', tr.sleep ? `${fmt(TRACKERS[2], tr.sleep)} h sleep` : ''].filter(Boolean);
          return `
            <li>
              <button type="button" class="row" data-action="diary-day" data-date="${d.date}">
                <span class="bubble tone-lavender">${icon('book-heart', 18)}</span>
                <span class="row-main">
                  <span class="row-title">${esc(niceDate(d.date))}</span>
                  <span class="row-sub wrap">${esc(bits.join(' · '))}${snippet(d) ? `${bits.length ? ' · ' : ''}<em>${esc(snippet(d))}</em>` : ''}</span>
                </span>
              </button>
            </li>`;
        }).join('')}
      </ul>
    </section>`;
}

export function render() {
  const date = currentDay();
  const entry = dayEntry(date) || { trackers: {}, answers: {} };
  const isToday = date === todayISO();
  const t = todayISO();
  const label = isToday ? 'Today' : date === addDays(t, -1) ? 'Yesterday' : date === addDays(t, 1) ? 'Tomorrow' : niceDate(date);
  const a = entry.answers || {};
  const q = a.qotdQ || questionFor(date);
  const vibe = entry.mood || (entry.energy ? ENERGY[entry.energy] : '');

  return `
    <header class="page-head page-head-row">
      <h1>Journal</h1>
      ${journalNav('diary')}
    </header>

    <div class="month-row">
      <div class="month" role="group" aria-label="Day">
        <button type="button" class="icon-btn" data-action="jday-prev" aria-label="Previous day">${icon('chevron-left', 20)}</button>
        <span class="month-label" aria-live="polite">${esc(label)}</span>
        <button type="button" class="icon-btn" data-action="jday-next" aria-label="Next day">${icon('chevron-right', 20)}</button>
      </div>
      ${isToday ? '' : '<button type="button" class="btn btn-quiet" data-action="jday-today">Today</button>'}
      <span class="save-state" id="diary-status" role="status" aria-live="polite"></span>
    </div>

    <section class="diary-cover tone-panel panel tone-lavender" aria-label="Entry">
      <p class="tile-label">${esc(niceDate(date))}</p>
      <p class="word">Dear diary</p>
      <p class="tile-line"><span>${vibe ? `You checked in feeling <b>${esc(vibe)}</b>.` : 'No check-in yet.'}</span> <button type="button" class="tile-link" data-action="j-checkin">${vibe ? 'Change' : 'Check in'}</button></p>
    </section>

    <section aria-labelledby="h-trackers">
      <div class="section-row">
        <h2 class="section-title" id="h-trackers">Today's body</h2>
        <button type="button" class="btn btn-quiet" data-action="diary-goals">${icon('target', 16)} Goals</button>
      </div>
      <div class="tracker-grid">${TRACKERS.map((tr) => trackerCard(tr, entry, date)).join('')}</div>
    </section>

    <section class="panel diary-q" aria-labelledby="h-reflect">
      <h2 id="h-reflect">Reflect</h2>

      <div class="qotd">
        <p class="tile-label">Question of the day</p>
        ${field('qotd', esc(q), entry, { rows: 3 })}
      </div>

      <fieldset class="field">
        <legend>Three things I'm grateful for</legend>
        ${[1, 2, 3].map((n) => `
          <label class="visually-hidden" for="a-grateful${n}">Grateful for, ${n}</label>
          <input id="a-grateful${n}" class="input" data-answer="grateful${n}" maxlength="200" autocomplete="off" placeholder="${['Something small counts', 'A person, a moment, a taste', 'Something about yourself'][n - 1]}" value="${esc(a[`grateful${n}`] || '')}">`).join('')}
      </fieldset>

      <div class="field-row two">
        ${field('drained', 'What drained me', entry)}
        ${field('energized', 'What gave me energy', entry)}
      </div>

      ${field('tomorrow', 'The one thing that matters tomorrow', entry, { rows: 1 })}

      <details class="more-q" ${a.wentWell || a.kind || a.letGo ? 'open' : ''}>
        <summary>More questions</summary>
        ${field('wentWell', 'What went well today?', entry)}
        ${field('kind', 'One kind thing I did for myself', entry)}
        ${field('letGo', "What I'm letting go of", entry)}
      </details>
    </section>

    <section class="panel" aria-labelledby="h-free">
      <h2 id="h-free">Write freely</h2>
      ${field('entry', '<span class="visually-hidden">Diary entry</span>', entry, { rows: 6, placeholder: 'Anything about today. Only you can see this.', quiet: true })}
    </section>

    ${pastEntries(date)}`;
}

// ---------- Saving while typing ----------

let timer = null;
let pendingDate = null;

function status(text) {
  const el = document.getElementById('diary-status');
  if (el) el.textContent = text;
}

function schedule(date) {
  pendingDate = date;
  status('Saving…');
  clearTimeout(timer);
  timer = setTimeout(flush, 700);
}

export async function flush() {
  clearTimeout(timer);
  if (!pendingDate) return;
  const date = pendingDate;
  pendingDate = null;
  try {
    await persistJournalDay(date);
    status('Saved');
  } catch {
    pendingDate = date; // try again on the next change
    status('Not saved yet. Check your connection; it saves again as you type.');
  }
}
window.addEventListener('pagehide', flush);
window.addEventListener('hashchange', flush);

function setTracker(root, date, id, value) {
  const t = TRACKERS.find((x) => x.id === id);
  const v = Math.max(0, Math.min(t.max, Math.round(value * 10) / 10));
  patchJournalDay(date, { trackers: { [id]: v } });
  const card = root.querySelector(`[data-tracker-card="${id}"]`);
  const pct = Math.min(100, Math.round((v / goalOf(t)) * 100));
  card.querySelector('[data-meter]').style.width = `${pct}%`;
  card.querySelector('.meter').setAttribute('aria-label', `${pct}% of your goal`);
  return v;
}

export function mount(root) {
  const date = currentDay();

  root.addEventListener('input', (e) => {
    const a = e.target.closest('[data-answer]');
    if (a) {
      const patch = { [a.dataset.answer]: a.value };
      if (a.dataset.answer === 'qotd') patch.qotdQ = (dayEntry(date) || {}).answers?.qotdQ || questionFor(date);
      patchJournalDay(date, { answers: patch });
      schedule(date);
      return;
    }
    const tr = e.target.closest('[data-tracker]');
    if (tr) {
      const t = TRACKERS.find((x) => x.id === tr.dataset.tracker);
      setTracker(root, date, t.id, readNumber(t, tr.value) || 0);
      schedule(date);
    }
  });

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-step]');
    if (!b) return;
    const t = TRACKERS.find((x) => x.id === b.dataset.step);
    const cur = Number(((dayEntry(date) || {}).trackers || {})[t.id]) || 0;
    const v = setTracker(root, date, t.id, cur + t.step * Number(b.dataset.by));
    root.querySelector(`#tr-${t.id}`).value = v ? plain(t, v) : '';
    schedule(date);
  });
}

// ---------- Goals ----------

export function openGoals() {
  const el = openSheet(`
    <form class="form" novalidate>
      ${head('Daily goals')}
      <p class="help">Something to aim for, not a test. Pick numbers that feel kind.</p>
      ${TRACKERS.map((t) => `
        <div class="field">
          <label for="g-${t.id}">${t.name}, in ${t.unit}</label>
          <input id="g-${t.id}" name="${t.id}" class="input" inputmode="decimal" autocomplete="off" value="${plain(t, goalOf(t))}">
          <p class="error" data-error="${t.id}" hidden></p>
        </div>`).join('')}
      <div class="sheet-actions"><span></span><button type="submit" class="btn btn-primary">Save goals</button></div>
    </form>`);
  const form = el.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const goals = {};
    let ok = true;
    for (const t of [...TRACKERS].reverse()) {
      const v = readNumber(t, form.elements[t.id].value);
      const good = v > 0 && v <= t.max;
      showError(form, t.id, good ? '' : `Type a number between ${t.step} and ${fmt(t, t.max)}`);
      if (good) goals[t.id] = v; else ok = false;
    }
    if (!ok) return;
    closeSheet();
    try { await saveJournalSettings({ ...state.journalSettings, goals }); toast('Goals saved'); } catch { saveFailed(); }
  });
}
