'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const e = require('../js/core.js');

const TODAY = '2026-10-23';
const esc = (o) =>
  Object.assign(
    { title: 'Refund missing', customer: 'Rohit', reason: 'Delay', level: 1, owner: 'Asha Rao', raised: TODAY, note: 'First call' },
    o || {},
  );

test('add: reference, next update from cadence, validation, no mutation', () => {
  const s0 = e.create();
  const r = e.add(s0, esc());
  assert.equal(r.item.ref, 'E-001');
  assert.equal(r.item.nextUpdate, '2026-10-25', 'level 1 = every 2 days');
  assert.equal(r.item.history.length, 1);
  assert.equal(e.add(s0, esc({ level: 2 })).item.nextUpdate, '2026-10-24');
  assert.equal(e.add(s0, esc({ reason: 'Weird', note: '' })).item.reason, 'Other');
  assert.equal(e.add(s0, esc({ note: '' })).item.history.length, 0);
  assert.equal(s0.items.length, 0);
  assert.throws(() => e.add(s0, esc({ title: ' ' })), /Describe the escalation/);
  assert.throws(() => e.add(s0, esc({ level: 4 })), /Choose level/);
  assert.throws(() => e.add(s0, esc({ owner: ' ' })), /Name the person/);
  assert.throws(() => e.add(s0, esc({ raised: '2026-02-30' })), /does not exist/);
});

test('cadence can be changed and is validated', () => {
  const s = e.setCadence(e.create(), { 1: 3, 2: 2, 3: 1 });
  assert.equal(e.add(s, esc()).item.nextUpdate, '2026-10-26');
  assert.throws(() => e.setCadence(e.create(), { 1: 0, 2: 1, 3: 1 }), /level 1 must be 1 to 30/);
  assert.throws(() => e.setCadence(e.create(), { 1: 1, 2: 1.5, 3: 1 }), /level 2/);
});

test('updates move the next-update date; resolved ones cannot take updates', () => {
  let s = e.add(e.create(), esc({ level: 2 })).state;
  s = e.addUpdate(s, 1, '2026-10-24', 'Spoke to finance');
  assert.equal(s.items[0].nextUpdate, '2026-10-25');
  assert.equal(s.items[0].history.length, 2);
  assert.throws(() => e.addUpdate(s, 1, '2026-10-24', ' '), /Write the update/);
  assert.throws(() => e.addUpdate(s, 1, '2026-10-01', 'x'), /before the escalation was raised/);
  assert.throws(() => e.addUpdate(s, 9, TODAY, 'x'), /No such escalation/);
  const r = e.setStatus(s, 1, 'Resolved', '2026-10-25');
  assert.equal(r.items[0].nextUpdate, '');
  assert.throws(() => e.addUpdate(r, 1, '2026-10-26', 'x'), /is resolved/);
  const back = e.setStatus(r, 1, 'Open', '2026-10-27');
  assert.equal(back.items[0].resolvedOn, '');
  assert.equal(back.items[0].nextUpdate, '2026-10-28');
});

test('raiseLevel only goes up, needs a reason, and resets the clock', () => {
  let s = e.add(e.create(), esc({ level: 1 })).state;
  s = e.raiseLevel(s, 1, 3, '2026-10-24', 'Customer is a key account');
  assert.equal(s.items[0].level, 3);
  assert.equal(s.items[0].nextUpdate, '2026-10-25');
  assert.match(s.items[0].history[1].text, /^Escalated to level 3 \(Leadership\): Customer is a key account/);
  assert.throws(() => e.raiseLevel(s, 1, 2, TODAY, 'x'), /must be higher/);
  assert.throws(() => e.raiseLevel(e.add(e.create(), esc()).state, 1, 2, TODAY, ' '), /Say why/);
  assert.throws(() => e.raiseLevel(s, 1, 9, TODAY, 'x'), /Choose level/);
});

test('setStatus validation and assign', () => {
  const s = e.add(e.create(), esc({ raised: '2026-10-20' })).state;
  assert.throws(() => e.setStatus(s, 1, 'Done', TODAY), /Choose a status/);
  assert.throws(() => e.setStatus(s, 1, 'Resolved', '2026-10-19'), /before it was raised/);
  assert.throws(() => e.setStatus(s, 1, 'Resolved', ''), /Dates must look like/);
  assert.equal(e.setStatus(s, 1, 'Awaiting fix', TODAY).items[0].status, 'Awaiting fix');
  assert.equal(e.assign(s, 1, '  Ravi ').items[0].owner, 'Ravi');
  assert.throws(() => e.assign(s, 1, ' '), /Name the person/);
});

