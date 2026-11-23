/* Work Desk — Library: all your books in one place. */
(function (Ink) {
  'use strict';
  const U = Ink.util, S = Ink.store;
  const { $, h, fmt } = U;
  const L = Ink.library = {};

  L.bind = function () {
    $('#libNew').addEventListener('click', () => Ink.createBook());
    $('#libImport').addEventListener('click', () => Ink.openBookFile());
  };

  L.render = function (skipRefresh) {
    if (!skipRefresh && Ink.collab) Ink.collab.refreshLibrary();
    const lib = Ink.state.library;
    const grid = $('#bookGrid');
    grid.textContent = '';
    const books = lib.books.slice().sort((a, b) => b.updated - a.updated);
    const totalWords = books.reduce((s, b) => s + b.words, 0);
    const streak = Ink.habits.streak();
    $('#libSummary').textContent =
      books.length + ' book' + (books.length === 1 ? '' : 's') + ' · ' + fmt(totalWords) + ' words in total · ' +
      'today ' + fmt(Ink.habits.libraryToday()) + ' words' + (streak ? ' · 🔥 ' + streak + '-day streak' : '');

    for (const b of books) {
      const card = h('article', { class: 'book-card' + (b.id === lib.activeId ? ' current' : '') },
        b.thumb ? h('img', { class: 'book-cover', src: b.thumb, alt: '' }) : h('div', { class: 'book-spine' }),
        h('div', { class: 'book-body' },
          h('h3', { class: 'book-title', text: b.title || 'Untitled' }),
          b.cloud ? h('div', { class: 'book-cloud', text: '☁ Shared · ' + ({ owner: 'Owner', editor: 'Editor', commenter: 'Commenter', viewer: 'Reader' }[b.role] || '') }) : null,
          b.author ? h('div', { class: 'book-author', text: 'by ' + b.author }) : null,
          h('div', { class: 'book-meta', text: (b.cloud && !b.words ? '' : fmt(b.words) + ' words · ') + 'edited ' + U.timeAgo(b.updated) }),
          h('div', { class: 'book-actions' },
            h('button', { class: 'btn primary small', text: 'Open', onclick: () => Ink.openBook(b.id) }),
            h('button', { class: 'btn small danger', text: b.cloud && b.role !== 'owner' ? 'Leave' : 'Delete',
                          onclick: (e) => { e.stopPropagation(); (b.cloud ? removeCloudBook : deleteBook)(b); } }))));
      card.addEventListener('dblclick', () => Ink.openBook(b.id));
      grid.append(card);
    }
    grid.append(h('button', { class: 'book-card add-book', onclick: () => Ink.createBook() },
      h('span', { class: 'add-plus', text: '+' }), h('span', { text: 'New book' })));
    Ink.habits.renderLibraryHeatmap();
  };

  async function removeCloudBook(b) {
    const cloud = Ink.cloud;
    try { await cloud.connect(); } catch (e) { alert(e.message); return; }
    if (!cloud.user()) { Ink.collab.open(); return; }
    try {
      if (b.role === 'owner') {
        const typed = prompt('Delete "' + b.title + '" for EVERYONE who shares it? This cannot be undone.\n\nType DELETE to confirm:');
        if (typed === null) return;
        if (typed.trim().toUpperCase() !== 'DELETE') { Ink.toast('Not deleted. Type DELETE to confirm.'); return; }
        await cloud.deleteBook(b.id);
      } else {
        if (!confirm('Leave "' + b.title + '"? You will need a new invite to come back.')) return;
        await cloud.leaveBook(b.id);
      }
      Ink.forgetCloudBook(b.id);
      L.render(true);
      Ink.toast(b.role === 'owner' ? 'Deleted "' + b.title + '".' : 'You left "' + b.title + '".');
    } catch (e) { alert(e.message); }
  }

  function deleteBook(b) {
    const typed = prompt('Delete "' + b.title + '" (' + fmt(b.words) + ' words)? This cannot be undone.\n\n' +
                         'If you want a backup, open it and use File > Save book file first.\n\n' +
                         'Type DELETE to confirm:');
    if (typed === null) return;
    if (typed.trim().toUpperCase() !== 'DELETE') { Ink.toast('Not deleted. Type DELETE to confirm.'); return; }
    const lib = Ink.state.library;
    S.deleteBook(b.id);
    lib.books = lib.books.filter((x) => x.id !== b.id);
    Ink.state.fileHandles.delete(b.id);
    if (Ink.book() && Ink.book().id === b.id) Ink.closeBook();
    if (lib.activeId === b.id) lib.activeId = null;
    try { S.saveLibrary(lib); } catch (e) { console.error(e); }
    L.render();
    Ink.toast('Deleted "' + b.title + '".');
  }
})(window.Ink);
