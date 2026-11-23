/* Work Desk — Import a book from a plain text (.txt) or Markdown (.md) file.
   Chapters are detected from heading lines like "Chapter 1", "Capítulo 2", "Prologue" or "# Title". */
(function (Ink) {
  'use strict';
  const U = Ink.util, S = Ink.store;
  const { $, fmt } = U;
  const I = Ink.importer = {};

  const HEADING = new RegExp(
    '^(#{1,3}\\s+\\S.*' +
    '|(chapter|chapitre|cap[ií]tulo|kapitel|capitolo|part|parte|book|libro)\\s+([0-9]+|[ivxlcdm]+|[a-záéíóúñ\\-]+)\\b.{0,60}' +
    '|prologue|epilogue|pr[oó]logo|ep[ií]logo|interlude|interludio|introduction|introducci[oó]n)[.:]?$', 'i');

  I.bind = function () {
    $('#libImportText').addEventListener('click', I.pick);
    $('#textInput').addEventListener('change', async () => {
      const file = $('#textInput').files[0];
      $('#textInput').value = '';
      if (file) await I.importFile(file);
    });
  };

  I.pick = function () { $('#textInput').click(); };

  I.importFile = async function (file) {
    if (file.size > 8 * 1024 * 1024) { alert('That file is very large (over 8 MB). Please split it into smaller files.'); return; }
    const buf = await file.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    // Files saved by older Windows programs are often not UTF-8; fall back so accents (á, ñ…) survive.
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
    text = text.replace(/^﻿/, '');
    const parsed = I.parse(text, file.name.replace(/\.[^.]+$/, ''));
    const words = parsed.chapters.reduce((s, c) => s + U.countWords(U.htmlToPlain(c.content)), 0);
    if (!words) { alert('That file has no text to import.'); return; }
    if (!confirm('Import "' + parsed.title + '" as a new book?\n\n' + parsed.chapters.length + ' chapter(s) found · ' + fmt(words) + ' words.\n\n' +
                 'Tip: chapters are split at lines like "Chapter 1", "Capítulo 2", "Prologue" or "# Heading".')) return;
    const book = S.newBook(parsed.title);
    book.chapters = parsed.chapters.map((c) => S.newChapter(c.title, c.content));
    if (Ink.addBook(book)) Ink.toast('Imported "' + book.title + '": ' + book.chapters.length + ' chapters, ' + fmt(words) + ' words.', 6000);
  };

  I.parse = function (text, fallbackTitle) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const chunks = [];
    let cur = { title: null, raw: '', lines: [] };
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      const prevBlank = i === 0 || lines[i - 1].trim() === '';
      if (t && t.length <= 80 && prevBlank && HEADING.test(t)) {
        chunks.push(cur);
        let title = t.replace(/^#{1,3}\s+/, '').replace(/[.:]$/, '');
        // "Chapter 1" followed by a short subtitle line → "Chapter 1: The Storm"
        const next = (lines[i + 1] || '').trim(), after = (lines[i + 2] || '').trim();
        if (!/^#/.test(t) && next && next.length <= 60 && !after && !/[.!?"”»]$/.test(next) && !HEADING.test(next)) {
          title += ': ' + next;
          i++;
        }
        cur = { title, raw: t, lines: [] };
      } else {
        cur.lines.push(lines[i]);
      }
    }
    chunks.push(cur);

    let bookTitle = fallbackTitle || 'Imported book';
    const withText = (c) => c.lines.join('\n').trim();
    const titled = chunks.filter((c) => c.title !== null);

    if (!titled.length) {
      return { title: bookTitle, chapters: [{ title: 'Chapter 1', content: U.textToHtml(withText(chunks[0])) }] };
    }

    // Text before the first heading: a short block is the book's title page, a long one is an opening chapter.
    const pre = chunks[0];
    const preText = withText(pre);
    const preLines = preText.split('\n').filter((l) => l.trim());
    const out = [];
    if (preText) {
      if (preLines.length <= 3 && preText.length <= 200) bookTitle = preLines[0].replace(/^#+\s*/, '').trim().slice(0, 80) || bookTitle;
      else out.push({ title: 'Opening', content: U.textToHtml(preText) });
    }
    titled.forEach((c, idx) => {
      const body = withText(c);
      // A Markdown "# Title" with nothing under it, at the top, is the book title.
      if (idx === 0 && /^#\s/.test(c.raw) && !body && titled.length > 1) { bookTitle = c.title; return; }
      out.push({ title: c.title, content: U.textToHtml(body) });
    });
    return { title: bookTitle, chapters: out.length ? out : [{ title: 'Chapter 1', content: '' }] };
  };
})(window.Ink);
