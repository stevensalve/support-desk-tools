/* Escalation Tracker - user interface. All rules live in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readText, el, copyText } = OT;
  const $ = (id) => document.getElementById(id);
  const p2 = (n) => String(n).padStart(2, '0');
  const d0 = new Date();
  const todayIso = d0.getFullYear() + '-' + p2(d0.getMonth() + 1) + '-' + p2(d0.getDate());
  $('today').value = todayIso;
  $('n-date').value = todayIso;
  let state = EscalationCore.create();

  const opts = (sel, first, items) => {
    const prev = sel.value;
    sel.textContent = '';
    if (first !== null) sel.appendChild(el('option', { value: '', text: first }));
    items.forEach((x) => sel.appendChild(el('option', { value: String(x[0]), text: x[1] })));
    if (items.some((x) => String(x[0]) === prev)) sel.value = prev;
  };
  const levels = [1, 2, 3].map((l) => [l, 'Level ' + l + ' - ' + EscalationCore.LEVELS[l]]);
  opts(
    $('n-reason'),
    null,
    EscalationCore.REASONS.map((r) => [r, r]),
  );
  opts($('n-level'), null, levels);
  opts($('f-level'), 'All levels', levels);

  function buildCadence() {
    const box = $('cadence');
    box.textContent = '';
    [1, 2, 3].forEach((l) => {
      const inp = el('input', { type: 'number', min: '1', max: '30', id: 'cad-' + l, value: String(state.cadence[l]) });
      inp.addEventListener('change', () => {
        try {
          state = EscalationCore.setCadence(state, {
            1: Number($('cad-1').value),
            2: Number($('cad-2').value),
            3: Number($('cad-3').value),
          });
          setStatus($('status'), 'Intervals updated.', 'ok');
        } catch (e) {
          setStatus($('status'), e.message, 'error');
        }
      });
      box.appendChild(el('div', {}, [el('label', { for: 'cad-' + l, text: 'Level ' + l + ' (' + EscalationCore.LEVELS[l] + ')' }), inp]));
    });
  }

  const filter = () => ({
    text: $('f-text').value,
    level: $('f-level').value,
    openOnly: $('f-open').checked,
    overdueOnly: $('f-over').checked,
  });
  const run = (fn, ok) => {
    try {
      state = fn(state);
      setStatus($('status'), ok || '', ok ? 'ok' : '');
      render();
    } catch (e) {
      setStatus($('status'), e.message, 'error');
    }
  };

  function render() {
    const today = $('today').value;
    if (!today) return;
    const m = EscalationCore.summary(state, today);
    const stat = (label, v, bad) => el('div', { class: 'stat' + (bad ? ' bad' : '') }, [el('b', { text: String(v) }), label]);
    const box = $('stats');
    box.textContent = '';
    [
      stat('Open', m.open),
      stat('Updates overdue', m.overdue, m.overdue > 0),
      stat('Updates due today', m.dueToday),
      stat('Avg days to resolve', m.avgResolveDays === null ? '-' : m.avgResolveDays),
    ].forEach((x) => box.appendChild(x));
    $('breakdown').textContent = m.open
      ? 'Open by level: ' +
        m.byLevel.map((x) => x.name + ' ' + x.count).join(', ') +
        '. Oldest: ' +
        m.oldest.ref +
        ' (' +
        m.oldest.ageDays +
        ' days).'
      : state.items.length
        ? 'Nothing open.'
        : 'Nothing logged yet.';
    const owners = Array.from(new Set(state.items.map((i) => i.owner))).sort();
    opts(
      $('r-owner'),
      null,
      owners.map((o) => [o, o]),
    );
    $('msg').textContent = owners.length ? EscalationCore.reminder(state, today, $('r-owner').value || owners[0]) : '';

    const rows = EscalationCore.list(state, today, filter());
    const tbl = $('t-log');
    tbl.textContent = '';
    $('empty').hidden = rows.length > 0;
    if (!rows.length) return;
    tbl.appendChild(
      el('thead', {}, [
        el(
          'tr',
          {},
          ['Ref', 'Case', 'Level', 'Status', 'Owner', 'Next update', 'History and new update'].map((h) =>
            el('th', { scope: 'col', text: h }),
          ),
        ),
      ]),
    );
    const body = el('tbody');
    rows.forEach((r) => {
      const st = el(
        'select',
        { 'aria-label': 'Status of ' + r.ref },
        EscalationCore.STATUSES.map((s) => el('option', { value: s, text: s })),
      );
      st.value = r.status;
      st.addEventListener('change', () => run((s) => EscalationCore.setStatus(s, r.id, st.value, today)));
      const raise = el(
        'select',
        { 'aria-label': 'Raise level of ' + r.ref },
        [el('option', { value: '', text: 'Raise to...' })].concat(
          [1, 2, 3].filter((l) => l > r.level).map((l) => el('option', { value: String(l), text: 'Level ' + l })),
        ),
      );
      raise.disabled = r.level === 3 || !r.open;
      raise.addEventListener('change', () => {
        if (!raise.value) return;
        const why = window.prompt('Why is this being escalated to level ' + raise.value + '?');
        if (why === null) return render();
        run((s) => EscalationCore.raiseLevel(s, r.id, Number(raise.value), today, why));
      });
      const who = el('input', { type: 'text', value: r.owner, 'aria-label': 'Owner of ' + r.ref, maxlength: '60' });
      who.addEventListener('change', () => run((s) => EscalationCore.assign(s, r.id, who.value)));
      const note = el('input', {
        type: 'text',
        placeholder: 'Add update, press Enter',
        'aria-label': 'New update for ' + r.ref,
        maxlength: '300',
      });
      note.disabled = !r.open;
      note.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && note.value.trim()) run((s) => EscalationCore.addUpdate(s, r.id, today, note.value));
      });
      const due = !r.open
        ? 'Resolved ' + OT.formatDate(r.resolvedOn, 'dmy')
        : OT.formatDate(r.nextUpdate, 'dmy') +
          (r.overdue ? ' (' + -r.daysToUpdate + ' days overdue)' : r.daysToUpdate === 0 ? ' (today)' : '');
      const hist = r.history.slice(-3).map((h) => el('div', { class: 'hint', text: OT.formatDate(h.date, 'dmy') + ': ' + h.text }));
      body.appendChild(
        el('tr', {}, [
          el('td', { text: r.ref }),
          el('td', {}, [
            el('strong', { text: r.title }),
            el('div', { class: 'hint', text: [r.customer, r.reason, 'open ' + r.ageDays + ' days'].filter(Boolean).join(' / ') }),
          ]),
          el('td', {}, [
            el('span', { class: 'pill L' + r.level, text: 'L' + r.level + ' ' + r.levelName }),
            el('div', { class: 'noprint' }, [raise]),
          ]),
          el('td', {}, [st]),
          el('td', {}, [who]),
          el('td', { class: r.overdue ? 'late' : '', text: due }),
          el('td', {}, hist.concat([note])),
        ]),
      );
    });
    tbl.appendChild(body);
  }

  $('add').addEventListener('click', () => {
    try {
      const r = EscalationCore.add(state, {
        title: $('n-title').value,
        customer: $('n-cust').value,
        reason: $('n-reason').value,
        level: $('n-level').value,
        owner: $('n-owner').value,
        raised: $('n-date').value,
        note: $('n-note').value,
      });
      state = r.state;
      setStatus($('status'), r.item.ref + ' logged. First update due ' + OT.formatDate(r.item.nextUpdate, 'dmy') + '.', 'ok');
      $('n-title').value = '';
      $('n-note').value = '';
      render();
    } catch (e) {
      setStatus($('status'), e.message, 'error');
    }
  });
  $('demo').addEventListener('click', () => {
    state = EscalationCore.sample($('today').value || todayIso);
    buildCadence();
    render();
  });
  ['today', 'f-text', 'f-level', 'f-open', 'f-over', 'r-owner'].forEach((id) => $(id).addEventListener('input', render));
  $('copy').addEventListener('click', async () => {
    const ok = await copyText($('msg').textContent);
    setStatus(
      $('out-status'),
      ok === false ? 'Could not copy. Select the text and copy it yourself.' : 'Copied.',
      ok === false ? 'warn' : 'ok',
    );
  });
  $('csv').addEventListener('click', () =>
    downloadBlob(EscalationCore.toCsv(EscalationCore.list(state, $('today').value, filter())), 'escalations.csv', 'text/csv;charset=utf-8'),
  );
  $('print').addEventListener('click', () => window.print());
  $('save').addEventListener('click', () => downloadBlob(EscalationCore.serialize(state), 'escalation-tracker.json', 'application/json'));
  $('open-file').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    try {
      state = EscalationCore.parse(await readText(f));
      buildCadence();
      render();
      setStatus($('out-status'), 'Opened ' + state.items.length + ' escalations.', 'ok');
    } catch (e) {
      setStatus($('out-status'), e.message, 'error');
    }
  });
  buildCadence();
  render();
})();
