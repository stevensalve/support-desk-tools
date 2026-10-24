'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('../js/core.js');

const TODAY = '2026-10-23';
const base = { customer: 'Asha', what: 'Call back', due: '2026-10-25', channel: 'Phone' };

test('add validates and does not mutate', () => {
  const s0 = f.create();
  const s1 = f.add(s0, Object.assign({}, base, { time: '15:30', owner: ' Ravi ' }));
  assert.equal(s0.items.length, 0);
  assert.deepEqual(s1.items[0], {
    id: 1,
    customer: 'Asha',
    ticket: '',
    channel: 'Phone',
    what: 'Call back',
    due: '2026-10-25',
    time: '15:30',
    owner: 'Ravi',
    note: '',
    status: 'Open',
    doneOn: '',
  });
  assert.throws(() => f.add(s0, Object.assign({}, base, { customer: ' ' })), /customer name/);
  assert.throws(() => f.add(s0, Object.assign({}, base, { what: '' })), /what you promised/);
  assert.throws(() => f.add(s0, Object.assign({}, base, { due: '2026-02-30' })), /not a real date/);
  assert.throws(() => f.add(s0, Object.assign({}, base, { time: '25:00' })), /look like 15:30/);
  assert.equal(f.add(s0, Object.assign({}, base, { channel: 'Pigeon' })).items[0].channel, 'Phone');
});

test('update, setStatus, remove', () => {
  let s = f.add(f.create(), base);
  s = f.update(s, 1, { what: 'Email instead', channel: 'Email' });
  assert.equal(s.items[0].what, 'Email instead');
  assert.equal(s.items[0].status, 'Open');
  assert.throws(() => f.update(s, 1, { due: 'x' }), /not a real date/);
  assert.throws(() => f.update(s, 9, {}), /not found/);
  s = f.setStatus(s, 1, 'Done', TODAY);
  assert.deepEqual([s.items[0].status, s.items[0].doneOn], ['Done', TODAY]);
  s = f.setStatus(s, 1, 'Open', TODAY);
  assert.equal(s.items[0].doneOn, '');
  assert.throws(() => f.setStatus(s, 1, 'Lost', TODAY), /Unknown status/);
  assert.equal(f.remove(s, 1).items.length, 0);
});

test('stateOf: timed items go overdue after their time', () => {
  const it = (due, time, status) => ({ due: due, time: time, status: status || 'Open' });
  assert.equal(f.stateOf(it('2026-10-22', ''), TODAY, '09:00'), 'overdue');
  assert.equal(f.stateOf(it(TODAY, ''), TODAY, '23:00'), 'today');
  assert.equal(f.stateOf(it(TODAY, '10:00'), TODAY, '09:59'), 'today');
  assert.equal(f.stateOf(it(TODAY, '10:00'), TODAY, '10:00'), 'today');
  assert.equal(f.stateOf(it(TODAY, '10:00'), TODAY, '10:01'), 'overdue');
  assert.equal(f.stateOf(it('2026-10-24', ''), TODAY, '09:00'), 'upcoming');
  assert.equal(f.stateOf(it('2026-10-01', '', 'Done'), TODAY, '09:00'), 'done');
  assert.equal(f.stateOf(it('2026-10-01', '', 'Cancelled'), TODAY, '09:00'), 'cancelled');
});

test('list: order, filters, search, owner', () => {
  const s = f.sample(TODAY);
  const all = f.list(s, TODAY, '12:00');
  assert.deepEqual(
    all.map((i) => i.customer),
    ['Rohit Mehta', 'Neha Iyer', 'Sana Khan', 'Vikram Rao', 'Meera Joshi', 'Arjun Das'],
  );
  assert.deepEqual(
    all.map((i) => i.state),
    ['overdue', 'overdue', 'today', 'upcoming', 'upcoming', 'done'],
  );
  assert.equal(f.list(s, TODAY, '08:00')[1].state, 'today');
  assert.equal(f.list(s, TODAY, '12:00', { filter: 'active' }).length, 5);
  assert.equal(f.list(s, TODAY, '12:00', { filter: 'done' }).length, 1);
  assert.equal(f.list(s, TODAY, '12:00', { filter: 'overdue' }).length, 2);
  assert.deepEqual(
    f.list(s, TODAY, '12:00', { search: 't-0441' }).map((i) => i.customer),
    ['Vikram Rao'],
  );
  assert.equal(f.list(s, TODAY, '12:00', { owner: 'ravi' }).length, 3);
});

