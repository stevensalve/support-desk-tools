/**
 * Ticket Log & SLA Timer - core logic (pure; "now" is always passed in as 'YYYY-MM-DDTHH:MM').
 *
 * Ticket: { id, ref, subject, customer, channel, priority, assignee, status, created, firstResponseAt, resolvedAt,
 *           firstDue, resolveDue, pendingSince }
 * SLA targets are in business minutes. The clock runs only inside business hours on working days and stops
 * while a ticket is "Pending customer": waiting time is added back to the resolution deadline.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.TicketCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const copy = (o) => JSON.parse(JSON.stringify(o));
  const PRIORITIES = ['Urgent', 'High', 'Normal', 'Low'];
  const STATUSES = ['Open', 'Pending customer', 'Resolved', 'Closed'];
  const CHANNELS = ['Email', 'Phone', 'Chat', 'WhatsApp', 'Social', 'Walk-in'];
  const MIN = 60000;
  const DAY = 86400000;
  const MAX = 5000;
  const DEFAULT_CONFIG = {
    start: '10:00',
    end: '19:00',
    days: [1, 2, 3, 4, 5, 6],
    holidays: [],
    sla: {
      Urgent: { first: 60, resolve: 240 },
      High: { first: 120, resolve: 480 },
      Normal: { first: 240, resolve: 1080 },
      Low: { first: 480, resolve: 2160 },
    },
  };

  /** 'YYYY-MM-DDTHH:MM' -> ms (as if UTC); throws on nonsense. */
  function toMs(dt) {
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(String(dt));
    if (!m) throw new Error('Times must look like 2026-10-23T14:30.');
    const h = Number(m[2]);
    const mi = Number(m[3]);
    if (h > 23 || mi > 59) throw new Error('That time does not exist.');
    return OT.parseIsoDate(m[1]) + h * 3600000 + mi * MIN;
  }
  const fromMs = (ms) => new Date(ms).toISOString().slice(0, 16);
  const hm = (t) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(t));
    if (!m || Number(m[1]) > 24 || Number(m[2]) > 59) throw new Error('Business hours must look like 10:00.');
    return Number(m[1]) * 60 + Number(m[2]);
  };

  function checkConfig(cfg) {
    const s = hm(cfg.start);
    const e = hm(cfg.end);
    if (e <= s) throw new Error('Business hours must end after they start.');
    if (!Array.isArray(cfg.days) || !cfg.days.length || cfg.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6))
      throw new Error('Choose at least one working day.');
    PRIORITIES.forEach((p) => {
      const t = cfg.sla && cfg.sla[p];
      if (!t || !Number.isInteger(t.first) || !Number.isInteger(t.resolve) || t.first < 1 || t.resolve < t.first || t.resolve > 100000)
        throw new Error('The ' + p + ' targets must be whole minutes, with resolution not shorter than first response.');
    });
    return { s: s, e: e, days: new Set(cfg.days), hol: new Set((cfg.holidays || []).map((h) => OT.toIsoDate(h)).filter(Boolean)) };
  }

  const dayInfo = (ms, c) => {
    const day = ms - (((ms % DAY) + DAY) % DAY);
    const dow = new Date(day).getUTCDay();
    const work = c.days.has(dow) && !c.hol.has(fromMs(day).slice(0, 10));
    return { day: day, work: work, open: day + c.s * MIN, close: day + c.e * MIN };
  };

  /** Earliest moment inside business hours at or after ms. */
  function nextOpen(ms, c) {
    let t = ms;
    for (let i = 0; i < 800; i++) {
      const d = dayInfo(t, c);
      if (d.work) {
        if (t < d.open) return d.open;
        if (t < d.close) return t;
      }
      t = d.day + DAY;
    }
    throw new Error('No working day found: check the working days and holidays.');
  }

  /** Deadline after `minutes` of business time starting at startDt. Returns 'YYYY-MM-DDTHH:MM'. */
  function addBusinessMinutes(startDt, minutes, cfg) {
    const c = checkConfig(cfg);
    let t = nextOpen(toMs(startDt), c);
    let left = minutes;
    for (let i = 0; i < 5000; i++) {
      const d = dayInfo(t, c);
      const avail = (d.close - t) / MIN;
      if (left <= avail) return fromMs(t + left * MIN);
      left -= avail;
      t = nextOpen(d.day + DAY, c);
    }
    throw new Error('That is too far ahead.');
  }

  /** Business minutes between two times (0 if b is not after a). */
  function businessMinutes(aDt, bDt, cfg) {
    const c = checkConfig(cfg);
    const a = toMs(aDt);
    const b = toMs(bDt);
    if (b <= a) return 0;
    let total = 0;
    for (let day = a - (((a % DAY) + DAY) % DAY); day <= b; day += DAY) {
      const d = dayInfo(day, c);
      if (!d.work) continue;
      const lo = Math.max(a, d.open);
      const hi = Math.min(b, d.close);
      if (hi > lo) total += (hi - lo) / MIN;
    }
    return total;
  }

  /** Signed business minutes from now to a deadline: negative means overdue. */
  function remaining(nowDt, dueDt, cfg) {
    return dueDt >= nowDt ? businessMinutes(nowDt, dueDt, cfg) : -businessMinutes(dueDt, nowDt, cfg);
  }

  function duration(min) {
    const m = Math.abs(Math.round(min));
    const d = Math.floor(m / 60);
    const r = m % 60;
    return ((d ? d + 'h ' : '') + (r || !d ? r + 'm' : '')).trim();
  }

  const create = (cfg) => ({ nextId: 1, config: copy(cfg || DEFAULT_CONFIG), tickets: [] });

  function setConfig(state, cfg) {
    checkConfig(cfg);
    const s = copy(state);
    s.config = copy(cfg);
    return s;
  }

  /** t: { subject, customer, channel, priority, assignee, created }. Returns { state, ticket }. */
  function add(state, t) {
    const subject = norm(t.subject);
    if (!subject) throw new Error('Write a short subject.');
    if (PRIORITIES.indexOf(t.priority) === -1) throw new Error('Choose a priority.');
    toMs(t.created);
    if (state.tickets.length >= MAX) throw new Error('The log is full (' + MAX + ' tickets).');
    const s = copy(state);
    const id = s.nextId++;
    const target = s.config.sla[t.priority];
    const ticket = {
      id: id,
      ref: 'T-' + String(id).padStart(4, '0'),
      subject: subject.slice(0, 120),
      customer: norm(t.customer).slice(0, 60),
      channel: CHANNELS.indexOf(t.channel) !== -1 ? t.channel : 'Email',
      priority: t.priority,
      assignee: norm(t.assignee).slice(0, 60),
      status: 'Open',
      created: t.created,
      firstResponseAt: '',
      resolvedAt: '',
      firstDue: addBusinessMinutes(t.created, target.first, s.config),
      resolveDue: addBusinessMinutes(t.created, target.resolve, s.config),
      pendingSince: '',
    };
    s.tickets.push(ticket);
    return { state: s, ticket: ticket };
  }

  const find = (s, id) => {
    const t = s.tickets.find((x) => x.id === id);
    if (!t) throw new Error('No such ticket.');
    return t;
  };

  /** Record the first reply to the customer. */
  function respond(state, id, at) {
    toMs(at);
    const s = copy(state);
    const t = find(s, id);
    if (at < t.created) throw new Error('The reply cannot be before the ticket was created.');
    if (!t.firstResponseAt) t.firstResponseAt = at;
    return s;
  }

  /** Change status at time `at`. Resolving needs a time; "Pending customer" stops the clock; leaving it adds the wait back. */
  function setStatus(state, id, status, at) {
    if (STATUSES.indexOf(status) === -1) throw new Error('Choose a status.');
    toMs(at);
    const s = copy(state);
    const t = find(s, id);
    if (at < t.created) throw new Error('That time is before the ticket was created.');
    if (t.status === 'Pending customer' && status !== 'Pending customer' && t.pendingSince) {
      t.resolveDue = addBusinessMinutes(t.resolveDue, businessMinutes(t.pendingSince, at, s.config), s.config);
      t.pendingSince = '';
    }
    if (status === 'Pending customer' && t.status !== 'Pending customer') t.pendingSince = at;
    if (status === 'Resolved' || status === 'Closed') {
      if (!t.resolvedAt) t.resolvedAt = at;
      if (!t.firstResponseAt) t.firstResponseAt = at;
    } else t.resolvedAt = '';
    t.status = status;
    return s;
  }

  function assign(state, id, who) {
    const s = copy(state);
    find(s, id).assignee = norm(who).slice(0, 60);
    return s;
  }

  /** Change priority: both deadlines are recalculated from the creation time (waiting time already added back is kept). */
  function setPriority(state, id, priority) {
    if (PRIORITIES.indexOf(priority) === -1) throw new Error('Choose a priority.');
    const s = copy(state);
    const t = find(s, id);
    const oldTarget = s.config.sla[t.priority].resolve;
    const paused = businessMinutes(addBusinessMinutes(t.created, oldTarget, s.config), t.resolveDue, s.config);
    const target = s.config.sla[priority];
    t.priority = priority;
    t.firstDue = addBusinessMinutes(t.created, target.first, s.config);
    t.resolveDue = addBusinessMinutes(t.created, target.resolve + paused, s.config);
    return s;
  }

  /**
   * Rows with SLA state. first: 'met' | 'missed' | 'due' | 'overdue'; resolve: same. firstLeft/resolveLeft in business minutes (open tickets).
   * Filters: status, priority, assignee, openOnly, breachedOnly, text. Most urgent first.
   */
  function list(state, now, filter) {
    toMs(now);
    const f = Object.assign({ status: '', priority: '', assignee: '', openOnly: false, breachedOnly: false, text: '' }, filter);
    const q = norm(f.text).toLowerCase();
    const cfg = state.config;
    return state.tickets
      .map((t) => {
        const open = t.status !== 'Resolved' && t.status !== 'Closed';
        const paused = t.status === 'Pending customer';
        let first;
        let firstLeft = null;
        if (t.firstResponseAt) first = t.firstResponseAt <= t.firstDue ? 'met' : 'missed';
        else {
          firstLeft = remaining(now, t.firstDue, cfg);
          first = firstLeft < 0 ? 'overdue' : 'due';
        }
        let resolve;
        let resolveLeft = null;
        if (!open) resolve = t.resolvedAt <= t.resolveDue ? 'met' : 'missed';
        else if (paused) resolve = 'paused';
        else {
          resolveLeft = remaining(now, t.resolveDue, cfg);
          resolve = resolveLeft < 0 ? 'overdue' : 'due';
        }
        const breached = first === 'overdue' || first === 'missed' || resolve === 'overdue' || resolve === 'missed';
        const urgency = !open
          ? 1e9
          : Math.min(first === 'due' || first === 'overdue' ? firstLeft : 1e8, resolveLeft === null ? 1e8 : resolveLeft);
        return Object.assign({}, t, {
          open: open,
          first: first,
          firstLeft: firstLeft,
          resolve: resolve,
          resolveLeft: resolveLeft,
          breached: breached,
          urgency: urgency,
          firstTime: t.firstResponseAt ? businessMinutes(t.created, t.firstResponseAt, cfg) : null,
          resolveTime: t.resolvedAt ? businessMinutes(t.created, t.resolvedAt, cfg) : null,
        });
      })
      .filter(
        (r) =>
          (!f.status || r.status === f.status) &&
          (!f.priority || r.priority === f.priority) &&
          (!f.assignee || r.assignee === f.assignee) &&
          (!f.openOnly || r.open) &&
          (!f.breachedOnly || r.breached) &&
          (!q || (r.subject + ' ' + r.ref + ' ' + r.customer).toLowerCase().indexOf(q) !== -1),
      )
      .sort((a, b) => a.urgency - b.urgency || a.created.localeCompare(b.created) || a.id - b.id);
  }

  /** Totals and averages (in business minutes). */
  function summary(state, now) {
    const rows = list(state, now);
    const open = rows.filter((r) => r.open);
    const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
    const answered = rows.filter((r) => r.firstTime !== null);
    const done = rows.filter((r) => r.resolveTime !== null);
    const pct = (n, d) => (d ? Math.round((n / d) * 100) : null);
    return {
      total: rows.length,
      open: open.length,
      pending: open.filter((r) => r.status === 'Pending customer').length,
      overdue: open.filter((r) => r.first === 'overdue' || r.resolve === 'overdue').length,
      dueSoon: open.filter((r) => (r.first === 'due' && r.firstLeft <= 120) || (r.resolve === 'due' && r.resolveLeft <= 120)).length,
      noOwner: open.filter((r) => !r.assignee).length,
      avgFirst: avg(answered.map((r) => r.firstTime)),
      avgResolve: avg(done.map((r) => r.resolveTime)),
      firstWithin: pct(answered.filter((r) => r.first === 'met').length, answered.length),
      resolveWithin: pct(done.filter((r) => r.resolve === 'met').length, done.length),
    };
  }

  const cell = (v) => {
    const t = String(v === null || v === undefined ? '' : v);
    const safe = /^[=+@]/.test(t) || /^-[^0-9]/.test(t) ? "'" + t : t;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };

  function toCsv(rows) {
    const head = [
      'Ref',
      'Subject',
      'Customer',
      'Channel',
      'Priority',
      'Assignee',
      'Status',
      'Created',
      'First reply',
      'First reply due',
      'First reply SLA',
      'Resolved',
      'Resolution due',
      'Resolution SLA',
      'Business minutes to reply',
      'Business minutes to resolve',
    ];
    const out = rows.map((r) => [
      r.ref,
      r.subject,
      r.customer,
      r.channel,
      r.priority,
      r.assignee,
      r.status,
      r.created.replace('T', ' '),
      r.firstResponseAt.replace('T', ' '),
      r.firstDue.replace('T', ' '),
      r.first,
      r.resolvedAt.replace('T', ' '),
      r.resolveDue.replace('T', ' '),
      r.resolve,
      r.firstTime === null ? '' : r.firstTime,
      r.resolveTime === null ? '' : r.resolveTime,
    ]);
    return (
      '﻿' +
      [head]
        .concat(out)
        .map((r) => r.map(cell).join(','))
        .join('\r\n')
    );
  }

  function serialize(state) {
    return JSON.stringify({ app: 'ticket-log', version: 1, state: state }, null, 2);
  }

  function parse(text) {
    let d;
    try {
      d = JSON.parse(text);
    } catch (e) {
      throw new Error('That file is not a saved ticket log.');
    }
    const st = d && d.app === 'ticket-log' ? d.state : null;
    if (!st || !Array.isArray(st.tickets)) throw new Error('That file is not a saved ticket log.');
    let cfg;
    try {
      checkConfig(st.config);
      cfg = st.config;
    } catch (e) {
      cfg = DEFAULT_CONFIG;
    }
    let s = create(cfg);
    st.tickets.slice(0, MAX).forEach((t) => {
      try {
        s = add(s, t).state;
        const x = s.tickets[s.tickets.length - 1];
        const ok = (v) => {
          try {
            toMs(v);
            return v;
          } catch (e) {
            return '';
          }
        };
        if (STATUSES.indexOf(t.status) !== -1) x.status = t.status;
        x.firstResponseAt = ok(t.firstResponseAt);
        x.resolvedAt = x.status === 'Resolved' || x.status === 'Closed' ? ok(t.resolvedAt) || x.created : '';
        x.firstDue = ok(t.firstDue) || x.firstDue;
        x.resolveDue = ok(t.resolveDue) || x.resolveDue;
        x.pendingSince = x.status === 'Pending customer' ? ok(t.pendingSince) : '';
      } catch (e) {
        /* skip a damaged ticket */
      }
    });
    return s;
  }

  function sample(now) {
    let s = create();
    const day = now.slice(0, 10);
    const at = (back, hhmm) => OT.addDays(day, -back) + 'T' + hhmm;
    const mk = (subject, customer, channel, priority, who, created) => {
      s = add(s, { subject: subject, customer: customer, channel: channel, priority: priority, assignee: who, created: created }).state;
      return s.tickets[s.tickets.length - 1].id;
    };
    const a = mk('Payment failed but money deducted', 'Rohit Mehta', 'Phone', 'Urgent', 'Asha', at(0, '10:30'));
    const b = mk('App crashes on login', 'Neha Iyer', 'Email', 'High', 'Ravi', at(1, '11:00'));
    const c = mk('Invoice copy needed', 'Karan Shah', 'Chat', 'Low', 'Meera', at(3, '15:00'));
    const d = mk('Change delivery address', 'Sana Khan', 'WhatsApp', 'Normal', '', at(1, '16:30'));
    mk('Feature question about reports', 'Vikram Rao', 'Email', 'Normal', 'Asha', at(0, '09:45'));
    s = respond(s, a, at(0, '10:50'));
    s = respond(s, b, at(1, '12:30'));
    s = setStatus(s, b, 'Pending customer', at(1, '12:40'));
    s = respond(s, c, at(3, '16:00'));
    s = setStatus(s, c, 'Resolved', at(2, '12:00'));
    s = respond(s, d, at(0, '12:00'));
    return s;
  }

  return {
    PRIORITIES: PRIORITIES,
    STATUSES: STATUSES,
    CHANNELS: CHANNELS,
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    toMs: toMs,
    nextOpen: (dt, cfg) => fromMs(nextOpen(toMs(dt), checkConfig(cfg))),
    addBusinessMinutes: addBusinessMinutes,
    businessMinutes: businessMinutes,
    remaining: remaining,
    duration: duration,
    create: create,
    setConfig: setConfig,
    add: add,
    respond: respond,
    setStatus: setStatus,
    assign: assign,
    setPriority: setPriority,
    list: list,
    summary: summary,
    toCsv: toCsv,
    serialize: serialize,
    parse: parse,
    sample: sample,
  };
});
