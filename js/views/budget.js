import { monthSummary, categoriesOf } from '../store.js';
import { icon } from '../icons.js';
import { esc, money, moneyShort, todayISO, monthOf, shiftMonth, monthLabel, dayLabel, shortDate, fromISO } from '../ui.js';
import { txnRow } from './home.js';
import * as vault from './vault.js';

let month = monthOf(todayISO());

export function shift(by) { month = shiftMonth(month, by); }
export const currentMonth = () => month;

function dayChart(m) {
  const days = new Date(fromISO(month + '-01').getFullYear(), fromISO(month + '-01').getMonth() + 1, 0).getDate();
  const totals = Array.from({ length: days }, () => 0);
  m.expenses.forEach((t) => { totals[Number(t.date.slice(8, 10)) - 1] += t.amount; });
  const max = Math.max(...totals);
  if (max === 0) return `<p class="empty">No spending in ${monthLabel(month)} yet.</p>`;

  const peak = totals.indexOf(max);
  const peakDate = `${month}-${String(peak + 1).padStart(2, '0')}`;
  const takeaway = `Your biggest day was ${shortDate(peakDate)}, with ${money(max)} spent.`;
  const today = todayISO();

  const bars = totals.map((v, i) => {
    const d = `${month}-${String(i + 1).padStart(2, '0')}`;
    const h = v ? Math.max(4, Math.round((v / max) * 100)) : 0;
    return `<span class="bar${d === today ? ' is-today' : ''}${i === peak ? ' is-peak' : ''}" style="height:${h}%"></span>`;
  }).join('');
  const ticks = totals.map((_, i) => `<span>${i === 0 || (i + 1) % 5 === 0 ? i + 1 : ''}</span>`).join('');
  const rows = totals.map((v, i) => (v ? `<tr><td>${shortDate(`${month}-${String(i + 1).padStart(2, '0')}`)}</td><td>${money(v)}</td></tr>` : '')).join('');

  return `
    <p class="takeaway">${takeaway}</p>
    <div class="chart" role="img" aria-label="Bar chart of spending for each day of ${monthLabel(month)}. ${takeaway}">
      <div class="chart-top"><span>${moneyShort(max)}</span></div>
      <div class="bars">${bars}</div>
      <div class="ticks" aria-hidden="true">${ticks}</div>
    </div>
    <details class="as-table">
      <summary>View as table</summary>
      <table>
        <thead><tr><th scope="col">Day</th><th scope="col">Spent</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </details>`;
}

function categoryCard({ category: c, spent }) {
  const has = c.budget > 0;
  const pct = has ? Math.min(100, Math.round((spent / c.budget) * 100)) : 0;
  const diff = c.budget - spent;
  const status = !has ? 'No limit set' : diff >= 0 ? `${money(diff)} left` : `${money(-diff)} over`;
  return `
    <li>
      <button type="button" class="cat tone-${c.color}${has && diff < 0 ? ' is-over' : ''}" data-action="edit-cat" data-id="${c.id}">
        <span class="cat-top">
          <span class="tile-icon">${icon(c.icon, 20)}</span>
          <span class="cat-name">${esc(c.name)}</span>
        </span>
        <span class="cat-figure">${money(spent)}${has ? `<small> of ${moneyShort(c.budget)}</small>` : ''}</span>
        ${has ? `<span class="meter" role="img" aria-label="${pct}% used"><span style="width:${pct}%"></span></span>` : ''}
        <span class="cat-status">${status}</span>
      </button>
    </li>`;
}

function transactionList(txns) {
  if (!txns.length) return `<p class="empty">No transactions in ${monthLabel(month)}. Use the plus button to add one.</p>`;
  const groups = [];
  txns.forEach((t) => {
    const g = groups[groups.length - 1];
    if (g && g.date === t.date) g.items.push(t); else groups.push({ date: t.date, items: [t] });
  });
  return groups.map((g) => `
    <h3 class="day">${dayLabel(g.date)}</h3>
    <ul class="rows">${g.items.map(txnRow).join('')}</ul>`).join('');
}

export function render() {
  const m = monthSummary(month);
  const hasBudget = m.budget > 0;
  const left = hasBudget ? m.budget - m.spent : m.income - m.spent;
  const isNow = month === monthOf(todayISO());

  return `
    <header class="page-head page-head-row">
      <h1>Budget</h1>
      <div class="month" role="group" aria-label="Month">
        <button type="button" class="icon-btn" data-action="month-prev" aria-label="Previous month">${icon('chevron-left', 20)}</button>
        <span class="month-label" aria-live="polite">${monthLabel(month)}</span>
        <button type="button" class="icon-btn" data-action="month-next" aria-label="Next month" ${isNow ? 'disabled' : ''}>${icon('chevron-right', 20)}</button>
      </div>
    </header>

    <section class="bento bento-3" aria-label="Month totals">
      <div class="tile tone-butter span-2-sm">
        <span class="tile-label">${hasBudget ? (left >= 0 ? 'Left to spend' : 'Over budget') : 'Income minus spending'}</span>
        <span class="figure">${left < 0 && !hasBudget ? '−' : ''}${money(Math.abs(left))}</span>
        <span class="tile-line">${hasBudget ? `of a ${moneyShort(m.budget)} monthly budget` : 'Set limits on categories below to get a budget'}</span>
      </div>
      <div class="tile tone-pink">
        <span class="tile-label">Spent</span>
        <span class="figure figure-sm">${money(m.spent)}</span>
        <span class="tile-line">${m.expenses.length} ${m.expenses.length === 1 ? 'expense' : 'expenses'}</span>
      </div>
      <div class="tile tone-sage">
        <span class="tile-label">Income</span>
        <span class="figure figure-sm">${money(m.income)}</span>
        <span class="tile-line">this month</span>
      </div>
    </section>

    ${vault.render(month)}

    <section class="panel" aria-labelledby="h-days">
      <h2 id="h-days">Spending by day <small>${monthLabel(month)}</small></h2>
      ${dayChart(m)}
    </section>

    <section aria-labelledby="h-cats">
      <div class="section-row">
        <h2 class="section-title" id="h-cats">Categories</h2>
        <button type="button" class="btn btn-quiet" data-action="add-cat">${icon('plus', 16)} New category</button>
      </div>
      <ul class="cats">${m.byCategory.map(categoryCard).join('')}</ul>
      ${categoriesOf('income').length ? `
        <p class="hint">Income categories:
          ${categoriesOf('income').map((c) => `<button type="button" class="chip-btn" data-action="edit-cat" data-id="${c.id}">${esc(c.name)}</button>`).join(' ')}
        </p>` : ''}
    </section>

    <section class="panel" aria-labelledby="h-txns">
      <h2 id="h-txns">Transactions <small>${monthLabel(month)}</small></h2>
      ${transactionList(m.txns)}
    </section>`;
}
