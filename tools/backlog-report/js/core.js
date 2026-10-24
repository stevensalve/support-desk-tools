/**
 * Backlog & Response-Time Report - core logic (pure; the as-of time is always passed in).
 *
 * Works on plain rows (an array of objects keyed by column header). Columns are matched loosely:
 * Ticket ID, Created, First response, Resolved (or Closed), Status, Priority, Agent, Channel, Category.
 * Times may be real dates, "2026-10-23 14:30", "23/10/2026 14:30" or Excel serial numbers.
 * All times are elapsed (calendar) hours, not business hours.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.ReportCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const key = (s) =>
    norm(s)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  const HOUR = 3600000;
  const DAY = 86400000;
  const MAX = 50000;
  const ALIASES = {
    id: ['ticketid', 'id', 'ticket', 'ticketno', 'ticketnumber', 'caseid', 'case', 'reference'],
    created: ['created', 'createdat', 'createdon', 'opened', 'openedat', 'received', 'date', 'createddate', 'creationtime'],
    first: ['firstresponse', 'firstresponseat', 'firstreply', 'firstrespondedat', 'firstresponsetime', 'firstcontact'],
    resolved: [
      'resolved',
      'resolvedat',
      'resolvedon',
      'closed',
      'closedat',
      'closedon',
      'solved',
      'solvedat',
      'resolutiontime',
      'completed',
    ],
    status: ['status', 'state', 'ticketstatus'],
    priority: ['priority', 'urgency'],
    agent: ['agent', 'assignee', 'assignedto', 'owner', 'handler', 'agentname'],
    channel: ['channel', 'source', 'medium'],
    category: ['category', 'type', 'topic', 'issuetype', 'reason'],
  };
  const DONE_WORDS = /^(resolved|closed|solved|done|completed|complete)$/i;

  const p2 = (n) => String(n).padStart(2, '0');
  const dt = (ms) => new Date(ms).toISOString().slice(0, 16);

  /** Cell -> 'YYYY-MM-DDTHH:MM' or '' when blank; null when unreadable. */
  function toDateTime(v) {
    if (v === null || v === undefined || norm(v) === '') return '';
    if (v instanceof Date) return isNaN(v) ? null : dt(v.getTime());
    if (typeof v === 'number') {
      if (!(v > 20000 && v < 80000)) return null;
      return dt(Math.round(((v - 25569) * DAY) / 60000) * 60000);
    }
    const s = norm(v);
    let m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}):(\d{2}))?/.exec(s);
    let date;
    let h = 0;
    let mi = 0;
    if (m) {
      date = m[1];
      h = Number(m[2] || 0);
      mi = Number(m[3] || 0);
    } else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[T ,]+(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?)?$/i.exec(s))) {
      date = m[3] + '-' + p2(m[2]) + '-' + p2(m[1]);
      h = Number(m[4] || 0);
      mi = Number(m[5] || 0);
      if (m[6]) {
        if (/pm/i.test(m[6]) && h < 12) h += 12;
        if (/am/i.test(m[6]) && h === 12) h = 0;
      }
    } else {
      const only = OT.toIsoDate(s);
      if (!only) return null;
      date = only;
    }
    try {
      OT.parseIsoDate(date);
    } catch (e) {
      return null;
    }
    if (h > 23 || mi > 59) return null;
    return date + 'T' + p2(h) + ':' + p2(mi);
  }
  const ms = (d) => Date.parse(d + ':00Z');

  function pick(row, names) {
    const map = {};
    Object.keys(row).forEach((k) => (map[key(k)] = row[k]));
    for (let i = 0; i < names.length; i++) if (map[names[i]] !== undefined && norm(map[names[i]]) !== '') return map[names[i]];
    return '';
  }

  /** rows -> { tickets, problems }. Rows without a readable Created time are listed in problems. */
  function rowsToTickets(rows) {
    const tickets = [];
    const problems = [];
    (rows || []).slice(0, MAX).forEach((row, i) => {
      if (Object.keys(row).every((k) => norm(row[k]) === '')) return;
      const at = 'Row ' + (i + 2) + ': ';
      const created = toDateTime(pick(row, ALIASES.created));
      if (!created) return problems.push(at + 'no readable Created time.');
      const first = toDateTime(pick(row, ALIASES.first));
      let resolved = toDateTime(pick(row, ALIASES.resolved));
      if (first === null || resolved === null) problems.push(at + 'a response or resolved time could not be read; it was ignored.');
      const status = norm(pick(row, ALIASES.status));
      const f = first || '';
      let r = resolved || '';
      if (f && f < created) {
        problems.push(at + 'first response is before created; it was ignored.');
        return tickets.push(build(row, i, created, '', r, status));
      }
      if (r && r < created) {
        problems.push(at + 'resolved time is before created; it was ignored.');
        r = '';
      }
      tickets.push(build(row, i, created, f, r, status));
    });
    return { tickets: tickets, problems: problems };
  }

  function build(row, i, created, first, resolved, status) {
    const doneByStatus = DONE_WORDS.test(status);
    return {
      id: norm(pick(row, ALIASES.id)) || 'row ' + (i + 2),
      created: created,
      first: first,
      resolved: resolved,
      resolvedByStatusOnly: doneByStatus && !resolved,
      status: status,
      priority: norm(pick(row, ALIASES.priority)) || '(none)',
      agent: norm(pick(row, ALIASES.agent)) || '(unassigned)',
      channel: norm(pick(row, ALIASES.channel)) || '(none)',
      category: norm(pick(row, ALIASES.category)) || '(none)',
    };
  }

  const isOpen = (t) => !t.resolved && !DONE_WORDS.test(t.status);

  /** Linear-interpolated percentile of a number list (p from 0 to 100). */
  function percentile(list, p) {
    if (!list.length) return null;
    const a = list.slice().sort((x, y) => x - y);
    const pos = ((a.length - 1) * p) / 100;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return a[lo] + (a[hi] - a[lo]) * (pos - lo);
  }
  const r1 = (n) => (n === null ? null : Math.round(n * 10) / 10);

  const BUCKETS = [
    ['Under 1 day', 0, 1],
    ['1 to 2 days', 1, 3],
    ['3 to 7 days', 3, 8],
    ['8 to 14 days', 8, 15],
    ['15 to 30 days', 15, 31],
    ['Over 30 days', 31, Infinity],
  ];

  /**
   * report(tickets, asOf, days): asOf 'YYYY-MM-DDTHH:MM'; days = how many days the daily trend covers (default 14).
   */
  function report(tickets, asOf, days) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(asOf)) || isNaN(ms(asOf))) throw new Error('Choose the report date and time.');
    const now = ms(asOf);
    const n = Math.max(1, Math.min(90, days || 14));
    const open = tickets.filter((t) => isOpen(t) && ms(t.created) <= now);
    const ageDays = (t) => (now - ms(t.created)) / DAY;
    const buckets = BUCKETS.map((b) => ({ label: b[0], count: open.filter((t) => ageDays(t) >= b[1] && ageDays(t) < b[2]).length }));
    const oldest = open
      .slice()
      .sort((a, b) => a.created.localeCompare(b.created))
      .slice(0, 5)
      .map((t) => Object.assign({ ageDays: Math.floor(ageDays(t)) }, t));
    const hours = (a, b) => (ms(b) - ms(a)) / HOUR;
    const inRange = (t, f) => t[f] && ms(t[f]) <= now;
    const firstTimes = tickets.filter((t) => inRange(t, 'first')).map((t) => hours(t.created, t.first));
    const resTimes = tickets.filter((t) => inRange(t, 'resolved')).map((t) => hours(t.created, t.resolved));
    const day0 = asOf.slice(0, 10);
    const daily = [];
    for (let k = n - 1; k >= 0; k--) {
      const d = OT.addDays(day0, -k);
      const end = ms(d + 'T23:59');
      const start = ms(d + 'T00:00');
      daily.push({
        date: d,
        created: tickets.filter((t) => ms(t.created) >= start && ms(t.created) <= end).length,
        resolved: tickets.filter((t) => t.resolved && ms(t.resolved) >= start && ms(t.resolved) <= end).length,
        backlog: tickets.filter((t) => ms(t.created) <= end && !(t.resolved && ms(t.resolved) <= end)).length,
      });
    }
    const group = (field) => {
      const m = {};
      tickets.forEach((t) => (m[t[field]] = m[t[field]] || []).push(t));
      return Object.keys(m)
        .map((k) => {
          const g = m[k];
          const res = g.filter((t) => inRange(t, 'resolved')).map((t) => hours(t.created, t.resolved));
          const fr = g.filter((t) => inRange(t, 'first')).map((t) => hours(t.created, t.first));
          return {
            key: k,
            total: g.length,
            open: g.filter((t) => isOpen(t) && ms(t.created) <= now).length,
            resolved: res.length,
            medianFirst: r1(percentile(fr, 50)),
            medianResolve: r1(percentile(res, 50)),
          };
        })
        .sort((a, b) => b.open - a.open || b.total - a.total || a.key.localeCompare(b.key));
    };
    const createdLast = daily.reduce((a, d) => a + d.created, 0);
    const resolvedLast = daily.reduce((a, d) => a + d.resolved, 0);
    return {
      asOf: asOf,
      total: tickets.length,
      open: open.length,
      buckets: buckets,
      oldest: oldest,
      avgAgeDays: open.length ? r1(open.reduce((a, t) => a + ageDays(t), 0) / open.length) : null,
      firstMedian: r1(percentile(firstTimes, 50)),
      firstP90: r1(percentile(firstTimes, 90)),
      resolveMedian: r1(percentile(resTimes, 50)),
      resolveP90: r1(percentile(resTimes, 90)),
      daily: daily,
      createdLast: createdLast,
      resolvedLast: resolvedLast,
      trend: createdLast > resolvedLast ? 'growing' : createdLast < resolvedLast ? 'shrinking' : 'flat',
      noFirst: tickets.filter((t) => isOpen(t) && !t.first).length,
      statusOnly: tickets.filter((t) => t.resolvedByStatusOnly).length,
      byAgent: group('agent'),
      byPriority: group('priority'),
      byChannel: group('channel'),
      byCategory: group('category'),
    };
  }

  const cell = (v) => {
    const t = String(v === null || v === undefined ? '' : v);
    const safe = /^[=+@]/.test(t) || /^-[^0-9]/.test(t) ? "'" + t : t;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };

  function toCsv(rep) {
    const L = [];
    L.push(
      ['Report as of', rep.asOf.replace('T', ' ')],
      ['Open tickets', rep.open],
      ['Median first response (hours)', rep.firstMedian === null ? '' : rep.firstMedian],
      ['90th percentile first response (hours)', rep.firstP90 === null ? '' : rep.firstP90],
      ['Median resolution (hours)', rep.resolveMedian === null ? '' : rep.resolveMedian],
      ['90th percentile resolution (hours)', rep.resolveP90 === null ? '' : rep.resolveP90],
      [],
    );
    L.push(['Open backlog by age', 'Tickets']);
    rep.buckets.forEach((b) => L.push([b.label, b.count]));
    L.push([], ['Date', 'Created', 'Resolved', 'Backlog at end of day']);
    rep.daily.forEach((d) => L.push([d.date, d.created, d.resolved, d.backlog]));
    [
      ['By agent', rep.byAgent],
      ['By priority', rep.byPriority],
      ['By channel', rep.byChannel],
      ['By category', rep.byCategory],
    ].forEach((g) => {
      L.push([], [g[0], 'Tickets', 'Open', 'Resolved', 'Median first response (h)', 'Median resolution (h)']);
      g[1].forEach((r) =>
        L.push([
          r.key,
          r.total,
          r.open,
          r.resolved,
          r.medianFirst === null ? '' : r.medianFirst,
          r.medianResolve === null ? '' : r.medianResolve,
        ]),
      );
    });
    return '﻿' + L.map((r) => r.map(cell).join(',')).join('\r\n');
  }

  function sampleRows(asOf) {
    const day = asOf.slice(0, 10);
    const t = (back, hhmm) => OT.addDays(day, -back) + ' ' + hhmm;
    const agents = ['Asha', 'Ravi', 'Meera'];
    const prios = ['Urgent', 'High', 'Normal', 'Normal', 'Low'];
    const chans = ['Email', 'Chat', 'Phone', 'WhatsApp'];
    const cats = ['Billing', 'Login', 'Delivery', 'Product', 'Refund'];
    const rows = [];
    for (let i = 0; i < 40; i++) {
      const back = (i * 7) % 20;
      const created = t(back, ('0' + (9 + (i % 9))).slice(-2) + ':' + ('0' + ((i * 13) % 60)).slice(-2));
      const respHours = 1 + ((i * 5) % 9);
      const resolveHours = 6 + ((i * 11) % 70);
      const c = Date.parse(created.replace(' ', 'T') + ':00Z');
      const f = dt(c + respHours * HOUR).replace('T', ' ');
      const done = i % 3 !== 0 && c + resolveHours * HOUR < Date.parse(asOf + ':00Z');
      rows.push({
        'Ticket ID': 'T-' + (1000 + i),
        Created: created,
        'First Response': c + respHours * HOUR < Date.parse(asOf + ':00Z') ? f : '',
        Resolved: done ? dt(c + resolveHours * HOUR).replace('T', ' ') : '',
        Status: done ? 'Resolved' : 'Open',
        Priority: prios[i % 5],
        Agent: agents[i % 3],
        Channel: chans[i % 4],
        Category: cats[i % 5],
      });
    }
    return rows;
  }

  return {
    toDateTime: toDateTime,
    rowsToTickets: rowsToTickets,
    percentile: percentile,
    report: report,
    toCsv: toCsv,
    sampleRows: sampleRows,
  };
});
