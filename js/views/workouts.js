// Workouts: named workouts with exercises (photo, sets, reps or time, body area),
// planned into the Journal week, and a simple "start workout" view with set ticks.
import { state, TONES, newId, saveWorkout, removeWorkout, saveExercise, removeExercise,
  saveJournalItem, removeJournalItem, saveJournalMark, removeJournalMark, markFor, itemsOn, weekday,
  dayEntry, patchJournalDay, persistJournalDay } from '../store.js?v=202611231551';
import { icon } from '../icons.js?v=202611231551';
import { esc, iso, todayISO, fromISO, openSheet, closeSheet, toast, saveFailed } from '../ui.js?v=202611231551';
import { head, showError } from './sheets.js?v=202611231551';

const AREAS = ['Legs', 'Glutes', 'Arms', 'Back', 'Chest', 'Shoulders', 'Core', 'Full body', 'Cardio', 'Stretch'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PARTS = [['morning', 'Morning'], ['afternoon', 'Afternoon'], ['evening', 'Evening'], ['anytime', 'Anytime']];

// Ideas for an empty page; tapping one fills in the form.
const TEMPLATES = [
  { name: 'Just Dance', minutes: 60, tone: 'pink', note: 'Pick songs you love.' },
  { name: 'Walk outside', minutes: 30, tone: 'sage', note: 'A steady pace you can still talk at.' },
  { name: 'Home strength', minutes: 30, tone: 'butter', note: 'Squats, glute bridges, wall push-ups, plank.' },
  { name: 'Stretch and unwind', minutes: 15, tone: 'lavender', note: 'Slow, before bed.' },
];

const minutesLabel = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);
const secondsLabel = (s) => (s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}` : `${s} s`);
const dose = (e) => `${e.sets} × ${e.seconds ? secondsLabel(e.seconds) : `${e.reps} reps`}`;
const exercisesOf = (id) => state.exercises.filter((e) => e.workoutId === id).sort((a, b) => a.sort - b.sort);
const workoutById = (id) => state.workouts.find((w) => w.id === id);
const routineOf = (id) => state.journalItems.find((i) => i.workoutId === id && !i.date);
const daysLabel = (days) => {
  const d = [...days].sort();
  if (d.length === 7) return 'Every day';
  if (d.join() === '1,2,3,4,5') return 'Weekdays';
  if (d.join() === '6,7') return 'Weekends';
  return d.map((n) => WEEKDAYS[n - 1]).join(', ');
};
const addDays = (date, n) => { const d = fromISO(date); d.setDate(d.getDate() + n); return iso(d); };
const mondayOf = (date) => addDays(date, -(weekday(date) - 1));

function photo(e, cls = '') {
  return e.image
    ? `<img class="ex-img ${cls}" src="${esc(e.image)}" alt="">`
    : `<span class="ex-img ex-placeholder ${cls}" aria-hidden="true">${icon('dumbbell', 28)}</span>`;
}

// This week's planned workouts from the Journal, and how many are done.
function weekStats() {
  const start = mondayOf(todayISO());
  let planned = 0, done = 0, minutes = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    itemsOn(d).filter((it) => it.type === 'workout').forEach((it) => {
      const m = markFor(it.id, d);
      if (m && m.status === 'skipped') return;
      planned++;
      if (m && m.status === 'done') { done++; minutes += it.minutes || 0; }
    });
  }
  return { planned, done, minutes };
}

// ---------- List ----------

function workoutCard(w) {
  const r = routineOf(w.id);
  const n = exercisesOf(w.id).length;
  return `
    <li class="wcard tone-${w.tone}">
      <a class="wcard-main" href="#/workouts/${w.id}">
        <span class="wcard-name">${esc(w.name)}</span>
        <span class="tile-line">${minutesLabel(w.minutes)}${n ? ` · ${n} ${n === 1 ? 'exercise' : 'exercises'}` : ''}</span>
        <span class="tile-line">${r ? `${icon('calendar-check', 14)} ${daysLabel(r.days)} · ${PARTS.find((p) => p[0] === r.part)[1].toLowerCase()}` : 'Not in your week yet'}</span>
      </a>
      <a class="btn btn-on-tone" href="#/workouts/${w.id}/go">${icon('arrow-right', 16)} Start</a>
    </li>`;
}

function renderList() {
  const list = [...state.workouts].sort((a, b) => a.sort - b.sort || (a.createdAt < b.createdAt ? -1 : 1));
  const s = weekStats();
  const today = itemsOn(todayISO()).filter((it) => it.type === 'workout');
  return `
    <header class="page-head page-head-row"><h1>Workouts</h1><button type="button" class="btn btn-quiet" data-action="wo-add">${icon('plus', 16)} New workout</button></header>

    <section class="bento bento-3" aria-label="This week">
      <div class="tile tone-pink span-2-sm">
        <span class="tile-icon">${icon('dumbbell', 22)}</span>
        <span class="tile-label">This week</span>
        <span class="figure">${s.done} <small>of ${s.planned} done</small></span>
        <span class="tile-line">${s.minutes ? `${minutesLabel(s.minutes)} of movement so far` : s.planned ? 'Every one you do counts' : 'Add a workout to your week to see it here'}</span>
      </div>
      <div class="tile tone-butter">
        <span class="tile-label">Today</span>
        <span class="figure figure-sm">${today.length ? esc(today[0].title) : 'Rest day'}</span>
        <span class="tile-line">${today.length ? `${minutesLabel(today[0].minutes)}${today.length > 1 ? ` and ${today.length - 1} more` : ''}` : 'Rest is part of it'}</span>
      </div>
      <div class="tile tone-sky">
        <span class="tile-label">Workouts</span>
        <span class="figure figure-sm">${list.length}</span>
        <span class="tile-line">${state.exercises.length} ${state.exercises.length === 1 ? 'exercise' : 'exercises'} in total</span>
      </div>
    </section>

    ${list.length ? `<ul class="wgrid">${list.map(workoutCard).join('')}</ul>` : `
      <div class="panel">
        <p class="empty">A workout is a name, how long it takes and, if you like, its exercises with photos, sets and reps. Start from an idea:</p>
        <div class="chips">${TEMPLATES.map((t, n) => `<button type="button" class="chip-btn" data-action="wo-template" data-n="${n}">${esc(t.name)} <small>${minutesLabel(t.minutes)}</small></button>`).join('')}</div>
      </div>`}`;
}

// ---------- One workout ----------

function exerciseCard(e) {
  return `
    <li>
      <button type="button" class="ex-card" data-action="ex-edit" data-id="${e.id}">
        ${photo(e)}
        <span class="ex-body">
          <span class="ex-name">${esc(e.name)}</span>
          <span class="ex-dose">${dose(e)}</span>
          ${e.area ? `<span class="pill pill-plain">${esc(e.area)}</span>` : ''}
          ${e.note ? `<span class="help">${esc(e.note)}</span>` : ''}
        </span>
      </button>
    </li>`;
}

function renderWorkout(w) {
  const list = exercisesOf(w.id);
  const r = routineOf(w.id);
  return `
    <a class="back" href="#/workouts">${icon('chevron-left', 18)} All workouts</a>

    <section class="panel tone-panel tone-${w.tone} wo-hero">
      <p class="tile-label">${minutesLabel(w.minutes)}${list.length ? ` · ${list.length} ${list.length === 1 ? 'exercise' : 'exercises'}` : ''}</p>
      <h1 class="word">${esc(w.name)}</h1>
      ${w.note ? `<p class="tile-line">${esc(w.note)}</p>` : ''}
      <p class="tile-line">${r ? `${icon('calendar-check', 14)} In your week: ${daysLabel(r.days)}, ${PARTS.find((p) => p[0] === r.part)[1].toLowerCase()}` : 'Not in your week yet.'}</p>
      <div class="tile-actions">
        <a class="btn btn-on-tone" href="#/workouts/${w.id}/go">${icon('arrow-right', 16)} Start workout</a>
        <button type="button" class="btn btn-ghost" data-action="wo-schedule" data-id="${w.id}">${icon('calendar-days', 16)} ${r ? 'Change days' : 'Add to my week'}</button>
        <button type="button" class="btn btn-ghost" data-action="wo-edit" data-id="${w.id}">${icon('pencil', 16)} Edit</button>
      </div>
    </section>

    <section aria-labelledby="h-ex">
      <div class="section-row">
        <h2 class="section-title" id="h-ex">Exercises</h2>
        <button type="button" class="btn btn-quiet" data-action="ex-add" data-id="${w.id}">${icon('plus', 16)} Add exercise</button>
      </div>
      ${list.length ? `<ul class="ex-grid">${list.map(exerciseCard).join('')}</ul>`
        : `<div class="panel"><p class="empty">${w.minutes >= 30 && !list.length ? 'No exercises needed for something like dancing or a walk. ' : ''}Add exercises with a photo, sets and reps or time, if this workout has them.</p></div>`}
    </section>`;
}

// ---------- Doing it ----------

let session = { id: null, ticks: {} };

function renderGo(w) {
  if (session.id !== w.id) session = { id: w.id, ticks: {} };
  const list = exercisesOf(w.id);
  const total = list.reduce((n, e) => n + e.sets, 0);
  const ticked = Object.values(session.ticks).reduce((n, arr) => n + arr.filter(Boolean).length, 0);
  return `
    <a class="back" href="#/workouts/${w.id}">${icon('chevron-left', 18)} ${esc(w.name)}</a>
    <header class="page-head">
      <p class="eyebrow">${minutesLabel(w.minutes)}</p>
      <h1>${esc(w.name)}</h1>
    </header>
    ${list.length ? `
      <p class="takeaway" id="go-progress">${ticked} of ${total} sets done</p>
      <ul class="go-list">
        ${list.map((e) => `
          <li class="panel go-ex">
            ${photo(e, 'go-img')}
            <div class="go-body">
              <h2>${esc(e.name)}</h2>
              <p class="ex-dose">${dose(e)}${e.area ? ` · ${esc(e.area)}` : ''}</p>
              ${e.note ? `<p class="help">${esc(e.note)}</p>` : ''}
              <div class="set-row" role="group" aria-label="Sets of ${esc(e.name)}">
                ${Array.from({ length: e.sets }, (_, i) => {
                  const on = !!(session.ticks[e.id] || [])[i];
                  return `<button type="button" class="set-btn" data-action="go-set" data-ex="${e.id}" data-i="${i}" aria-pressed="${on}">${on ? icon('check', 16) : ''} Set ${i + 1}</button>`;
                }).join('')}
              </div>
            </div>
          </li>`).join('')}
      </ul>` : `<div class="panel"><p class="empty">Enjoy it. Come back here when you are done and tap Finish.</p></div>`}
    <div class="go-finish">
      <button type="button" class="btn btn-primary" data-action="go-finish" data-id="${w.id}">${icon('circle-check', 18)} Finish workout</button>
      <p class="help">Ticks it off in today's Journal if it is planned, and adds ${minutesLabel(w.minutes)} to today's Movement in your diary.</p>
    </div>`;
}

export function toggleSet(exId, i) {
  const arr = session.ticks[exId] || (session.ticks[exId] = []);
  arr[Number(i)] = !arr[Number(i)];
  const btn = document.querySelector(`[data-action=go-set][data-ex="${exId}"][data-i="${i}"]`);
  if (btn) { btn.setAttribute('aria-pressed', String(arr[Number(i)])); btn.innerHTML = `${arr[Number(i)] ? icon('check', 16) : ''} Set ${Number(i) + 1}`; }
  const list = exercisesOf(session.id);
  const total = list.reduce((n, e) => n + e.sets, 0);
  const ticked = Object.values(session.ticks).reduce((n, a) => n + a.filter(Boolean).length, 0);
  const p = document.getElementById('go-progress');
  if (p) p.textContent = ticked === total ? `All ${total} sets done. Lovely work.` : `${ticked} of ${total} sets done`;
}

export async function finish(id) {
  const w = workoutById(id);
  if (!w) return;
  const today = todayISO();
  const planned = itemsOn(today).filter((it) => it.workoutId === id);
  const madeMarks = [];
  const before = ((dayEntry(today) || {}).trackers || {}).movement || 0;
  try {
    for (const it of planned) {
      const m = markFor(it.id, today);
      if (m && m.status === 'done') continue;
      const mark = { id: m ? m.id : newId(), itemId: it.id, date: today, status: 'done' };
      await saveJournalMark(mark);
      madeMarks.push({ mark, prev: m });
    }
    patchJournalDay(today, { trackers: { movement: before + w.minutes } });
    await persistJournalDay(today);
    session = { id: null, ticks: {} };
    location.hash = '#/workouts';
    toast(`${w.name} done! ${minutesLabel(w.minutes)} added to today's movement.`, {
      label: 'Undo',
      run: async () => {
        try {
          for (const { mark, prev } of madeMarks) { if (prev) await saveJournalMark(prev); else await removeJournalMark(mark.id); }
          patchJournalDay(today, { trackers: { movement: before } });
          await persistJournalDay(today);
        } catch { saveFailed(); }
      },
    });
  } catch { saveFailed(); }
}

