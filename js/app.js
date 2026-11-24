import { state, init, subscribe, signIn, signOut } from './store.js?v=202611241533';
import { icon } from './icons.js?v=202611241533';
import { closeSheet, toast, todayISO } from './ui.js?v=202611241533';
import * as home from './views/home.js?v=202611241533';
import * as budget from './views/budget.js?v=202611241533';
import * as settings from './views/settings.js?v=202611241533';
import { openTransactionSheet, openCategorySheet } from './views/sheets.js?v=202611241533';
import { openVaultEntrySheet, openVaultSettingsSheet } from './views/vault.js?v=202611241533';
import * as workouts from './views/workouts.js?v=202611241533';
import * as wishlist from './views/wishlist.js?v=202611241533';
import * as journal from './views/journal.js?v=202611241533';
import * as shopping from './views/shopping.js?v=202611241533';
import * as subscriptions from './views/subscriptions.js?v=202611241533';
import { recipesView, planView, onLoaded as onRecipesLoaded, retry as retryRecipes } from './views/recipes.js?v=202611241533';

const routes = {
  home: { title: 'Home', view: home },
  budget: { title: 'Budget', view: budget },
  subscriptions: { title: 'Bills & subscriptions', view: subscriptions, nav: 'budget' },
  journal: { title: 'Journal', view: journal },
  wishlist: { title: 'Wishlist', view: wishlist, nav: 'budget' },
  workouts: { title: 'Workouts', view: workouts },
  shopping: { title: 'Shopping list', view: shopping },
  recipes: { title: 'Recipes', view: recipesView },
  plan: { title: 'Meal plan', view: planView, nav: 'recipes' },
  settings: { title: 'Settings', view: settings },
};

const view = document.getElementById('view');
const nav = document.getElementById('nav');
const sheet = document.getElementById('sheet');

