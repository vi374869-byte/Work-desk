/* Work Desk — Corkboard: every chapter as an index card. */
(function (Ink) {
  'use strict';
  const U = Ink.util, C = Ink.C;
  const { $, h, fmt } = U;
  const B = Ink.board = {};
  let dragId = null;

  B.bind = function () { /* nothing global to bind */ };

  B.render = function () {
    const grid = $('#boardGrid');
    const book = Ink.book();
    grid.textContent = '';
    const people = Ink.characters();
    const peopleRes = people.map((p) => ({ p, re: U.mentionRegex(p) })).filter((x) => x.re);

    book.chapters.forEach((ch, i) => {
      const text = Ink.chapterPlain(ch);
      const inChapter = peopleRes.filter((x) => x.re.test(text)).map((x) => x.p);

      const handle = h('span', { class: 'grip', title: 'Drag to reorder', text: '⠿' });
      const title = h('input', { class: 'card-title', value: ch.title, 'aria-label': 'Chapter title' });
      title.addEventListener('input', () => { ch.title = title.value; Ink.renderLists(); Ink.markDirty(); });

      const status = h('select', { class: 'card-status status-text-' + ch.status, 'aria-label': 'Status' },
        C.STATUSES.map((s) => h('option', { value: s, text: C.STATUS_LABELS[s], selected: s === ch.status })));
      status.addEventListener('change', () => {
        ch.status = status.value;
        card.className = 'card status-border-' + ch.status;
        status.className = 'card-status status-text-' + ch.status;
        Ink.renderLists();
        Ink.markDirty();
      });

      const synopsis = h('textarea', { class: 'card-synopsis', rows: 4, placeholder: 'What happens in this chapter?', value: ch.synopsis });
      synopsis.addEventListener('input', () => { ch.synopsis = synopsis.value; Ink.markDirty(); });

      const chips = h('div', { class: 'chips' },
        inChapter.map((p) => h('button', { class: 'chip', text: p.title, title: 'Open ' + p.title, onclick: () => Ink.openNote(p.id) })));

      const card = h('article', { class: 'card status-border-' + ch.status, dataset: { id: ch.id } },
        h('header', { class: 'card-head' }, handle, h('span', { class: 'card-num', text: i + 1 }), title),
        synopsis,
        chips,
        h('footer', { class: 'card-foot' },
          status,
          h('span', { class: 'card-words', text: fmt(Ink.chapterWords(ch)) + ' words' }),
          h('button', { class: 'btn small', text: 'Write ✎', onclick: () => Ink.openChapter(ch.id) })));

      // Only the handle starts a drag, so typing in the card still works normally.
      handle.addEventListener('mousedown', () => { card.draggable = true; });
      handle.addEventListener('mouseup', () => { card.draggable = false; });
      card.addEventListener('dragstart', (e) => {
        dragId = ch.id; card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', ch.id);
      });
      card.addEventListener('dragend', () => { card.draggable = false; dragId = null; B.render(); });
      card.addEventListener('dragover', (e) => {
        if (!dragId || dragId === ch.id) return;
        e.preventDefault();
        const r = card.getBoundingClientRect();
        const after = e.clientX > r.left + r.width / 2;
        card.classList.toggle('drop-after', after);
        card.classList.toggle('drop-before', !after);
      });
      card.addEventListener('dragleave', () => card.classList.remove('drop-after', 'drop-before'));
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!dragId || dragId === ch.id) return;
        const r = card.getBoundingClientRect();
        const id = dragId; dragId = null;
        Ink.moveChapter(id, ch.id, e.clientX > r.left + r.width / 2);
        B.render();
      });
      grid.append(card);
    });

    grid.append(h('button', {
      class: 'card add-card', text: '+ Add chapter',
      onclick: () => {
        const last = book.chapters[book.chapters.length - 1];
        const ch = Ink.addChapter(last && last.id);
        Ink.renderLists();
        B.render();
        const input = grid.querySelector('[data-id="' + CSS.escape(ch.id) + '"] .card-title');
        if (input) { input.focus(); input.select(); }
      }
    }));
  };
})(window.Ink);
