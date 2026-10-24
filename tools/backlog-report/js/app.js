/* Backlog & Response-Time Report - user interface. All rules live in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readArrayBuffer, el } = OT;
  const $ = (id) => document.getElementById(id);
  const p2 = (n) => String(n).padStart(2, '0');
  const localNow = () => {
    const d = new Date();
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + 'T' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  };
  $('asof').value = localNow();
  let tickets = [];
  let problems = [];
  let rep = null;

  const hours = (h) => (h === null ? '-' : h < 48 ? h + ' h' : Math.round((h / 24) * 10) / 10 + ' d');
  function table(id, heads, rows) {
    const t = $(id);
    t.textContent = '';
    if (!rows.length) return;
    t.appendChild(
      el('thead', {}, [
        el(
          'tr',
          {},
          heads.map((h) => el('th', { scope: 'col', text: h })),
        ),
      ]),
    );
    const b = el('tbody');
    rows.forEach((r) =>
      b.appendChild(
        el(
          'tr',
          {},
          r.map((c) => (c instanceof Node ? el('td', {}, [c]) : el('td', { text: String(c) }))),
        ),
      ),
    );
    t.appendChild(b);
  }
  function bar(value, max, old) {
    const wrap = el('div', { class: 'hbar' + (old ? ' old' : '') });
    const s = el('span');
    s.style.width = (max ? (value / max) * 100 : 0) + '%';
    wrap.appendChild(s);
    return wrap;
  }

  function render() {
    ['stats', 'narrative'].forEach((id) => ($(id).textContent = ''));
    ['t-age', 't-old', 't-day', 't-agent', 't-prio', 't-chan', 't-cat'].forEach((id) => ($(id).textContent = ''));
    rep = null;
    if (!tickets.length) return;
    try {
      rep = ReportCore.report(tickets, $('asof').value, Number($('days').value) || 14);
    } catch (e) {
      return setStatus($('out-status'), e.message, 'error');
    }
    setStatus($('out-status'), '', '');
    const stat = (label, v, bad) => el('div', { class: 'stat' + (bad ? ' bad' : '') }, [el('b', { text: String(v) }), label]);
    [
      stat('Open tickets', rep.open),
      stat('Average age of open', rep.avgAgeDays === null ? '-' : rep.avgAgeDays + ' d'),
      stat('Median first response', hours(rep.firstMedian)),
      stat('90% answered within', hours(rep.firstP90)),
      stat('Median resolution', hours(rep.resolveMedian)),
      stat('90% resolved within', hours(rep.resolveP90)),
    ].forEach((x) => $('stats').appendChild(x));
    const n = [
      'In the last ' +
        rep.daily.length +
        ' days ' +
        rep.createdLast +
        ' tickets came in and ' +
        rep.resolvedLast +
        ' were resolved, so the backlog is ' +
        rep.trend +
        '.',
    ];
    if (rep.noFirst) n.push(rep.noFirst + ' open tickets have no first response recorded.');
    if (rep.statusOnly)
      n.push(rep.statusOnly + ' tickets are marked resolved but have no resolved time, so they are left out of resolution times.');
    $('narrative').textContent = n.join(' ');
    const maxB = Math.max.apply(null, rep.buckets.map((b) => b.count).concat(1));
    table(
      't-age',
      ['Age', 'Tickets', ''],
      rep.buckets.map((b, i) => [b.label, b.count, bar(b.count, maxB, i >= 4)]),
    );
    table(
      't-old',
      ['Ticket', 'Created', 'Age (days)', 'Agent', 'Priority', 'Category'],
      rep.oldest.map((t) => [t.id, t.created.replace('T', ' '), t.ageDays, t.agent, t.priority, t.category]),
    );
    const maxD = Math.max.apply(null, rep.daily.map((d) => d.backlog).concat(1));
    table(
      't-day',
      ['Date', 'Created', 'Resolved', 'Backlog at end of day', ''],
      rep.daily.map((d) => [OT.formatDate(d.date, 'dmy'), d.created, d.resolved, d.backlog, bar(d.backlog, maxD, false)]),
    );
    const g = (rows) => rows.map((r) => [r.key, r.total, r.open, r.resolved, hours(r.medianFirst), hours(r.medianResolve)]);
    const gh = ['', 'Tickets', 'Open', 'Resolved', 'Median first response', 'Median resolution'];
    table('t-agent', ['Agent'].concat(gh.slice(1)), g(rep.byAgent));
    table('t-prio', ['Priority'].concat(gh.slice(1)), g(rep.byPriority));
    table('t-chan', ['Channel'].concat(gh.slice(1)), g(rep.byChannel));
    table('t-cat', ['Category'].concat(gh.slice(1)), g(rep.byCategory));
  }

  function load(rows, name) {
    const r = ReportCore.rowsToTickets(rows);
    tickets = r.tickets;
    problems = r.problems;
    if (!tickets.length) {
      render();
      return setStatus($('status'), 'No usable tickets found in ' + name + '. ' + problems.slice(0, 3).join(' '), 'error');
    }
    setStatus(
      $('status'),
      name +
        ': ' +
        tickets.length +
        ' tickets.' +
        (problems.length
          ? ' ' + problems.slice(0, 4).join(' ') + (problems.length > 4 ? ' (and ' + (problems.length - 4) + ' more)' : '')
          : ''),
      problems.length ? 'warn' : 'ok',
    );
    render();
  }

  const cellValue = (v) =>
    v instanceof Date
      ? v.getFullYear() +
        '-' +
        p2(v.getMonth() + 1) +
        '-' +
        p2(v.getDate()) +
        ' ' +
        p2(v.getHours()) +
        ':' +
        p2(v.getMinutes() + (v.getSeconds() >= 30 ? 1 : 0) > 59 ? 59 : v.getMinutes() + (v.getSeconds() >= 30 ? 1 : 0))
      : v;

  async function loadFile(file) {
    try {
      const wb = XLSX.read(await readArrayBuffer(file), { type: 'array', cellDates: true });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: true, blankrows: false });
      load(
        rows.map((r) => Object.keys(r).reduce((o, k) => ((o[k] = cellValue(r[k])), o), {})),
        file.name,
      );
    } catch (e) {
      setStatus($('status'), 'Could not read that file.', 'error');
    }
  }

  OT.bindDropzone($('drop'), $('file'), (files) => files[0] && loadFile(files[0]));
  $('demo').addEventListener('click', () => {
    load(ReportCore.sampleRows($('asof').value || localNow()), 'Sample');
  });
  ['asof', 'days'].forEach((id) => $(id).addEventListener('input', render));
  $('csv').addEventListener('click', () =>
    rep
      ? downloadBlob(ReportCore.toCsv(rep), 'backlog-report.csv', 'text/csv;charset=utf-8')
      : setStatus($('out-status'), 'Load some tickets first.', 'error'),
  );
  $('print').addEventListener('click', () => window.print());
})();
