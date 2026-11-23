/* Work Desk — saving and loading books and the library (browser storage). */
(function (Ink) {
  'use strict';
  const U = Ink.util, C = Ink.C;
  const S = Ink.store = {};

  const LIB_KEY = 'inkwell.library.v2';
  const BOOK_PREFIX = 'inkwell.book.';
  const LEGACY_KEY = 'inkwell.project.v1';   // single-book format from the first prototype

  const str = (v, d) => (v == null ? (d || '') : String(v));
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

  S.defaultSettings = () => ({ colors: { ...C.PRESETS.lilac }, font: 'serif', size: 19, width: 68, goal: 500 });

  S.normalizeSettings = function (s) {
    const d = S.defaultSettings();
    s = s || {};
    const c = s.colors || {};
    return {
      colors: {
        bg: U.isHex(c.bg) ? c.bg : d.colors.bg,
        page: U.isHex(c.page) ? c.page : d.colors.page,
        text: U.isHex(c.text) ? c.text : d.colors.text,
        accent: U.isHex(c.accent) ? c.accent : d.colors.accent
      },
      font: C.FONTS[s.font] ? s.font : d.font,
      size: U.clampNum(s.size, 14, 28, d.size),
      width: U.clampNum(s.width, 45, 100, d.width),
      goal: U.clampNum(s.goal, 0, 100000, d.goal),
      hideStickies: !!s.hideStickies
    };
  };

  S.newChapter = (title, content) => ({ id: U.uid(), title: title || 'Untitled chapter', content: content || '',
                                       synopsis: '', status: 'draft', comments: [], stickies: [] });

  S.newBook = function (title) {
    const now = Date.now();
    return {
      app: 'inkwell', version: 2, id: U.uid(),
      title: title || 'Untitled Novel', author: '',
      chapters: [S.newChapter('Chapter 1')],
      cover: '', coverThumb: '',
      notes: [], relations: [], events: [], snapshots: [],
      daily: { date: U.todayStr(), startWords: 0 },
      created: now, updated: now
    };
  };

  /* Make any loaded/imported data safe and complete. */
  S.normalizeBook = function (p) {
    if (!p || typeof p !== 'object') return S.newBook();
    const d = S.newBook();
    const chapters = Array.isArray(p.chapters) && p.chapters.length
      ? p.chapters.map((c) => ({
          id: str(c.id) || U.uid(),
          title: str(c.title, 'Untitled chapter'),
          content: U.sanitizeHtml(str(c.content), true),
          synopsis: str(c.synopsis),
          status: C.STATUSES.includes(c.status) ? c.status : 'draft',
          comments: (Array.isArray(c.comments) ? c.comments : []).filter((m) => m && U.BLOCK_ID_RE.test(str(m.blockId)))
            .map((m) => ({ id: str(m.id) || U.uid(), blockId: str(m.blockId), kind: m.kind === 'note' ? 'note' : 'comment',
                           text: str(m.text), created: num(m.created, Date.now()), resolved: !!m.resolved,
                           author: str(m.author), authorName: str(m.authorName) })),
          stickies: (Array.isArray(c.stickies) ? c.stickies : []).filter(Boolean).map((k) => ({
            id: str(k.id) || U.uid(), text: str(k.text),
            x: U.clampNum(k.x, 0, 5000, 40), y: U.clampNum(k.y, 0, 100000, 40),
            w: U.clampNum(k.w, 140, 600, 200), h: U.clampNum(k.h, 60, 600, 120),
            color: C.STICKY_COLORS[k.color] ? k.color : 'yellow'
          }))
        }))
      : d.chapters;
    const notes = Array.isArray(p.notes) ? p.notes.map((n) => {
      const note = {
        id: str(n.id) || U.uid(),
        type: C.NOTE_TYPES[n.type] ? n.type : (n.type === 'note' ? 'idea' : 'idea'),
        title: str(n.title), body: str(n.body)
      };
      if (n.pos && Number.isFinite(Number(n.pos.x)) && Number.isFinite(Number(n.pos.y))) {
        note.pos = { x: Number(n.pos.x), y: Number(n.pos.y) };
      }
      return note;
    }) : [];
    const noteIds = new Set(notes.map((n) => n.id));
    const chapterIds = new Set(chapters.map((c) => c.id));
    return {
      app: 'inkwell', version: 2,
      id: str(p.id) || U.uid(),
      title: str(p.title, 'Untitled Novel') || 'Untitled Novel',
      author: str(p.author),
      cover: U.isImageData(p.cover) ? p.cover : '',
      coverThumb: U.isImageData(p.coverThumb) ? p.coverThumb : '',
      chapters,
      notes,
      relations: (Array.isArray(p.relations) ? p.relations : [])
        .filter((r) => r && noteIds.has(str(r.from)) && noteIds.has(str(r.to)) && r.from !== r.to)
        .map((r) => ({ id: str(r.id) || U.uid(), from: str(r.from), to: str(r.to),
                       kind: C.REL_KINDS[r.kind] ? r.kind : 'other', label: str(r.label) })),
      events: (Array.isArray(p.events) ? p.events : []).filter(Boolean).map((e) => ({
        id: str(e.id) || U.uid(), title: str(e.title, 'Untitled event'), when: str(e.when),
        description: str(e.description),
        chapterId: chapterIds.has(str(e.chapterId)) ? str(e.chapterId) : '',
        people: (Array.isArray(e.people) ? e.people : []).map(String).filter((id) => noteIds.has(id))
      })),
      snapshots: (Array.isArray(p.snapshots) ? p.snapshots : [])
        .filter((s) => s && chapterIds.has(str(s.chapterId)))
        .map((s) => ({ id: str(s.id) || U.uid(), chapterId: str(s.chapterId), name: str(s.name, 'Snapshot'),
                       created: num(s.created, Date.now()), title: str(s.title), content: U.sanitizeHtml(str(s.content), true) })),
      daily: p.daily && p.daily.date ? { date: str(p.daily.date), startWords: num(p.daily.startWords, 0) } : { date: '', startWords: 0 },
      created: num(p.created, Date.now()),
      updated: num(p.updated, Date.now())
    };
  };

  S.indexEntry = (book, words, today) => ({
    id: book.id, title: book.title, author: book.author, words: words || 0, updated: book.updated,
    today: today || null, thumb: book.coverThumb || ''
  });

  function normalizeLibrary(lib) {
    const history = {};
    if (lib.history && typeof lib.history === 'object') {
      for (const [k, v] of Object.entries(lib.history)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isFinite(Number(v))) history[k] = Math.max(0, Number(v));
      }
    }
    return {
      activeId: lib.activeId ? String(lib.activeId) : null,
      books: lib.books.filter((b) => b && b.id).map((b) => ({
        id: String(b.id), title: str(b.title, 'Untitled'), author: str(b.author),
        words: num(b.words, 0), updated: num(b.updated, Date.now()),
        today: b.today && b.today.date ? { date: String(b.today.date), words: num(b.today.words, 0) } : null,
        thumb: U.isImageData(b.thumb) ? b.thumb : '',
        cloud: !!b.cloud,
        role: ['owner', 'editor', 'commenter', 'viewer'].includes(b.role) ? b.role : 'owner'
      })),
      settings: S.normalizeSettings(lib.settings),
      history
    };
  }

  S.loadLibrary = function () {
    try {
      const lib = JSON.parse(localStorage.getItem(LIB_KEY) || 'null');
      if (lib && Array.isArray(lib.books)) return normalizeLibrary(lib);
    } catch (e) { console.warn('Library could not be read', e); }

    // First run, or upgrading from the first prototype.
    const lib = { activeId: null, books: [], settings: S.defaultSettings(), history: {} };
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      if (raw) {
        const old = JSON.parse(raw);
        const book = S.normalizeBook(old);
        if (old.settings) lib.settings = S.normalizeSettings(old.settings);
        S.saveBook(book);
        lib.books.push(S.indexEntry(book, 0));
        lib.activeId = book.id;
      }
    } catch (e) { console.warn('Old project could not be migrated', e); }
    return lib;
  };

  S.saveLibrary = (lib) => localStorage.setItem(LIB_KEY, JSON.stringify(lib));

  S.loadBook = function (id) {
    try {
      const raw = localStorage.getItem(BOOK_PREFIX + id);
      if (raw) { const b = S.normalizeBook(JSON.parse(raw)); b.id = id; return b; }
    } catch (e) { console.warn('Book could not be read', e); }
    return null;
  };

  S.saveBook = (book) => localStorage.setItem(BOOK_PREFIX + book.id, JSON.stringify(book));
  S.deleteBook = (id) => localStorage.removeItem(BOOK_PREFIX + id);
  S.hasBook = (id) => localStorage.getItem(BOOK_PREFIX + id) != null;
})(window.Ink);
