'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('../js/core.js');

const TODAY = '2026-10-23';

test('parseList strips bullets and caps', () => {
  assert.deepEqual(h.parseList('- a\n2) b\n\n• c'), ['a', 'b', 'c']);
  assert.equal(h.parseList(Array.from({ length: 50 }, (_, i) => 'x' + i).join('\n')).length, 30);
});

test('parseCases: columns, errors, round trip', () => {
  const r = h.parseCases('# c\nT-1 | Asha | Call back | Ravi | 5 pm\nT-2\n | x | y\nT-3 | | Do it');
  assert.equal(r.cases.length, 3);
  assert.deepEqual(r.cases[0], { ref: 'T-1', customer: 'Asha', need: 'Call back', owner: 'Ravi', due: '5 pm' });
  assert.equal(r.cases[2].customer, '');
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0], /Case line 3 \(T-2\): say what is needed next/);
  assert.match(r.errors[1], /Case line 4 has no reference/);
  const s = h.sample(TODAY);
  assert.deepEqual(h.parseCases(h.casesToText(s.cases)).cases, s.cases);
});

test('check: errors and warnings', () => {
  assert.deepEqual(h.check(h.sample(TODAY)).errors, []);
  const w = h.check(h.sample(TODAY)).warnings;
  assert.deepEqual(w, ['T-0433 has no owner for the next shift.']);
  const e = h.check(h.create());
  assert.ok(
    e.errors.some((x) => /handing over/.test(x)) &&
      e.errors.some((x) => /taking over/.test(x)) &&
      e.errors.some((x) => /Add the date/.test(x)),
  );
  assert.ok(e.warnings.some((x) => /Nothing to hand over/.test(x)));
  const d = h.sample(TODAY);
  d.urgent = 50;
  d.waiting = -1;
  d.date = '2026-02-30';
  const c = h.check(d);
  assert.ok(c.warnings.some((x) => /Urgent \(50\) is higher than Open \(38\)/.test(x)));
  assert.ok(c.errors.some((x) => /Waiting count/.test(x)));
  assert.ok(c.errors.some((x) => /not a real date/.test(x)));
  d.cases[0].due = '';
  assert.ok(h.check(d).warnings.some((x) => /T-0412 has no due time/.test(x)));
});

test('toText', () => {
  const t = h.toText(h.sample(TODAY));
  assert.match(
    t,
    /^SHIFT HANDOVER - Customer support - Evening - 23\/10\/2026\nFrom Asha to Ravi\nQueue: Open 38 {3}Waiting on customer 12 {3}Urgent 3/,
  );
  assert.match(t, /- T-0412 \(Rohit Mehta\): Check refund reached the card and call him back \[Ravi\] by 11:00 tomorrow/);
  assert.match(t, /- T-0433 \(Sana Khan\): Needs corrected invoice from finance \[no owner\] by Today 6 pm/);
  assert.match(t, /Known issues:\n- Payment gateway is slow/);
  assert.match(t, /Keep an eye on:\n- Neha Iyer/);
  assert.match(t, /Reminders:\n- Team huddle/);
  const bare = h.toText(h.create());
  assert.match(bare, /^SHIFT HANDOVER - Morning\nFrom - to -$/);
});

test('save and open repairs bad fields', () => {
  const d = h.sample(TODAY);
  assert.deepEqual(h.parse(h.serialize(d)), d);
  const bad = JSON.parse(h.serialize(d));
  bad.handover.shift = 'Brunch';
  bad.handover.open = -4;
  bad.handover.date = 'soon';
  bad.handover.cases = [
    { ref: 'A|B', need: 'x|y', customer: '' },
    { ref: '', need: 'z' },
  ];
  const f = h.parse(JSON.stringify(bad));
  assert.deepEqual([f.shift, f.open, f.date], ['Morning', null, '']);
  assert.deepEqual(
    f.cases.map((c) => c.ref),
    ['A B'],
  );
  assert.throws(() => h.parse('x'), /not a saved handover/);
  assert.throws(() => h.parse('{"app":"other"}'), /not a saved handover/);
});

test('buildPdf: valid, one page for a normal handover, more for a long one', async () => {
  const PDFLib = require('../vendor/pdf-lib.min.js');
  const bytes = await h.buildPdf(PDFLib, h.sample(TODAY));
  assert.equal(Buffer.from(bytes).slice(0, 5).toString(), '%PDF-');
  assert.equal((await PDFLib.PDFDocument.load(bytes)).getPageCount(), 1);
  const d = h.sample(TODAY);
  d.cases = h.parseCases(
    Array.from(
      { length: 30 },
      (_, i) => 'T-' + i + ' | Customer ' + i + ' | ' + 'needs a long explanation '.repeat(8) + ' | Ravi | tomorrow',
    ).join('\n'),
  ).cases;
  d.issues = h.parseList(Array.from({ length: 30 }, () => 'issue '.repeat(30)).join('\n'));
  assert.ok((await PDFLib.PDFDocument.load(await h.buildPdf(PDFLib, d))).getPageCount() >= 2);
});
