'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../js/core.js');

const base = () => c.sample();

test('add validates, normalises and does not mutate', () => {
  const s0 = c.create();
  const r = c.add(s0, { title: '  Hello  ', body: 'Hi {name}\r\nBye', tags: 'Hi, HELLO; hi', category: '' });
  assert.equal(r.reply.title, 'Hello');
  assert.equal(r.reply.category, 'General');
  assert.deepEqual(r.reply.tags, ['hi', 'hello']);
  assert.equal(r.reply.body, 'Hi {name}\nBye');
  assert.equal(s0.replies.length, 0);
  assert.throws(() => c.add(s0, { title: ' ', body: 'x' }), /title/);
  assert.throws(() => c.add(s0, { title: 'x', body: '  ' }), /reply text/);
});

test('update, remove, markUsed', () => {
  let s = c.add(c.create(), { title: 'A', body: 'one' }).state;
  s = c.update(s, 1, { title: 'B', body: 'two', category: 'Z', tags: 'x' });
  assert.deepEqual([s.replies[0].title, s.replies[0].body, s.replies[0].category, s.replies[0].tags], ['B', 'two', 'Z', ['x']]);
  assert.throws(() => c.update(s, 1, { title: '' }), /title/);
  assert.throws(() => c.update(s, 9, {}), /No such reply/);
  s = c.markUsed(c.markUsed(s, 1), 1);
  assert.equal(s.replies[0].used, 2);
  assert.equal(c.markUsed(s, 99).replies[0].used, 2);
  assert.equal(c.remove(s, 1).replies.length, 0);
});

test('placeholders and fill', () => {
  const body = 'Hi {name}, order {order_id} for {name}. {Company Name}! {123} { x } {}';
  assert.deepEqual(c.placeholders(body), ['name', 'order_id', 'Company Name']);
  assert.equal(c.fill('Hi {name}, order {order_id}', { name: ' Asha ', order_id: '' }), 'Hi Asha, order [order_id]');
  assert.equal(c.fill('{a} {a}', { a: '$&' }), '$& $&', 'special replacement characters are literal');
  assert.deepEqual(c.missing('Hi {name} {id}', { name: 'x' }), ['id']);
  assert.deepEqual(c.missing('plain', {}), []);
});

test('search: scoring, all words must match, category filter', () => {
  const s = base();
  assert.equal(c.search(s, 'refund')[0].title.indexOf('Refund'), 0);
  assert.equal(c.search(s, 'refund').length, 2);
  assert.equal(c.search(s, 'refund policy')[0].title, 'Refund not eligible');
  assert.equal(c.search(s, 'zzz').length, 0);
  assert.equal(c.search(s, '').length, 8);
  assert.equal(c.search(s, '', 'Opening').length, 2);
  assert.equal(c.search(s, 'password')[0].category, 'Account');
  assert.equal(c.search(s, 'working days')[0].title, 'Refund processed', 'found in the body');
  const used = c.markUsed(c.markUsed(s, 4), 4);
  assert.equal(c.search(used, 'refund')[0].id, 4, 'ties go to the most used');
  assert.deepEqual(c.categories(s), ['Account', 'Closing', 'Delays', 'Escalation', 'Opening', 'Refunds']);
});

test('sms segments', () => {
  assert.deepEqual(c.sms(''), { characters: 0, segments: 0, unicode: false });
  assert.deepEqual(c.sms('a'.repeat(160)), { characters: 160, segments: 1, unicode: false });
  assert.deepEqual(c.sms('a'.repeat(161)), { characters: 161, segments: 2, unicode: false });
  assert.equal(c.sms('a'.repeat(307)).segments, 3);
  assert.equal(c.sms('[x]').characters, 5, 'brackets count double');
  const u = c.sms('Refund of ₹500 done');
  assert.equal(u.unicode, true);
  assert.equal(u.segments, 1);
  assert.equal(c.sms('₹' + 'a'.repeat(70)).segments, 2);
});

test('CSV export guards formulas; import reads quotes and reports skipped rows', () => {
  let s = c.add(c.create(), { title: '=Evil', body: 'Line one\nLine "two", ok', tags: 'a;b', category: 'X' }).state;
  const csv = c.toCsv(s);
  assert.ok(csv.startsWith('﻿Title,Category'));
  assert.ok(csv.indexOf("'=Evil") !== -1);
  const back = c.importCsv(c.create(), csv);
  assert.equal(back.added, 1);
  assert.equal(back.state.replies[0].body, 'Line one\nLine "two", ok');
  assert.deepEqual(back.state.replies[0].tags, ['a', 'b']);
  const r = c.importCsv(c.create(), 'Name,Message\nA,hello\n,missing title\nB,\n');
  assert.equal(r.added, 1);
  assert.equal(r.skipped, 2);
  assert.throws(() => c.importCsv(c.create(), 'Foo,Bar\n1,2'), /columns Title and Reply/);
  assert.throws(() => c.importCsv(c.create(), ''), /empty/);
  assert.deepEqual(c.readCsv('a,"b\r\nc"\r\n"d""e",f'), [
    ['a', 'b\r\nc'],
    ['d"e', 'f'],
  ]);
});

test('serialize/parse round trip keeps usage, and rejects bad files', () => {
  let s = c.markUsed(base(), 2);
  const back = c.parse(c.serialize(s));
  assert.equal(back.replies.length, 8);
  assert.equal(back.replies[1].used, 1);
  assert.equal(back.replies[0].body, s.replies[0].body);
  assert.throws(() => c.parse('x'), /not a saved reply library/);
  assert.throws(() => c.parse('{"app":"canned-replies"}'), /not a saved reply library/);
  const bad = JSON.parse(c.serialize(s));
  bad.state.replies[0].title = '';
  assert.equal(c.parse(JSON.stringify(bad)).replies.length, 7);
});
