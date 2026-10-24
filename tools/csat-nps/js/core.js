/**
 * CSAT & NPS Calculator - core logic (pure).
 *
 * Input, one period per line:  period | responses
 * Responses are scores separated by spaces or commas; "9x40" means forty responses of 9.
 *   Oct 2026 | 10x40, 9x30, 8x20, 7x10, 6x5, 3x4
 *   Nov 2026 | 5 5 4 3 5 4 1
 * CSAT uses scores 1-5; "satisfied" is 4 or 5. NPS uses scores 0-10: promoters 9-10, passives 7-8, detractors 0-6.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SatCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const METRICS = { csat: { name: 'CSAT', min: 1, max: 5 }, nps: { name: 'NPS', min: 0, max: 10 } };
  const MAX_PERIODS = 120;
  const MAX_COUNT = 10000000;
  const Z = 1.96;
  const r1 = (n) => Math.round(n * 10) / 10;

  /** Parse lines for a metric ('csat' or 'nps'). Returns { periods:[{ label, counts:{score:count}, n }], errors }. */
  function parse(text, metric) {
    const m = METRICS[metric];
    if (!m) throw new Error('Choose CSAT or NPS.');
    const periods = [];
    const errors = [];
    String(text || '')
      .split(/\r?\n/)
      .forEach((raw, i) => {
        const line = raw.trim();
        if (!line || line[0] === '#') return;
        const at = 'Line ' + (i + 1) + ': ';
        const bar = line.indexOf('|');
        if (bar === -1) return errors.push(at + 'use "period | scores", for example: Oct 2026 | 10x40, 9x30, 7x10.');
        const label = norm(line.slice(0, bar));
        if (!label) return errors.push(at + 'the period has no name.');
        const counts = {};
        let n = 0;
        let bad = '';
        line
          .slice(bar + 1)
          .split(/[\s,;]+/)
          .filter(Boolean)
          .forEach((tok) => {
            const t = /^(\d+)\s*[x*]\s*(\d+)$/i.exec(tok) || /^(\d+)()$/.exec(tok);
            if (!t) return (bad = '"' + tok + '" is not a score.');
            const score = Number(t[1]);
            const count = t[2] === '' ? 1 : Number(t[2]);
            if (score < m.min || score > m.max)
              return (bad = 'score ' + score + ' is outside ' + m.min + ' to ' + m.max + ' for ' + m.name + '.');
            if (count > MAX_COUNT) return (bad = 'a count is too large.');
            counts[score] = (counts[score] || 0) + count;
            n += count;
          });
        if (bad) return errors.push(at + bad);
        if (!n) return errors.push(at + label + ' has no responses.');
        if (periods.length >= MAX_PERIODS) return errors.length < 1 && errors.push('Only the first ' + MAX_PERIODS + ' periods are used.');
        periods.push({ label: label.slice(0, 40), counts: counts, n: n });
      });
    return { periods: periods, errors: errors };
  }

  const sum = (counts, lo, hi) => {
    let s = 0;
    for (let k = lo; k <= hi; k++) s += counts[k] || 0;
    return s;
  };

  /** Figures for one period. */
  function figures(p, metric) {
    const n = p.n;
    const avgNum = Object.keys(p.counts).reduce((a, k) => a + Number(k) * p.counts[k], 0);
    const base = { label: p.label, n: n, average: r1(avgNum / n), counts: p.counts, small: n < 30 };
    if (metric === 'csat') {
      const sat = sum(p.counts, 4, 5);
      const dis = sum(p.counts, 1, 2);
      const pr = sat / n;
      return Object.assign(base, {
        satisfied: sat,
        neutral: sum(p.counts, 3, 3),
        dissatisfied: dis,
        value: r1(pr * 100),
        margin: r1(Z * Math.sqrt((pr * (1 - pr)) / n) * 100),
      });
    }
    const pro = sum(p.counts, 9, 10);
    const pas = sum(p.counts, 7, 8);
    const det = sum(p.counts, 0, 6);
    const pp = pro / n;
    const dp = det / n;
    const variance = (pp + dp - Math.pow(pp - dp, 2)) / n;
    return Object.assign(base, {
      promoters: pro,
      passives: pas,
      detractors: det,
      promoterPct: r1(pp * 100),
      passivePct: r1((pas / n) * 100),
      detractorPct: r1(dp * 100),
      value: Math.round((pp - dp) * 100 * 10) / 10,
      margin: r1(Z * Math.sqrt(variance) * 100),
    });
  }

  /**
   * compute(periods, metric, target): each period's figures, change from the previous period with a note on whether it is bigger
   * than the combined margin of error, an overall row, and pass/fail against the target when given.
   */
  function compute(periods, metric, target) {
    if (!METRICS[metric]) throw new Error('Choose CSAT or NPS.');
    const rows = periods.map((p) => figures(p, metric));
    rows.forEach((r, i) => {
      r.change = null;
      r.clear = null;
      if (i > 0) {
        r.change = r1(r.value - rows[i - 1].value);
        r.clear = Math.abs(r.change) > Math.sqrt(r.margin * r.margin + rows[i - 1].margin * rows[i - 1].margin);
      }
      r.meetsTarget = target === null || target === undefined || target === '' ? null : r.value >= Number(target);
    });
    const merged = {};
    let n = 0;
    periods.forEach((p) => {
      Object.keys(p.counts).forEach((k) => (merged[k] = (merged[k] || 0) + p.counts[k]));
      n += p.n;
    });
    return {
      metric: metric,
      rows: rows,
      overall: n
        ? Object.assign(figures({ label: 'All periods', counts: merged, n: n }, metric), {
            meetsTarget:
              target === null || target === undefined || target === ''
                ? null
                : figures({ label: '', counts: merged, n: n }, metric).value >= Number(target),
          })
        : null,
    };
  }

  const cell = (v) => {
    const t = String(v === null || v === undefined ? '' : v);
    const safe = /^[=+@]/.test(t) || /^-[^0-9]/.test(t) ? "'" + t : t;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };

  function toCsv(result) {
    const csat = result.metric === 'csat';
    const head = csat
      ? [
          'Period',
          'Responses',
          'CSAT %',
          '+/- (95%)',
          'Average (1-5)',
          'Satisfied',
          'Neutral',
          'Dissatisfied',
          'Change (points)',
          'Change is clear',
        ]
      : [
          'Period',
          'Responses',
          'NPS',
          '+/- (95%)',
          'Average (0-10)',
          'Promoters',
          'Passives',
          'Detractors',
          'Change (points)',
          'Change is clear',
        ];
    const rows = result.rows
      .concat(result.overall ? [result.overall] : [])
      .map((r) => [
        r.label,
        r.n,
        r.value,
        r.margin,
        r.average,
        csat ? r.satisfied : r.promoters,
        csat ? r.neutral : r.passives,
        csat ? r.dissatisfied : r.detractors,
        r.change === undefined || r.change === null ? '' : r.change,
        r.clear === undefined || r.clear === null ? '' : r.clear ? 'Yes' : 'No',
      ]);
    return (
      '﻿' +
      [head]
        .concat(rows)
        .map((r) => r.map(cell).join(','))
        .join('\r\n')
    );
  }

  function serialize(state) {
    return JSON.stringify({ app: 'csat-nps', version: 1, state: state }, null, 2);
  }

  function parseFile(text) {
    let d;
    try {
      d = JSON.parse(text);
    } catch (e) {
      throw new Error('That file is not a saved survey sheet.');
    }
    const s = d && d.app === 'csat-nps' ? d.state : null;
    if (!s || typeof s.text !== 'string') throw new Error('That file is not a saved survey sheet.');
    const tgt = s.target === '' || s.target === null || s.target === undefined ? '' : Number(s.target);
    return { metric: s.metric === 'nps' ? 'nps' : 'csat', text: s.text.slice(0, 100000), target: tgt === '' || !isFinite(tgt) ? '' : tgt };
  }

  function sample(metric) {
    return metric === 'nps'
      ? [
          'Jul 2026 | 10x30, 9x25, 8x30, 7x25, 6x15, 5x10, 3x5',
          'Aug 2026 | 10x34, 9x28, 8x30, 7x22, 6x12, 5x8, 2x4',
          'Sep 2026 | 10x45, 9x32, 8x28, 7x20, 6x10, 4x6, 1x3',
          'Oct 2026 | 10x20, 9x15, 8x12, 7x8, 6x4, 3x2',
        ].join('\n')
      : [
          'Jul 2026 | 5x120, 4x90, 3x40, 2x20, 1x10',
          'Aug 2026 | 5x130, 4x95, 3x38, 2x15, 1x8',
          'Sep 2026 | 5x150, 4x100, 3x30, 2x12, 1x6',
          'Oct 2026 | 5x40, 4x30, 3x10, 2x4, 1x2',
        ].join('\n');
  }

  return {
    METRICS: METRICS,
    parse: parse,
    figures: figures,
    compute: compute,
    toCsv: toCsv,
    serialize: serialize,
    parseFile: parseFile,
    sample: sample,
  };
});