// ---------- Router entry ----------

export function render(param) {
  const [id, sub] = (param || '').split('/');
  if (!id) return renderList();
  const w = workoutById(id);
  if (!w) return `<div class="panel"><h2>That workout is not here any more</h2><a class="btn btn-quiet" href="#/workouts">All workouts</a></div>`;
  return sub === 'go' ? renderGo(w) : renderWorkout(w);
}
export const title = (param) => { const w = workoutById((param || '').split('/')[0]); return w ? w.name : 'Workouts'; };

// ---------- Workout form ----------

export function openWorkoutSheet(id, preset = {}) {
  const existing = id ? workoutById(id) : null;
  const w = existing || { id: newId(), name: '', minutes: 30, tone: 'pink', note: '', sort: state.workouts.length, createdAt: new Date().toISOString(), ...preset };
  const el = openSheet(`
    <form class="form" novalidate>
      ${head(existing ? 'Edit workout' : 'New workout')}
      <div class="field">
        <label for="wo-name">Name</label>
        <input id="wo-name" name="name" class="input" maxlength="50" autocomplete="off" placeholder="For example: Legs and glutes" value="${esc(w.name)}" ${existing ? '' : 'autofocus'}>
        <p class="error" data-error="name" hidden></p>
      </div>
      <div class="field">
        <label for="wo-min">How long, in minutes</label>
        <input id="wo-min" name="minutes" class="input" inputmode="numeric" autocomplete="off" value="${w.minutes}">
        <div class="chips">${[15, 20, 30, 45, 60, 90].map((m) => `<button type="button" class="chip-btn" data-min="${m}">${minutesLabel(m)}</button>`).join('')}</div>
        <p class="error" data-error="minutes" hidden></p>
      </div>
      <fieldset class="field">
        <legend>Colour</legend>
        <div class="swatches">${TONES.map((t) => `<label class="swatch tone-${t}"><input type="radio" name="tone" value="${t}" ${t === w.tone ? 'checked' : ''}><span class="visually-hidden">${t}</span></label>`).join('')}</div>
      </fieldset>
      <div class="field">
        <label for="wo-note">Note <span class="optional">optional</span></label>
        <input id="wo-note" name="note" class="input" maxlength="140" autocomplete="off" placeholder="Music, place, how it should feel" value="${esc(w.note)}">
      </div>
      <div class="sheet-actions">
        ${existing ? `<button type="button" class="btn btn-quiet btn-danger" data-delete>${icon('trash-2', 16)} Delete</button>` : '<span></span>'}
        <button type="submit" class="btn btn-primary">${existing ? 'Save changes' : 'Create workout'}</button>
      </div>
    </form>`);
  const form = el.querySelector('form');
  form.addEventListener('click', (e) => { const b = e.target.closest('[data-min]'); if (b) form.elements.minutes.value = b.dataset.min; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const name = String(data.get('name')).trim();
    const minutes = Number(String(data.get('minutes')).trim());
    const okMin = Number.isInteger(minutes) && minutes >= 1 && minutes <= 600;
    showError(form, 'minutes', okMin ? '' : 'Type whole minutes, for example 60');
    showError(form, 'name', name ? '' : 'Give it a name.');
    if (!name || !okMin) return;
    const next = { ...w, name, minutes, tone: data.get('tone'), note: String(data.get('note')).trim() };
    closeSheet();
    try {
      await saveWorkout(next);
      // Keep the planned routine in the Journal in step with the workout.
      const r = routineOf(next.id);
      if (r && (r.title !== name || r.minutes !== minutes)) await saveJournalItem({ ...r, title: name, minutes });
      if (existing) toast('Changes saved');
      else { toast(`${name} created`); location.hash = `#/workouts/${next.id}`; }
    } catch { saveFailed(); }
  });
  form.querySelector('[data-delete]')?.addEventListener('click', async () => {
    const exs = exercisesOf(w.id);
    const linked = state.journalItems.filter((i) => i.workoutId === w.id);
    closeSheet();
    try {
      await removeWorkout(w.id);
      location.hash = '#/workouts';
      toast(`${w.name} deleted${linked.length ? '. Its days stay in your Journal' : ''}`, {
        label: 'Undo',
        run: async () => {
          try {
            await saveWorkout(w);
            for (const x of exs) await saveExercise(x);
            for (const i of linked) await saveJournalItem(i);
          } catch { saveFailed(); }
        },
      });
    } catch { saveFailed(); }
  });
}

