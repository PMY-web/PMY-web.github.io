/* ASP8024 HE patchbay faceplate: every jack, legend and title placed on the panel's
   48-column grid (three blocks of 16), with the silkscreen text exactly as printed.
   Jack ids are the engine's ids from asp-model.js. */
(function (A) {
  'use strict';
  const range = A.range;
  const SLOT = 30, BLOCK = 16 * SLOT, GAP = 40, MARGIN = 36;
  const W = 2 * MARGIN + 3 * BLOCK + 2 * GAP;
  const x = (g, c) => MARGIN + g * (BLOCK + GAP) + c * SLOT + SLOT / 2; // jack centre
  const x0 = (g, c) => MARGIN + g * (BLOCK + GAP) + c * SLOT;          // left edge of a slot

  // tie lines and their studio labels come from the MGÜ patchbay plan table in asp-model.js
  const TIE = A.TIE;
  const BANDS = A.TIE_PLAN.map(([a, b, , text, cls]) => [a, b, text, cls]);

  const pos = {};
  const h = [];
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const px = v => Math.round(v * 10) / 10 + 'px';
  const el = (cls, l, t, w, hh, inner) => h.push('<div class="' + cls + '" style="left:' + px(l) + ';top:' + px(t) +
    (w !== undefined ? ';width:' + px(w) : '') + (hh !== undefined ? ';height:' + px(hh) : '') + '">' + (inner || '') + '</div>');

  function jack(id, g, c, y) {
    pos[id] = [x(g, c), y];
    h.push('<span class="jk" data-j="' + id + '" title="' + esc(A.J[id].long) + '" style="left:' + px(x(g, c) - 9) + ';top:' + px(y - 9) + '"><i></i></span>');
  }
  // rounded moulding around n jacks starting at column c
  const pill = (g, c, n, y, cls) => el('pill ' + (cls || ''), x0(g, c) + 2, y - 12, n * SLOT - 4, 24);
  // white legend panel (odd tape/channel rows, EFX returns, ext inputs, speakers)
  const panel = (g, c, n, y, hh) => el('wpanel', x0(g, c) - 1, y - 15, n * SLOT + 2, hh);
  // caption centred under one jack
  const cap = (g, c, y, text, cls) => el('cap ' + (cls || ''), x0(g, c) - 6, y, SLOT + 12, undefined, text);
  // caption across a span of columns
  const capSpan = (g, c, n, y, text, cls) => el('cap ' + (cls || ''), x0(g, c), y, n * SLOT, undefined, text);
  const arrow = (g, c, y, cls) => el('arr ' + (cls || ''), x0(g, c) + SLOT - 6, y, 12, undefined, '→');
  // "A → B" legend for a normalled pair at columns c, c+1
  function pairCap(g, c, y, a, b, cls) { cap(g, c, y, a, cls); arrow(g, c, y + (a.includes('<br>') ? 4 : 0), cls); cap(g, c + 1, y, b, cls); }
  // half-normal symbol: a bracket from the left jack to the right one, arrowhead on the right
  function halfNorm(g, c, y, cls, num, numCls) {
    const l = x(g, c), r = x(g, c + 1), w = r - l;
    h.push('<svg class="hn ' + (cls || '') + '" style="left:' + px(l) + ';top:' + px(y) + '" width="' + w + '" height="11" viewBox="0 0 ' + w + ' 11">' +
      '<path d="M0.5 0 V5 Q0.5 9 4.5 9 H' + (w - 4.5) + ' Q' + (w - 0.5) + ' 9 ' + (w - 0.5) + ' 5 V1.5" fill="none"/><path class="ah" d="M' + (w - 3.5) + ' 3.5 L' + (w - 0.5) + ' 0 L' + (w + 2.5) + ' 3.5"/></svg>');
    if (num !== undefined) el('badge ' + (numCls || ''), l + w / 2 - 6.5, y + 2, 13, 13, num);
  }
  function title(g, c, n, y, text, rule, cls) {
    el('ttl ' + (rule ? 'rule ' : '') + (cls || ''), x0(g, c) + 2, y, n * SLOT - 4, undefined, text);
  }

  // ---------------------------------------------------------------- multitrack bus outputs
  for (const g of [0, 1, 2]) {
    title(g, 0, 16, 10, 'MULTI-TRACK BUS OUTPUTS ' + (g * 8 + 1) + '-' + (g * 8 + 8), true);
    for (let k = 0; k < 8; k++) {
      const n = g * 8 + k + 1, c = 2 * k;
      pill(g, c, 2, 44); pill(g, c, 2, 100);
      jack('bus' + n + '.a', g, c, 44); jack('daw' + n + '.in', g, c + 1, 44);
      jack('bus' + n + '.b', g, c, 100); jack('recb' + n, g, c + 1, 100);
      pairCap(g, c, 58, 'OUT', 'REC A');
      el('mtnum' + (n > 12 ? ' box' : ''), x0(g, c) + SLOT - 8, 70, 16, 12, n);
      pairCap(g, c, 114, 'OUT', 'REC B');
    }
  }

  // ---------------------------------------------------------------- tape return + channel paths
  const PY = i => 174 + i * 52;
  for (let b = 0; b < 4; b++) {
    const g = b >> 1, c0 = (b & 1) * 8, white = !(b & 1);
    title(g, c0, 4, 140, 'TAPE RETURN PATH', true);
    title(g, c0 + 4, 4, 140, 'CHANNEL PATH', true);
    for (let i = 0; i < 6; i++) {
      const n = b + 1 + 4 * i, y = PY(i), inv = white ? 'inv' : '';
      if (white) panel(g, c0, 8, y, 50);
      pill(g, c0, 4, y); pill(g, c0 + 4, 4, y);
      jack('daw' + n + '.play', g, c0, y); jack('tape' + n + '.in', g, c0 + 1, y);
      jack('tape' + n + '.send', g, c0 + 2, y); jack('tape' + n + '.ret', g, c0 + 3, y);
      jack('dev' + n, g, c0 + 4, y); jack('line' + n + '.in', g, c0 + 5, y);
      jack('line' + n + '.send', g, c0 + 6, y); jack('line' + n + '.ret', g, c0 + 7, y);
      pairCap(g, c0, y + 13, 'PLAY<br>A', 'TAPE<br>IN', inv);
      cap(g, c0 + 2, y + 13, 'SEND', inv); cap(g, c0 + 3, y + 13, 'RET', inv);
      halfNorm(g, c0 + 2, y + 23, inv);
      pairCap(g, c0 + 4, y + 13, 'DEV<br>OUT', 'LINE<br>IN', inv);
      cap(g, c0 + 6, y + 13, 'SEND', inv); cap(g, c0 + 7, y + 13, 'RET', inv);
      halfNorm(g, c0 + 6, y + 23, inv);
      el('pnum ' + (white ? 'box' : ''), x0(g, c0 + 4) - 7, y + 15, 14, 13, n);
    }
  }

  // ---------------------------------------------------------------- right-hand block
  const R = 2;
  title(R, 0, 16, 140, 'SUB GROUP INSERTS &amp; OUTPUTS', true);
  for (let m = 1; m <= 8; m++) {
    const c = 2 * (m - 1);
    pill(R, c, 2, 174); pill(R, c, 2, 228);
    jack('sub' + m + '.send', R, c, 174); jack('sub' + m + '.ret', R, c + 1, 174);
    cap(R, c, 187, 'SEND'); cap(R, c + 1, 187, 'RET');
    halfNorm(R, c, 197, '', m, 'inv');
    jack('sub' + m + '.out', R, c, 228); jack('sub' + m + '.dev', R, c + 1, 228);
    pairCap(R, c, 242, 'OUT', 'DEV');
  }
  title(R, 0, 16, 258, 'STEREO EFX RETURNS', true);
  for (let e = 1; e <= 4; e++) {
    const c = 4 * (e - 1), y = 284;
    panel(R, c, 4, y, 41); pill(R, c, 4, y);
    jack('efx' + e + '.devL', R, c, y); jack('efx' + e + '.L', R, c + 1, y);
    jack('efx' + e + '.devR', R, c + 2, y); jack('efx' + e + '.R', R, c + 3, y);
    pairCap(R, c, y + 14, 'DEV', 'L', 'inv');
    el('efxbox', x0(R, c + 2) - 8, y + 14, 16, 10, 'EF' + e);
    pairCap(R, c + 2, y + 14, 'DEV', 'R', 'inv');
  }
  // mix insert / mix outputs
  capSpan(R, 0, 1, 318, 'L', 'ttl0'); capSpan(R, 0, 4, 318, 'MIX INSERT', 'ttl0'); capSpan(R, 3, 1, 318, 'R', 'ttl0');
  title(R, 4, 12, 316, 'MIX OUTPUTS', true);
  {
    const y = 344;
    pill(R, 0, 2, y); pill(R, 2, 2, y);
    jack('mix.sendL', R, 0, y); jack('mix.retL', R, 1, y); jack('mix.sendR', R, 2, y); jack('mix.retR', R, 3, y);
    for (const c of [0, 2]) { cap(R, c, y + 13, 'SEND'); cap(R, c + 1, y + 13, 'RET'); halfNorm(R, c, y + 23); }
    for (let k = 1; k <= 3; k++) {
      const c = 4 * k;
      pill(R, c, 4, y);
      jack('mixo' + k + '.L', R, c, y); jack('mixout' + k + '.L', R, c + 1, y);
      jack('mixo' + k + '.R', R, c + 2, y); jack('mixout' + k + '.R', R, c + 3, y);
      pairCap(R, c, y + 13, 'MIX L', k + 'L'); pairCap(R, c + 2, y + 13, 'MIX R', k + 'R');
    }
  }
  title(R, 4, 12, 372, 'EXT. INPUTS', true);
  {
    const y = 398;
    pill(R, 0, 4, y);
    range(1, 4).forEach(i => jack('par1.' + i, R, i - 1, y));
    el('parbr', x(R, 0), y + 15, x(R, 3) - x(R, 0), 7);
    capSpan(R, 0, 4, y + 25, 'PARALLELS', 'ttl0');
    for (let k = 1; k <= 3; k++) {
      const c = 4 * k;
      panel(R, c, 4, y, 41); pill(R, c, 4, y);
      jack('ext' + k + '.devL', R, c, y); jack('ext' + k + '.L', R, c + 1, y);
      jack('ext' + k + '.devR', R, c + 2, y); jack('ext' + k + '.R', R, c + 3, y);
      pairCap(R, c, y + 14, k + 'L', 'EXT ' + k + 'L', 'inv'); pairCap(R, c + 2, y + 14, k + 'R', 'EXT ' + k + 'R', 'inv');
    }
    capSpan(R, 4, 4, y + 25, 'STUDIO LOUDSPEAKER', 'ttl0'); capSpan(R, 8, 4, y + 25, 'ARTIST FOLDBACK 1', 'ttl0'); capSpan(R, 12, 4, y + 25, 'ARTIST FOLDBACK 2', 'ttl0');
  }
  {
    const y = 452;
    pill(R, 0, 4, y);
    range(1, 4).forEach(i => jack('par2.' + i, R, i - 1, y));
    el('parbr', x(R, 0), y + 15, x(R, 3) - x(R, 0), 7);
    capSpan(R, 0, 4, y + 25, 'PARALLELS', 'ttl0');
    const sets = [['sls.L', 'spk.slsL', 'sls.R', 'spk.slsR', 'L', 'R'], ['fb1.L', 'ha8.aL', 'fb1.R', 'ha8.aR', 'FB L', 'FB R'], ['fb2.L', 'ha8.bL', 'fb2.R', 'ha8.bR', 'FB L', 'FB R']];
    sets.forEach((s, i) => {
      const c = 4 * (i + 1);
      pill(R, c, 4, y);
      jack(s[0], R, c, y); jack(s[1], R, c + 1, y); jack(s[2], R, c + 2, y); jack(s[3], R, c + 3, y);
      pairCap(R, c, y + 13, s[4], 'AMP'); pairCap(R, c + 2, y + 13, s[5], 'AMP');
    });
  }
  {
    const y = 528;
    ['MAIN SPEAKERS', 'ALT SPEAKERS 1', 'ALT SPEAKERS 2', 'ALT SPEAKERS 3'].forEach((tt, i) => title(R, 4 * i, 4, 500, tt + ' <span class="spkic">◧</span>', true, 'ctr'));
    ['main', 'alt1', 'alt2', 'alt3'].forEach((o, i) => {
      const c = 4 * i;
      panel(R, c, 4, y, 41); pill(R, c, 4, y);
      jack('mon.' + o + '.L', R, c, y); jack('spk.' + o + 'L', R, c + 1, y);
      jack('mon.' + o + '.R', R, c + 2, y); jack('spk.' + o + 'R', R, c + 3, y);
      pairCap(R, c, y + 14, 'L', 'AMP', 'inv'); pairCap(R, c + 2, y + 14, 'R', 'AMP', 'inv');
    });
  }
  {
    title(R, 0, 4, 558, 'CUE SEND OUTPUTS', false, 'ctr');
    title(R, 4, 12, 558, 'AUX SEND OUTPUTS', true);
    const y = 586;
    pill(R, 0, 2, y); pill(R, 2, 2, y);
    jack('cueA.out', R, 0, y); jack('cueA.fx', R, 1, y); jack('cueB.out', R, 2, y); jack('cueB.fx', R, 3, y);
    pairCap(R, 0, y + 13, 'CUE A', 'FX IN'); pairCap(R, 2, y + 13, 'CUE B', 'FX IN');
    title(R, 0, 4, 612, 'LEVEL CONVERTORS', false, 'ctr');
    const y2 = 638;
    pill(R, 0, 2, y2); pill(R, 2, 2, y2);
    jack('lc1.in', R, 0, y2); jack('lc1.out', R, 1, y2); jack('lc2.in', R, 2, y2); jack('lc2.out', R, 3, y2);
    [['+4dB', '↑'], ['-10dB', '↓'], ['+4dB', '↑'], ['-10dB', '↓']].forEach(([t1, a], i) => cap(R, i, y2 + 13, t1 + '<br><b class="lca">' + a + '</b>'));
    for (let a = 1; a <= 12; a++) {
      const yy = a <= 6 ? y : y2, c = 4 + 2 * ((a - 1) % 6);
      pill(R, c, 2, yy);
      jack('aux' + a + '.out', R, c, yy); jack('aux' + a + '.fx', R, c + 1, yy);
      pairCap(R, c, yy + 13, String(a), 'FX IN');
    }
  }

  // ---------------------------------------------------------------- legend
  {
    const g = 1, y = 690;
    h.push('<svg class="hn legend" style="left:' + px(x0(g, 0) + 6) + ';top:' + px(y) + '" width="30" height="16" viewBox="0 0 30 16"><rect x="0.5" y="0.5" width="29" height="15" rx="2" fill="none"/>' +
      '<path d="M6 4 V8 Q6 11 9 11 H21 Q24 11 24 8 V5" fill="none"/><path class="ah" d="M22 6.5 L24 3.5 L26 6.5"/></svg>');
    el('legend', x0(g, 1) + 12, y - 1, 6 * SLOT, undefined, 'DENOTES A HALF-NORMAL CONNECTION<br>(RIGHT-HAND JACK BREAKS PAIR)');
    el('legend', x0(g, 8), y - 1, 8 * SLOT, undefined, 'ALL TIE LINES ARE THROUGH-WIRED AS DEFAULT<br>FIT LK JUMPERS INTERNALLY TO HALF-NORMAL');
  }

  // ---------------------------------------------------------------- tie lines
  const TY = r => 762 + r * 58;
  for (const g of [0, 1, 2]) {
    title(g, 0, 16, 728, 'TIE LINES', true);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 16; c++) {
        const tnum = r * 48 + g * 16 + c + 1, id = TIE[tnum];
        if (c % 2 === 0) pill(g, c, 2, TY(r));
        jack(id, g, c, TY(r));
        el('tbox', x(g, c) - 10, TY(r) + 14, 20, 13, tnum);
      }
    }
  }
  // studio labelling strip under the tie line numbers (toggle)
  for (const [a, b, text, cls] of BANDS) {
    const r = Math.floor((a - 1) / 48), g = Math.floor(((a - 1) % 48) / 16), c = (a - 1) % 16;
    el('sband ' + cls, x0(g, c) + 1, TY(r) + 29, (b - a + 1) * SLOT - 2, 11, text);
  }

  const H = TY(2) + 58;
  // zoomable sections of the faceplate
  const zone = (id, g, y0, y1, label) => ({ id, x: x0(g, 0) - 12, y: y0, w: BLOCK + 24, h: y1 - y0, label });
  const ZONES = [
    zone('mt1', 0, 0, 128, 'BUS 1-8'), zone('mt2', 1, 0, 128, 'BUS 9-16'), zone('mt3', 2, 0, 128, 'BUS 17-24'),
    zone('pa1', 0, 130, 488, 'TAPE / CHANNEL 1·2·5·6…'), zone('pa2', 1, 130, 488, 'TAPE / CHANNEL 3·4·7·8…'),
    zone('rt1', 2, 130, 488, 'SUBGROUP · EFX · MIX · EXT · FOLDBACK'), zone('rt2', 2, 488, 680, 'SPEAKERS · CUE · AUX · LEVEL'),
    zone('ti1', 0, 718, H, 'TIE 1-16 · 49-64 · 97-112'), zone('ti2', 1, 718, H, 'TIE 17-32 · 65-80 · 113-128'), zone('ti3', 2, 718, H, 'TIE 33-48 · 81-96 · 129-144')
  ];
  // screws down both edges
  for (const yy of [40, 100, 230, 400, 560, 760, 880]) { el('screw', 8, yy - 6, 12, 12); el('screw', W - 20, yy - 6, 12, 12); }

  A.PB = { W, H, html: h.join(''), pos, zones: ZONES, tie: TIE };
})(window.ASP = window.ASP || {});
