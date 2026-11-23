/* Work Desk — Timeline: story events in order, with who/where and which chapter. */
(function (Ink) {
  'use strict';
  const U = Ink.util;
  const { $, h } = U;
  const T = Ink.timeline = {};
  let editingId = null;
  let dragId = null;

  T.bind = function () {
    $('#addEvent').addEventListener('click', () => openDialog(null));
    $('#timelineFilter').addEventListener('change', T.render);
    $('#evCancel').addEventListener('click', () => $('#eventDialog').close());
    $('#evDelete').addEventListener('click', () => {
      const book = Ink.book();
      const ev = book.events.find((x) => x.id === editingId);
      if (!ev || !confirm('Delete the event "' + ev.title + '"?')) return;
      book.events = book.events.filter((x) => x.id !== editingId);
      $('#eventDialog').close();
      Ink.markDirty();
      T.render();
    });
    $('#eventForm').addEventListener('submit', (e) => {
      e.preventDefault();
      saveDialog();
    });
  };

  function nameOf(id) {
    const n = Ink.getNote(id);
    return n ? (n.title || 'Untitled') : '';
  }

  T.render = function () {
    const book = Ink.book();
    const list = $('#timelineList');
    const filter = $('#timelineFilter');

    // Highlight menu: everyone + each character/place
    const keep = filter.value;
    filter.textContent = '';
    filter.append(h('option', { value: '', text: 'Everyone' }));
    for (const n of book.notes.filter((x) => x.type === 'character' || x.type === 'place')) {
      filter.append(h('option', { value: n.id, text: (n.type === 'place' ? '📍 ' : '') + (n.title || 'Untitled') }));
    }
    filter.value = book.notes.some((n) => n.id === keep) ? keep : '';
    const focusId = filter.value;

    list.textContent = '';
    if (!book.events.length) {
      list.append(h('div', { class: 'empty-state' },
        h('p', { text: 'No events yet. Add the big moments of your story (a meeting, a betrayal, a storm) and put them in order.' }),
        h('button', { class: 'btn primary', text: '+ Add first event', onclick: () => openDialog(null) })));
      return;
    }

    book.events.forEach((ev, i) => {
      const dim = focusId && !ev.people.includes(focusId);
      const chapter = ev.chapterId ? Ink.getChapter(ev.chapterId) : null;
      const handle = h('span', { class: 'grip', title: 'Drag to reorder', text: '⠿' });
      const item = h('div', { class: 'tl-item' + (dim ? ' dim' : '') + (focusId && !dim ? ' hl' : ''), dataset: { id: ev.id } },
        h('div', { class: 'tl-when', text: ev.when || '#' + (i + 1) }),
        h('div', { class: 'tl-dot' }),
        h('div', { class: 'tl-card' },
          h('div', { class: 'tl-top' },
            handle,
            h('strong', { class: 'tl-title', text: ev.title }),
            h('button', { class: 'btn small', text: 'Edit', onclick: () => openDialog(ev.id) })),
          ev.description ? h('p', { class: 'tl-desc', text: ev.description }) : null,
          h('div', { class: 'chips' },
            chapter ? h('button', { class: 'chip chapter-chip', text: '📖 ' + (chapter.title || 'Untitled chapter'), onclick: () => Ink.openChapter(chapter.id) }) : null,
            ev.people.map((id) => {
              const n = Ink.getNote(id);
              return h('button', { class: 'chip' + (n && n.type === 'place' ? ' place-chip' : ''),
                                   text: (n && n.type === 'place' ? '📍 ' : '') + nameOf(id), onclick: () => Ink.openNote(id) });
            }))));

      handle.addEventListener('mousedown', () => { item.draggable = true; });
      handle.addEventListener('mouseup', () => { item.draggable = false; });
      item.addEventListener('dragstart', (e) => { dragId = ev.id; item.classList.add('dragging'); e.dataTransfer.setData('text/plain', ev.id); });
      item.addEventListener('dragend', () => { item.draggable = false; dragId = null; T.render(); });
      item.addEventListener('dragover', (e) => {
        if (!dragId || dragId === ev.id) return;
        e.preventDefault();
        const r = item.getBoundingClientRect();
        const after = e.clientY > r.top + r.height / 2;
        item.classList.toggle('drop-after', after);
        item.classList.toggle('drop-before', !after);
      });
      item.addEventListener('dragleave', () => item.classList.remove('drop-after', 'drop-before'));
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!dragId || dragId === ev.id) return;
        const r = item.getBoundingClientRect();
        const after = e.clientY > r.top + r.height / 2;
        const evs = book.events;
        const [moved] = evs.splice(evs.findIndex((x) => x.id === dragId), 1);
        let to = evs.findIndex((x) => x.id === ev.id);
        if (after) to++;
        evs.splice(to, 0, moved);
        dragId = null;
        Ink.markDirty();
        T.render();
      });
      list.append(item);
    });
  };

  function openDialog(id) {
    const book = Ink.book();
    const ev = id ? book.events.find((x) => x.id === id) : null;
    editingId = ev ? ev.id : null;
    $('#eventDlgTitle').textContent = ev ? 'Edit event' : 'New story event';
    $('#evTitle').value = ev ? ev.title : '';
    $('#evWhen').value = ev ? ev.when : '';
    $('#evDesc').value = ev ? ev.description : '';
    $('#evDelete').hidden = !ev;

    const sel = $('#evChapter');
    sel.textContent = '';
    sel.append(h('option', { value: '', text: '(not in a chapter yet)' }));
    book.chapters.forEach((ch, i) => sel.append(h('option', { value: ch.id, text: (i + 1) + '. ' + (ch.title || 'Untitled chapter') })));
    sel.value = ev ? ev.chapterId : '';

    const grid = $('#evPeople');
    grid.textContent = '';
    const options = book.notes.filter((n) => n.type === 'character' || n.type === 'place');
    if (!options.length) {
      grid.append(h('span', { class: 'muted-text', text: 'Add people or places in the Notebook to tag them here.' }));
    }
    for (const n of options) {
      grid.append(h('label', { class: 'check' },
        h('input', { type: 'checkbox', value: n.id, checked: !!(ev && ev.people.includes(n.id)) }),
        ' ' + (n.type === 'place' ? '📍 ' : '') + (n.title || 'Untitled')));
    }
    $('#eventDialog').showModal();
    $('#evTitle').focus();
  }

  function saveDialog() {
    const book = Ink.book();
    const title = $('#evTitle').value.trim();
    if (!title) { $('#evTitle').focus(); return; }
    const data = {
      title,
      when: $('#evWhen').value.trim(),
      description: $('#evDesc').value.trim(),
      chapterId: $('#evChapter').value,
      people: U.$$('#evPeople input:checked').map((i) => i.value)
    };
    if (editingId) Object.assign(book.events.find((x) => x.id === editingId), data);
    else book.events.push({ id: U.uid(), ...data });
    $('#eventDialog').close();
    Ink.markDirty();
    T.render();
  }
})(window.Ink);
