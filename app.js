/* Work Desk — main app: editor, chapters, notebook, saving, settings, files.
   Loaded last; the feature files (board, timeline, …) plug into the functions exposed on `Ink`. */
(function (Ink) {
  'use strict';
  const U = Ink.util, C = Ink.C, S = Ink.store;
  const { $, h, fmt } = U;

  /* ================= State ================= */
  const st = Ink.state = {
    library: S.loadLibrary(),
    book: null,
    current: { kind: 'chapter', id: null },
    view: 'write',
    noteType: 'idea',
    fileHandles: new Map()   // book id -> file handle (for autosave to a real file)
  };
  Ink.book = () => st.book;
  Ink.characters = () => (st.book ? st.book.notes.filter((n) => n.type === 'character') : []);

  const el = {
    projectTitle: $('#projectTitle'), saveStatus: $('#saveStatus'),
    chapterList: $('#chapterList'), noteList: $('#noteList'), noteTabs: $('#noteTabs'), addNote: $('#addNote'),
    chapterView: $('#chapterView'), noteView: $('#noteView'),
    boardView: $('#boardView'), timelineView: $('#timelineView'), mapView: $('#mapView'),
    chapterTitle: $('#chapterTitle'), editor: $('#editor'), toolbar: $('#toolbar'),
    noteKind: $('#noteKind'), noteTitle: $('#noteTitle'), noteBody: $('#noteBody'), appearsIn: $('#appearsIn'),
    chapterDetails: $('#chapterDetails'), chapterStatus: $('#chapterStatus'), chapterSynopsis: $('#chapterSynopsis'),
    statChapter: $('#statChapter'), statTotal: $('#statTotal'), statChapters: $('#statChapters'),
    statToday: $('#statToday'), goalFill: $('#goalFill'), goalLabel: $('#goalLabel'),
    sbChapter: $('#sbChapter'), sbTotal: $('#sbTotal'), sbToday: $('#sbToday'), sbFile: $('#sbFile'),
    fileMenu: $('#fileMenu'), fileInput: $('#fileInput'), settingsDialog: $('#settingsDialog'),
    libraryScreen: $('#libraryScreen'), workspace: $('#workspace'), main: $('#main'), toast: $('#toast')
  };

  /* ================= Word counts (cached) ================= */
  const plainCache = new Map();
  Ink.chapterPlain = function (ch) {
    const c = plainCache.get(ch.id);
    if (c && c.html === ch.content) return c.text;
    const text = U.htmlToPlain(ch.content);
    plainCache.set(ch.id, { html: ch.content, text, words: U.countWords(text) });
    return text;
  };
  Ink.chapterWords = (ch) => { Ink.chapterPlain(ch); return plainCache.get(ch.id).words; };
  Ink.totalWords = () => (st.book ? st.book.chapters.reduce((s, ch) => s + Ink.chapterWords(ch), 0) : 0);

  const getChapter = (id) => st.book && st.book.chapters.find((c) => c.id === id);
  const getNote = (id) => st.book && st.book.notes.find((n) => n.id === id);
  Ink.getChapter = getChapter;
  Ink.getNote = getNote;

  function rollDaily(total) {
    if (st.book.daily.date !== U.todayStr()) st.book.daily = { date: U.todayStr(), startWords: total };
  }

  /* ================= Toast ================= */
  let toastTimer;
  Ink.toast = function (msg, ms) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, ms || 3500);
  };

  /* ================= Saving ================= */
  const setStatus = (t) => { el.saveStatus.textContent = t; };
  const scheduleSave = U.debounce(() => Ink.saveNow(), 700);
  Ink.markDirty = function () { setStatus('Saving…'); scheduleSave(); if (Ink.cloud) Ink.cloud.onDirty(); };
  /* Save the local copy only (used when changes arrive from collaborators). */
  Ink.saveLocalOnly = U.debounce(() => Ink.saveNow(), 800);

  let quotaWarned = false;
  Ink.saveNow = function () {
    if (!st.book) { try { S.saveLibrary(st.library); } catch (e) { /* ignore */ } return; }
    const book = st.book;
    book.updated = Date.now();
    let ok = true;
    try { S.saveBook(book); } catch (e) {
      ok = false;
      console.error(e);
      setStatus('⚠ Browser storage full');
      if (!quotaWarned) {
        quotaWarned = true;
        alert('Your browser storage is full, so the latest changes could not be saved here.\n\n' +
              'Use File > Save book file to save to your computer, and delete old snapshots to free space.');
      }
    }
    const entry = st.library.books.find((b) => b.id === book.id);
    if (entry) {
      entry.title = book.title; entry.author = book.author; entry.updated = book.updated;
      entry.words = Ink.totalWords(); entry.thumb = book.coverThumb || '';
    }
    try { S.saveLibrary(st.library); } catch (e) { console.error(e); }
    if (ok) setStatus('Saved ✓');
    const handle = st.fileHandles.get(book.id);
    if (handle) writeFileQueued(book, handle);
  };

  let fileWriting = false, fileWritePending = null;
  async function writeFileQueued(book, handle) {
    if (fileWriting) { fileWritePending = [book, handle]; return; }
    fileWriting = true;
    try { await writeToHandle(handle, JSON.stringify(book, null, 2)); }
    catch (e) { console.error(e); setStatus('Saved in browser · ⚠ file write failed'); }
    fileWriting = false;
    if (fileWritePending) { const next = fileWritePending; fileWritePending = null; writeFileQueued(...next); }
  }
  async function writeToHandle(handle, text) {
    const w = await handle.createWritable();
    await w.write(text);
    await w.close();
  }
  function updateFileLabel() {
    const handle = st.book && st.fileHandles.get(st.book.id);
    el.sbFile.textContent = handle
      ? 'Linked to ' + handle.name + ' (autosaves)'
      : 'Saved in this browser · File > Save book file to keep a copy';
  }

  /* ================= Theme / settings ================= */
  function luminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  }
  Ink.applySettings = () => applySettings();
  function applySettings() {
    const s = st.library.settings, root = document.documentElement.style;
    root.setProperty('--bg', s.colors.bg);
    root.setProperty('--page', s.colors.page);
    root.setProperty('--text', s.colors.text);
    root.setProperty('--accent', s.colors.accent);
    root.setProperty('--editor-font', C.FONTS[s.font]);
    root.setProperty('--editor-size', s.size + 'px');
    root.setProperty('--page-width', s.width + 'ch');
    root.colorScheme = luminance(s.colors.bg) < 0.5 ? 'dark' : 'light';
  }
  function fillSettingsForm() {
    const s = st.library.settings;
    $('#setAuthor').value = st.book ? st.book.author : '';
    $('#setAuthor').disabled = !st.book;
    $('#setFont').value = s.font;
    $('#setSize').value = s.size; $('#setSizeVal').textContent = s.size + 'px';
    $('#setWidth').value = s.width; $('#setWidthVal').textContent = s.width + ' characters';
    $('#setGoal').value = s.goal;
    $('#colBg').value = s.colors.bg; $('#colPage').value = s.colors.page;
    $('#colText').value = s.colors.text; $('#colAccent').value = s.colors.accent;
  }
  function bindSettings() {
    const changed = () => { applySettings(); Ink.markDirty(); };
    $('#btnSettings').addEventListener('click', () => { fillSettingsForm(); el.settingsDialog.showModal(); });
    $('#setAuthor').addEventListener('input', (e) => { if (st.book) { st.book.author = e.target.value; Ink.markDirty(); } });
    $('#setFont').addEventListener('change', (e) => { st.library.settings.font = e.target.value; changed(); });
    $('#setSize').addEventListener('input', (e) => {
      st.library.settings.size = Number(e.target.value); $('#setSizeVal').textContent = e.target.value + 'px'; changed();
    });
    $('#setWidth').addEventListener('input', (e) => {
      st.library.settings.width = Number(e.target.value); $('#setWidthVal').textContent = e.target.value + ' characters'; changed();
    });
    $('#setGoal').addEventListener('input', (e) => {
      st.library.settings.goal = U.clampNum(e.target.value, 0, 100000, 0); Ink.updateStats(); Ink.markDirty();
    });
    const colorMap = { colBg: 'bg', colPage: 'page', colText: 'text', colAccent: 'accent' };
    Object.entries(colorMap).forEach(([id, key]) => {
      $('#' + id).addEventListener('input', (e) => { st.library.settings.colors[key] = e.target.value; changed(); });
    });
    $('#presets').addEventListener('click', (e) => {
      const name = e.target.dataset && e.target.dataset.preset;
      if (!name || !C.PRESETS[name]) return;
      st.library.settings.colors = { ...C.PRESETS[name] };
      fillSettingsForm(); changed();
    });
  }

  /* ================= Views ================= */
  function showPanes() {
    const v = st.view, k = st.current.kind;
    document.body.dataset.view = v;
    el.chapterView.hidden = !(v === 'write' && k === 'chapter');
    el.noteView.hidden = !(v === 'write' && k === 'note');
    el.boardView.hidden = v !== 'board';
    el.timelineView.hidden = v !== 'timeline';
    el.mapView.hidden = v !== 'map';
    el.chapterDetails.hidden = !(v === 'write' && k === 'chapter');
    for (const b of U.$$('#viewSwitch button')) b.classList.toggle('active', b.dataset.view === v);
  }

  Ink.setView = function (v) {
    if (v === 'write') {
      if (st.current.kind === 'note' && getNote(st.current.id)) Ink.openNote(st.current.id);
      else Ink.openChapter(st.current.id);
      return;
    }
    setFocus(false);
    st.view = v;
    showPanes();
    renderLists();
    el.main.scrollTop = 0;
    if (v === 'board') Ink.board.render();
    if (v === 'timeline') Ink.timeline.render();
    if (v === 'map') Ink.charmap.render();
  };

  Ink.refreshView = function () {
    if (st.view === 'board') Ink.board.render();
    if (st.view === 'timeline') Ink.timeline.render();
    if (st.view === 'map') Ink.charmap.render();
  };

  /* ================= Sidebar lists ================= */
  let dragId = null;
  const isAfter = (e, node) => { const r = node.getBoundingClientRect(); return e.clientY > r.top + r.height / 2; };

  Ink.moveChapter = function (fromId, toId, after) {
    if (!Ink.cloud.canEdit()) return;
    const chs = st.book.chapters;
    const from = chs.findIndex((c) => c.id === fromId);
    if (from < 0 || fromId === toId) return;
    const [moved] = chs.splice(from, 1);
    let to = chs.findIndex((c) => c.id === toId);
    if (to < 0) to = chs.length; else if (after) to++;
    chs.splice(to, 0, moved);
    renderLists();
    Ink.markDirty();
  };

  function renderChapters() {
    el.chapterList.textContent = '';
    st.book.chapters.forEach((ch, i) => {
      const active = st.view === 'write' && st.current.kind === 'chapter' && st.current.id === ch.id;
      const li = h('li', { class: 'item' + (active ? ' active' : ''), draggable: 'true', dataset: { id: ch.id }, title: ch.synopsis || ch.title },
        h('span', { class: 'num', text: i + 1 }),
        h('span', { class: 'status-dot status-' + ch.status, title: C.STATUS_LABELS[ch.status] }),
        h('span', { class: 'name', text: ch.title || 'Untitled chapter' }),
        h('span', { class: 'meta', text: fmt(Ink.chapterWords(ch)) }));
      li.addEventListener('click', () => Ink.openChapter(ch.id));
      li.addEventListener('dragstart', (e) => {
        dragId = ch.id; li.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', ch.id);
      });
      li.addEventListener('dragend', () => { dragId = null; renderChapters(); });
      li.addEventListener('dragover', (e) => {
        if (!dragId || dragId === ch.id) return;
        e.preventDefault();
        const after = isAfter(e, li);
        li.classList.toggle('drop-after', after);
        li.classList.toggle('drop-before', !after);
      });
      li.addEventListener('dragleave', () => li.classList.remove('drop-after', 'drop-before'));
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!dragId || dragId === ch.id) return;
        const id = dragId; dragId = null;
        Ink.moveChapter(id, ch.id, isAfter(e, li));
        if (st.view === 'board') Ink.board.render();
      });
      el.chapterList.append(li);
    });
  }

  function renderNotes() {
    el.noteList.textContent = '';
    for (const btn of el.noteTabs.querySelectorAll('button')) btn.classList.toggle('active', btn.dataset.type === st.noteType);
    el.addNote.textContent = C.NOTE_TYPES[st.noteType].add;
    const notes = st.book.notes.filter((n) => n.type === st.noteType);
    if (!notes.length) { el.noteList.append(h('li', { class: 'item empty', text: 'Nothing here yet.' })); return; }
    for (const n of notes) {
      const active = st.view === 'write' && st.current.kind === 'note' && st.current.id === n.id;
      const li = h('li', { class: 'item' + (active ? ' active' : ''), dataset: { id: n.id } },
        h('span', { class: 'name', text: n.title || 'Untitled' }));
      li.addEventListener('click', () => Ink.openNote(n.id));
      el.noteList.append(li);
    }
  }
  function renderLists() { if (st.book) { renderChapters(); renderNotes(); } }
  Ink.renderLists = renderLists;

  /* ================= Opening chapters & notes ================= */
  Ink.openChapter = function (id) {
    let ch = getChapter(id);
    if (!ch) ch = st.book.chapters[0];
    st.current = { kind: 'chapter', id: ch.id };
    st.view = 'write';
    showPanes();
    el.chapterTitle.value = ch.title;
    el.editor.innerHTML = ch.content;
    el.chapterStatus.value = ch.status;
    el.chapterSynopsis.value = ch.synopsis;
    updateEmptyState();
    renderLists();
    Ink.updateStats();
    Ink.snapshots.render();
    el.main.scrollTop = 0;
    Ink.comments.render();
    Ink.stickies.render();
  };

  /* Re-load the open chapter (after find & replace or a restore). */
  Ink.reloadEditor = function () {
    if (st.view === 'write' && st.current.kind === 'chapter') {
      const ch = getChapter(st.current.id);
      if (ch) { el.editor.innerHTML = ch.content; el.chapterTitle.value = ch.title; updateEmptyState(); Ink.comments.render(); }
    }
  };

  Ink.openNote = function (id) {
    const n = getNote(id);
    if (!n) return;
    st.current = { kind: 'note', id };
    st.view = 'write';
    st.noteType = n.type;
    showPanes();
    el.noteKind.textContent = C.NOTE_TYPES[n.type].label;
    el.noteTitle.value = n.title;
    el.noteTitle.placeholder = n.type === 'character' ? 'Name' : 'Title';
    el.noteBody.value = n.body;
    el.noteBody.placeholder = C.NOTE_TYPES[n.type].placeholder;
    renderAppearsIn(n);
    renderLists();
    Ink.updateStats();
    el.main.scrollTop = 0;
  };

  /* Chapters that mention a character or place. */
  Ink.mentionsOf = function (note) {
    const re = U.mentionRegex(note);
    if (!re) return null;
    return st.book.chapters.filter((ch) => re.test(Ink.chapterPlain(ch)));
  };

  function renderAppearsIn(n) {
    const box = el.appearsIn;
    if (n.type !== 'character' && n.type !== 'place') { box.hidden = true; return; }
    box.hidden = false;
    box.textContent = '';
    const hits = Ink.mentionsOf(n);
    if (hits === null) { box.textContent = 'Give it a name to see which chapters mention it.'; return; }
    if (!hits.length) { box.textContent = 'Not mentioned in any chapter yet.'; return; }
    box.append('Appears in: ');
    for (const ch of hits) box.append(h('a', { text: ch.title || 'Untitled chapter', onclick: () => Ink.openChapter(ch.id) }));
  }
  const renderAppearsInSoon = U.debounce(renderAppearsIn, 300);

  /* ================= Stats ================= */
  Ink.updateStats = function () {
    if (!st.book) return;
    const total = Ink.totalWords();
    rollDaily(total);
    const today = U.todayStr();
    const bookToday = Math.max(0, total - st.book.daily.startWords);
    const entry = st.library.books.find((b) => b.id === st.book.id);
    if (entry) { entry.words = total; entry.today = { date: today, words: bookToday }; }
    const allToday = Ink.habits.libraryToday();
    if (allToday > 0 || st.library.history[today] != null) st.library.history[today] = allToday;

    const goal = st.library.settings.goal;
    const ch = st.view === 'write' && st.current.kind === 'chapter' ? getChapter(st.current.id) : null;
    const chWords = ch ? Ink.chapterWords(ch) : 0;

    el.statChapter.textContent = fmt(chWords);
    el.statTotal.textContent = fmt(total);
    el.statChapters.textContent = st.book.chapters.length;
    el.statToday.textContent = fmt(allToday);
    const pct = goal > 0 ? Math.min(100, (allToday / goal) * 100) : 0;
    el.goalFill.style.width = pct + '%';
    el.goalFill.classList.toggle('met', goal > 0 && allToday >= goal);
    el.goalLabel.textContent = goal > 0
      ? (allToday >= goal ? '🎉 Daily goal reached (' + fmt(goal) + ' words)' : 'Daily goal: ' + fmt(goal) + ' words')
      : 'No daily goal set';

    el.sbChapter.textContent = ch ? fmt(chWords) + ' words in chapter' : '';
    el.sbTotal.textContent = fmt(total) + ' words in book';
    el.sbToday.textContent = 'Today ' + fmt(allToday) + (goal > 0 ? ' / ' + fmt(goal) : '');
    if (ch) {
      const meta = el.chapterList.querySelector('[data-id="' + CSS.escape(ch.id) + '"] .meta');
      if (meta) meta.textContent = fmt(chWords);
    }
    Ink.habits.render();
  };
  const updateStatsSoon = U.debounce(() => Ink.updateStats(), 250);

  function updateEmptyState() {
    el.editor.classList.toggle('is-empty', el.editor.textContent.trim() === '' && !el.editor.querySelector('hr,li'));
  }

  /* ================= Editor ================= */
  function bindEditor() {
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* ignore */ }

    // Typing always happens inside a <p>, so paragraph spacing stays consistent.
    const ensureParagraph = () => {
      const html = el.editor.innerHTML.trim();
      if (html === '' || html === '<br>') {
        el.editor.innerHTML = '<p><br></p>';
        const r = document.createRange();
        r.setStart(el.editor.firstChild, 0);
        r.collapse(true);
        const sel = document.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      }
    };
    el.editor.addEventListener('focus', ensureParagraph);
    el.editor.addEventListener('beforeinput', ensureParagraph);

    el.editor.addEventListener('input', () => {
      const ch = getChapter(st.current.id);
      if (!ch) return;
      ch.content = el.editor.innerHTML;
      Ink.cloud.noteLocalInput();
      updateEmptyState();
      updateStatsSoon();
      Ink.comments.onInput();
      Ink.markDirty();
    });

    // Paste as clean text (no fonts/colours from Word or websites), keeping paragraphs.
    el.editor.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      if (!text) return;
      const paras = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/);
      if (paras.length === 1) document.execCommand('insertText', false, text);
      else document.execCommand('insertHTML', false,
        paras.map((p) => '<p>' + U.escapeHtml(p.trim()).replace(/\n/g, '<br>') + '</p>').join(''));
    });

    el.toolbar.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
    el.toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn || !(btn.dataset.cmd || btn.dataset.block)) return;   // comment/sticky buttons handle themselves
      if (!el.editor.contains(document.getSelection().anchorNode)) el.editor.focus();
      if (btn.dataset.cmd) {
        document.execCommand(btn.dataset.cmd, false, null);
      } else if (btn.dataset.block) {
        const tag = btn.dataset.block;
        const cur = String(document.queryCommandValue('formatBlock') || '').toLowerCase();
        document.execCommand('formatBlock', false, '<' + ((cur === tag && tag !== 'p') ? 'p' : tag) + '>');
      }
      updateToolbarState();
    });
    document.addEventListener('selectionchange', () => {
      if (el.editor.contains(document.getSelection().anchorNode)) updateToolbarState();
    });

    el.chapterTitle.addEventListener('input', () => {
      const ch = getChapter(st.current.id);
      if (!ch) return;
      ch.title = el.chapterTitle.value;
      const name = el.chapterList.querySelector('[data-id="' + CSS.escape(ch.id) + '"] .name');
      if (name) name.textContent = ch.title || 'Untitled chapter';
      Ink.markDirty();
    });
    el.chapterTitle.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.editor.focus(); } });

    el.chapterStatus.addEventListener('change', () => {
      const ch = getChapter(st.current.id);
      if (!ch) return;
      ch.status = el.chapterStatus.value;
      renderChapters();
      Ink.markDirty();
    });
    el.chapterSynopsis.addEventListener('input', () => {
      const ch = getChapter(st.current.id);
      if (!ch) return;
      ch.synopsis = el.chapterSynopsis.value;
      Ink.markDirty();
    });
  }

  function updateToolbarState() {
    for (const btn of el.toolbar.querySelectorAll('[data-cmd="bold"],[data-cmd="italic"],[data-cmd="underline"]')) {
      let on = false;
      try { on = document.queryCommandState(btn.dataset.cmd); } catch (e) { /* ignore */ }
      btn.classList.toggle('on', on);
    }
  }

  /* ================= Add / delete ================= */
  Ink.addChapter = function (afterId) {
    const chs = st.book.chapters;
    const ch = S.newChapter('Chapter ' + (chs.length + 1));
    const refId = afterId || (st.current.kind === 'chapter' ? st.current.id : null);
    const idx = refId ? chs.findIndex((c) => c.id === refId) : -1;
    chs.splice(idx >= 0 ? idx + 1 : chs.length, 0, ch);
    chs.forEach((c, i) => { if (/^Chapter \d+$/.test(c.title)) c.title = 'Chapter ' + (i + 1); });
    Ink.markDirty();
    return ch;
  };

  function deleteChapter() {
    const ch = getChapter(st.current.id);
    if (!ch) return;
    if (st.book.chapters.length === 1) { alert('A book needs at least one chapter.'); return; }
    const words = Ink.chapterWords(ch);
    const snaps = st.book.snapshots.filter((s) => s.chapterId === ch.id).length;
    if (!confirm('Delete "' + (ch.title || 'Untitled chapter') + '"' + (words ? ' (' + fmt(words) + ' words)' : '') +
                 (snaps ? ' and its ' + snaps + ' snapshot(s)' : '') + '? This cannot be undone.')) return;
    const idx = st.book.chapters.indexOf(ch);
    st.book.chapters.splice(idx, 1);
    st.book.snapshots = st.book.snapshots.filter((s) => s.chapterId !== ch.id);
    st.book.events.forEach((ev) => { if (ev.chapterId === ch.id) ev.chapterId = ''; });
    plainCache.delete(ch.id);
    Ink.openChapter(st.book.chapters[Math.max(0, idx - 1)].id);
    Ink.markDirty();
  }

  Ink.addNote = function (type) {
    const t = C.NOTE_TYPES[type];
    const n = { id: U.uid(), type, title: t.name, body: t.template };
    st.book.notes.push(n);
    st.noteType = type;
    Ink.openNote(n.id);
    el.noteTitle.focus();
    el.noteTitle.select();
    Ink.markDirty();
    return n;
  };

  function deleteNote() {
    const n = getNote(st.current.id);
    if (!n) return;
    const rels = st.book.relations.filter((r) => r.from === n.id || r.to === n.id).length;
    if (!confirm('Delete "' + (n.title || 'Untitled') + '"' + (rels ? ' and its ' + rels + ' relationship(s) on the map' : '') +
                 '? This cannot be undone.')) return;
    st.book.notes = st.book.notes.filter((x) => x.id !== n.id);
    st.book.relations = st.book.relations.filter((r) => r.from !== n.id && r.to !== n.id);
    st.book.events.forEach((ev) => { ev.people = ev.people.filter((id) => id !== n.id); });
    Ink.openChapter(st.book.chapters[0].id);
    Ink.markDirty();
  }

  function bindLists() {
    $('#addChapter').addEventListener('click', () => {
      const ch = Ink.addChapter();
      Ink.openChapter(ch.id);
      el.chapterTitle.focus();
      el.chapterTitle.select();
    });
    $('#deleteChapter').addEventListener('click', deleteChapter);
    el.addNote.addEventListener('click', () => Ink.addNote(st.noteType));
    $('#deleteNote').addEventListener('click', deleteNote);
    el.noteTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      st.noteType = btn.dataset.type;
      renderNotes();
    });
    el.noteTitle.addEventListener('input', () => {
      const n = getNote(st.current.id);
      if (!n) return;
      n.title = el.noteTitle.value;
      const name = el.noteList.querySelector('[data-id="' + CSS.escape(n.id) + '"] .name');
      if (name) name.textContent = n.title || 'Untitled';
      renderAppearsInSoon(n);
      Ink.markDirty();
    });
    el.noteBody.addEventListener('input', () => {
      const n = getNote(st.current.id);
      if (!n) return;
      n.body = el.noteBody.value;
      Ink.markDirty();
    });
    el.projectTitle.addEventListener('input', () => {
      st.book.title = el.projectTitle.value;
      document.title = (st.book.title || 'Untitled') + ' — Work Desk';
      Ink.markDirty();
    });
  }

  /* ================= Books & library ================= */
  Ink.openBook = function (id) {
    if (st.book && st.book.id !== id) Ink.saveNow();
    // Leave a shared book cleanly (send any last changes) before opening another.
    if (Ink.cloud.active()) return Ink.cloud.closeBook().then(() => Ink.openBook(id));
    const entry = st.library.books.find((b) => b.id === id);
    if (entry && entry.cloud) return openCloudBook(entry);
    const book = S.loadBook(id);
    if (!book) {
      alert('That book could not be found in this browser.');
      st.library.books = st.library.books.filter((b) => b.id !== id);
      Ink.showLibrary();
      return;
    }
    showBook(book);
  };

  async function openCloudBook(entry) {
    try { await Ink.cloud.connect(); } catch (e) { alert(e.message); Ink.showLibrary(); return; }
    if (!Ink.cloud.user()) {
      Ink.showLibrary();
      Ink.collab.open({ afterSignIn: () => Ink.openBook(entry.id) });
      return;
    }
    Ink.collab.loading('Opening "' + entry.title + '"…');
    let res;
    try { res = await Ink.cloud.openBook(entry.id, entry.role); }
    catch (e) { Ink.collab.loading(null); alert('Could not open the shared book: ' + e.message); Ink.showLibrary(); return; }
    Ink.collab.loading(null);
    if (!res) return;
    showBook(res.book);
    res.afterOpen();
    Ink.collab.bookOpened();
  }

  /* Swap in a fresh copy of the open shared book (after reconnecting), keeping your place. */
  Ink.replaceBookFromCloud = function (book) {
    st.book = book;
    plainCache.clear();
    el.projectTitle.value = book.title;
    if (st.current.kind === 'note' && getNote(st.current.id) && st.view === 'write') Ink.openNote(st.current.id);
    else if (st.view === 'write') Ink.openChapter(getChapter(st.current.id) ? st.current.id : book.chapters[0].id);
    else { renderLists(); Ink.refreshView(); }
    Ink.saveNow();
  };

  /* Remove a shared book you no longer have access to. */
  Ink.forgetCloudBook = function (id) {
    st.library.books = st.library.books.filter((b) => b.id !== id);
    S.deleteBook(id);
    if (st.book && st.book.id === id) { Ink.cloud.closeBook(); Ink.closeBook(); Ink.showLibrary(); }
    try { S.saveLibrary(st.library); } catch (e) { /* ignore */ }
  };

  function showBook(book) {
    st.book = book;
    st.library.activeId = book.id;
    plainCache.clear();
    rollDaily(Ink.totalWords());
    document.body.classList.remove('in-library');
    el.libraryScreen.hidden = true;
    el.workspace.hidden = false;
    el.projectTitle.value = book.title;
    document.title = book.title + ' — Work Desk';
    st.noteType = 'idea';
    Ink.habits.onBookSwitch();
    updateFileLabel();
    Ink.openChapter(book.chapters[0].id);
    Ink.collab.applyRole();
    Ink.saveNow();
  }

  Ink.createBook = function () {
    const book = S.newBook();
    try { S.saveBook(book); } catch (e) { alert('Browser storage is full. Free some space first.'); return; }
    st.library.books.unshift(S.indexEntry(book, 0));
    Ink.openBook(book.id);
    el.projectTitle.focus();
    el.projectTitle.select();
  };

  /* Add a ready-made book (e.g. from a text import) to the library and open it. */
  Ink.addBook = function (book) {
    try { S.saveBook(book); } catch (e) { alert('Browser storage is full, so the book could not be added.'); return false; }
    st.library.books.unshift(S.indexEntry(book, 0));
    Ink.openBook(book.id);
    return true;
  };

  Ink.showLibrary = function () {
    if (st.book) { Ink.updateStats(); Ink.saveNow(); }
    if (Ink.cloud.active()) Ink.cloud.closeBook();
    setFocus(false);
    document.body.classList.add('in-library');
    el.libraryScreen.hidden = false;
    el.workspace.hidden = true;
    document.title = 'Library — Work Desk';
    Ink.library.render();
  };

  /* Called by the library when the open book is deleted. */
  Ink.closeBook = function () {
    st.book = null;
    st.library.activeId = null;
    Ink.habits.onBookSwitch();
  };

  /* ================= Files: open / save / export ================= */
  const FILE_TYPES = [{ description: 'Work Desk book', accept: { 'application/json': ['.json'] } }];

  async function saveBookFile(saveAs) {
    if (!st.book) return;
    Ink.saveNow();
    const data = JSON.stringify(st.book, null, 2);
    if ('showSaveFilePicker' in window) {
      try {
        let handle = st.fileHandles.get(st.book.id);
        if (!handle || saveAs) {
          handle = await window.showSaveFilePicker({ suggestedName: U.safeFileName(st.book.title) + '.workdesk.json', types: FILE_TYPES });
          st.fileHandles.set(st.book.id, handle);
        }
        await writeToHandle(handle, data);
        setStatus('Saved to ' + handle.name + ' ✓');
        updateFileLabel();
      } catch (e) {
        if (e.name !== 'AbortError') { console.error(e); alert('Could not save the file: ' + e.message); }
      }
    } else {
      U.download(U.safeFileName(st.book.title) + '.workdesk.json', data, 'application/json');
    }
  }

  Ink.openBookFile = async function () {
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await window.showOpenFilePicker({ types: FILE_TYPES, multiple: false });
        const file = await handle.getFile();
        importBookText(await file.text(), handle);
      } catch (e) {
        if (e.name !== 'AbortError') { console.error(e); alert('Could not open the file: ' + e.message); }
      }
    } else {
      el.fileInput.value = '';
      el.fileInput.click();
    }
  };

  function importBookText(text, handle) {
    let data;
    try { data = JSON.parse(text); } catch (e) { alert('That file is not a Work Desk book.'); return false; }
    if (Ink.pwa.isBackup(data)) { Ink.pwa.restoreText(text); return false; }
    if (!data || !Array.isArray(data.chapters)) { alert('That file is not a Work Desk book.'); return false; }
    const book = S.normalizeBook(data);
    const existing = st.library.books.find((b) => b.id === book.id);
    if (existing && !confirm('"' + existing.title + '" is already in your library.\n\nReplace the library copy with the version in this file?')) return false;

    if (st.book) {
      if (st.book.id === book.id) st.book = null;   // discard the in-memory copy we are replacing
      else Ink.saveNow();
    }
    try { S.saveBook(book); } catch (e) { alert('Browser storage is full, so the book could not be added.'); return false; }
    if (existing) Object.assign(existing, S.indexEntry(book, 0));
    else st.library.books.unshift(S.indexEntry(book, 0));
    if (handle) st.fileHandles.set(book.id, handle); else st.fileHandles.delete(book.id);
    Ink.openBook(book.id);
    Ink.toast('Opened "' + book.title + '"');
    return true;
  }

  function exportTxt() {
    const b = st.book;
    let out = b.title + (b.author ? '\nby ' + b.author : '') + '\n\n\n';
    out += b.chapters.map((ch) => ch.title + '\n\n' + U.htmlToPlain(U.sanitizeHtml(ch.content))).join('\n\n\n');
    U.download(U.safeFileName(b.title) + '.txt', out.replace(/\n/g, '\r\n'), 'text/plain');
  }
  function exportMd() {
    const b = st.book;
    let out = '# ' + b.title + '\n\n' + (b.author ? '*by ' + b.author + '*\n\n' : '');
    out += b.chapters.map((ch) => '## ' + ch.title + '\n\n' + U.htmlToMarkdown(U.sanitizeHtml(ch.content))).join('\n\n');
    U.download(U.safeFileName(b.title) + '.md', out + '\n', 'text/markdown');
  }
  function manuscriptHtml() {
    const b = st.book;
    const t = U.escapeHtml(b.title), a = U.escapeHtml(b.author);
    const chapters = b.chapters.map((ch) =>
      '<section class="chapter"><h2>' + U.escapeHtml(ch.title) + '</h2>' + U.sanitizeHtml(ch.content) + '</section>').join('\n');
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + t + '</title><style>' +
      'body{font-family:Georgia,"Times New Roman",serif;font-size:12pt;line-height:1.7;max-width:36em;margin:3em auto;padding:0 1em;color:#111}' +
      '.title-page{text-align:center;padding-top:30vh}.title-page h1{font-size:28pt;margin:0 0 .4em}.title-page p{font-size:14pt}' +
      '.chapter{break-before:page;page-break-before:always;padding-top:3em}.chapter h2{text-align:center;font-size:18pt;margin-bottom:2em}' +
      'p{margin:0;text-indent:1.5em}h2+p,hr+p,blockquote+p,.chapter>p:first-of-type{text-indent:0}' +
      'blockquote{margin:1em 2em;font-style:italic}blockquote p{text-indent:0}' +
      'hr{border:0;text-align:center;margin:1.4em 0}hr::after{content:"* * *";letter-spacing:.5em}@page{margin:2.5cm}' +
      '.cover{text-align:center;break-after:page;page-break-after:always}.cover img{max-width:100%;max-height:92vh}' +
      '</style></head><body>' + (U.isImageData(b.cover) ? '<div class="cover"><img src="' + b.cover + '" alt="Cover"></div>' : '') +
      '<div class="title-page"><h1>' + t + '</h1>' + (a ? '<p>by ' + a + '</p>' : '') + '</div>' +
      chapters + '</body></html>';
  }
  function exportHtml() { U.download(U.safeFileName(st.book.title) + '.html', manuscriptHtml(), 'text/html'); }
  function printManuscript() {
    const frame = h('iframe', { style: 'position:fixed;right:0;bottom:0;width:0;height:0;border:0' });
    document.body.append(frame);
    frame.onload = () => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(() => frame.remove(), 1000);
    };
    frame.srcdoc = manuscriptHtml();
  }

  function bindFileMenu() {
    $('#btnFile').addEventListener('click', (e) => { e.stopPropagation(); el.fileMenu.hidden = !el.fileMenu.hidden; });
    document.addEventListener('click', (e) => { if (!e.target.closest('.menu')) el.fileMenu.hidden = true; });
    el.fileMenu.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      el.fileMenu.hidden = true;
      const needsBook = ['cover', 'save', 'saveAs', 'exportTxt', 'exportMd', 'exportHtml', 'print'];
      if (needsBook.includes(btn.dataset.action) && !st.book) { alert('Open a book first.'); return; }
      const actions = {
        library: Ink.showLibrary, newBook: Ink.createBook,
        open: Ink.openBookFile, save: () => saveBookFile(false), saveAs: () => saveBookFile(true),
        exportTxt, exportMd, exportHtml, print: printManuscript,
        cover: () => Ink.cover.open(), importText: () => Ink.importer.pick(),
        backup: Ink.pwa.backup, restore: () => $('#backupInput').click()
      };
      if (actions[btn.dataset.action]) actions[btn.dataset.action]();
    });
    el.fileInput.addEventListener('change', async () => {
      const file = el.fileInput.files[0];
      if (file) importBookText(await file.text(), null);
    });
  }

  /* ================= Focus mode & shortcuts ================= */
  function setFocus(on) {
    document.body.classList.toggle('focus', on);
    if (on && st.current.kind === 'chapter') el.editor.focus();
  }

  function bindGlobal() {
    $('#btnLibrary').addEventListener('click', Ink.showLibrary);
    $('#btnFocus').addEventListener('click', () => { if (st.view !== 'write') Ink.setView('write'); setFocus(true); });
    $('#exitFocus').addEventListener('click', () => setFocus(false));
    $('#viewSwitch').addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (btn) Ink.setView(btn.dataset.view);
    });
    document.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 's') { e.preventDefault(); saveBookFile(e.shiftKey); }
      else if (mod && ((e.shiftKey && key === 'f') || key === 'h')) { e.preventDefault(); if (st.book) Ink.search.open(); }
      else if (e.key === 'Escape') {
        if (document.body.classList.contains('focus')) setFocus(false);
        el.fileMenu.hidden = true;
      }
    });
    window.addEventListener('beforeunload', () => Ink.saveNow());
    document.addEventListener('visibilitychange', () => { if (document.hidden) Ink.saveNow(); });
  }

  /* ================= Start ================= */
  function init() {
    applySettings();
    bindSettings();
    bindEditor();
    bindLists();
    bindFileMenu();
    bindGlobal();
    Ink.board.bind();
    Ink.timeline.bind();
    Ink.charmap.bind();
    Ink.snapshots.bind();
    Ink.search.bind();
    Ink.habits.bind();
    Ink.library.bind();
    Ink.comments.bind();
    Ink.stickies.bind();
    Ink.cover.bind();
    Ink.importer.bind();
    Ink.collab.bind();
    Ink.pwa.bind();

    const lib = st.library;
    if (!lib.books.length) {
      const book = S.newBook();
      S.saveBook(book);
      lib.books.push(S.indexEntry(book, 0));
      lib.activeId = book.id;
    }
    const startId = lib.activeId && lib.books.some((b) => b.id === lib.activeId) ? lib.activeId : lib.books[0].id;
    Ink.openBook(startId);
    setStatus('Saved ✓');
  }

  init();
})(window.Ink);
