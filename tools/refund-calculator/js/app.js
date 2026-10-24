/* Refund & Credit Calculator - user interface. All rules live in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, el, copyText } = OT;
  const $ = (id) => document.getElementById(id);
  const p2 = (n) => String(n).padStart(2, '0');
  const d0 = new Date();
  const todayIso = d0.getFullYear() + '-' + p2(d0.getMonth() + 1) + '-' + p2(d0.getDate());
  const rs = (p) => 'Rs. ' + OT.formatInr(p / 100, 2);
  let lastReturns = null;

  RefundCore.GST_RATES.forEach((r) => $('p-gst').appendChild(el('option', { value: String(r), text: r + '%' })));
  $('p-gst').value = '18';
  $('p-cancel').value = todayIso;

  function rows(tbl, list) {
    tbl.textContent = '';
    list.forEach((r) => tbl.appendChild(el('tr', { class: r[2] ? 'strong' : '' }, [el('td', { text: r[0] }), el('td', { text: r[1] })])));
  }
  const clear = (...ids) => ids.forEach((id) => ($(id).textContent = ''));

  function pro() {
    clear('p-out', 'p-note');
    try {
      const x = RefundCore.prorate({
        price: $('p-price').value,
        gstRate: Number($('p-gst').value),
        start: $('p-start').value,
        end: $('p-end').value,
        cancelOn: $('p-cancel').value,
        cancelDayCounts: $('p-day').checked,
        coolingOffDays: Number($('p-cool').value) || 0,
        feeFixed: $('p-fixed').value,
        feePct: $('p-pct').value,
      });
      setStatus($('p-status'), '', '');
      rows($('p-out'), [
        ['Period', x.total + ' days (' + x.unused + ' unused)'],
        ['Refund before charges', rs(x.gross)],
        ['  of which price before GST', rs(x.base)],
        ['  of which GST at ' + x.gstRate + '%', rs(x.gst)],
        ['Cancellation charges', '- ' + rs(x.fee)],
        ['Net refund', rs(x.net), true],
      ]);
      $('p-note').textContent = x.note;
    } catch (e) {
      if ($('p-price').value || $('p-start').value || $('p-end').value) setStatus($('p-status'), e.message, 'error');
      else setStatus($('p-status'), '', '');
    }
  }

  function ret() {
    clear('r-out', 'r-note', 'r-table');
    lastReturns = null;
    const parsed = RefundCore.parseLines($('r-lines').value);
    if (parsed.errors.length) setStatus($('r-status'), parsed.errors.slice(0, 4).join(' '), 'warn');
    else setStatus($('r-status'), '', '');
    if (!parsed.lines.length) return;
    try {
      const x = RefundCore.returns({
        lines: parsed.lines,
        orderDiscount: $('r-disc').value,
        shippingPaid: $('r-ship').value,
        refundShipping: $('r-refship').checked,
        restockPct: $('r-pct').value,
        restockFixed: $('r-fixed').value,
      });
      lastReturns = x;
      const t = $('r-table');
      t.appendChild(
        el('thead', {}, [
          el(
            'tr',
            {},
            ['Item', 'Qty', 'Returned', 'Value', 'Discount share', 'Refund'].map((h) => el('th', { scope: 'col', text: h })),
          ),
        ]),
      );
      const b = el('tbody');
      x.lines.forEach((l) =>
        b.appendChild(
          el('tr', {}, [
            el('td', { text: l.name }),
            el('td', { text: String(l.qty) }),
            el('td', { text: String(l.returned) }),
            el('td', { class: 'num', text: rs(l.value) }),
            el('td', { class: 'num', text: rs(l.discountShare) }),
            el('td', { class: 'num', text: rs(l.refund) }),
          ]),
        ),
      );
      t.appendChild(b);
      rows($('r-out'), [
        ['Items refund', rs(x.items)],
        ['Shipping refund', rs(x.shipping)],
        ['Restocking fee', '- ' + rs(x.fee)],
        ['GST included in items', rs(x.gst)],
        ['Net refund', rs(x.net), true],
      ]);
      $('r-note').textContent = x.note + (x.notes.length ? '\n\n(Internal: ' + x.notes.join(' ') + ')' : '');
    } catch (e) {
      setStatus($('r-status'), e.message, 'error');
    }
  }

  function gw() {
    clear('g-out', 'g-note');
    try {
      const x = RefundCore.goodwill({
        orderValue: $('g-value').value,
        mode: $('g-mode').value,
        pct: $('g-pct').value,
        fixed: $('g-fixed').value,
        cap: $('g-cap').value,
      });
      setStatus($('g-status'), '', '');
      rows($('g-out'), [
        ['Order value', rs(x.orderValue)],
        ['Credit' + (x.capped ? ' (capped)' : ''), rs(x.credit), true],
        ['Credit as share of order', x.ofOrder + '%'],
      ]);
      $('g-note').textContent = x.note;
    } catch (e) {
      if ($('g-value').value) setStatus($('g-status'), e.message, 'error');
      else setStatus($('g-status'), '', '');
    }
  }

  ['p-price', 'p-gst', 'p-start', 'p-end', 'p-cancel', 'p-cool', 'p-fixed', 'p-pct', 'p-day'].forEach((id) =>
    $(id).addEventListener('input', pro),
  );
  ['r-lines', 'r-disc', 'r-ship', 'r-pct', 'r-fixed', 'r-refship'].forEach((id) => $(id).addEventListener('input', ret));
  ['g-value', 'g-mode', 'g-pct', 'g-fixed', 'g-cap'].forEach((id) => $(id).addEventListener('input', gw));

  const copy = (id) => async () => {
    const ok = await copyText($(id).textContent);
    setStatus(
      $('out-status'),
      ok === false ? 'Could not copy. Select the text and copy it yourself.' : 'Copied.',
      ok === false ? 'warn' : 'ok',
    );
  };
  $('p-copy').addEventListener('click', copy('p-note'));
  $('r-copy').addEventListener('click', copy('r-note'));
  $('g-copy').addEventListener('click', copy('g-note'));
  $('r-csv').addEventListener('click', () =>
    lastReturns
      ? downloadBlob(RefundCore.returnsCsv(lastReturns), 'refund.csv', 'text/csv;charset=utf-8')
      : setStatus($('out-status'), 'Enter the returned items first.', 'error'),
  );
  $('demo').addEventListener('click', () => {
    const s = RefundCore.sample(todayIso);
    $('p-price').value = s.prorate.price;
    $('p-gst').value = String(s.prorate.gstRate);
    $('p-start').value = s.prorate.start;
    $('p-end').value = s.prorate.end;
    $('p-cancel').value = s.prorate.cancelOn;
    $('p-cool').value = s.prorate.coolingOffDays;
    $('p-fixed').value = s.prorate.feeFixed;
    $('p-pct').value = s.prorate.feePct;
    $('r-lines').value = s.returns.lines;
    $('r-disc').value = s.returns.orderDiscount;
    $('r-ship').value = s.returns.shippingPaid;
    $('g-value').value = s.goodwill.orderValue;
    $('g-pct').value = s.goodwill.pct;
    $('g-cap').value = s.goodwill.cap;
    pro();
    ret();
    gw();
  });
  pro();
  ret();
  gw();
})();
