import { state, monthSummary, vaultSummary, categoryById, sum } from '../store.js?v=202611241533';
import { icon } from '../icons.js?v=202611241533';
import { homeTile as workoutsTile } from './workouts.js?v=202611241533';
import { homeTile as shoppingTile } from './shopping.js?v=202611241533';
import { homeTile as wishlistTile } from './wishlist.js?v=202611241533';
import { homeTile as journalTile } from './journal.js?v=202611241533';
import { homeTile as vaultTile } from './vault.js?v=202611241533';
import { esc, money, moneyShort, todayISO, monthOf, iso, shortDate, monthLabel } from '../ui.js?v=202611241533';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function weekStartISO() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return iso(d);
}

export function txnRow(t) {
  const c = categoryById(t.categoryId);
  const title = t.note || (c ? c.name : 'Transaction');
  const sign = t.kind === 'income' ? '+' : '−';
  return `
    <li>
      <button type="button" class="row" data-action="edit-txn" data-id="${t.id}">
        <span class="bubble tone-${c ? c.color : 'butter'}">${icon(c ? c.icon : 'ellipsis', 18)}</span>
        <span class="row-main">
          <span class="row-title">${esc(title)}</span>
          <span class="row-sub">${esc(c ? c.name : 'No category')} · ${shortDate(t.date)}</span>
        </span>
        <span class="row-amount ${t.kind}">${sign}${money(t.amount)}</span>
      </button>
    </li>`;
}

const soonTile = (tone, ico, name, line) => `
  <div class="tile tone-${tone} tile-module is-soon">
    <span class="tile-icon">${icon(ico, 22)}</span>
    <span class="tile-name">${name}</span>
    <span class="tile-line">${line}</span>
    <span class="badge">Soon</span>
  </div>`;

export function render() {
  const today = todayISO();
  const month = monthOf(today);
  const m = monthSummary(month);
  const spentToday = sum(m.expenses.filter((t) => t.date === today));
  const week = weekStartISO();
  const spentWeek = sum(state.transactions.filter((t) => t.kind === 'expense' && t.date >= week && t.date <= today));
  const top = [...m.byCategory].sort((a, b) => b.spent - a.spent)[0];
  const recent = m.txns.slice(0, 4);

  // What is left of this month's money: income, minus spending, minus what went into the vault.
  // Category limits are shown on their own cards in Budget, never as one headline number here.
  const saved = vaultSummary(month).saved;
  const left = m.income - m.spent - saved;
  const budgetTile = m.income
    ? `<span class="tile-label">Left this month</span>
       <span class="figure">${left < 0 ? '−' : ''}${money(Math.abs(left))}</span>
       <span class="tile-line">${left < 0 ? `${money(-left)} more went out than came in. ` : ''}${money(m.income)} in, ${money(m.spent)} spent${saved ? `, ${money(saved)} saved` : ''}</span>`
    : `<span class="tile-label">Spent this month</span>
       <span class="figure">${money(m.spent)}</span>
       <span class="tile-line">Your income for this month is not in yet. Once it is, this shows what is left.</span>`;

  return `
    <header class="page-head page-head-home">
      <a class="icon-btn settings-link" href="#/settings" aria-label="Settings">${icon('settings', 22)}</a>
      <p class="eyebrow">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <h1>${greeting()}</h1>
    </header>

    <section class="bento" aria-label="Overview">
      ${journalTile()}

      <a class="tile tone-butter span-2 tile-hero" href="#/budget">
        <span class="tile-icon">${icon('wallet', 22)}</span>
        ${budgetTile}
      </a>

      <div class="tile tone-pink">
        <span class="tile-label">Today</span>
        <span class="figure figure-sm">${money(spentToday)}</span>
        <span class="tile-line">spent</span>
      </div>

      <div class="tile tone-sky">
        <span class="tile-label">This week</span>
        <span class="figure figure-sm">${money(spentWeek)}</span>
        <span class="tile-line">since Monday</span>
      </div>

      <div class="tile tile-plain span-2 tall">
        <div class="tile-headline">
          <h2>Latest</h2>
          <a class="link" href="#/budget">See all</a>
        </div>
        ${recent.length
          ? `<ul class="rows">${recent.map(txnRow).join('')}</ul>`
          : `<p class="empty">Nothing logged in ${monthLabel(month)} yet. Use the plus button to add your first expense.</p>`}
      </div>

      <div class="tile tone-sage">
        <span class="tile-label">Top category</span>
        ${top && top.spent > 0
          ? `<span class="figure figure-sm">${esc(top.category.name)}</span><span class="tile-line">${money(top.spent)} this month</span>`
          : `<span class="figure figure-sm">None yet</span><span class="tile-line">shows after your first expense</span>`}
      </div>

      <div class="tile tone-peach">
        <span class="tile-label">Income</span>
        <span class="figure figure-sm">${money(m.income)}</span>
        <span class="tile-line">this month</span>
      </div>

      ${vaultTile()}
    </section>

    <h2 class="section-title">Your life</h2>
    <section class="bento" aria-label="Sections">
      <a class="tile tone-butter tile-module" href="#/budget">
        <span class="tile-icon">${icon('wallet', 22)}</span>
        <span class="tile-name">Budget</span>
        <span class="tile-line">Spending and monthly limits</span>
      </a>
      <a class="tile tone-peach tile-module" href="#/recipes">
        <span class="tile-icon">${icon('chef-hat', 22)}</span>
        <span class="tile-name">Recipes</span>
        <span class="tile-line">Your recipe book and meal plan</span>
      </a>
      ${shoppingTile()}
      ${workoutsTile()}
      ${wishlistTile()}
      <a class="tile tone-sky tile-module" href="#/journal">
        <span class="tile-icon">${icon('notebook-pen', 22)}</span>
        <span class="tile-name">Journal</span>
        <span class="tile-line">Routines, check-ins and your week</span>
      </a>
    </section>`;
}
