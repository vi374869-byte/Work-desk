/* Work Desk — Collaboration screens: share dialog, sign-in, invites & roles, who's online, chat. */
(function (Ink) {
  'use strict';
  const U = Ink.util, S = Ink.store;
  const { $, h } = U;
  const CB = Ink.collab = {};
  const ROLE_LABELS = { owner: 'Owner', editor: 'Editor: can write', commenter: 'Commenter: can comment', viewer: 'Reader: read only' };
  const ROLE_SHORT = { owner: 'Owner', editor: 'Editor', commenter: 'Commenter', viewer: 'Reader' };

  let afterSignIn = null;      // what to do once signed in (open a book / join with a code)
  let pendingInvite = null;
  let authMode = 'signin';
  let unread = 0;
  const seenMessages = new Set();

  const CL = () => Ink.cloud;
  const dlg = () => $('#collabDialog');

  function colorOf(id) {
    const colors = ['#c13fb0', '#3b6fd8', '#3fa76a', '#e07b2f', '#8e6cc4', '#d0473a', '#1c9aa0', '#b8860b'];
    let x = 0;
    for (const c of String(id)) x = (x * 31 + c.charCodeAt(0)) >>> 0;
    return colors[x % colors.length];
  }
  const avatar = (name, color, extra) => h('span', { class: 'avatar' + (extra ? ' ' + extra : ''), style: 'background:' + (color || '#888'), title: name },
    U.initials(name));

  /* ================= Binding ================= */
  CB.bind = function () {
    $('#btnShare').addEventListener('click', () => CB.open());
    $('#libJoin').addEventListener('click', () => CB.open({ join: true }));
    $('#btnChat').addEventListener('click', () => toggleChat());
    $('#chatClose').addEventListener('click', () => toggleChat(false));
    $('#chatForm').addEventListener('submit', (e) => { e.preventDefault(); sendChat(); });
    $('#chatInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
    });
    document.addEventListener('selectionchange', () => { if (CL().active()) CL().track(); });
    const ed = $('#editor');
    if (window.ResizeObserver) new ResizeObserver(() => renderMarks()).observe(ed);

    // Opening Work Desk with  #join=WD1-…  in the address starts joining straight away.
    const m = location.hash.match(/join=(WD1-[A-Za-z0-9_-]+)/);
    if (m) setTimeout(() => CB.open({ invite: m[1] }), 300);

    // Quietly reconnect so shared books show up in the library.
    if (CL().isConfigured()) CL().connect().then(() => CB.refreshLibrary()).catch(() => { /* offline is fine */ });
  };

  /* ================= Library ================= */
  CB.refreshLibrary = async function () {
    if (!CL().isConfigured() || !CL().user()) return;
    let list;
    try { list = await CL().listBooks(); } catch (e) { return; }
    const lib = Ink.state.library;
    let changed = false;
    const ids = new Set(list.map((b) => b.id));
    for (const b of list) {
      let entry = lib.books.find((x) => x.id === b.id);
      if (!entry) {
        entry = { id: b.id, title: b.title, author: '', words: 0, updated: b.updated, today: null, thumb: b.thumb, cloud: true, role: b.role };
        lib.books.push(entry);
        changed = true;
      } else if (entry.title !== b.title || entry.role !== b.role || !entry.cloud || entry.thumb !== b.thumb) {
        Object.assign(entry, { title: b.title, role: b.role, cloud: true, thumb: b.thumb });
        changed = true;
      }
    }
    // Shared books you can no longer open
    for (const entry of lib.books.slice()) {
      if (entry.cloud && !ids.has(entry.id) && !(Ink.book() && Ink.book().id === entry.id && CL().active())) {
        lib.books = lib.books.filter((x) => x !== entry);
        S.deleteBook(entry.id);
        changed = true;
      }
    }
    if (changed) {
      try { S.saveLibrary(lib); } catch (e) { /* ignore */ }
      if (!$('#libraryScreen').hidden) Ink.library.render(true);
    }
  };

  /* ================= Dialog ================= */
  CB.open = function (opts) {
    opts = opts || {};
    if (opts.afterSignIn) afterSignIn = opts.afterSignIn;
    if (opts.invite) pendingInvite = opts.invite;
    if (!dlg().open) dlg().showModal();
    render(opts);
  };
  CB.onAuthChange = function () {
    if (dlg().open) render({});
    CB.refreshLibrary();
  };
  CB.membersChanged = function () { if (dlg().open) render({}); };

  function section(title, ...children) {
    return h('section', { class: 'collab-section' }, title ? h('h3', { text: title }) : null, ...children);
  }
  function errorBox() { return h('div', { class: 'collab-error', hidden: true }); }
  function showError(box, e) { box.textContent = '⚠ ' + (e && e.message ? e.message : e); box.hidden = false; }
  async function busy(btn, fn) {
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Please wait…';
    try { await fn(); } finally { btn.disabled = false; btn.textContent = label; }
  }

  async function render(opts) {
    const body = $('#collabBody');
    body.textContent = '';
    body.append(h('div', { class: 'collab-head' },
      h('h2', { text: 'Share & collaborate' }),
      h('button', { class: 'icon-btn', title: 'Close', text: '×', onclick: () => dlg().close() })));

    if (!CL().isConfigured()) { viewSetup(body); return; }
    const wait = h('p', { class: 'muted-text', text: 'Connecting…' });
    body.append(wait);
    try { await CL().connect(); }
    catch (e) {
      wait.remove();
      body.append(section('Could not connect',
        h('p', { text: e.message }),
        h('button', { class: 'btn', text: 'Try again', onclick: () => render(opts) }), ' ',
        h('button', { class: 'btn', text: 'Change project settings', onclick: async () => { await CL().clearConfig(); render({}); } })));
      return;
    }
    wait.remove();
    if (!CL().user()) { viewAuth(body); return; }
    if (pendingInvite) { const code = pendingInvite; pendingInvite = null; await handleInvite(code, body); return; }
    if (afterSignIn) { const fn = afterSignIn; afterSignIn = null; dlg().close(); fn(); return; }
    await viewSignedIn(body, opts);
  }

  function joinSection(body, focus) {
    const input = h('input', { type: 'text', placeholder: 'Paste an invite code (starts with WD1-)', class: 'collab-input' });
    const err = errorBox();
    const btn = h('button', { class: 'btn primary', text: 'Join book' });
    btn.addEventListener('click', () => busy(btn, async () => {
      try { await handleInvite(input.value, body); } catch (e) { showError(err, e); }
    }));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });
    body.append(section('Join someone\'s book', h('p', { class: 'muted-text', text: 'Got an invite code from another writer? Paste it here.' }),
      h('div', { class: 'collab-row' }, input, btn), err));
    if (focus) setTimeout(() => input.focus(), 50);
  }

  function viewSetup(body) {
    joinSection(body, false);
    const url = h('input', { type: 'text', placeholder: 'Project URL, e.g. https://abcdefgh.supabase.co', class: 'collab-input' });
    const key = h('input', { type: 'text', placeholder: 'anon public key (starts with eyJ…) or publishable key (sb_publishable_…)', class: 'collab-input' });
    const err = errorBox();
    const btn = h('button', { class: 'btn primary', text: 'Connect' });
    btn.addEventListener('click', () => busy(btn, async () => {
      try { CL().setConfig(url.value, key.value); await CL().connect(); render({}); }
      catch (e) { showError(err, e); }
    }));
    body.append(section('Set up your own online space',
      h('p', { text: 'To write together, Work Desk uses a free Supabase project as its online home. ' +
        'You do this once (about 10 minutes). Follow the steps in COLLABORATION.md in your Work Desk folder, then paste the two values here:' }),
      url, key, h('div', { class: 'collab-row end' }, btn), err));
  }

  function viewAuth(body) {
    const isUp = authMode === 'signup';
    const name = h('input', { type: 'text', placeholder: 'Your name (shown to collaborators)', class: 'collab-input', autocomplete: 'nickname' });
    const email = h('input', { type: 'email', placeholder: 'Email', class: 'collab-input', autocomplete: 'email' });
    const pass = h('input', { type: 'password', placeholder: isUp ? 'Choose a password (at least 6 characters)' : 'Password', class: 'collab-input',
                              autocomplete: isUp ? 'new-password' : 'current-password' });
    const err = errorBox();
    const info = h('p', { class: 'collab-info', hidden: true });
    const btn = h('button', { class: 'btn primary', text: isUp ? 'Create account' : 'Sign in' });
    btn.addEventListener('click', () => busy(btn, async () => {
      try {
        if (isUp) {
          if (!name.value.trim()) throw new Error('Please enter your name.');
          const r = await CL().signUp(email.value.trim(), pass.value, name.value.trim());
          if (r.needsConfirm) {
            info.textContent = '📧 Check your email and click the confirmation link, then come back and sign in.';
            info.hidden = false;
            authMode = 'signin';
            return;
          }
        } else {
          await CL().signIn(email.value.trim(), pass.value);
        }
        await CB.refreshLibrary();
        render({});
      } catch (e) { showError(err, e); }
    }));
    pass.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });
    const tabs = h('div', { class: 'kind-toggle' },
      h('button', { class: !isUp ? 'active' : '', text: 'Sign in', onclick: () => { authMode = 'signin'; render({}); } }),
      h('button', { class: isUp ? 'active' : '', text: 'Create account', onclick: () => { authMode = 'signup'; render({}); } }));
    body.append(section(null,
      h('p', { text: pendingInvite || afterSignIn ? 'Sign in (or create a free account) to continue.' : 'Sign in to share books and write together.' }),
      tabs, isUp ? name : null, email, pass, h('div', { class: 'collab-row end' }, btn), err, info));
    setTimeout(() => (isUp ? name : email).focus(), 50);
  }

  async function viewSignedIn(body, opts) {
    const me = CL().profile();
    const user = CL().user();
    body.append(h('div', { class: 'collab-me' },
      avatar(me.name, me.color, 'big'),
      h('div', { class: 'collab-me-text' }, h('strong', { text: me.name }), h('span', { class: 'muted-text', text: user.email || '' })),
      h('button', { class: 'btn small', text: 'Rename', onclick: async () => {
        const n = prompt('Your name, as collaborators see it:', me.name);
        if (n && n.trim()) { try { await CL().setName(n); render({}); } catch (e) { alert(e.message); } }
      } }),
      h('button', { class: 'btn small', text: 'Sign out', onclick: async () => {
        if (!confirm('Sign out? Shared books will need you to sign in again.')) return;
        await CL().signOut();
        if (Ink.book() && Ink.state.library.books.some((b) => b.id === Ink.book().id && b.cloud)) Ink.showLibrary();
        render({});
      } })));

    const book = Ink.book();
    const inLibrary = !$('#libraryScreen').hidden;
    if (book && !inLibrary && CL().active() && CL().bookId() === book.id) await viewShared(body, book);
    else if (book && !inLibrary) viewLocal(body, book);
    joinSection(body, opts && opts.join);
    const cfg = CL().config();
    body.append(h('p', { class: 'collab-foot' }, 'Online space: ' + cfg.url.replace(/^https:\/\//, '') + ' · ',
      h('a', { text: 'change', onclick: async () => {
        if (!confirm('Disconnect from this online space? Your shared books stay online; you can reconnect later.')) return;
        await CL().clearConfig();
        Ink.state.library.books = Ink.state.library.books.filter((b) => !b.cloud || (Ink.book() && Ink.book().id === b.id));
        render({});
      } })));
  }

  function viewLocal(body, book) {
    const err = errorBox();
    const btn = h('button', { class: 'btn primary', text: '☁ Share this book online' });
    btn.addEventListener('click', () => busy(btn, async () => {
      try {
        Ink.saveNow();
        const id = await CL().shareBook(book);
        const entry = { id, title: book.title, author: book.author, words: Ink.totalWords(), updated: Date.now(), today: null,
                        thumb: book.coverThumb || '', cloud: true, role: 'owner' };
        Ink.state.library.books.unshift(entry);
        S.saveLibrary(Ink.state.library);
        dlg().close();
        await Ink.openBook(id);
        Ink.toast('"' + book.title + '" is now online. Open Share again to invite people. Your offline copy is still in the library.', 8000);
      } catch (e) { showError(err, e); }
    }));
    body.append(section('Share "' + book.title + '"',
      h('p', { text: 'This puts a copy of the book online so you can invite people. Your offline copy stays in your library. ' +
                     'Snapshots stay on your computer.' }),
      h('div', { class: 'collab-row end' }, btn), err));
  }

  async function viewShared(body, book) {
    const owner = CL().isOwner();
    const sec = section('People in "' + book.title + '"');
    body.append(sec);
    const list = h('ul', { class: 'member-list' }, h('li', { class: 'muted-text', text: 'Loading…' }));
    sec.append(list);
    let members = [];
    try { members = await CL().members(); } catch (e) { list.textContent = e.message; }
    const online = new Set(CL().presence().map((p) => p.uid));
    list.textContent = '';
    for (const m of members) {
      const p = m.profiles || {};
      const isMe = m.user_id === CL().userId();
      let roleEl;
      if (owner && m.role !== 'owner') {
        roleEl = h('select', { class: 'role-select' },
          ['editor', 'commenter', 'viewer'].map((r) => h('option', { value: r, text: ROLE_LABELS[r], selected: r === m.role })));
        roleEl.addEventListener('change', async () => {
          try { await CL().setRole(m.user_id, roleEl.value); Ink.toast((p.name || 'They') + ' is now ' + ROLE_SHORT[roleEl.value] + '.'); }
          catch (e) { alert(e.message); }
        });
      } else roleEl = h('span', { class: 'role-tag', text: ROLE_SHORT[m.role] });
      list.append(h('li', { class: 'member' },
        avatar(p.name || '?', p.color),
        h('span', { class: 'member-name' }, (p.name || 'Someone') + (isMe ? ' (you)' : ''),
          online.has(m.user_id) || isMe ? h('span', { class: 'online-dot', title: 'Online now' }) : null),
        roleEl,
        owner && m.role !== 'owner' ? h('button', { class: 'icon-btn', title: 'Remove from book', text: '×', onclick: async () => {
          if (!confirm('Remove ' + (p.name || 'this person') + ' from the book?')) return;
          try { await CL().removeMember(m.user_id); render({}); } catch (e) { alert(e.message); }
        } }) : null));
    }

    if (owner) {
      const role = h('select', { class: 'role-select' },
        ['editor', 'commenter', 'viewer'].map((r) => h('option', { value: r, text: ROLE_LABELS[r] })));
      const out = h('div', { class: 'invite-out', hidden: true });
      const err = errorBox();
      const btn = h('button', { class: 'btn primary', text: 'Create invite code' });
      btn.addEventListener('click', () => busy(btn, async () => {
        try {
          const code = await CL().createInvite(role.value);
          out.textContent = '';
          const box = h('textarea', { class: 'invite-code', readonly: true, rows: 3, value: code });
          out.append(
            h('p', { text: 'Send this code to the person (by email, WhatsApp…). They open Work Desk → Share → "Join someone\'s book" and paste it. Anyone with this code can join as ' + ROLE_SHORT[role.value] + ', so delete it when you\'re done.' }),
            box,
            h('div', { class: 'collab-row end' },
              /^https?:$/.test(location.protocol) ? h('button', { class: 'btn', text: '🔗 Copy invite link', title: 'A link that opens Work Desk and joins the book in one click',
                onclick: async () => {
                  const link = location.origin + location.pathname + '#join=' + code;
                  try { await navigator.clipboard.writeText(link); Ink.toast('Invite link copied: send it to your co-writer.'); } catch (e) { prompt('Copy this link:', link); }
                } }) : null,
              h('button', { class: 'btn', text: '📋 Copy code', onclick: async () => {
              try { await navigator.clipboard.writeText(code); Ink.toast('Invite code copied.'); } catch (e) { box.select(); document.execCommand('copy'); Ink.toast('Invite code copied.'); }
            } })));
          out.hidden = false;
          box.select();
          loadInvites();
        } catch (e) { showError(err, e); }
      }));
      const invList = h('ul', { class: 'invite-list' });
      const loadInvites = async () => {
        invList.textContent = '';
        let invs = [];
        try { invs = await CL().invites(); } catch (e) { return; }
        if (!invs.length) return;
        invList.append(h('li', { class: 'muted-text', text: 'Active invite codes:' }));
        for (const inv of invs) {
          invList.append(h('li', { class: 'invite-item' },
            h('code', { text: inv.code.slice(0, 6) + '…' }), ' ' + ROLE_SHORT[inv.role] + ' · ' + U.timeAgo(Date.parse(inv.created_at)),
            h('button', { class: 'btn small', text: 'Copy', onclick: () => navigator.clipboard.writeText(CL().inviteString(inv.code, inv.role)).then(() => Ink.toast('Invite code copied.')) }),
            h('button', { class: 'btn small danger', text: 'Delete', onclick: async () => { await CL().deleteInvite(inv.code); loadInvites(); } })));
        }
      };
      body.append(section('Invite someone',
        h('div', { class: 'collab-row' }, h('span', { class: 'muted-text', text: 'They can be:' }), role, btn), err, out, invList));
      loadInvites();
    } else {
      body.append(section('Your role',
        h('p', { text: 'You are a ' + ROLE_LABELS[CL().role()].toLowerCase() + '. The owner can change this.' }),
        h('button', { class: 'btn danger small', text: 'Leave this book', onclick: async () => {
          if (!confirm('Leave "' + book.title + '"? You will need a new invite to come back.')) return;
          try { await CL().leaveBook(book.id); dlg().close(); Ink.forgetCloudBook(book.id); } catch (e) { alert(e.message); }
        } })));
    }
  }

  async function handleInvite(str, body) {
    const data = CL().parseInvite(str);
    const cfg = CL().config();
    if (!cfg || cfg.url !== data.u || cfg.key !== data.k) {
      if (cfg && !confirm('This invite is for a different online space (' + data.u + ').\nSwitch to it? Books in your current space stay online.')) return;
      if (cfg) await CL().clearConfig();
      CL().setConfig(data.u, data.k);
    }
    await CL().connect();
    if (!CL().user()) {
      pendingInvite = str;
      render({});
      return;
    }
    CB.loading('Joining "' + (data.t || 'the book') + '"…');
    try {
      const id = await CL().joinWithCode(data.c);
      await CB.refreshLibrary();
      if (!Ink.state.library.books.some((b) => b.id === id)) {
        Ink.state.library.books.unshift({ id, title: data.t || 'Shared book', author: '', words: 0, updated: Date.now(), today: null,
                                          thumb: '', cloud: true, role: data.r || 'viewer' });
      }
      CB.loading(null);
      if (dlg().open) dlg().close();
      if (location.hash.includes('join=')) history.replaceState(null, '', location.pathname + location.search);
      await Ink.openBook(id);
      Ink.toast('You joined "' + (Ink.book() ? Ink.book().title : 'the book') + '". Say hi in the chat!', 6000);
    } catch (e) {
      CB.loading(null);
      throw e;
    }
  }

  /* ================= In the book ================= */
  CB.bookOpened = async function () {
    unread = 0;
    seenMessages.clear();
    $('#chatList').textContent = '';
    updateBadge();
    try {
      const msgs = await CL().loadMessages();
      msgs.forEach((m) => CB.chatAppend(m, true));
      if (!msgs.length) $('#chatList').append(h('p', { class: 'chat-empty', text: 'No messages yet. Say hello to your co-writers 👋' }));
    } catch (e) { console.error(e); }
  };

  CB.applyRole = function () {
    const active = CL().active();
    const canEdit = CL().canEdit(), canComment = CL().canComment();
    document.body.classList.toggle('cloud', active);
    document.body.classList.toggle('ro', !canEdit);
    document.body.classList.toggle('no-comment', !canComment);
    $('#editor').contentEditable = canEdit ? 'true' : 'false';
    for (const id of ['#projectTitle', '#chapterTitle', '#noteTitle', '#noteBody', '#chapterSynopsis']) $(id).readOnly = !canEdit;
    $('#chapterStatus').disabled = !canEdit;
    const badge = $('#roleBadge');
    badge.hidden = canEdit;
    badge.textContent = canComment ? '💬 Commenter' : '👁 Read only';
    badge.title = canComment ? 'You can read and comment, but not change the text.' : 'You can read this book, but not change it.';
    $('#btnChat').hidden = !active;
    if (!active) { toggleChat(false); CB.renderPresence([]); }
  };

  CB.setSync = function (status, detail) {
    const b = $('#syncBadge');
    const map = {
      none: null, connecting: '⟳ Connecting…', ok: '☁ Synced', saving: '☁ Saving…',
      offline: '⚠ Offline: will sync when back', error: '⚠ Sync problem: retrying'
    };
    b.hidden = !map[status];
    b.textContent = map[status] || '';
    b.className = 'sync-badge sync-' + status;
    b.title = detail || (status === 'ok' ? 'All changes are saved online.' : '');
  };

  CB.loading = function (text) {
    const o = $('#loadingOverlay');
    o.hidden = !text;
    $('#loadingText').textContent = text || '';
  };

  /* ---------- Presence ---------- */
  let people = [];
  CB.renderPresence = function (list) {
    people = list || [];
    const bar = $('#presenceBar');
    bar.textContent = '';
    people.slice(0, 5).forEach((p) => {
      const a = avatar(p.name, p.color, 'clickable');
      a.title = p.name + ' · ' + (p.where || 'here');
      a.addEventListener('click', () => {
        if (p.chapterId && Ink.getChapter(p.chapterId)) {
          Ink.openChapter(p.chapterId);
          const el = p.blockId && $('#editor').querySelector(':scope > [data-b="' + CSS.escape(p.blockId) + '"]');
          if (el) el.scrollIntoView({ block: 'center' });
        } else Ink.toast(p.name + ' is in ' + (p.where || 'the book') + '.');
      });
      bar.append(a);
    });
    if (people.length > 5) bar.append(h('span', { class: 'avatar more', text: '+' + (people.length - 5) }));
    $('#chatOnline').textContent = people.length ? people.length + ' other' + (people.length === 1 ? '' : 's') + ' online' : 'Only you right now';
    renderMarks();
  };

  /* Show which paragraph each collaborator is in (name tag in the left margin). */
  function renderMarks() {
    const rail = $('#presenceRail');
    const style = $('#presenceStyle') || document.head.appendChild(h('style', { id: 'presenceStyle' }));
    rail.textContent = '';
    let css = '';
    const st = Ink.state;
    if (!CL().active() || st.view !== 'write' || st.current.kind !== 'chapter') { style.textContent = ''; return; }
    const pageTop = $('#writePage').getBoundingClientRect().top;
    const used = new Map();
    for (const p of people) {
      if (p.chapterId !== st.current.id || !p.blockId || !U.BLOCK_ID_RE.test(p.blockId)) continue;
      const el = $('#editor').querySelector(':scope > [data-b="' + p.blockId + '"]');
      if (!el) continue;
      const n = used.get(p.blockId) || 0;
      used.set(p.blockId, n + 1);
      const color = U.isHex(p.color) ? p.color : '#888';
      rail.append(h('span', { class: 'presence-tag', style: 'top:' + (el.getBoundingClientRect().top - pageTop + n * 20) + 'px;background:' + color, text: p.name }));
      css += '.editor > [data-b="' + p.blockId + '"]{text-decoration:underline dotted ' + color + ' 2px;text-underline-offset:5px}';
    }
    style.textContent = css;
  }
  CB.renderMarks = renderMarks;

  /* ---------- Chat ---------- */
  function toggleChat(force) {
    const panel = $('#chatPanel');
    const open = force === undefined ? panel.hidden : force;
    panel.hidden = !open;
    document.body.classList.toggle('chat-open', open);
    if (open) {
      unread = 0; updateBadge();
      const list = $('#chatList');
      list.scrollTop = list.scrollHeight;
      $('#chatInput').focus();
    }
  }
  function updateBadge() {
    const b = $('#chatBadge');
    b.hidden = !unread;
    b.textContent = unread > 9 ? '9+' : String(unread);
  }

  CB.chatAppend = function (m, initial) {
    if (!m || seenMessages.has(m.id) || (CL().bookId() && m.book_id && m.book_id !== CL().bookId())) return;
    seenMessages.add(m.id);
    const list = $('#chatList');
    const empty = list.querySelector('.chat-empty');
    if (empty) empty.remove();
    const mine = m.user_id === CL().userId();
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    const t = new Date(m.created_at || Date.now());
    list.append(h('div', { class: 'chat-msg' + (mine ? ' mine' : '') },
      h('div', { class: 'chat-meta' },
        h('strong', { style: 'color:' + colorOf(m.user_id), text: mine ? 'You' : (m.name || 'Someone') }),
        ' ' + t.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })),
      h('div', { class: 'chat-body', text: m.body })));
    if (atBottom || mine) list.scrollTop = list.scrollHeight;
    if (!initial && !mine && $('#chatPanel').hidden) { unread++; updateBadge(); }
  };

  async function sendChat() {
    const input = $('#chatInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try { await CL().sendMessage(text); }
    catch (e) { input.value = text; Ink.toast('Message not sent: ' + e.message); }
  }
})(window.Ink);
