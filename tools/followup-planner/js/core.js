/**
 * Customer Follow-up Planner - core logic (pure).
 *
 * Item: { id, customer, ticket, channel, what, due ('YYYY-MM-DD'), time ('' | 'HH:MM'),
 *         owner, status ('Open'|'Done'|'Cancelled'), doneOn ('' | 'YYYY-MM-DD'), note }
 * "Today" and "now" are always passed in.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.FollowCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const CHANNELS = ['Phone', 'Email', 'WhatsApp', 'Chat', 'SMS'];
  const STATUSES = ['Open', 'Done', 'Cancelled'];
  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const isTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

  const create = () => ({ nextId: 1, items: [] });
  const copy = (s) => JSON.parse(JSON.stringify(s));

  function clean(i) {
    const c = norm(i.customer);
    const w = norm(i.what);
    if (!c) throw new Error('Add the customer name.');
    if (!w) throw new Error('Say what you promised.');
    let due;
    try {
      due = OT.toIsoDate(i.due);
      if (!due) throw new Error();
      OT.parseIsoDate(due);
    } catch (e) {
      throw new Error('The due date is not a real date.');
    }
    const time = norm(i.time);
    if (time && !isTime(time)) throw new Error('The time must look like 15:30.');
    return {
      customer: c.slice(0, 80),
      ticket: norm(i.ticket).slice(0, 30),
      channel: CHANNELS.indexOf(i.channel) !== -1 ? i.channel : 'Phone',
      what: w.slice(0, 300),
      due: due,
      time: time,
      owner: norm(i.owner).slice(0, 40),
      note: norm(i.note).slice(0, 300),
    };
  }

  function add(state, input) {
    const s = copy(state);
    const it = Object.assign({ id: s.nextId++, status: 'Open', doneOn: '' }, clean(input));
    s.items.push(it);
    return s;
  }

  function update(state, id, patch) {
    const s = copy(state);
    const it = s.items.find((x) => x.id === id);
    if (!it) throw new Error('That follow-up was not found.');
    Object.assign(it, clean(Object.assign({}, it, patch)));
    return s;
  }

  function setStatus(state, id, status, today) {
    if (STATUSES.indexOf(status) === -1) throw new Error('Unknown status.');
    const s = copy(state);
    const it = s.items.find((x) => x.id === id);
    if (!it) throw new Error('That follow-up was not found.');
    it.status = status;
    it.doneOn = status === 'Done' ? OT.toIsoDate(today) || '' : '';
    return s;
  }

  function remove(state, id) {
    const s = copy(state);
    s.items = s.items.filter((x) => x.id !== id);
    return s;
  }

  /** 'done' | 'cancelled' | 'overdue' | 'today' | 'upcoming'. A timed item is overdue once its time has passed today. */
  function stateOf(it, today, nowTime) {
    if (it.status === 'Done') return 'done';
    if (it.status === 'Cancelled') return 'cancelled';
    if (it.due < today) return 'overdue';
    if (it.due === today) return it.time && nowTime && it.time < nowTime ? 'overdue' : 'today';
    return 'upcoming';
  }

  const daysLate = (it, today) => Math.round((OT.parseIsoDate(today) - OT.parseIsoDate(it.due)) / 86400000);

  /** filter: 'all' | 'active' | 'overdue' | 'today' | 'upcoming' | 'done'. Sorted: overdue, today, upcoming by date/time; closed last. */
  function list(state, today, nowTime, opts) {
    const o = opts || {};
    const rank = { overdue: 0, today: 1, upcoming: 2, done: 3, cancelled: 4 };
    const q = norm(o.search).toLowerCase();
    return state.items
      .map((i) => Object.assign({ state: stateOf(i, today, nowTime) }, i))
      .filter((i) => {
        if (o.owner && i.owner.toLowerCase() !== String(o.owner).toLowerCase()) return false;
        if (q && (i.customer + ' ' + i.ticket + ' ' + i.what).toLowerCase().indexOf(q) === -1) return false;
        const f = o.filter || 'all';
        if (f === 'active') return i.state === 'overdue' || i.state === 'today' || i.state === 'upcoming';
        if (f === 'done') return i.state === 'done' || i.state === 'cancelled';
        return f === 'all' || i.state === f;
      })
      .sort(
        (a, b) => rank[a.state] - rank[b.state] || (a.due + (a.time || '99:99')).localeCompare(b.due + (b.time || '99:99')) || a.id - b.id,
      );
  }

  function summary(state, today, nowTime) {
    const s = { overdue: 0, today: 0, upcoming: 0, done: 0, cancelled: 0, total: state.items.length, kept: null };
    state.items.forEach((i) => s[stateOf(i, today, nowTime)]++);
    const closed = s.done;
    // Of the promises that are finished or late, how many were kept on time?
    const onTime = state.items.filter((i) => i.status === 'Done' && i.doneOn && i.doneOn <= i.due).length;
    const judged = closed + s.overdue;
    s.kept = judged ? Math.round((onTime / judged) * 100) : null;
    return s;
  }

  /** A plain-text plan for today: overdue first, then today, in time order. */
  function dayPlan(state, today, nowTime) {
    const rows = list(state, today, nowTime).filter((i) => i.state === 'overdue' || i.state === 'today');
    const L = ['FOLLOW-UPS DUE - ' + OT.formatDate(today, 'dmy')];
    if (!rows.length) return L.concat(['', 'Nothing due. Nothing overdue.']).join('\n');
    rows.forEach((i, n) => {
      const late =
        i.state === 'overdue' && i.due < today
          ? ' (' + daysLate(i, today) + ' day' + (daysLate(i, today) === 1 ? '' : 's') + ' late)'
          : i.state === 'overdue'
            ? ' (time passed)'
            : '';
      L.push(
        '',
        n + 1 + '. ' + i.customer + (i.ticket ? ' [' + i.ticket + ']' : '') + ' - ' + i.channel + (i.time ? ' at ' + i.time : '') + late,
        '   ' + i.what + (i.owner ? ' (' + i.owner + ')' : ''),
      );
    });
    return L.join('\n');
  }

  const formula = /^[=+\-@\t\r]/;
  const cell = (v) => {
    let s = String(v === null || v === undefined ? '' : v);
    if (formula.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  function toCsv(state, today, nowTime) {
    const head = ['Customer', 'Ticket', 'Channel', 'Promise', 'Due date', 'Time', 'Owner', 'Status', 'Done on', 'State', 'Note'];
    const rows = list(state, today, nowTime).map((i) => [
      i.customer,
      i.ticket,
      i.channel,
      i.what,
      OT.formatDate(i.due, 'dmy'),
      i.time,
      i.owner,
      i.status,
      i.doneOn ? OT.formatDate(i.doneOn, 'dmy') : '',
      i.state,
      i.note,
    ]);
    return (
      '\ufeff' +
      [head]
        .concat(rows)
        .map((r) => r.map(cell).join(','))
        .join('\r\n')
    );
  }

  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  function fold(line) {
    const out = [];
    let cur = '';
    let bytes = 0;
    for (const ch of line) {
      const b = new TextEncoder().encode(ch).length;
      if (bytes + b > 73) {
        out.push(cur);
        cur = ' ';
        bytes = 1;
      }
      cur += ch;
      bytes += b;
    }
    out.push(cur);
    return out.join('\r\n');
  }

  /** Calendar events for open follow-ups. Timed ones last 15 minutes (floating local time) with a reminder 15 minutes before; dated ones are all-day. */
  function toIcs(state, stamp) {
    if (!/^\d{8}T\d{6}Z$/.test(stamp)) throw new Error('The timestamp must look like 20261023T000000Z.');
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Support Desk Tools//Follow-up Planner//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];
    state.items
      .filter((i) => i.status === 'Open')
      .forEach((i) => {
        const d = i.due.replace(/-/g, '');
        lines.push('BEGIN:VEVENT', 'UID:followup-' + i.id + '-' + d + '@support-desk-tools', 'DTSTAMP:' + stamp);
        if (i.time) {
          const [h, m] = i.time.split(':').map(Number);
          const end = h * 60 + m + 15;
          const endDate = end >= 1440 ? OT.addDays(i.due, 1).replace(/-/g, '') : d;
          const e = end % 1440;
          lines.push(
            'DTSTART:' + d + 'T' + i.time.replace(':', '') + '00',
            'DTEND:' + endDate + 'T' + String(Math.floor(e / 60)).padStart(2, '0') + String(e % 60).padStart(2, '0') + '00',
          );
        } else {
          lines.push('DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + OT.addDays(i.due, 1).replace(/-/g, ''));
        }
        const title = i.channel + ' ' + i.customer + (i.ticket ? ' [' + i.ticket + ']' : '');
        lines.push(
          'SUMMARY:' + esc(title),
          'DESCRIPTION:' + esc(i.what + (i.owner ? ' Owner: ' + i.owner + '.' : '')),
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          'DESCRIPTION:' + esc(title),
          i.time ? 'TRIGGER:-PT15M' : 'TRIGGER:PT9H',
          'END:VALARM',
          'END:VEVENT',
        );
      });
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  function serialize(state) {
    return JSON.stringify({ app: 'followup-planner', version: 1, state: state }, null, 2);
  }

  function parse(text) {
    let j;
    try {
      j = JSON.parse(text);
    } catch (e) {
      throw new Error('That file is not a saved follow-up list.');
    }
    const st = j && j.app === 'followup-planner' ? j.state : null;
    if (!st || !Array.isArray(st.items)) throw new Error('That file is not a saved follow-up list.');
    const out = create();
    st.items.forEach((raw) => {
      let c;
      try {
        c = clean(raw || {});
      } catch (e) {
        return;
      }
      const status = STATUSES.indexOf(raw.status) !== -1 ? raw.status : 'Open';
      const id = Number.isInteger(raw.id) && raw.id > 0 && !out.items.some((x) => x.id === raw.id) ? raw.id : out.nextId;
      out.items.push(Object.assign({ id: id, status: status, doneOn: status === 'Done' ? OT.toIsoDate(raw.doneOn) || '' : '' }, c));
      out.nextId = Math.max(out.nextId, id + 1);
    });
    return out;
  }

  function sample(today) {
    let s = create();
    const a = (customer, ticket, channel, what, due, time, owner) =>
      (s = add(s, { customer: customer, ticket: ticket, channel: channel, what: what, due: due, time: time, owner: owner }));
    a('Rohit Mehta', 'T-0412', 'Phone', 'Confirm refund reached the card', OT.addDays(today, -1), '', 'Asha');
    a('Neha Iyer', 'T-0420', 'Email', 'Send update on the payment crash fix', today, '10:00', 'Asha');
    a('Sana Khan', 'T-0433', 'Phone', 'Call back with the corrected invoice', today, '17:30', 'Ravi');
    a('Vikram Rao', 'T-0441', 'WhatsApp', 'Share the replacement tracking link', OT.addDays(today, 1), '11:00', 'Ravi');
    a('Meera Joshi', '', 'Email', 'Check if the new router fixed the drops', OT.addDays(today, 5), '', 'Asha');
    a('Arjun Das', 'T-0399', 'Phone', 'Confirm the plan change took effect', OT.addDays(today, -4), '', 'Ravi');
    s = setStatus(s, 6, 'Done', OT.addDays(today, -4));
    return s;
  }

  return {
    CHANNELS: CHANNELS,
    STATUSES: STATUSES,
    create: create,
    add: add,
    update: update,
    setStatus: setStatus,
    remove: remove,
    stateOf: stateOf,
    list: list,
    summary: summary,
    dayPlan: dayPlan,
    toCsv: toCsv,
    toIcs: toIcs,
    serialize: serialize,
    parse: parse,
    sample: sample,
  };
});
