'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const k = require('../js/core.js');

const TODAY = '2026-10-23';

test('parseList and parseSteps strip bullets and split notes', () => {
  assert.deepEqual(k.parseList('- a\n2) b\n\n• c'), ['a', 'b', 'c']);
  assert.deepEqual(k.parseSteps('1. Tap Save | wait a moment\n- Done\n | orphan note'), [
    { text: 'Tap Save', note: 'wait a moment' },
    { text: 'Done', note: '' },
  ]);
  assert.equal(k.parseList(Array.from({ length: 40 }, (_, i) => 'x' + i).join('\n')).length, 25);
  assert.deepEqual(k.parseSteps(k.stepsToText(k.sample(TODAY).steps)), k.sample(TODAY).steps);
  assert.deepEqual(k.parseTags('Login, login; Account ,, '), ['login', 'account']);
});

test('readability: simple text scores higher than dense text', () => {
  const easy = k.readability('Open the app. Tap the button. Type your email. Tap send. You will get a link.');
  const hard = k.readability(
    'Authentication credentials necessitate reinitialisation following unsuccessful verification attempts, notwithstanding organisational requirements regarding infrastructure.',
  );
  assert.ok(easy.score > 70, 'easy scored ' + easy.score);
  assert.ok(hard.score < 20, 'hard scored ' + hard.score);
  assert.equal(easy.label, 'Easy to read');
  assert.equal(hard.label, 'Very difficult');
  assert.equal(k.readability('too short'), null);
  assert.equal(easy.sentences, 5);
});

test('check: errors for missing pieces, tips for style', () => {
  assert.deepEqual(k.check(k.sample(TODAY)).errors, []);
  const e = k.check(k.create());
  assert.ok(e.errors.some((x) => /title/.test(x)) && e.errors.some((x) => /summary/.test(x)) && e.errors.some((x) => /steps/.test(x)));
  const t = k.create();
  t.title = 'Login fails';
  t.type = 'Troubleshooting';
  t.summary = 's';
  t.steps = k.parseSteps('Try again');
  const r = k.check(t);
  assert.ok(r.errors.some((x) => /symptoms/.test(x)));
  assert.ok(r.tips.some((x) => /causes/.test(x)));
  assert.ok(r.tips.some((x) => /should see/.test(x)));
  assert.ok(r.tips.some((x) => /tags/.test(x)));
  const faq = k.create();
  faq.type = 'FAQ';
  faq.title = 'Q?';
  faq.summary = 's';
  assert.ok(k.check(faq).errors.some((x) => /Write the answer/.test(x)));
  faq.result = 'Yes.';
  assert.deepEqual(k.check(faq).errors, []);
});

test('check: tips about titles, long steps, click here, internal words', () => {
  const a = k.sample(TODAY);
  a.title = 'Passwords';
  assert.ok(k.check(a).tips.some((x) => /start with an action/.test(x)));
  a.title = 'x'.repeat(80);
  assert.ok(k.check(a).tips.some((x) => /80 characters/.test(x)));
  a.steps = k.parseSteps('Click here\n' + 'word '.repeat(50) + '\nOpen the page and then click save');
  const t = k.check(a).tips.join(' | ');
  assert.match(t, /Step 1 says "click here"/);
  assert.match(t, /Step 2 is long/);
  assert.match(t, /Step 3 seems to hold more than one action/);
  a.steps = k.parseSteps(Array.from({ length: 14 }, (_, i) => 'Do thing ' + i).join('\n'));
  assert.ok(k.check(a).tips.some((x) => /14 steps/.test(x)));
  const c = k.sample(TODAY);
  c.cause = 'Escalate to the backend team';
  assert.ok(k.check(c).tips.some((x) => /internal terms/.test(x)));
  c.audience = 'Internal';
  assert.ok(!k.check(c).tips.some((x) => /internal terms/.test(x)));
});

test('review date adds months and clamps month ends', () => {
  const a = k.create();
  a.updated = '2026-08-31';
  a.reviewMonths = 6;
  assert.equal(k.reviewDate(a), '2027-02-28');
  a.reviewMonths = 0;
  assert.equal(k.reviewDate(a), '');
  a.updated = '';
  a.reviewMonths = 6;
  assert.equal(k.reviewDate(a), '');
});

test('toMarkdown', () => {
  const md = k.toMarkdown(k.sample(TODAY));
  assert.match(md, /^# Reset your account password\n\n_Choose a new password/);
  assert.match(md, /## Steps\n\n1\. Open the app and tap Log in\./);
  assert.match(md, /3\. Enter the email address[^\n]*\n {3}_The link works for 30 minutes\._/);
  assert.match(md, /## What you should see/);
  assert.match(md, /## Related articles\n\n- Why am I not getting/);
  assert.match(
    md,
    /---\nHow-to \| Customer \| Customer app \| v1\.0 \| updated 23\/10\/2026 \| by Support team\nTags: password, login, account\n$/,
  );
  const faq = k.create();
  faq.type = 'FAQ';
  faq.title = 'Q';
  faq.result = 'Answer text';
  assert.match(k.toMarkdown(faq), /## Answer\n\nAnswer text/);
});

test('save and open repairs bad fields', () => {
  const a = k.sample(TODAY);
  assert.deepEqual(k.parse(k.serialize(a)), a);
  const bad = JSON.parse(k.serialize(a));
  bad.article.type = 'Novel';
  bad.article.reviewMonths = 999;
  bad.article.steps = [
    { text: 'ok | with bar', note: 'n' },
    { text: '', note: '' },
  ];
  bad.article.updated = 'soon';
  const f = k.parse(JSON.stringify(bad));
  assert.deepEqual([f.type, f.reviewMonths, f.updated], ['How-to', 6, '']);
  assert.deepEqual(f.steps, [{ text: 'ok with bar', note: 'n' }]);
  assert.throws(() => k.parse('x'), /not a saved article/);
  assert.throws(() => k.parse('{"app":"other"}'), /not a saved article/);
});

test('buildPdf: valid, one page for a short article, more for a long one', async () => {
  const PDFLib = require('../vendor/pdf-lib.min.js');
  const bytes = await k.buildPdf(PDFLib, k.sample(TODAY), { company: 'Acme' });
  assert.equal(Buffer.from(bytes).slice(0, 5).toString(), '%PDF-');
  assert.equal((await PDFLib.PDFDocument.load(bytes)).getPageCount(), 1);
  const long = k.sample(TODAY);
  long.steps = k.parseSteps(
    Array.from({ length: 25 }, (_, i) => 'Step number ' + i + ' ' + 'word '.repeat(40) + ' | A helpful note for the reader').join('\n'),
  );
  assert.ok((await PDFLib.PDFDocument.load(await k.buildPdf(PDFLib, long))).getPageCount() >= 2);
});
