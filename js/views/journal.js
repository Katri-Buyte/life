// Journal: routines and one-off tasks spread over the week, a daily check-in,
// and a gentle warning when a day holds more than feels comfortable.
import { state, newId, itemsOn, markFor, dayEntry, daySummary, weekday,
  saveJournalItem, removeJournalItem, saveJournalMark, removeJournalMark, saveJournalDay, saveJournalSettings } from '../store.js?v=202611231557';
import { icon } from '../icons.js?v=202611231557';
import { esc, iso, todayISO, fromISO, openSheet, closeSheet, toast, saveFailed } from '../ui.js?v=202611231557';
import * as diary from './diary.js?v=202611231557';
import { head, showError } from './sheets.js?v=202611231557';

export const TYPES = [
  { id: 'cleaning', name: 'Cleaning', icon: 'sparkles', tone: 'sky' },
  { id: 'market', name: 'Market run', icon: 'shopping-basket', tone: 'sage' },
  { id: 'workout', name: 'Workout', icon: 'dumbbell', tone: 'pink' },
  { id: 'cooking', name: 'Cooking', icon: 'chef-hat', tone: 'peach' },
  { id: 'selfcare', name: 'Self-care', icon: 'heart-pulse', tone: 'lavender' },
  { id: 'errand', name: 'Errand', icon: 'ellipsis', tone: 'butter' },
];
const PARTS = [
  { id: 'morning', name: 'Morning', icon: 'sunrise' },
  { id: 'afternoon', name: 'Afternoon', icon: 'sun' },
  { id: 'evening', name: 'Evening', icon: 'moon' },
  { id: 'anytime', name: 'Anytime', icon: 'clock' },
];
export const ENERGY = ['', 'Drained', 'Low', 'Okay', 'Good', 'Great'];
const MOODS = ['Calm', 'Happy', 'Motivated', 'Tired', 'Stressed', 'Overwhelmed', 'Anxious', 'Sad'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Ideas shown when there are no routines yet. Tapping one opens the form, filled in.
const TEMPLATES = [
  { title: 'Market run', type: 'market', days: [6], part: 'morning', minutes: 60 },
  { title: 'Clean the kitchen', type: 'cleaning', days: [2, 5], part: 'evening', minutes: 20 },
  { title: 'Laundry', type: 'cleaning', days: [7], part: 'anytime', minutes: 30 },
  { title: 'Walk outside', type: 'workout', days: [1, 2, 3, 4, 5], part: 'afternoon', minutes: 30 },
  { title: 'Dance workout', type: 'workout', days: [2, 4], part: 'evening', minutes: 20 },
  { title: 'Cook for two days', type: 'cooking', days: [3, 7], part: 'evening', minutes: 60 },
];

// A calm word for each day, in our own words. Chosen by date, so it stays the same all day.
const WORDS = [
  ['Enough', 'noun', 'The point where what you have done is sufficient, and more would only tire you.', 'What is already enough today?'],
  ['Pause', 'noun', 'A short stop on purpose, before the next thing.', 'Where could a two-minute pause fit today?'],
  ['Steady', 'adjective', 'Moving at a pace you could keep up for a long time.', 'What would a steady pace look like this afternoon?'],
  ['Begin', 'verb', 'To take only the first small step, without having to finish.', 'What is the smallest first step you could take?'],
  ['Notice', 'verb', 'To see what is happening, in you or around you, without judging it.', 'What do you notice in your body right now?'],
  ['Gentle', 'adjective', 'Soft in how you treat yourself, especially on hard days.', 'Where can you be gentler with yourself today?'],
  ['Rest', 'noun', 'Time that restores you. Not a reward you have to earn first.', 'What kind of rest would help most today?'],
  ['Lighten', 'verb', 'To take something off the load you are carrying.', 'What could you move to another day?'],
  ['Small', 'adjective', 'Little enough to start right now.', 'Which small thing would make tomorrow easier?'],
  ['Return', 'verb', 'To come back to what you meant to do, without blame for drifting.', 'What do you want to come back to?'],
  ['Present', 'adjective', 'Here, in this hour, not in the whole week at once.', 'What is the one thing in front of you?'],
  ['Allow', 'verb', 'To let a feeling be there without needing to fix it.', 'What feeling could you simply allow today?'],
  ['Unhurried', 'adjective', 'Doing one thing at a time, at its own speed.', 'Which task could you do slowly, on purpose?'],
  ['Simple', 'adjective', 'Done the easy way, which is often the good way.', 'How could today be simpler?'],
];
const wordFor = (date) => { const [y, m, d] = date.split('-').map(Number); return WORDS[Math.floor(Date.UTC(y, m - 1, d) / 86400000) % WORDS.length]; };

const typeOf = (id) => TYPES.find((t) => t.id === id) || TYPES[TYPES.length - 1];
const addDays = (date, n) => { const d = fromISO(date); d.setDate(d.getDate() + n); return iso(d); };
const dayName = (date) => fromISO(date).toLocaleDateString('en-GB', { weekday: 'long' });
const niceDate = (date) => fromISO(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const shortDay = (date) => fromISO(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const relDay = (date) => {
  const t = todayISO();
  if (date === t) return 'Today';
  if (date === addDays(t, 1)) return 'Tomorrow';
  if (date === addDays(t, -1)) return 'Yesterday';
  return niceDate(date);
};
const minutesLabel = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);
const repeatsLabel = (item) => {
  if (item.date) return 'Once';
  const d = [...item.days].sort();
  if (d.length === 7) return 'Every day';
  if (d.join() === '1,2,3,4,5') return 'Weekdays';
  if (d.join() === '6,7') return 'Weekends';
  return d.map((n) => WEEKDAYS[n - 1]).join(', ');
};
const mondayOf = (date) => addDays(date, -(weekday(date) - 1));

// The day and week being looked at.
let day = todayISO();
let weekStart = mondayOf(day);
export function setDay(date) { day = date; weekStart = mondayOf(date); }
export const currentDay = () => day;
export function shiftDay(n) { setDay(addDays(day, n)); }
export function shiftWeek(n) { weekStart = addDays(weekStart, 7 * n); }
export function thisWeek() { weekStart = mondayOf(todayISO()); }

export const journalNav = (active) => `
  <nav class="subnav" aria-label="Journal sections">
    <a href="#/journal" ${active === 'today' ? 'aria-current="page"' : ''}>Day</a>
    <a href="#/journal/diary" ${active === 'diary' ? 'aria-current="page"' : ''}>Diary</a>
    <a href="#/journal/week" ${active === 'week' ? 'aria-current="page"' : ''}>Week</a>
    <a href="#/journal/routines" ${active === 'routines' ? 'aria-current="page"' : ''}>Routines</a>
  </nav>`;

function loadInfo(s) {
  const pct = s.capacity ? Math.round((s.minutes / s.capacity) * 100) : 0;
  const label = !s.active.length ? 'Free day' : pct > 100 ? 'Full day' : pct >= 60 ? 'Balanced day' : 'Light day';
  return { pct, label };
}

// ---------- Day ----------

function itemRow({ item, mark }, date) {
  const t = typeOf(item.type);
  const done = !!(mark && mark.status === 'done');
  return `
    <li class="jrow${done ? ' is-done' : ''}">
      <button type="button" class="jcheck" data-action="j-toggle" data-id="${item.id}" data-date="${date}" aria-pressed="${done}" aria-label="${done ? 'Mark not done' : 'Mark done'}: ${esc(item.title)}">${icon(done ? 'circle-check' : 'circle', 26)}</button>
      <button type="button" class="row" data-action="j-open" data-id="${item.id}" data-date="${date}">
        <span class="bubble tone-${t.tone}">${icon(t.icon, 18)}</span>
        <span class="row-main">
          <span class="row-title">${esc(item.title)}</span>
          <span class="row-sub wrap">${item.minutes ? `${minutesLabel(item.minutes)} · ` : ''}${t.name}${item.date ? '' : ` · ${repeatsLabel(item)}`}</span>
        </span>
      </button>
    </li>`;
}

function wordCard(date, isToday) {
  const [w, kind, meaning, question] = wordFor(date);
  return `
    <section class="panel word-card" aria-label="Word for the day">
      <p class="tile-label">Word for ${isToday ? 'today' : 'the day'}</p>
      <p class="word">${w}</p>
      <p class="help"><em>${kind}</em> · ${meaning}</p>
      <p class="word-q">${question}</p>
      <a class="link" href="#/journal/diary">${icon('pen-line', 16)}&nbsp;Write about it in your diary</a>
    </section>`;
}

function renderDay() {
  const s = daySummary(day);
  const { pct, label } = loadInfo(s);
  const e = s.entry;
  const isToday = day === todayISO();
  const skipped = s.items.filter((x) => x.mark && x.mark.status === 'skipped');
  const open = s.active.filter((x) => !x.mark);

  const notices = [];
  if (e && e.energy && e.energy <= 2 && open.length > 1) {
    notices.push(['lavender', 'Low energy today', 'Pick the one thing that matters most and move the rest to another day. Doing one thing still counts.']);
  }
  if (s.minutes > s.capacity && open.length) {
    notices.push(['peach', 'This is a full day', `${minutesLabel(s.minutes)} planned, more than the ${minutesLabel(s.capacity)} that feels comfortable. Moving one thing to another day would help.`]);
  }
  if (s.active.length && !open.length) {
    notices.push(['sage', isToday ? 'Everything is done for today' : 'Everything was done', 'Rest is part of the plan too.']);
  }

  const sections = PARTS.map((p) => {
    const list = s.active.filter((x) => x.item.part === p.id);
    if (!list.length) return '';
    return `
      <section class="jpart" aria-labelledby="h-${p.id}">
        <h3 id="h-${p.id}" class="day">${icon(p.icon, 16)} ${p.name}</h3>
        <ul class="rows">${list.map((x) => itemRow(x, day)).join('')}</ul>
      </section>`;
  }).join('');

  return `
    <header class="page-head page-head-row">
      <h1>Journal</h1>
      ${journalNav('today')}
    </header>

    <div class="month-row">
      <div class="month" role="group" aria-label="Day">
        <button type="button" class="icon-btn" data-action="jday-prev" aria-label="Previous day">${icon('chevron-left', 20)}</button>
        <span class="month-label" aria-live="polite">${relDay(day)}</span>
        <button type="button" class="icon-btn" data-action="jday-next" aria-label="Next day">${icon('chevron-right', 20)}</button>
      </div>
      ${isToday ? '' : '<button type="button" class="btn btn-quiet" data-action="jday-today">Today</button>'}
    </div>

    <section class="bento bento-3" aria-label="${esc(niceDate(day))}">
      <button type="button" class="tile tone-lavender span-2-sm tile-checkin" data-action="j-checkin">
        <span class="tile-icon">${icon('smile', 22)}</span>
        ${e && (e.energy || e.mood || e.note) ? `
          <span class="tile-label">${isToday ? "Today's vibe" : 'How you felt'}</span>
          <span class="vibe">${esc(e.mood || (e.energy ? ENERGY[e.energy] : 'Checked in'))}</span>
          <span class="tile-line">${[e.mood && e.energy ? `Energy: ${ENERGY[e.energy]}` : '', e.note ? esc(e.note.length > 80 ? e.note.slice(0, 80) + '…' : e.note) : ''].filter(Boolean).join(' · ') || 'Tap to add a note'}</span>` : `
          <span class="tile-label">${isToday ? 'Check in' : 'No check-in'}</span>
          <span class="figure figure-sm">How are you${isToday ? ' today' : ''}?</span>
          <span class="tile-line">Energy, mood and a few words. Only you can see this.</span>`}
      </button>
      <div class="tile tone-butter">
        <span class="tile-label">${label}</span>
        <span class="figure figure-sm">${minutesLabel(s.minutes)}</span>
        <span class="meter" role="img" aria-label="${pct}% of a comfortable day"><span style="width:${Math.min(100, pct)}%"></span></span>
        <button type="button" class="tile-link" data-action="j-capacity">of ${minutesLabel(s.capacity)} that feel comfortable</button>
      </div>
      <div class="tile tone-pink">
        <span class="tile-label">Done</span>
        <span class="figure figure-sm">${s.done.length} of ${s.active.length}</span>
        <span class="tile-line">${open.length ? `${minutesLabel(s.left)} left` : s.active.length ? 'All done' : 'Nothing planned'}</span>
      </div>
    </section>

    ${wordCard(day, isToday)}

    ${notices.map(([tone, title, text]) => `
      <div class="panel tone-panel tone-${tone} notice" role="status">
        <h2>${title}</h2>
        <p class="tile-line">${text}</p>
      </div>`).join('')}

    <section class="panel" aria-labelledby="h-plan">
      <div class="panel-row">
        <h2 id="h-plan">${isToday ? 'Today' : esc(dayName(day))} <small>${esc(niceDate(day))}</small></h2>
        <button type="button" class="btn btn-quiet" data-action="j-add">${icon('plus', 16)} Add</button>
      </div>
      ${sections || `<p class="empty">Nothing planned${isToday ? ' for today' : ''}. Add a task, or set up routines so the week fills itself.</p>`}
      ${skipped.length ? `
        <details class="skipped">
          <summary>Skipped or moved (${skipped.length})</summary>
          <ul class="rows">
            ${skipped.map(({ item, mark }) => `
              <li class="skip-row">
                <span class="row-title">${esc(item.title)}</span>
                <button type="button" class="link" data-action="j-unskip" data-id="${mark.id}">Bring back</button>
              </li>`).join('')}
          </ul>
        </details>` : ''}
    </section>`;
}

// ---------- Week ----------

function renderWeek() {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const sums = days.map((d) => ({ d, s: daySummary(d) }));
  const today = todayISO();
  const total = sums.reduce((n, x) => n + x.s.minutes, 0);
  const busiest = [...sums].sort((a, b) => b.s.minutes - a.s.minutes)[0];
  const full = sums.filter((x) => x.s.minutes > x.s.capacity);
  const takeaway = !total ? 'Nothing planned this week yet.'
    : full.length ? `${full.map((x) => dayName(x.d)).join(' and ')} ${full.length === 1 ? 'is' : 'are'} over your comfortable amount. Moving something to a lighter day would help.`
    : `${minutesLabel(total)} planned. The busiest day is ${dayName(busiest.d)} with ${minutesLabel(busiest.s.minutes)}, and no day is over your comfortable amount.`;
  const isThisWeek = weekStart === mondayOf(today);
  const range = `${fromISO(days[0]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} to ${fromISO(days[6]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;

  return `
    <header class="page-head page-head-row">
      <h1>Journal</h1>
      ${journalNav('week')}
    </header>

    <div class="month-row">
      <div class="month" role="group" aria-label="Week">
        <button type="button" class="icon-btn" data-action="jweek-prev" aria-label="Previous week">${icon('chevron-left', 20)}</button>
        <span class="month-label" aria-live="polite">${isThisWeek ? 'This week' : range}</span>
        <button type="button" class="icon-btn" data-action="jweek-next" aria-label="Next week">${icon('chevron-right', 20)}</button>
      </div>
      ${isThisWeek ? '' : '<button type="button" class="btn btn-quiet" data-action="jweek-this">This week</button>'}
    </div>

    <p class="takeaway">${takeaway}</p>

    <ul class="week-grid">
      ${sums.map(({ d, s }) => {
        const { pct, label } = loadInfo(s);
        const e = s.entry;
        return `
          <li>
            <button type="button" class="tile week-day${d === today ? ' is-today' : ''}${s.minutes > s.capacity ? ' is-full' : ''}" data-action="go-day" data-date="${d}">
              <span class="week-head"><b>${esc(shortDay(d))}</b>${d === today ? '<span class="pill">Today</span>' : ''}</span>
              <span class="meter" role="img" aria-label="${label}, ${pct}% of a comfortable day"><span style="width:${Math.min(100, pct)}%"></span></span>
              <span class="tile-line">${s.active.length ? `${label} · ${minutesLabel(s.minutes)} · ${s.done.length} of ${s.active.length} done` : 'Free'}</span>
              ${s.active.length ? `<span class="week-items">${s.active.slice(0, 4).map((x) => `<span>${x.mark && x.mark.status === 'done' ? '✓ ' : ''}${esc(x.item.title)}</span>`).join('')}${s.active.length > 4 ? `<span>and ${s.active.length - 4} more</span>` : ''}</span>` : ''}
              ${e && e.energy ? `<span class="tile-line">Energy: ${ENERGY[e.energy]}${e.mood ? ` · ${esc(e.mood)}` : ''}</span>` : ''}
            </button>
          </li>`;
      }).join('')}
    </ul>`;
}

// ---------- Routines ----------

function renderRoutines() {
  const routines = state.journalItems.filter((i) => !i.date).sort((a, b) => a.title.localeCompare(b.title));
  const upcoming = state.journalItems.filter((i) => i.date && i.date >= todayISO()).sort((a, b) => a.date.localeCompare(b.date));
  const weekly = routines.reduce((n, i) => n + i.minutes * i.days.length, 0);
  const row = (i) => {
    const t = typeOf(i.type);
    return `
      <li>
        <button type="button" class="row" data-action="j-edit" data-id="${i.id}">
          <span class="bubble tone-${t.tone}">${icon(t.icon, 18)}</span>
          <span class="row-main">
            <span class="row-title">${esc(i.title)}</span>
            <span class="row-sub wrap">${i.date ? esc(relDay(i.date)) : repeatsLabel(i)} · ${PARTS.find((p) => p.id === i.part).name.toLowerCase()}${i.minutes ? ` · ${minutesLabel(i.minutes)}` : ''}</span>
          </span>
        </button>
      </li>`;
  };

  return `
    <header class="page-head page-head-row">
      <h1>Journal</h1>
      ${journalNav('routines')}
    </header>

    <a class="tile tone-pink tile-subs" href="#/workouts">
      <span class="tile-icon">${icon('dumbbell', 22)}</span>
      <span class="tile-subs-main"><span class="tile-label">Workouts</span><span class="tile-line">Build workouts with exercises, then add them to your week from there.</span></span>
      <span class="tile-subs-go">${icon('chevron-right', 20)}</span>
    </a>

    <section aria-labelledby="h-routines">
      <div class="section-row">
        <h2 class="section-title" id="h-routines">Routines</h2>
        <button type="button" class="btn btn-quiet" data-action="j-add-routine">${icon('plus', 16)} Add</button>
      </div>
      <div class="panel">
        ${routines.length ? `
          <p class="help">They repeat on their days. Together they take about ${minutesLabel(weekly)} a week.</p>
          <ul class="rows">${routines.map(row).join('')}</ul>` : `
          <p class="empty">Routines are the things you do every week: cleaning, the market run, workouts. Add them once and each day shows what is due. Tap an idea to start from it:</p>
          <div class="chips">
            ${TEMPLATES.map((t, n) => `<button type="button" class="chip-btn" data-action="j-template" data-n="${n}">${esc(t.title)}</button>`).join('')}
          </div>`}
      </div>
    </section>

    <section aria-labelledby="h-upcoming">
      <h2 class="section-title" id="h-upcoming">Coming up</h2>
      <div class="panel">
        ${upcoming.length ? `<ul class="rows">${upcoming.map(row).join('')}</ul>` : '<p class="empty">One-off tasks for today and later show here.</p>'}
      </div>
    </section>`;
}

export function render(param) {
  if (param === 'diary') return diary.render();
  if (param === 'week') return renderWeek();
  if (param === 'routines') return renderRoutines();
  return renderDay();
}
export const title = (param) => (param === 'diary' ? 'Diary' : param === 'week' ? 'Week' : param === 'routines' ? 'Routines' : 'Journal');
export function mount(root, param) { if (param === 'diary') diary.mount(root); }
export const openGoals = () => diary.openGoals();

// ---------- Actions ----------

export async function toggleDone(id, date) {
  const mark = markFor(id, date);
  try {
    if (mark && mark.status === 'done') await removeJournalMark(mark.id);
    else await saveJournalMark({ id: mark ? mark.id : newId(), itemId: id, date, status: 'done' });
  } catch { saveFailed(); }
}

export async function unskip(markId) {
  try { await removeJournalMark(markId); } catch { saveFailed(); }
}

async function skip(item, date) {
  const mark = markFor(item.id, date);
  const m = { id: mark ? mark.id : newId(), itemId: item.id, date, status: 'skipped' };
  await saveJournalMark(m);
  return m;
}

// Move to the next day. A routine keeps its pattern: today's one is skipped and a
// one-off copy is added for tomorrow. A one-off task simply changes date.
async function moveOn(item, date) {
  const next = addDays(date, 1);
  if (item.date) {
    const before = { ...item };
    const mark = markFor(item.id, date);
    if (mark) await removeJournalMark(mark.id);
    await saveJournalItem({ ...item, date: next });
    toast(`Moved to ${relDay(next).toLowerCase()}`, { label: 'Undo', run: () => saveJournalItem(before).catch(saveFailed) });
  } else {
    const m = await skip(item, date);
    const copy = { id: newId(), title: item.title, type: item.type, days: [], date: next, part: item.part, minutes: item.minutes, createdAt: new Date().toISOString() };
    await saveJournalItem(copy);
    toast(`Moved to ${relDay(next).toLowerCase()}`, { label: 'Undo', run: () => removeJournalItem(copy.id).then(() => removeJournalMark(m.id)).catch(saveFailed) });
  }
}

export function openItemActions(id, date) {
  const item = state.journalItems.find((i) => i.id === id);
  if (!item) return;
  const t = typeOf(item.type);
  const mark = markFor(id, date);
  const done = !!(mark && mark.status === 'done');
  const next = addDays(date, 1);

  const el = openSheet(`
    <div class="form">
      ${head(esc(item.title))}
      <p class="help">${t.name}${item.minutes ? ` · ${minutesLabel(item.minutes)}` : ''} · ${PARTS.find((p) => p.id === item.part).name.toLowerCase()} · ${item.date ? 'once' : repeatsLabel(item)}</p>
      <div class="action-list">
        <button type="button" class="btn btn-primary" data-do="done">${icon(done ? 'circle' : 'circle-check', 18)} ${done ? 'Mark not done' : 'Mark done'}</button>
        <button type="button" class="btn btn-quiet" data-do="move">${icon('arrow-right', 18)} Move to ${esc(relDay(next).toLowerCase() === 'tomorrow' ? 'tomorrow' : dayName(next))}</button>
        <button type="button" class="btn btn-quiet" data-do="skip">Skip ${date === todayISO() ? 'today' : 'this day'}</button>
        ${item.workoutId && state.workouts.some((w) => w.id === item.workoutId) ? `<a class="btn btn-quiet" href="#/workouts/${item.workoutId}" data-do="open">${icon('dumbbell', 18)} Open workout</a>` : ''}
        <button type="button" class="btn btn-quiet" data-do="edit">${icon('pencil', 18)} Edit ${item.date ? 'task' : 'routine'}</button>
      </div>
    </div>`);

  el.querySelector('.action-list').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-do]');
    if (!b) return;
    if (b.dataset.do === 'edit') { openItemSheet(id); return; }
    if (b.dataset.do === 'open') { closeSheet(); return; }
    closeSheet();
    try {
      if (b.dataset.do === 'done') await toggleDone(id, date);
      if (b.dataset.do === 'move') await moveOn(item, date);
      if (b.dataset.do === 'skip') {
        const m = await skip(item, date);
        toast('Skipped', { label: 'Undo', run: () => removeJournalMark(m.id).catch(saveFailed) });
      }
    } catch { saveFailed(); }
  });
}

// ---------- Add / edit ----------

export function openItemSheet(id, preset = {}) {
  const existing = id ? state.journalItems.find((i) => i.id === id) : null;
  const it = existing || { id: newId(), title: '', type: 'cleaning', days: [], date: day < todayISO() ? todayISO() : day, part: 'anytime', minutes: 30, createdAt: new Date().toISOString(), ...preset };
  const weekly = !it.date;

  const el = openSheet(`
    <form class="form" novalidate>
      ${head(existing ? (weekly ? 'Edit routine' : 'Edit task') : 'Add to journal')}

      <div class="field">
        <label for="j-title">What</label>
        <input id="j-title" name="title" class="input" maxlength="60" autocomplete="off" placeholder="For example: Clean the bathroom" value="${esc(it.title)}" ${existing ? '' : 'autofocus'}>
        <p class="error" data-error="title" hidden></p>
      </div>

      <fieldset class="field">
        <legend>Type</legend>
        <div class="chips">
          ${TYPES.map((t) => `<label class="chip tone-${t.tone}"><input type="radio" name="type" value="${t.id}" ${t.id === it.type ? 'checked' : ''}><span>${icon(t.icon, 16)} ${t.name}</span></label>`).join('')}
        </div>
      </fieldset>

      <fieldset class="segmented">
        <legend class="visually-hidden">How often</legend>
        <label><input type="radio" name="repeat" value="once" ${weekly ? '' : 'checked'}><span>Just once</span></label>
        <label><input type="radio" name="repeat" value="weekly" ${weekly ? 'checked' : ''}><span>Every week</span></label>
      </fieldset>

      <div class="field" data-once ${weekly ? 'hidden' : ''}>
        <label for="j-date">Day</label>
        <input id="j-date" name="date" type="date" class="input" value="${it.date || day}">
        <p class="error" data-error="date" hidden></p>
      </div>

      <fieldset class="field" data-weekly ${weekly ? '' : 'hidden'}>
        <legend>On these days</legend>
        <div class="weekdays">
          ${WEEKDAYS.map((w, n) => `<label class="day-pill"><input type="checkbox" name="days" value="${n + 1}" ${it.days.includes(n + 1) ? 'checked' : ''}><span aria-hidden="true">${w.slice(0, 2)}</span><span class="visually-hidden">${w}</span></label>`).join('')}
        </div>
        <p class="error" data-error="days" hidden></p>
      </fieldset>

      <fieldset class="field">
        <legend>Part of the day</legend>
        <div class="segmented segmented-4">
          ${PARTS.map((p) => `<label><input type="radio" name="part" value="${p.id}" ${p.id === it.part ? 'checked' : ''}><span>${p.name}</span></label>`).join('')}
        </div>
      </fieldset>

      <div class="field">
        <label for="j-min">About how long, in minutes</label>
        <input id="j-min" name="minutes" class="input" inputmode="numeric" autocomplete="off" value="${it.minutes || ''}" placeholder="30" aria-describedby="j-min-help">
        <div class="chips">${[10, 20, 30, 45, 60, 90].map((m) => `<button type="button" class="chip-btn" data-min="${m}">${minutesLabel(m)}</button>`).join('')}</div>
        <p class="help" id="j-min-help">Used to see when a day is getting too full.</p>
        <p class="error" data-error="minutes" hidden></p>
      </div>

      <div class="sheet-actions">
        ${existing ? `<button type="button" class="btn btn-quiet btn-danger" data-delete>${icon('trash-2', 16)} Delete</button>` : '<span></span>'}
        <button type="submit" class="btn btn-primary">${existing ? 'Save changes' : 'Add'}</button>
      </div>
    </form>`);

  const form = el.querySelector('form');
  form.addEventListener('change', (e) => {
    if (e.target.name !== 'repeat') return;
    const w = e.target.value === 'weekly';
    form.querySelector('[data-once]').hidden = w;
    form.querySelector('[data-weekly]').hidden = !w;
  });
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-min]');
    if (b) form.elements.minutes.value = b.dataset.min;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const titleText = String(data.get('title')).trim();
    const isWeekly = data.get('repeat') === 'weekly';
    const days = data.getAll('days').map(Number);
    const date = data.get('date');
    const minText = String(data.get('minutes')).trim();
    const minutes = minText === '' ? 0 : Number(minText);

    showError(form, 'minutes', Number.isInteger(minutes) && minutes >= 0 && minutes <= 600 ? '' : 'Type whole minutes, for example 20');
    showError(form, 'days', isWeekly && !days.length ? 'Pick at least one day.' : '');
    showError(form, 'date', !isWeekly && !date ? 'Pick the day.' : '');
    showError(form, 'title', titleText ? '' : 'Say what it is, for example "Laundry".');
    if (!titleText || (isWeekly && !days.length) || (!isWeekly && !date) || !(Number.isInteger(minutes) && minutes >= 0 && minutes <= 600)) return;

    const next = { ...it, title: titleText, type: data.get('type'), part: data.get('part'), minutes, days: isWeekly ? days : [], date: isWeekly ? null : date };
    closeSheet();
    try {
      await saveJournalItem(next);
      toast(existing ? 'Changes saved' : isWeekly ? 'Routine added' : `Added to ${relDay(date).toLowerCase() === 'today' ? 'today' : relDay(date)}`);
    } catch { saveFailed(); }
  });

  form.querySelector('[data-delete]')?.addEventListener('click', async () => {
    const marks = state.journalMarks.filter((m) => m.itemId === it.id);
    closeSheet();
    try {
      await removeJournalItem(it.id);
      toast(`${it.title} deleted`, {
        label: 'Undo',
        run: async () => {
          try { await saveJournalItem(it); for (const m of marks) await saveJournalMark(m); } catch { saveFailed(); }
        },
      });
    } catch { saveFailed(); }
  });
}

export function openTemplate(n) {
  const t = TEMPLATES[Number(n)];
  if (t) openItemSheet(null, { ...t, date: null });
}

// ---------- Check-in ----------

export function openCheckIn() {
  const e = dayEntry(day) || { date: day, energy: 0, mood: '', note: '' };
  const isToday = day === todayISO();
  const el = openSheet(`
    <form class="form" novalidate>
      ${head(isToday ? 'How are you today?' : `How was ${esc(dayName(day))}?`)}

      <fieldset class="field">
        <legend>Energy</legend>
        <div class="segmented segmented-5">
          ${ENERGY.slice(1).map((name, n) => `<label><input type="radio" name="energy" value="${n + 1}" ${e.energy === n + 1 ? 'checked' : ''}><span>${name}</span></label>`).join('')}
        </div>
      </fieldset>

      <fieldset class="field">
        <legend>Mood <span class="optional">optional</span></legend>
        <div class="chips">
          ${MOODS.map((m) => `<label class="chip"><input type="radio" name="mood" value="${m}" ${e.mood === m ? 'checked' : ''}><span>${m}</span></label>`).join('')}
        </div>
      </fieldset>

      <div class="field">
        <label for="j-note">On your mind <span class="optional">optional</span></label>
        <textarea id="j-note" name="note" class="input textarea" maxlength="1000" rows="4" placeholder="What would make today feel good? What is weighing on you?">${esc(e.note)}</textarea>
        <p class="help">Only you can see this.</p>
      </div>

      <div class="sheet-actions">
        <span></span>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>`);

  const form = el.querySelector('form');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const data = new FormData(form);
    closeSheet();
    try {
      await saveJournalDay({ date: day, energy: Number(data.get('energy')) || 0, mood: data.get('mood') || '', note: String(data.get('note')).trim() });
      toast('Check-in saved');
    } catch { saveFailed(); }
  });
}

export function openCapacity() {
  const el = openSheet(`
    <form class="form" novalidate>
      ${head('A comfortable day')}
      <div class="field">
        <label for="j-cap">Minutes of chores and plans that feel manageable on top of work</label>
        <input id="j-cap" name="capacity" class="input" inputmode="numeric" autocomplete="off" value="${state.journalSettings.capacity}" autofocus>
        <div class="chips">${[60, 90, 120, 180].map((m) => `<button type="button" class="chip-btn" data-min="${m}">${minutesLabel(m)}</button>`).join('')}</div>
        <p class="help">When a day holds more than this, the journal says so and suggests moving something.</p>
        <p class="error" data-error="capacity" hidden></p>
      </div>
      <div class="sheet-actions"><span></span><button type="submit" class="btn btn-primary">Save</button></div>
    </form>`);
  const form = el.querySelector('form');
  form.addEventListener('click', (e) => { const b = e.target.closest('[data-min]'); if (b) form.elements.capacity.value = b.dataset.min; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const capacity = Number(String(form.elements.capacity.value).trim());
    const ok = Number.isInteger(capacity) && capacity >= 10 && capacity <= 1440;
    showError(form, 'capacity', ok ? '' : 'Type whole minutes between 10 and 1440, for example 120');
    if (!ok) return;
    closeSheet();
    try { await saveJournalSettings({ ...state.journalSettings, capacity }); toast('Saved'); } catch { saveFailed(); }
  });
}

// ---------- Home tile ----------

export function homeTile() {
  const t = todayISO();
  const s = daySummary(t);
  const next = s.active.filter((x) => !x.mark).sort((a, b) => PARTS.findIndex((p) => p.id === a.item.part) - PARTS.findIndex((p) => p.id === b.item.part))[0];
  const { label } = loadInfo(s);
  return `
    <a class="tile tone-sky span-2 tile-journal" href="#/journal">
      <span class="tile-icon">${icon('notebook-pen', 22)}</span>
      <span class="tile-label">Today · ${label.toLowerCase()}</span>
      <span class="figure figure-sm">${s.active.length ? `${s.done.length} of ${s.active.length} done` : 'Nothing planned'}</span>
      <span class="tile-line">${next ? `Next: ${esc(next.item.title)}` : s.active.length ? 'All done. Rest is part of the plan.' : 'Add routines in your journal'}${s.entry && s.entry.energy ? '' : ' · Tap to check in'}</span>
    </a>`;
}
