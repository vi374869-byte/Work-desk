/* Work Desk — Sticky notes on the page. Saved with each chapter, never included in exports. */
(function (Ink) {
  'use strict';
  const U = Ink.util, C = Ink.C;
  const { $, h } = U;
  const SK = Ink.stickies = {};
  const COLOR_ORDER = Object.keys(C.STICKY_COLORS);
  let topZ = 1;

  const layer = () => $('#stickyLayer');
  const page = () => $('#writePage');
  function chapter() {
    const st = Ink.state;
    return st.book && st.current.kind === 'chapter' ? Ink.getChapter(st.current.id) : null;
  }

  SK.bind = function () {
    $('#tbSticky').addEventListener('click', SK.add);
    $('#tbStickyToggle').addEventListener('click', () => {
      const s = Ink.state.library.settings;
      s.hideStickies = !s.hideStickies;
      applyVisibility();
      Ink.markDirty();
      Ink.toast(s.hideStickies ? 'Sticky notes hidden.' : 'Sticky notes shown.');
    });
  };

  function applyVisibility() {
    const hidden = !!Ink.state.library.settings.hideStickies;
    document.body.classList.toggle('hide-stickies', hidden);
    $('#tbStickyToggle').classList.toggle('on', !hidden);
    $('#tbStickyToggle').title = hidden ? 'Show sticky notes' : 'Hide sticky notes';
  }

  SK.add = function () {
    const ch = chapter();
    if (!ch) return;
    if (Ink.state.library.settings.hideStickies) { Ink.state.library.settings.hideStickies = false; applyVisibility(); }
    const pg = page();
    const pr = pg.getBoundingClientRect(), mr = $('#main').getBoundingClientRect();
    const offset = (ch.stickies.length % 5) * 24;
    const sticky = {
      id: U.uid(), text: '',
      x: Math.max(10, pg.clientWidth - 240 - offset),
      y: Math.max(20, mr.top - pr.top + 90 + offset),
      w: 210, h: 140,
      color: COLOR_ORDER[ch.stickies.length % COLOR_ORDER.length]
    };
    ch.stickies.push(sticky);
    Ink.markDirty();
    SK.render();
    const ta = layer().querySelector('[data-id="' + sticky.id + '"] textarea');
    if (ta) ta.focus();
  };

  SK.render = function () {
    applyVisibility();
    const box = layer();
    box.textContent = '';
    const ch = chapter();
    if (!ch) return;
    for (const s of ch.stickies) box.append(makeSticky(ch, s));
  };

  function makeSticky(ch, s) {
    const ta = h('textarea', { placeholder: 'Sticky note…', value: s.text, spellcheck: 'true', style: 'width:' + s.w + 'px;height:' + s.h + 'px' });
    ta.addEventListener('input', () => { s.text = ta.value; Ink.markDirty(); });
    ta.addEventListener('mouseup', () => {
      const w = ta.offsetWidth, hgt = ta.offsetHeight;
      if (w !== s.w || hgt !== s.h) { s.w = w; s.h = hgt; Ink.markDirty(); }
    });

    const grip = h('div', { class: 'sticky-grip', title: 'Drag to move' });
    const colorBtn = h('button', { class: 'sticky-btn', title: 'Change color', text: '🎨' });
    const delBtn = h('button', { class: 'sticky-btn', title: 'Delete sticky note', text: '×' });
    const note = h('div', { class: 'sticky', dataset: { id: s.id }, style: stickyStyle(s) },
      h('div', { class: 'sticky-head' }, grip, colorBtn, delBtn), ta);

    colorBtn.addEventListener('click', () => {
      s.color = COLOR_ORDER[(COLOR_ORDER.indexOf(s.color) + 1) % COLOR_ORDER.length];
      note.style.cssText = stickyStyle(s);
      Ink.markDirty();
    });
    delBtn.addEventListener('click', () => {
      if (s.text.trim() && !confirm('Delete this sticky note?')) return;
      ch.stickies = ch.stickies.filter((x) => x.id !== s.id);
      note.remove();
      Ink.markDirty();
    });

    // Drag by the top bar
    let start = null;
    grip.addEventListener('pointerdown', (e) => {
      grip.setPointerCapture(e.pointerId);
      start = { mx: e.clientX, my: e.clientY, x: s.x, y: s.y };
      note.classList.add('dragging');
      note.style.zIndex = ++topZ;     // bring to front
    });
    grip.addEventListener('pointermove', (e) => {
      if (!start) return;
      const maxX = Math.max(0, page().clientWidth - note.offsetWidth);
      s.x = Math.round(Math.min(maxX, Math.max(0, start.x + e.clientX - start.mx)));
      s.y = Math.round(Math.max(0, start.y + e.clientY - start.my));
      note.style.left = s.x + 'px';
      note.style.top = s.y + 'px';
    });
    const end = () => { if (start) { start = null; note.classList.remove('dragging'); Ink.markDirty(); } };
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
    return note;
  }

  function stickyStyle(s) {
    return 'left:' + s.x + 'px;top:' + s.y + 'px;z-index:' + topZ + ';background:' + (C.STICKY_COLORS[s.color] || C.STICKY_COLORS.yellow);
  }
})(window.Ink);
