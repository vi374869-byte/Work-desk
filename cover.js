/* Work Desk — Book cover upload. */
(function (Ink) {
  'use strict';
  const U = Ink.util;
  const { $, h } = U;
  const CV = Ink.cover = {};

  CV.bind = function () {
    $('#coverUpload').addEventListener('click', () => $('#coverInput').click());
    $('#coverDone').addEventListener('click', () => $('#coverDialog').close());
    $('#coverRemove').addEventListener('click', () => {
      const book = Ink.book();
      if (!book || !book.cover) return;
      if (!confirm('Remove the cover from this book?')) return;
      book.cover = ''; book.coverThumb = '';
      Ink.markDirty();
      preview();
    });
    $('#coverInput').addEventListener('change', async () => {
      const file = $('#coverInput').files[0];
      $('#coverInput').value = '';
      if (!file) return;
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { alert('Please choose a JPG, PNG or WebP image.'); return; }
      try {
        const book = Ink.book();
        book.cover = await U.resizeImage(file, 900, 1350, 0.85);
        book.coverThumb = await U.resizeImage(file, 200, 300, 0.8);
        Ink.markDirty();
        preview();
        Ink.toast('Cover added.');
      } catch (e) {
        alert(e.message);
      }
    });
  };

  function preview() {
    const book = Ink.book();
    const box = $('#coverPreview');
    box.textContent = '';
    if (book && book.cover) box.append(h('img', { src: book.cover, alt: 'Book cover' }));
    else box.append(h('div', { class: 'cover-empty' }, h('strong', { text: book ? book.title : '' }), h('span', { text: 'No cover yet' })));
    $('#coverRemove').hidden = !(book && book.cover);
  }

  CV.open = function () {
    preview();
    $('#coverDialog').showModal();
  };
})(window.Ink);
