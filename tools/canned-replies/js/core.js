/**
 * Canned Reply Library - core logic (pure).
 *
 * Reply: { id, title, category, tags: [], body, used }
 * Placeholders in a body look like {name} or {order_id}; fill() replaces them with the values you type.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CannedCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const copy = (o) => JSON.parse(JSON.stringify(o));
  const MAX = 1000;
  const GSM =
    '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
  const GSM_EXT = '^{}\\[~]|€';

  const create = () => ({ nextId: 1, replies: [] });

  const parseTags = (t) =>
    (Array.isArray(t) ? t : String(t || '').split(/[,;]/))
      .map(norm)
      .filter(Boolean)
      .map((x) => x.toLowerCase().slice(0, 30))
      .filter((x, i, a) => a.indexOf(x) === i)
      .slice(0, 10);

  function add(state, r) {
    const title = norm(r.title);
    if (!title) throw new Error('Give the reply a title.');
    if (!String(r.body || '').trim()) throw new Error('Write the reply text.');
    if (state.replies.length >= MAX) throw new Error('The library is full (' + MAX + ' replies).');
    const s = copy(state);
    const item = {
      id: s.nextId++,
      title: title.slice(0, 80),
      category: norm(r.category).slice(0, 40) || 'General',
      tags: parseTags(r.tags),
      body: String(r.body).replace(/\r\n/g, '\n').trim().slice(0, 4000),
      used: 0,
    };
    s.replies.push(item);
    return { state: s, reply: item };
  }

  function update(state, id, patch) {
    const s = copy(state);
    const r = s.replies.find((x) => x.id === id);
    if (!r) throw new Error('No such reply.');
    if (patch.title !== undefined) {
      if (!norm(patch.title)) throw new Error('Give the reply a title.');
      r.title = norm(patch.title).slice(0, 80);
    }
    if (patch.body !== undefined) {
      if (!String(patch.body).trim()) throw new Error('Write the reply text.');
      r.body = String(patch.body).replace(/\r\n/g, '\n').trim().slice(0, 4000);
    }
    if (patch.category !== undefined) r.category = norm(patch.category).slice(0, 40) || 'General';
    if (patch.tags !== undefined) r.tags = parseTags(patch.tags);
    return s;
  }

  function remove(state, id) {
    const s = copy(state);
    s.replies = s.replies.filter((x) => x.id !== id);
    return s;
  }

  function markUsed(state, id) {
    const s = copy(state);
    const r = s.replies.find((x) => x.id === id);
    if (r) r.used++;
    return s;
  }

  /** Distinct placeholder names in order of first appearance. */
  function placeholders(body) {
    const out = [];
    String(body).replace(/\{([A-Za-z][A-Za-z0-9_ ]{0,30})\}/g, (m, n) => {
      const k = n.trim();
      if (out.indexOf(k) === -1) out.push(k);
      return m;
    });
    return out;
  }

  /** Replace {name}. Missing or empty values stay as [name] so they are easy to spot. */
  function fill(body, values) {
    const v = values || {};
    return String(body).replace(/\{([A-Za-z][A-Za-z0-9_ ]{0,30})\}/g, (m, n) => {
      const k = n.trim();
      return norm(v[k]) ? String(v[k]).trim() : '[' + k + ']';
    });
  }

  const missing = (body, values) => placeholders(body).filter((k) => !norm((values || {})[k]));

  /** Search title (x5), tags (x3), category (x2) and body (x1); every word must match somewhere. Ties keep most used first. */
  function search(state, query, category) {
    const words = norm(query).toLowerCase().split(' ').filter(Boolean);
    return state.replies
      .filter((r) => !category || r.category === category)
      .map((r) => {
        const t = r.title.toLowerCase();
        const g = r.tags.join(' ');
        const c = r.category.toLowerCase();
        const b = r.body.toLowerCase();
        let score = 0;
        for (const w of words) {
          const s =
            (t.indexOf(w) !== -1 ? 5 : 0) + (g.indexOf(w) !== -1 ? 3 : 0) + (c.indexOf(w) !== -1 ? 2 : 0) + (b.indexOf(w) !== -1 ? 1 : 0);
          if (!s) return null;
          score += s;
        }
        return { reply: r, score: score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || b.reply.used - a.reply.used || a.reply.title.localeCompare(b.reply.title))
      .map((x) => x.reply);
  }

  const categories = (state) => Array.from(new Set(state.replies.map((r) => r.category))).sort();

  /** SMS length: characters used, segments, and whether the text forces 70-character (Unicode) segments. */
  function sms(text) {
    const t = String(text);
    let units = 0;
    let unicode = false;
    for (const ch of t) {
      if (GSM.indexOf(ch) !== -1) units += 1;
      else if (GSM_EXT.indexOf(ch) !== -1) units += 2;
      else {
        unicode = true;
        break;
      }
    }
    if (unicode) {
      const n = Array.from(t).reduce((a, ch) => a + (ch.codePointAt(0) > 0xffff ? 2 : 1), 0);
      return { characters: n, segments: n === 0 ? 0 : n <= 70 ? 1 : Math.ceil(n / 67), unicode: true };
    }
    return { characters: units, segments: units === 0 ? 0 : units <= 160 ? 1 : Math.ceil(units / 153), unicode: false };
  }

  const cell = (v) => {
    const t = String(v === null || v === undefined ? '' : v);
    const safe = /^[=+@]/.test(t) || /^-[^0-9]/.test(t) ? "'" + t : t;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };

  function toCsv(state) {
    const rows = [['Title', 'Category', 'Tags', 'Reply', 'Times used']].concat(
      state.replies.map((r) => [r.title, r.category, r.tags.join('; '), r.body, r.used]),
    );
    return '\ufeff' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
  }

  /** Minimal CSV reader (quotes, doubled quotes, newlines inside quotes). */
  function readCsv(text) {
    const rows = [];
    let row = [];
    let f = '';
    let q = false;
    const t = String(text).replace(/^\ufeff/, '');
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) {
        if (c === '"' && t[i + 1] === '"') {
          f += '"';
          i++;
        } else if (c === '"') q = false;
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ',') {
        row.push(f);
        f = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && t[i + 1] === '\n') i++;
        row.push(f);
        f = '';
        if (row.some((x) => x !== '')) rows.push(row);
        row = [];
      } else f += c;
    }
    row.push(f);
    if (row.some((x) => x !== '')) rows.push(row);
    return rows;
  }

  /** Import replies from CSV text with columns Title, Category, Tags, Reply (extra columns ignored). Returns { state, added, skipped }. */
  function importCsv(state, text) {
    const rows = readCsv(text);
    if (!rows.length) throw new Error('That file is empty.');
    const head = rows[0].map((h) => norm(h).toLowerCase());
    const col = (names) => head.findIndex((h) => names.indexOf(h) !== -1);
    const ti = col(['title', 'name']);
    const bi = col(['reply', 'body', 'text', 'message']);
    if (ti === -1 || bi === -1) throw new Error('The first row must have the columns Title and Reply (Category and Tags are optional).');
    const ci = col(['category', 'group']);
    const gi = col(['tags', 'tag', 'keywords']);
    let s = state;
    let added = 0;
    let skipped = 0;
    rows.slice(1).forEach((r) => {
      try {
        s = add(s, { title: r[ti], body: r[bi], category: ci === -1 ? '' : r[ci], tags: gi === -1 ? '' : r[gi] }).state;
        added++;
      } catch (e) {
        skipped++;
      }
    });
    return { state: s, added: added, skipped: skipped };
  }

  function serialize(state) {
    return JSON.stringify({ app: 'canned-replies', version: 1, state: state }, null, 2);
  }

  function parse(text) {
    let d;
    try {
      d = JSON.parse(text);
    } catch (e) {
      throw new Error('That file is not a saved reply library.');
    }
    const st = d && d.app === 'canned-replies' ? d.state : null;
    if (!st || !Array.isArray(st.replies)) throw new Error('That file is not a saved reply library.');
    let s = create();
    st.replies.slice(0, MAX).forEach((r) => {
      try {
        s = add(s, r).state;
        const n = Number(r.used);
        s.replies[s.replies.length - 1].used = Number.isInteger(n) && n > 0 ? n : 0;
      } catch (e) {
        /* skip a damaged reply */
      }
    });
    return s;
  }

  function sample() {
    let s = create();
    const mk = (title, category, tags, body) => (s = add(s, { title: title, category: category, tags: tags, body: body }).state);
    mk(
      'Greeting',
      'Opening',
      'hello hi start',
      'Hi {name},\n\nThanks for contacting {company} support. My name is {agent} and I will be helping you today.',
    );
    mk(
      'Need more details',
      'Opening',
      'info details ask',
      'Hi {name},\n\nTo look into this quickly, could you please share your order number and a screenshot of what you see? Once I have these I will check right away.',
    );
    mk(
      'Apology for delay',
      'Delays',
      'sorry late delay slow',
      'Hi {name},\n\nI am sorry for the delay in getting back to you. I have checked order {order_id} and will update you by {date}. Thank you for your patience.',
    );
    mk(
      'Refund processed',
      'Refunds',
      'refund money paid back',
      'Hi {name},\n\nYour refund of Rs. {amount} for order {order_id} has been processed. It usually reaches your original payment method within 5 to 7 working days.',
    );
    mk(
      'Refund not eligible',
      'Refunds',
      'refund policy no',
      'Hi {name},\n\nI understand this is disappointing. Unfortunately order {order_id} is outside our refund window, so I am not able to refund it. I can offer {alternative} instead if that helps.',
    );
    mk(
      'Password reset',
      'Account',
      'password login reset locked',
      'Hi {name},\n\nPlease use the "Forgot password" link on the login page and we will send a reset link to your registered email. It stays valid for 30 minutes.',
    );
    mk(
      'Escalating internally',
      'Escalation',
      'escalate senior team',
      'Hi {name},\n\nI have escalated your case ({ticket_id}) to our {team} team. You will hear from them by {date}. I will keep an eye on it until it is resolved.',
    );
    mk(
      'Closing',
      'Closing',
      'close done resolved bye',
      'Hi {name},\n\nI am glad we could sort this out. If you need anything else, just reply to this message. Have a great day!\n\n{agent}\n{company} Support',
    );
    return s;
  }

  return {
    create: create,
    add: add,
    update: update,
    remove: remove,
    markUsed: markUsed,
    placeholders: placeholders,
    fill: fill,
    missing: missing,
    search: search,
    categories: categories,
    sms: sms,
    toCsv: toCsv,
    readCsv: readCsv,
    importCsv: importCsv,
    serialize: serialize,
    parse: parse,
    sample: sample,
  };
});
