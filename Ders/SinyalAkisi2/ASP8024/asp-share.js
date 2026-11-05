/* ASP8024 simulator — bug reports and setup sharing.
   A setup is shared as a compact code: only what differs from the default state,
   deflate-compressed and base64url-encoded. The same code works pasted into Import
   or as a link (#setup=...), so a report can be opened straight from the email. */
(function (A) {
  'use strict';
  const REPORT_TO = 'deren.karacan@mgu.edu.tr';
  const MAILTO_MAX = 1900; // longer mailto links get cut or refused by some mail apps
  const t = A.t;
  const $ = s => document.querySelector(s);

  // ---------------------------------------------------------------- diff against the default state
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  function diff(def, cur) {
    if (JSON.stringify(def) === JSON.stringify(cur)) return undefined;
    if (Array.isArray(def) && Array.isArray(cur) && def.length === cur.length) {
      const o = {};
      cur.forEach((v, i) => { const d = diff(def[i], v); if (d !== undefined) o[i] = d; });
      return { _a: o };
    }
    if (isObj(def) && isObj(cur)) {
      const o = {};
      for (const k of Object.keys(cur)) { const d = diff(def[k], cur[k]); if (d !== undefined) o[k] = d; }
      for (const k of Object.keys(def)) if (!(k in cur)) o[k] = null;
      return o;
    }
    return cur;
  }
  function patch(def, d) {
    if (isObj(d) && d._a && Array.isArray(def)) {
      const r = def.slice();
      for (const k of Object.keys(d._a)) r[k] = patch(def[k], d._a[k]);
      return r;
    }
    if (isObj(d) && isObj(def)) {
      const r = Object.assign({}, def);
      for (const k of Object.keys(d)) { if (d[k] === null && !(k in def && def[k] === null)) delete r[k]; else r[k] = patch(def[k], d[k]); }
      return r;
    }
    return d;
  }

  // ---------------------------------------------------------------- code <-> state
  const b64url = bytes => { let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64url = str => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
  A.encodeSetup = async function (S) {
    const json = new TextEncoder().encode(JSON.stringify(diff(A.defaultState(), S) || {}));
    if (typeof CompressionStream === 'function') return 'ASP1.' + b64url(await pipe(json, new CompressionStream('deflate-raw')));
    return 'ASP0.' + b64url(json);
  };
  A.decodeSetup = async function (code) {
    code = String(code).trim().replace(/^.*#setup=/, '').replace(/\s+/g, '');
    const [ver, body] = code.split('.');
    let bytes = unb64url(body || '');
    if (ver === 'ASP1') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    else if (ver !== 'ASP0') throw new Error('not a setup code');
    const s = patch(A.defaultState(), JSON.parse(new TextDecoder().decode(bytes)));
    if (!Array.isArray(s.ch) || s.ch.length !== A.N) throw new Error('bad setup');
    return A.upgrade(s);
  };
  const linkFor = code => location.origin + location.pathname + '#setup=' + code;

  // ---------------------------------------------------------------- report dialog
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall back below */ }
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }
  async function buildReport() {
    const U = A.U;
    const kind = ($('#repForm input[name=repKind]:checked') || {}).value || 'bug';
    const name = $('#repName').value.trim(), text = $('#repText').value.trim();
    const withSetup = $('#repSetup').checked;
    const exId = U.mode === 'ex' && A.EX ? A.EX.cur : '';
    const ex = exId && A.EXERCISES.find(e => e.id === exId);
    const subject = '[ASP8024] ' + t('rep.kind.' + kind) + (name ? ' — ' + name : '');
    const lines = [
      t('rep.mail.desc') + ':', text || '-', '',
      '---',
      t('rep.mail.mode') + ': ' + (ex ? t('mode.ex') + ' — ' + A.L(ex.group) + ' (' + exId + ')' : t('mode.sandbox')),
      t('rep.mail.view') + ': ' + U.view + ' · ' + A.lang,
      t('rep.mail.warn') + ': ' + ((U.R && U.R.warnings.length) ? $('#warnList').innerText.replace(/\n+/g, ' | ') : '-'),
      t('rep.mail.browser') + ': ' + navigator.userAgent,
      t('rep.mail.date') + ': ' + new Date().toISOString()
    ];
    let code = '';
    if (withSetup) {
      code = await A.encodeSetup(U.S);
      lines.push('', t('rep.mail.setup') + ':', linkFor(code));
    }
    return { subject, body: lines.join('\n'), code };
  }
  async function sendReport() {
    const r = await buildReport();
    let body = r.body;
    let url = 'mailto:' + REPORT_TO + '?subject=' + encodeURIComponent(r.subject) + '&body=' + encodeURIComponent(body);
    const note = $('#repNote');
    note.textContent = '';
    if (url.length > MAILTO_MAX && r.code) {
      // too long for a mail link: put the setup link on the clipboard and leave a marker in the mail
      body = body.replace(linkFor(r.code), t('rep.mail.paste'));
      url = 'mailto:' + REPORT_TO + '?subject=' + encodeURIComponent(r.subject) + '&body=' + encodeURIComponent(body);
      const ok = await copy(linkFor(r.code));
      note.textContent = ok ? t('rep.longCopied') : t('rep.longManual');
    }
    location.href = url;
  }
  async function copyReport() {
    const r = await buildReport();
    const ok = await copy(t('rep.to') + ': ' + REPORT_TO + '\n' + r.subject + '\n\n' + r.body);
    $('#repNote').textContent = ok ? t('rep.copied', REPORT_TO) : t('rep.longManual');
  }

  // ---------------------------------------------------------------- import dialog
  async function importCode() {
    const msg = $('#impNote');
    try {
      const s = await A.decodeSetup($('#impCode').value);
      A.U.loadState(s);
      $('#impDlg').close();
    } catch (e) { msg.textContent = t('imp.bad'); }
  }

  A.SHARE = {
    init() {
      $('#reportBtn').addEventListener('click', () => { $('#repNote').textContent = ''; $('#repDlg').showModal(); });
      $('#repSend').addEventListener('click', sendReport);
      $('#repCopy').addEventListener('click', copyReport);
      $('#importBtn').addEventListener('click', () => { $('#impNote').textContent = ''; $('#impCode').value = ''; $('#impDlg').showModal(); });
      $('#impLoad').addEventListener('click', importCode);
      $('#impFileBtn').addEventListener('click', () => $('#importFile').click());
      for (const d of document.querySelectorAll('dialog.dlg')) d.addEventListener('click', e => { if (e.target.matches('[data-close]')) d.close(); });
      $('#repTo').textContent = REPORT_TO;
      // a shared setup link: #setup=CODE
      if (/#setup=/.test(location.hash)) {
        A.decodeSetup(location.hash).then(s => {
          if (confirm(t('imp.fromLink'))) A.U.loadState(s);
          history.replaceState(null, '', location.pathname + location.search);
        }).catch(() => alert(t('imp.bad')));
      }
    }
  };
})(window.ASP = window.ASP || {});
