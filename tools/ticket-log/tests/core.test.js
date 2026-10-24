'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const t = require('../js/core.js');

const CFG = t.DEFAULT_CONFIG; // 10:00-19:00, Mon-Sat
// 2026-10-23 is a Friday, 2026-10-24 Saturday, 2026-10-25 Sunday, 2026-10-26 Monday
const tk = (o) =>
  Object.assign(
    { subject: 'Payment failed', customer: 'Rohit', channel: 'Phone', priority: 'Normal', assignee: 'Asha', created: '2026-10-23T11:00' },
    o || {},
  );

test('nextOpen moves outside-hours times forward', () => {
  assert.equal(t.nextOpen('2026-10-23T09:00', CFG), '2026-10-23T10:00');
  assert.equal(t.nextOpen('2026-10-23T12:00', CFG), '2026-10-23T12:00');
  assert.equal(t.nextOpen('2026-10-23T19:00', CFG), '2026-10-24T10:00');
  assert.equal(t.nextOpen('2026-10-25T12:00', CFG), '2026-10-26T10:00', 'Sunday is closed');
  assert.equal(
    t.nextOpen('2026-10-23T20:30', Object.assign({}, CFG, { days: [1, 2, 3, 4, 5] })),
    '2026-10-26T10:00',
    'five-day week skips Saturday',
  );
  assert.equal(t.nextOpen('2026-10-26T12:00', Object.assign({}, CFG, { holidays: ['2026-10-26'] })), '2026-10-27T10:00');
});

test('addBusinessMinutes within a day, across the evening, and over a weekend', () => {
  assert.equal(t.addBusinessMinutes('2026-10-23T11:00', 120, CFG), '2026-10-23T13:00');
  assert.equal(
    t.addBusinessMinutes('2026-10-23T17:30', 120, CFG),
    '2026-10-24T10:30',
    '90 minutes left today, 30 spill into Saturday morning',
  );
  assert.equal(t.addBusinessMinutes('2026-10-23T17:30', 90, CFG), '2026-10-23T19:00', 'ends exactly at closing');
  assert.equal(t.addBusinessMinutes('2026-10-24T17:30', 120, CFG), '2026-10-26T10:30', 'Saturday evening spills past Sunday to Monday');
  assert.equal(t.addBusinessMinutes('2026-10-23T08:00', 60, CFG), '2026-10-23T11:00', 'a start before opening begins at opening');
  assert.equal(t.addBusinessMinutes('2026-10-23T11:00', 1080, CFG), '2026-10-26T11:00', '8 hours Friday, 9 hours Saturday, 1 hour Monday');
});

test('businessMinutes counts only open time', () => {
  assert.equal(t.businessMinutes('2026-10-23T11:00', '2026-10-23T13:30', CFG), 150);
  assert.equal(t.businessMinutes('2026-10-23T17:00', '2026-10-24T11:00', CFG), 180);
  assert.equal(t.businessMinutes('2026-10-24T18:00', '2026-10-26T10:30', CFG), 90, 'Saturday 18-19, Monday 10-10:30');
  assert.equal(t.businessMinutes('2026-10-23T20:00', '2026-10-24T08:00', CFG), 0);
  assert.equal(t.businessMinutes('2026-10-23T13:00', '2026-10-23T11:00', CFG), 0);
  assert.equal(t.remaining('2026-10-23T12:00', '2026-10-23T14:00', CFG), 120);
  assert.equal(t.remaining('2026-10-23T14:00', '2026-10-23T12:00', CFG), -120);
});

