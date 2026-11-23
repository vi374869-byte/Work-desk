/* Work Desk — Character map: people as draggable circles, relationships as colored lines. */
(function (Ink) {
  'use strict';
  const U = Ink.util, C = Ink.C;
  const { $, h, svg } = U;
  const M = Ink.charmap = {};
  const W = 1000, H = 600, R = 30;
  let nodes = new Map();   // note id -> {note, x, y, g}
  let gEdges = null;

  M.bind = function () {
    const kind = $('#relKind');
    for (const [k, v] of Object.entries(C.REL_KINDS)) kind.append(h('option', { value: k, text: v.label }));
    $('#relForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const from = $('#relFrom').value, to = $('#relTo').value;
      if (!from || !to) return;
      if (from === to) { Ink.toast('Pick two different people.'); return; }
      Ink.book().relations.push({ id: U.uid(), from, to, kind: $('#relKind').value, label: $('#relLabel').value.trim() });
      $('#relLabel').value = '';
      Ink.markDirty();
      M.render();
    });
    const legend = $('#mapLegend');
    for (const v of Object.values(C.REL_KINDS)) {
      legend.append(h('span', { class: 'legend-item' }, h('span', { class: 'legend-line', style: 'background:' + v.color }), v.label));
    }
  };

  function defaultPos(i, n) {
    if (n === 1) return { x: W / 2, y: H / 2 };
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const rx = n <= 3 ? 200 : 360, ry = n <= 3 ? 150 : 210;
    return { x: W / 2 + Math.cos(a) * rx, y: H / 2 + Math.sin(a) * ry };
  }

  M.render = function () {
    const book = Ink.book();
    const people = Ink.characters();
    const box = $('#mapSvg');
    const empty = $('#mapEmpty');
    const form = $('#relForm');

    // Person pickers
    for (const id of ['#relFrom', '#relTo']) {
      const sel = $(id), keep = sel.value;
      sel.textContent = '';
      for (const p of people) sel.append(h('option', { value: p.id, text: p.title || 'Untitled' }));
      if (people.some((p) => p.id === keep)) sel.value = keep;
    }
    if (people.length > 1 && $('#relFrom').value === $('#relTo').value) $('#relTo').selectedIndex = 1;

    box.textContent = '';
    nodes = new Map();
    if (people.length < 2) {
      box.style.display = 'none';
      form.hidden = true;
      empty.hidden = false;
      empty.textContent = '';
      empty.append(
        h('p', { text: people.length ? 'Add one more character to start connecting people.' : 'Add characters in the People tab to build your map.' }),
        h('button', { class: 'btn primary', text: '+ New character', onclick: () => Ink.addNote('character') }));
      renderList();
      return;
    }
    box.style.display = '';
    form.hidden = false;
    empty.hidden = true;

    gEdges = svg('g', { class: 'edges' });
    const gNodes = svg('g', { class: 'nodes' });
    box.append(gEdges, gNodes);

    people.forEach((p, i) => {
      const pos = p.pos || defaultPos(i, people.length);
      const g = svg('g', { class: 'node', transform: 'translate(' + pos.x + ',' + pos.y + ')', tabindex: '0' },
        svg('circle', { r: R }),
        svg('text', { class: 'node-initials', 'text-anchor': 'middle', dy: '0.35em', text: U.initials(p.title) }),
        svg('text', { class: 'node-name', 'text-anchor': 'middle', y: R + 20, text: p.title || 'Untitled' }));
      const node = { note: p, x: pos.x, y: pos.y, g };
      nodes.set(p.id, node);
      makeDraggable(node, box);
      gNodes.append(g);
    });
    drawEdges();
    renderList();
  };

  function drawEdges() {
    const book = Ink.book();
    gEdges.textContent = '';
    const pairCount = new Map(), pairSeen = new Map();
    const key = (r) => [r.from, r.to].sort().join('|');
    for (const r of book.relations) pairCount.set(key(r), (pairCount.get(key(r)) || 0) + 1);

    for (const r of book.relations) {
      const a = nodes.get(r.from), b = nodes.get(r.to);
      if (!a || !b) continue;
      const k = key(r);
      const idx = pairSeen.get(k) || 0;
      pairSeen.set(k, idx + 1);
      const count = pairCount.get(k);
      // Curve multiple relationships between the same two people apart from each other.
      const [p1, p2] = r.from < r.to ? [a, b] : [b, a];
      const dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.hypot(dx, dy) || 1;
      const off = (idx - (count - 1) / 2) * 120;
      const cx = (p1.x + p2.x) / 2 - (dy / len) * off;
      const cy = (p1.y + p2.y) / 2 + (dx / len) * off;
      const kind = C.REL_KINDS[r.kind] || C.REL_KINDS.other;
      const lx = 0.25 * p1.x + 0.5 * cx + 0.25 * p2.x;
      const ly = 0.25 * p1.y + 0.5 * cy + 0.25 * p2.y;
      gEdges.append(
        svg('path', { d: 'M' + p1.x + ' ' + p1.y + ' Q' + cx + ' ' + cy + ' ' + p2.x + ' ' + p2.y,
                      stroke: kind.color, class: 'edge' }),
        svg('text', { x: lx, y: ly, 'text-anchor': 'middle', dy: '0.35em', class: 'edge-label', fill: kind.color,
                      text: kind.label + (r.label ? ': ' + r.label : '') }));
    }
  }

  function makeDraggable(node, box) {
    let start = null, moved = false;
    const toSvg = (e) => {
      const pt = box.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      return pt.matrixTransform(box.getScreenCTM().inverse());
    };
    node.g.addEventListener('pointerdown', (e) => {
      node.g.setPointerCapture(e.pointerId);
      const p = toSvg(e);
      start = { px: p.x, py: p.y, x: node.x, y: node.y };
      moved = false;
      node.g.classList.add('dragging');
    });
    node.g.addEventListener('pointermove', (e) => {
      if (!start) return;
      const p = toSvg(e);
      const dx = p.x - start.px, dy = p.y - start.py;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      node.x = Math.min(W - R - 10, Math.max(R + 10, start.x + dx));
      node.y = Math.min(H - R - 30, Math.max(R + 10, start.y + dy));
      node.g.setAttribute('transform', 'translate(' + node.x + ',' + node.y + ')');
      drawEdges();
    });
    const end = () => {
      if (!start) return;
      start = null;
      node.g.classList.remove('dragging');
      if (moved) {
        node.note.pos = { x: Math.round(node.x), y: Math.round(node.y) };
        Ink.markDirty();
      } else {
        Ink.openNote(node.note.id);
      }
    };
    node.g.addEventListener('pointerup', end);
    node.g.addEventListener('pointercancel', () => { start = null; node.g.classList.remove('dragging'); });
    node.g.addEventListener('keydown', (e) => { if (e.key === 'Enter') Ink.openNote(node.note.id); });
  }

  function renderList() {
    const book = Ink.book();
    const list = $('#relList');
    list.textContent = '';
    for (const r of book.relations) {
      const a = Ink.getNote(r.from), b = Ink.getNote(r.to);
      if (!a || !b) continue;
      const kind = C.REL_KINDS[r.kind] || C.REL_KINDS.other;
      list.append(h('li', { class: 'rel-item' },
        h('span', { class: 'legend-line', style: 'background:' + kind.color }),
        h('span', { class: 'rel-text' },
          h('strong', { text: a.title || 'Untitled' }), ' · ' + kind.label + ' · ', h('strong', { text: b.title || 'Untitled' }),
          r.label ? h('span', { class: 'rel-label', text: ' (' + r.label + ')' }) : null),
        h('button', {
          class: 'icon-btn', title: 'Remove this connection', text: '×',
          onclick: () => {
            book.relations = book.relations.filter((x) => x.id !== r.id);
            Ink.markDirty();
            M.render();
          }
        })));
    }
  }
})(window.Ink);