// "#/recipes/some-id" -> { name: 'recipes', param: 'some-id' }
const currentRoute = () => {
  const [name, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  return routes[name] ? { name, param: rest.join('/') } : { name: 'home', param: '' };
};

function renderNav(route) {
  const link = (name, ico, label) => `
    <a class="nav-item nav-${name}" href="#/${name}" ${route === name ? 'aria-current="page"' : ''}>
      ${icon(ico, 22)}<span>${label}</span>
    </a>`;
  nav.innerHTML = `
    <a class="brand" href="#/home"><img src="icon.svg" alt="" width="28" height="28"> Life</a>
    ${link('home', 'layout-grid', 'Home')}
    ${link('budget', 'wallet', 'Budget')}
    ${route === 'journal'
      ? `<button type="button" class="nav-add" data-action="j-add" aria-label="Add to journal">${icon('plus', 24)}<span>Add to journal</span></button>`
      : `<button type="button" class="nav-add" data-action="add-txn" aria-label="Add transaction">${icon('plus', 24)}<span>Add transaction</span></button>`}
    ${link('journal', 'notebook-pen', 'Journal')}
    ${link('recipes', 'chef-hat', 'Recipes')}
    ${link('shopping', 'shopping-basket', 'Shopping')}
    ${link('workouts', 'dumbbell', 'Workouts')}
    ${link('settings', 'settings', 'Settings')}`;
}

function render() {
  if (!state.ready) {
    view.innerHTML = '<p class="loading">Loading your data…</p>';
    return;
  }
  const signedOut = state.mode === 'cloud' && !state.user;
  document.body.classList.toggle('is-signed-out', signedOut);
  if (signedOut) {
    nav.innerHTML = '';
    document.title = 'Sign in · Life';
    view.innerHTML = settings.renderSignIn();
    return;
  }
  const { name, param } = currentRoute();
  const route = routes[name];
  renderNav(route.nav || name);
  view.innerHTML = route.view.render(param);
  if (route.view.mount) route.view.mount(view, param);
  document.title = `${route.view.title ? route.view.title(param) : route.title} · Life`;
}

const actions = {
  'add-txn': () => openTransactionSheet(),
  'edit-txn': (el) => openTransactionSheet(el.dataset.id),
  'add-cat': () => openCategorySheet(),
  'edit-cat': (el) => openCategorySheet(el.dataset.id),
  'vault-add': () => openVaultEntrySheet(null, 'in'),
  'vault-take': () => openVaultEntrySheet(null, 'out'),
  'vault-edit': (el) => openVaultEntrySheet(el.dataset.id),
  'vault-settings': () => openVaultSettingsSheet(),
  'go-month': (el) => { budget.setMonth(el.dataset.month); render(); window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); },
  'month-prev': () => { budget.shift(-1); render(); },
  'month-next': () => { budget.shift(1); render(); },
  'sub-add': (el) => subscriptions.openSubscriptionSheet(null, el.dataset.kind || 'subscription'),
  'sub-edit': (el) => subscriptions.openSubscriptionSheet(el.dataset.id),
  'sub-entry': (el) => subscriptions.openBillEntry(el.dataset.id),
  'sub-log': (el) => subscriptions.logPayment(el.dataset.id),
  'sub-skip': (el) => subscriptions.skipPayment(el.dataset.id),
  'wo-add': () => workouts.openWorkoutSheet(),
  'wo-template': (el) => workouts.openTemplate(el.dataset.n),
  'wo-edit': (el) => workouts.openWorkoutSheet(el.dataset.id),
  'wo-schedule': (el) => workouts.openScheduleSheet(el.dataset.id),
  'ex-add': (el) => workouts.openExerciseSheet(null, el.dataset.id),
  'ex-edit': (el) => workouts.openExerciseSheet(el.dataset.id),
  'go-set': (el) => workouts.toggleSet(el.dataset.ex, el.dataset.i),
  'go-finish': (el) => workouts.finish(el.dataset.id),
  'wish-add': () => wishlist.openWishSheet(),
  'wish-edit': (el) => wishlist.openWishSheet(el.dataset.id),
  'wish-bought': (el) => wishlist.openBoughtSheet(el.dataset.id),
  'wish-unbuy': (el) => wishlist.unbuy(el.dataset.id),
  'wish-filter': (el) => { wishlist.setFilter(el.dataset.filter); render(); },
  'j-add': () => journal.openItemSheet(),
  'j-add-routine': () => journal.openItemSheet(null, { date: null, days: [] }),
  'j-edit': (el) => journal.openItemSheet(el.dataset.id),
  'j-open': (el) => journal.openItemActions(el.dataset.id, el.dataset.date),
  'j-toggle': (el) => journal.toggleDone(el.dataset.id, el.dataset.date),
  'j-unskip': (el) => journal.unskip(el.dataset.id),
  'j-template': (el) => journal.openTemplate(el.dataset.n),
  'j-checkin': () => journal.openCheckIn(),
  'j-capacity': () => journal.openCapacity(),
  'diary-goals': () => journal.openGoals(),
  'diary-day': (el) => { journal.setDay(el.dataset.date); render(); window.scrollTo(0, 0); },
  'jday-prev': () => { journal.shiftDay(-1); render(); },
  'jday-next': () => { journal.shiftDay(1); render(); },
  'jday-today': () => { journal.setDay(todayISO()); render(); },
  'jweek-prev': () => { journal.shiftWeek(-1); render(); },
  'jweek-next': () => { journal.shiftWeek(1); render(); },
  'jweek-this': () => { journal.thisWeek(); render(); },
  'go-day': (el) => { journal.setDay(el.dataset.date); if (location.hash === '#/journal') render(); else location.hash = '#/journal'; },
  'recipes-retry': () => retryRecipes(),
  // A new address makes the phone fetch the page again instead of using its stored copy.
  'app-update': () => { location.replace(`${location.pathname}?update=${Date.now()}${location.hash}`); },
  'sign-out': () => signOut(),
  export: () => {
    const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), categories: state.categories, transactions: state.transactions, vault: state.vault, vaultEntries: state.vaultEntries, subscriptions: state.subscriptions, wishlist: state.wishlist, shopping: state.shopping, workouts: state.workouts, exercises: state.exercises, journalItems: state.journalItems, journalMarks: state.journalMarks, journalDays: state.journalDays, journalSettings: state.journalSettings }, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `life-backup-${todayISO()}.json` });
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Backup downloaded');
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
});

// Sheet: close with the X button or by clicking outside it.
sheet.addEventListener('click', (e) => {
  if (e.target === sheet || e.target.closest('[data-close]')) closeSheet();
});

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'signin') return;
  e.preventDefault();
  const form = e.target;
  const error = form.querySelector('[data-error="signin"]');
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  error.hidden = true;
  try {
    await signIn(form.elements.email.value.trim(), form.elements.password.value);
  } catch {
    error.textContent = 'That email and password did not match. Check them and try again.';
    error.hidden = false;
    button.disabled = false;
  }
});

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); view.focus({ preventScroll: true }); });
subscribe(render);
onRecipesLoaded(render);
// Letters in logo circles are placed by measuring the font, so redraw once it has loaded.
if (document.fonts) document.fonts.ready.then(() => { if (state.ready) render(); });

render();
init().catch(() => {
  view.innerHTML = '<div class="panel"><h2>Your data could not be loaded</h2><p class="help">Check your internet connection, then reload the page.</p><button type="button" class="btn btn-primary" onclick="location.reload()">Reload</button></div>';
});
