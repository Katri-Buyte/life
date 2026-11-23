// One place for all data. Screens read `state` and call the functions below;
// where the data is kept (this device or the database) is the adapter's job.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js?v=202611231557';

export const state = {
  ready: false,
  mode: 'local',      // 'local' = this device only, 'cloud' = database with login
  user: null,         // { email } when signed in
  categories: [],     // { id, name, kind, color, icon, budget (cents per month), sort }
  transactions: [],   // { id, date 'YYYY-MM-DD', amount (cents), kind, categoryId, note, createdAt }
  vault: { salary: 0, goal: 0, starting: 0 }, // cents: monthly salary, monthly saving goal, savings held before using the app
  vaultEntries: [],   // { id, date, amount (cents, negative = taken out), note, createdAt }
  journalItems: [],   // { id, title, type, days [1-7, Mon = 1] for routines, date 'YYYY-MM-DD' for one-offs, part, minutes, workoutId, createdAt }
  journalMarks: [],   // { id, itemId, date, status 'done'|'skipped' }
  journalDays: [],    // { id (= date), date, energy 1-5 or 0, mood, note, trackers {water, steps, ...}, answers {question key: text} }
  journalSettings: { capacity: 120, goals: {} }, // capacity: minutes that feel like a comfortable day; goals: daily tracker goals
  workouts: [],       // { id, name, minutes, tone, note, sort, createdAt }
  exercises: [],      // { id, workoutId, name, image (small data URL or ''), area, sets, reps, seconds, note, sort }
  wishlist: [],       // { id, name, url, price (cents or 0), priority 'need'|'want'|'someday', note, boughtOn 'YYYY-MM-DD' or '', transactionId, createdAt }
  subscriptions: [],  // { id, kind 'subscription'|'bill', name, amount (cents; an estimate when variable), variable, cycle 'monthly'|'yearly', every (months, for monthly), day 1-31, month 1-12, categoryId, handled 'YYYY-MM', createdAt }
};

export const TONES = ['butter', 'pink', 'sage', 'sky', 'lavender', 'peach'];

const DEFAULT_CATEGORIES = [
  ['Groceries', 'expense', 'sage', 'shopping-basket'],
  ['Eating out', 'expense', 'peach', 'utensils'],
  ['Home & bills', 'expense', 'butter', 'zap'],
  ['Transport', 'expense', 'sky', 'bus'],
  ['Health', 'expense', 'pink', 'heart-pulse'],
  ['Fun & games', 'expense', 'lavender', 'gamepad-2'],
  ['Shopping', 'expense', 'pink', 'shopping-bag'],
  ['Travel', 'expense', 'sky', 'plane'],
  ['Other', 'expense', 'butter', 'ellipsis'],
  ['Salary', 'income', 'sage', 'banknote'],
  ['Other income', 'income', 'lavender', 'coins'],
];

let adapter = null;
const listeners = new Set();

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((fn) => fn()); }

export const newId = () => crypto.randomUUID();

export async function init() {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    state.mode = 'cloud';
    const { create } = await import('./adapters/supabase.js?v=202611231557');
    adapter = await create(SUPABASE_URL, SUPABASE_ANON_KEY);
    state.user = await adapter.user();
    if (!state.user) { state.ready = true; emit(); return; }
  } else {
    const { create } = await import('./adapters/local.js?v=202611231557');
    adapter = create();
  }
  await reload();
}

async function reload() {
  const data = await adapter.load();
  state.categories = data.categories;
  state.transactions = data.transactions;
  state.vault = { salary: 0, goal: 0, starting: 0, ...data.vault };
  state.vaultEntries = data.vaultEntries || [];
  state.subscriptions = data.subscriptions || [];
  state.wishlist = data.wishlist || [];
  state.workouts = data.workouts || [];
  state.exercises = data.exercises || [];
  state.journalItems = data.journalItems || [];
  state.journalMarks = data.journalMarks || [];
  state.journalDays = data.journalDays || [];
  state.journalSettings = { capacity: 120, goals: {}, ...data.journalSettings };
  if (!state.categories.length) {
    state.categories = DEFAULT_CATEGORIES.map(([name, kind, color, icon], sort) => ({ id: newId(), name, kind, color, icon, budget: 0, sort }));
    for (const c of state.categories) await adapter.saveCategory(c);
  }
  state.ready = true;
  emit();
}

export async function signIn(email, password) {
  state.user = await adapter.signIn(email, password);
  await reload();
}

