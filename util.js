/* Work Desk — shared helpers and constants. Loaded first. */
window.Ink = window.Ink || {};
(function (Ink) {
  'use strict';
  const U = Ink.util = {};

  /* ---------- Constants ---------- */
  Ink.C = {
    PRESETS: {
      lilac:    { bg: '#efe2ee', page: '#fdf8fc', text: '#2a1f2b', accent: '#c13fb0' },
      paper:    { bg: '#f4efe6', page: '#fffdf8', text: '#2b2722', accent: '#9c5b2e' },
      light:    { bg: '#eef0f3', page: '#ffffff', text: '#1f2328', accent: '#3b6fd8' },
      dark:     { bg: '#1b1c1f', page: '#26272b', text: '#e6e3dc', accent: '#d9a066' },
      forest:   { bg: '#e3eadf', page: '#f7faf4', text: '#1f2d24', accent: '#3f7d4e' },
      midnight: { bg: '#0f1626', page: '#18223a', text: '#dbe3f4', accent: '#7aa2ff' },
      rose:     { bg: '#f6e9ea', page: '#fffafa', text: '#3a2427', accent: '#c0587a' }
    },
    FONTS: {
      serif: 'Georgia, "Times New Roman", serif',
      sans: '"Segoe UI", system-ui, sans-serif',
      mono: 'Consolas, "Courier New", monospace'
    },
    NOTE_TYPES: {
      idea:      { label: 'Idea', add: '+ New idea', name: 'New idea', template: '',
                   placeholder: 'Jot down the idea: a scene, a line of dialogue, a "what if"…' },
      character: { label: 'Character', add: '+ New character', name: 'New character',
                   template: 'Role: \nAge: \nAppearance: \nPersonality: \nWants: \nFears: \nBackstory: \n\nNotes: ', placeholder: '' },
      place:     { label: 'Place', add: '+ New place', name: 'New place',
                   template: 'Type: \nDescription: \nWho is here: \nWhy it matters: \n\nNotes: ', placeholder: '' },
      plot:      { label: 'Plot thread', add: '+ New plot thread', name: 'New plot thread',
                   template: 'What happens: \nWho is involved: \nWhere: \nHow it resolves: \n\nNotes: ', placeholder: '' }
    },
    STICKY_COLORS: { yellow: '#fff1a8', pink: '#ffd1dc', blue: '#cfe8ff', green: '#d4f5d0', orange: '#ffe0b8' },
    STATUSES: ['idea', 'draft', 'revised', 'done'],
    STATUS_LABELS: { idea: 'Idea', draft: 'Draft', revised: 'Revised', done: 'Done' },
    REL_KINDS: {
      family: { label: 'family',      color: '#8e6cc4' },
      friend: { label: 'friends',     color: '#3fa76a' },
      love:   { label: 'in love',     color: '#d9547a' },
      enemy:  { label: 'enemies',     color: '#d0473a' },
      rival:  { label: 'rivals',      color: '#e07b2f' },
      ally:   { label: 'allies',      color: '#4a8fd8' },
      mentor: { label: 'mentor & pupil', color: '#c9a227' },
      other:  { label: 'connected',   color: '#8a8a8a' }
    }
  };

  /* ---------- Small helpers ---------- */
  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  U.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  U.fmt = (n) => Number(n || 0).toLocaleString();
  U.dateKey = (d) => {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  U.todayStr = () => U.dateKey(new Date());
  U.escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  U.safeFileName = (s) => (s || 'Untitled').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 80) || 'Untitled';
  U.isHex = (s) => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);
  U.clampNum = (v, min, max, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  U.debounce = (fn, ms) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };
  U.when = (ts) => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  U.timeAgo = (ts) => {
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    if (s < 86400 * 7) { const d = Math.floor(s / 86400); return d + (d === 1 ? ' day ago' : ' days ago'); }
    return new Date(ts).toLocaleDateString();
  };
  U.initials = (name) => {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  };

  /* Build DOM elements: U.h('div', {class:'x', onclick: fn, text:'hi'}, child1, child2) */
  U.h = function (tag, attrs, ...children) {
    const e = document.createElement(tag);
    const late = {};
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'style') e.style.cssText = v;
        else if (k === 'dataset') Object.assign(e.dataset, v);
        else if (k === 'value' || k === 'checked' || k === 'selected') late[k] = v;
        else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      e.append(c.nodeType ? c : String(c));
    }
    Object.assign(e, late);
    return e;
  };
  /* Same for SVG elements. */
  U.svg = function (tag, attrs, ...children) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'text') e.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v);
      }
    }
    for (const c of children.flat()) { if (c) e.append(c); }
    return e;
  };

  /* ---------- HTML / text conversion ---------- */
  const ALLOWED_TAGS = new Set(['P', 'H2', 'H3', 'BLOCKQUOTE', 'STRONG', 'B', 'EM', 'I', 'U', 'BR', 'UL', 'OL', 'LI', 'HR', 'DIV']);
  const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'LINK', 'META', 'SVG', 'MATH', 'NOSCRIPT']);

  U.parseHtml = (html) => new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html').body;

  /* Keep only simple formatting tags and strip every attribute.
     keepIds: keep the paragraph ids (data-b) that comments are attached to.
     Exports call this WITHOUT keepIds, so comments never leak into exported files. */
  U.BLOCK_ID_RE = /^[a-z0-9]{4,24}$/;
  U.sanitizeHtml = function (html, keepIds) {
    const body = U.parseHtml(html);
    const clean = (node) => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 1) {
          if (DROP_TAGS.has(child.tagName)) { child.remove(); continue; }
          clean(child);
          if (!ALLOWED_TAGS.has(child.tagName)) { child.replaceWith(...child.childNodes); continue; }
          const id = child.getAttribute('data-b');
          for (const a of Array.from(child.attributes)) child.removeAttribute(a.name);
          if (keepIds && id && U.BLOCK_ID_RE.test(id) && node === body) child.setAttribute('data-b', id);
        } else if (child.nodeType !== 3) {
          child.remove();
        }
      }
    };
    clean(body);
    return body.innerHTML;
  };

  U.htmlToPlain = function (html) {
    return (html || '')
      .replace(/<hr\b[^>]*>/gi, '\n\n* * *\n\n')
      .replace(/<br\b[^>]*>/gi, '\n')
      .replace(/<\/(p|h2|h3|blockquote|li|div|ul|ol)>/gi, '\n\n')
      .replace(/<li\b[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  U.countWords = function (text) {
    const m = String(text || '').match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu);
    return m ? m.length : 0;
  };

  U.htmlToMarkdown = function (html) {
    const body = U.parseHtml(html);
    const inline = (n) => Array.from(n.childNodes).map((c) => {
      if (c.nodeType === 3) return c.textContent.replace(/ /g, ' ');
      if (c.nodeType !== 1) return '';
      const inner = inline(c);
      switch (c.tagName) {
        case 'STRONG': case 'B': return inner.trim() ? '**' + inner + '**' : inner;
        case 'EM': case 'I': return inner.trim() ? '*' + inner + '*' : inner;
        case 'BR': return '  \n';
        case 'P': case 'DIV': return inner + '\n';
        default: return inner;
      }
    }).join('');
    const blocks = [];
    for (const c of body.childNodes) {
      if (c.nodeType === 3) { if (c.textContent.trim()) blocks.push(c.textContent.trim()); continue; }
      if (c.nodeType !== 1) continue;
      const text = inline(c).trim();
      switch (c.tagName) {
        case 'H2': blocks.push('### ' + text); break;
        case 'H3': blocks.push('#### ' + text); break;
        case 'BLOCKQUOTE': blocks.push(text.split('\n').map((l) => '> ' + l).join('\n')); break;
        case 'HR': blocks.push('* * *'); break;
        case 'UL': blocks.push(Array.from(c.children).map((li) => '- ' + inline(li).trim()).join('\n')); break;
        case 'OL': blocks.push(Array.from(c.children).map((li, i) => (i + 1) + '. ' + inline(li).trim()).join('\n')); break;
        default: if (text) blocks.push(text);
      }
    }
    return blocks.join('\n\n');
  };

  /* All text nodes under a root, in document order. */
  U.textNodes = function (root) {
    const out = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) out.push(n);
    return out;
  };

  /* Regex that finds a character/place name (full name, or first name for characters). */
  U.mentionRegex = function (note) {
    const name = String(note.title || '').trim();
    const def = Ink.C.NOTE_TYPES[note.type] && Ink.C.NOTE_TYPES[note.type].name;
    if (name.length < 2 || name === def) return null;
    const terms = [name];
    const first = name.split(/\s+/)[0];
    if (note.type === 'character' && first !== name && first.length >= 3) terms.push(first);
    return new RegExp('(^|[^\\p{L}\\p{N}])(' + terms.map(U.escapeRegex).join('|') + ')(?=$|[^\\p{L}\\p{N}])', 'iu');
  };

  /* Diff two arrays of strings. Returns [{op:'eq'|'del'|'add', v}] */
  U.diff = function (a, b) {
    const n = a.length, m = b.length;
    let start = 0;
    while (start < n && start < m && a[start] === b[start]) start++;
    let endA = n, endB = m;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
    const ops = [];
    for (let i = 0; i < start; i++) ops.push({ op: 'eq', v: a[i] });
    const A = a.slice(start, endA), B = b.slice(start, endB);
    const N = A.length, M = B.length;
    if (N * M > 4e6) {
      A.forEach((v) => ops.push({ op: 'del', v }));
      B.forEach((v) => ops.push({ op: 'add', v }));
    } else {
      const W = M + 1;
      const t = new Uint32Array((N + 1) * (M + 1));
      for (let i = N - 1; i >= 0; i--) {
        for (let j = M - 1; j >= 0; j--) {
          t[i * W + j] = A[i] === B[j] ? t[(i + 1) * W + j + 1] + 1 : Math.max(t[(i + 1) * W + j], t[i * W + j + 1]);
        }
      }
      let i = 0, j = 0;
      while (i < N && j < M) {
        if (A[i] === B[j]) { ops.push({ op: 'eq', v: A[i] }); i++; j++; }
        else if (t[(i + 1) * W + j] >= t[i * W + j + 1]) { ops.push({ op: 'del', v: A[i] }); i++; }
        else { ops.push({ op: 'add', v: B[j] }); j++; }
      }
      while (i < N) ops.push({ op: 'del', v: A[i++] });
      while (j < M) ops.push({ op: 'add', v: B[j++] });
    }
    for (let i = endA; i < n; i++) ops.push({ op: 'eq', v: a[i] });
    return ops;
  };

  /* Turn plain text into simple paragraphs (used by the text-file import). */
  U.textToHtml = function (text) {
    const inline = (s) => U.escapeHtml(s)
      .replace(/\*\*(?=\S)([^*]+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^\w*])\*(?=\S)([^*]+?)\*(?!\w)/g, '$1<em>$2</em>')
      .replace(/(^|[^\w])_(?=\S)([^_]+?)_(?!\w)/g, '$1<em>$2</em>');
    const isBreak = (s) => /^\s*(\*\s*\*\s*\*|#|-{3,}|~{3,}|⁂)\s*$/.test(s);
    const t = text.replace(/\r\n?/g, '\n').trim();
    if (!t) return '';
    const paras = /\n\s*\n/.test(t) ? t.split(/\n\s*\n/) : t.split('\n');
    return paras.map((p) => p.trim()).filter(Boolean).map((p) => {
      if (isBreak(p)) return '<hr>';
      if (/^>\s?/.test(p)) return '<blockquote>' + inline(p.replace(/^>\s?/gm, '')).replace(/\n/g, '<br>') + '</blockquote>';
      return '<p>' + inline(p).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  };

  /* Shrink an image file to fit maxW×maxH and return a JPEG data URL. */
  U.resizeImage = function (file, maxW, maxH, quality) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width, maxH / img.height);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', quality || 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as an image.')); };
      img.src = url;
    });
  };
  U.isImageData = (s) => typeof s === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length < 3e6;

  U.download = function (name, content, mime) {
    const blob = new Blob([content], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
})(window.Ink);
