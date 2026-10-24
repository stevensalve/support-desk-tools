/* CSAT & NPS Calculator - user interface. All rules live in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readText, el } = OT;
  const $ = (id) => document.getElementById(id);
  let result = null;

  function dist(r, csat) {
    const parts = csat
      ? [
          [r.satisfied, 'good'],
          [r.neutral, 'mid'],
          [r.dissatisfied, 'bad'],
        ]
      : [
          [r.promoters, 'good'],
          [r.passives, 'mid'],
          [r.detractors, 'bad'],
        ];
    const d = el('div', {
      class: 'dist',
      role: 'img',
      'aria-label': csat
        ? r.satisfied + ' satisfied, ' + r.neutral + ' neutral, ' + r.dissatisfied + ' dissatisfied'
        : r.promoters + ' promoters, ' + r.passives + ' passives, ' + r.detractors + ' detractors',
    });
    parts.forEach((p) => {
      const s = el('span', { class: p[1] });
      s.style.width = (r.n ? (p[0] / r.n) * 100 : 0) + '%';
      d.appendChild(s);
    });
    return d;
  }

  function render() {
    const metric = $('metric').value;
    const csat = metric === 'csat';
    const r = SatCore.parse($('text').value, metric);
    setStatus($('status'), r.errors.slice(0, 5).join(' '), r.errors.length ? 'warn' : '');
    ['stats', 'narrative', 't-res'].forEach((id) => ($(id).textContent = ''));
    result = null;
    if (!r.periods.length) return;
    const t = $('target').value;
    result = SatCore.compute(r.periods, metric, t === '' ? null : Number(t));
    const o = result.overall;
    const stat = (label, v) => el('div', { class: 'stat' }, [el('b', { text: v }), label]);
    const unit = csat ? '%' : '';
    [
      stat(csat ? 'Overall CSAT' : 'Overall NPS', o.value + unit),
      stat('Margin of error', '+/- ' + o.margin),
      stat('Responses', String(o.n)),
      stat('Average score', String(o.average)),
    ].forEach((x) => $('stats').appendChild(x));
    const last = result.rows[result.rows.length - 1];
    const n = [];
    if (result.rows.length > 1)
      n.push(
        'Latest period (' +
          last.label +
          '): ' +
          last.value +
          unit +
          ', ' +
          (last.change > 0 ? 'up ' : last.change < 0 ? 'down ' : 'level, ') +
          (last.change ? Math.abs(last.change) + ' points' : '') +
          (last.clear ? ' - a clear change.' : ' - within normal noise, so do not read too much into it.'),
      );
    if (t !== '') n.push('Target ' + t + unit + ': latest period ' + (last.meetsTarget ? 'meets' : 'misses') + ' it.');
    if (last.small) n.push('The latest period has fewer than 30 responses, so treat it as indicative.');
    $('narrative').textContent = n.join(' ');
    const tbl = $('t-res');
    const heads = csat
      ? ['Period', 'Responses', 'CSAT %', '+/-', 'Average', 'Satisfied / neutral / dissatisfied', 'Change', 'Mix']
      : ['Period', 'Responses', 'NPS', '+/-', 'Average', 'Promoters / passives / detractors', 'Change', 'Mix'];
    tbl.appendChild(
      el('thead', {}, [
        el(
          'tr',
          {},
          heads.map((h) => el('th', { scope: 'col', text: h })),
        ),
      ]),
    );
    const body = el('tbody');
    result.rows.forEach((x) => {
      const trio = csat ? [x.satisfied, x.neutral, x.dissatisfied] : [x.promoters, x.passives, x.detractors];
      const ch = x.change === null ? '' : (x.change > 0 ? '+' : '') + x.change + (x.clear ? ' (clear)' : ' (noise)');
      body.appendChild(
        el('tr', {}, [
          el('td', { text: x.label + (x.small ? ' (small)' : '') }),
          el('td', { class: 'num', text: String(x.n) }),
          el('td', { class: 'num', text: x.value + unit }),
          el('td', { class: 'num', text: '+/- ' + x.margin }),
          el('td', { class: 'num', text: String(x.average) }),
          el('td', { text: trio.join(' / ') }),
          el('td', { class: x.change === null ? '' : x.change > 0 ? 'up' : x.change < 0 ? 'down' : '', text: ch }),
          el('td', {}, [dist(x, csat)]),
        ]),
      );
    });
    tbl.appendChild(body);
  }

  ['metric', 'target', 'text'].forEach((id) => $(id).addEventListener('input', render));
  $('demo').addEventListener('click', () => {
    $('text').value = SatCore.sample($('metric').value);
    render();
  });
  const need = () => {
    if (!result) setStatus($('out-status'), 'Enter some scores first.', 'error');
    return result;
  };
  $('csv').addEventListener('click', () => need() && downloadBlob(SatCore.toCsv(result), 'survey-results.csv', 'text/csv;charset=utf-8'));
  $('print').addEventListener('click', () => window.print());
  $('save').addEventListener('click', () =>
    downloadBlob(
      SatCore.serialize({
        metric: $('metric').value,
        text: $('text').value,
        target: $('target').value === '' ? '' : Number($('target').value),
      }),
      'survey-sheet.json',
      'application/json',
    ),
  );
  $('open-file').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    try {
      const s = SatCore.parseFile(await readText(f));
      $('metric').value = s.metric;
      $('text').value = s.text;
      $('target').value = s.target;
      render();
      setStatus($('out-status'), 'Sheet opened.', 'ok');
    } catch (e) {
      setStatus($('out-status'), e.message, 'error');
    }
  });
  render();
})();
