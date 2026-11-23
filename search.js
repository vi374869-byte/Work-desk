/* Work Desk — Find & replace across the whole book (and optionally the notebook). */
(function (Ink) {
  'use strict';
  const U = Ink.util;
  const { $, h, fmt } = U;
  const F = Ink.search = {};
  let results = [];

  F.bind = function () {
    $('#btnFind').addEventListener('click', F.open);
    $('#findClose').addEventListener('click', () => $('#findDialog').close());
    const rerun = U.debounce(run, 200);
    for (const id of ['#findInput', '#findCase', '#findWord', '#findNotes']) {
      $(id).addEventListener(id === '#findInput' ? 'input' : 'change', rerun);
    }
    $('#findDialog').addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); $('#findDialog').close(); }
      if (e.key === 'Enter' && e.target.id === 'findInput' && results[0]) { e.preventDefault(); goTo(results[0]); }
    });
    $('#replaceAll').addEventListener('click', replaceAll);
  };

  F.open = function () {
    const dlg = $('#findDialog');
    if (!dlg.open) dlg.show();
    const sel = String(document.getSelection() || '').trim();
    if (sel && sel.length < 60 && !sel.includes('\n')) $('#findInput').value = sel;
    $('#findInput').focus();
    $('#findInput').select();
    run();
  };

  function buildRegex() {
    const term = $('#findInput').value;
    if (!term) return null;
    let src = U.escapeRegex(term);
    if ($('#findWord').checked) src = '(?<![\\p{L}\\p{N}])' + src + '(?![\\p{L}\\p{N}])';
    return new RegExp(src, 'gu' + ($('#findCase').checked ? '' : 'i'));
  }

  function snippet(text, start, len) {
    const from = Math.max(0, start - 40), to = Math.min(text.length, start + len + 40);
    return h('span', { class: 'snippet' },
      (from > 0 ? '…' : '') + text.slice(from, start),
      h('mark', { text: text.slice(start, start + len) }),
      text.slice(start + len, to) + (to < text.length ? '…' : ''));
  }

  function run() {
    const re = buildRegex();
    const box = $('#findResults');
    box.textContent = '';
    results = [];
    if (!re) {
      $('#findSummary').textContent = 'Type to search every chapter.';
      $('#replaceAll').disabled = true;
      return;
    }
    const book = Ink.book();
    // Chapters: search each text node of the chapter's content.
    for (const ch of book.chapters) {
      const nodes = U.textNodes(U.parseHtml(ch.content));
      nodes.forEach((node, nodeIndex) => {
        const text = node.textContent;
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text))) {
          if (!m[0].length) { re.lastIndex++; continue; }
          results.push({ kind: 'chapter', id: ch.id, nodeIndex, start: m.index, len: m[0].length, text });
        }
      });
    }
    // Notebook
    if ($('#findNotes').checked) {
      for (const n of book.notes) {
        for (const field of ['title', 'body']) {
          const text = n[field];
          re.lastIndex = 0;
          let m;
          while ((m = re.exec(text))) {
            if (!m[0].length) { re.lastIndex++; continue; }
            results.push({ kind: 'note', id: n.id, field, start: m.index, len: m[0].length, text });
          }
        }
      }
    }

    const places = new Set(results.map((r) => r.kind + r.id)).size;
    $('#findSummary').textContent = results.length
      ? fmt(results.length) + ' match' + (results.length === 1 ? '' : 'es') + ' in ' + places + ' place' + (places === 1 ? '' : 's')
      : 'No matches.';
    $('#replaceAll').disabled = !results.length;

    // Group results under their chapter / note.
    let lastKey = null;
    const shown = results.slice(0, 300);
    for (const r of shown) {
      const key = r.kind + r.id;
      if (key !== lastKey) {
        lastKey = key;
        const item = r.kind === 'chapter' ? Ink.getChapter(r.id) : Ink.getNote(r.id);
        const label = r.kind === 'chapter'
          ? '📖 ' + (item.title || 'Untitled chapter')
          : '🗒 ' + (item.title || 'Untitled') + ' (' + Ink.C.NOTE_TYPES[item.type].label.toLowerCase() + ')';
        box.append(h('div', { class: 'find-group', text: label }));
      }
      box.append(h('button', { class: 'find-hit', onclick: () => goTo(r) }, snippet(r.text, r.start, r.len)));
    }
    if (results.length > shown.length) box.append(h('div', { class: 'find-group', text: '…and ' + fmt(results.length - shown.length) + ' more' }));
  }

  function goTo(r) {
    if (r.kind === 'chapter') {
      Ink.openChapter(r.id);
      const editor = $('#editor');
      const node = U.textNodes(editor)[r.nodeIndex];
      if (!node) return;
      const range = document.createRange();
      range.setStart(node, Math.min(r.start, node.length));
      range.setEnd(node, Math.min(r.start + r.len, node.length));
      const sel = document.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const block = node.parentElement;
      if (block) block.scrollIntoView({ block: 'center' });
    } else {
      Ink.openNote(r.id);
      const field = r.field === 'title' ? $('#noteTitle') : $('#noteBody');
      field.focus();
      field.setSelectionRange(r.start, r.start + r.len);
    }
  }

  function replaceAll() {
    const re = buildRegex();
    if (!re || !results.length) return;
    const find = $('#findInput').value, repl = $('#replaceInput').value;
    const chapterIds = [...new Set(results.filter((r) => r.kind === 'chapter').map((r) => r.id))];
    const noteIds = [...new Set(results.filter((r) => r.kind === 'note').map((r) => r.id))];
    const msg = 'Replace ' + fmt(results.length) + ' match(es) of "' + find + '" with "' + repl + '"?' +
      (chapterIds.length ? '\n\nA snapshot of each changed chapter is saved first, so you can undo it from Snapshots.' : '');
    if (!confirm(msg)) return;

    const book = Ink.book();
    let count = 0;
    const doReplace = (text) => text.replace(re, () => { count++; return repl; });
    for (const id of chapterIds) {
      const ch = Ink.getChapter(id);
      Ink.snapshots.take(ch, 'Before replacing "' + find + '"');
      const body = U.parseHtml(ch.content);
      for (const node of U.textNodes(body)) {
        re.lastIndex = 0;
        if (re.test(node.textContent)) { re.lastIndex = 0; node.textContent = doReplace(node.textContent); }
      }
      ch.content = body.innerHTML;
    }
    for (const id of noteIds) {
      const n = book.notes.find((x) => x.id === id);
      n.title = doReplace(n.title);
      n.body = doReplace(n.body);
    }
    Ink.markDirty();
    Ink.renderLists();
    if (Ink.state.view === 'write') {
      if (Ink.state.current.kind === 'note') Ink.openNote(Ink.state.current.id);
      else { Ink.reloadEditor(); Ink.updateStats(); Ink.snapshots.render(); }
    } else Ink.refreshView();
    Ink.toast('Replaced ' + fmt(count) + ' match' + (count === 1 ? '' : 'es') + '.');
    run();
  }
})(window.Ink);