test('config validation and time parsing', () => {
  assert.throws(() => t.addBusinessMinutes('2026-10-23T11:00', 10, Object.assign({}, CFG, { end: '09:00' })), /end after they start/);
  assert.throws(() => t.addBusinessMinutes('2026-10-23T11:00', 10, Object.assign({}, CFG, { days: [] })), /working day/);
  assert.throws(() => t.addBusinessMinutes('2026-10-23T11:00', 10, Object.assign({}, CFG, { start: 'ten' })), /look like 10:00/);
  assert.throws(() => t.toMs('2026-10-23 11:00'), /Times must look like/);
  assert.throws(() => t.toMs('2026-10-23T25:00'), /does not exist/);
  const bad = JSON.parse(JSON.stringify(CFG));
  bad.sla.Low.resolve = 10;
  assert.throws(() => t.setConfig(t.create(), bad), /resolution not shorter/);
  assert.equal(t.duration(150), '2h 30m');
  assert.equal(t.duration(-45), '45m');
  assert.equal(t.duration(120), '2h');
  assert.equal(t.duration(0), '0m');
});

test('add: deadlines from priority, validation, no mutation', () => {
  const s0 = t.create();
  const r = t.add(s0, tk({ priority: 'Urgent' }));
  assert.equal(r.ticket.ref, 'T-0001');
  assert.equal(r.ticket.firstDue, '2026-10-23T12:00');
  assert.equal(r.ticket.resolveDue, '2026-10-23T15:00');
  assert.equal(t.add(s0, tk({ priority: 'Low' })).ticket.firstDue, '2026-10-23T19:00');
  assert.equal(s0.tickets.length, 0);
  assert.equal(t.add(s0, tk({ channel: 'Pigeon' })).ticket.channel, 'Email');
  assert.throws(() => t.add(s0, tk({ subject: ' ' })), /short subject/);
  assert.throws(() => t.add(s0, tk({ priority: 'Huge' })), /Choose a priority/);
  assert.throws(() => t.add(s0, tk({ created: 'x' })), /Times must look like/);
});

test('respond and status changes', () => {
  let s = t.add(t.create(), tk()).state;
  assert.throws(() => t.respond(s, 1, '2026-10-23T10:00'), /before the ticket was created/);
  s = t.respond(s, 1, '2026-10-23T11:30');
  s = t.respond(s, 1, '2026-10-23T12:30');
  assert.equal(s.tickets[0].firstResponseAt, '2026-10-23T11:30', 'only the first reply counts');
  assert.throws(() => t.setStatus(s, 1, 'Done', '2026-10-23T12:00'), /Choose a status/);
  assert.throws(() => t.setStatus(s, 9, 'Closed', '2026-10-23T12:00'), /No such ticket/);
  const r = t.setStatus(s, 1, 'Resolved', '2026-10-23T14:00');
  assert.equal(r.tickets[0].resolvedAt, '2026-10-23T14:00');
  assert.equal(t.setStatus(r, 1, 'Open', '2026-10-23T15:00').tickets[0].resolvedAt, '', 'reopening clears it');
  const noReply = t.setStatus(t.add(t.create(), tk()).state, 1, 'Resolved', '2026-10-23T12:00');
  assert.equal(noReply.tickets[0].firstResponseAt, '2026-10-23T12:00', 'resolving counts as the first reply if there was none');
});

test('pending customer pauses the resolution clock', () => {
  let s = t.add(t.create(), tk({ priority: 'Urgent' })).state; // resolve due 15:00
  s = t.setStatus(s, 1, 'Pending customer', '2026-10-23T12:00');
  const during = t.list(s, '2026-10-24T11:00')[0];
  assert.equal(during.resolve, 'paused');
  s = t.setStatus(s, 1, 'Open', '2026-10-24T11:00'); // waited Fri 12:00-19:00 (420) + Sat 10-11 (60) = 480 business minutes
  assert.equal(s.tickets[0].resolveDue, t.addBusinessMinutes('2026-10-23T15:00', 480, CFG));
  assert.equal(s.tickets[0].pendingSince, '');
  assert.equal(s.tickets[0].resolveDue, '2026-10-24T14:00', 'Friday 15:00 plus 8 business hours of waiting');
});

