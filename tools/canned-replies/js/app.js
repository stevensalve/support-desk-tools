/* Canned Reply Library - user interface. All rules live in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readText, el, copyText } = OT;
  const $ = (id) => document.getElementById(id);
  let state = CannedCore.sample();
  let selected = null;
  let values = {};

  const current = () => state.replies.find((r) => r.id === selected) || null;

  function renderList() {
    const cats = CannedCore.categories(state);
    const prev = $('cat').value;
    $('cat').textContent = '';
    $('cat').appendChild(el('option', { value: '', text: 'All categories' }));
    cats.forEach((c) => $('cat').appendChild(el('option', { value: c, text: c })));
    $('cat').value = cats.indexOf(prev) !== -1 ? prev : '';
    $('cats').textContent = '';
    cats.forEach((c) => $('cats').appendChild(el('option', { value: c })));
    const found = CannedCore.search(state, $('q').value, $('cat').value);
    $('count').textContent = found.length + ' of ' + state.replies.length + ' replies';
    const ul = $('list');
    ul.textContent = '';
    found.forEach((r) => {
      const b = el('button', { type: 'button', 'aria-current': r.id === selected ? 'true' : 'false' }, [
        r.title,
        el('span', { class: 'hint', text: r.category + (r.used ? ' - used ' + r.used + 'x' : '') }),
      ]);
      b.addEventListener('click', () => select(r.id));
      ul.appendChild(el('li', {}, [b]));
    });
  }

  function select(id) {
    selected = id;
    const r = current();
    values = {};
    $('fields').textContent = '';
    if (r) {
      $('e-title').value = r.title;
      $('e-cat').value = r.category;
      $('e-tags').value = r.tags.join(', ');
      $('e-body').value = r.body;
      CannedCore.placeholders(r.body).forEach((p) => {
        const inp = el('input', { type: 'text', id: 'f-' + p.replace(/\W/g, '_'), 'aria-label': p });
        inp.addEventListener('input', () => {
          values[p] = inp.value;
          renderPreview();
        });
        $('fields').appendChild(el('div', {}, [el('label', { for: inp.id, text: p }), inp]));
      });
    }
    renderPreview();
    renderList();
    renderSms();
  }

  function renderPreview() {
    const r = current();
    $('rtitle').textContent = r ? r.title : 'Pick a reply';
    $('preview').textContent = r ? CannedCore.fill(r.body, values) : '';
    if (!r) return ($('meta').textContent = '');
    const m = CannedCore.missing(r.body, values);
    const s = CannedCore.sms($('preview').textContent);
    $('meta').textContent =
      (m.length ? 'Still to fill: ' + m.join(', ') + '. ' : 'All blanks filled. ') +
      s.characters +
      ' characters; as an SMS: ' +
      s.segments +
      (s.segments === 1 ? ' message' : ' messages') +
      (s.unicode ? ' (contains characters that shorten each SMS to 70)' : '') +
      '.';
  }

  function renderSms() {
    const s = CannedCore.sms($('e-body').value);
    $('e-sms').textContent = s.characters + ' characters (' + s.segments + ' SMS)';
  }

  $('q').addEventListener('input', renderList);
  $('cat').addEventListener('input', renderList);
  $('e-body').addEventListener('input', renderSms);
  $('copy').addEventListener('click', async () => {
    const r = current();
    if (!r) return setStatus($('use-status'), 'Pick a reply first.', 'error');
    const ok = await copyText($('preview').textContent);
    if (ok === false) return setStatus($('use-status'), 'Could not copy. Select the text and copy it yourself.', 'warn');
    state = CannedCore.markUsed(state, r.id);
    const m = CannedCore.missing(r.body, values);
    setStatus(
      $('use-status'),
      m.length ? 'Copied, but ' + m.join(', ') + ' still shows in square brackets.' : 'Copied.',
      m.length ? 'warn' : 'ok',
    );
    renderList();
  });

  const fromEditor = () => ({ title: $('e-title').value, category: $('e-cat').value, tags: $('e-tags').value, body: $('e-body').value });
  const edit = (fn, ok) => {
    try {
      fn();
      setStatus($('edit-status'), ok, 'ok');
    } catch (e) {
      setStatus($('edit-status'), e.message, 'error');
    }
  };
  $('e-add').addEventListener('click', () =>
    edit(() => {
      const r = CannedCore.add(state, fromEditor());
      state = r.state;
      select(r.reply.id);
    }, 'Added.'),
  );
  $('e-save').addEventListener('click', () =>
    edit(() => {
      if (!selected) throw new Error('Pick a reply to change first.');
      state = CannedCore.update(state, selected, fromEditor());
      select(selected);
    }, 'Saved.'),
  );
  $('e-del').addEventListener('click', () =>
    edit(() => {
      if (!selected) throw new Error('Pick a reply to delete first.');
      if (!window.confirm('Delete this reply?')) throw new Error('Not deleted.');
      state = CannedCore.remove(state, selected);
      select(null);
    }, 'Deleted.'),
  );

  $('save').addEventListener('click', () => downloadBlob(CannedCore.serialize(state), 'canned-replies.json', 'application/json'));
  $('csv').addEventListener('click', () => downloadBlob(CannedCore.toCsv(state), 'canned-replies.csv', 'text/csv;charset=utf-8'));
  $('open-file').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    try {
      state = CannedCore.parse(await readText(f));
      select(null);
      setStatus($('file-status'), 'Opened ' + state.replies.length + ' replies.', 'ok');
    } catch (e) {
      setStatus($('file-status'), e.message, 'error');
    }
  });
  $('import-file').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    try {
      const r = CannedCore.importCsv(state, await readText(f));
      state = r.state;
      renderList();
      setStatus(
        $('file-status'),
        'Imported ' + r.added + ' replies' + (r.skipped ? ', skipped ' + r.skipped + ' without a title or text' : '') + '.',
        r.skipped ? 'warn' : 'ok',
      );
    } catch (e) {
      setStatus($('file-status'), e.message, 'error');
    }
  });
  select(null);
})();
