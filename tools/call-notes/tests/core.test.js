'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const n = require('../js/core.js');

const TODAY = '2026-10-23';

test('findSensitive spots real card numbers but not random digits', () => {
  assert.deepEqual(n.findSensitive('card 4111 1111 1111 1111 ok'), [{ kind: 'Card number', sample: 'XXXX-XXXX-XXXX-1111' }]);
  assert.equal(n.findSensitive('order 1234567890123456').length, 0, 'fails the Luhn check');
  assert.equal(n.findSensitive('call 9876543210').length, 0, 'a phone number is not flagged');
  assert.deepEqual(n.findSensitive('aadhaar 2345 6789 0123'), [{ kind: 'Aadhaar-style number', sample: 'XXXX XXXX 0123' }]);
  assert.equal(n.findSensitive('ref 123456789012').length, 0, 'does not start with 2-9... starts with 1');
  assert.deepEqual(n.findSensitive('PAN is ABCDE1234F.'), [{ kind: 'PAN', sample: 'XXXXX1234X' }]);
  assert.deepEqual(n.findSensitive('my OTP is 482913'), [{ kind: 'OTP, CVV or PIN', sample: 'OTP is [hidden]' }]);
  assert.equal(n.findSensitive('').length, 0);
  assert.equal(n.findSensitive(null).length, 0);
});

test('mask replaces sensitive items and leaves the rest', () => {
  assert.equal(n.mask('Card 4111-1111-1111-1111, PAN ABCDE1234F, cvv: 123.'), 'Card XXXX-XXXX-XXXX-1111, PAN XXXXX1234X, cvv: [hidden].');
  assert.equal(n.mask('Order 1234567890123456 stays'), 'Order 1234567890123456 stays');
  assert.equal(n.mask('Call 9876543210 about Rs. 2,499'), 'Call 9876543210 about Rs. 2,499');
  assert.equal(n.mask('Aadhaar 2345 6789 0123 and card 5500005555555559'), 'Aadhaar XXXX XXXX 0123 and card XXXX-XXXX-XXXX-5559');
});

test('parseFollowUps', () => {
  const r = n.parseFollowUps('- Call back | 2026-10-25\n2) Check refund | 26/10/2026\nNo date\n | 2026-10-25\nBad | zz');
  assert.deepEqual(r.followUps, [
    { what: 'Call back', due: '2026-10-25' },
    { what: 'Check refund', due: '2026-10-26' },
    { what: 'No date', due: '' },
  ]);
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0], /line 4 has no text/);
  assert.match(r.errors[1], /"zz" is not a date/);
  assert.deepEqual(n.parseFollowUps(n.followUpsToText(r.followUps)).followUps, r.followUps);
  assert.equal(n.parseFollowUps(Array.from({ length: 30 }, (_, i) => 'x' + i).join('\n')).followUps.length, 10);
});

test('validate', () => {
  assert.deepEqual(n.validate(n.sample(TODAY)), []);
  const e = n.create();
  const p = n.validate(e);
  assert.ok(p.some((x) => /customer name/.test(x)) && p.some((x) => /Describe the issue/.test(x)) && p.some((x) => /what you did/.test(x)));
  const f = n.sample(TODAY);
  f.followUps = [];
  assert.match(n.validate(f).join(' '), /needs a follow-up/);
  f.followUps = [{ what: 'x', due: '' }];
  assert.match(n.validate(f).join(' '), /due date/);
  f.outcome = 'Escalated';
  assert.deepEqual(n.validate(f), []);
  f.minutes = 9999;
  f.startedAt = 'soon';
  const q = n.validate(f).join(' ');
  assert.match(q, /Duration/);
  assert.match(q, /start time/);
  f.outcome = 'Maybe';
  assert.match(n.validate(f).join(' '), /Choose the outcome/);
});

test('toText masks by default, can show everything, and includes next steps', () => {
  const t = n.toText(n.sample(TODAY));
  assert.match(t, /^PHONE NOTE - T-0412 - 23\/10\/2026 11:20 \(12 min\)/);
  assert.match(t, /Customer: Rohit Mehta \(98xxxxxx21\) {3}Handled by: Asha/);
  assert.match(t, /Reason: Refund {3}Mood: Frustrated/);
  assert.ok(t.indexOf('XXXX-XXXX-XXXX-1111') !== -1);
  assert.equal(t.indexOf('4111 1111'), -1);
  assert.match(t, /Outcome: Follow-up needed/);
  assert.match(t, /- Confirm refund credited and call the customer \(by 26\/10\/2026\)/);
  assert.ok(n.toText(n.sample(TODAY), { mask: false }).indexOf('4111 1111 1111 1111') !== -1);
  const bare = n.toText(n.create());
  assert.match(bare, /^PHONE NOTE\nCustomer: -/);
  assert.equal(bare.indexOf('Next steps'), -1);
});

test('save and open keeps good fields and repairs bad ones', () => {
  const s = n.sample(TODAY);
  assert.deepEqual(n.parse(n.serialize(s)), s);
  const bad = JSON.parse(n.serialize(s));
  bad.note.channel = 'Pigeon';
  bad.note.outcome = 'Whatever';
  bad.note.minutes = -5;
  bad.note.startedAt = 'x';
  bad.note.followUps = [
    { what: 'ok | with bar', due: '2026-10-25' },
    { what: '', due: '' },
  ];
  const fixed = n.parse(JSON.stringify(bad));
  assert.deepEqual([fixed.channel, fixed.outcome, fixed.minutes, fixed.startedAt], ['Phone', 'Resolved', 0, '']);
  assert.deepEqual(fixed.followUps, [{ what: 'ok with bar', due: '2026-10-25' }]);
  assert.throws(() => n.parse('x'), /not a saved note/);
  assert.throws(() => n.parse('{"app":"other"}'), /not a saved note/);
});
