/* ============ Inkwell — writing studio prototype ============
   Plain JavaScript, no libraries, no build step.
   Everything autosaves to the browser (localStorage). Use File > Save project file
   to keep a real copy on disk.                                                  */
(function () {
  'use strict';

  const STORE_KEY = 'inkwell.project.v1';
  const $ = (sel) => document.querySelector(sel);

  /* ---------- Constants ---------- */
  const PRESETS = {
    paper:    { bg: '#f4efe6', page: '#fffdf8', text: '#2b2722', accent: '#9c5b2e' },
    light:    { bg: '#eef0f3', page: '#ffffff', text: '#1f2328', accent: '#3b6fd8' },
    dark:     { bg: '#1b1c1f', page: '#26272b', text: '#e6e3dc', accent: '#d9a066' },
    forest:   { bg: '#e3eadf', page: '#f7faf4', text: '#1f2d24', accent: '#3f7d4e' },
    midnight: { bg: '#0f1626', page: '#18223a', text: '#dbe3f4', accent: '#7aa2ff' },
    rose:     { bg: '#f6e9ea', page: '#fffafa', text: '#3a2427', accent: '#c0587a' }
  };
  const FONTS = {
    serif: 'Georgia, "Times New Roman", serif',
    sans: '"Segoe UI", system-ui, sans-serif',
    mono: 'Consolas, "Courier New", monospace'
  };
  const NOTE_TYPES = {
    idea:      { label: 'Idea',        add: '+ New idea',        name: 'New idea',
                 template: '', placeholder: 'Jot down the idea — a scene, a line of dialogue, a "what if"…' },
    character: { label: 'Character',   add: '+ New character',   name: 'New character',
                 template: 'Role: \nAge: \nAppearance: \nPersonality: \nWants: \nFears: \nBackstory: \n\nNotes: ',
                 placeholder: '' },
    place:     { label: 'Place',       add: '+ New place',       name: 'New place',
                 template: 'Type: \nDescription: \nWho is here: \nWhy it matters: \n\nNotes: ',
                 placeholder: '' },
    plot:      { label: 'Plot thread', add: '+ New plot thread', name: 'New plot thread',
                 template: 'What happens: \nWho is involved: \nWhere: \nHow it resolves: \n\nNotes: ',
                 placeholder: '' }
  };
  const STATUSES = ['idea', 'draft', 'revised', 'done'];

  /* ---------- Helpers ---------- */
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const fmt = (n) => n.toLocaleString();
  const todayStr = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const safeFileName = (s) => (s || 'Untitled').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 80) || 'Untitled';
  const isHex = (s) => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  /* Keep only simple formatting tags; strip every attribute. Used on load/import/export. */
  const ALLOWED_TAGS = new Set(['P', 'H2', 'H3', 'BLOCKQUOTE', 'STRONG', 'B', 'EM', 'I', 'U', 'BR', 'UL', 'OL', 'LI', 'HR', 'DIV']);
  const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'LINK', 'META', 'SVG', 'MATH']);
  function sanitizeHtml(html) {
    const doc = new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html');
    const clean = (node) => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 1) {
          if (DROP_TAGS.has(child.tagName)) { child.remove(); continue; }
          clean(child);
          if (!ALLOWED_TAGS.has(child.tagName)) { child.replaceWith(...child.childNodes); continue; }
          for (const a of Array.from(child.attributes)) child.removeAttribute(a.name);
        } else if (child.nodeType !== 3) {
          child.remove();
        }
      }
    };
    clean(doc.body);
    return doc.body.innerHTML;
  }

  function htmlToPlain(html) {
    return (html || '')
      .replace(/<hr\s*\/?>/gi, '\n\n* * *\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|h2|h3|blockquote|li|div|ul|ol)>/gi, '\n\n')
      .replace(/<li>/gi, '• ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function countWords(text) {
    const m = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu);
    return m ? m.length : 0;
  }

  function htmlToMarkdown(html) {
    const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
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
    for (const c of doc.body.childNodes) {
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
  }

  /* ---------- Project model ---------- */
  function defaultProject() {
    return {
      app: 'inkwell',
      version: 1,
      title: 'Untitled Novel',
      author: '',
      chapters: [{ id: uid(), title: 'Chapter 1', content: '', synopsis: '', status: 'draft' }],
      notes: [],
      settings: { colors: { ...PRESETS.paper }, font: 'serif', size: 19, width: 68, goal: 500 },
      daily: { date: todayStr(), startWords: 0 },
      updated: Date.now()
    };
  }

  function normalize(p) {
    const d = defaultProject();
    if (!p || typeof p !== 'object') return d;
    const s = p.settings || {};
    const colors = s.colors || {};
    return {
      app: 'inkwell',
      version: 1,
      title: String(p.title || 'Untitled Novel'),
      author: String(p.author || ''),
      chapters: Array.isArray(p.chapters) && p.chapters.length
        ? p.chapters.map((c) => ({
            id: String(c.id || uid()),
            title: String(c.title || 'Untitled chapter'),
            content: sanitizeHtml(String(c.content || '')),
            synopsis: String(c.synopsis || ''),
            status: STATUSES.includes(c.status) ? c.status : 'draft'
          }))
        : d.chapters,
      notes: Array.isArray(p.notes)
        ? p.notes.map((n) => ({
            id: String(n.id || uid()),
            type: NOTE_TYPES[n.type] ? n.type : 'idea',
            title: String(n.title || ''),
            body: String(n.body || '')
          }))
        : [],
      settings: {
        colors: {
          bg: isHex(colors.bg) ? colors.bg : d.settings.colors.bg,
          page: isHex(colors.page) ? colors.page : d.settings.colors.page,
          text: isHex(colors.text) ? colors.text : d.settings.colors.text,
          accent: isHex(colors.accent) ? colors.accent : d.settings.colors.accent
        },
        font: FONTS[s.font] ? s.font : 'serif',
        size: clampNum(s.size, 14, 28, 19),
        width: clampNum(s.width, 45, 100, 68),
        goal: clampNum(s.goal, 0, 100000, 500)
      },
      daily: p.daily && p.daily.date
        ? { date: String(p.daily.date), startWords: Number(p.daily.startWords) || 0 }
        : { date: '', startWords: 0 },
      updated: Number(p.updated) || Date.now()
    };
  }
  function clampNum(v, min, max, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { console.warn('Could not read saved project', e); }
    return defaultProject();
  }

  /* ---------- State ---------- */
  let project = loadLocal();
  let current = { kind: 'chapter', id: project.chapters[0].id };
  let noteType = 'idea';
  let fileHandle = null;
  const wordCache = new Map();

  const getChapter = (id) => project.chapters.find((c) => c.id === id);
  const getNote = (id) => project.notes.find((n) => n.id === id);

  function chapterWords(ch) {
    const cached = wordCache.get(ch.id);
    if (cached && cached.html === ch.content) return cached.n;
    const n = countWords(htmlToPlain(ch.content));
    wordCache.set(ch.id, { html: ch.content, n });
    return n;
  }
  const totalWords = () => project.chapters.reduce((sum, ch) => sum + chapterWords(ch), 0);

  function rollDaily(total) {
    if (project.daily.date !== todayStr()) project.daily = { date: todayStr(), startWords: total };
  }

  /* ---------- Elements ---------- */
  const el = {
    projectTitle: $('#projectTitle'), saveStatus: $('#saveStatus'),
    chapterList: $('#chapterList'), noteList: $('#noteList'), noteTabs: $('#noteTabs'), addNote: $('#addNote'),
    chapterView: $('#chapterView'), noteView: $('#noteView'),
    chapterTitle: $('#chapterTitle'), editor: $('#editor'), toolbar: $('#toolbar'),
    noteKind: $('#noteKind'), noteTitle: $('#noteTitle'), noteBody: $('#noteBody'), appearsIn: $('#appearsIn'),
    chapterDetails: $('#chapterDetails'), chapterStatus: $('#chapterStatus'), chapterSynopsis: $('#chapterSynopsis'),
    statChapter: $('#statChapter'), statTotal: $('#statTotal'), statChapters: $('#statChapters'),
    statToday: $('#statToday'), goalFill: $('#goalFill'), goalLabel: $('#goalLabel'),
    sbChapter: $('#sbChapter'), sbTotal: $('#sbTotal'), sbToday: $('#sbToday'), sbFile: $('#sbFile'),
    fileMenu: $('#fileMenu'), fileInput: $('#fileInput'), settingsDialog: $('#settingsDialog')
  };

  /* ---------- Saving ---------- */
  let fileWriting = false, fileWritePending = false;

  function setStatus(text) { el.saveStatus.textContent = text; }

  const scheduleSave = debounce(saveNow, 700);
  function markDirty() { setStatus('Saving…'); scheduleSave(); }

  function saveNow() {
    project.updated = Date.now();
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(project));
      setStatus('Saved ✓');
    } catch (e) {
      console.error(e);
      setStatus('⚠ Could not save in browser — use File > Save project file');
    }
    if (fileHandle) writeFileQueued();
  }

  async function writeFileQueued() {
    if (fileWriting) { fileWritePending = true; return; }
    fileWriting = true;
    try {
      await writeToHandle(fileHandle, JSON.stringify(project, null, 2));
      setStatus('Saved ✓');
    } catch (e) {
      console.error(e);
      setStatus('Saved in browser · ⚠ file write failed');
    }
    fileWriting = false;
    if (fileWritePending) { fileWritePending = false; writeFileQueued(); }
  }

  async function writeToHandle(handle, text) {
    const w = await handle.createWritable();
    await w.write(text);
    await w.close();
  }

  function updateFileLabel() {
    el.sbFile.textContent = fileHandle
      ? 'Linked to file: ' + fileHandle.name + ' (autosaves)'
      : 'Saved in this browser · File > Save project file to keep a copy';
  }

  /* ---------- Theme / settings ---------- */
  function luminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }

  function applySettings() {
    const s = project.settings, root = document.documentElement.style;
    root.setProperty('--bg', s.colors.bg);
    root.setProperty('--page', s.colors.page);
    root.setProperty('--text', s.colors.text);
    root.setProperty('--accent', s.colors.accent);
    root.setProperty('--editor-font', FONTS[s.font]);
    root.setProperty('--editor-size', s.size + 'px');
    root.setProperty('--page-width', s.width + 'ch');
    root.colorScheme = luminance(s.colors.bg) < 0.5 ? 'dark' : 'light';
  }

  function fillSettingsForm() {
    const s = project.settings;
    $('#setAuthor').value = project.author;
    $('#setFont').value = s.font;
    $('#setSize').value = s.size; $('#setSizeVal').textContent = s.size + 'px';
    $('#setWidth').value = s.width; $('#setWidthVal').textContent = s.width + ' characters';
    $('#setGoal').value = s.goal;
    $('#colBg').value = s.colors.bg; $('#colPage').value = s.colors.page;
    $('#colText').value = s.colors.text; $('#colAccent').value = s.colors.accent;
  }

  function bindSettings() {
    $('#btnSettings').addEventListener('click', () => { fillSettingsForm(); el.settingsDialog.showModal(); });
    $('#setAuthor').addEventListener('input', (e) => { project.author = e.target.value; markDirty(); });
    $('#setFont').addEventListener('change', (e) => { project.settings.font = e.target.value; applySettings(); markDirty(); });
    $('#setSize').addEventListener('input', (e) => {
      project.settings.size = Number(e.target.value); $('#setSizeVal').textContent = e.target.value + 'px';
      applySettings(); markDirty();
    });
    $('#setWidth').addEventListener('input', (e) => {
      project.settings.width = Number(e.target.value); $('#setWidthVal').textContent = e.target.value + ' characters';
      applySettings(); markDirty();
    });
    $('#setGoal').addEventListener('input', (e) => {
      project.settings.goal = clampNum(e.target.value, 0, 100000, 0); updateStats(); markDirty();
    });
    const colorMap = { colBg: 'bg', colPage: 'page', colText: 'text', colAccent: 'accent' };
    Object.entries(colorMap).forEach(([id, key]) => {
      $('#' + id).addEventListener('input', (e) => { project.settings.colors[key] = e.target.value; applySettings(); markDirty(); });
    });
    $('#presets').addEventListener('click', (e) => {
      const name = e.target.dataset && e.target.dataset.preset;
      if (!name || !PRESETS[name]) return;
      project.settings.colors = { ...PRESETS[name] };
      applySettings(); fillSettingsForm(); markDirty();
    });
  }

  /* ---------- Rendering: lists ---------- */
  let dragId = null;

  function renderChapters() {
    el.chapterList.textContent = '';
    project.chapters.forEach((ch, i) => {
      const li = document.createElement('li');
      li.className = 'item' + (current.kind === 'chapter' && current.id === ch.id ? ' active' : '');
      li.draggable = true;
      li.dataset.id = ch.id;
      li.title = ch.synopsis || ch.title;

      const num = document.createElement('span'); num.className = 'num'; num.textContent = i + 1;
      const dot = document.createElement('span'); dot.className = 'status-dot status-' + ch.status;
      dot.title = ch.status;
      const name = document.createElement('span'); name.className = 'name'; name.textContent = ch.title || 'Untitled chapter';
      const meta = document.createElement('span'); meta.className = 'meta'; meta.textContent = fmt(chapterWords(ch));
      li.append(num, dot, name, meta);

      li.addEventListener('click', () => openChapter(ch.id));
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
        const after = isAfter(e, li);
        const from = project.chapters.findIndex((c) => c.id === dragId);
        const [moved] = project.chapters.splice(from, 1);
        let to = project.chapters.findIndex((c) => c.id === ch.id);
        if (after) to++;
        project.chapters.splice(to, 0, moved);
        dragId = null;
        renderChapters();
        markDirty();
      });
      el.chapterList.append(li);
    });
  }
  const isAfter = (e, li) => { const r = li.getBoundingClientRect(); return e.clientY > r.top + r.height / 2; };

  function renderNotes() {
    el.noteList.textContent = '';
    for (const btn of el.noteTabs.querySelectorAll('button')) btn.classList.toggle('active', btn.dataset.type === noteType);
    el.addNote.textContent = NOTE_TYPES[noteType].add;
    const notes = project.notes.filter((n) => n.type === noteType);
    if (!notes.length) {
      const li = document.createElement('li');
      li.className = 'item empty';
      li.textContent = 'Nothing here yet.';
      el.noteList.append(li);
      return;
    }
    for (const n of notes) {
      const li = document.createElement('li');
      li.className = 'item' + (current.kind === 'note' && current.id === n.id ? ' active' : '');
      li.dataset.id = n.id;
      const name = document.createElement('span'); name.className = 'name'; name.textContent = n.title || 'Untitled';
      li.append(name);
      li.addEventListener('click', () => openNote(n.id));
      el.noteList.append(li);
    }
  }

  /* ---------- Opening items ---------- */
  function openChapter(id) {
    const ch = getChapter(id);
    if (!ch) return;
    current = { kind: 'chapter', id };
    el.noteView.hidden = true;
    el.chapterView.hidden = false;
    el.chapterDetails.hidden = false;
    el.chapterTitle.value = ch.title;
    el.editor.innerHTML = ch.content;
    el.chapterStatus.value = ch.status;
    el.chapterSynopsis.value = ch.synopsis;
    updateEmptyState();
    renderChapters();
    renderNotes();
    updateStats();
    $('#main').scrollTop = 0;
  }

  function openNote(id) {
    const n = getNote(id);
    if (!n) return;
    current = { kind: 'note', id };
    if (noteType !== n.type) noteType = n.type;
    el.chapterView.hidden = true;
    el.noteView.hidden = false;
    el.chapterDetails.hidden = true;
    el.noteKind.textContent = NOTE_TYPES[n.type].label;
    el.noteTitle.value = n.title;
    el.noteTitle.placeholder = n.type === 'character' ? 'Name' : 'Title';
    el.noteBody.value = n.body;
    el.noteBody.placeholder = NOTE_TYPES[n.type].placeholder;
    renderAppearsIn(n);
    renderChapters();
    renderNotes();
    updateStats();
    $('#main').scrollTop = 0;
  }

  /* Which chapters mention this character/place (full name or first name). */
  function renderAppearsIn(n) {
    const box = el.appearsIn;
    if (n.type !== 'character' && n.type !== 'place') { box.hidden = true; return; }
    box.hidden = false;
    box.textContent = '';
    const name = n.title.trim();
    if (name.length < 2 || name === NOTE_TYPES[n.type].name) {
      box.textContent = 'Give it a name to see which chapters mention it.';
      return;
    }
    const terms = [name];
    const first = name.split(/\s+/)[0];
    if (n.type === 'character' && first !== name && first.length >= 3) terms.push(first);
    const re = new RegExp('(^|[^\\p{L}\\p{N}])(' + terms.map(escapeRegex).join('|') + ')(?=$|[^\\p{L}\\p{N}])', 'iu');
    const hits = project.chapters.filter((ch) => re.test(htmlToPlain(ch.content)));
    if (!hits.length) { box.textContent = 'Not mentioned in any chapter yet.'; return; }
    box.append('Appears in: ');
    for (const ch of hits) {
      const a = document.createElement('a');
      a.textContent = ch.title || 'Untitled chapter';
      a.addEventListener('click', () => openChapter(ch.id));
      box.append(a);
    }
  }

  /* ---------- Stats ---------- */
  function updateStats() {
    const total = totalWords();
    rollDaily(total);
    const today = Math.max(0, total - project.daily.startWords);
    const goal = project.settings.goal;
    const ch = current.kind === 'chapter' ? getChapter(current.id) : null;
    const chWords = ch ? chapterWords(ch) : 0;

    el.statChapter.textContent = fmt(chWords);
    el.statTotal.textContent = fmt(total);
    el.statChapters.textContent = project.chapters.length;
    el.statToday.textContent = fmt(today);
    const pct = goal > 0 ? Math.min(100, (today / goal) * 100) : 0;
    el.goalFill.style.width = pct + '%';
    el.goalFill.classList.toggle('met', goal > 0 && today >= goal);
    el.goalLabel.textContent = goal > 0
      ? (today >= goal ? '🎉 Daily goal reached (' + fmt(goal) + ' words)' : 'Daily goal: ' + fmt(goal) + ' words')
      : 'No daily goal set';

    el.sbChapter.textContent = ch ? fmt(chWords) + ' words in chapter' : '';
    el.sbTotal.textContent = fmt(total) + ' words total';
    el.sbToday.textContent = 'Today ' + fmt(today) + (goal > 0 ? ' / ' + fmt(goal) : '');

    if (ch) {
      const li = el.chapterList.querySelector('[data-id="' + CSS.escape(ch.id) + '"] .meta');
      if (li) li.textContent = fmt(chWords);
    }
  }
  const updateStatsSoon = debounce(updateStats, 250);

  function updateEmptyState() {
    el.editor.classList.toggle('is-empty', el.editor.textContent.trim() === '' && !el.editor.querySelector('hr,li'));
  }

  /* ---------- Editor ---------- */
  function bindEditor() {
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* ignore */ }

    el.editor.addEventListener('input', () => {
      const ch = getChapter(current.id);
      if (!ch) return;
      ch.content = el.editor.innerHTML;
      updateEmptyState();
      updateStatsSoon();
      markDirty();
    });

    // Paste as clean text (no fonts/colours from Word or websites), keeping paragraphs.
    el.editor.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      if (!text) return;
      const paras = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/);
      if (paras.length === 1) {
        document.execCommand('insertText', false, text);
      } else {
        const html = paras.map((p) => '<p>' + escapeHtml(p.trim()).replace(/\n/g, '<br>') + '</p>').join('');
        document.execCommand('insertHTML', false, html);
      }
    });

    // Toolbar: keep the selection in the editor while clicking buttons.
    el.toolbar.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
    el.toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (!el.editor.contains(document.getSelection().anchorNode)) el.editor.focus();
      if (btn.dataset.cmd) {
        document.execCommand(btn.dataset.cmd, false, null);
      } else if (btn.dataset.block) {
        const tag = btn.dataset.block;
        const currentBlock = String(document.queryCommandValue('formatBlock') || '').toLowerCase();
        const target = (currentBlock === tag && tag !== 'p') ? 'p' : tag;
        document.execCommand('formatBlock', false, '<' + target + '>');
      }
      updateToolbarState();
    });

    document.addEventListener('selectionchange', () => {
      if (el.editor.contains(document.getSelection().anchorNode)) updateToolbarState();
    });

    el.chapterTitle.addEventListener('input', () => {
      const ch = getChapter(current.id);
      if (!ch) return;
      ch.title = el.chapterTitle.value;
      const name = el.chapterList.querySelector('[data-id="' + CSS.escape(ch.id) + '"] .name');
      if (name) name.textContent = ch.title || 'Untitled chapter';
      markDirty();
    });
    el.chapterTitle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); el.editor.focus(); }
    });

    el.chapterStatus.addEventListener('change', () => {
      const ch = getChapter(current.id);
      if (!ch) return;
      ch.status = el.chapterStatus.value;
      renderChapters();
      markDirty();
    });
    el.chapterSynopsis.addEventListener('input', () => {
      const ch = getChapter(current.id);
      if (!ch) return;
      ch.synopsis = el.chapterSynopsis.value;
      markDirty();
    });
  }

  function updateToolbarState() {
    for (const btn of el.toolbar.querySelectorAll('[data-cmd="bold"],[data-cmd="italic"],[data-cmd="underline"]')) {
      let on = false;
      try { on = document.queryCommandState(btn.dataset.cmd); } catch (e) { /* ignore */ }
      btn.classList.toggle('on', on);
    }
  }

  /* ---------- Chapters & notes: add / delete ---------- */
  function addChapter() {
    const ch = { id: uid(), title: 'Chapter ' + (project.chapters.length + 1), content: '', synopsis: '', status: 'draft' };
    const idx = current.kind === 'chapter' ? project.chapters.findIndex((c) => c.id === current.id) : -1;
    project.chapters.splice(idx >= 0 ? idx + 1 : project.chapters.length, 0, ch);
    // Renumber default "Chapter N" titles so they stay in order.
    project.chapters.forEach((c, i) => { if (/^Chapter \d+$/.test(c.title)) c.title = 'Chapter ' + (i + 1); });
    openChapter(ch.id);
    el.chapterTitle.focus();
    el.chapterTitle.select();
    markDirty();
  }

  function deleteChapter() {
    const ch = getChapter(current.id);
    if (!ch) return;
    if (project.chapters.length === 1) { alert('A manuscript needs at least one chapter.'); return; }
    const words = chapterWords(ch);
    if (!confirm('Delete "' + (ch.title || 'Untitled chapter') + '"' + (words ? ' (' + fmt(words) + ' words)' : '') + '? This cannot be undone.')) return;
    const idx = project.chapters.indexOf(ch);
    project.chapters.splice(idx, 1);
    wordCache.delete(ch.id);
    openChapter(project.chapters[Math.max(0, idx - 1)].id);
    markDirty();
  }

  function addNote() {
    const t = NOTE_TYPES[noteType];
    const n = { id: uid(), type: noteType, title: t.name, body: t.template };
    project.notes.push(n);
    openNote(n.id);
    el.noteTitle.focus();
    el.noteTitle.select();
    markDirty();
  }

  function deleteNote() {
    const n = getNote(current.id);
    if (!n) return;
    if (!confirm('Delete "' + (n.title || 'Untitled') + '"? This cannot be undone.')) return;
    project.notes = project.notes.filter((x) => x.id !== n.id);
    openChapter(project.chapters[0].id);
    markDirty();
  }

  function bindLists() {
    $('#addChapter').addEventListener('click', addChapter);
    $('#deleteChapter').addEventListener('click', deleteChapter);
    el.addNote.addEventListener('click', addNote);
    $('#deleteNote').addEventListener('click', deleteNote);
    el.noteTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      noteType = btn.dataset.type;
      renderNotes();
    });
    el.noteTitle.addEventListener('input', () => {
      const n = getNote(current.id);
      if (!n) return;
      n.title = el.noteTitle.value;
      const name = el.noteList.querySelector('[data-id="' + CSS.escape(n.id) + '"] .name');
      if (name) name.textContent = n.title || 'Untitled';
      renderAppearsInSoon(n);
      markDirty();
    });
    el.noteBody.addEventListener('input', () => {
      const n = getNote(current.id);
      if (!n) return;
      n.body = el.noteBody.value;
      markDirty();
    });
    el.projectTitle.addEventListener('input', () => {
      project.title = el.projectTitle.value;
      document.title = (project.title || 'Untitled') + ' — Inkwell';
      markDirty();
    });
  }
  const renderAppearsInSoon = debounce(renderAppearsIn, 300);

  /* ---------- Files: open / save / export ---------- */
  const FILE_TYPES = [{ description: 'Inkwell project', accept: { 'application/json': ['.json'] } }];

  async function saveProjectFile(saveAs) {
    saveNow();
    const data = JSON.stringify(project, null, 2);
    if ('showSaveFilePicker' in window) {
      try {
        if (!fileHandle || saveAs) {
          fileHandle = await window.showSaveFilePicker({ suggestedName: safeFileName(project.title) + '.inkwell.json', types: FILE_TYPES });
        }
        await writeToHandle(fileHandle, data);
        setStatus('Saved to ' + fileHandle.name + ' ✓');
        updateFileLabel();
      } catch (e) {
        if (e.name !== 'AbortError') { console.error(e); alert('Could not save the file: ' + e.message); }
      }
    } else {
      download(safeFileName(project.title) + '.inkwell.json', data, 'application/json');
    }
  }

  async function openProjectFile() {
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await window.showOpenFilePicker({ types: FILE_TYPES, multiple: false });
        const file = await handle.getFile();
        if (loadProjectText(await file.text())) {
          fileHandle = handle;
          updateFileLabel();
          setStatus('Opened ' + handle.name);
        }
      } catch (e) {
        if (e.name !== 'AbortError') { console.error(e); alert('Could not open the file: ' + e.message); }
      }
    } else {
      el.fileInput.value = '';
      el.fileInput.click();
    }
  }

  function loadProjectText(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { alert('That file is not a valid Inkwell project.'); return false; }
    if (!data || !Array.isArray(data.chapters)) { alert('That file is not a valid Inkwell project.'); return false; }
    if (!confirm('Open "' + (data.title || 'Untitled') + '"? It will replace the project open now. (Save the current one to a file first if you want to keep it.)')) return false;
    replaceProject(normalize(data));
    return true;
  }

  function replaceProject(p) {
    project = p;
    wordCache.clear();
    rollDaily(totalWords());
    applySettings();
    el.projectTitle.value = project.title;
    document.title = project.title + ' — Inkwell';
    noteType = 'idea';
    openChapter(project.chapters[0].id);
    saveNow();
  }

  function newProject() {
    if (!confirm('Start a new, empty project? The current one will be replaced. Save it to a file first if you want to keep it.')) return;
    const keep = project.settings;
    const p = defaultProject();
    p.settings = keep;             // keep the user's theme and preferences
    p.author = project.author;
    fileHandle = null;
    updateFileLabel();
    replaceProject(p);
  }

  function download(name, content, mime) {
    const blob = new Blob([content], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function exportTxt() {
    let out = project.title + (project.author ? '\nby ' + project.author : '') + '\n\n\n';
    out += project.chapters.map((ch) => ch.title + '\n\n' + htmlToPlain(sanitizeHtml(ch.content))).join('\n\n\n');
    download(safeFileName(project.title) + '.txt', out.replace(/\n/g, '\r\n'), 'text/plain');
  }

  function exportMd() {
    let out = '# ' + project.title + '\n\n' + (project.author ? '*by ' + project.author + '*\n\n' : '');
    out += project.chapters.map((ch) => '## ' + ch.title + '\n\n' + htmlToMarkdown(sanitizeHtml(ch.content))).join('\n\n');
    download(safeFileName(project.title) + '.md', out + '\n', 'text/markdown');
  }

  function manuscriptHtml() {
    const t = escapeHtml(project.title), a = escapeHtml(project.author);
    const chapters = project.chapters.map((ch) =>
      '<section class="chapter"><h2>' + escapeHtml(ch.title) + '</h2>' + sanitizeHtml(ch.content) + '</section>').join('\n');
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + t + '</title><style>' +
      'body{font-family:Georgia,"Times New Roman",serif;font-size:12pt;line-height:1.7;max-width:36em;margin:3em auto;padding:0 1em;color:#111}' +
      '.title-page{text-align:center;padding-top:30vh}.title-page h1{font-size:28pt;margin:0 0 .4em}.title-page p{font-size:14pt}' +
      '.chapter{break-before:page;page-break-before:always;padding-top:3em}.chapter h2{text-align:center;font-size:18pt;margin-bottom:2em}' +
      'p{margin:0;text-indent:1.5em}h2+p,hr+p,blockquote+p,.chapter>p:first-of-type{text-indent:0}' +
      'blockquote{margin:1em 2em;font-style:italic}blockquote p{text-indent:0}' +
      'hr{border:0;text-align:center;margin:1.4em 0}hr::after{content:"* * *";letter-spacing:.5em}' +
      '@page{margin:2.5cm}' +
      '</style></head><body><div class="title-page"><h1>' + t + '</h1>' + (a ? '<p>by ' + a + '</p>' : '') + '</div>' +
      chapters + '</body></html>';
  }

  function exportHtml() { download(safeFileName(project.title) + '.html', manuscriptHtml(), 'text/html'); }

  function printManuscript() {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
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
      const actions = {
        open: openProjectFile, save: () => saveProjectFile(false), saveAs: () => saveProjectFile(true),
        exportTxt, exportMd, exportHtml, print: printManuscript, new: newProject
      };
      if (actions[btn.dataset.action]) actions[btn.dataset.action]();
    });
    el.fileInput.addEventListener('change', async () => {
      const file = el.fileInput.files[0];
      if (!file) return;
      if (loadProjectText(await file.text())) { fileHandle = null; updateFileLabel(); }
    });
  }

  /* ---------- Focus mode & shortcuts ---------- */
  function setFocus(on) {
    document.body.classList.toggle('focus', on);
    if (on && current.kind === 'chapter') el.editor.focus();
  }

  function bindGlobal() {
    $('#btnFocus').addEventListener('click', () => setFocus(true));
    $('#exitFocus').addEventListener('click', () => setFocus(false));
    document.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveProjectFile(e.shiftKey); }
      else if (e.key === 'Escape') {
        if (document.body.classList.contains('focus')) setFocus(false);
        el.fileMenu.hidden = true;
      }
    });
    // Save immediately if the tab is closed or hidden.
    window.addEventListener('beforeunload', saveNow);
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
  }

  /* ---------- Start ---------- */
  function init() {
    applySettings();
    el.projectTitle.value = project.title;
    document.title = project.title + ' — Inkwell';
    rollDaily(totalWords());
    bindSettings();
    bindEditor();
    bindLists();
    bindFileMenu();
    bindGlobal();
    updateFileLabel();
    openChapter(project.chapters[0].id);
    setStatus('Saved ✓');
  }

  init();
})();
