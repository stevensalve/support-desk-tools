/**
 * Call & Chat Notes - core logic (pure).
 *
 * Note: { customer, contact, channel, agent, ticket, startedAt ('YYYY-MM-DDTHH:MM'), minutes, reason, issue, actions,
 *         outcome ('Resolved' | 'Follow-up needed' | 'Escalated' | 'Customer to act'), followUps: [{ what, due }], mood }
 * Includes a safety net: card numbers, Aadhaar-style numbers, PAN, OTP/CVV/PIN values are found and can be masked
 * before the notes are copied into a ticket.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.NotesCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const CHANNELS = ['Phone', 'Chat', 'WhatsApp', 'Email', 'Walk-in'];
  const OUTCOMES = ['Resolved', 'Follow-up needed', 'Escalated', 'Customer to act'];
  const MOODS = ['Happy', 'Neutral', 'Frustrated', 'Angry'];
  const REASONS = ['Billing', 'Refund', 'Delivery', 'Login or account', 'Product help', 'Complaint', 'Other'];

  const create = () => ({
    customer: '',
    contact: '',
    channel: 'Phone',
    agent: '',
    ticket: '',
    startedAt: '',
    minutes: 0,
    reason: 'Other',
    issue: '',
    actions: '',
    outcome: 'Resolved',
    followUps: [],
    mood: 'Neutral',
  });

  function luhn(digits) {
    let sum = 0;
    let alt = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let n = digits.charCodeAt(i) - 48;
      if (alt) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alt = !alt;
    }
    return sum % 10 === 0;
  }

  const RULES = [
    {
      kind: 'Card number',
      re: /\b(?:\d[ -]?){12,18}\d\b/g,
      test: (m) => {
        const d = m.replace(/\D/g, '');
        return d.length >= 13 && d.length <= 19 && luhn(d);
      },
      mask: (m) => {
        const d = m.replace(/\D/g, '');
        return 'XXXX-XXXX-XXXX-' + d.slice(-4);
      },
    },
    {
      kind: 'Aadhaar-style number',
      re: /\b[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}\b/g,
      test: (m) => m.replace(/\D/g, '').length === 12,
      mask: (m) => 'XXXX XXXX ' + m.replace(/\D/g, '').slice(-4),
    },
    { kind: 'PAN', re: /\b[A-Z]{5}\d{4}[A-Z]\b/g, test: () => true, mask: (m) => 'XXXXX' + m.slice(5, 9) + 'X' },
    {
      kind: 'OTP, CVV or PIN',
      re: /\b(otp|cvv|cvc|pin|password|passcode)(\W{0,5}(?:(?:is|was|are)\W{1,5})?)(\d{3,8})\b/gi,
      test: () => true,
      mask: (m, g) => g[0] + g[1] + '[hidden]',
    },
  ];

  /** List sensitive items found: [{ kind, sample (masked) }]. Each rule runs on the text left after earlier rules, so a card number is not also reported as an Aadhaar number. */
  function findSensitive(text) {
    const out = [];
    let t = String(text || '');
    RULES.forEach((r) => {
      t = t.replace(new RegExp(r.re.source, r.re.flags), (m, ...g) => {
        if (!r.test(m)) return m;
        const masked = r.mask(m, g.slice(0, -2));
        out.push({ kind: r.kind, sample: masked });
        return masked;
      });
    });
    return out;
  }

  /** Replace sensitive items with masked forms. */
  function mask(text) {
    let t = String(text || '');
    RULES.forEach((r) => {
      t = t.replace(new RegExp(r.re.source, r.re.flags), (m, ...g) => (r.test(m) ? r.mask(m, g.slice(0, -2)) : m));
    });
    return t;
  }

  /** Parse follow-up lines: "what | due date (optional)". Returns { followUps, errors }. */
  function parseFollowUps(text) {
    const out = [];
    const errors = [];
    String(text || '')
      .split(/\r?\n/)
      .forEach((l, i) => {
        const line = l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim();
        if (!line) return;
        const p = line.split('|').map(norm);
        if (!p[0]) return errors.push('Follow-up line ' + (i + 1) + ' has no text.');
        let due = '';
        if (p[1]) {
          due = OT.toIsoDate(p[1]);
          if (!due) return errors.push('Follow-up line ' + (i + 1) + ': "' + p[1] + '" is not a date.');
        }
        if (out.length < 10) out.push({ what: p[0].slice(0, 200), due: due });
      });
    return { followUps: out, errors: errors };
  }

  const followUpsToText = (list) => list.map((f) => f.what + (f.due ? ' | ' + f.due : '')).join('\n');

  /** Problems to fix before saving the notes to the ticket. */
  function validate(n) {
    const p = [];
    if (!norm(n.customer)) p.push('Add the customer name.');
    if (!norm(n.issue)) p.push('Describe the issue.');
    if (OUTCOMES.indexOf(n.outcome) === -1) p.push('Choose the outcome.');
    if (n.outcome === 'Resolved' && !norm(n.actions)) p.push('Say what you did to resolve it.');
    if ((n.outcome === 'Follow-up needed' || n.outcome === 'Customer to act') && !n.followUps.length)
      p.push('The outcome needs a follow-up: add who does what and by when.');
    if (n.outcome === 'Follow-up needed' && n.followUps.some((f) => !f.due)) p.push('Every follow-up should have a due date.');
    if (n.startedAt && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(n.startedAt)) p.push('The start time is not valid.');
    if (!(n.minutes >= 0 && n.minutes <= 600)) p.push('Duration must be 0 to 600 minutes.');
    return p;
  }

  /** Clean summary for pasting into the ticket. opts.mask hides sensitive numbers (default true). */
  function toText(n, opts) {
    const o = Object.assign({ mask: true }, opts);
    const m = (s) => (o.mask ? mask(s) : s);
    const when = n.startedAt ? OT.formatDate(n.startedAt.slice(0, 10), 'dmy') + ' ' + n.startedAt.slice(11) : '';
    const L = [];
    L.push(
      n.channel.toUpperCase() +
        ' NOTE' +
        (n.ticket ? ' - ' + n.ticket : '') +
        (when ? ' - ' + when : '') +
        (n.minutes ? ' (' + n.minutes + ' min)' : ''),
    );
    L.push(
      'Customer: ' +
        (norm(n.customer) || '-') +
        (norm(n.contact) ? ' (' + norm(n.contact) + ')' : '') +
        (n.agent ? '   Handled by: ' + norm(n.agent) : ''),
    );
    L.push('Reason: ' + n.reason + '   Mood: ' + n.mood);
    L.push('', 'Issue:', m(String(n.issue).trim() || '-'));
    if (String(n.actions).trim()) L.push('', 'What was done:', m(String(n.actions).trim()));
    L.push('', 'Outcome: ' + n.outcome);
    if (n.followUps.length) {
      L.push('', 'Next steps:');
      n.followUps.forEach((f) => L.push('- ' + m(f.what) + (f.due ? ' (by ' + OT.formatDate(f.due, 'dmy') + ')' : '')));
    }
    return L.join('\n');
  }

  function serialize(n) {
    return JSON.stringify({ app: 'call-notes', version: 1, note: n }, null, 2);
  }

  function parse(text) {
    let d;
    try {
      d = JSON.parse(text);
    } catch (e) {
      throw new Error('That file is not a saved note.');
    }
    const s = d && d.app === 'call-notes' ? d.note : null;
    if (!s || typeof s !== 'object') throw new Error('That file is not a saved note.');
    const n = create();
    ['customer', 'contact', 'agent', 'ticket'].forEach((k) => (n[k] = norm(s[k]).slice(0, 80)));
    n.issue = String(s.issue || '').slice(0, 4000);
    n.actions = String(s.actions || '').slice(0, 4000);
    n.channel = CHANNELS.indexOf(s.channel) !== -1 ? s.channel : 'Phone';
    n.outcome = OUTCOMES.indexOf(s.outcome) !== -1 ? s.outcome : 'Resolved';
    n.mood = MOODS.indexOf(s.mood) !== -1 ? s.mood : 'Neutral';
    n.reason = REASONS.indexOf(s.reason) !== -1 ? s.reason : 'Other';
    n.minutes = Number.isInteger(s.minutes) && s.minutes >= 0 && s.minutes <= 600 ? s.minutes : 0;
    n.startedAt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(s.startedAt)) ? s.startedAt : '';
    n.followUps = parseFollowUps(
      (Array.isArray(s.followUps) ? s.followUps : [])
        .map((f) => String((f && f.what) || '').replace(/[|\r\n]/g, ' ') + ' | ' + ((f && f.due) || ''))
        .join('\n'),
    ).followUps;
    return n;
  }

  function sample(today) {
    const n = create();
    n.customer = 'Rohit Mehta';
    n.contact = '98xxxxxx21';
    n.channel = 'Phone';
    n.agent = 'Asha';
    n.ticket = 'T-0412';
    n.startedAt = today + 'T11:20';
    n.minutes = 12;
    n.reason = 'Refund';
    n.mood = 'Frustrated';
    n.issue =
      'Refund of Rs. 2,499 promised on 11/10 has not reached the card. Customer read out card 4111 1111 1111 1111 to confirm which one.';
    n.actions = 'Checked refund status: it failed at the bank and was re-queued. Apologised and confirmed the new reference with finance.';
    n.outcome = 'Follow-up needed';
    n.followUps = [
      { what: 'Confirm refund credited and call the customer', due: OT.addDays(today, 3) },
      { what: 'Ask finance why the first refund failed', due: OT.addDays(today, 1) },
    ];
    return n;
  }

  return {
    CHANNELS: CHANNELS,
    OUTCOMES: OUTCOMES,
    MOODS: MOODS,
    REASONS: REASONS,
    create: create,
    findSensitive: findSensitive,
    mask: mask,
    parseFollowUps: parseFollowUps,
    followUpsToText: followUpsToText,
    validate: validate,
    toText: toText,
    serialize: serialize,
    parse: parse,
    sample: sample,
  };
});
