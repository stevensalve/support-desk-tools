/* Customer Follow-up Planner - user interface. All rules live in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readText, el, copyText } = OT;
  const $ = (id) => document.getElementById(id);
  const p2 = (n) => String(n).padStart(2, '0');
  const d0 = new Date();
  $('today').value = d0.getFullYear() + '-' + p2(d0.getMonth() + 1) + '-' + p2(d0.getDate());
  $('now').value = p2(d0.getHours()) + ':' + p2(d0.getMinutes());
  $('n-due').value = $('today').value;
  let state = FollowCore.create();

  FollowCore.CHANNELS.forEach((c) => $('n-channel').appendChild(el('option', { value: c, text: c })));
  [
    ['all', 'Everything'],
    ['active', 'Open ones'],
    ['overdue', 'Overdue'],
    ['today', 'Due today'],
    ['upcoming', 'Upcoming'],
    ['done', 'Done or cancelled'],
  ].forEach((x) => $('f-state').appendChild(el('option', { value: x[0], text: x[1] })));
  $('f-state').value = 'active';

  const today = () => $('today').value;
  const now = () => $('now').value;

  function fillOwners() {
    const sel = $('f-owner');
    const keep = sel.value;
    sel.textContent = '';
    sel.appendChild(el('option', { value: '', text: 'Everyone' }));
    Array.from(new Set(state.items.map((i) => i.owner).filter(Boolean)))
      .sort()
      .forEach((o) => sel.appendChild(el('option', { value: o, text: o })));
    sel.value = Array.from(sel.options).some((o) => o.value === keep) ? keep : '';
  }

  function apply(fn) {
    try {
      state = fn(state);
      render();
      return true;
    } catch (e) {
      setStatus($('status'), e.message, 'error');
      render();
      return false;
    }
  }

  function render() {
    if (!today()) return;
    const s = FollowCore.summary(state, today(), now());
    const stats = $('stats');
    stats.textContent = '';
    const stat = (label, v, bad) => el('div', { class: 'stat' + (bad ? ' bad' : '') }, [el('b', { text: String(v) }), label]);
    stats.appendChild(stat('Overdue', s.overdue, s.overdue > 0));
    stats.appendChild(stat('Due today', s.today));
    stats.appendChild(stat('Upcoming', s.upcoming));
    stats.appendChild(stat('Done', s.done));
    $('kept').textContent =
      s.kept === null
        ? 'Close some follow-ups to see how many promises you keep on time.'
        : s.kept + '% of finished or late promises were kept on time.';
    fillOwners();

    const rows = FollowCore.list(state, today(), now(), {
      filter: $('f-state').value,
      owner: $('f-owner').value,
      search: $('f-text').value,
    });
    const tbl = $('t-log');
    tbl.textContent = '';
    tbl.appendChild(
      el('thead', {}, [
        el(
          'tr',
          {},
          ['Customer', 'Promise', 'Due', 'State', 'Owner', ''].map((h) => el('th', { scope: 'col', text: h })),
        ),
      ]),
    );
    const body = el('tbody');
    rows.forEach((r) => {
      const done = el('button', {
        type: 'button',
        text: r.status === 'Open' ? 'Done' : 'Reopen',
        'aria-label': (r.status === 'Open' ? 'Mark done: ' : 'Reopen: ') + r.customer,
      });
      done.addEventListener('click', () => apply((st) => FollowCore.setStatus(st, r.id, r.status === 'Open' ? 'Done' : 'Open', today())));
      const cancel = el('button', { type: 'button', text: 'Cancel', 'aria-label': 'Cancel follow-up for ' + r.customer });
      cancel.addEventListener('click', () => apply((st) => FollowCore.setStatus(st, r.id, 'Cancelled', today())));
      const del = el('button', { type: 'button', text: 'Delete', 'aria-label': 'Delete follow-up for ' + r.customer });
      del.addEventListener('click', () => apply((st) => FollowCore.remove(st, r.id)));
      const label = { overdue: 'Overdue', today: 'Today', upcoming: 'Upcoming', done: 'Done', cancelled: 'Cancelled' }[r.state];
      body.appendChild(
        el('tr', {}, [
          el('td', {}, [
            el('strong', { text: r.customer }),
            el('div', { class: 'hint', text: [r.ticket, r.channel].filter(Boolean).join(' / ') }),
          ]),
          el('td', { text: r.what }),
          el('td', { class: r.state === 'overdue' ? 'late' : '', text: OT.formatDate(r.due, 'dmy') + (r.time ? ' ' + r.time : '') }),
          el('td', {}, [el('span', { class: 'pill ' + r.state, text: label })]),
          el('td', { text: r.owner }),
          el('td', { class: 'noprint' }, r.status === 'Open' ? [done, cancel, del] : [done, del]),
        ]),
      );
    });
    tbl.appendChild(body);
    $('empty').hidden = rows.length > 0;
    $('plan').textContent = FollowCore.dayPlan(state, today(), now());
  }

  $('add').addEventListener('click', () => {
    const ok = apply((st) =>
      FollowCore.add(st, {
        customer: $('n-cust').value,
        ticket: $('n-ticket').value,
        channel: $('n-channel').value,
        what: $('n-what').value,
        due: $('n-due').value,
        time: $('n-time').value,
        owner: $('n-owner').value,
      }),
    );
    if (ok) {
      ['n-cust', 'n-ticket', 'n-what', 'n-time'].forEach((id) => ($(id).value = ''));
      setStatus($('status'), 'Added.', 'ok');
    }
  });
  $('demo').addEventListener('click', () => {
    state = FollowCore.sample(today());
    render();
  });
  ['today', 'now', 'f-state', 'f-owner', 'f-text'].forEach((id) => $(id).addEventListener('input', render));
  $('copy').addEventListener('click', async () => {
    const ok = await copyText(FollowCore.dayPlan(state, today(), now()));
    setStatus(
      $('out-status'),
      ok === false ? 'Could not copy. Select the plan text and copy it yourself.' : 'Plan copied.',
      ok === false ? 'warn' : 'ok',
    );
  });
  $('csv').addEventListener('click', () =>
    downloadBlob(FollowCore.toCsv(state, today(), now()), 'follow-ups.csv', 'text/csv;charset=utf-8'),
  );
  $('ics').addEventListener('click', () => {
    const d = new Date();
    const stamp =
      d.getUTCFullYear() +
      p2(d.getUTCMonth() + 1) +
      p2(d.getUTCDate()) +
      'T' +
      p2(d.getUTCHours()) +
      p2(d.getUTCMinutes()) +
      p2(d.getUTCSeconds()) +
      'Z';
    downloadBlob(FollowCore.toIcs(state, stamp), 'follow-ups.ics', 'text/calendar;charset=utf-8');
    setStatus($('out-status'), 'Calendar file ready: only open follow-ups are included.', 'ok');
  });
  $('print').addEventListener('click', () => window.print());
  $('save').addEventListener('click', () => downloadBlob(FollowCore.serialize(state), 'follow-ups.json', 'application/json'));
  $('open-file').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    try {
      state = FollowCore.parse(await readText(f));
      render();
      setStatus($('out-status'), 'List opened: ' + state.items.length + ' follow-ups.', 'ok');
    } catch (e) {
      setStatus($('out-status'), e.message, 'error');
    }
  });
  render();
})();