export function openTemplate(n) { const t = TEMPLATES[Number(n)]; if (t) openWorkoutSheet(null, t); }

// ---------- Exercise form ----------

// Shrinks a photo on the device before saving: longest side 480 px, JPEG.
async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 480 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.72);
}

export function openExerciseSheet(id, workoutId) {
  const existing = id ? state.exercises.find((x) => x.id === id) : null;
  const wid = existing ? existing.workoutId : workoutId;
  const e = existing || { id: newId(), workoutId: wid, name: '', image: '', area: '', sets: 3, reps: 12, seconds: 0, note: '', sort: exercisesOf(wid).reduce((n, x) => Math.max(n, x.sort), 0) + 1 };
  let image = e.image;
  const timed = e.seconds > 0;

  const el = openSheet(`
    <form class="form" novalidate>
      ${head(existing ? 'Edit exercise' : 'Add exercise')}

      <div class="field">
        <p class="field-title">Photo <span class="optional">optional</span></p>
        <div class="photo-field">
          <span data-preview>${image ? `<img class="ex-img" src="${esc(image)}" alt="Exercise photo">` : `<span class="ex-img ex-placeholder" aria-hidden="true">${icon('dumbbell', 28)}</span>`}</span>
          <span class="photo-actions">
            <label class="btn btn-quiet file-btn">${icon('plus', 16)} <span data-photo-label>${image ? 'Change photo' : 'Add photo'}</span><input type="file" name="photo" accept="image/*" class="visually-hidden"></label>
            <button type="button" class="btn btn-quiet" data-remove-photo ${image ? '' : 'hidden'}>Remove</button>
          </span>
        </div>
        <p class="help">Saved small, privately, with your workouts.</p>
        <p class="error" data-error="photo" hidden></p>
      </div>

      <div class="field">
        <label for="ex-name">Exercise</label>
        <input id="ex-name" name="name" class="input" maxlength="60" autocomplete="off" placeholder="For example: Glute bridge" value="${esc(e.name)}" ${existing ? '' : 'autofocus'}>
        <p class="error" data-error="name" hidden></p>
      </div>

      <fieldset class="segmented">
        <legend class="visually-hidden">Count by</legend>
        <label><input type="radio" name="mode" value="reps" ${timed ? '' : 'checked'}><span>Reps</span></label>
        <label><input type="radio" name="mode" value="time" ${timed ? 'checked' : ''}><span>Time</span></label>
      </fieldset>

      <div class="field-row three">
        <div class="field">
          <label for="ex-sets">Sets</label>
          <input id="ex-sets" name="sets" class="input" inputmode="numeric" autocomplete="off" value="${e.sets}">
          <p class="error" data-error="sets" hidden></p>
        </div>
        <div class="field" data-reps ${timed ? 'hidden' : ''}>
          <label for="ex-reps">Reps each set</label>
          <input id="ex-reps" name="reps" class="input" inputmode="numeric" autocomplete="off" value="${e.reps || 12}">
          <p class="error" data-error="reps" hidden></p>
        </div>
        <div class="field" data-time ${timed ? '' : 'hidden'}>
          <label for="ex-sec">Seconds each set</label>
          <input id="ex-sec" name="seconds" class="input" inputmode="numeric" autocomplete="off" value="${e.seconds || 30}">
          <p class="error" data-error="seconds" hidden></p>
        </div>
      </div>

      <fieldset class="field">
        <legend>Body area <span class="optional">optional</span></legend>
        <div class="chips">${AREAS.map((a) => `<label class="chip"><input type="radio" name="area" value="${a}" ${e.area === a ? 'checked' : ''}><span>${a}</span></label>`).join('')}</div>
      </fieldset>

      <div class="field">
        <label for="ex-note">Note <span class="optional">optional</span></label>
        <input id="ex-note" name="note" class="input" maxlength="140" autocomplete="off" placeholder="Form tips, weight, what to feel" value="${esc(e.note)}">
      </div>

      <div class="sheet-actions">
        ${existing ? `<button type="button" class="btn btn-quiet btn-danger" data-delete>${icon('trash-2', 16)} Delete</button>` : '<span></span>'}
        <button type="submit" class="btn btn-primary">${existing ? 'Save changes' : 'Add exercise'}</button>
      </div>
    </form>`);

  const form = el.querySelector('form');
  const preview = () => {
    form.querySelector('[data-preview]').innerHTML = image ? `<img class="ex-img" src="${esc(image)}" alt="Exercise photo">` : `<span class="ex-img ex-placeholder" aria-hidden="true">${icon('dumbbell', 28)}</span>`;
    form.querySelector('[data-photo-label]').textContent = image ? 'Change photo' : 'Add photo';
    form.querySelector('[data-remove-photo]').hidden = !image;
  };
  form.elements.photo.addEventListener('change', async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    try { image = await shrink(file); showError(form, 'photo', ''); preview(); } catch { showError(form, 'photo', 'That photo could not be read. Try a JPG or PNG.'); }
  });
  form.querySelector('[data-remove-photo]').addEventListener('click', () => { image = ''; preview(); });
  form.addEventListener('change', (ev) => {
    if (ev.target.name !== 'mode') return;
    const t = ev.target.value === 'time';
    form.querySelector('[data-reps]').hidden = t;
    form.querySelector('[data-time]').hidden = !t;
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const data = new FormData(form);
    const name = String(data.get('name')).trim();
    const isTime = data.get('mode') === 'time';
    const int = (k) => Number(String(data.get(k)).trim());
    const sets = int('sets'), reps = int('reps'), seconds = int('seconds');
    const okSets = Number.isInteger(sets) && sets >= 1 && sets <= 20;
    const okReps = isTime || (Number.isInteger(reps) && reps >= 1 && reps <= 500);
    const okSec = !isTime || (Number.isInteger(seconds) && seconds >= 1 && seconds <= 7200);
    showError(form, 'seconds', okSec ? '' : 'Type whole seconds, for example 45');
    showError(form, 'reps', okReps ? '' : 'Type a number, for example 12');
    showError(form, 'sets', okSets ? '' : 'Between 1 and 20');
    showError(form, 'name', name ? '' : 'Name the exercise.');
    if (!name || !okSets || !okReps || !okSec) return;
    const next = { ...e, name, image, sets, reps: isTime ? 0 : reps, seconds: isTime ? seconds : 0, area: data.get('area') || '', note: String(data.get('note')).trim() };
    closeSheet();
    try {
      await saveExercise(next);
      toast(existing ? 'Changes saved' : `${name} added`);
    } catch { toast('That did not save. A very large photo can be the reason; try another one, or check your connection.'); }
  });

  form.querySelector('[data-delete]')?.addEventListener('click', async () => {
    closeSheet();
    try {
      await removeExercise(e.id);
      toast(`${e.name} deleted`, { label: 'Undo', run: () => saveExercise(e).catch(saveFailed) });
    } catch { saveFailed(); }
  });
}

