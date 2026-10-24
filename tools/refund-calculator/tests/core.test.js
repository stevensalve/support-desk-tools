'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const r = require('../js/core.js');

const pro = (o) =>
  r.prorate(
    Object.assign(
      {
        price: '11,800',
        gstRate: 18,
        start: '2026-01-01',
        end: '2026-12-31',
        cancelOn: '2026-07-01',
        cancelDayCounts: true,
        coolingOffDays: 0,
        feeFixed: '',
        feePct: 0,
      },
      o || {},
    ),
  );

test('toPaise accepts Indian formats and rejects nonsense', () => {
  assert.equal(r.toPaise('1,499.50'), 149950);
  assert.equal(r.toPaise('₹ 2,499'), 249900);
  assert.equal(r.toPaise('Rs. 10'), 1000);
  assert.equal(r.toPaise(299), 29900);
  assert.equal(r.toPaise('0.1'), 10);
  assert.equal(r.toPaise('1.234'), null);
  assert.equal(r.toPaise('-5'), null);
  assert.equal(r.toPaise('abc'), null);
  assert.equal(r.toPaise(''), null);
});

test('split keeps base plus GST equal to the gross', () => {
  assert.deepEqual(r.split(11800, 18), { base: 10000, gst: 1800 });
  assert.deepEqual(r.split(10000, 0), { base: 10000, gst: 0 });
  const s = r.split(9999, 18);
  assert.equal(s.base + s.gst, 9999);
});

test('prorate: unused days and GST split', () => {
  const x = pro();
  assert.equal(x.total, 365);
  assert.equal(x.used, 182, 'Jan 1 to Jul 1 inclusive = 182 days');
  assert.equal(x.unused, 183);
  assert.equal(x.gross, Math.round((1180000 * 183) / 365));
  assert.equal(x.base + x.gst, x.gross);
  assert.equal(x.net, x.gross);
  assert.match(x.note, /You used 182 of 365 days/);
  assert.match(x.note, /includes GST of Rs\. [\d,.]+ at 18%/);
});

test('prorate: cancel day option, before start, after end', () => {
  assert.equal(pro({ cancelDayCounts: false }).unused, 184);
  const early = pro({ cancelOn: '2025-12-01' });
  assert.equal(early.used, 0);
  assert.equal(early.gross, 1180000);
  const late = pro({ cancelOn: '2027-01-15' });
  assert.equal(late.unused, 0);
  assert.equal(late.gross, 0);
  assert.match(late.note, /no refund is due/);
});

test('prorate: cooling-off gives a full refund with no fee; fees otherwise', () => {
  const c = pro({ cancelOn: '2026-01-05', coolingOffDays: 7, feePct: 10, feeFixed: '100' });
  assert.equal(c.cooling, true);
  assert.equal(c.gross, 1180000);
  assert.equal(c.fee, 0);
  assert.match(c.note, /cooling-off/);
  const f = pro({ feePct: 10, feeFixed: '100' });
  assert.equal(f.fee, 10000 + Math.round(f.gross * 0.1));
  assert.equal(f.net, f.gross - f.fee);
  assert.match(f.note, /Cancellation charges/);
  const big = pro({ feeFixed: '999999' });
  assert.equal(big.fee, big.gross, 'the fee never exceeds the refund');
  assert.equal(big.net, 0);
});

test('prorate: validation', () => {
  assert.throws(() => pro({ price: 'abc' }), /The price must be an amount/);
  assert.throws(() => pro({ price: '0' }), /above zero/);
  assert.throws(() => pro({ gstRate: 90 }), /GST rate/);
  assert.throws(() => pro({ end: '2025-01-01' }), /ends before it starts/);
  assert.throws(() => pro({ cancelOn: '' }), /Dates must look like/);
  assert.throws(() => pro({ feePct: 150 }), /fee percentage/);
  assert.throws(() => pro({ feeFixed: 'x' }), /fixed fee/);
});

test('parseLines: defaults and errors', () => {
  const x = r.parseLines(
    '# order\nShoes | 2,499 | 2 | 1 | 12\nSocks | 199\n | 5\nHat | abc\nBag | 100 | 0\nCap | 100 | 2 | 3\nPen | 10 | 1 | 1 | 99',
  );
  assert.equal(x.lines.length, 2);
  assert.deepEqual(x.lines[0], { name: 'Shoes', price: 249900, qty: 2, returned: 1, gstRate: 12 });
  assert.deepEqual(
    x.lines[1],
    { name: 'Socks', price: 19900, qty: 1, returned: 1, gstRate: 18 },
    'returned defaults to the whole quantity',
  );
  assert.equal(x.errors.length, 5);
  assert.match(x.errors[0], /Line 4: the item has no name/);
  assert.match(x.errors[1], /"abc" is not a price/);
  assert.match(x.errors[2], /quantity must be a whole number/);
  assert.match(x.errors[3], /returned quantity must be from 0 to 2/);
  assert.match(x.errors[4], /GST must be between/);
});

const ret = (text, o) =>
  r.returns(
    Object.assign(
      { lines: r.parseLines(text).lines, orderDiscount: '', shippingPaid: '', refundShipping: false, restockPct: 0, restockFixed: '' },
      o || {},
    ),
  );

