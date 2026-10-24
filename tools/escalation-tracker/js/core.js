/**
 * Escalation Tracker - core logic (pure; "today" is always passed in).
 *
 * Escalation: { id, ref, title, customer, reason, level (1-3), owner, raised (ISO), nextUpdate (ISO), status,
 *               resolvedOn, history: [{ date, text }] }
 * Levels: 1 Team lead, 2 Manager, 3 Leadership. Every update (note) moves the next-update date forward by the
 * cadence for that level, so nothing goes quiet.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.EscalationCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const copy = (o) => JSON.parse(JSON.stringify(o));
  const LEVELS = { 1: 'Team lead', 2: 'Manager', 3: 'Leadership' };
  const STATUSES = ['Open', 'Awaiting fix', 'Customer informed', 'Resolved'];
  const REASONS = [
    'Delay',
    'Wrong or missing refund',
    'Product defect',
    'Repeat contact',
    'Service failure',
    'Legal or regulatory',
    'Other',
  ];
  const DEFAULT_CADENCE = { 1: 2, 2: 1, 3: 1 };
  const MAX = 2000;
  const DAY = 86400000;
  const diff = (a, b) => Math.round((OT.parseIsoDate(a) - OT.parseIsoDate(b)) / DAY);

  const create = () => ({ nextId: 1, cadence: Object.assign({}, DEFAULT_CADENCE), items: [] });

  function setCadence(state, cadence) {
    [1, 2, 3].forEach((l) => {
      if (!Number.isInteger(cadence[l]) || cadence[l] < 1 || cadence[l] > 30)
        throw new Error('The update interval for level ' + l + ' must be 1 to 30 days.');
    });
    const s = copy(state);
    s.cadence = { 1: cadence[1], 2: cadence[2], 3: cadence[3] };
    return s;
  }

  /** e: { title, customer, reason, level, owner, raised, note }. Returns { state, item }. */
  function add(state, e) {
    const title = norm(e.title);
    if (!title) throw new Error('Describe the escalation in a few words.');
    const level = Number(e.level);
    if (!LEVELS[level]) throw new Error('Choose level 1, 2 or 3.');
    OT.parseIsoDate(e.raised);
    if (!norm(e.owner)) throw new Error('Name the person who owns this escalation.');
    if (state.items.length >= MAX) throw new Error('The tracker is full (' + MAX + ' escalations).');
    const s = copy(state);
    const id = s.nextId++;
    const item = {
      id: id,
      ref: 'E-' + String(id).padStart(3, '0'),
      title: title.slice(0, 120),
      customer: norm(e.customer).slice(0, 60),
      reason: REASONS.indexOf(e.reason) !== -1 ? e.reason : 'Other',
      level: level,
      owner: norm(e.owner).slice(0, 60),
      raised: e.raised,
      nextUpdate: OT.addDays(e.raised, s.cadence[level]),
      status: 'Open',
      resolvedOn: '',
      history: [],
    };
    if (norm(e.note)) item.history.push({ date: e.raised, text: norm(e.note).slice(0, 300) });
    s.items.push(item);
    return { state: s, item: item };
  }

  const find = (s, id) => {
    const it = s.items.find((x) => x.id === id);
    if (!it) throw new Error('No such escalation.');
    return it;
  };
  const open = (it) => it.status !== 'Resolved';

  /** Log an update. The next-update date moves to date + the cadence for the current level. */
  function addUpdate(state, id, date, text) {
    OT.parseIsoDate(date);
    if (!norm(text)) throw new Error('Write the update.');
    const s = copy(state);
    const it = find(s, id);
    if (!open(it)) throw new Error(it.ref + ' is resolved. Reopen it to add updates.');
    if (date < it.raised) throw new Error('The update cannot be dated before the escalation was raised.');
    it.history.push({ date: date, text: norm(text).slice(0, 300) });
    it.nextUpdate = OT.addDays(date, s.cadence[it.level]);
    return s;
  }

  /** Move to a higher level (never lower), with a note. */
  function raiseLevel(state, id, level, date, text) {
    const s = copy(state);
    const it = find(s, id);
    if (!LEVELS[level]) throw new Error('Choose level 1, 2 or 3.');
    if (level <= it.level) throw new Error('The new level must be higher than the current level (' + it.level + ').');
    if (!norm(text)) throw new Error('Say why it is being escalated further.');
    OT.parseIsoDate(date);
    it.level = level;
    it.history.push({ date: date, text: 'Escalated to level ' + level + ' (' + LEVELS[level] + '): ' + norm(text).slice(0, 250) });
    it.nextUpdate = OT.addDays(date, s.cadence[level]);
    return s;
  }

  function setStatus(state, id, status, date) {
    if (STATUSES.indexOf(status) === -1) throw new Error('Choose a status.');
    const s = copy(state);
    const it = find(s, id);
    if (status === 'Resolved') {
      OT.parseIsoDate(date);
      if (date < it.raised) throw new Error('It cannot be resolved before it was raised.');
      if (!it.resolvedOn) it.resolvedOn = date;
      it.nextUpdate = '';
    } else {
      it.resolvedOn = '';
      if (!it.nextUpdate) {
        OT.parseIsoDate(date);
        it.nextUpdate = OT.addDays(date, s.cadence[it.level]);
      }
    }
    it.status = status;
    return s;
  }

  function assign(state, id, owner) {
    if (!norm(owner)) throw new Error('Name the person who owns this escalation.');
    const s = copy(state);
    find(s, id).owner = norm(owner).slice(0, 60);
    return s;
  }

  /** Rows with age, daysToUpdate (negative = overdue) and overdue flag. Filters: status, level, owner, openOnly, overdueOnly, text. Overdue first, then highest level. */
  function list(state, today, filter) {
    OT.parseIsoDate(today);
    const f = Object.assign({ status: '', level: '', owner: '', openOnly: false, overdueOnly: false, text: '' }, filter);
    const q = norm(f.text).toLowerCase();
    return state.items
      .map((i) => {
        const o = open(i);
        const toUpdate = o && i.nextUpdate ? diff(i.nextUpdate, today) : null;
        return Object.assign({}, i, {
          open: o,
          ageDays: diff(o ? today : i.resolvedOn, i.raised),
          daysToUpdate: toUpdate,
          overdue: o && toUpdate !== null && toUpdate < 0,
          levelName: LEVELS[i.level],
          lastUpdate: i.history.length ? i.history[i.history.length - 1] : null,
        });
      })
      .filter(
        (r) =>
          (!f.status || r.status === f.status) &&
          (!f.level || r.level === Number(f.level)) &&
          (!f.owner || r.owner === f.owner) &&
          (!f.openOnly || r.open) &&
          (!f.overdueOnly || r.overdue) &&
          (!q || (r.title + ' ' + r.ref + ' ' + r.customer).toLowerCase().indexOf(q) !== -1),
      )
      .sort(
        (a, b) =>
          Number(b.open) - Number(a.open) ||
          Number(b.overdue) - Number(a.overdue) ||
          b.level - a.level ||
          (a.daysToUpdate === null ? 1e6 : a.daysToUpdate) - (b.daysToUpdate === null ? 1e6 : b.daysToUpdate) ||
          a.id - b.id,
      );
  }

  function summary(state, today) {
    const rows = list(state, today);
    const op = rows.filter((r) => r.open);
    const done = rows.filter((r) => !r.open);
    const owners = {};
    op.forEach((r) => (owners[r.owner] = (owners[r.owner] || 0) + 1));
    return {
      total: rows.length,
      open: op.length,
      overdue: op.filter((r) => r.overdue).length,
      dueToday: op.filter((r) => r.daysToUpdate === 0).length,
      byLevel: [1, 2, 3].map((l) => ({ level: l, name: LEVELS[l], count: op.filter((r) => r.level === l).length })),
      oldest: op.length ? op.reduce((a, r) => (r.ageDays > a.ageDays ? r : a)) : null,
      avgResolveDays: done.length ? Math.round((done.reduce((a, r) => a + r.ageDays, 0) / done.length) * 10) / 10 : null,
      byOwner: Object.keys(owners)
        .map((k) => ({ owner: k, count: owners[k] }))
        .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner)),
    };
  }

  /** Message to one owner listing their updates that are due or overdue. */
  function reminder(state, today, owner) {
    const rows = list(state, today, { owner: owner, openOnly: true }).filter((r) => r.daysToUpdate !== null && r.daysToUpdate <= 0);
    if (!rows.length) return 'Hi ' + owner.split(' ')[0] + ', none of your escalations needs an update today.';
    const L = ['Hi ' + owner.split(' ')[0] + ', these escalations need a customer update:', ''];
    rows.forEach((r) =>
      L.push(
        '- ' +
          r.ref +
          ' ' +
          r.title +
          (r.customer ? ' (' + r.customer + ')' : '') +
          ': level ' +
          r.level +
          ', ' +
          (r.daysToUpdate < 0 ? -r.daysToUpdate + ' day(s) overdue' : 'due today') +
          ', open ' +
          r.ageDays +
          ' days',
      ),
    );
    return L.join('\n');
  }

  const cell = (v) => {
    const t = String(v === null || v === undefined ? '' : v);
    const safe = /^[=+@]/.test(t) || /^-[^0-9]/.test(t) ? "'" + t : t;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };

  function toCsv(rows) {
    const head = [
      'Ref',
      'Title',
      'Customer',
      'Reason',
      'Level',
      'Owner',
      'Status',
      'Raised',
      'Age (days)',
      'Next update due',
      'Update overdue',
      'Resolved on',
      'Last update',
    ];
    const out = rows.map((r) => [
      r.ref,
      r.title,
      r.customer,
      r.reason,
      r.level,
      r.owner,
      r.status,
      r.raised,
      r.ageDays,
      r.nextUpdate,
      r.overdue ? 'Yes' : 'No',
      r.resolvedOn,
      r.lastUpdate ? r.lastUpdate.date + ': ' + r.lastUpdate.text : '',
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
    return JSON.stringify({ app: 'escalation-tracker', version: 1, state: state }, null, 2);
  }

  function parse(text) {
    let d;
    try {
      d = JSON.parse(text);
    } catch (e) {
      throw new Error('That file is not a saved escalation tracker.');
    }
    const st = d && d.app === 'escalation-tracker' ? d.state : null;
    if (!st || !Array.isArray(st.items)) throw new Error('That file is not a saved escalation tracker.');
    let s = create();
    try {
      s = setCadence(s, { 1: st.cadence[1], 2: st.cadence[2], 3: st.cadence[3] });
    } catch (e) {
      /* keep the default cadence */
    }
    st.items.slice(0, MAX).forEach((i) => {
      try {
        s = add(s, {
          title: i.title,
          customer: i.customer,
          reason: i.reason,
          level: i.level,
          owner: i.owner,
          raised: OT.toIsoDate(i.raised),
        }).state;
        const it = s.items[s.items.length - 1];
        if (STATUSES.indexOf(i.status) !== -1) it.status = i.status;
        it.resolvedOn = it.status === 'Resolved' ? OT.toIsoDate(i.resolvedOn) || it.raised : '';
        it.nextUpdate = it.status === 'Resolved' ? '' : OT.toIsoDate(i.nextUpdate) || it.nextUpdate;
        (Array.isArray(i.history) ? i.history : []).slice(0, 200).forEach((h) => {
          const hd = OT.toIsoDate(h && h.date);
          if (hd && norm(h.text)) it.history.push({ date: hd, text: norm(h.text).slice(0, 300) });
        });
      } catch (e) {
        /* skip a damaged escalation */
      }
    });
    return s;
  }

  function sample(today) {
    let s = create();
    const mk = (title, customer, reason, level, owner, ago, note) => {
      s = add(s, {
        title: title,
        customer: customer,
        reason: reason,
        level: level,
        owner: owner,
        raised: OT.addDays(today, -ago),
        note: note,
      }).state;
      return s.items[s.items.length - 1].id;
    };
    const a = mk(
      'Refund promised 12 days ago not received',
      'Rohit Mehta',
      'Wrong or missing refund',
      2,
      'Asha Rao',
      6,
      'Customer called twice; finance confirmed the refund was stuck.',
    );
    const b = mk(
      'App crash on payment screen for premium customer',
      'Neha Iyer',
      'Product defect',
      3,
      'Ravi Kumar',
      2,
      'Customer threatening to cancel annual plan.',
    );
    mk('Third complaint about the same delivery delay', 'Karan Shah', 'Repeat contact', 1, 'Meera Shah', 1, '');
    const d = mk('Wrong invoice amount sent', 'Sana Khan', 'Service failure', 1, 'Asha Rao', 8, 'Corrected invoice issued.');
    s = addUpdate(s, a, OT.addDays(today, -4), 'Finance re-initiated the refund.');
    s = addUpdate(s, b, OT.addDays(today, -1), 'Engineering reproduced the crash, fix in progress.');
    s = setStatus(s, b, 'Awaiting fix', today);
    s = setStatus(s, d, 'Resolved', OT.addDays(today, -5));
    return s;
  }

  return {
    LEVELS: LEVELS,
    STATUSES: STATUSES,
    REASONS: REASONS,
    create: create,
    setCadence: setCadence,
    add: add,
    addUpdate: addUpdate,
    raiseLevel: raiseLevel,
    setStatus: setStatus,
    assign: assign,
    list: list,
    summary: summary,
    reminder: reminder,
    toCsv: toCsv,
    serialize: serialize,
    parse: parse,
    sample: sample,
  };
});
