// Private database with a login (Supabase). Tables and rules: supabase/schema.sql
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const catToRow = (c) => ({ id: c.id, name: c.name, kind: c.kind, color: c.color, icon: c.icon, budget_cents: c.budget, sort: c.sort });
const rowToCat = (r) => ({ id: r.id, name: r.name, kind: r.kind, color: r.color, icon: r.icon, budget: r.budget_cents, sort: r.sort });
const txnToRow = (t) => ({ id: t.id, date: t.date, amount_cents: t.amount, kind: t.kind, category_id: t.categoryId, note: t.note, created_at: t.createdAt });
const rowToTxn = (r) => ({ id: r.id, date: r.date, amount: r.amount_cents, kind: r.kind, categoryId: r.category_id, note: r.note || '', createdAt: r.created_at });

const entryToRow = (e) => ({ id: e.id, date: e.date, amount_cents: e.amount, note: e.note, created_at: e.createdAt });
const rowToEntry = (r) => ({ id: r.id, date: r.date, amount: r.amount_cents, note: r.note || '', createdAt: r.created_at });

const subToRow = (s) => ({ id: s.id, name: s.name, amount_cents: s.amount, cycle: s.cycle, day: s.day, month: s.month, category_id: s.categoryId, handled_month: s.handled || '', created_at: s.createdAt });
const rowToSub = (r) => ({ id: r.id, name: r.name, amount: r.amount_cents, cycle: r.cycle, day: r.day, month: r.month, categoryId: r.category_id, handled: r.handled_month || '', createdAt: r.created_at });

const itemToRow = (i) => ({ id: i.id, title: i.title, type: i.type, days: i.days, date: i.date || null, part: i.part, minutes: i.minutes, created_at: i.createdAt });
const rowToItem = (r) => ({ id: r.id, title: r.title, type: r.type, days: r.days || [], date: r.date, part: r.part, minutes: r.minutes, createdAt: r.created_at });
const markToRow = (m) => ({ id: m.id, item_id: m.itemId, date: m.date, status: m.status });
const rowToMark = (r) => ({ id: r.id, itemId: r.item_id, date: r.date, status: r.status });
const rowToDay = (r) => ({ id: r.date, date: r.date, energy: r.energy || 0, mood: r.mood || '', note: r.note || '' });

export async function create(url, key) {
  const sb = createClient(url, key);

  const check = ({ error }) => { if (error) throw error; };

  // Supabase returns at most 1000 rows per request, so read in pages.
  async function all(table, order) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(table).select('*').order(order).order('id').range(from, from + 999);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 1000) return rows;
    }
  }

  return {
    async user() {
      const { data } = await sb.auth.getSession();
      return data.session ? { email: data.session.user.email } : null;
    },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { email: data.user.email };
    },
    async signOut() { await sb.auth.signOut(); },

    async load() {
      const [cats, txns, entries, settings, subs] = await Promise.all([
        all('budget_categories', 'sort'),
        all('budget_transactions', 'date'),
        all('vault_entries', 'date'),
        sb.from('vault_settings').select('*').maybeSingle(),
        all('subscriptions', 'created_at'),
      ]);
      // journal_days has no id column, so it is read on its own (one row per day, a few hundred a year).
      const [items, marks, days, js] = await Promise.all([
        all('journal_items', 'created_at'),
        all('journal_marks', 'date'),
        sb.from('journal_days').select('*').order('date').limit(5000),
        sb.from('journal_settings').select('*').maybeSingle(),
      ]);
      if (days.error) throw days.error;
      if (js.error) throw js.error;
      if (settings.error) throw settings.error;
      const s = settings.data;
      return {
        categories: cats.map(rowToCat),
        transactions: txns.map(rowToTxn),
        vault: s ? { salary: s.salary_cents, goal: s.goal_cents, starting: s.starting_cents } : {},
        vaultEntries: entries.map(rowToEntry),
        subscriptions: subs.map(rowToSub),
        journalItems: items.map(rowToItem),
        journalMarks: marks.map(rowToMark),
        journalDays: days.data.map(rowToDay),
        journalSettings: js.data ? { capacity: js.data.capacity_minutes } : {},
      };
    },
    async saveCategory(c) { check(await sb.from('budget_categories').upsert(catToRow(c))); },
    async removeCategory(id) { check(await sb.from('budget_categories').delete().eq('id', id)); },
    async saveTransaction(t) { check(await sb.from('budget_transactions').upsert(txnToRow(t))); },
    async removeTransaction(id) { check(await sb.from('budget_transactions').delete().eq('id', id)); },
    async saveVaultSettings(v) {
      const { data } = await sb.auth.getSession();
      check(await sb.from('vault_settings').upsert({ user_id: data.session.user.id, salary_cents: v.salary, goal_cents: v.goal, starting_cents: v.starting }));
    },
    async saveVaultEntry(e) { check(await sb.from('vault_entries').upsert(entryToRow(e))); },
    async removeVaultEntry(id) { check(await sb.from('vault_entries').delete().eq('id', id)); },
    async saveJournalItem(i) { check(await sb.from('journal_items').upsert(itemToRow(i))); },
    async removeJournalItem(id) { check(await sb.from('journal_items').delete().eq('id', id)); },
    async saveJournalMark(m) { check(await sb.from('journal_marks').upsert(markToRow(m))); },
    async removeJournalMark(id) { check(await sb.from('journal_marks').delete().eq('id', id)); },
    async saveJournalDay(d) {
      check(await sb.from('journal_days').upsert({ date: d.date, energy: d.energy || null, mood: d.mood, note: d.note }, { onConflict: 'user_id,date' }));
    },
    async saveJournalSettings(s) {
      const { data } = await sb.auth.getSession();
      check(await sb.from('journal_settings').upsert({ user_id: data.session.user.id, capacity_minutes: s.capacity }));
    },
    async saveSubscription(s) { check(await sb.from('subscriptions').upsert(subToRow(s))); },
    async removeSubscription(id) { check(await sb.from('subscriptions').delete().eq('id', id)); },
  };
}
