'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const r = require('../js/core.js');

const NOW = '2026-10-23T18:00';

test('toDateTime understands many formats', () => {
  assert.equal(r.toDateTime('2026-10-23 14:30'), '2026-10-23T14:30');
  assert.equal(r.toDateTime('2026-10-23T09:05:44Z'), '2026-10-23T09:05');
  assert.equal(r.toDateTime('2026-10-23'), '2026-10-23T00:00');
  assert.equal(r.toDateTime('23/10/2026 14:30'), '2026-10-23T14:30');
  assert.equal(r.toDateTime('3-1-2026 9:05 PM'), '2026-01-03T21:05');
  assert.equal(r.toDateTime('23/10/2026 12:10 AM'), '2026-10-23T00:10');
  assert.equal(r.toDateTime(new Date(Date.UTC(2026, 9, 23, 7, 45))), '2026-10-23T07:45');
  assert.equal(r.toDateTime(46318.5), '2026-10-23T12:00', 'Excel serial with a fraction of a day');
  assert.equal(r.toDateTime(''), '');
  assert.equal(r.toDateTime(null), '');
  assert.equal(r.toDateTime('banana'), null);
  assert.equal(r.toDateTime('2026-02-30 10:00'), null);
  assert.equal(r.toDateTime('2026-10-23 25:00'), null);
  assert.equal(r.toDateTime(12), null);
});

test('rowsToTickets: flexible headers, defaults and problems', () => {
  const x = r.rowsToTickets([
    {
      'Ticket No': 'A1',
      'Created At': '2026-10-20 10:00',
      'First Reply': '2026-10-20 11:00',
      'Closed On': '2026-10-21 10:00',
      State: 'Closed',
      Assignee: 'Asha',
      Source: 'Email',
      Topic: 'Billing',
      Urgency: 'High',
    },
    { Created: '2026-10-21 09:00', Status: 'Resolved' },
    { Created: 'nope' },
    { Created: '2026-10-22 09:00', 'First Response': '2026-10-21 09:00' },
    { Created: '2026-10-22 09:00', Resolved: '2026-10-21 09:00' },
    { Created: '', Status: '' },
    { Created: '2026-10-22 09:00', 'First Response': 'zzz' },
  ]);
  assert.equal(x.tickets.length, 5);
  assert.deepEqual(
    [x.tickets[0].id, x.tickets[0].agent, x.tickets[0].channel, x.tickets[0].category, x.tickets[0].priority],
    ['A1', 'Asha', 'Email', 'Billing', 'High'],
  );
  assert.equal(x.tickets[1].id, 'row 3');
  assert.equal(x.tickets[1].agent, '(unassigned)');
  assert.equal(x.tickets[1].resolvedByStatusOnly, true, 'status says resolved but no time was given');
  assert.equal(x.tickets[2].first, '', 'a first response before created is ignored');
  assert.equal(x.tickets[3].resolved, '');
  assert.equal(x.problems.length, 4);
  assert.match(x.problems[0], /Row 4: no readable Created time/);
  assert.match(x.problems[1], /Row 5: first response is before created/);
  assert.match(x.problems[2], /Row 6: resolved time is before created/);
  assert.match(x.problems[3], /Row 8: a response or resolved time could not be read/);
});

test('percentile', () => {
  assert.equal(r.percentile([], 50), null);
  assert.equal(r.percentile([5], 90), 5);
  assert.equal(r.percentile([1, 2, 3, 4], 50), 2.5);
  assert.equal(r.percentile([4, 1, 3, 2], 50), 2.5);
  assert.equal(r.percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90), 9.1);
  assert.equal(r.percentile([10, 20], 0), 10);
  assert.equal(r.percentile([10, 20], 100), 20);
});

const tix = (rows) => r.rowsToTickets(rows).tickets;

test('report: backlog age buckets, oldest and averages', () => {
  const t = tix([
    { id: 'a', Created: '2026-10-23 12:00' },
    { id: 'b', Created: '2026-10-22 12:00' },
    { id: 'c', Created: '2026-10-19 12:00' },
    { id: 'd', Created: '2026-10-05 12:00' },
    { id: 'e', Created: '2026-08-01 12:00' },
    { id: 'f', Created: '2026-10-01 12:00', Status: 'Closed', Resolved: '2026-10-02 12:00' },
    { id: 'g', Created: '2026-10-24 12:00' },
  ]);
  const rep = r.report(t, NOW);
  assert.equal(rep.total, 7);
  assert.equal(rep.open, 5, 'a ticket created after the report time is not counted');
  assert.deepEqual(
    rep.buckets.map((b) => b.count),
    [1, 1, 1, 0, 1, 1],
  );
  assert.equal(rep.oldest[0].created, '2026-08-01T12:00');
  assert.equal(rep.oldest[0].ageDays, 83);
  assert.equal(rep.avgAgeDays > 15, true);
});

