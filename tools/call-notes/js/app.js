/* Call & Chat Notes - user interface. All rules live in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readText, el, copyText, safeFileName } = OT;
  const $ = (id) => document.getElementById(id);
  let parsing = false;

  const opts = (sel, items) => {
    sel.textContent = '';
    items.forEach((x) => sel.appendChild(el('option', { value: x, text: x })));
  };
  opts($('channel'), NotesCore.CHANNELS);
  opts($('reason'), NotesCore.REASONS);
  opts($('mood'), NotesCore.MOODS);
  opts($('outcome'), NotesCore.OUTCOMES);
  $('reason').value = 'Other';
  $('mood').value = 'Neutral';

  function read() {
    const f = NotesCore.parseFollowUps($('followups').value);
    return {
      note: {
        customer: $('customer').value.trim(),
        contact: $('contact').value.trim(),
        channel: $('channel').value,
        agent: $('agent').value.trim(),
        ticket: $('ticket').value.trim(),
        startedAt: $('started').value,
        minutes: Number($('minutes').value) || 0,
        reason: $('reason').value,
        issue: $('issue').value,
        actions: $('actions').value,
        outcome: $('outcome').value,
        followUps: f.followUps,
        mood: $('mood').value,
      },
      errors: f.errors,
    };
  }

  function write(n) {
    parsing = true;
    $('customer').value = n.customer;
    $('contact').value = n.contact;
    $('channel').value = n.channel;
    $('agent').value = n.agent;
    $('ticket').value = n.ticket;
    $('started').value = n.startedAt;
    $('minutes').value = n.minutes;
    $('reason').value = n.reason;
    $('issue').value = n.issue;
    $('actions').value = n.actions;
    $('outcome').value = n.outcome;
    $('mood').value = n.mood;
    $('followups').value = NotesCore.followUpsToText(n.followUps);
    parsing = false;
  }

  function render() {
    if (parsing) return;
    const r = read();
    setStatus($('status'), r.errors.join(' '), r.errors.length ? 'warn' : '');
    const probs = NotesCore.validate(r.note);
    const ul = $('problems');
    ul.textContent = '';
    probs.forEach((p) => ul.appendChild(el('li', { text: p })));
    const all = [r.note.customer, r.note.contact, r.note.issue, r.note.actions, NotesCore.followUpsToText(r.note.followUps)].join('\n');
    const found = NotesCore.findSensitive(all);
    const box = $('sens');
    box.hidden = !found.length;
    box.textContent = found.length
      ? 'Sensitive details found: ' +
        found.map((f) => f.kind + ' (' + f.sample + ')').join('; ') +
        '. ' +
        ($('mask').checked
          ? 'They are hidden in the summary below, but remove them from the notes too.'
          : 'Masking is OFF, so they will be copied as typed.')
      : '';
    $('preview').textContent = NotesCore.toText(r.note, { mask: $('mask').checked });
  }

  [
    'customer',
    'contact',
    'channel',
    'agent',
    'ticket',
    'started',
    'minutes',
    'reason',
    'mood',
    'issue',
    'actions',
    'outcome',
    'followups',
    'mask',
  ].forEach((id) => $(id).addEventListener('input', render));
  $('demo').addEventListener('click', () => {
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    write(NotesCore.sample(d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate())));
    render();
  });
  $('clear').addEventListener('click', () => {
    write(NotesCore.create());
    render();
  });
  $('copy').addEventListener('click', async () => {
    const ok = await copyText($('preview').textContent);
    setStatus(
      $('out-status'),
      ok === false ? 'Could not copy. Select the text and copy it yourself.' : 'Copied.',
      ok === false ? 'warn' : 'ok',
    );
  });
  $('save').addEventListener('click', () =>
    downloadBlob(
      NotesCore.serialize(read().note),
      safeFileName('note-' + ($('ticket').value || $('customer').value || 'draft')) + '.json',
      'application/json',
    ),
  );
  $('open-file').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    try {
      write(NotesCore.parse(await readText(f)));
      render();
      setStatus($('out-status'), 'Note opened.', 'ok');
    } catch (e) {
      setStatus($('out-status'), e.message, 'error');
    }
  });
  render();
})();