export async function signOut() {
  await adapter.signOut();
  state.user = null;
  state.categories = [];
  state.transactions = [];
  state.vault = { salary: 0, goal: 0, starting: 0 };
  state.vaultEntries = [];
  state.subscriptions = [];
  state.wishlist = [];
  state.workouts = [];
  state.exercises = [];
  state.journalItems = [];
  state.journalMarks = [];
  state.journalDays = [];
  state.journalSettings = { capacity: 120, goals: {} };
  emit();
}

// Change the screen at once, then save. If saving fails, put things back.
async function commit(apply, save) {
  const before = { ...state };
  apply();
  emit();
  try {
    await save();
  } catch (err) {
    Object.assign(state, before);
    emit();
    throw err;
  }
}

const withItem = (list, item) => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]);

export function saveTransaction(t) {
  return commit(() => { state.transactions = withItem(state.transactions, t); }, () => adapter.saveTransaction(t));
}
export function removeTransaction(id) {
  return commit(() => { state.transactions = state.transactions.filter((t) => t.id !== id); }, () => adapter.removeTransaction(id));
}
export function saveCategory(c) {
  return commit(() => { state.categories = withItem(state.categories, c); }, () => adapter.saveCategory(c));
}
export function removeCategory(id) {
  return commit(() => { state.categories = state.categories.filter((c) => c.id !== id); }, () => adapter.removeCategory(id));
}

export function saveVaultSettings(v) {
  return commit(() => { state.vault = v; }, () => adapter.saveVaultSettings(v));
}
export function saveVaultEntry(e) {
  return commit(() => { state.vaultEntries = withItem(state.vaultEntries, e); }, () => adapter.saveVaultEntry(e));
}
export function removeVaultEntry(id) {
  return commit(() => { state.vaultEntries = state.vaultEntries.filter((e) => e.id !== id); }, () => adapter.removeVaultEntry(id));
}

export function saveSubscription(s) {
  return commit(() => { state.subscriptions = withItem(state.subscriptions, s); }, () => adapter.saveSubscription(s));
}
export function removeSubscription(id) {
  return commit(() => { state.subscriptions = state.subscriptions.filter((s) => s.id !== id); }, () => adapter.removeSubscription(id));
}

export function saveWorkout(w) {
  return commit(() => { state.workouts = withItem(state.workouts, w); }, () => adapter.saveWorkout(w));
}
// Deleting a workout deletes its exercises; journal routines linked to it stay, unlinked.
export function removeWorkout(id) {
  return commit(() => {
    state.workouts = state.workouts.filter((w) => w.id !== id);
    state.exercises = state.exercises.filter((e) => e.workoutId !== id);
    state.journalItems = state.journalItems.map((i) => (i.workoutId === id ? { ...i, workoutId: null } : i));
  }, () => adapter.removeWorkout(id));
}
export function saveExercise(e) {
  return commit(() => { state.exercises = withItem(state.exercises, e); }, () => adapter.saveExercise(e));
}
export function removeExercise(id) {
  return commit(() => { state.exercises = state.exercises.filter((e) => e.id !== id); }, () => adapter.removeExercise(id));
}

export function saveWish(w) {
  return commit(() => { state.wishlist = withItem(state.wishlist, w); }, () => adapter.saveWish(w));
}
export function removeWish(id) {
  return commit(() => { state.wishlist = state.wishlist.filter((w) => w.id !== id); }, () => adapter.removeWish(id));
}

export function saveJournalItem(i) {
  return commit(() => { state.journalItems = withItem(state.journalItems, i); }, () => adapter.saveJournalItem(i));
}
export function removeJournalItem(id) {
  return commit(() => {
    state.journalItems = state.journalItems.filter((i) => i.id !== id);
    state.journalMarks = state.journalMarks.filter((m) => m.itemId !== id); // the database removes them too
  }, () => adapter.removeJournalItem(id));
}
export function saveJournalMark(m) {
  return commit(() => { state.journalMarks = withItem(state.journalMarks, m); }, () => adapter.saveJournalMark(m));
}
export function removeJournalMark(id) {
  return commit(() => { state.journalMarks = state.journalMarks.filter((m) => m.id !== id); }, () => adapter.removeJournalMark(id));
}
const blankDay = (date) => ({ id: date, date, energy: 0, mood: '', note: '', trackers: {}, answers: {} });