test('summary and kept-on-time percentage', () => {
  const s = f.summary(f.sample(TODAY), TODAY, '12:00');
  assert.deepEqual([s.overdue, s.today, s.upcoming, s.done, s.total], [2, 1, 2, 1, 6]);
  assert.equal(s.kept, 33); // 1 on time out of 1 done + 2 overdue
  assert.equal(f.summary(f.create(), TODAY, '12:00').kept, null);
  let late = f.add(f.create(), Object.assign({}, base, { due: '2026-10-20' }));
  late = f.setStatus(late, 1, 'Done', '2026-10-22');
  assert.equal(f.summary(late, TODAY, '12:00').kept, 0);
});

test('dayPlan', () => {
  const t = f.dayPlan(f.sample(TODAY), TODAY, '12:00');
  assert.match(
    t,
    /^FOLLOW-UPS DUE - 23\/10\/2026\n\n1\. Rohit Mehta \[T-0412\] - Phone \(1 day late\)\n {3}Confirm refund reached the card \(Asha\)/,
  );
  assert.match(t, /2\. Neha Iyer \[T-0420\] - Email at 10:00 \(time passed\)/);
  assert.match(t, /3\. Sana Khan \[T-0433\] - Phone at 17:30\n/);
  assert.doesNotMatch(t, /Vikram/);
  assert.match(f.dayPlan(f.create(), TODAY, '12:00'), /Nothing due\. Nothing overdue\./);
});

test('toCsv: BOM, dates, formula guard', () => {
  let s = f.add(f.create(), Object.assign({}, base, { customer: '=HYPERLINK("x")', what: 'say "hi", ok' }));
  const c = f.toCsv(s, TODAY, '12:00');
  assert.ok(c.startsWith('\ufeffCustomer,Ticket'));
  assert.match(c, /"'=HYPERLINK\(""x""\)",,Phone,"say ""hi"", ok",25\/10\/2026,,,Open,,upcoming,/);
});

test('toIcs: timed, all-day, only open, folding', () => {
  let s = f.add(f.create(), Object.assign({}, base, { time: '23:50', customer: 'Zoë' }));
  s = f.add(s, Object.assign({}, base, { what: 'x'.repeat(200), due: '2026-10-31' }));
  s = f.add(s, base);
  s = f.setStatus(s, 3, 'Done', TODAY);
  const ics = f.toIcs(s, '20261023T000000Z');
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(ics, /DTSTART:20261025T235000\r\nDTEND:20261026T000500\r\n/);
  assert.match(ics, /TRIGGER:-PT15M/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261031\r\nDTEND;VALUE=DATE:20261101/);
  assert.match(ics, /TRIGGER:PT9H/);
  assert.match(ics, /SUMMARY:Phone Zoë/);
  ics.split('\r\n').forEach((l) => assert.ok(new TextEncoder().encode(l).length <= 75));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.throws(() => f.toIcs(s, 'now'), /timestamp/);
});

test('save and open: round trip, repairs, skips bad items', () => {
  const s = f.sample(TODAY);
  assert.deepEqual(f.parse(f.serialize(s)), s);
  const bad = JSON.parse(f.serialize(s));
  bad.state.items.push(
    { id: 1, customer: 'Dup', what: 'x', due: '2026-10-30', status: 'Weird' },
    { customer: '', what: 'x', due: TODAY },
    null,
  );
  const r = f.parse(JSON.stringify(bad));
  assert.equal(r.items.length, 7);
  const dup = r.items.find((i) => i.customer === 'Dup');
  assert.equal(dup.status, 'Open');
  assert.equal(new Set(r.items.map((i) => i.id)).size, 7);
  assert.equal(r.nextId, 8);
  assert.throws(() => f.parse('nope'), /not a saved follow-up list/);
  assert.throws(() => f.parse('{"app":"x"}'), /not a saved follow-up list/);
});