test('setPriority recalculates both deadlines and keeps the paused time', () => {
  let s = t.add(t.create(), tk({ priority: 'Normal' })).state;
  s = t.setPriority(s, 1, 'Urgent');
  assert.equal(s.tickets[0].firstDue, '2026-10-23T12:00');
  assert.equal(s.tickets[0].resolveDue, '2026-10-23T15:00');
  let p = t.add(t.create(), tk({ priority: 'Urgent' })).state;
  p = t.setStatus(t.setStatus(p, 1, 'Pending customer', '2026-10-23T12:00'), 1, 'Open', '2026-10-23T13:00');
  assert.equal(p.tickets[0].resolveDue, '2026-10-23T16:00');
  p = t.setPriority(p, 1, 'High');
  assert.equal(p.tickets[0].resolveDue, '2026-10-24T11:00', 'High = 8 hours from 11:00 on Friday, plus 1 hour paused');
  assert.throws(() => t.setPriority(p, 1, 'x'), /Choose a priority/);
});

test('list: SLA states, urgency order and filters', () => {
  const now = '2026-10-23T15:00';
  const s = t.sample(now);
  const rows = t.list(s, now);
  assert.equal(rows.length, 5);
  const by = (n) => rows.find((r) => r.ref === 'T-000' + n);
  assert.equal(by(1).first, 'met');
  assert.equal(by(1).resolve, 'overdue', 'urgent, created 10:30: due 14:30');
  assert.equal(by(2).resolve, 'paused');
  assert.equal(by(3).resolve, 'met');
  assert.equal(by(5).first, 'overdue', 'normal ticket from 09:45 with no reply: due 14:00');
  assert.equal(rows[rows.length - 1].open, false, 'finished tickets last');
  assert.equal(t.list(s, now, { breachedOnly: true }).length >= 1, true);
  assert.equal(t.list(s, now, { status: 'Resolved' }).length, 1);
  assert.equal(t.list(s, now, { priority: 'Urgent' }).length, 1);
  assert.equal(t.list(s, now, { text: 'neha' })[0].ref, 'T-0002');
  assert.equal(t.list(s, now, { openOnly: true }).length, 4);
  assert.equal(t.list(s, now, { assignee: 'Asha' }).length, 2);
});

test('summary figures', () => {
  const now = '2026-10-23T15:00';
  const m = t.summary(t.sample(now), now);
  assert.equal(m.total, 5);
  assert.equal(m.open, 4);
  assert.equal(m.pending, 1);
  assert.ok(m.overdue >= 1);
  assert.equal(m.noOwner, 1);
  assert.ok(m.avgFirst > 0);
  assert.equal(m.avgResolve > 0, true);
  assert.equal(t.summary(t.create(), now).avgFirst, null);
  assert.equal(t.summary(t.create(), now).firstWithin, null);
});

test('CSV guards formulas', () => {
  const s = t.add(t.create(), tk({ subject: '=cmd, x' })).state;
  const csv = t.toCsv(t.list(s, '2026-10-23T12:00'));
  assert.ok(csv.startsWith('﻿Ref,Subject'));
  assert.ok(csv.indexOf('"\'=cmd, x"') !== -1);
});

test('serialize/parse round trip and bad files', () => {
  const now = '2026-10-23T15:00';
  const s = t.sample(now);
  const back = t.parse(t.serialize(s));
  assert.deepEqual(t.list(back, now), t.list(s, now));
  assert.throws(() => t.parse('x'), /not a saved ticket log/);
  assert.throws(() => t.parse('{"app":"ticket-log"}'), /not a saved ticket log/);
  const bad = JSON.parse(t.serialize(s));
  bad.state.config.days = [];
  bad.state.tickets[0].priority = 'Nope';
  const fixed = t.parse(JSON.stringify(bad));
  assert.equal(fixed.tickets.length, 4, 'a damaged ticket is skipped');
  assert.deepEqual(fixed.config.days, [1, 2, 3, 4, 5, 6], 'a damaged config falls back to defaults');
});
