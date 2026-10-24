/**
 * Refund & Credit Calculator - core logic (pure). All money is worked in paise (whole numbers) so totals add up.
 *
 * Three calculators:
 *   prorate:  refund the unused part of a subscription or service period (price includes GST)
 *   returns:  refund returned items from an order, sharing any order discount, with optional fees and shipping
 *   goodwill: a credit as a percentage or fixed amount of an order, with a cap
 * Every result has a plain-language note you can paste to the customer.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.RefundCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const DAY = 86400000;
  const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28];

  /** Rupees (number or text such as "1,499.50") -> paise, or null. */
  function toPaise(v) {
    const t = String(v === null || v === undefined ? '' : v)
      .replace(/(?:₹|rs\.?|inr)/gi, '')
      .replace(/[,\s]/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
    return Math.round(Number(t) * 100);
  }
  const rs = (p) => OT.formatInr(p / 100, 2);
  const need = (p, what) => {
    if (p === null) throw new Error(what + ' must be an amount in rupees, such as 1,499 or 1499.50.');
    return p;
  };
  const share = (amount, num, den) => (den === 0 ? 0 : Math.round((amount * num) / den));
  const pct = (v, what) => {
    const n = v === '' || v === undefined || v === null ? 0 : Number(v);
    if (!isFinite(n) || n < 0 || n > 100) throw new Error(what + ' must be between 0 and 100.');
    return n;
  };
  /** Split a GST-inclusive amount into base and GST (base rounded, GST is the rest). */
  function split(gross, rate) {
    const base = Math.round(gross / (1 + rate / 100));
    return { base: base, gst: gross - base };
  }

  /**
   * prorate(i): { price, gstRate, start, end, cancelOn, cancelDayCounts (bool), coolingOffDays, feeFixed, feePct }
   * Returns days, gross refund (incl. GST), base and GST parts, fee, net refund and a note.
   */
  function prorate(i) {
    const price = need(toPaise(i.price), 'The price');
    if (price === 0) throw new Error('The price must be above zero.');
    const rate = i.gstRate === '' || i.gstRate === undefined ? 18 : Number(i.gstRate);
    if (!isFinite(rate) || rate < 0 || rate > 40) throw new Error('GST rate must be between 0 and 40.');
    const a = OT.parseIsoDate(i.start);
    const b = OT.parseIsoDate(i.end);
    const c = OT.parseIsoDate(i.cancelOn);
    if (b < a) throw new Error('The period ends before it starts.');
    const total = Math.round((b - a) / DAY) + 1;
    const sinceStart = Math.round((c - a) / DAY);
    const cooling = Math.max(0, Math.floor(Number(i.coolingOffDays) || 0));
    const feeFixed = i.feeFixed === '' || i.feeFixed === undefined ? 0 : need(toPaise(i.feeFixed), 'The fixed fee');
    const feePct = pct(i.feePct, 'The fee percentage');
    let used;
    if (sinceStart < 0) used = 0;
    else used = Math.min(total, sinceStart + (i.cancelDayCounts === false ? 0 : 1));
    const inCooling = cooling > 0 && sinceStart >= 0 && sinceStart < cooling;
    const unused = inCooling ? total : total - used;
    const gross = share(price, unused, total);
    const g = split(gross, rate);
    const fee = inCooling ? 0 : Math.min(gross, feeFixed + Math.round((gross * feePct) / 100));
    const net = gross - fee;
    const notes = [];
    if (inCooling)
      notes.push('Cancelled within the ' + cooling + '-day cooling-off period, so the full price is refunded and no fee applies.');
    else notes.push(unused + ' of ' + total + ' days are unused.');
    if (unused === 0) notes.push('The whole period has been used, so there is nothing to refund.');
    return {
      total: total,
      used: inCooling ? 0 : used,
      unused: unused,
      cooling: inCooling,
      price: price,
      gross: gross,
      base: g.base,
      gst: g.gst,
      fee: fee,
      net: net,
      gstRate: rate,
      note: proNote({ unused: unused, total: total, gross: gross, fee: fee, net: net, gst: g.gst, rate: rate, cooling: inCooling }),
    };
  }

  function proNote(r) {
    if (r.unused === 0) return 'The subscription period has been fully used, so no refund is due.';
    const L = [
      (r.cooling
        ? 'Because you cancelled within the cooling-off period, we are refunding the full amount.'
        : 'You used ' + (r.total - r.unused) + ' of ' + r.total + ' days, so we are refunding the ' + r.unused + ' unused days.') +
        ' Refund before charges: Rs. ' +
        rs(r.gross) +
        ' (includes GST of Rs. ' +
        rs(r.gst) +
        ' at ' +
        r.rate +
        '%).',
    ];
    if (r.fee) L.push('Cancellation charges: Rs. ' + rs(r.fee) + '.');
    L.push('Refund to your original payment method: Rs. ' + rs(r.net) + '.');
    return L.join(' ');
  }

  /** "Name | unit price (incl. GST) | quantity | returned | GST %" per line. Returns { lines, errors }. */
  function parseLines(text) {
    const lines = [];
    const errors = [];
    String(text || '')
      .split(/\r?\n/)
      .forEach((raw, idx) => {
        const line = raw.trim();
        if (!line || line[0] === '#') return;
        const p = line.split('|').map(norm);
        const at = 'Line ' + (idx + 1) + ': ';
        if (!p[0]) return errors.push(at + 'the item has no name.');
        const price = toPaise(p[1]);
        if (price === null) return errors.push(at + '"' + (p[1] || '') + '" is not a price.');
        const qty = p[2] === undefined || p[2] === '' ? 1 : Number(p[2]);
        if (!Number.isInteger(qty) || qty < 1 || qty > 10000) return errors.push(at + 'quantity must be a whole number from 1.');
        const ret = p[3] === undefined || p[3] === '' ? qty : Number(p[3]);
        if (!Number.isInteger(ret) || ret < 0 || ret > qty) return errors.push(at + 'returned quantity must be from 0 to ' + qty + '.');
        const gst = p[4] === undefined || p[4] === '' ? 18 : Number(p[4]);
        if (!isFinite(gst) || gst < 0 || gst > 40) return errors.push(at + 'GST must be between 0 and 40.');
        if (lines.length < 100) lines.push({ name: p[0].slice(0, 80), price: price, qty: qty, returned: ret, gstRate: gst });
      });
    return { lines: lines, errors: errors };
  }

  /**
   * returns(i): { lines, orderDiscount, shippingPaid, refundShipping, restockPct, restockFixed }
   * The discount is shared across lines by value, then the returned share is deducted. Returns per-line refunds and totals.
   */
  function returns(i) {
    if (!i.lines || !i.lines.length) throw new Error('Add at least one item.');
    const discount = i.orderDiscount === '' || i.orderDiscount === undefined ? 0 : need(toPaise(i.orderDiscount), 'The order discount');
    const ship = i.shippingPaid === '' || i.shippingPaid === undefined ? 0 : need(toPaise(i.shippingPaid), 'The shipping paid');
    const restockPct = pct(i.restockPct, 'The restocking percentage');
    const restockFixed =
      i.restockFixed === '' || i.restockFixed === undefined ? 0 : need(toPaise(i.restockFixed), 'The fixed restocking fee');
    const orderValue = i.lines.reduce((a, l) => a + l.price * l.qty, 0);
    if (discount > orderValue) throw new Error('The discount is larger than the order value.');
    let discountLeft = discount;
    const out = i.lines.map((l, k) => {
      const value = l.price * l.qty;
      const d = k === i.lines.length - 1 ? discountLeft : share(discount, value, orderValue);
      discountLeft -= d;
      const lineNet = value - d;
      const refund = share(lineNet, l.returned, l.qty);
      const g = split(refund, l.gstRate);
      return {
        name: l.name,
        qty: l.qty,
        returned: l.returned,
        value: value,
        discountShare: d,
        paid: lineNet,
        refund: refund,
        base: g.base,
        gst: g.gst,
      };
    });
    const items = out.reduce((a, l) => a + l.refund, 0);
    if (!items) throw new Error('No items are being returned.');
    const anyReturned = out.filter((l) => l.returned > 0);
    const allReturned = out.every((l) => l.returned === l.qty);
    const shipping = i.refundShipping && allReturned ? ship : 0;
    const fee = Math.min(items, restockFixed + Math.round((items * restockPct) / 100));
    const net = items + shipping - fee;
    const gstTotal = out.reduce((a, l) => a + l.gst, 0);
    const notes = [];
    if (i.refundShipping && !allReturned && ship) notes.push('Shipping is refunded only when the whole order is returned.');
    if (discount) notes.push('The order discount of Rs. ' + rs(discount) + ' was shared across items by value.');
    return {
      lines: out,
      orderValue: orderValueOf(out),
      discount: discount,
      items: items,
      shipping: shipping,
      fee: fee,
      net: net,
      gst: gstTotal,
      notes: notes,
      note: retNote({ n: anyReturned.length, items: items, shipping: shipping, fee: fee, net: net, gst: gstTotal, discount: discount }),
    };
  }
  const orderValueOf = (out) => out.reduce((a, l) => a + l.value, 0);

  function retNote(r) {
    const L = [
      'Refund for ' +
        r.n +
        ' returned item' +
        (r.n === 1 ? '' : 's') +
        ': Rs. ' +
        rs(r.items) +
        (r.discount ? ' (after your order discount is shared across items)' : '') +
        '.',
    ];
    if (r.shipping) L.push('Shipping refunded: Rs. ' + rs(r.shipping) + '.');
    if (r.fee) L.push('Restocking charge: Rs. ' + rs(r.fee) + '.');
    L.push('Total refund to your original payment method: Rs. ' + rs(r.net) + '. This includes GST of Rs. ' + rs(r.gst) + ' on the items.');
    return L.join(' ');
  }

  /** goodwill(i): { orderValue, mode ('pct' | 'fixed'), pct, fixed, cap } -> credit amount with cap applied. */
  function goodwill(i) {
    const value = need(toPaise(i.orderValue), 'The order value');
    if (value === 0) throw new Error('The order value must be above zero.');
    const cap = i.cap === '' || i.cap === undefined ? null : need(toPaise(i.cap), 'The cap');
    let credit;
    if (i.mode === 'fixed') credit = need(toPaise(i.fixed), 'The credit amount');
    else credit = Math.round((value * pct(i.pct, 'The percentage')) / 100);
    const capped = cap !== null && credit > cap;
    if (capped) credit = cap;
    return {
      orderValue: value,
      credit: credit,
      capped: capped,
      cap: cap,
      ofOrder: Math.round((credit / value) * 1000) / 10,
      note:
        'As a goodwill gesture we have added a credit of Rs. ' +
        rs(credit) +
        ' to your account' +
        (capped ? '' : '') +
        '. It can be used on your next order.',
    };
  }

  const cell = (v) => {
    const t = String(v === null || v === undefined ? '' : v);
    const safe = /^[=+@]/.test(t) || /^-[^0-9]/.test(t) ? "'" + t : t;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };

  function returnsCsv(r) {
    const head = [
      'Item',
      'Quantity',
      'Returned',
      'Value (Rs.)',
      'Discount share (Rs.)',
      'Paid (Rs.)',
      'Refund (Rs.)',
      'GST in refund (Rs.)',
    ];
    const f = (p) => (p / 100).toFixed(2);
    const rows = r.lines.map((l) => [l.name, l.qty, l.returned, f(l.value), f(l.discountShare), f(l.paid), f(l.refund), f(l.gst)]);
    rows.push(
      [],
      ['Items refund', '', '', '', '', '', f(r.items)],
      ['Shipping refund', '', '', '', '', '', f(r.shipping)],
      ['Restocking fee', '', '', '', '', '', f(-r.fee)],
      ['Net refund', '', '', '', '', '', f(r.net)],
    );
    return (
      '﻿' +
      [head]
        .concat(rows)
        .map((x) => x.map(cell).join(','))
        .join('\r\n')
    );
  }

  function sample(today) {
    return {
      prorate: {
        price: '11,800',
        gstRate: 18,
        start: OT.addDays(today, -40),
        end: OT.addDays(today, 324),
        cancelOn: today,
        cancelDayCounts: true,
        coolingOffDays: 7,
        feeFixed: '0',
        feePct: 10,
      },
      returns: {
        lines: 'Wireless earbuds | 2,999 | 1 | 1 | 18\nPhone case | 499 | 2 | 1 | 18\nCharging cable | 299 | 1 | 0 | 18',
        orderDiscount: '300',
        shippingPaid: '99',
        refundShipping: false,
        restockPct: 0,
        restockFixed: '',
      },
      goodwill: { orderValue: '4,200', mode: 'pct', pct: 10, fixed: '', cap: '500' },
    };
  }

  return {
    GST_RATES: GST_RATES,
    toPaise: toPaise,
    split: split,
    prorate: prorate,
    parseLines: parseLines,
    returns: returns,
    goodwill: goodwill,
    returnsCsv: returnsCsv,
    sample: sample,
  };
});
