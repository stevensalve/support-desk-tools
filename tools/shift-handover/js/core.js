/**
 * Shift Handover Notes - core logic (pure).
 *
 * Doc: { team, shift, date (ISO), outgoing, incoming, open, waiting, urgent (queue numbers or null),
 *        cases: [{ ref, customer, need, owner, due }], issues[], watch[], reminders[], other[] }
 * Case line: ref | customer | what is needed next | owner | due (time or date, free text)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.HandoverCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const SHIFTS = ['Morning', 'Afternoon', 'Evening', 'Night', 'Weekend'];
  const MAX = 30;

  const create = () => ({
    team: '',
    shift: 'Morning',
    date: '',
    outgoing: '',
    incoming: '',
    open: null,
    waiting: null,
    urgent: null,
    cases: [],
    issues: [],
    watch: [],
    reminders: [],
    other: [],
  });

  function parseList(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map((l) => norm(l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')))
      .filter(Boolean)
      .slice(0, MAX)
      .map((l) => l.slice(0, 300));
  }

  /** Parse case lines. Returns { cases, errors }. */
  function parseCases(text) {
    const cases = [];
    const errors = [];
    String(text || '')
      .split(/\r?\n/)
      .forEach((raw, i) => {
        const line = raw.trim();
        if (!line || line[0] === '#') return;
        const p = line.split('|').map(norm);
        if (!p[0]) return errors.push('Case line ' + (i + 1) + ' has no reference.');
        if (!p[2]) errors.push('Case line ' + (i + 1) + ' (' + p[0] + '): say what is needed next.');
        if (cases.length < MAX)
          cases.push({
            ref: p[0].slice(0, 30),
            customer: (p[1] || '').slice(0, 60),
            need: (p[2] || '').slice(0, 200),
            owner: (p[3] || '').slice(0, 40),
            due: (p[4] || '').slice(0, 40),
          });
      });
    return { cases: cases, errors: errors };
  }

  const casesToText = (cases) =>
    cases.map((c) => [c.ref, c.customer, c.need, c.owner, c.due].join(' | ').replace(/( \| )+$/, '')).join('\n');

  /** Problems to fix before handing over. Returns { errors, warnings }. */
  function check(d) {
    const errors = [];
    const warnings = [];
    if (!norm(d.outgoing)) errors.push('Add who is handing over.');
    if (!norm(d.incoming)) errors.push('Add who is taking over (or write "Next shift team").');
    if (!d.date) errors.push('Add the date.');
    else {
      try {
        OT.parseIsoDate(d.date);
      } catch (e) {
        errors.push('The date is not a real date.');
      }
    }
    [
      ['open', 'Open'],
      ['waiting', 'Waiting'],
      ['urgent', 'Urgent'],
    ].forEach((k) => {
      const v = d[k[0]];
      if (v !== null && v !== '' && v !== undefined && !(Number.isInteger(v) && v >= 0 && v <= 100000))
        errors.push(k[1] + ' count must be a whole number.');
    });
    if (Number.isInteger(d.urgent) && Number.isInteger(d.open) && d.urgent > d.open)
      warnings.push('Urgent (' + d.urgent + ') is higher than Open (' + d.open + '): check the numbers.');
    d.cases.forEach((c) => {
      if (!c.owner) warnings.push(c.ref + ' has no owner for the next shift.');
      if (!c.due) warnings.push(c.ref + ' has no due time.');
    });
    if (!d.cases.length && !d.issues.length && !d.watch.length && !d.reminders.length)
      warnings.push('Nothing to hand over yet: add cases, issues or reminders.');
    return { errors: errors, warnings: warnings };
  }

  const numLine = (d) => {
    const parts = [];
    if (Number.isInteger(d.open)) parts.push('Open ' + d.open);
    if (Number.isInteger(d.waiting)) parts.push('Waiting on customer ' + d.waiting);
    if (Number.isInteger(d.urgent)) parts.push('Urgent ' + d.urgent);
    return parts.join('   ');
  };

  /** Plain text for chat or e-mail. */
  function toText(d) {
    const L = [];
    L.push(
      'SHIFT HANDOVER' +
        (norm(d.team) ? ' - ' + norm(d.team) : '') +
        ' - ' +
        d.shift +
        (d.date ? ' - ' + OT.formatDate(d.date, 'dmy') : ''),
    );
    L.push('From ' + (norm(d.outgoing) || '-') + ' to ' + (norm(d.incoming) || '-'));
    if (numLine(d)) L.push('Queue: ' + numLine(d));
    if (d.cases.length) {
      L.push('', 'Cases to pick up:');
      d.cases.forEach((c) =>
        L.push(
          '- ' +
            c.ref +
            (c.customer ? ' (' + c.customer + ')' : '') +
            ': ' +
            c.need +
            (c.owner ? ' [' + c.owner + ']' : ' [no owner]') +
            (c.due ? ' by ' + c.due : ''),
        ),
      );
    }
    [
      ['Known issues', 'issues'],
      ['Keep an eye on', 'watch'],
      ['Reminders', 'reminders'],
      ['Other', 'other'],
    ].forEach((s) => {
      if (d[s[1]].length) {
        L.push('', s[0] + ':');
        d[s[1]].forEach((x) => L.push('- ' + x));
      }
    });
    return L.join('\n');
  }

  function sanitize(s) {
    return String(s)
      .replace(/₹/g, 'Rs.')
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[^ -~\u00a0-ÿ]/g, '?');
  }

  function wrap(font, text, size, width) {
    const out = [];
    String(text)
      .split(/\r?\n/)
      .forEach((para) => {
        let line = '';
        sanitize(para)
          .split(/\s+/)
          .forEach((w) => {
            if (!w) return;
            const t = line ? line + ' ' + w : w;
            if (font.widthOfTextAtSize(t, size) <= width) line = t;
            else {
              if (line) out.push(line);
              line = w;
            }
          });
        out.push(line);
      });
    return out;
  }

  /** A4 handover sheet with a sign-off line for each person. */
  async function buildPdf(PDFLib, d) {
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    pdf.setTitle(sanitize('Shift handover ' + (d.date || '')));
    pdf.setCreator('Support Desk Tools');
    const W = 595.28;
    const H = 841.89;
    const M = 42;
    const grey = rgb(0.45, 0.47, 0.52);
    const ink = rgb(0.1, 0.1, 0.12);
    let page = pdf.addPage([W, H]);
    let y = H - M;
    const need = (h) => {
      if (y < M + 24 + h) {
        page = pdf.addPage([W, H]);
        y = H - M;
      }
    };
    const draw = (s, x, size, f, color) => page.drawText(sanitize(s), { x: x, y: y, size: size, font: f || font, color: color || ink });
    const para = (s, size, f, x, width, lead) => {
      wrap(f || font, s, size, width || W - 2 * M).forEach((l) => {
        need(lead || size + 3);
        draw(l, x === undefined ? M : x, size, f);
        y -= lead || size + 4;
      });
    };
    para('Shift handover' + (norm(d.team) ? ' - ' + norm(d.team) : ''), 19, bold, M, W - 2 * M, 24);
    para(
      d.shift +
        (d.date ? '  |  ' + OT.formatDate(d.date, 'dmy') : '') +
        '  |  From ' +
        (norm(d.outgoing) || '-') +
        ' to ' +
        (norm(d.incoming) || '-'),
      10,
      font,
      M,
      W - 2 * M,
      16,
    );
    if (numLine(d)) {
      y -= 2;
      page.drawRectangle({ x: M, y: y - 8, width: W - 2 * M, height: 24, color: rgb(0.93, 0.94, 0.96) });
      draw('Queue:  ' + numLine(d), M + 8, 10.5, bold);
      y -= 30;
    }
    if (d.cases.length) {
      y -= 4;
      need(60);
      draw('Cases to pick up', M, 12, bold);
      y -= 8;
      const cx = [M + 4, M + 60, M + 164, M + 364, M + 424];
      page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 18, color: rgb(0.93, 0.94, 0.96) });
      y -= 1;
      ['Ref', 'Customer', 'What is needed next', 'Owner', 'Due'].forEach((h, i) => draw(h, cx[i], 8.5, bold));
      y -= 18;
      d.cases.forEach((c) => {
        const need2 = wrap(font, c.need, 9.5, 192);
        const cust = wrap(font, c.customer, 9.5, 98);
        const rows = Math.max(need2.length, cust.length, 1);
        need(rows * 12 + 8);
        const top = y;
        const put = (txt, x, w) =>
          wrap(font, txt, 9.5, w).forEach((l, k) => page.drawText(l, { x: x, y: top - k * 12, size: 9.5, font: font, color: ink }));
        put(c.ref, cx[0], 54);
        put(c.customer, cx[1], 98);
        put(c.need, cx[2], 192);
        put(c.owner || '(none)', cx[3], 56);
        put(c.due, cx[4], W - M - cx[4]);
        y = top - rows * 12 - 3;
        page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.25, color: rgb(0.85, 0.86, 0.88) });
      });
    }
    [
      ['Known issues', 'issues'],
      ['Keep an eye on', 'watch'],
      ['Reminders', 'reminders'],
      ['Other', 'other'],
    ].forEach((s) => {
      if (!d[s[1]].length) return;
      y -= 10;
      need(40);
      draw(s[0], M, 12, bold);
      y -= 16;
      d[s[1]].forEach((x) => {
        const lines = wrap(font, x, 10, W - 2 * M - 16);
        need(lines.length * 13 + 3);
        page.drawCircle({ x: M + 4, y: y + 3.5, size: 1.6, color: ink });
        lines.forEach((l) => {
          draw(l, M + 16, 10);
          y -= 13;
        });
        y -= 1;
      });
    });
    need(70);
    y -= 36;
    [
      ['Handed over by', d.outgoing],
      ['Taken over by', d.incoming],
    ].forEach((s, i) => {
      const x = M + i * 260;
      page.drawLine({ start: { x: x, y: y }, end: { x: x + 220, y: y }, thickness: 0.5, color: grey });
      page.drawText(sanitize(s[0] + (norm(s[1]) ? ': ' + norm(s[1]) : '')), { x: x, y: y - 11, size: 8, font: font, color: grey });
      page.drawText('Time:', { x: x, y: y - 23, size: 8, font: font, color: grey });
    });
    pdf
      .getPages()
      .forEach((p, i, all) =>
        p.drawText('Page ' + (i + 1) + ' of ' + all.length, { x: W - M - 50, y: 22, size: 7.5, font: font, color: grey }),
      );
    return pdf.save();
  }

  function serialize(d) {
    return JSON.stringify({ app: 'shift-handover', version: 1, handover: d }, null, 2);
  }

  function parse(text) {
    let j;
    try {
      j = JSON.parse(text);
    } catch (e) {
      throw new Error('That file is not a saved handover.');
    }
    const s = j && j.app === 'shift-handover' ? j.handover : null;
    if (!s || typeof s !== 'object') throw new Error('That file is not a saved handover.');
    const d = create();
    ['team', 'outgoing', 'incoming'].forEach((k) => (d[k] = norm(s[k]).slice(0, 60)));
    d.shift = SHIFTS.indexOf(s.shift) !== -1 ? s.shift : 'Morning';
    d.date = OT.toIsoDate(s.date) || '';
    ['open', 'waiting', 'urgent'].forEach((k) => (d[k] = Number.isInteger(s[k]) && s[k] >= 0 && s[k] <= 100000 ? s[k] : null));
    ['issues', 'watch', 'reminders', 'other'].forEach((k) => (d[k] = parseList(Array.isArray(s[k]) ? s[k].join('\n') : '')));
    d.cases = parseCases(
      (Array.isArray(s.cases) ? s.cases : [])
        .map((c) => ['ref', 'customer', 'need', 'owner', 'due'].map((f) => String((c && c[f]) || '').replace(/[|\r\n]/g, ' ')).join('|'))
        .join('\n'),
    ).cases;
    return d;
  }

  function sample(today) {
    const d = create();
    d.team = 'Customer support';
    d.shift = 'Evening';
    d.date = today;
    d.outgoing = 'Asha';
    d.incoming = 'Ravi';
    d.open = 38;
    d.waiting = 12;
    d.urgent = 3;
    d.cases = parseCases(
      [
        'T-0412 | Rohit Mehta | Check refund reached the card and call him back | Ravi | 11:00 tomorrow',
        'T-0420 | Neha Iyer | Waiting for engineering fix for the payment crash | Asha | Update by 10:00',
        'T-0433 | Sana Khan | Needs corrected invoice from finance | | Today 6 pm',
      ].join('\n'),
    ).cases;
    d.issues = parseList(
      'Payment gateway is slow after 5 pm; use the banner macro for affected customers\nWhatsApp templates are down; reply by email instead',
    );
    d.watch = parseList('Neha Iyer has threatened to cancel her annual plan\nBacklog of delivery complaints from the Pune warehouse');
    d.reminders = parseList('Team huddle at 10:00 tomorrow\nEnter call notes in the tickets before logging off');
    return d;
  }

  return {
    SHIFTS: SHIFTS,
    create: create,
    parseList: parseList,
    parseCases: parseCases,
    casesToText: casesToText,
    check: check,
    toText: toText,
    sanitize: sanitize,
    buildPdf: buildPdf,
    serialize: serialize,
    parse: parse,
    sample: sample,
  };
});
