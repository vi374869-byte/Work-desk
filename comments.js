/* Work Desk — Comments & notes on any paragraph.
   Each commented paragraph gets a small id (data-b). Exports strip those ids, so comments never appear in exported files. */
(function (Ink) {
  'use strict';
  const U = Ink.util;
  const { $, h } = U;
  const CM = Ink.comments = {};
  let showResolved = false;
  let openId = null;        // block id whose popover is open
  let hoverBlock = null;
  let newKind = 'comment';
  let draft = '';           // unsent text, kept when switching Comment/Note

  const editor = () => $('#editor');
  const page = () => $('#writePage');
  function chapter() {
    const st = Ink.state;
    return st.book && st.view === 'write' && st.current.kind === 'chapter' ? Ink.getChapter(st.current.id) : null;
  }
  /* The top-level paragraph (direct child of the editor) containing a node. */
  function topBlock(node) {
    const ed = editor();
    while (node && node.parentNode !== ed) {
      node = node.parentNode;
      if (!node || node === document.body) return null;
    }
    return node && node.nodeType === 1 ? node : null;
  }
  const blockById = (id) => editor().querySelector(':scope > [data-b="' + CSS.escape(id) + '"]');
  const excerpt = (s, n) => { s = s.replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

  /* Pressing Enter in Edge copies the paragraph id to the new paragraph; keep ids unique. */
  function dedupeIds() {
    const seen = new Set();
    let changed = false;
    for (const el of editor().children) {
      const id = el.getAttribute('data-b');
      if (!id) continue;
      if (seen.has(id) || !U.BLOCK_ID_RE.test(id)) { el.removeAttribute('data-b'); changed = true; }
      else seen.add(id);
    }
    return changed;
  }

  function saveEditorContent() {
    const ch = chapter();
    if (ch) { ch.content = editor().innerHTML; Ink.markDirty(); }
  }

  function ensureId(block) {
    let id = block.getAttribute('data-b');
    if (!id || !U.BLOCK_ID_RE.test(id)) {
      id = U.uid();
      block.setAttribute('data-b', id);
      saveEditorContent();
    }
    return id;
  }

  const afterInput = U.debounce(() => {
    if (!chapter()) return;
    if (dedupeIds()) saveEditorContent();
    renderMarkers();
    renderList();
  }, 350);
  CM.onInput = afterInput;

  /* ---------- Binding ---------- */
  CM.bind = function () {
    const ed = editor();
    ed.addEventListener('mousemove', (e) => {
      const b = topBlock(e.target);
      if (b && b !== hoverBlock) { hoverBlock = b; placeAddButton(b); }
    });
    document.addEventListener('selectionchange', () => {
      const sel = document.getSelection();
      if (!sel.anchorNode || !ed.contains(sel.anchorNode)) return;
      const b = topBlock(sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentNode) || topBlock(sel.anchorNode);
      if (b) { hoverBlock = b; placeAddButton(b); }
    });
    $('#commentAdd').addEventListener('mousedown', (e) => e.preventDefault());
    $('#commentAdd').addEventListener('click', () => { if (hoverBlock) CM.openFor(hoverBlock, true); });
    $('#tbComment').addEventListener('click', CM.commentHere);
    $('#showResolved').addEventListener('click', () => {
      showResolved = !showResolved;
      $('#showResolved').textContent = showResolved ? 'Hide resolved' : 'Show resolved';
      renderList();
    });
    document.addEventListener('mousedown', (e) => {
      const pop = $('#commentPop');
      if (pop.hidden) return;
      if (e.target.closest('#commentPop, .comment-marker, #commentAdd, #tbComment, #commentList')) return;
      closePop();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('#commentPop').hidden) closePop();
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'm') { e.preventDefault(); CM.commentHere(); }
    });
    // Keep bubbles lined up when text reflows (typing, font size, window size).
    if (window.ResizeObserver) new ResizeObserver(() => { if (chapter()) { renderMarkers(); positionPop(); } }).observe(ed);
  };

  /* Toolbar button / shortcut: comment on the paragraph with the cursor. */
  CM.commentHere = function () {
    if (!chapter()) return;
    const sel = document.getSelection();
    let b = sel.anchorNode && editor().contains(sel.anchorNode) ? topBlock(sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentNode) : null;
    b = b || hoverBlock || editor().firstElementChild;
    if (!b || !b.textContent.trim()) { Ink.toast('Click into a paragraph with text first.'); return; }
    CM.openFor(b, true);
  };

  function placeAddButton(b) {
    const btn = $('#commentAdd');
    if (!b.textContent.trim()) { btn.hidden = true; return; }
    const top = b.getBoundingClientRect().top - page().getBoundingClientRect().top;
    btn.style.top = top + 'px';
    btn.hidden = false;
  }

  /* ---------- Rendering ---------- */
  /* Redraw after a collaborator's change, without closing what you're doing. */
  CM.refresh = function () {
    if (!chapter()) return;
    if (openId && !blockById(openId)) closePop();
    renderMarkers();
    renderList();
    const pop = $('#commentPop');
    if (!pop.hidden && !pop.contains(document.activeElement)) renderPop();
  };

  CM.render = function () {
    closePop();
    hoverBlock = null;
    $('#commentAdd').hidden = true;
    if (chapter() && dedupeIds()) saveEditorContent();
    renderMarkers();
    renderList();
  };

  function renderMarkers() {
    const rail = $('#commentRail');
    rail.textContent = '';
    const style = $('#commentStyle') || document.head.appendChild(h('style', { id: 'commentStyle' }));
    const ch = chapter();
    if (!ch) { style.textContent = ''; return; }
    const groups = new Map();
    for (const c of ch.comments) {
      if (c.resolved) continue;
      if (!groups.has(c.blockId)) groups.set(c.blockId, []);
      groups.get(c.blockId).push(c);
    }
    const pageTop = page().getBoundingClientRect().top;
    let css = '';
    for (const [id, list] of groups) {
      const b = blockById(id);
      if (!b) continue;
      const hasComment = list.some((c) => c.kind === 'comment');
      const top = b.getBoundingClientRect().top - pageTop;
      const marker = h('button', {
        class: 'comment-marker ' + (hasComment ? 'is-comment' : 'is-note') + (openId === id ? ' active' : ''),
        style: 'top:' + top + 'px',
        title: list.length + (hasComment ? ' comment(s)' : ' note(s)') + ': click to open',
        onclick: () => (openId === id ? closePop() : CM.openFor(b, false))
      }, (hasComment ? '💬' : '📝') + ' ' + list.length);
      rail.append(marker);
      const sel = '.editor > [data-b="' + id + '"]';
      css += sel + '{background:' + (hasComment ? 'color-mix(in srgb, var(--accent) 9%, transparent)' : 'color-mix(in srgb, #e0b02e 15%, transparent)') +
             ';border-radius:3px;box-shadow:-10px 0 0 ' + (hasComment ? 'color-mix(in srgb, var(--accent) 9%, transparent)' : 'color-mix(in srgb, #e0b02e 15%, transparent)') + '}';
    }
    if (openId) css += '.editor > [data-b="' + openId + '"]{outline:2px solid var(--accent);outline-offset:3px}';
    style.textContent = css;
  }

  function renderList() {
    const list = $('#commentList');
    list.textContent = '';
    const ch = chapter();
    if (!ch) return;
    const order = new Map(Array.from(editor().children).map((el, i) => [el.getAttribute('data-b'), i]));
    const items = ch.comments.filter((c) => showResolved || !c.resolved)
      .sort((a, b) => ((order.get(a.blockId) ?? 1e9) - (order.get(b.blockId) ?? 1e9)) || a.created - b.created);
    const resolved = ch.comments.filter((c) => c.resolved).length;
    if (!items.length) {
      list.append(h('li', { class: 'snap-empty', text: 'Hover over a paragraph and click + in the margin to add a comment or note.' +
        (resolved && !showResolved ? ' (' + resolved + ' resolved)' : '') }));
      return;
    }
    for (const c of items) {
      const b = blockById(c.blockId);
      list.append(h('li', { class: 'snap' + (c.resolved ? ' resolved' : '') },
        h('button', {
          class: 'snap-main', title: b ? 'Go to this paragraph' : 'The paragraph was deleted',
          onclick: () => { if (b) { b.scrollIntoView({ block: 'center' }); CM.openFor(b, false); } }
        },
          h('span', { class: 'snap-name', text: (c.kind === 'note' ? '📝 ' : '💬 ') + excerpt(c.text, 60) }),
          h('span', { class: 'snap-meta', text: b ? '“' + excerpt(b.textContent, 40) + '”' : '(paragraph was deleted)' })),
        canDelete(c) ? h('button', { class: 'icon-btn', title: 'Delete', text: '×', onclick: () => removeComment(c.id) }) : null));
    }
  }

  /* ---------- Popover ---------- */
  CM.openFor = function (block, focusNew) {
    const ch = chapter();
    if (!ch) return;
    const id = ensureId(block);
    if (id !== openId) draft = '';
    openId = id;
    renderPop();
    renderMarkers();
    if (focusNew) { const t = $('#commentPop textarea'); if (t) t.focus(); }
  };

  function closePop() {
    if (!openId && $('#commentPop').hidden) return;
    openId = null;
    $('#commentPop').hidden = true;
    renderMarkers();
  }

  function positionPop() {
    const pop = $('#commentPop');
    if (pop.hidden || !openId) return;
    const b = blockById(openId);
    if (!b) { closePop(); return; }
    pop.style.top = (b.getBoundingClientRect().bottom - page().getBoundingClientRect().top + 8) + 'px';
  }

  function renderPop() {
    const ch = chapter();
    const pop = $('#commentPop');
    const b = blockById(openId);
    if (!ch || !b) { closePop(); return; }
    pop.textContent = '';
    const list = ch.comments.filter((c) => c.blockId === openId).sort((a, b2) => a.created - b2.created);

    pop.append(h('div', { class: 'pop-head' },
      h('span', { class: 'pop-quote', text: '“' + excerpt(b.textContent, 90) + '”' }),
      h('button', { class: 'icon-btn', title: 'Close (Esc)', text: '×', onclick: closePop })));

    for (const c of list) {
      pop.append(h('div', { class: 'pop-item ' + c.kind + (c.resolved ? ' resolved' : '') },
        h('div', { class: 'pop-meta' },
          h('span', { class: 'pop-kind', text: (c.kind === 'note' ? '📝 Note' : '💬 Comment') + (c.authorName ? ' · ' + c.authorName : '') }),
          h('span', { text: U.when(c.created) + (c.resolved ? ' · resolved' : '') })),
        h('div', { class: 'pop-text', text: c.text }),
        Ink.cloud.canComment() ? h('div', { class: 'pop-actions' },
          h('button', { class: 'btn small', text: c.resolved ? 'Reopen' : 'Resolve ✓',
                        onclick: () => { c.resolved = !c.resolved; Ink.markDirty(); renderPop(); renderMarkers(); renderList(); } }),
          canDelete(c) ? h('button', { class: 'btn small danger', text: 'Delete', onclick: () => removeComment(c.id) }) : null) : null));
    }

    const kindBtns = h('div', { class: 'kind-toggle' },
      ['comment', 'note'].map((k) => h('button', {
        class: newKind === k ? 'active' : '', type: 'button',
        text: k === 'note' ? '📝 Note' : '💬 Comment',
        title: k === 'note' ? 'A private note to yourself (research, reminders)' : 'Feedback or a question about this paragraph',
        onclick: () => { newKind = k; renderPop(); $('#commentPop textarea').focus(); }
      })));
    const ta = h('textarea', { rows: 3, placeholder: newKind === 'note' ? 'Write a note…' : 'Write a comment…', value: draft });
    ta.addEventListener('input', () => { draft = ta.value; });
    const add = () => {
      const text = ta.value.trim();
      if (!text) { ta.focus(); return; }
      ch.comments.push({ id: U.uid(), blockId: openId, kind: newKind, text, created: Date.now(), resolved: false,
                         author: Ink.cloud.userId(), authorName: Ink.cloud.active() ? Ink.cloud.displayName() : '' });
      draft = '';
      Ink.markDirty();
      renderPop();
      renderMarkers();
      renderList();
      $('#commentPop textarea').focus();
    };
    ta.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); add(); } });
    if (!Ink.cloud.canComment()) { pop.hidden = false; positionPop(); return; }
    pop.append(h('div', { class: 'pop-new' }, kindBtns, ta,
      h('div', { class: 'pop-actions' }, h('span', { class: 'muted-text', text: 'Ctrl+Enter to add' }),
        h('button', { class: 'btn primary small', text: 'Add', onclick: add }))));
    pop.hidden = false;
    positionPop();
  }

  /* In shared books you can delete your own comments; editors and the owner can delete any. */
  function canDelete(c) {
    if (!Ink.cloud.active()) return true;
    return Ink.cloud.canEdit() || (c.author && c.author === Ink.cloud.userId());
  }

  function removeComment(id) {
    const ch = chapter();
    if (!ch) return;
    const c = ch.comments.find((x) => x.id === id);
    if (!c || !confirm('Delete this ' + c.kind + '?')) return;
    ch.comments = ch.comments.filter((x) => x.id !== id);
    Ink.markDirty();
    if (!$('#commentPop').hidden) renderPop();
    renderMarkers();
    renderList();
  }
})(window.Ink);