test('returns: no discount, partial quantity', () => {
  const x = ret('Shirt | 1,000 | 3 | 2 | 12');
  assert.equal(x.items, 200000);
  assert.equal(x.net, 200000);
  assert.equal(x.lines[0].base + x.lines[0].gst, 200000);
  assert.equal(x.gst, x.lines[0].gst);
  assert.match(x.note, /Refund for 1 returned item: Rs\. 2,000\.00/);
});

test('returns: the discount is shared by value and the shares add up', () => {
  const x = ret('A | 1,000 | 1 | 1 | 18\nB | 2,000 | 1 | 0 | 18\nC | 3,000 | 1 | 1 | 18', { orderDiscount: '600' });
  assert.deepEqual(
    x.lines.map((l) => l.discountShare),
    [10000, 20000, 30000],
  );
  assert.equal(
    x.lines.reduce((a, l) => a + l.discountShare, 0),
    60000,
    'shares add up to the whole discount',
  );
  assert.deepEqual(
    x.lines.map((l) => l.refund),
    [90000, 0, 270000],
  );
  assert.equal(x.items, 360000);
  assert.match(x.note, /after your order discount/);
  const odd = ret('A | 100 | 1 | 1\nB | 100 | 1 | 1\nC | 100 | 1 | 1', { orderDiscount: '1' });
  assert.equal(
    odd.lines.reduce((a, l) => a + l.discountShare, 0),
    100,
    'rounding leftovers go to the last line',
  );
});

test('returns: shipping only on a full return, and restocking fees', () => {
  const some = ret('A | 500 | 2 | 1', { shippingPaid: '99', refundShipping: true });
  assert.equal(some.shipping, 0);
  assert.ok(some.notes.some((n) => /only when the whole order is returned/.test(n)));
  const all = ret('A | 500 | 2 | 2', { shippingPaid: '99', refundShipping: true });
  assert.equal(all.shipping, 9900);
  assert.equal(all.net, 100000 + 9900);
  const fee = ret('A | 1,000 | 1 | 1', { restockPct: 10, restockFixed: '50' });
  assert.equal(fee.fee, 10000 + 5000);
  assert.equal(fee.net, 100000 - 15000);
  assert.match(fee.note, /Restocking charge: Rs\. 150\.00/);
  const cap = ret('A | 100 | 1 | 1', { restockFixed: '999' });
  assert.equal(cap.net, 0, 'the fee cannot exceed the refund');
});

test('returns: validation', () => {
  assert.throws(() => r.returns({ lines: [] }), /at least one item/);
  assert.throws(() => ret('A | 100 | 1 | 0'), /No items are being returned/);
  assert.throws(() => ret('A | 100 | 1 | 1', { orderDiscount: '500' }), /discount is larger/);
  assert.throws(() => ret('A | 100 | 1 | 1', { orderDiscount: 'x' }), /order discount must be/);
  assert.throws(() => ret('A | 100 | 1 | 1', { shippingPaid: 'x' }), /shipping paid/);
  assert.throws(() => ret('A | 100 | 1 | 1', { restockPct: 200 }), /restocking percentage/);
});

test('goodwill: percent, fixed, cap', () => {
  const a = r.goodwill({ orderValue: '4,200', mode: 'pct', pct: 10, cap: '500' });
  assert.equal(a.credit, 42000);
  assert.equal(a.capped, false);
  assert.equal(a.ofOrder, 10);
  const b = r.goodwill({ orderValue: '10,000', mode: 'pct', pct: 10, cap: '500' });
  assert.equal(b.credit, 50000);
  assert.equal(b.capped, true);
  assert.equal(r.goodwill({ orderValue: '1,000', mode: 'fixed', fixed: '250', cap: '' }).credit, 25000);
  assert.match(a.note, /credit of Rs\. 420\.00/);
  assert.throws(() => r.goodwill({ orderValue: '0', mode: 'pct', pct: 5 }), /above zero/);
  assert.throws(() => r.goodwill({ orderValue: '100', mode: 'fixed', fixed: 'x' }), /credit amount/);
  assert.throws(() => r.goodwill({ orderValue: '100', mode: 'pct', pct: 101 }), /percentage/);
  assert.throws(() => r.goodwill({ orderValue: '100', mode: 'pct', pct: 5, cap: 'x' }), /The cap/);
});

test('CSV and sample', () => {
  const s = r.sample('2026-10-23');
  const x = r.returns({
    lines: r.parseLines(s.returns.lines).lines,
    orderDiscount: s.returns.orderDiscount,
    shippingPaid: s.returns.shippingPaid,
    refundShipping: s.returns.refundShipping,
    restockPct: s.returns.restockPct,
    restockFixed: s.returns.restockFixed,
  });
  const csv = r.returnsCsv(x);
  assert.ok(csv.startsWith('﻿Item,Quantity,Returned'));
  assert.ok(csv.indexOf('Net refund') !== -1);
  assert.ok(csv.indexOf('Wireless earbuds,1,1,2999.00') !== -1);
  assert.ok(r.returnsCsv(ret('=cmd | 100 | 1 | 1')).indexOf("'=cmd") !== -1);
  const p = r.prorate(s.prorate);
  assert.equal(p.cooling, false);
  assert.ok(p.gross > 0);
  assert.equal(r.goodwill(s.goodwill).credit, 42000);
});
