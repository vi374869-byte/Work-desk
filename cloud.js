/* Work Desk — Cloud sync engine (Supabase).
   - Every paragraph is stored as its own row, so people can write in different paragraphs of the
     same chapter at the same time. If two people type in the SAME paragraph at once, the last save wins.
   - Changes are detected by comparing the book with what was last synced, so every feature
     (notebook, map, timeline, stickies…) syncs without special code.
   - Snapshots and writing stats stay on your own computer. */
(function (Ink) {
  'use strict';
  const U = Ink.util, S = Ink.store;
  const CL = Ink.cloud = {};

  const CFG_KEY = 'workdesk.cloud.config';
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
  const COLORS = ['#c13fb0', '#3b6fd8', '#3fa76a', '#e07b2f', '#8e6cc4', '#d0473a', '#1c9aa0', '#b8860b'];
  const BLOCK_TAGS = new Set(['P', 'H2', 'H3', 'BLOCKQUOTE', 'UL', 'OL', 'HR', 'DIV']);

  let client = null, user = null, profile = null, sdkPromise = null, authListener = false;
  let cb = null;              // the open cloud book: { id, role, channel, last, queue, loaded, … }
  let lastLocalInput = 0;

  /* ================= Config & connection ================= */
  CL.config = () => { try { return JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); } catch (e) { return null; } };
  CL.isConfigured = () => !!CL.config();
  CL.setConfig = function (url, key) {
    url = String(url || '').trim().replace(/\/+$/, '');
    key = String(key || '').trim();
    if (!/^https:\/\/[a-z0-9.-]+$/i.test(url)) throw new Error('The Project URL should look like https://abcdefgh.supabase.co');
    if (key.length < 20) throw new Error('That key looks too short. Copy the whole "anon public" (or "publishable") key.');
    localStorage.setItem(CFG_KEY, JSON.stringify({ url, key }));
    client = null; user = null; profile = null;
  };
  CL.clearConfig = async function () {
    await CL.closeBook();
    try { if (client) await client.auth.signOut(); } catch (e) { /* ignore */ }
    localStorage.removeItem(CFG_KEY);
    client = null; user = null; profile = null;
  };

  CL.user = () => user;
  CL.userId = () => (user ? user.id : '');
  CL.profile = () => profile;
  CL.displayName = () => (profile ? profile.name : '');
  CL.active = () => !!cb;
  CL.bookId = () => (cb ? cb.id : null);
  CL.role = () => (cb ? cb.role : 'owner');
  CL.canEdit = () => !cb || cb.role === 'owner' || cb.role === 'editor';
  CL.canComment = () => !cb || cb.role !== 'viewer';
  CL.isOwner = () => !cb || cb.role === 'owner';

  function loadSdk() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    if (!sdkPromise) {
      sdkPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = SDK_URL;
        s.onload = () => (window.supabase ? resolve() : reject(new Error('Supabase library did not load.')));
        s.onerror = () => { sdkPromise = null; reject(new Error('Could not download the Supabase library. Check your internet connection.')); };
        document.head.append(s);
      });
    }
    return sdkPromise;
  }

  /* Connect to the saved project and restore the signed-in session (if any). */
  CL.connect = async function () {
    const cfg = CL.config();
    if (!cfg) throw new Error('Collaboration is not set up yet.');
    await loadSdk();
    if (!client) {
      client = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, storageKey: 'workdesk.auth', autoRefreshToken: true } });
      authListener = false;
    }
    const { data } = await client.auth.getSession();
    user = data && data.session ? data.session.user : null;
    if (user && !profile) await ensureProfile();
    if (!authListener) {
      authListener = true;
      client.auth.onAuthStateChange((event, session) => {
        const was = user && user.id;
        user = session ? session.user : null;
        if ((user && user.id) !== was) { profile = null; if (Ink.collab) Ink.collab.onAuthChange(); }
      });
    }
    return client;
  };

  async function q(promise) {
    const { data, error } = await promise;
    if (error) throw new Error(error.message || String(error));
    return data;
  }

  function colorFor(id) {
    let h = 0;
    for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return COLORS[h % COLORS.length];
  }

  async function ensureProfile(name) {
    const rows = await q(client.from('profiles').select('id,name,color').eq('id', user.id));
    if (rows && rows[0]) { profile = rows[0]; return profile; }
    const meta = user.user_metadata || {};
    profile = { id: user.id, name: (name || meta.name || (user.email || 'Writer').split('@')[0]).slice(0, 60), color: colorFor(user.id) };
    await q(client.from('profiles').insert(profile));
    return profile;
  }

  /* ================= Accounts ================= */
  CL.signUp = async function (email, password, name) {
    await CL.connect();
    const { data, error } = await client.auth.signUp({ email, password, options: { data: { name } } });
    if (error) throw new Error(error.message);
    if (!data.session) return { needsConfirm: true };
    user = data.user;
    await ensureProfile(name);
    return { ok: true };
  };
  CL.signIn = async function (email, password) {
    await CL.connect();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    user = data.user;
    profile = null;
    await ensureProfile();
    return { ok: true };
  };
  CL.signOut = async function () {
    await CL.closeBook();
    if (client) await client.auth.signOut();
    user = null; profile = null;
  };
  CL.setName = async function (name) {
    name = String(name || '').trim().slice(0, 60);
    if (!name) return;
    await q(client.from('profiles').update({ name }).eq('id', user.id));
    profile.name = name;
    track();
  };

  /* ================= Library ================= */
  CL.listBooks = async function () {
    const rows = await q(client.from('book_members').select('role, books(id,title,updated_at,cover_thumb)').eq('user_id', user.id));
    return (rows || []).filter((r) => r.books).map((r) => ({
      id: r.books.id, title: r.books.title, role: r.role,
      updated: Date.parse(r.books.updated_at) || Date.now(),
      thumb: U.isImageData(r.books.cover_thumb) ? r.books.cover_thumb : ''
    }));
  };

  CL.deleteBook = (id) => q(client.from('books').delete().eq('id', id));
  CL.leaveBook = (id) => q(client.from('book_members').delete().eq('book_id', id).eq('user_id', user.id));

  /* ================= Members & invites ================= */
  CL.members = async function (bookId) {
    return await q(client.from('book_members').select('user_id, role, profiles(name,color)').eq('book_id', bookId || cb.id));
  };
  CL.setRole = (userId, role) => q(client.from('book_members').update({ role }).eq('book_id', cb.id).eq('user_id', userId));
  CL.removeMember = (userId) => q(client.from('book_members').delete().eq('book_id', cb.id).eq('user_id', userId));
  CL.invites = () => q(client.from('invites').select('code, role, created_at').eq('book_id', cb.id).order('created_at', { ascending: false }));
  CL.createInvite = async function (role) {
    const code = Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(16).padStart(2, '0')).join('');
    await q(client.from('invites').insert({ code, book_id: cb.id, role }));
    return CL.inviteString(code, role);
  };
  CL.deleteInvite = (code) => q(client.from('invites').delete().eq('code', code));

  /* An invite carries the project address too, so a new collaborator needs no setup. */
  CL.inviteString = function (code, role) {
    const cfg = CL.config();
    const json = JSON.stringify({ u: cfg.url, k: cfg.key, c: code, t: Ink.book() ? Ink.book().title : '', r: role });
    return 'WD1-' + btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  CL.parseInvite = function (str) {
    str = String(str || '').trim();
    const m = str.match(/WD1-([A-Za-z0-9_-]+)/);
    if (!m) throw new Error('That does not look like a Work Desk invite code (it starts with WD1-).');
    let b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const data = JSON.parse(decodeURIComponent(escape(atob(b64))));
    if (!data.u || !data.k || !data.c) throw new Error('That invite code is incomplete.');
    return data;
  };
  CL.joinWithCode = async function (code) {
    const id = await q(client.rpc('join_book', { invite_code: code }));
    return id;
  };

  CL.sendMessage = async function (body) {
    body = String(body || '').trim().slice(0, 2000);
    if (!body || !cb) return;
    await q(client.from('messages').insert({ book_id: cb.id, user_id: user.id, name: profile.name, body }));
  };
  CL.loadMessages = async function () {
    const rows = await q(client.from('messages').select('id,user_id,name,body,created_at').eq('book_id', cb.id)
      .order('created_at', { ascending: false }).range(0, 99));
    return (rows || []).reverse();
  };

  /* ================= Upload a local book ================= */
  /* Make sure every top-level item is a block element with a unique id. Returns true if changed. */
  function normalizeBlocks(root) {
    let changed = false;
    const seen = new Set();
    let run = null;
    for (const node of Array.from(root.childNodes)) {
      const isBlock = node.nodeType === 1 && BLOCK_TAGS.has(node.tagName);
      if (!isBlock) {
        if (node.nodeType === 3 && !node.textContent.trim() && !run) { node.remove(); changed = true; continue; }
        if (node.nodeType !== 1 && node.nodeType !== 3) { node.remove(); changed = true; continue; }
        if (!run) { run = document.createElement('p'); root.insertBefore(run, node); }
        run.append(node);
        changed = true;
        continue;
      }
      run = null;
    }
    for (const el of Array.from(root.children)) {
      const id = el.getAttribute('data-b');
      if (!id || !U.BLOCK_ID_RE.test(id) || seen.has(id)) { el.setAttribute('data-b', U.uid()); changed = true; }
      seen.add(el.getAttribute('data-b'));
    }
    return changed;
  }

  CL.shareBook = async function (local) {
    if (!user) throw new Error('Please sign in first.');
    const id = crypto.randomUUID();
    const chMap = new Map();
    const chapters = [], blocks = [], comments = [];
    local.chapters.forEach((ch, i) => {
      const cid = U.uid();
      chMap.set(ch.id, cid);
      const body = U.parseHtml(U.sanitizeHtml(ch.content, true));
      normalizeBlocks(body);
      const idMap = new Map();
      Array.from(body.children).forEach((el, j) => {
        const nid = U.uid();
        idMap.set(el.getAttribute('data-b'), nid);
        el.setAttribute('data-b', nid);
        blocks.push({ id: nid, chapter_id: cid, book_id: id, pos: (j + 1) * 1024, html: el.outerHTML });
      });
      chapters.push({ id: cid, book_id: id, pos: i, title: ch.title, synopsis: ch.synopsis, status: ch.status, stickies: ch.stickies || [] });
      for (const c of ch.comments || []) {
        if (!idMap.has(c.blockId)) continue;
        comments.push({ id: U.uid(), book_id: id, chapter_id: cid, block_id: idMap.get(c.blockId), kind: c.kind,
                        body: c.text, resolved: c.resolved, author: user.id, author_name: profile.name });
      }
    });
    const meta = {
      author: local.author, notes: local.notes, relations: local.relations,
      events: local.events.map((e) => ({ ...e, chapterId: chMap.get(e.chapterId) || '' }))
    };
    await q(client.from('books').insert({ id, owner: user.id, title: local.title, meta, cover: local.cover || '', cover_thumb: local.coverThumb || '' }));
    if (chapters.length) await q(client.from('chapters').insert(chapters));
    for (let i = 0; i < blocks.length; i += 400) await q(client.from('blocks').insert(blocks.slice(i, i + 400)));
    for (let i = 0; i < comments.length; i += 400) await q(client.from('comments').insert(comments.slice(i, i + 400)));
    return id;
  };

  /* ================= Opening a cloud book ================= */
  function emptyLast() {
    return { meta: null, cover: null, chapters: new Map(), blocks: new Map(), content: new Map(), comments: new Map(), chapterPos: new Map() };
  }

  async function fetchAll(make) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const rows = await q(make().range(from, from + 999));
      out.push(...rows);
      if (rows.length < 1000) break;
    }
    return out;
  }

  /* Clean a paragraph received from the server and make sure it carries its id. */
  function cleanBlock(html, id) {
    const body = U.parseHtml(U.sanitizeHtml(html, true));
    let el = body.firstElementChild;
    if (!el || !BLOCK_TAGS.has(el.tagName)) {
      const p = document.createElement('p');
      p.innerHTML = body.innerHTML;
      el = p;
    }
    el.setAttribute('data-b', id);
    return el.outerHTML;
  }

  const metaString = (b) => JSON.stringify({ title: b.title, author: b.author, notes: b.notes, relations: b.relations, events: b.events });
  const coverString = (b) => (b.cover || '') + '|' + (b.coverThumb || '');
  const chapterString = (ch, pos) => JSON.stringify([pos, ch.title, ch.synopsis, ch.status, ch.stickies || []]);
  const commentRow = (c, chapterId) => ({ chapter_id: chapterId, block_id: c.blockId, kind: c.kind, body: c.text, resolved: !!c.resolved });
  const commentString = (c, chapterId) => JSON.stringify(commentRow(c, chapterId));
  function rebuild(map) {
    return Array.from(map.entries()).sort((a, b) => a[1].pos - b[1].pos).map(([, v]) => v.html).join('');
  }
  function localComment(r) {
    return { id: r.id, blockId: r.block_id, kind: r.kind, text: r.body, resolved: !!r.resolved,
             created: Date.parse(r.created_at) || Date.now(), author: r.author || '', authorName: r.author_name || '' };
  }

  async function fetchBook(id) {
    const rows = await q(client.from('books').select('id,title,meta,cover,cover_thumb').eq('id', id));
    if (!rows || !rows[0]) throw new Error('This book no longer exists or you no longer have access.');
    const row = rows[0];
    const chapters = await fetchAll(() => client.from('chapters').select('*').eq('book_id', id).order('pos', { ascending: true }));
    const blocks = await fetchAll(() => client.from('blocks').select('id,chapter_id,pos,html').eq('book_id', id).order('pos', { ascending: true }));
    const comments = await fetchAll(() => client.from('comments').select('*').eq('book_id', id).order('created_at', { ascending: true }));
    return { row, chapters, blocks, comments };
  }

  /* Build the in-memory book (same shape as a local book) and remember exactly what the server has. */
  function buildBook(data, localCache) {
    const last = emptyLast();
    const { row, chapters, blocks, comments } = data;
    for (const b of blocks) {
      if (!last.blocks.has(b.chapter_id)) last.blocks.set(b.chapter_id, new Map());
      last.blocks.get(b.chapter_id).set(b.id, { pos: b.pos, html: cleanBlock(b.html, b.id) });
    }
    const meta = row.meta || {};
    const raw = {
      id: row.id, title: row.title, author: meta.author || '', cover: row.cover, coverThumb: row.cover_thumb,
      notes: meta.notes || [], relations: meta.relations || [], events: meta.events || [],
      chapters: chapters.map((c) => ({
        id: c.id, title: c.title, synopsis: c.synopsis, status: c.status, stickies: c.stickies || [],
        content: last.blocks.has(c.id) ? rebuild(last.blocks.get(c.id)) : '',
        comments: comments.filter((m) => m.chapter_id === c.id).map(localComment)
      })),
      snapshots: localCache ? localCache.snapshots : [],
      daily: localCache ? localCache.daily : null
    };
    if (!raw.chapters.length) raw.chapters = [S.newChapter('Chapter 1')];
    const book = S.normalizeBook(raw);
    book.id = row.id;
    // What the server has right now (used to find what changed locally).
    last.meta = metaString(book);
    last.cover = coverString(book);
    chapters.forEach((c) => {
      last.chapterPos.set(c.id, c.pos);
      last.chapters.set(c.id, JSON.stringify([c.pos, c.title, c.synopsis, c.status, c.stickies || []]));
    });
    book.chapters.forEach((ch) => { if (last.blocks.has(ch.id)) last.content.set(ch.id, ch.content); });
    for (const m of comments) last.comments.set(m.id, JSON.stringify({ chapter_id: m.chapter_id, block_id: m.block_id, kind: m.kind, body: m.body, resolved: !!m.resolved }));
    return { book, last };
  }

  CL.openBook = async function (id, role) {
    await CL.closeBook();
    if (!user) throw new Error('Please sign in to open shared books.');
    const state = cb = { id, role: role || 'viewer', last: emptyLast(), queue: [], loaded: false, online: false,
                         pushTimer: null, pushing: false, again: false, everOffline: false, presence: [] };
    setSync('connecting');

    // Listen first, then load, so no change made in between is missed.
    const ch = client.channel('book:' + id, { config: { presence: { key: user.id } } });
    state.channel = ch;
    const listen = (table, filterCol) => {
      ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: filterCol + '=eq.' + id }, (p) => onChange(state, table, p));
    };
    listen('books', 'id');
    listen('chapters', 'book_id');
    listen('blocks', 'book_id');
    listen('comments', 'book_id');
    listen('messages', 'book_id');
    listen('book_members', 'book_id');
    // Deletes can't be filtered by book, so listen to all of them (they only contain ids).
    for (const t of ['chapters', 'blocks', 'comments', 'book_members']) {
      ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table: t }, (p) => onChange(state, t, p));
    }
    ch.on('presence', { event: 'sync' }, () => onPresence(state));

    await new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      setTimeout(finish, 8000);
      ch.subscribe((status) => {
        if (cb !== state) return;
        if (status === 'SUBSCRIBED') {
          state.online = true;
          setSync('ok');
          finish();
          track();
          if (state.everOffline && state.loaded) { state.everOffline = false; CL.resync(); }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          state.online = false;
          state.everOffline = true;
          setSync('offline');
          finish();
        }
      });
    });

    const local = S.loadBook(id);
    const data = await fetchBook(id);
    if (cb !== state) return null;
    const { book, last } = buildBook(data, local);
    state.last = last;
    state.loaded = true;
    // Changes that arrived while loading
    const queued = state.queue.splice(0);
    return { book, afterOpen: () => { for (const [t, p] of queued) onChange(state, t, p); track(); } };
  };

  /* Reload everything from the server (after being offline). Local unsent edits are sent first. */
  CL.resync = async function () {
    if (!cb || !cb.loaded) return;
    const state = cb;
    try {
      await push();
      const data = await fetchBook(state.id);
      if (cb !== state) return;
      const { book, last } = buildBook(data, Ink.book());
      state.last = last;
      Ink.replaceBookFromCloud(book);
      Ink.toast('Back online: book updated with everyone\'s latest changes.');
    } catch (e) { console.error(e); }
  };

  CL.closeBook = async function () {
    if (!cb) return;
    const state = cb;
    try { if (state.loaded) await Promise.race([push(), new Promise((r) => setTimeout(r, 4000))]); } catch (e) { /* ignore */ }
    clearTimeout(state.pushTimer);
    try { if (state.channel) await client.removeChannel(state.channel); } catch (e) { /* ignore */ }
    if (cb === state) cb = null;
    if (Ink.collab) Ink.collab.renderPresence([]);
    setSync('none');
  };

  /* ================= Sending local changes ================= */
  CL.onDirty = function () {
    if (!cb || !cb.loaded) return;
    clearTimeout(cb.pushTimer);
    setSync('saving');
    cb.pushTimer = setTimeout(push, 450);
  };
  CL.noteLocalInput = () => { lastLocalInput = Date.now(); };

  /* Prepare the chapter open in the editor: every paragraph gets a unique id. */
  function prepareOpenChapter() {
    const st = Ink.state;
    if (st.view !== 'write' || st.current.kind !== 'chapter') return;
    const ch = Ink.getChapter(st.current.id);
    const ed = document.getElementById('editor');
    if (!ch || !ed) return;
    if (normalizeBlocks(ed)) ch.content = ed.innerHTML;
  }

  function diffBlocks(state, ch) {
    const lastMap = state.last.blocks.get(ch.id) || new Map();
    const body = U.parseHtml(ch.content);
    if (normalizeBlocks(body)) ch.content = body.innerHTML;
    const items = Array.from(body.children).map((el) => ({ id: el.getAttribute('data-b'), html: el.outerHTML }));
    const pos = new Array(items.length);
    let prev = -Infinity, tight = false;
    for (let i = 0; i < items.length; i++) {
      const known = lastMap.get(items[i].id);
      if (known && known.pos > prev) { pos[i] = known.pos; prev = known.pos; continue; }
      let next = null;
      for (let j = i + 1; j < items.length; j++) {
        const k = lastMap.get(items[j].id);
        if (k && k.pos > prev) { next = k.pos; break; }
      }
      let p;
      if (next === null) p = prev === -Infinity ? 1024 : prev + 1024;
      else if (prev === -Infinity) p = next - 1024;
      else { p = (prev + next) / 2; if (next - prev < 1e-6) tight = true; }
      pos[i] = p; prev = p;
    }
    if (tight) items.forEach((_, i) => { pos[i] = (i + 1) * 1024; });   // re-space when positions get too close
    const upserts = [];
    const keep = new Set();
    items.forEach((it, i) => {
      keep.add(it.id);
      const k = lastMap.get(it.id);
      if (!k || k.html !== it.html || k.pos !== pos[i]) {
        upserts.push({ id: it.id, chapter_id: ch.id, book_id: state.id, pos: pos[i], html: it.html });
      }
    });
    const deletes = Array.from(lastMap.keys()).filter((id) => !keep.has(id));
    return { upserts, deletes };
  }

  async function push() {
    const state = cb;
    if (!state || !state.loaded) return;
    if (state.pushing) { state.again = true; return; }
    state.pushing = true;
    try {
      const book = Ink.book();
      if (!book || book.id !== state.id) return;
      const L = state.last;
      if (CL.canEdit()) {
        prepareOpenChapter();
        const meta = metaString(book);
        if (meta !== L.meta) {
          await q(client.from('books').update({ title: book.title, meta: JSON.parse(meta) }).eq('id', state.id));
          L.meta = meta;
        }
        const cover = coverString(book);
        if (cover !== L.cover) {
          await q(client.from('books').update({ cover: book.cover || '', cover_thumb: book.coverThumb || '' }).eq('id', state.id));
          L.cover = cover;
        }
        const chRows = [];
        book.chapters.forEach((ch, i) => {
          const s = chapterString(ch, i);
          if (L.chapters.get(ch.id) !== s) {
            chRows.push({ row: { id: ch.id, book_id: state.id, pos: i, title: ch.title, synopsis: ch.synopsis, status: ch.status, stickies: ch.stickies || [] }, s });
          }
        });
        if (chRows.length) {
          await q(client.from('chapters').upsert(chRows.map((r) => r.row)));
          chRows.forEach((r) => { L.chapters.set(r.row.id, r.s); L.chapterPos.set(r.row.id, r.row.pos); });
        }
        for (const ch of book.chapters) {
          if (L.content.get(ch.id) === ch.content) continue;
          const { upserts, deletes } = diffBlocks(state, ch);
          if (upserts.length) await q(client.from('blocks').upsert(upserts));
          if (deletes.length) await q(client.from('blocks').delete().in('id', deletes));
          if (!L.blocks.has(ch.id)) L.blocks.set(ch.id, new Map());
          const m = L.blocks.get(ch.id);
          upserts.forEach((b) => m.set(b.id, { pos: b.pos, html: b.html }));
          deletes.forEach((id) => m.delete(id));
          L.content.set(ch.id, ch.content);
        }
        const ids = new Set(book.chapters.map((c) => c.id));
        const gone = Array.from(L.chapters.keys()).filter((id) => !ids.has(id));
        if (gone.length) {
          await q(client.from('chapters').delete().in('id', gone));
          gone.forEach((id) => { L.chapters.delete(id); L.blocks.delete(id); L.content.delete(id); });
        }
      }
      if (CL.canComment()) {
        const now = new Map();
        for (const ch of book.chapters) for (const c of ch.comments) now.set(c.id, { c, chapterId: ch.id });
        for (const [id, { c, chapterId }] of now) {
          const s = commentString(c, chapterId);
          const before = L.comments.get(id);
          if (before === s) continue;
          if (before === undefined) {
            if (!c.author) { c.author = user.id; c.authorName = profile.name; }
            await q(client.from('comments').insert({ id, book_id: state.id, ...commentRow(c, chapterId), author: user.id, author_name: profile.name }));
          } else {
            await q(client.from('comments').update({ body: c.text, resolved: !!c.resolved }).eq('id', id));
          }
          L.comments.set(id, s);
        }
        const gone = Array.from(L.comments.keys()).filter((id) => !now.has(id));
        if (gone.length) {
          await q(client.from('comments').delete().in('id', gone));
          gone.forEach((id) => L.comments.delete(id));
        }
      }
      if (cb === state) setSync(state.online ? 'ok' : 'offline');
    } catch (e) {
      console.error('Sync failed', e);
      if (cb === state) {
        setSync('error', e.message);
        clearTimeout(state.pushTimer);
        state.pushTimer = setTimeout(push, 5000);
      }
    } finally {
      state.pushing = false;
      if (state.again && cb === state) { state.again = false; CL.onDirty(); }
    }
  }
  CL.pushNow = push;

  /* ================= Receiving other people's changes ================= */
  function openChapterId() {
    const st = Ink.state;
    return st.view === 'write' && st.current.kind === 'chapter' ? st.current.id : null;
  }

  function isUserEditing(el) {
    const ed = document.getElementById('editor');
    if (document.activeElement !== ed) return false;
    const sel = document.getSelection();
    return !!(sel.anchorNode && el.contains(sel.anchorNode) && Date.now() - lastLocalInput < 4000);
  }

  function afterRemote() {
    Ink.saveLocalOnly();
    Ink.renderLists();
    Ink.updateStats();
  }

  function onChange(state, table, p) {
    if (cb !== state) return;
    if (!state.loaded) { state.queue.push([table, p]); return; }
    const type = p.eventType;
    const row = p.new || {}, old = p.old || {};
    try {
      if (table === 'blocks') type === 'DELETE' ? remoteBlockDelete(state, old.id) : remoteBlock(state, row);
      else if (table === 'chapters') type === 'DELETE' ? remoteChapterDelete(state, old.id) : remoteChapter(state, row);
      else if (table === 'comments') type === 'DELETE' ? remoteCommentDelete(state, old.id) : remoteComment(state, row);
      else if (table === 'books') { if (type !== 'DELETE') remoteBook(state, row); }
      else if (table === 'messages') { if (type === 'INSERT' && Ink.collab) Ink.collab.chatAppend(row); }
      else if (table === 'book_members') remoteMember(state, type, row, old);
    } catch (e) { console.error('Could not apply a remote change', e); }
  }

  function remoteBlock(state, row) {
    if (row.book_id && row.book_id !== state.id) return;
    const L = state.last;
    if (!L.blocks.has(row.chapter_id)) L.blocks.set(row.chapter_id, new Map());
    const map = L.blocks.get(row.chapter_id);
    const html = cleanBlock(row.html, row.id);
    const prev = map.get(row.id);
    if (prev && prev.html === html && prev.pos === row.pos) return;          // our own change coming back
    map.set(row.id, { pos: row.pos, html });
    L.content.delete(row.chapter_id);
    const ch = Ink.getChapter(row.chapter_id);
    if (!ch) return;
    if (openChapterId() === ch.id) {
      const ed = document.getElementById('editor');
      const el = ed.querySelector(':scope > [data-b="' + CSS.escape(row.id) + '"]');
      if (el && isUserEditing(el)) return;    // you are typing here: your version will be saved over it
      const tmp = U.parseHtml(html).firstElementChild;
      if (el && (!prev || prev.pos === row.pos)) el.replaceWith(tmp);
      else {
        if (el) el.remove();
        let before = null;
        for (const child of ed.children) {
          const k = map.get(child.getAttribute('data-b'));
          if (k && k.pos > row.pos) { before = child; break; }
        }
        ed.insertBefore(tmp, before);
      }
      ch.content = ed.innerHTML;
      document.getElementById('editor').classList.remove('is-empty');
      if (Ink.comments) Ink.comments.refresh();
    } else {
      ch.content = rebuildChapter(ch, map);
    }
    afterRemote();
  }

  /* Rebuild a closed chapter from the server copy, keeping any paragraphs not yet sent. */
  function rebuildChapter(ch, map) {
    const body = U.parseHtml(ch.content);
    const local = new Map(Array.from(body.children).map((el) => [el.getAttribute('data-b'), el.outerHTML]));
    const known = new Set(map.keys());
    const unsent = Array.from(local.entries()).filter(([id]) => id && !known.has(id));
    return rebuild(map) + unsent.map(([, h]) => h).join('');
  }

  function remoteBlockDelete(state, id) {
    if (!id) return;
    for (const [chId, map] of state.last.blocks) {
      if (!map.has(id)) continue;
      map.delete(id);
      state.last.content.delete(chId);
      const ch = Ink.getChapter(chId);
      if (!ch) return;
      if (openChapterId() === chId) {
        const ed = document.getElementById('editor');
        const el = ed.querySelector(':scope > [data-b="' + CSS.escape(id) + '"]');
        if (el && !isUserEditing(el)) { el.remove(); ch.content = ed.innerHTML; }
        if (Ink.comments) Ink.comments.refresh();
      } else {
        const body = U.parseHtml(ch.content);
        const el = body.querySelector(':scope > [data-b="' + CSS.escape(id) + '"]');
        if (el) { el.remove(); ch.content = body.innerHTML; }
      }
      afterRemote();
      return;
    }
  }

  function remoteChapter(state, row) {
    if (row.book_id !== state.id) return;
    const L = state.last;
    const s = JSON.stringify([row.pos, row.title, row.synopsis, row.status, row.stickies || []]);
    const book = Ink.book();
    let ch = Ink.getChapter(row.id);
    if (L.chapters.get(row.id) === s && ch) return;
    L.chapters.set(row.id, s);
    L.chapterPos.set(row.id, row.pos);
    const isOpen = openChapterId() === row.id;
    if (!ch) {
      ch = S.newChapter(row.title);
      ch.id = row.id;
      ch.content = L.blocks.has(row.id) ? rebuild(L.blocks.get(row.id)) : '';
      book.chapters.push(ch);
    }
    ch.title = row.title;
    ch.synopsis = row.synopsis;
    ch.status = row.status;
    ch.stickies = S.normalizeBook({ chapters: [{ stickies: row.stickies || [] }] }).chapters[0].stickies;
    // Order chapters by their position on the server
    const posOf = (c, i) => (L.chapterPos.has(c.id) ? L.chapterPos.get(c.id) : i);
    const order = book.chapters.map((c, i) => [c, posOf(c, i)]);
    order.sort((a, b) => a[1] - b[1]);
    book.chapters = order.map((x) => x[0]);
    if (isOpen) {
      const t = document.getElementById('chapterTitle');
      if (document.activeElement !== t) t.value = ch.title;
      const syn = document.getElementById('chapterSynopsis');
      if (document.activeElement !== syn) syn.value = ch.synopsis;
      document.getElementById('chapterStatus').value = ch.status;
      if (!document.querySelector('.sticky.dragging') && !document.activeElement.closest('.sticky')) Ink.stickies.render();
    }
    afterRemote();
    Ink.refreshView();
  }

  function remoteChapterDelete(state, id) {
    const book = Ink.book();
    if (!id || !book || !book.chapters.some((c) => c.id === id)) return;
    state.last.chapters.delete(id);
    state.last.blocks.delete(id);
    state.last.content.delete(id);
    const wasOpen = openChapterId() === id;
    book.chapters = book.chapters.filter((c) => c.id !== id);
    if (!book.chapters.length) book.chapters.push(S.newChapter('Chapter 1'));
    if (wasOpen) { Ink.openChapter(book.chapters[0].id); Ink.toast('A collaborator deleted the chapter you had open.'); }
    afterRemote();
    Ink.refreshView();
  }

  function remoteBook(state, row) {
    if (row.id !== state.id) return;
    const book = Ink.book();
    const L = state.last;
    const meta = row.meta || {};
    const incoming = S.normalizeBook({ title: row.title, author: meta.author, notes: meta.notes || [], relations: meta.relations || [],
                                       events: meta.events || [], chapters: book.chapters.map((c) => ({ id: c.id })) });
    const s = metaString(incoming);
    if (s !== L.meta) {
      L.meta = s;
      book.title = incoming.title;
      book.author = incoming.author;
      book.notes = incoming.notes;
      book.relations = incoming.relations;
      book.events = incoming.events;
      const t = document.getElementById('projectTitle');
      if (document.activeElement !== t) t.value = book.title;
      const st = Ink.state;
      if (st.view === 'write' && st.current.kind === 'note') {
        const n = Ink.getNote(st.current.id);
        const editingNote = ['noteTitle', 'noteBody'].includes(document.activeElement.id);
        if (!n) Ink.openChapter(book.chapters[0].id);
        else if (!editingNote) Ink.openNote(n.id);
      }
      Ink.refreshView();
    }
    if (row.cover !== undefined) {
      const c = (U.isImageData(row.cover) ? row.cover : '') + '|' + (U.isImageData(row.cover_thumb) ? row.cover_thumb : '');
      if (c !== L.cover) { L.cover = c; book.cover = c.split('|')[0]; book.coverThumb = c.split('|')[1]; }
    }
    afterRemote();
  }

  function remoteComment(state, row) {
    if (row.book_id !== state.id) return;
    const L = state.last;
    const s = JSON.stringify({ chapter_id: row.chapter_id, block_id: row.block_id, kind: row.kind, body: row.body, resolved: !!row.resolved });
    if (L.comments.get(row.id) === s) return;
    L.comments.set(row.id, s);
    const ch = Ink.getChapter(row.chapter_id);
    if (!ch) return;
    const c = localComment(row);
    const i = ch.comments.findIndex((x) => x.id === row.id);
    if (i >= 0) ch.comments[i] = c; else ch.comments.push(c);
    if (openChapterId() === ch.id && Ink.comments) Ink.comments.refresh();
    Ink.saveLocalOnly();
  }

  function remoteCommentDelete(state, id) {
    if (!id || !state.last.comments.has(id)) return;
    state.last.comments.delete(id);
    for (const ch of Ink.book().chapters) {
      const i = ch.comments.findIndex((c) => c.id === id);
      if (i >= 0) {
        ch.comments.splice(i, 1);
        if (openChapterId() === ch.id && Ink.comments) Ink.comments.refresh();
        Ink.saveLocalOnly();
        return;
      }
    }
  }

  function remoteMember(state, type, row, old) {
    const r = type === 'DELETE' ? old : row;
    if (r.book_id && r.book_id !== state.id) return;
    if (r.user_id === user.id) {
      if (type === 'DELETE') {
        alert('You have been removed from this book, or you left it.');
        Ink.forgetCloudBook(state.id);
        return;
      }
      if (row.role && row.role !== state.role) {
        state.role = row.role;
        Ink.collab.applyRole();
        Ink.toast('Your role in this book is now: ' + ({ owner: 'Owner', editor: 'Editor', commenter: 'Commenter', viewer: 'Reader (read only)' }[row.role] || row.role) + '.');
      }
    }
    if (Ink.collab) Ink.collab.membersChanged();
  }

  /* ================= Presence (who's here, and where) ================= */
  let trackTimer = null;
  function track() {
    if (!cb || !cb.channel || !cb.online || !profile) return;
    clearTimeout(trackTimer);
    trackTimer = setTimeout(() => {
      if (!cb || !cb.channel) return;
      const st = Ink.state;
      let blockId = '';
      const sel = document.getSelection();
      const ed = document.getElementById('editor');
      if (sel.anchorNode && ed && ed.contains(sel.anchorNode)) {
        let n = sel.anchorNode;
        while (n && n.parentNode !== ed) n = n.parentNode;
        if (n && n.nodeType === 1) blockId = n.getAttribute('data-b') || '';
      }
      const chapterId = st.view === 'write' && st.current.kind === 'chapter' ? st.current.id : '';
      const ch = chapterId ? Ink.getChapter(chapterId) : null;
      try {
        cb.channel.track({ uid: user.id, name: profile.name, color: profile.color, chapterId, blockId,
                           where: ch ? ch.title : ({ board: 'Corkboard', timeline: 'Timeline', map: 'Character map' }[st.view] || 'Notebook') });
      } catch (e) { /* ignore */ }
    }, 250);
  }
  CL.track = track;

  function onPresence(state) {
    if (cb !== state) return;
    const raw = state.channel.presenceState();
    const people = [];
    for (const [key, metas] of Object.entries(raw)) {
      if (key === user.id || !metas.length) continue;
      people.push(metas[metas.length - 1]);
    }
    state.presence = people;
    if (Ink.collab) Ink.collab.renderPresence(people);
  }
  CL.presence = () => (cb ? cb.presence : []);

  /* ================= Status ================= */
  function setSync(status, detail) {
    if (Ink.collab) Ink.collab.setSync(status, detail);
  }
})(window.Ink);
