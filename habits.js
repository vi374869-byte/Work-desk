/* Work Desk — Writing habits: daily streak, 5-week heatmap, and timed sprints. */
(function (Ink) {
  'use strict';
  const U = Ink.util;
  const { $, h, fmt } = U;
  const HB = Ink.habits = {};
  let sprint = null;   // { end, minutes, startWords, bookId, timer }

  /* Words written today across every book in the library. */
  HB.libraryToday = function () {
    const today = U.todayStr();
    return Ink.state.library.books.reduce((sum, b) => sum + (b.today && b.today.date === today ? b.today.words : 0), 0);
  };

  function dayMet(words) {
    const goal = Ink.state.library.settings.goal;
    return words >= (goal > 0 ? goal : 1);
  }

  HB.streak = function () {
    const hist = Ink.state.library.history;
    const d = new Date();
    let streak = 0;
    // Today counts if the goal is met; if not yet, the streak from yesterday is still alive.
    if (dayMet(hist[U.dateKey(d)] || 0)) streak++;
    d.setDate(d.getDate() - 1);
    while (dayMet(hist[U.dateKey(d)] || 0)) { streak++; d.setDate(d.getDate() - 1); }
    return streak;
  };

  function heatmap(container) {
    container.textContent = '';
    const hist = Ink.state.library.history;
    const goal = Ink.state.library.settings.goal || 500;
    const d = new Date();
    d.setDate(d.getDate() - 34);
    for (let i = 0; i < 35; i++) {
      const key = U.dateKey(d);
      const words = hist[key] || 0;
      const ratio = words / goal;
      const level = words === 0 ? 0 : ratio < 0.25 ? 1 : ratio < 0.6 ? 2 : ratio < 1 ? 3 : 4;
      container.append(h('span', {
        class: 'hm-day hm-' + level + (i === 34 ? ' hm-today' : ''),
        title: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ': ' + fmt(words) + ' words'
      }));
      d.setDate(d.getDate() + 1);
    }
  }

  HB.render = function () {
    const s = HB.streak();
    const text = s ? '🔥 ' + s + '-day streak' : 'No streak yet. Hit your daily goal to start one.';
    $('#streakBox').textContent = text;
    $('#sbStreak').textContent = s ? '🔥 ' + s + ' day' + (s === 1 ? '' : 's') : '';
    heatmap($('#heatmap'));
    if (!$('#libraryScreen').hidden) heatmap($('#libHeatmap'));
  };
  HB.renderLibraryHeatmap = () => heatmap($('#libHeatmap'));

  /* ---------- Sprints ---------- */
  HB.bind = function () {
    $('#sprintBtn').addEventListener('click', () => {
      if (sprint) {
        if (confirm('Stop the sprint now?')) finishSprint(true);
      } else if (Ink.book()) {
        $('#sprintDialog').showModal();
      }
    });
    $('#sprintChoices').addEventListener('click', (e) => {
      const min = Number(e.target.dataset && e.target.dataset.min);
      if (!min) return;
      $('#sprintDialog').close();
      startSprint(min);
    });
  };

  function startSprint(minutes) {
    if (Ink.state.view !== 'write' || Ink.state.current.kind !== 'chapter') Ink.openChapter(Ink.state.current.id);
    sprint = { end: Date.now() + minutes * 60000, minutes, startWords: Ink.totalWords(), bookId: Ink.book().id };
    sprint.timer = setInterval(tick, 1000);
    tick();
    $('#editor').focus();
    Ink.toast('Sprint started: ' + minutes + ' minutes. Go!');
  }

  function tick() {
    if (!sprint) return;
    const left = Math.max(0, sprint.end - Date.now());
    const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
    const words = Math.max(0, Ink.totalWords() - sprint.startWords);
    const btn = $('#sprintBtn');
    btn.textContent = '⏱ ' + m + ':' + String(s).padStart(2, '0') + ' · ' + fmt(words) + ' words';
    btn.classList.add('running');
    btn.title = 'Click to stop the sprint';
    if (left <= 0) finishSprint(false);
  }

  function finishSprint(stoppedEarly) {
    if (!sprint) return;
    clearInterval(sprint.timer);
    const words = Math.max(0, Ink.totalWords() - sprint.startWords);
    const mins = Math.max(1, Math.round((Date.now() - (sprint.end - sprint.minutes * 60000)) / 60000));
    sprint = null;
    const btn = $('#sprintBtn');
    btn.textContent = '⏱ Sprint';
    btn.classList.remove('running');
    btn.title = 'Start a timed writing sprint';
    if (!stoppedEarly) chime();
    Ink.toast((stoppedEarly ? 'Sprint stopped. ' : '🎉 Sprint finished! ') + 'You wrote ' + fmt(words) + ' words in ' + mins + ' min.', 7000);
  }

  function chime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [660, 880].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f;
        o.connect(g); g.connect(ctx.destination);
        const t = ctx.currentTime + i * 0.18;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.15, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        o.start(t); o.stop(t + 0.55);
      });
    } catch (e) { /* sound is optional */ }
  }

  /* A sprint belongs to one book; stop it if the writer switches books. */
  HB.onBookSwitch = function () {
    if (sprint && (!Ink.book() || Ink.book().id !== sprint.bookId)) finishSprint(true);
  };
})(window.Ink);