// ---------- Add to my week ----------

export function openScheduleSheet(id) {
  const w = workoutById(id);
  if (!w) return;
  const r = routineOf(id);
  const days = r ? r.days : [];
  const part = r ? r.part : 'anytime';
  const el = openSheet(`
    <form class="form" novalidate>
      ${head(r ? 'Change days' : 'Add to my week')}
      <p class="help">${esc(w.name)} shows in your Journal on these days, ${minutesLabel(w.minutes)} each time.</p>
      <fieldset class="field">
        <legend>On these days</legend>
        <div class="weekdays">
          ${WEEKDAYS.map((d, n) => `<label class="day-pill"><input type="checkbox" name="days" value="${n + 1}" ${days.includes(n + 1) ? 'checked' : ''}><span aria-hidden="true">${d.slice(0, 2)}</span><span class="visually-hidden">${d}</span></label>`).join('')}
        </div>
        <p class="error" data-error="days" hidden></p>
      </fieldset>
      <fieldset class="field">
        <legend>Part of the day</legend>
        <div class="segmented segmented-4">${PARTS.map(([v, n]) => `<label><input type="radio" name="part" value="${v}" ${v === part ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div>
      </fieldset>
      <div class="sheet-actions">
        ${r ? `<button type="button" class="btn btn-quiet btn-danger" data-unplan>Remove from my week</button>` : '<span></span>'}
        <button type="submit" class="btn btn-primary">${r ? 'Save days' : 'Add to my week'}</button>
      </div>
    </form>`);
  const form = el.querySelector('form');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const data = new FormData(form);
    const picked = data.getAll('days').map(Number);
    showError(form, 'days', picked.length ? '' : 'Pick at least one day.');
    if (!picked.length) return;
    const item = r
      ? { ...r, days: picked, part: data.get('part'), title: w.name, minutes: w.minutes }
      : { id: newId(), title: w.name, type: 'workout', days: picked, date: null, part: data.get('part'), minutes: w.minutes, workoutId: w.id, createdAt: new Date().toISOString() };
    closeSheet();
    try { await saveJournalItem(item); toast(`${w.name}: ${daysLabel(picked)}`); } catch { saveFailed(); }
  });
  form.querySelector('[data-unplan]')?.addEventListener('click', async () => {
    const marks = state.journalMarks.filter((m) => m.itemId === r.id);
    closeSheet();
    try {
      await removeJournalItem(r.id);
      toast(`${w.name} removed from your week`, { label: 'Undo', run: async () => { try { await saveJournalItem(r); for (const m of marks) await saveJournalMark(m); } catch { saveFailed(); } } });
    } catch { saveFailed(); }
  });
}

// ---------- Home tile ----------

export function homeTile() {
  const today = itemsOn(todayISO()).filter((it) => it.type === 'workout');
  return `
    <a class="tile tone-pink tile-module" href="#/workouts">
      <span class="tile-icon">${icon('dumbbell', 22)}</span>
      <span class="tile-name">Workouts</span>
      <span class="tile-line">${today.length ? `Today: ${esc(today[0].title)}` : state.workouts.length ? `${state.workouts.length} ${state.workouts.length === 1 ? 'workout' : 'workouts'}` : 'Your routines and exercises'}</span>
    </a>`;
}
