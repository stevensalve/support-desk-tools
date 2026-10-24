/* Knowledge Base Article Builder - user interface. All rules live in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readText, el, copyText, safeFileName } = OT;
  const $ = (id) => document.getElementById(id);
  const p2 = (n) => String(n).padStart(2, '0');
  const d0 = new Date();
  const todayIso = d0.getFullYear() + '-' + p2(d0.getMonth() + 1) + '-' + p2(d0.getDate());
  let parsing = false;
  const opts = (sel, items) => items.forEach((x) => sel.appendChild(el('option', { value: x, text: x })));
  opts($('type'), KbCore.TYPES);
  opts($('audience'), KbCore.AUDIENCES);
  $('updated').value = todayIso;

  function read() {
    return {
      title: $('title').value.trim(),
      type: $('type').value,
      audience: $('audience').value,
      product: $('product').value.trim(),
      summary: $('summary').value.trim(),
      symptoms: KbCore.parseList($('symptoms').value),
      cause: $('cause').value.trim(),
      steps: KbCore.parseSteps($('steps').value),
      result: $('result').value.trim(),
      related: KbCore.parseList($('related').value),
      tags: KbCore.parseTags($('tags').value),
      author: $('author').value.trim(),
      updated: $('updated').value,
      version: $('version').value.trim() || '1.0',
      reviewMonths: Number($('review').value) || 0,
    };
  }

  function write(a) {
    parsing = true;
    $('title').value = a.title;
    $('type').value = a.type;
    $('audience').value = a.audience;
    $('product').value = a.product;
    $('summary').value = a.summary;
    $('symptoms').value = a.symptoms.join('\n');
    $('cause').value = a.cause;
    $('steps').value = KbCore.stepsToText(a.steps);
    $('result').value = a.result;
    $('related').value = a.related.join('\n');
    $('tags').value = a.tags.join(', ');
    $('author').value = a.author;
    $('updated').value = a.updated;
    $('version').value = a.version;
    $('review').value = a.reviewMonths;
    parsing = false;
  }

  function render() {
    if (parsing) return;
    const a = read();
    const c = KbCore.check(a);
    const rd = KbCore.readability(
      [a.summary, a.cause, a.result]
        .concat(
          a.symptoms,
          a.steps.map((s) => s.text),
        )
        .join('. '),
    );
    $('read').textContent =
      (rd ? 'Reading ease ' + rd.score + ' (' + rd.label + '), ' + rd.words + ' words. ' : 'Add more text to see a reading-ease score. ') +
      (KbCore.reviewDate(a) ? 'Review by ' + OT.formatDate(KbCore.reviewDate(a), 'dmy') + '.' : '');
    ['problems', 'tips'].forEach((id) => ($(id).textContent = ''));
    c.errors.forEach((e) => $('problems').appendChild(el('li', { text: e })));
    c.tips.forEach((t) => $('tips').appendChild(el('li', { text: 'Tip: ' + t })));
    $('preview').textContent = KbCore.toMarkdown(a);
  }

  [
    'title',
    'type',
    'audience',
    'product',
    'summary',
    'symptoms',
    'cause',
    'steps',
    'result',
    'related',
    'tags',
    'author',
    'updated',
    'version',
    'review',
  ].forEach((id) => $(id).addEventListener('input', render));
  $('demo').addEventListener('click', () => {
    write(KbCore.sample(todayIso));
    render();
  });
  $('clear').addEventListener('click', () => {
    const a = KbCore.create();
    a.updated = todayIso;
    write(a);
    render();
  });
  const guard = () => {
    const c = KbCore.check(read());
    if (c.errors.length) setStatus($('out-status'), c.errors.join(' '), 'error');
    return !c.errors.length;
  };
  $('pdf').addEventListener('click', async () => {
    if (!guard()) return;
    const a = read();
    try {
      downloadBlob(
        await KbCore.buildPdf(PDFLib, a, { company: $('company').value.trim() }),
        safeFileName(a.title) + '.pdf',
        'application/pdf',
      );
      setStatus($('out-status'), 'PDF ready.', 'ok');
    } catch (e) {
      setStatus($('out-status'), e.message, 'error');
    }
  });
  $('md').addEventListener(
    'click',
    () => guard() && downloadBlob(KbCore.toMarkdown(read()), safeFileName($('title').value) + '.md', 'text/markdown;charset=utf-8'),
  );
  $('copy').addEventListener('click', async () => {
    const ok = await copyText(KbCore.toMarkdown(read()));
    setStatus(
      $('out-status'),
      ok === false ? 'Could not copy. Select the preview text and copy it yourself.' : 'Markdown copied.',
      ok === false ? 'warn' : 'ok',
    );
  });
  $('save').addEventListener('click', () =>
    downloadBlob(KbCore.serialize(read()), safeFileName($('title').value || 'article') + '.json', 'application/json'),
  );
  $('open-file').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    try {
      write(KbCore.parse(await readText(f)));
      render();
      setStatus($('out-status'), 'Article opened.', 'ok');
    } catch (e) {
      setStatus($('out-status'), e.message, 'error');
    }
  });
  render();
})();
