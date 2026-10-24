/* Ticket Log & SLA Timer - user interface. All rules live in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readText, el } = OT;
  const $ = (id) => document.getElementById(id);
  const p2 = (n) => String(n).padStart(2, '0');
  const localNow = () => {
    const d = new Date();
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + 'T' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  };
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let state = TicketCore.create();
  $('now').value = localNow();
  $('n-created').value = localNow();

  const opts = (sel, first, items) => {
    sel.textContent = '';
    if (first !== null) sel.appendChild(el('option', { value: '', text: first }));
    items.forEach((x) => sel.appendChild(el('option', { value: x, text: x })));
  };
  opts($('n-chan'), null, TicketCore.CHANNELS);
  opts($('n-pri'), null, TicketCore.PRIORITIES);
  $('n-pri').value = 'Normal';
  opts($('f-status'), 'All statuses', TicketCore.STATUSES);
  opts($('f-pri'), 'All priorities', TicketCore.PRIORITIES);

  function buildConfig() {
    $('c-start').value = state.config.start;
    $('c-end').value = state.config.end;
    $('c-hol').value = (state.config.holidays || []).join(', ');
    const box = $('c-days');
    box.textContent = '';
    DAYS.forEach((d, i) => {
      const cb = el('input', { type: 'checkbox', id: 'day-' + i });
      cb.checked = state.config.days.indexOf(i) !== -1;
      cb.addEventListener('change', applyConfig);
      box.appendChild(el('label', { class: 'inline', for: 'day-' + i }, [cb, d]));
    });
    const t = $('c-sla');
    t.textContent = '';
    t.appendChild(
      el('thead', {}, [
        el(
          'tr',
          {},
          ['Priority', 'First reply (min)', 'Resolution (min)'].map((h) => el('th', { scope: 'col', text: h })),
        ),
      ]),
    );
    const body = el('tbody');
    TicketCore.PRIORITIES.forEach((p) => {
      const a = el('input', {
        type: 'number',
        min: '1',
        id: 'sla-' + p + '-first',
        value: String(state.config.sla[p].first),
        'aria-label': p + ' first reply minutes',
      });
      const b = el('input', {
        type: 'number',
        min: '1',
        id: 'sla-' + p + '-resolve',
        value: String(state.config.sla[p].resolve),
        'aria-label': p + ' resolution minutes',
      });
      [a, b].forEach((i) => i.addEventListener('change', applyConfig));
      body.appendChild(el('tr', {}, [el('td', { text: p }), el('td', {}, [a]), el('td', {}, [b])]));
    });
    t.appendChild(body);
  }

  function applyConfig() {
    const sla = {};
    TicketCore.PRIORITIES.forEach(
      (p) => (sla[p] = { first: Number($('sla-' + p + '-first').value), resolve: Number($('sla-' + p + '-resolve').value) }),
    );
    const hol = $('c-hol')
      .value.split(/[\s,;]+/)
      .map((h) => OT.toIsoDate(h))
      .filter(Boolean);
    try {
      state = TicketCore.setConfig(state, {
        start: $('c-start').value,
        end: $('c-end').value,
        days: DAYS.map((d, i) => i).filter((i) => $('day-' + i).checked),
        holidays: hol,
        sla: sla,
      });
      setStatus($('cfg-status'), 'Settings updated.', 'ok');
      render();
    } catch (e) {
      setStatus($('cfg-status'), e.message, 'error');
    }
  }
  ['c-start', 'c-end', 'c-hol'].forEach((id) => $(id).addEventListener('change', applyConfig));

  const filter = () => ({
    text: $('f-text').value,
    status: $('f-status').value,
    priority: $('f-pri').value,
    openOnly: $('f-open').checked,
    breachedOnly: $('f-breach').checked,
  });
  const run = (fn) => {
    try {
      state = fn(state);
      setStatus($('status'), '', '');
      render();
    } catch (e) {
      setStatus($('status'), e.message, 'error');
    }
  };

  function sla(label, kind, left) {
    const text =
      kind === 'met'
        ? label + ' met'
        : kind === 'missed'
          ? label + ' missed'
          : kind === 'paused'
            ? label + ' paused'
            : kind === 'overdue'
              ? label + ' ' + TicketCore.duration(left) + ' late'
              : label + ' in ' + TicketCore.duration(left);
    const cls = kind === 'due' && left <= 120 ? 'soon' : kind;
    return el('div', {}, [el('span', { class: 'pill ' + cls, text: text })]);
  }

  function render() {
    const now = $('now').value;
    if (!now) return;
    const m = TicketCore.summary(state, now);
    const stat = (label, v, bad) => el('div', { class: 'stat' + (bad ? ' bad' : '') }, [el('b', { text: String(v) }), label]);
    const box = $('stats');
    box.textContent = '';
    [
      stat('Open', m.open),
      stat('Overdue', m.overdue, m.overdue > 0),
      stat('Due within 2 hours', m.dueSoon),
      stat('Pending customer', m.pending),
      stat('Unassigned', m.noOwner, m.noOwner > 0),
      stat('Avg first reply', m.avgFirst === null ? '-' : TicketCore.duration(m.avgFirst)),
      stat('Avg resolution', m.avgResolve === null ? '-' : TicketCore.duration(m.avgResolve)),
      stat('First reply within SLA', m.firstWithin === null ? '-' : m.firstWithin + '%'),
      stat('Resolved within SLA', m.resolveWithin === null ? '-' : m.resolveWithin + '%'),
    ].forEach((x) => box.appendChild(x));
    const rows = TicketCore.list(state, now, filter());
    const tbl = $('t-log');
    tbl.textContent = '';
    $('empty').hidden = rows.length > 0;
    if (!rows.length) return;
    tbl.appendChild(
      el('thead', {}, [
        el(
          'tr',
          {},
          ['Ref', 'Ticket', 'Priority', 'Status', 'Owner', 'SLA', 'Actions'].map((h) => el('th', { scope: 'col', text: h })),
        ),
      ]),
    );
    const body = el('tbody');
    rows.forEach((r) => {
      const st = el(
        'select',
        { 'aria-label': 'Status of ' + r.ref },
        TicketCore.STATUSES.map((s) => el('option', { value: s, text: s })),
      );
      st.value = r.status;
      st.addEventListener('change', () => run((s) => TicketCore.setStatus(s, r.id, st.value, now)));
      const pr = el(
        'select',
        { 'aria-label': 'Priority of ' + r.ref },
        TicketCore.PRIORITIES.map((s) => el('option', { value: s, text: s })),
      );
      pr.value = r.priority;
      pr.addEventListener('change', () => run((s) => TicketCore.setPriority(s, r.id, pr.value)));
      const who = el('input', { type: 'text', value: r.assignee, 'aria-label': 'Owner of ' + r.ref, maxlength: '60' });
      who.addEventListener('change', () => run((s) => TicketCore.assign(s, r.id, who.value)));
      const reply = el('button', { type: 'button', text: 'Replied now', 'aria-label': 'Mark first reply on ' + r.ref });
      reply.disabled = !!r.firstResponseAt || !r.open;
      reply.addEventListener('click', () => run((s) => TicketCore.respond(s, r.id, now)));
      body.appendChild(
        el('tr', {}, [
          el('td', { text: r.ref }),
          el('td', {}, [
            el('strong', { text: r.subject }),
            el('div', {
              class: 'hint',
              text: [r.customer, r.channel, 'received ' + OT.formatDate(r.created.slice(0, 10), 'dmy') + ' ' + r.created.slice(11)]
                .filter(Boolean)
                .join(' / '),
            }),
          ]),
          el('td', {}, [el('span', { class: 'pill ' + r.priority, text: r.priority }), el('div', { class: 'noprint' }, [pr])]),
          el('td', {}, [st]),
          el('td', {}, [who]),
          el('td', {}, [sla('Reply', r.first, r.firstLeft), sla('Fix', r.resolve, r.resolveLeft)]),
          el('td', { class: 'noprint' }, [reply]),
        ]),
      );
    });
    tbl.appendChild(body);
  }

  $('add').addEventListener('click', () => {
    try {
      const r = TicketCore.add(state, {
        subject: $('n-subject').value,
        customer: $('n-cust').value,
        channel: $('n-chan').value,
        priority: $('n-pri').value,
        assignee: $('n-who').value,
        created: $('n-created').value,
      });
      state = r.state;
      setStatus(
        $('status'),
        r.ticket.ref +
          ' logged. Reply by ' +
          r.ticket.firstDue.replace('T', ' ') +
          ', fix by ' +
          r.ticket.resolveDue.replace('T', ' ') +
          '.',
        'ok',
      );
      $('n-subject').value = '';
      render();
    } catch (e) {
      setStatus($('status'), e.message, 'error');
    }
  });
  $('demo').addEventListener('click', () => {
    state = TicketCore.sample($('now').value || localNow());
    buildConfig();
    render();
  });
  ['now', 'f-text', 'f-status', 'f-pri', 'f-open', 'f-breach'].forEach((id) => $(id).addEventListener('input', render));
  $('csv').addEventListener('click', () =>
    downloadBlob(TicketCore.toCsv(TicketCore.list(state, $('now').value, filter())), 'tickets.csv', 'text/csv;charset=utf-8'),
  );
  $('print').addEventListener('click', () => window.print());
  $('save').addEventListener('click', () => downloadBlob(TicketCore.serialize(state), 'ticket-log.json', 'application/json'));
  $('open-file').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    try {
      state = TicketCore.parse(await readText(f));
      buildConfig();
      render();
      setStatus($('out-status'), 'Opened ' + state.tickets.length + ' tickets.', 'ok');
    } catch (e) {
      setStatus($('out-status'), e.message, 'error');
    }
  });
  buildConfig();
  render();
})();
