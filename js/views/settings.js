import { state } from '../store.js?v=202611241533';
import { icon } from '../icons.js?v=202611241533';
import { esc } from '../ui.js?v=202611241533';

export function render() {
  const cloud = state.mode === 'cloud';
  return `
    <header class="page-head"><h1>Settings</h1></header>

    <section class="panel" aria-labelledby="h-data">
      <h2 id="h-data">Where your data lives</h2>
      ${cloud ? `
        <p class="status">${icon('cloud', 20)} <span>Saved in your private database, signed in as <strong>${esc(state.user.email)}</strong>.</span></p>
        <p class="help">Anything you add here shows up on your other devices after you sign in there.</p>
        <button type="button" class="btn btn-quiet" data-action="sign-out">${icon('log-out', 16)} Sign out</button>` : `
        <p class="status">${icon('cloud-off', 20)} <span>Saved on this device only, in this browser.</span></p>
        <p class="help">Your phone and your other computers will not see it until the database is connected. Clearing this browser's data would erase it, so download a backup now and then.</p>`}
    </section>

    <section class="panel" aria-labelledby="h-backup">
      <h2 id="h-backup">Backup</h2>
      <p class="help">Downloads all your data as one file you can keep somewhere safe.</p>
      <button type="button" class="btn btn-quiet" data-action="export">Download backup</button>
    </section>

    <section class="panel" aria-labelledby="h-version">
      <h2 id="h-version">App version</h2>
      <p class="status">${icon('sparkles', 20)} <span>You are using the version from <strong>${versionLabel()}</strong>.</span></p>
      <p class="help">Phones can keep an older copy for a while after an update. This loads the newest one.</p>
      <button type="button" class="btn btn-quiet" data-action="app-update">${icon('undo-2', 16)} Get the latest version</button>
    </section>`;
}

// The version is the ?v= stamp this file was loaded with, e.g. 202611231603 (UTC),
// shown in the phone's own time zone.
function versionLabel() {
  const v = new URL(import.meta.url).searchParams.get('v') || '';
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!m) return 'this computer (not published)';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function renderSignIn() {
  return `
    <div class="signin">
      <header class="page-head">
        <p class="eyebrow">Life</p>
        <h1>Sign in</h1>
      </header>
      <form class="form panel" id="signin" novalidate>
        <div class="field">
          <label for="s-email">Email</label>
          <input id="s-email" name="email" type="email" class="input" autocomplete="username" required autofocus>
        </div>
        <div class="field">
          <label for="s-password">Password</label>
          <input id="s-password" name="password" type="password" class="input" autocomplete="current-password" required>
        </div>
        <p class="error" data-error="signin" hidden></p>
        <button type="submit" class="btn btn-primary">${icon('lock', 16)} Sign in</button>
      </form>
    </div>`;
}
