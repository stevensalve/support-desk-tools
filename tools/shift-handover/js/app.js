/* Shift Handover Notes - user interface. All rules live in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readText, el, copyText, safeFileName } = OT;
  const $ = (id) => document.getElementById(id);
  const p2 = (n) => String(n).padStart(2, '0');
  const d0 = new Date();
  const todayIso = d0.getFullYear() + '-' + p2(d0.getMonth() + 1) + '-' + p2(d0.getDate());
  let parsing = false;
  HandoverCore.SHIFTS.forEach((x) => $('shift').appendChild(el('option', { value: x, text: x })));
  $('date').value = todayIso;
  const num = (id) => {
    const v = $(id).value.trim();
    return v === '' ? null : /^\d+$/.test(v) ? Number(v) : NaN;
  };

  function read() {
    const d = HandoverCore.create();
    d.team = $('team').value.trim();
    d.shift = $('shift').value;
    d.date = $('date').value;
    d.outgoing = $('outgoing').value.trim();
    d.incoming = $('incoming').value.trim();
    d.open = num('open');
    d.waiting = num('waiting');
    d.urgent = num('urgent');
    d.cases = HandoverCore.parseCases($('cases').value).cases;
    ['issues', 'watch', 'reminders', 'other'].forEach((k) => (d[k] = HandoverCore.parseList($(k).value)));
    return d;
  }

  function write(d) {
    parsing = true;
    ['team', 'shift', 'date', 'outgoing', 'incoming'].forEach((k) => ($(k).value = d[k]));
    ['open', 'waiting', 'urgent'].forEach((k) => ($(k).value = d[k] === null ? '' : d[k]));
    $('cases').value = HandoverCore.casesToText(d.cases);
    ['issues', 'watch', 'reminders', 'other'].forEach((k) => ($(k).value = d[k].join('\n')));
    parsing = false;
  }

  function render() {
    if (parsing) return;
    const d = read();
    const c = HandoverCore.check(d);
    ['problems', 'tips', 'case-errors'].forEach((id) => ($(id).textContent = ''));
    HandoverCore.parseCases($('cases').value).errors.forEach((e) => $('case-errors').appendChild(el('li', { text: e })));
    c.errors.forEach((e) => $('problems').appendChild(el('li', { text: e })));
    c.warnings.forEach((w) => $('tips').appendChild(el('li', { text: 'Check: ' + w })));
    $('preview').textContent = HandoverCore.toText(d);
  }

  ['team', 'shift', 'date', 'outgoing', 'incoming', 'open', 'waiting', 'urgent', 'cases', 'issues', 'watch', 'reminders', 'other'].forEach(
    (id) => $(id).addEventListener('input', render),
  );
  $('demo').addEventListener('click', () => {
    write(HandoverCore.sample(todayIso));
    render();
  });
  $('clear').addEventListener('click', () => {
    const d = HandoverCore.create();
    d.date = todayIso;
    write(d);
    render();
  });
  const guard = () => {
    const c = HandoverCore.check(read());
    if (c.errors.length) setStatus($('out-status'), c.errors.join(' '), 'error');
    return !c.errors.length;
  };
  $('copy').addEventListener('click', async () => {
    if (!guard()) return;
    const ok = await copyText(HandoverCore.toText(read()));
    setStatus(
      $('out-status'),
      ok === false ? 'Could not copy. Select the preview text and copy it yourself.' : 'Handover copied.',
      ok === false ? 'warn' : 'ok',
    );
  });
  $('pdf').addEventListener('click', async () => {
    if (!guard()) return;
    const d = read();
    try {
      downloadBlob(await HandoverCore.buildPdf(PDFLib, d), safeFileName('handover-' + d.date + '-' + d.shift) + '.pdf', 'application/pdf');
      setStatus($('out-status'), 'PDF ready.', 'ok');
    } catch (e) {
      setStatus($('out-status'), e.message, 'error');
    }
  });
  $('save').addEventListener('click', () =>
    downloadBlob(HandoverCore.serialize(read()), safeFileName('handover-' + ($('date').value || 'draft')) + '.json', 'application/json'),
  );
  $('open-file').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    try {
      write(HandoverCore.parse(await readText(f)));
      render();
      setStatus($('out-status'), 'Handover opened.', 'ok');
    } catch (e) {
      setStatus($('out-status'), e.message, 'error');
    }
  });
  render();
})();
