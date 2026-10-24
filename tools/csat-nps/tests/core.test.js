'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('../js/core.js');

test('parse: counts, raw scores, mixed, errors', () => {
  const r = s.parse('Oct | 10x2, 9 9 7\nNov | 5\nbad line\n | 9\nDec | 11\nJan | x\nFeb |', 'nps');
  assert.equal(r.periods.length, 2);
  assert.deepEqual(r.periods[0].counts, { 10: 2, 9: 2, 7: 1 });
  assert.equal(r.periods[0].n, 5);
  assert.equal(r.errors.length, 5);
  assert.match(r.errors[0], /Line 3: use "period \| scores"/);
  assert.match(r.errors[1], /Line 4: the period has no name/);
  assert.match(r.errors[2], /Line 5: score 11 is outside 0 to 10 for NPS/);
  assert.match(r.errors[3], /Line 6: "x" is not a score/);
  assert.match(r.errors[4], /Line 7: Feb has no responses/);
  assert.throws(() => s.parse('a | 1', 'x'), /Choose CSAT or NPS/);
});

test('parse: CSAT scale is 1 to 5 and "x" or "*" both work', () => {
  const r = s.parse('A | 5x3 4*2 1\nB | 0\nC | 6', 'csat');
  assert.equal(r.periods[0].n, 6);
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0], /score 0 is outside 1 to 5 for CSAT/);
});

test('CSAT figures', () => {
  const [p] = s.parse('A | 5x50, 4x30, 3x10, 2x6, 1x4', 'csat').periods;
  const f = s.figures(p, 'csat');
  assert.equal(f.n, 100);
  assert.equal(f.value, 80);
  assert.equal(f.satisfied, 80);
  assert.equal(f.neutral, 10);
  assert.equal(f.dissatisfied, 10);
  assert.equal(f.average, 4.2);
  assert.equal(f.margin, 7.8, '1.96 x sqrt(0.8 x 0.2 / 100) x 100');
  assert.equal(f.small, false);
});

test('NPS figures', () => {
  const [p] = s.parse('A | 10x40, 9x20, 8x15, 7x10, 6x10, 2x5', 'nps').periods;
  const f = s.figures(p, 'nps');
  assert.equal(f.n, 100);
  assert.deepEqual([f.promoters, f.passives, f.detractors], [60, 25, 15]);
  assert.equal(f.value, 45);
  assert.deepEqual([f.promoterPct, f.passivePct, f.detractorPct], [60, 25, 15]);
  assert.equal(f.margin, 14.5, '1.96 x sqrt((p + d - (p - d)^2) / n) x 100');
  const neg = s.figures(s.parse('A | 3x4 9', 'nps').periods[0], 'nps');
  assert.equal(neg.value, -60);
  assert.equal(neg.small, true);
});

test('compute: change vs previous period, clear-or-noise note, targets, overall', () => {
  const periods = s.parse(s.sample('csat'), 'csat').periods;
  const r = s.compute(periods, 'csat', 80);
  assert.equal(r.rows.length, 4);
  assert.equal(r.rows[0].change, null);
  assert.equal(r.rows[1].change, r1(r.rows[1].value - r.rows[0].value));
  assert.equal(typeof r.rows[1].clear, 'boolean');
  assert.equal(r.rows[3].small, false);
  assert.equal(r.rows[0].meetsTarget, r.rows[0].value >= 80);
  assert.equal(
    r.overall.n,
    periods.reduce((a, p) => a + p.n, 0),
  );
  assert.equal(s.compute(periods, 'csat', '').rows[0].meetsTarget, null);
  assert.equal(s.compute([], 'nps').overall, null);
  assert.throws(() => s.compute(periods, 'x'), /Choose CSAT or NPS/);
});
function r1(n) {
  return Math.round(n * 10) / 10;
}

test('a big drop is flagged as clear and a tiny wobble is not', () => {
  const big = s.compute(s.parse('A | 5x900, 1x100\nB | 5x500, 1x500', 'csat').periods, 'csat');
  assert.equal(big.rows[1].clear, true);
  const wobble = s.compute(s.parse('A | 5x9, 1x1\nB | 5x8, 1x2', 'csat').periods, 'csat');
  assert.equal(wobble.rows[1].clear, false);
  assert.equal(wobble.rows[1].small, true);
});

test('CSV', () => {
  const r = s.compute(s.parse('=Evil | 5x10, 1x2', 'csat').periods, 'csat');
  const csv = s.toCsv(r);
  assert.ok(csv.startsWith('﻿Period,Responses,CSAT %'));
  assert.ok(csv.indexOf("'=Evil,12,83.3") !== -1);
  assert.ok(
    s
      .toCsv(s.compute(s.parse(s.sample('nps'), 'nps').periods, 'nps'))
      .split('\r\n')[0]
      .indexOf('NPS') !== -1,
  );
});

test('save and open', () => {
  const back = s.parseFile(s.serialize({ metric: 'nps', text: s.sample('nps'), target: 40 }));
  assert.deepEqual([back.metric, back.target], ['nps', 40]);
  assert.equal(s.parseFile(s.serialize({ metric: 'weird', text: 'x', target: 'abc' })).metric, 'csat');
  assert.equal(s.parseFile(s.serialize({ metric: 'csat', text: 'x', target: 'abc' })).target, '');
  assert.throws(() => s.parseFile('x'), /not a saved survey sheet/);
  assert.throws(() => s.parseFile('{"app":"csat-nps","state":{}}'), /not a saved survey sheet/);
});
