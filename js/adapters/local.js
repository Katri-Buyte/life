// Keeps everything in this browser's storage. Used when no database is configured.
const KEY = 'life.budget.v1';

function read() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.categories) && Array.isArray(d.transactions)) return { vault: {}, vaultEntries: [], subscriptions: [], wishlist: [], workouts: [], exercises: [], journalItems: [], journalMarks: [], journalDays: [], journalSettings: {}, ...d };
  } catch { /* fall through to empty */ }
  return { categories: [], transactions: [], vault: {}, vaultEntries: [], subscriptions: [], wishlist: [], workouts: [], exercises: [], journalItems: [], journalMarks: [], journalDays: [], journalSettings: {} };
}

function write(d) {
  localStorage.setItem(KEY, JSON.stringify(d));
}

function upsert(list, item) {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) list.push(item); else list[i] = item;
}

export function create() {
  return {
    async load() { return read(); },
    async saveCategory(c) { const d = read(); upsert(d.categories, c); write(d); },
    async removeCategory(id) { const d = read(); d.categories = d.categories.filter((c) => c.id !== id); write(d); },
    async saveTransaction(t) { const d = read(); upsert(d.transactions, t); write(d); },
    async removeTransaction(id) { const d = read(); d.transactions = d.transactions.filter((t) => t.id !== id); write(d); },
    async saveVaultSettings(v) { const d = read(); d.vault = v; write(d); },
    async saveVaultEntry(e) { const d = read(); upsert(d.vaultEntries, e); write(d); },
    async removeVaultEntry(id) { const d = read(); d.vaultEntries = d.vaultEntries.filter((e) => e.id !== id); write(d); },
    async saveSubscription(s) { const d = read(); upsert(d.subscriptions, s); write(d); },
    async saveWorkout(w) { const d = read(); upsert(d.workouts, w); write(d); },
    async removeWorkout(id) { const d = read(); d.workouts = d.workouts.filter((w) => w.id !== id); d.exercises = d.exercises.filter((e) => e.workoutId !== id); d.journalItems = d.journalItems.map((i) => (i.workoutId === id ? { ...i, workoutId: null } : i)); write(d); },
    async saveExercise(e) { const d = read(); upsert(d.exercises, e); write(d); },
    async removeExercise(id) { const d = read(); d.exercises = d.exercises.filter((e) => e.id !== id); write(d); },
    async saveWish(w) { const d = read(); upsert(d.wishlist, w); write(d); },
    async removeWish(id) { const d = read(); d.wishlist = d.wishlist.filter((w) => w.id !== id); write(d); },
    async saveJournalItem(i) { const d = read(); upsert(d.journalItems, i); write(d); },
    async removeJournalItem(id) { const d = read(); d.journalItems = d.journalItems.filter((i) => i.id !== id); d.journalMarks = d.journalMarks.filter((m) => m.itemId !== id); write(d); },
    async saveJournalMark(m) { const d = read(); upsert(d.journalMarks, m); write(d); },
    async removeJournalMark(id) { const d = read(); d.journalMarks = d.journalMarks.filter((m) => m.id !== id); write(d); },
    async saveJournalDay(day) { const d = read(); upsert(d.journalDays, day); write(d); },
    async saveJournalSettings(s) { const d = read(); d.journalSettings = s; write(d); },
    async removeSubscription(id) { const d = read(); d.subscriptions = d.subscriptions.filter((s) => s.id !== id); write(d); },
  };
}