test('list: age, overdue, ordering, filters', () => {
  const s = e.sample(TODAY);
  const rows = e.list(s, TODAY);
  assert.equal(rows.length, 4);
  const by = (n) => rows.find((r) => r.ref === 'E-00' + n);
  assert.equal(by(1).ageDays, 6);
  assert.equal(by(1).nextUpdate, '2026-10-20', 'updated on the 19th, level 2 is daily... raised level 2 cadence 1 day');
  assert.equal(by(1).daysToUpdate, -3);
  assert.equal(by(1).overdue, true);
  assert.equal(by(2).daysToUpdate, 0, 'due today is not overdue');
  assert.equal(by(2).overdue, false);
  assert.equal(by(4).open, false);
  assert.equal(by(4).ageDays, 3, 'age stops at the resolved date');
  assert.deepEqual(
    rows.map((r) => r.ref),
    ['E-001', 'E-002', 'E-003', 'E-004'],
    'overdue first, then level, finished last',
  );
  assert.equal(e.list(s, TODAY, { overdueOnly: true }).length, 1);
  assert.equal(e.list(s, TODAY, { openOnly: true }).length, 3);
  assert.equal(e.list(s, TODAY, { level: '3' })[0].ref, 'E-002');
  assert.equal(e.list(s, TODAY, { owner: 'Asha Rao' }).length, 2);
  assert.equal(e.list(s, TODAY, { text: 'neha' })[0].ref, 'E-002');
  assert.equal(e.list(s, TODAY, { status: 'Awaiting fix' }).length, 1);
});

test('summary', () => {
  const m = e.summary(e.sample(TODAY), TODAY);
  assert.equal(m.open, 3);
  assert.equal(m.overdue, 1);
  assert.equal(m.dueToday, 1);
  assert.deepEqual(
    m.byLevel.map((x) => x.count),
    [1, 1, 1],
  );
  assert.equal(m.oldest.ref, 'E-001');
  assert.equal(m.avgResolveDays, 3);
  assert.equal(e.summary(e.create(), TODAY).avgResolveDays, null);
  assert.equal(e.summary(e.create(), TODAY).oldest, null);
});

test('reminder text', () => {
  const s = e.sample(TODAY);
  const t = e.reminder(s, TODAY, 'Asha Rao');
  assert.match(t, /^Hi Asha, these escalations need a customer update:/);
  assert.match(t, /- E-001 Refund promised 12 days ago not received \(Rohit Mehta\): level 2, 3 day\(s\) overdue, open 6 days/);
  assert.equal(t.indexOf('E-004'), -1, 'resolved ones are not chased');
  assert.match(e.reminder(s, TODAY, 'Meera Shah'), /none of your escalations needs an update today/);
  assert.match(e.reminder(s, TODAY, 'Ravi Kumar'), /E-002.*due today/);
});

test('CSV guards formulas', () => {
  const s = e.add(e.create(), esc({ title: '=cmd, x' })).state;
  const csv = e.toCsv(e.list(s, TODAY));
  assert.ok(csv.startsWith('\ufeffRef,Title'));
  assert.ok(csv.indexOf('"\'=cmd, x"') !== -1);
});

test('serialize/parse round trip and bad files', () => {
  const s = e.setCadence(e.sample(TODAY), { 1: 3, 2: 2, 3: 1 });
  const back = e.parse(e.serialize(s));
  assert.deepEqual(e.list(back, TODAY), e.list(s, TODAY));
  assert.deepEqual(back.cadence, { 1: 3, 2: 2, 3: 1 });
  assert.throws(() => e.parse('x'), /not a saved escalation tracker/);
  assert.throws(() => e.parse('{"app":"escalation-tracker"}'), /not a saved escalation tracker/);
  const bad = JSON.parse(e.serialize(s));
  bad.state.items[0].level = 9;
  bad.state.cadence = null;
  const fixed = e.parse(JSON.stringify(bad));
  assert.equal(fixed.items.length, 3);
  assert.deepEqual(fixed.cadence, { 1: 2, 2: 1, 3: 1 });
});
