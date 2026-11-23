/* Work Desk — Snapshots: save a copy of a chapter, compare it with now, restore it. */
(function (Ink) {
  'use strict';
  const U = Ink.util;
  const { $, h, fmt } = U;
  const SN = Ink.snapshots = {};
  let viewingId = null;

  SN.bind = function () {
    $('#takeSnapshot').addEventListener('click', () => {
      const ch = currentChapter();
      if (!ch) return;
      const name = prompt('Name this snapshot (for example "Before big rewrite"):', 'Snapshot · ' + U.when(Date.now()));
      if (name === null) return;
      SN.take(ch, name.trim() || 'Snapshot');
      Ink.toast('Snapshot saved. You can compare or restore it any time.');
    });
    $('#diffClose').addEventListener('click', () => $('#diffDialog').close());
    $('#diffRestore').addEventListener('click', () => {
      const snap = Ink.book().snapshots.find((s) => s.id === viewingId);
      if (snap) restore(snap);
    });
  };

  function currentChapter() {
    const st = Ink.state;
    return st.current.kind === 'chapter' ? Ink.getChapter(st.current.id) : null;
  }

  /* Save a copy of a chapter. Used by the button, restores, and find & replace. */
  SN.take = function (ch, name) {
    Ink.book().snapshots.push({ id: U.uid(), chapterId: ch.id, name, created: Date.now(), title: ch.title, content: ch.content });
    Ink.markDirty();
    SN.render();
  };

  SN.render = function () {
    const list = $('#snapList');
    list.textContent = '';
    const ch = currentChapter();
    if (!ch) return;
    const snaps = Ink.book().snapshots.filter((s) => s.chapterId === ch.id).sort((a, b) => b.created - a.created);
    if (!snaps.length) {
      list.append(h('li', { class: 'snap-empty', text: 'Take a snapshot before a big rewrite, then compare or go back any time.' }));
      return;
    }
    for (const s of snaps) {
      list.append(h('li', { class: 'snap' },
        h('button', { class: 'snap-main', title: 'Compare with the chapter now', onclick: () => SN.compare(s.id) },
          h('span', { class: 'snap-name', text: s.name }),
          h('span', { class: 'snap-meta', text: U.when(s.created) + ' · ' + fmt(U.countWords(U.htmlToPlain(s.content))) + ' words' })),
        h('button', {
          class: 'icon-btn', title: 'Delete snapshot', text: '×',
          onclick: () => {
            if (!confirm('Delete the snapshot "' + s.name + '"?')) return;
            Ink.book().snapshots = Ink.book().snapshots.filter((x) => x.id !== s.id);
            Ink.markDirty();
            SN.render();
          }
        })));
    }
  };

  function restore(snap) {
    const ch = Ink.getChapter(snap.chapterId);
    if (!ch) return;
    if (!confirm('Restore "' + snap.name + '"?\n\nThe chapter as it is now will be saved as a snapshot first, so nothing is lost.')) return;
    SN.take(ch, 'Before restoring "' + snap.name + '"');
    ch.content = snap.content;
    $('#diffDialog').close();
    Ink.openChapter(ch.id);
    Ink.markDirty();
    Ink.toast('Restored "' + snap.name + '".');
  }

  /* ---------- Compare ---------- */
  const paragraphs = (html) => U.htmlToPlain(html).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const tokens = (text) => text.split(/(\s+)/).filter((t) => t !== '');

  SN.compare = function (id) {
    const snap = Ink.book().snapshots.find((s) => s.id === id);
    const ch = snap && Ink.getChapter(snap.chapterId);
    if (!ch) return;
    viewingId = id;
    $('#diffTitle').textContent = 'Compare "' + snap.name + '" with the chapter now';
    const body = $('#diffBody');
    body.textContent = '';

    const ops = U.diff(paragraphs(snap.content), paragraphs(ch.content));
    let added = 0, removed = 0;
    let i = 0;
    while (i < ops.length) {
      if (ops[i].op === 'eq') {
        // Collapse long stretches of unchanged paragraphs.
        let j = i;
        while (j < ops.length && ops[j].op === 'eq') j++;
        const run = ops.slice(i, j);
        const first = i === 0, last = j === ops.length;
        if (run.length > 3) {
          if (!first) body.append(h('p', { class: 'diff-same', text: run[0].v }));
          body.append(h('p', { class: 'diff-skip', text: '… ' + (run.length - (first ? 0 : 1) - (last ? 0 : 1)) + ' unchanged paragraph(s) …' }));
          if (!last) body.append(h('p', { class: 'diff-same', text: run[run.length - 1].v }));
        } else {
          run.forEach((o) => body.append(h('p', { class: 'diff-same', text: o.v })));
        }
        i = j;
        continue;
      }
      // A block of changes: pair removed and added paragraphs and show word-level changes.
      const dels = [], adds = [];
      while (i < ops.length && ops[i].op !== 'eq') { (ops[i].op === 'del' ? dels : adds).push(ops[i].v); i++; }
      const pairs = Math.max(dels.length, adds.length);
      for (let k = 0; k < pairs; k++) {
        const a = dels[k], b = adds[k];
        if (a != null && b != null) {
          const p = h('p');
          // Merge neighbouring tokens with the same change so whole phrases are highlighted together.
          const merged = [];
          for (const o of U.diff(tokens(a), tokens(b))) {
            const prev = merged[merged.length - 1];
            if (prev && prev.op === o.op) prev.v += o.v;
            else if (prev && /^\s+$/.test(o.v) && o.op === 'eq' && prev.op !== 'eq') prev.v += o.v;
            else merged.push({ op: o.op, v: o.v });
          }
          for (const o of merged) {
            if (o.op === 'eq') p.append(o.v);
            else if (o.op === 'del') { p.append(h('del', { text: o.v })); removed += U.countWords(o.v); }
            else { p.append(h('ins', { text: o.v })); added += U.countWords(o.v); }
          }
          body.append(p);
        } else if (a != null) {
          body.append(h('p', {}, h('del', { text: a })));
          removed += U.countWords(a);
        } else {
          body.append(h('p', {}, h('ins', { text: b })));
          added += U.countWords(b);
        }
      }
    }
    if (!body.childNodes.length) body.append(h('p', { class: 'diff-skip', text: 'Both versions are empty.' }));
    $('#diffStats').textContent = (added || removed)
      ? '· ' + fmt(added) + ' words added, ' + fmt(removed) + ' removed'
      : '· No changes since this snapshot.';
    $('#diffDialog').showModal();
  };
})(window.Ink);