// Saves part of a day (a check-in, say) without losing the rest of that day's entry.
export function saveJournalDay(d) {
  const prev = state.journalDays.find((x) => x.date === d.date) || blankDay(d.date);
  const day = { ...prev, ...d, id: d.date };
  return commit(() => { state.journalDays = withItem(state.journalDays, day); }, () => adapter.saveJournalDay(day));
}
// The diary saves while you type. This updates the day at once without redrawing
// the screen (that would move the cursor); persistJournalDay then writes it.
export function patchJournalDay(date, patch) {
  const prev = state.journalDays.find((x) => x.date === date) || blankDay(date);
  const next = { ...prev, ...patch, trackers: { ...prev.trackers, ...(patch.trackers || {}) }, answers: { ...prev.answers, ...(patch.answers || {}) } };
  state.journalDays = withItem(state.journalDays, next);
  return next;
}
export function persistJournalDay(date) {
  const d = state.journalDays.find((x) => x.date === date);
  return d ? adapter.saveJournalDay(d) : Promise.resolve();
}

export function saveJournalSettings(s) {
  return commit(() => { state.journalSettings = s; }, () => adapter.saveJournalSettings(s));
}

// ---------- Reading helpers ----------

export const categoryById = (id) => state.categories.find((c) => c.id === id);
export const categoriesOf = (kind) => state.categories.filter((c) => c.kind === kind).sort((a, b) => a.sort - b.sort);
export const sum = (list) => list.reduce((n, t) => n + t.amount, 0);

export function transactionsIn(month) { // month = 'YYYY-MM'
  return state.transactions
    .filter((t) => t.date.startsWith(month))
    .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : (a.date < b.date ? 1 : -1)));
}

export function monthSummary(month) {
  const txns = transactionsIn(month);
  const expenses = txns.filter((t) => t.kind === 'expense');
  const spent = sum(expenses);
  const income = sum(txns.filter((t) => t.kind === 'income'));
  const budget = categoriesOf('expense').reduce((n, c) => n + c.budget, 0);
  const byCategory = categoriesOf('expense').map((c) => ({ category: c, spent: sum(expenses.filter((t) => t.categoryId === c.id)) }));
  return { txns, expenses, spent, income, budget, byCategory };
}

export const vaultBalance = () => state.vault.starting + sum(state.vaultEntries);

export function vaultSummary(month) {
  const entries = [...state.vaultEntries].sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : (a.date < b.date ? 1 : -1)));
  const saved = sum(entries.filter((e) => e.date.startsWith(month)));
  const { goal, salary } = state.vault;
  return { entries, saved, goal, salary, balance: vaultBalance(), toGo: Math.max(0, goal - saved), reached: goal > 0 && saved >= goal };
}

// Every month with any income, spending or savings, newest first, plus the current month.
export function monthHistory(current) {
  const months = new Set([current]);
  state.transactions.forEach((t) => months.add(t.date.slice(0, 7)));
  state.vaultEntries.forEach((e) => months.add(e.date.slice(0, 7)));
  return [...months].sort().reverse().map((month) => {
    const m = monthSummary(month);
    const saved = vaultSummary(month).saved;
    return { month, income: m.income, spent: m.spent, saved, left: m.income - m.spent - saved };
  });
}

// ---------- Subscriptions ----------

const pad2 = (n) => String(n).padStart(2, '0');
const daysIn = (month) => { const [y, m] = month.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const addMonths = (month, by) => { const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 1 + by, 1); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; };

// The payment date in a given month ('YYYY-MM'), or null if there is none that month.
// A payment day the month does not have (31st in November) falls on the month's last day.
// Monthly payments can also come every 2, 3, 4 or 6 months: they fall in the months
// that are a whole number of steps away from the month of the payment date (s.month).
// Bills you add yourself each time (cycle 'manual') have no payment date at all.
export function chargeDateIn(s, month) {
  if (s.cycle === 'manual') return null;
  const m = Number(month.slice(5, 7));
  if (s.cycle === 'yearly' && m !== s.month) return null;
  const every = s.every || 1;
  if (s.cycle !== 'yearly' && every > 1 && (((m - s.month) % every) + every) % every !== 0) return null;
  return `${month}-${pad2(Math.min(s.day, daysIn(month)))}`;
}

