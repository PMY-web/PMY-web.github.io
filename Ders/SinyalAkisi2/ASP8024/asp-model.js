/* ASP8024 Heritage Edition — state, patchbay map and signal engine.
   The engine works on "components": { src, lvl (dBu), chain: [tags], pol }.
   A tag records every stage a copy of a signal went through, so the UI can show
   the route and the exercises can check what was done to it. */
(function (A) {
  'use strict';

  const N = 24;
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  A.N = N;
  A.range = range;

  // ---------------------------------------------------------------- level curves
  const CURVES = {
    fader: [[0, -Infinity], [0.05, -60], [0.25, -30], [0.5, -10], [0.75, 0], [1, 10]],
    send: [[0, -Infinity], [0.05, -60], [0.4, -20], [0.75, -6], [1, 0]],
    osc: [[0, -Infinity], [0.05, -40], [0.5, 0], [1, 12]],
    tb: [[0, -Infinity], [0.05, 10], [1, 50]]
  };
  A.curve = function (name, p) {
    const pts = CURVES[name];
    if (p <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x0, y0] = pts[i - 1];
      if (p <= x1) {
        if (y0 === -Infinity) return y1 - (x1 - p) / (x1 - x0) * 30;
        return y0 + (p - x0) / (x1 - x0) * (y1 - y0);
      }
    }
    return pts[pts.length - 1][1];
  };
  // knob/fader position for a dB value (used to draw fader scales)
  A.invCurve = function (name, db) {
    const pts = CURVES[name];
    if (db === -Infinity) return 0;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      if (db > y1) continue;
      if (y0 === -Infinity) return Math.max(x0, x1 - (y1 - db) / 30 * (x1 - x0));
      return x0 + (db - y0) / (y1 - y0) * (x1 - x0);
    }
    return 1;
  };
  A.micGain = (p, line) => line ? -14 + p * 54 : 6 + p * 54;

  // ---------------------------------------------------------------- room gear
  A.DEVICES = {
    cond: { kind: 'src', mic: true, phantom: 'need', lvl: -42, name: { tr: 'Kondenser mikrofon', en: 'Condenser mic' }, short: 'COND' },
    dyn: { kind: 'src', mic: true, lvl: -54, name: { tr: 'Dinamik mikrofon', en: 'Dynamic mic' }, short: 'DYN' },
    ribbon: { kind: 'src', mic: true, phantom: 'harm', lvl: -60, name: { tr: 'Ribbon mikrofon', en: 'Ribbon mic' }, short: 'RIB' },
    synth: { kind: 'src', mic: false, lvl: 4, name: { tr: 'Synth (line +4)', en: 'Synth (line +4)' }, short: 'SYN' },
    spk: { kind: 'dst', name: { tr: 'Aktif hoparlör', en: 'Powered speaker' }, short: 'SPK' }
  };

  // KS01-03 have a mic box (XLR, hard-wired to the console mic inputs) and a line box (TRS,
  // normalled to LINE IN on the patchbay). Every room also has tie lines that appear on the patchbay.
  A.ROOMS = [
    { id: 'KS01', box: true, ch0: 1, xlr: 8, trs: 0 },
    { id: 'KS02', box: true, ch0: 9, xlr: 8, trs: 0 },
    { id: 'KS03', box: true, ch0: 17, xlr: 8, trs: 0 },
    { id: 'KS04', xlr: 16, trs: 8 },
    { id: 'KABIN01', label: 'KABİN 01', xlr: 6, trs: 2 },
    { id: 'KABIN02', label: 'KABİN 02', xlr: 6, trs: 2 },
    { id: 'ASMA01', label: 'ASMA 01', xlr: 8, trs: 8 }
  ];
  A.roomLabel = r => r.label || r.id;
  A.roomOfCh = n => A.ROOMS[Math.floor((n - 1) / 8)].id;
  A.boxIdx = n => ((n - 1) % 8) + 1;

  // ---------------------------------------------------------------- outboard
  A.OUTBOARD = [
    { id: 'hv', name: 'Millennia HV-3D', kind: 'pre', inLabel: 'MIC INPUTS', outLabel: 'LINE OUTPUTS', ch: 4 },
    { id: 'nv', name: 'Rupert Neve 5012', kind: 'pre', inLabel: 'MIC INPUTS', outLabel: 'LINE OUTPUTS', ch: 4 },
    { id: 'meq', name: 'Manley EQ', kind: 'eq', inLabel: 'INPUTS', outLabel: 'OUTPUTS', ch: 4 },
    { id: 'vm', name: 'Manley Variable Mu', kind: 'comp', inLabel: 'INPUTS', outLabel: 'OUTPUTS', ch: 4 },
    { id: 'tlc', name: 'Millennia TLC-2', kind: 'comp', inLabel: 'INPUTS', outLabel: 'OUTPUTS', ch: 4 }
  ];

  // ---------------------------------------------------------------- patchbay
  // role: src (signal comes out of the jack), dst (signal goes into equipment),
  // par (parallels), tie (room tie line, direction set by what is plugged in the room), inert.
  const J = {};
  const NORM = [];
  const LAYOUT = [];
  function jack(id, role, label, extra) { J[id] = Object.assign({ id, role, label }, extra || {}); return id; }
  function norm(s, d, half) { NORM.push({ s, d, half: !!half }); }

  // multitrack bus outputs
  const mt = [];
  for (const g of [[1, 8], [9, 16], [17, 24]]) {
    const cells = [];
    for (const n of range(g[0], g[1])) {
      const a = jack('bus' + n + '.a', 'src', 'OUT', { long: 'Bus ' + n + ' OUT (A)' });
      const d = jack('daw' + n + '.in', 'dst', 'DAW' + n, { long: 'DAW In ' + n + ' (REC A)' });
      const b = jack('bus' + n + '.b', 'src', 'OUT', { long: 'Bus ' + n + ' OUT (B)' });
      const r = jack('recb' + n, 'dst', 'REC B', { long: 'REC B ' + n });
      norm(a, d); norm(b, r);
      cells.push({ num: n, rows: [[a, d], [b, r]] });
    }
    mt.push({ title: 'MULTI-TRACK BUS OUTPUTS ' + g[0] + '-' + g[1], kind: 'mt', cells });
  }
  LAYOUT.push({ id: 'mt', blocks: mt });

  // tape return + channel path, in the same column order as the studio patchbay
  const paths = [];
  for (let b = 0; b < 4; b++) {
    const rows = [];
    for (let n = b + 1; n <= N; n += 4) {
      const room = A.roomOfCh(n), k = A.boxIdx(n);
      const p = jack('daw' + n + '.play', 'src', 'DAW ' + n, { long: 'DAW Out ' + n, cls: 'daw' });
      const ti = jack('tape' + n + '.in', 'dst', 'TAPE IN', { long: 'Ch ' + n + ' TAPE IN' });
      const ts = jack('tape' + n + '.send', 'src', 'SEND', { long: 'Ch ' + n + ' tape SEND' });
      const tr = jack('tape' + n + '.ret', 'dst', 'RET', { long: 'Ch ' + n + ' tape RET' });
      const dv = jack('dev' + n, 'src', room + ' TRS ' + k, { long: room + ' line ' + k + ' (DEV OUT ' + n + ')', cls: 'ks' });
      const li = jack('line' + n + '.in', 'dst', 'LINE IN', { long: 'Ch ' + n + ' LINE IN' });
      const ls = jack('line' + n + '.send', 'src', 'SEND', { long: 'Ch ' + n + ' line SEND' });
      const lr = jack('line' + n + '.ret', 'dst', 'RET', { long: 'Ch ' + n + ' line RET' });
      norm(p, ti); norm(ts, tr, true); norm(dv, li); norm(ls, lr, true);
      rows.push({ num: n, tape: [p, ti, ts, tr], chan: [dv, li, ls, lr] });
    }
    paths.push({ kind: 'paths', rows });
  }
  LAYOUT.push({ id: 'paths', blocks: paths });

  // right-hand side
  const right = [];
  right.push({
    title: 'SUB GROUP INSERTS & OUTPUTS', kind: 'cells', cells: range(1, 8).map(m => {
      const s = jack('sub' + m + '.send', 'src', 'SEND', { long: 'Subgroup ' + m + ' SEND' });
      const r = jack('sub' + m + '.ret', 'dst', 'RET', { long: 'Subgroup ' + m + ' RET' });
      const o = jack('sub' + m + '.out', 'src', 'OUT', { long: 'Subgroup ' + m + ' OUT' });
      const d = jack('sub' + m + '.dev', 'dst', 'DEV', { long: 'Subgroup ' + m + ' device' });
      norm(s, r, true); norm(o, d);
      return { num: m, rows: [[s, r], [o, d]] };
    })
  });
  right.push({
    title: 'STEREO EFX RETURNS', kind: 'cells', cells: range(1, 4).map(k => {
      const dl = jack('efx' + k + '.devL', 'src', 'DEV', { long: 'EFX ' + k + ' device L' });
      const l = jack('efx' + k + '.L', 'dst', 'L', { long: 'Stereo EFX ' + k + ' L' });
      const dr = jack('efx' + k + '.devR', 'src', 'DEV', { long: 'EFX ' + k + ' device R' });
      const r = jack('efx' + k + '.R', 'dst', 'R', { long: 'Stereo EFX ' + k + ' R' });
      norm(dl, l); norm(dr, r);
      return { num: 'EFX' + k, rows: [[dl, l, dr, r]] };
    })
  });
  {
    const sl = jack('mix.sendL', 'src', 'SEND', { long: 'Mix insert SEND L' });
    const rl = jack('mix.retL', 'dst', 'RET', { long: 'Mix insert RET L' });
    const sr = jack('mix.sendR', 'src', 'SEND', { long: 'Mix insert SEND R' });
    const rr = jack('mix.retR', 'dst', 'RET', { long: 'Mix insert RET R' });
    norm(sl, rl, true); norm(sr, rr, true);
    right.push({ title: 'MIX INSERT', kind: 'cells', cells: [{ num: 'L / R', rows: [[sl, rl, sr, rr]] }] });
  }
  right.push({
    title: 'MIX OUTPUT', kind: 'cells', cells: range(1, 3).map(k => {
      const ml = jack('mixo' + k + '.L', 'src', 'MIX L', { long: 'Mix L send ' + k });
      const ol = jack('mixout' + k + '.L', 'dst', k + 'L', { long: 'Mix Output ' + k + ' L' });
      const mr = jack('mixo' + k + '.R', 'src', 'MIX R', { long: 'Mix R send ' + k });
      const or = jack('mixout' + k + '.R', 'dst', k + 'R', { long: 'Mix Output ' + k + ' R' });
      norm(ml, ol); norm(mr, or);
      return { num: k, rows: [[ml, ol, mr, or]] };
    })
  });
  right.push({
    title: 'EXT. INPUTS', kind: 'cells', cells: range(1, 3).map(k => {
      const dl = jack('ext' + k + '.devL', 'src', k + 'L', { long: 'Ext ' + k + ' device L' });
      const l = jack('ext' + k + '.L', 'dst', 'EXT ' + k + 'L', { long: 'EXT ' + k + ' L input' });
      const dr = jack('ext' + k + '.devR', 'src', k + 'R', { long: 'Ext ' + k + ' device R' });
      const r = jack('ext' + k + '.R', 'dst', 'EXT ' + k + 'R', { long: 'EXT ' + k + ' R input' });
      norm(dl, l); norm(dr, r);
      return { num: k, rows: [[dl, l, dr, r]] };
    })
  });
  right.push({
    title: 'PARALLELS', kind: 'cells', cells: range(1, 2).map(g => ({
      num: 'P' + g, par: true,
      rows: [range(1, 4).map(i => jack('par' + g + '.' + i, 'par', String(i), { long: 'Parallel ' + g + '/' + i, grp: g }))]
    }))
  });
  {
    const pair = (title, sL, dL, sR, dR, labS, labL, labR, longS, longD) => {
      const a = jack(sL, 'src', labS + (labS ? ' ' : '') + 'L', { long: longS + ' L' });
      const b = jack(dL, 'dst', labL, { long: longD + ' L' });
      const c = jack(sR, 'src', labS + (labS ? ' ' : '') + 'R', { long: longS + ' R' });
      const d = jack(dR, 'dst', labR, { long: longD + ' R' });
      norm(a, b); norm(c, d);
      return { title, kind: 'cells', cells: [{ num: '', rows: [[a, b, c, d]] }] };
    };
    right.push(pair('STUDIO LOUDSPEAKER', 'sls.L', 'spk.slsL', 'sls.R', 'spk.slsR', '', 'A8XL', 'A8XR', 'Studio loudspeaker send', 'Studio loudspeaker amp'));
    right.push(pair('ARTIST FOLDBACK 1', 'fb1.L', 'ha6.L', 'fb1.R', 'ha6.R', 'FB', 'HA6L', 'HA6R', 'Artist foldback 1', 'Headamp 6 input'));
    right.push(pair('ARTIST FOLDBACK 2', 'fb2.L', 'ha4.L', 'fb2.R', 'ha4.R', 'FB', 'HA4L', 'HA4R', 'Artist foldback 2', 'Headamp 4 input'));
    right.push(pair('MAIN SPEAKERS', 'mon.main.L', 'spk.mainL', 'mon.main.R', 'spk.mainR', '', 'FP01L', 'FP01R', 'Main speaker send', 'Main speakers (FP01)'));
    right.push(pair('ALT SPEAKERS 1', 'mon.alt1.L', 'spk.alt1L', 'mon.alt1.R', 'spk.alt1R', '', 'A8XL', 'A8XR', 'Alt 1 send', 'Alt speakers 1 (A8X)'));
    right.push(pair('ALT SPEAKERS 2', 'mon.alt2.L', 'spk.alt2L', 'mon.alt2.R', 'spk.alt2R', '', 'AURL', 'AURR', 'Alt 2 send', 'Alt speakers 2 (AUR)'));
    right.push(pair('ALT SPEAKERS 3', 'mon.alt3.L', 'spk.alt3L', 'mon.alt3.R', 'spk.alt3R', '', 'AMP', 'AMP', 'Alt 3 send', 'Alt 3 / C-R headphone amp'));
  }
  {
    const a = jack('cueA.out', 'src', 'CUE A', { long: 'Cue A send' });
    const b = jack('cueA.fx', 'dst', 'FX IN', { long: 'Cue A rear output' });
    const c = jack('cueB.out', 'src', 'CUE B', { long: 'Cue B send' });
    const d = jack('cueB.fx', 'dst', 'FX IN', { long: 'Cue B rear output' });
    norm(a, b); norm(c, d);
    right.push({ title: 'CUE SEND OUTPUTS', kind: 'cells', cells: [{ num: '', rows: [[a, b, c, d]] }] });
  }
  right.push({
    title: 'LEVEL CONVERTORS', kind: 'cells', cells: range(1, 2).map(k => ({
      num: 'LC' + k,
      rows: [[jack('lc' + k + '.in', 'dst', '+4dB ↑', { long: 'Level converter ' + k + ' in (+4 dBu)' }),
        jack('lc' + k + '.out', 'src', '-10dB ↓', { long: 'Level converter ' + k + ' out (-10)' })]]
    }))
  });
  right.push({
    title: 'AUX SEND OUTPUTS', kind: 'cells', cells: range(1, 12).map(n => {
      const a = jack('aux' + n + '.out', 'src', String(n), { long: 'Aux ' + n + ' send' });
      const b = jack('aux' + n + '.fx', 'dst', 'FX IN', { long: 'Aux ' + n + ' rear output' });
      norm(a, b);
      return { num: n, rows: [[a, b]] };
    })
  });
  LAYOUT.push({ id: 'right', blocks: right });

  // tie lines, outboard, headamps, spares
  const ties = [];
  for (const r of A.ROOMS) {
    const rl = A.roomLabel(r);
    if (r.xlr) ties.push({ title: rl + ' XLR TIE LINE', kind: 'tie', cls: 'xlr', jacks: range(1, r.xlr).map(k => jack('tie:' + r.id + ':x' + k, 'tie', String(k), { long: rl + ' XLR tie ' + k, room: r.id })) });
    if (r.trs) ties.push({ title: rl + ' TRS TIE LINE', kind: 'tie', cls: 'trs', jacks: range(1, r.trs).map(k => jack('tie:' + r.id + ':t' + k, 'tie', String(k), { long: rl + ' TRS tie ' + k, room: r.id })) });
  }
  const gear = [];
  for (const o of A.OUTBOARD) {
    gear.push({ title: o.name.toUpperCase() + ' ' + o.inLabel, kind: 'tie', cls: o.kind === 'pre' ? 'pre' : 'ob', jacks: range(1, o.ch).map(i => jack(o.id + '.in' + i, 'dst', String(i), { long: o.name + ' in ' + i })) });
    gear.push({ title: o.name.toUpperCase() + ' ' + o.outLabel, kind: 'tie', cls: 'ob', jacks: range(1, o.ch).map(i => jack(o.id + '.out' + i, 'src', String(i), { long: o.name + ' out ' + i })) });
  }
  gear.push({ title: 'HEADAMP 6 OUTPUTS', kind: 'tie', cls: 'ha', jacks: range(1, 6).map(i => jack('ha6.o' + i, 'src', String(i), { long: 'Headamp 6 output ' + i })) });
  gear.push({ title: 'HEADAMP 4 OUTPUTS', kind: 'tie', cls: 'ha', jacks: range(1, 4).map(i => jack('ha4.o' + i, 'src', String(i), { long: 'Headamp 4 output ' + i })) });
  gear.push({ title: 'SPARE', kind: 'tie', cls: 'spare', jacks: [69, 70, 71, 72, 73, 74, 117, 118, 119, 120, 121, 122, 123, 124].map(i => jack('spare' + i, 'inert', String(i), { long: 'Spare ' + i })) });
  LAYOUT.push({ id: 'ties', title: 'TIE LINES', blocks: ties });
  LAYOUT.push({ id: 'gear', title: 'OUTBOARD / HEADAMP', blocks: gear });

  A.J = J;
  A.NORM = NORM;
  A.NORM_D = new Map(NORM.map(n => [n.d, n]));
  A.NORM_S = new Map(NORM.map(n => [n.s, n]));
  A.LAYOUT = LAYOUT;
  // jacks in the artist foldback section of the patchbay (used by exercise 4)
  A.FB_SECTION = ['fb1.L', 'fb1.R', 'ha6.L', 'ha6.R', 'fb2.L', 'fb2.R', 'ha4.L', 'ha4.R'];

  // ---------------------------------------------------------------- default state
  function defCh() {
    return {
      line: false, gain: 0.4, phantom: false, pol: false, hpf: false, micIns: false,
      tapeIns: false, trim: 0, flip: false, mflip: false,
      shelfIn: false, shelfSF: false, air: false, lo100: false, hfg: 0, lfg: 0,
      peqIn: false, peqSF: false, hmff: 0.5, hmfq: 0.5, hmfg: 0, lmff: 0.5, lmfq: 0.5, lmfg: 0,
      bus: Array(12).fill(false), busShift: false, fpan: false, busLF: false,
      // sends come in pairs (aux 1-2, 3-4, 5-6, cue A-B), each pair with its own SF / PRE / shift buttons
      aux: Array(6).fill(0), cueA: 0, cueB: 0,
      auxShift: Array(3).fill(false), sendSF: Array(4).fill(false), sendPre: Array(4).fill(false),
      name: '',
      sf: { copy: false, pan: 0, mix: false, fader: 0.75, solo: false, cut: false },
      lf: { pan: 0, mix: false, fader: 0.75, solo: false, cut: false }
    };
  }
  A.defaultState = function () {
    return {
      v: 1,
      ch: range(1, N).map(defCh),
      busTrim: Array(N).fill(0),
      auxTrim: Array(12).fill(1), auxSolo: Array(12).fill(false),
      cueTrim: { A: 1, B: 1 }, cueSolo: { A: false, B: false },
      sub: range(1, 8).map(() => ({ pan: 0, mix: false, solo: false, cut: false, fader: 0.75 })),
      efx: range(1, 4).map(() => ({ route: Array(6).fill(false), shift: false, fb: 0, trim: 0, level: 0.75, mix: false, solo: false, cut: false })),
      her: { dfa: false, retro: false, bump: false, lift: false },
      bcomp: false, master: 1,
      osc: { f1: false, f2: false, level: 0.5, on: false, bus: false, mix: false },
      solo: { level: 0, front: false, sip: false, pfl: false },
      mon: { mix: true, ext1: false, ext2: false, ext3: false, out: 'main', mono: false, cutL: false, cutR: false, dim: false, level: 0.7 },
      sls: { src: 'croom', level: 0.7, on: false },
      fb: [{ L: 'cueA', R: 'cueA', level: 0.7, solo: false }, { L: 'cueB', R: 'cueB', level: 0.7, solo: false }],
      tb: { talk: false, level: 0.5, slate: false, studio: false, artist: false },
      ob: {
        hv: range(1, 4).map(() => ({ gain: 40, ph: false })),
        nv: range(1, 4).map(() => ({ gain: 40, ph: false }))
      },
      daw: range(1, N).map(() => ({ content: null })),
      plug: {}, nextDev: 1,
      names: {},
      cables: []
    };
  };
  A.oscFreq = o => ['40 Hz', '1 kHz', '10 kHz', '15 kHz'][(o.f1 ? 1 : 0) + (o.f2 ? 2 : 0)];

  // ---------------------------------------------------------------- component helpers
  const FLOOR = -100;
  const C = (src, lvl, chain, pol) => ({ src, lvl, chain: chain || [], pol: !!pol });
  function gain(cs, db) {
    if (db === -Infinity) return [];
    if (!db) return cs;
    return cs.map(c => Object.assign({}, c, { lvl: c.lvl + db })).filter(c => c.lvl > FLOOR);
  }
  function tag(cs, t) { return cs.map(c => c.chain.length > 60 ? c : Object.assign({}, c, { chain: c.chain.concat(t) })); }
  function flip(cs) { return cs.map(c => Object.assign({}, c, { pol: !c.pol })); }
  const keyOf = c => c.src + '|' + (c.pol ? 1 : 0) + '|' + c.chain.join('>');
  function sum() {
    const m = new Map();
    for (const l of arguments) for (const c of l) {
      const k = keyOf(c), e = m.get(k);
      if (e) e.lvl = 20 * Math.log10(Math.pow(10, e.lvl / 20) + Math.pow(10, c.lvl / 20));
      else m.set(k, Object.assign({}, c));
    }
    return [...m.values()];
  }
  function lvlOf(cs) {
    if (!cs || !cs.length) return -Infinity;
    let p = 0;
    for (const c of cs) p += Math.pow(10, c.lvl / 10);
    return 10 * Math.log10(p);
  }
  const panGains = p => { const a = (p + 1) * Math.PI / 4; return [20 * Math.log10(Math.max(Math.cos(a), 1e-6)), 20 * Math.log10(Math.max(Math.sin(a), 1e-6))]; };
  A.C = C; A.gain = gain; A.tag = tag; A.sum = sum; A.lvlOf = lvlOf; A.keyOf = keyOf;

  // channel number that a tag belongs to (for "one mixer channel only" checks)
  A.chanOfTag = t => { const m = /^(?:pre:c|tape|lf|sf|ret:[lt]|hpf|eq:c):(\d+)$/.exec(t); return m ? +m[1] : 0; };

  // ---------------------------------------------------------------- engine
  function core(S, powered) {
    const memo = new Map(), stack = new Set();
    const loops = new Set();
    const cableAt = new Map();
    S.cables.forEach((c, i) => { cableAt.set(c.a, { i, other: c.b }); cableAt.set(c.b, { i, other: c.a }); });

    function node(key, fn) {
      if (memo.has(key)) return memo.get(key);
      if (stack.has(key)) { loops.add(key); return []; }
      stack.add(key);
      const v = fn();
      stack.delete(key);
      memo.set(key, v);
      return v;
    }

    // --- room devices
    function devOut(point) {
      const p = S.plug[point];
      if (!p) return [];
      const d = A.DEVICES[p.type];
      if (d.kind !== 'src') return [];
      if (d.phantom === 'need' && powered && !powered.has(p.id)) return [];
      return [C(p.id, d.lvl)];
    }
    function tieRole(id) {
      const p = S.plug[id];
      if (!p) return 'dst';
      return A.DEVICES[p.type].kind === 'src' ? 'src' : 'dst';
    }

    // --- jack plumbing
    function roleOf(id) {
      const j = J[id];
      if (!j) return 'inert';
      return j.role === 'tie' ? tieRole(id) : j.role;
    }
    // what a jack offers to a patch cable plugged into it
    function jackOut(id) {
      return node('jo:' + id, () => {
        const j = J[id];
        if (!j) return [];
        if (j.role === 'par') return parSum(j.grp);
        const r = roleOf(id);
        if (r !== 'src') return [];
        if (j.role === 'tie') return tag(devOut(id), 'tie:' + id.slice(4));
        return srcOut(id);
      });
    }
    // what equipment behind a dst jack receives
    function jackIn(id) {
      return node('ji:' + id, () => {
        const c = cableAt.get(id);
        if (c) {
          const o = c.other;
          if (J[o] && J[o].role === 'par') return tag(parSum(J[o].grp), 'par:' + J[o].grp);
          return tag(jackOut(o), 'pc:' + o);
        }
        const n = A.NORM_D.get(id);
        if (n) {
          if (cableAt.has(n.s) && !n.half) return [];
          return srcOut(n.s);
        }
        return [];
      });
    }
    function parSum(g) {
      return node('par:' + g, () => {
        const lists = [];
        for (const i of range(1, 4)) {
          const c = cableAt.get('par' + g + '.' + i);
          if (!c) continue;
          const o = c.other;
          if (J[o] && J[o].role === 'par') { if (J[o].grp !== g) lists.push(parSum(J[o].grp)); continue; }
          if (roleOf(o) === 'src') lists.push(tag(jackOut(o), 'pc:' + o));
        }
        return sum.apply(null, lists);
      });
    }
    const isPatched = id => cableAt.has(id);

    // --- channel strip
    const ch = n => S.ch[n - 1];
    function micIn(n) { return devOut('mb:' + A.roomOfCh(n) + ':' + A.boxIdx(n)); }
    function pre(n) {
      return node('pre' + n, () => {
        const c = ch(n);
        let s = c.line ? jackIn('line' + n + '.in') : micIn(n);
        s = tag(gain(s, A.micGain(c.gain, c.line)), 'pre:c:' + n);
        if (c.pol) s = flip(s);
        if (c.hpf) s = tag(s, 'hpf:' + n);
        return s;
      });
    }
    function chPath(n) {
      return node('chp' + n, () => {
        if (!ch(n).micIns) return pre(n);
        const r = jackIn('line' + n + '.ret');
        return isPatched('line' + n + '.ret') ? tag(r, 'ret:l:' + n) : r;
      });
    }
    function tapeSig(n) { return node('tape' + n, () => tag(gain(jackIn('tape' + n + '.in'), ch(n).trim), 'tape:' + n)); }
    function tapePath(n) {
      return node('tpp' + n, () => {
        if (!ch(n).tapeIns) return tapeSig(n);
        const r = jackIn('tape' + n + '.ret');
        return isPatched('tape' + n + '.ret') ? tag(r, 'ret:t:' + n) : r;
      });
    }
    function eq(s, n, sfSide) {
      const c = ch(n);
      const on = (c.shelfIn && c.shelfSF === sfSide) || (c.peqIn && c.peqSF === sfSide);
      return on ? tag(s, 'eq:c:' + n) : s;
    }
    function lfPre(n) { return node('lfpre' + n, () => tag(eq(ch(n).flip ? chPath(n) : tapePath(n), n, false), 'lf:' + n)); }
    function lfPost(n) { return node('lfpost' + n, () => { const f = ch(n).lf; return f.cut ? [] : gain(lfPre(n), A.curve('fader', f.fader)); }); }
    function sfPre(n) {
      return node('sfpre' + n, () => {
        const c = ch(n);
        const base = c.sf.copy ? lfPost(n) : (c.flip ? tapePath(n) : chPath(n));
        return tag(eq(base, n, true), 'sf:' + n);
      });
    }
    function sfPost(n) { return node('sfpost' + n, () => { const f = ch(n).sf; return f.cut ? [] : gain(sfPre(n), A.curve('fader', f.fader)); }); }

    // --- solo
    const soloList = [];
    for (let n = 1; n <= N; n++) {
      if (ch(n).sf.solo) soloList.push({ kind: 'sf', n });
      if (ch(n).lf.solo) soloList.push({ kind: 'lf', n });
    }
    S.sub.forEach((s, i) => { if (s.solo) soloList.push({ kind: 'sub', n: i + 1 }); });
    S.efx.forEach((s, i) => { if (s.solo) soloList.push({ kind: 'efx', n: i + 1 }); });
    S.auxSolo.forEach((s, i) => { if (s) soloList.push({ kind: 'aux', n: i + 1 }); });
    if (S.cueSolo.A) soloList.push({ kind: 'cue', n: 'A' });
    if (S.cueSolo.B) soloList.push({ kind: 'cue', n: 'B' });
    const soloActive = soloList.length > 0;
    const sip = soloActive && S.solo.sip;
    const soloed = (kind, n) => soloList.some(s => s.kind === kind && s.n === n);
    const mixAllowed = (kind, n) => !sip || soloed(kind, n);

    // --- multitrack buses
    function oscSig() {
      if (!S.osc.on) return [];
      return [C('osc', A.curve('osc', S.osc.level))];
    }
    function tbSig() {
      if (!S.tb.talk) return [];
      return tag(gain([C('tb', -40)], A.curve('tb', S.tb.level)), 'tb');
    }
    function busSum(b) {
      return node('bus' + b, () => {
        const lists = [];
        for (let n = 1; n <= N; n++) {
          const c = ch(n);
          if (!c.bus.some(Boolean)) continue;
          const src = c.busLF ? lfPost(n) : sfPost(n);
          if (!src.length) continue;
          const [pl, pr] = panGains(c.busLF ? c.lf.pan : c.sf.pan);
          c.bus.forEach((on, i) => {
            if (!on || i + 1 + (c.busShift ? 12 : 0) !== b) return;
            lists.push(c.fpan ? gain(src, b % 2 ? pl : pr) : src);
          });
        }
        S.efx.forEach((e, i) => {
          e.route.forEach((on, p) => {
            if (!on) return;
            const odd = 2 * p + 1 + (e.shift ? 12 : 0);
            if (b === odd) lists.push(efxPost(i + 1, 'L'));
            if (b === odd + 1) lists.push(efxPost(i + 1, 'R'));
          });
        });
        if (S.osc.bus) lists.push(oscSig());
        if (S.tb.slate) lists.push(tbSig());
        return sum.apply(null, lists);
      });
    }
    function busOut(b) { return node('busout' + b, () => tag(gain(busSum(b), S.busTrim[b - 1]), 'bus:' + b)); }

    // --- subgroups (fed from multitrack buses 1-8)
    function subIn(m) { return node('subin' + m, () => tag(busSum(m), 'sub:' + m)); }
    function subPost(m) {
      return node('subpost' + m, () => {
        const s = S.sub[m - 1];
        if (s.cut) return [];
        const r = jackIn('sub' + m + '.ret');
        return gain(isPatched('sub' + m + '.ret') ? tag(r, 'ret:s:' + m) : r, A.curve('fader', s.fader));
      });
    }

    // --- aux / cue
    function sendSrc(n, pair) {
      const c = ch(n), sf = c.sendSF[pair], pf = c.sendPre[pair];
      return sf ? (pf ? sfPre(n) : sfPost(n)) : (pf ? lfPre(n) : lfPost(n));
    }
    function auxSum(k) {
      return node('aux' + k, () => {
        const lists = [];
        for (let n = 1; n <= N; n++) {
          const c = ch(n);
          c.aux.forEach((v, j) => {
            const pair = j >> 1;
            if (v <= 0 || j + 1 + (c.auxShift[pair] ? 6 : 0) !== k) return;
            lists.push(gain(sendSrc(n, pair), A.curve('send', v)));
          });
        }
        return sum.apply(null, lists);
      });
    }
    function auxOut(k) { return node('auxout' + k, () => tag(gain(auxSum(k), A.curve('send', S.auxTrim[k - 1])), 'aux:' + k)); }
    function cueSum(x) {
      return node('cue' + x, () => {
        const lists = [];
        for (let n = 1; n <= N; n++) {
          const v = ch(n)['cue' + x];
          if (v > 0) lists.push(gain(sendSrc(n, 3), A.curve('send', v)));
        }
        return sum.apply(null, lists);
      });
    }
    function cueOut(x) { return node('cueout' + x, () => tag(gain(cueSum(x), A.curve('send', S.cueTrim[x])), 'cue:' + x)); }

    // --- stereo EFX returns
    function efxPost(k, side) {
      return node('efx' + k + side, () => {
        const e = S.efx[k - 1];
        if (e.cut) return [];
        return tag(gain(jackIn('efx' + k + '.' + side), e.trim), 'efx:' + k);
      });
    }
    function efxMix(k, side) { const e = S.efx[k - 1]; return gain(efxPost(k, side), A.curve('fader', e.level)); }

    // --- mix bus
    function mixSum(side) {
      return node('mix' + side, () => {
        const lists = [];
        const pick = (src, pan, ok) => {
          if (!ok || !src.length) return;
          const [pl, pr] = panGains(pan);
          lists.push(gain(src, side === 'L' ? pl : pr));
        };
        for (let n = 1; n <= N; n++) {
          const c = ch(n);
          if (c.sf.mix) pick(sfPost(n), c.sf.pan, mixAllowed('sf', n));
          if (c.lf.mix) pick(lfPost(n), c.lf.pan, mixAllowed('lf', n));
        }
        S.sub.forEach((s, i) => { if (s.mix) pick(subPost(i + 1), s.pan, mixAllowed('sub', i + 1)); });
        S.efx.forEach((e, i) => { if (e.mix && mixAllowed('efx', i + 1)) lists.push(efxMix(i + 1, side)); });
        if (S.osc.mix) lists.push(gain(oscSig(), -3));
        return tag(sum.apply(null, lists), 'mix');
      });
    }
    function herOut(side) { return node('her' + side, () => S.her.retro ? tag(mixSum(side), 'her') : mixSum(side)); }
    function mixFinal(side) {
      return node('mixf' + side, () => {
        const r = jackIn('mix.ret' + side);
        let s = isPatched('mix.ret' + side) ? tag(r, 'ret:m') : r;
        if (S.bcomp) s = tag(s, 'cmp:bus');
        return gain(s, A.curve('send', S.master));
      });
    }

    // --- solo bus
    function soloBus(side) {
      return node('solo' + side, () => {
        const lists = [];
        const pfl = S.solo.pfl;
        for (const s of soloList) {
          let src, pan = 0;
          if (s.kind === 'sf') { src = pfl ? sfPre(s.n) : sfPost(s.n); pan = ch(s.n).sf.pan; }
          else if (s.kind === 'lf') { src = pfl ? lfPre(s.n) : lfPost(s.n); pan = ch(s.n).lf.pan; }
          else if (s.kind === 'sub') { src = subPost(s.n); pan = S.sub[s.n - 1].pan; }
          else if (s.kind === 'efx') { lists.push(efxMix(s.n, side)); continue; }
          else if (s.kind === 'aux') { src = auxOut(s.n); }
          else { src = cueOut(s.n); }
          const [pl, pr] = panGains(pfl ? 0 : pan);
          lists.push(gain(src, side === 'L' ? pl : pr));
        }
        return tag(gain(sum.apply(null, lists), S.solo.level), 'solo');
      });
    }

    // --- control room monitoring
    const afSolo = S.fb.findIndex(f => f.solo);
    function monSrc(side) {
      return node('monsrc' + side, () => {
        if (afSolo >= 0) return fbOut(afSolo + 1, side);
        const lists = [];
        if (S.mon.mix) lists.push(mixFinal(side));
        for (const k of [1, 2, 3]) if (S.mon['ext' + k]) lists.push(tag(jackIn('ext' + k + '.' + side), 'ext:' + k));
        let s = sum.apply(null, lists);
        if (soloActive && !sip) s = S.solo.front ? sum(soloBus(side), gain(s, -10)) : soloBus(side);
        return s;
      });
    }
    function croom(side) {
      return node('cr' + side, () => {
        let s = S.mon.mono ? gain(sum(monSrc('L'), monSrc('R')), -6) : monSrc(side);
        return tag(s, 'cr');
      });
    }
    function monOut(o, side) {
      return node('mon' + o + side, () => {
        if (S.mon.out !== o) return [];
        if (S.mon['cut' + side]) return [];
        return gain(croom(side), A.curve('send', S.mon.level) + (S.mon.dim ? -20 : 0));
      });
    }

    // --- studio loudspeaker / artist foldback
    function pickSrc(sel, side) {
      if (sel === 'croom') return croom(side);
      if (sel === 'ext1') return tag(jackIn('ext1.' + side), 'ext:1');
      if (sel === 'ext2') return tag(jackIn('ext2.' + side), 'ext:2');
      if (sel === 'cueA') return cueOut('A');
      if (sel === 'cueB') return cueOut('B');
      return [];
    }
    function slsOut(side) {
      return node('sls' + side, () => {
        if (!S.sls.on) return [];
        const lists = [pickSrc(S.sls.src, side)];
        if (S.tb.studio) lists.push(tbSig());
        return tag(gain(sum.apply(null, lists), A.curve('send', S.sls.level)), 'sls');
      });
    }
    function fbOut(k, side) {
      return node('fb' + k + side, () => {
        const f = S.fb[k - 1];
        const lists = [pickSrc(f[side], side)];
        S.efx.forEach((e, i) => { if (e.fb > 0) lists.push(gain(efxPost(i + 1, side), A.curve('send', e.fb))); });
        if (S.tb.artist || S.tb.slate) lists.push(tbSig());
        return tag(gain(sum.apply(null, lists), A.curve('send', f.level)), 'fb:' + k);
      });
    }

    // --- DAW, outboard, misc devices
    function dawPlay(n) {
      return node('play' + n, () => {
        const t = S.daw[n - 1].content;
        return t ? tag(t, 'play:' + n) : [];
      });
    }
    function outboard(dev, i) {
      return node('ob:' + dev + i, () => {
        const s = jackIn(dev + '.in' + i);
        if (dev === 'hv' || dev === 'nv') return tag(gain(s, S.ob[dev][i - 1].gain), 'pre:' + dev + ':' + i);
        if (dev === 'meq') return tag(s, 'eq:meq:' + i);
        return tag(s, 'cmp:' + dev + ':' + i);
      });
    }
    function headamp(h) { return node('ha' + h, () => tag(sum(jackIn('ha' + h + '.L'), jackIn('ha' + h + '.R')), 'ha:' + h)); }

    const SRC = [
      [/^bus(\d+)\.[ab]$/, m => busOut(+m[1])],
      [/^daw(\d+)\.play$/, m => dawPlay(+m[1])],
      [/^tape(\d+)\.send$/, m => tapeSig(+m[1])],
      [/^dev(\d+)$/, m => tag(devOut('lb:' + A.roomOfCh(+m[1]) + ':' + A.boxIdx(+m[1])), 'lb:' + m[1])],
      [/^line(\d+)\.send$/, m => pre(+m[1])],
      [/^sub(\d+)\.send$/, m => subIn(+m[1])],
      [/^sub(\d+)\.out$/, m => subPost(+m[1])],
      [/^mix\.send([LR])$/, m => herOut(m[1])],
      [/^mixo\d\.([LR])$/, m => mixFinal(m[1])],
      [/^sls\.([LR])$/, m => slsOut(m[1])],
      [/^fb(\d)\.([LR])$/, m => fbOut(+m[1], m[2])],
      [/^mon\.(\w+)\.([LR])$/, m => monOut(m[1], m[2])],
      [/^cue([AB])\.out$/, m => cueOut(m[1])],
      [/^aux(\d+)\.out$/, m => auxOut(+m[1])],
      [/^lc(\d)\.out$/, m => tag(gain(jackIn('lc' + m[1] + '.in'), -12), 'lc:' + m[1])],
      [/^(hv|nv|meq|vm|tlc)\.out(\d)$/, m => outboard(m[1], +m[2])],
      [/^ha(\d)\.o\d$/, m => headamp(m[1])]
    ];
    function srcOut(id) {
      return node('so:' + id, () => {
        for (const [re, fn] of SRC) { const m = re.exec(id); if (m) return fn(m); }
        return [];
      });
    }

    return {
      S, loops, cableAt, soloActive, sip, soloList,
      jackIn, jackOut, roleOf, srcOut, devOut,
      pre, chPath, tapeSig, tapePath, lfPre, lfPost, sfPre, sfPost,
      busSum, busOut, subIn, subPost, auxOut, cueOut, efxPost,
      mixSum, mixFinal, croom, monOut, slsOut, fbOut, dawPlay, headamp, outboard, micIn
    };
  }

  // ---------------------------------------------------------------- evaluate + diagnostics
  A.evaluate = function (S) {
    // pass 1: every condenser powered, find which ones actually get +48V
    const R1 = core(S, null);
    const powered = new Set();
    const phantomHit = new Map(); // device id -> phantom sources
    const hit = (id, where) => { powered.add(id); if (!phantomHit.has(id)) phantomHit.set(id, []); phantomHit.get(id).push(where); };
    for (let n = 1; n <= N; n++) {
      if (!S.ch[n - 1].phantom) continue;
      const p = S.plug['mb:' + A.roomOfCh(n) + ':' + A.boxIdx(n)];
      if (p) hit(p.id, 'ch' + n);
    }
    for (const dev of ['hv', 'nv']) S.ob[dev].forEach((o, i) => {
      if (!o.ph) return;
      for (const c of R1.jackIn(dev + '.in' + (i + 1))) {
        if (c.chain.every(t => /^(tie|pc|par):/.test(t))) hit(c.src, dev + (i + 1));
      }
    });
    const R = core(S, powered);
    R.powered = powered;
    R.phantomHit = phantomHit;
    R.warnings = diagnose(S, R);
    return R;
  };

  function diagnose(S, R) {
    const W = [];
    const w = (lvl, key, args) => W.push({ lvl, key, args: args || [] });
    // evaluate every jack first so feedback loops anywhere on the desk are found
    for (const id of Object.keys(J)) { if (R.roleOf(id) === 'src' || J[id].role === 'par') R.jackOut(id); else R.jackIn(id); }
    for (let n = 1; n <= N; n++) { R.lfPost(n); R.sfPost(n); }
    R.mixFinal('L'); R.mixFinal('R'); R.croom('L'); R.croom('R');
    if (R.loops.size) w('fault', 'w.loop');
    // cables
    const seen = new Set();
    S.cables.forEach(c => {
      const ra = R.roleOf(c.a), rb = R.roleOf(c.b);
      if (ra === 'src' && rb === 'src') w('fault', 'w.outout', [c.a, c.b]);
      else if (ra !== 'src' && rb !== 'src' && ra !== 'par' && rb !== 'par') w('warn', 'w.inin', [c.a, c.b]);
      seen.add(c.a); seen.add(c.b);
    });
    for (const g of [1, 2]) {
      let ins = 0;
      for (const i of range(1, 4)) {
        const c = R.cableAt.get('par' + g + '.' + i);
        if (c && R.roleOf(c.other) === 'src') ins++;
      }
      if (ins > 1) w('fault', 'w.parshort', [g]);
    }
    // gear in rooms
    for (const [pt, p] of Object.entries(S.plug)) {
      const d = A.DEVICES[p.type];
      if (d.phantom === 'need' && !R.powered.has(p.id)) w('warn', 'w.nophantom', [p.id]);
      if (d.phantom === 'harm' && R.phantomHit.has(p.id)) w('fault', 'w.ribbon', [p.id]);
      if (pt.startsWith('mb:') && !d.mic && d.kind === 'src') w('warn', 'w.lineinmic', [p.id]);
    }
    // channel levels
    for (let n = 1; n <= N; n++) {
      const pre = R.pre(n);
      if (!pre.length) continue;
      const l = lvlOf(pre);
      if (l > 22) w('fault', 'w.clip', ['Ch ' + n, l]);
      else if (l < -35) w('warn', 'w.low', ['Ch ' + n, l]);
    }
    for (const dev of ['hv', 'nv']) for (const i of range(1, 4)) {
      const o = R.outboard(dev, i);
      if (o.length && lvlOf(o) > 24) w('fault', 'w.clip', [dev === 'hv' ? 'HV-3D ' + i : 'Neve 5012 ' + i, lvlOf(o)]);
    }
    for (let n = 1; n <= N; n++) {
      const l = lvlOf(R.jackIn('daw' + n + '.in'));
      if (l > 18) w('fault', 'w.dawclip', [n, l]);
    }
    // noise floor: MIX buttons on with nothing behind them
    let idle = 0;
    for (let n = 1; n <= N; n++) {
      const c = S.ch[n - 1];
      if (c.sf.mix && !R.sfPost(n).length) idle++;
      if (c.lf.mix && !R.lfPost(n).length) idle++;
    }
    S.sub.forEach((s, i) => { if (s.mix && !R.subPost(i + 1).length) idle++; });
    S.efx.forEach((e, i) => { if (e.mix && !R.efxPost(i + 1, 'L').length && !R.efxPost(i + 1, 'R').length) idle++; });
    if (idle) w('warn', 'w.noise', [idle]);
    if (S.master < 1) w('warn', 'w.master');
    if (S.osc.on) w('info', 'w.osc');
    if (R.sip) w('warn', 'w.sip');
    if (S.tb.slate && S.tb.talk) w('info', 'w.slate');
    for (let n = 1; n <= N; n++) {
      const c = S.ch[n - 1];
      if (c.micIns && !R.chPath(n).length && R.pre(n).length) w('info', 'w.insdead', [n, 'MIC/LINE']);
      if (c.tapeIns && !R.tapePath(n).length && R.tapeSig(n).length) w('info', 'w.insdead', [n, 'DAW/TR']);
    }
    return W;
  }

  function srcPlug(S, src) {
    for (const p of Object.values(S.plug)) if (p.id === src) return p;
    return null;
  }
  A.srcPlug = srcPlug;
  A.plugPoint = function (S, src) {
    for (const [pt, p] of Object.entries(S.plug)) if (p.id === src) return pt;
    return null;
  };
})(window.ASP = window.ASP || {});
