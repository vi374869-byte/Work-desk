/* Work Desk — "real app" support: offline mode, Install button, phone layout helpers, full-library backup. */
(function (Ink) {
  'use strict';
  const U = Ink.util, S = Ink.store;
  const { $, h, fmt } = U;
  const P = Ink.pwa = {};
  let installEvent = null;

  /* Running inside the Windows desktop program (Tauri)? Then there's nothing to install and no offline cache needed. */
  const isDesktop = () => '__TAURI_INTERNALS__' in window || location.hostname === 'tauri.localhost' || location.protocol === 'tauri:';
  P.isDesktop = isDesktop;
  const isWeb = () => /^https?:$/.test(location.protocol) && !isDesktop();
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  P.bind = function () {
    document.body.classList.toggle('standalone', isStandalone() || isDesktop());
    document.body.classList.toggle('desktop-app', isDesktop());

    // Offline support (only works when Work Desk is opened from a web address, not a file)
    if ('serviceWorker' in navigator && isWeb()) {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Offline support unavailable', e));
    }
    // Ask the browser to keep Work Desk's storage even when the disk gets full.
    if (isWeb() && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

    // Install button
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; updateInstallButtons(); });
    window.addEventListener('appinstalled', () => {
      installEvent = null;
      updateInstallButtons();
      Ink.toast('🎉 Work Desk is installed. Find it in your Start menu / home screen.', 6000);
    });
    for (const id of ['#btnInstall', '#libInstall']) $(id).addEventListener('click', install);
    updateInstallButtons();

    // Phone layout: slide-in panels
    $('#btnMenu').addEventListener('click', () => toggle('nav-open'));
    $('#btnDetails').addEventListener('click', () => toggle('details-open'));
    $('#drawerBackdrop').addEventListener('click', closeDrawers);
    $('#chapterList').addEventListener('click', (e) => { if (e.target.closest('.item')) closeDrawers(); });
    $('#noteList').addEventListener('click', (e) => { if (e.target.closest('.item:not(.empty)')) closeDrawers(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawers(); });

    // Backups
    $('#libBackup').addEventListener('click', P.backup);
    $('#libRestore').addEventListener('click', () => $('#backupInput').click());
    $('#backupInput').addEventListener('change', async () => {
      const f = $('#backupInput').files[0];
      $('#backupInput').value = '';
      if (f) P.restoreText(await f.text());
    });
  };

  function toggle(cls) {
    const on = !document.body.classList.contains(cls);
    closeDrawers();
    document.body.classList.toggle(cls, on);
  }
  function closeDrawers() { document.body.classList.remove('nav-open', 'details-open'); }
  P.closeDrawers = closeDrawers;

  function updateInstallButtons() {
    const show = !isStandalone() && !isDesktop();
    for (const id of ['#btnInstall', '#libInstall']) $(id).hidden = !show;
  }

  async function install() {
    if (installEvent) {
      installEvent.prompt();
      const choice = await installEvent.userChoice.catch(() => null);
      if (choice && choice.outcome === 'accepted') installEvent = null;
      updateInstallButtons();
      return;
    }
    let msg;
    if (!isWeb()) {
      msg = 'Work Desk is open from a file on your computer, and browsers only install apps from a web address.\n\n' +
            'Put the Work Desk folder online first (free, about 5 minutes) with GitHub Pages or Netlify. See INSTALL.md in the Work Desk folder. ' +
            'Then open your web address and click Install.';
    } else if (isIOS()) {
      msg = 'To install on iPhone or iPad:\n\n1. Open this page in Safari\n2. Tap the Share button (square with an arrow)\n3. Tap "Add to Home Screen"';
    } else {
      msg = 'To install:\n\n• Edge: click the ⋯ menu → Apps → "Install Work Desk"\n• Chrome: click the install icon at the right end of the address bar, or ⋮ menu → "Cast, save and share" → "Install page as app"\n• Android: ⋮ menu → "Add to Home screen" / "Install app"';
    }
    alert(msg);
  }

  /* ================= Backup & restore the whole library ================= */
  P.backup = function () {
    if (Ink.book()) Ink.saveNow();
    const lib = Ink.state.library;
    const books = [];
    for (const entry of lib.books) {
      if (entry.cloud) continue;               // shared books already live online
      const b = S.loadBook(entry.id);
      if (b) books.push(b);
    }
    if (!books.length) { alert('There are no books on this device to back up (shared books are already saved online).'); return; }
    const data = { app: 'workdesk-backup', version: 1, created: new Date().toISOString(), settings: lib.settings, history: lib.history, books };
    U.download('Work Desk backup ' + U.todayStr() + '.json', JSON.stringify(data), 'application/json');
    Ink.toast('Backup saved: ' + books.length + ' book(s). Keep it somewhere safe (e.g. OneDrive or Google Drive).', 7000);
  };

  P.isBackup = (data) => data && data.app === 'workdesk-backup' && Array.isArray(data.books);

  P.restoreText = function (text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { alert('That file is not a Work Desk backup.'); return; }
    if (!P.isBackup(data)) {
      if (data && Array.isArray(data.chapters)) { alert('That is a single book file. Use "Open book file…" for it.'); return; }
      alert('That file is not a Work Desk backup.');
      return;
    }
    const lib = Ink.state.library;
    const books = data.books.map((b) => S.normalizeBook(b));
    const clashes = books.filter((b) => lib.books.some((x) => x.id === b.id));
    if (!confirm('Restore ' + books.length + ' book(s) from this backup (' + (data.created || '').slice(0, 10) + ')?' +
                 (clashes.length ? '\n\n' + clashes.length + ' of them are already here and will be replaced by the backup version.' : ''))) return;

    if (Ink.book() && books.some((b) => b.id === Ink.book().id)) Ink.closeBook();
    // Is this a fresh install? (only empty books here so far)
    const backupIds = new Set(books.map((b) => b.id));
    const others = lib.books.filter((x) => !x.cloud && !backupIds.has(x.id));
    const fresh = others.every((x) => !x.words);
    if (fresh) {
      for (const x of others) S.deleteBook(x.id);          // drop the empty starter book
      lib.books = lib.books.filter((x) => !others.includes(x));
      if (Ink.book() && others.some((x) => x.id === Ink.book().id)) Ink.closeBook();
    }
    let added = 0;
    for (const b of books) {
      try { S.saveBook(b); } catch (e) { alert('Browser storage is full. Restored ' + added + ' book(s).'); break; }
      const words = b.chapters.reduce((s, ch) => s + U.countWords(U.htmlToPlain(ch.content)), 0);
      const entry = S.indexEntry(b, words);
      const i = lib.books.findIndex((x) => x.id === b.id);
      if (i >= 0) lib.books[i] = entry; else lib.books.push(entry);
      added++;
    }
    // Keep the best word count for each day from both histories.
    if (data.history && typeof data.history === 'object') {
      for (const [k, v] of Object.entries(data.history)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isFinite(Number(v))) lib.history[k] = Math.max(lib.history[k] || 0, Number(v));
      }
    }
    // A brand-new install takes the theme and preferences from the backup.
    if (fresh && data.settings) { lib.settings = S.normalizeSettings(data.settings); Ink.applySettings(); }
    try { S.saveLibrary(lib); } catch (e) { /* ignore */ }
    Ink.showLibrary();
    Ink.toast('Restored ' + added + ' book(s).', 5000);
  };
})(window.Ink);