// The name as whole words, so a bill called "Rent" does not match "Parent's gift".
const nameMatcher = (name) => new RegExp(`(^|[^\\p{L}\\p{N}])${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'iu');

// True when this month's payment is already in the transactions: logged from here,
// skipped, or typed in by hand with the subscription's name in the note.
export function subscriptionPaid(s, month) {
  if (s.handled === month) return true;
  const re = nameMatcher(s.name);
  return transactionsIn(month).some((t) => t.kind === 'expense' && re.test(t.note));
}

// Every expense for this bill or subscription, newest first: logged from the Bills
// page, added with its Add button, or typed in by hand with its name in the note.
export function billPayments(s) {
  const re = nameMatcher(s.name);
  return state.transactions.filter((x) => x.kind === 'expense' && re.test(x.note)).sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));
}

// What was paid last time, for bills whose amount changes.
export function lastPaid(s) {
  const t = billPayments(s)[0];
  return t ? t.amount : 0;
}

// The usual amount: the average of the last three payments, or the typed estimate.
export function usualAmount(s) {
  const last = billPayments(s).slice(0, 3);
  return last.length ? Math.round(last.reduce((n, t) => n + t.amount, 0) / last.length) : s.amount;
}

// For bills added by hand: what they cost per month, averaged over the last 12 months
// (or since the first payment, if that is more recent). A bill of 180 every two months
// comes out at about 90 a month.
function manualMonthly(s, today) {
  const now = today.slice(0, 7);
  const from = addMonths(now, -11);
  const list = billPayments(s).filter((t) => t.date.slice(0, 7) >= from);
  if (!list.length) return s.amount;
  const first = list[list.length - 1].date.slice(0, 7);
  const [fy, fm] = first.split('-').map(Number);
  const [ny, nm] = now.split('-').map(Number);
  const months = Math.max(1, (ny - fy) * 12 + (nm - fm) + 1);
  return Math.round(list.reduce((n, t) => n + t.amount, 0) / months);
}

// { due: bool, date: next or overdue payment date, month: that payment's month, paidThisMonth }
// Bills added by hand are never due and have no date; paidThisMonth says whether this
// month's bill has been added.
export function subscriptionStatus(s, today) {
  const now = today.slice(0, 7);
  if (s.cycle === 'manual') return { due: false, date: null, month: now, paidThisMonth: subscriptionPaid(s, now), manual: true };
  const thisDate = chargeDateIn(s, now);
  const paidThisMonth = thisDate ? subscriptionPaid(s, now) : false;
  if (thisDate && thisDate <= today && !paidThisMonth) return { due: true, date: thisDate, month: now, paidThisMonth };
  if (thisDate && thisDate > today) return { due: false, date: thisDate, month: now, paidThisMonth };
  let month = addMonths(now, 1);
  while (!chargeDateIn(s, month)) month = addMonths(month, 1); // yearly or every few months: walk forward to its month
  return { due: false, date: chargeDateIn(s, month), month, paidThisMonth };
}

const monthsBetween = (s) => (s.cycle === 'yearly' ? 12 : s.every || 1);
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
export const monthlyCost = (s) => (s.cycle === 'manual' ? manualMonthly(s, todayStr()) : Math.round(s.amount / monthsBetween(s)));
export const yearlyCost = (s) => (s.cycle === 'manual' ? manualMonthly(s, todayStr()) * 12 : Math.round((s.amount * 12) / monthsBetween(s)));

// ---------- Journal ----------

// Monday = 1 ... Sunday = 7
export const weekday = (date) => { const [y, m, d] = date.split('-').map(Number); return ((new Date(y, m - 1, d).getDay() + 6) % 7) + 1; };

// Everything planned for a day: one-offs on that date, and routines on that weekday
// (only from the day the routine was added, so the past is not rewritten).
export function itemsOn(date) {
  const wd = weekday(date);
  return state.journalItems.filter((i) => (i.date ? i.date === date : i.days.includes(wd) && i.createdAt.slice(0, 10) <= date));
}
export const markFor = (itemId, date) => state.journalMarks.find((m) => m.itemId === itemId && m.date === date);
export const dayEntry = (date) => state.journalDays.find((d) => d.date === date);

export function daySummary(date) {
  const items = itemsOn(date).map((item) => ({ item, mark: markFor(item.id, date) }));
  const active = items.filter((x) => !x.mark || x.mark.status !== 'skipped');
  const done = active.filter((x) => x.mark && x.mark.status === 'done');
  const minutes = active.reduce((n, x) => n + (x.item.minutes || 0), 0);
  const left = active.filter((x) => !x.mark).reduce((n, x) => n + (x.item.minutes || 0), 0);
  return { items, active, done, minutes, left, capacity: state.journalSettings.capacity, entry: dayEntry(date) };
}