test('report: response and resolution times', () => {
  const t = tix([
    { Created: '2026-10-20 10:00', 'First Response': '2026-10-20 11:00', Resolved: '2026-10-21 10:00' },
    { Created: '2026-10-20 10:00', 'First Response': '2026-10-20 13:00', Resolved: '2026-10-22 10:00' },
    { Created: '2026-10-20 10:00', 'First Response': '2026-10-20 12:00' },
    { Created: '2026-10-22 10:00', 'First Response': '2026-10-24 10:00' },
  ]);
  const rep = r.report(t, NOW);
  assert.equal(rep.firstMedian, 2, '1h, 3h and 2h; the future reply is not counted');
  assert.equal(rep.firstP90, 2.8);
  assert.equal(rep.resolveMedian, 36, '24h and 48h');
  assert.equal(rep.noFirst, 0);
  assert.equal(r.report(tix([{ Created: '2026-10-23 10:00' }]), NOW).firstMedian, null);
  assert.equal(r.report(tix([{ Created: '2026-10-23 10:00' }]), NOW).noFirst, 1);
});

test('report: daily trend and backlog at end of each day', () => {
  const t = tix([
    { Created: '2026-10-21 10:00', Resolved: '2026-10-22 09:00' },
    { Created: '2026-10-22 10:00' },
    { Created: '2026-10-22 11:00', Resolved: '2026-10-23 12:00' },
    { Created: '2026-10-23 10:00' },
  ]);
  const rep = r.report(t, NOW, 3);
  assert.deepEqual(
    rep.daily.map((d) => d.date),
    ['2026-10-21', '2026-10-22', '2026-10-23'],
  );
  assert.deepEqual(
    rep.daily.map((d) => d.created),
    [1, 2, 1],
  );
  assert.deepEqual(
    rep.daily.map((d) => d.resolved),
    [0, 1, 1],
  );
  assert.deepEqual(
    rep.daily.map((d) => d.backlog),
    [1, 2, 2],
  );
  assert.equal(rep.createdLast, 4);
  assert.equal(rep.resolvedLast, 2);
  assert.equal(rep.trend, 'growing');
  assert.equal(r.report(t, NOW, 500).daily.length, 90);
  assert.throws(() => r.report(t, ''), /report date and time/);
});

test('report: grouping by agent', () => {
  const t = tix([
    { Created: '2026-10-20 10:00', Agent: 'Asha', Resolved: '2026-10-21 10:00', 'First Response': '2026-10-20 12:00' },
    { Created: '2026-10-20 10:00', Agent: 'Asha' },
    { Created: '2026-10-20 10:00', Agent: 'Ravi' },
    { Created: '2026-10-20 10:00', Agent: 'Ravi' },
    { Created: '2026-10-20 10:00' },
  ]);
  const rep = r.report(t, NOW);
  assert.deepEqual(
    rep.byAgent.map((a) => [a.key, a.total, a.open]),
    [
      ['Ravi', 2, 2],
      ['Asha', 2, 1],
      ['(unassigned)', 1, 1],
    ],
  );
  const asha = rep.byAgent.find((a) => a.key === 'Asha');
  assert.equal(asha.medianFirst, 2);
  assert.equal(asha.medianResolve, 24);
  assert.equal(asha.resolved, 1);
});

test('sample data produces a believable report and CSV', () => {
  const rows = r.sampleRows(NOW);
  const x = r.rowsToTickets(rows);
  assert.equal(x.problems.length, 0);
  assert.equal(x.tickets.length, 40);
  const rep = r.report(x.tickets, NOW);
  assert.ok(rep.open > 0 && rep.open < 40);
  assert.ok(rep.firstMedian > 0 && rep.resolveMedian > 0);
  const csv = r.toCsv(rep);
  assert.ok(csv.startsWith('﻿Report as of,2026-10-23 18:00'));
  assert.ok(csv.indexOf('Open backlog by age,Tickets') !== -1);
  assert.ok(csv.indexOf('By agent,Tickets,Open') !== -1);
  const evil = r.toCsv(r.report(tix([{ Created: '2026-10-22 10:00', Agent: '=cmd' }]), NOW));
  assert.ok(evil.indexOf("'=cmd") !== -1);
});
