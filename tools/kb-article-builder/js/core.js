/**
 * Knowledge Base Article Builder - core logic (pure).
 *
 * Article: { title, type, audience, product, summary, symptoms[], cause, steps: [{ text, note }], result, related[], tags[],
 *            author, updated (ISO), version, reviewMonths }
 * Step lines are typed as "step text | optional note". Includes plain-language checks and a reading-ease score.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.KbCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const TYPES = ['How-to', 'Troubleshooting', 'FAQ', 'Policy'];
  const AUDIENCES = ['Customer', 'Internal'];
  const MAX_ITEMS = 25;

  const create = () => ({
    title: '',
    type: 'How-to',
    audience: 'Customer',
    product: '',
    summary: '',
    symptoms: [],
    cause: '',
    steps: [],
    result: '',
    related: [],
    tags: [],
    author: '',
    updated: '',
    version: '1.0',
    reviewMonths: 6,
  });

  const clean = (l) => norm(l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, ''));

  /** One item per line; bullets and numbers removed. */
  function parseList(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map(clean)
      .filter(Boolean)
      .slice(0, MAX_ITEMS)
      .map((l) => l.slice(0, 300));
  }

  function parseSteps(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
      .filter(Boolean)
      .slice(0, MAX_ITEMS)
      .map((l) => {
        const p = l.split('|').map(norm);
        return { text: p[0].slice(0, 300), note: (p[1] || '').slice(0, 300) };
      })
      .filter((s) => s.text);
  }

  const stepsToText = (steps) => steps.map((s) => s.text + (s.note ? ' | ' + s.note : '')).join('\n');

  function parseTags(t) {
    return String(t || '')
      .split(/[,;]/)
      .map((x) => norm(x).toLowerCase().slice(0, 30))
      .filter((x, i, a) => x && a.indexOf(x) === i)
      .slice(0, 12);
  }

  function syllables(word) {
    const w = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!w) return 0;
    if (w.length <= 3) return 1;
    const m = w
      .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
      .replace(/^y/, '')
      .match(/[aeiouy]{1,2}/g);
    return Math.max(1, m ? m.length : 1);
  }

  /** Flesch reading ease (English). Higher is easier: 60-70 is plain English, below 30 is very hard. */
  function readability(text) {
    const t = String(text || '');
    const words = t.match(/[A-Za-z][A-Za-z'-]*/g) || [];
    if (words.length < 5) return null;
    const sentences = Math.max(1, (t.match(/[.!?]+(\s|$)/g) || []).length);
    const syl = words.reduce((a, w) => a + syllables(w), 0);
    const score = 206.835 - 1.015 * (words.length / sentences) - 84.6 * (syl / words.length);
    const s = Math.round(Math.max(0, Math.min(100, score)));
    return {
      score: s,
      words: words.length,
      sentences: sentences,
      label: s >= 70 ? 'Easy to read' : s >= 60 ? 'Plain English' : s >= 50 ? 'Fairly difficult' : s >= 30 ? 'Difficult' : 'Very difficult',
    };
  }

  const bodyText = (a) =>
    [a.summary, a.cause, a.result]
      .concat(
        a.symptoms,
        a.steps.map((s) => s.text + ' ' + s.note),
      )
      .join('. ');

  /** Problems that stop the article being useful (errors) and style hints (tips). Returns { errors, tips }. */
  function check(a) {
    const errors = [];
    const tips = [];
    const title = norm(a.title);
    if (!title) errors.push('Add a title.');
    if (TYPES.indexOf(a.type) === -1) errors.push('Choose an article type.');
    if (!norm(a.summary)) errors.push('Add a one-line summary so people know if this is the right article.');
    if (a.type !== 'FAQ' && a.type !== 'Policy' && !a.steps.length) errors.push('Add the steps.');
    if (a.type === 'Troubleshooting' && !a.symptoms.length)
      errors.push('A troubleshooting article needs the symptoms the reader will see.');
    if (a.type === 'FAQ' && !norm(a.result) && !a.steps.length) errors.push('Write the answer.');
    if (a.updated) {
      try {
        OT.parseIsoDate(a.updated);
      } catch (e) {
        errors.push('The updated date is not a real date.');
      }
    }
    if (title.length > 70) tips.push('The title is ' + title.length + ' characters; under 70 shows fully in search results.');
    if (
      title &&
      a.type === 'How-to' &&
      !/^(how to|add|allow|apply|cancel|change|check|clear|connect|create|delete|download|enable|export|find|fix|get|import|install|link|log|make|manage|pay|print|recover|register|remove|renew|reset|restore|retry|set|share|sign|track|turn|unlock|update|upgrade|use|verify|view)\b/i.test(
        title,
      )
    )
      tips.push('How-to titles read best when they start with an action, such as "Reset your password".');
    if (a.steps.length > 12) tips.push('There are ' + a.steps.length + ' steps. Consider splitting the article in two.');
    a.steps.forEach((s, i) => {
      if (s.text.length > 200) tips.push('Step ' + (i + 1) + ' is long. One action per step is easier to follow.');
      if (/\bclick here\b|\bhere\b\.?$/i.test(s.text))
        tips.push('Step ' + (i + 1) + ' says "click here". Name the button or link instead.');
      if (/ and then | then click .* then /i.test(s.text)) tips.push('Step ' + (i + 1) + ' seems to hold more than one action.');
    });
    if (a.type === 'Troubleshooting' && !norm(a.cause)) tips.push('Say what usually causes the problem.');
    if (a.steps.length && !norm(a.result)) tips.push('Say what the reader should see when it has worked.');
    if (!a.tags.length) tips.push('Add a few tags so the article can be found.');
    if (a.audience === 'Customer' && /\b(escalate|L2|tier ?[23]|backend|database|admin panel|internal)\b/i.test(bodyText(a)))
      tips.push('This is a customer article but mentions internal terms. Check the wording.');
    const r = readability(bodyText(a));
    if (r && r.score < 50)
      tips.push('Reading ease is ' + r.score + ' (' + r.label.toLowerCase() + '). Shorter sentences and simpler words will help.');
    return { errors: errors, tips: tips };
  }

  /** Date the article is due for review. */
  function reviewDate(a) {
    if (!a.updated || !a.reviewMonths) return '';
    const d = new Date(OT.parseIsoDate(a.updated));
    const t = d.getUTCFullYear() * 12 + d.getUTCMonth() + Number(a.reviewMonths);
    const y = Math.floor(t / 12);
    const m = t % 12;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last))).toISOString().slice(0, 10);
  }

  /** Markdown, ready for a help centre or wiki. */
  function toMarkdown(a) {
    const L = ['# ' + (norm(a.title) || 'Untitled'), ''];
    if (norm(a.summary)) L.push('_' + norm(a.summary) + '_', '');
    if (a.symptoms.length) {
      L.push('## What you may see', '');
      a.symptoms.forEach((s) => L.push('- ' + s));
      L.push('');
    }
    if (norm(a.cause)) L.push('## Why it happens', '', norm(a.cause), '');
    if (a.steps.length) {
      L.push(a.type === 'FAQ' ? '## Answer' : '## Steps', '');
      a.steps.forEach((s, i) => L.push(i + 1 + '. ' + s.text + (s.note ? '  \n   _' + s.note + '_' : '')));
      L.push('');
    }
    if (norm(a.result)) L.push(a.steps.length ? '## What you should see' : '## Answer', '', norm(a.result), '');
    if (a.related.length) {
      L.push('## Related articles', '');
      a.related.forEach((s) => L.push('- ' + s));
      L.push('');
    }
    const meta = [
      a.type,
      a.audience,
      norm(a.product),
      a.version ? 'v' + a.version : '',
      a.updated ? 'updated ' + OT.formatDate(a.updated, 'dmy') : '',
      norm(a.author) ? 'by ' + norm(a.author) : '',
    ].filter(Boolean);
    L.push('---', meta.join(' | '));
    if (a.tags.length) L.push('Tags: ' + a.tags.join(', '));
    return L.join('\n') + '\n';
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

  /** A4 PDF of the article with numbered steps. opts: { company } */
  async function buildPdf(PDFLib, a, opts) {
    const o = opts || {};
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const ital = await pdf.embedFont(StandardFonts.HelveticaOblique);
    pdf.setTitle(sanitize(a.title || 'Article'));
    pdf.setCreator('Support Desk Tools');
    const W = 595.28;
    const H = 841.89;
    const M = 52;
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
    const para = (s, size, f, x, width, lead, color) => {
      wrap(f || font, s, size, width || W - 2 * M).forEach((l) => {
        need(lead || size + 3);
        draw(l, x === undefined ? M : x, size, f, color);
        y -= lead || size + 4;
      });
    };
    const head = (s) => {
      y -= 8;
      need(40);
      draw(s, M, 12, bold);
      y -= 18;
    };
    if (o.company) {
      draw(o.company, M, 9, bold, grey);
      y -= 14;
    }
    para(a.title || 'Untitled', 21, bold, M, W - 2 * M, 26);
    para([a.type, a.audience, a.product].filter(Boolean).join('  |  '), 9, font, M, W - 2 * M, 14, grey);
    if (norm(a.summary)) {
      y -= 4;
      para(a.summary, 11, ital, M, W - 2 * M, 15);
    }
    if (a.symptoms.length) {
      head('What you may see');
      a.symptoms.forEach((s) => {
        const lines = wrap(font, s, 10.5, W - 2 * M - 16);
        need(lines.length * 14 + 4);
        page.drawCircle({ x: M + 4, y: y + 3.5, size: 1.7, color: ink });
        lines.forEach((l) => {
          draw(l, M + 16, 10.5);
          y -= 14;
        });
      });
    }
    if (norm(a.cause)) {
      head('Why it happens');
      para(a.cause, 10.5, font, M, W - 2 * M, 14);
    }
    if (a.steps.length) {
      head(a.type === 'FAQ' ? 'Answer' : 'Steps');
      a.steps.forEach((s, i) => {
        const lines = wrap(font, s.text, 10.5, W - 2 * M - 28);
        const notes = s.note ? wrap(ital, s.note, 9.5, W - 2 * M - 28) : [];
        need((lines.length + notes.length) * 14 + 10);
        page.drawCircle({ x: M + 8, y: y + 3.5, size: 8.5, color: rgb(0.88, 0.92, 0.98) });
        const num = String(i + 1);
        draw(num, M + 8 - bold.widthOfTextAtSize(num, 9) / 2, 9, bold);
        lines.forEach((l) => {
          draw(l, M + 28, 10.5);
          y -= 14;
        });
        notes.forEach((l) => {
          draw(l, M + 28, 9.5, ital, grey);
          y -= 13;
        });
        y -= 5;
      });
    }
    if (norm(a.result)) {
      head(a.steps.length ? 'What you should see' : 'Answer');
      para(a.result, 10.5, font, M, W - 2 * M, 14);
    }
    if (a.related.length) {
      head('Related articles');
      a.related.forEach((r) => para('- ' + r, 10.5, font, M, W - 2 * M, 14));
    }
    const foot = [
      a.version ? 'Version ' + a.version : '',
      a.updated ? 'Updated ' + OT.formatDate(a.updated, 'dmy') : '',
      reviewDate(a) ? 'Review by ' + OT.formatDate(reviewDate(a), 'dmy') : '',
      norm(a.author) ? 'Author ' + norm(a.author) : '',
    ]
      .filter(Boolean)
      .join('   ');
    pdf.getPages().forEach((p, i, all) =>
      p.drawText(sanitize(foot + (foot ? '   ' : '') + 'Page ' + (i + 1) + ' of ' + all.length), {
        x: M,
        y: 24,
        size: 7.5,
        font: font,
        color: grey,
      }),
    );
    return pdf.save();
  }

  function serialize(a) {
    return JSON.stringify({ app: 'kb-article-builder', version: 1, article: a }, null, 2);
  }

  function parse(text) {
    let d;
    try {
      d = JSON.parse(text);
    } catch (e) {
      throw new Error('That file is not a saved article.');
    }
    const s = d && d.app === 'kb-article-builder' ? d.article : null;
    if (!s || typeof s !== 'object') throw new Error('That file is not a saved article.');
    const a = create();
    ['title', 'product', 'author'].forEach((k) => (a[k] = norm(s[k]).slice(0, 120)));
    a.summary = norm(s.summary).slice(0, 300);
    a.cause = String(s.cause || '')
      .trim()
      .slice(0, 2000);
    a.result = String(s.result || '')
      .trim()
      .slice(0, 2000);
    a.type = TYPES.indexOf(s.type) !== -1 ? s.type : 'How-to';
    a.audience = AUDIENCES.indexOf(s.audience) !== -1 ? s.audience : 'Customer';
    a.version = norm(s.version).slice(0, 10) || '1.0';
    a.updated = OT.toIsoDate(s.updated) || '';
    a.reviewMonths = Number.isInteger(s.reviewMonths) && s.reviewMonths >= 0 && s.reviewMonths <= 60 ? s.reviewMonths : 6;
    ['symptoms', 'related'].forEach((k) => (a[k] = parseList(Array.isArray(s[k]) ? s[k].join('\n') : '')));
    a.steps = parseSteps(
      (Array.isArray(s.steps) ? s.steps : [])
        .map((x) => String((x && x.text) || '').replace(/[|\r\n]/g, ' ') + ' | ' + String((x && x.note) || '').replace(/[|\r\n]/g, ' '))
        .join('\n'),
    );
    a.tags = parseTags(Array.isArray(s.tags) ? s.tags.join(',') : '');
    return a;
  }

  function sample(today) {
    const a = create();
    a.title = 'Reset your account password';
    a.type = 'How-to';
    a.audience = 'Customer';
    a.product = 'Customer app';
    a.summary = 'Choose a new password if you have forgotten the old one or want to change it.';
    a.steps = parseSteps(
      [
        'Open the app and tap Log in.',
        'Tap Forgot password under the password box.',
        'Enter the email address you signed up with and tap Send link. | The link works for 30 minutes.',
        'Open the email and tap Reset password.',
        'Type a new password twice and tap Save.',
      ].join('\n'),
    );
    a.result = 'You are signed in and the app shows your home screen. You also get an email confirming the change.';
    a.related = ['Why am I not getting the reset email?', 'How to turn on two-step login'];
    a.tags = ['password', 'login', 'account'];
    a.author = 'Support team';
    a.updated = today;
    return a;
  }

  return {
    TYPES: TYPES,
    AUDIENCES: AUDIENCES,
    create: create,
    parseList: parseList,
    parseSteps: parseSteps,
    stepsToText: stepsToText,
    parseTags: parseTags,
    readability: readability,
    check: check,
    reviewDate: reviewDate,
    toMarkdown: toMarkdown,
    sanitize: sanitize,
    buildPdf: buildPdf,
    serialize: serialize,
    parse: parse,
    sample: sample,
  };
});
