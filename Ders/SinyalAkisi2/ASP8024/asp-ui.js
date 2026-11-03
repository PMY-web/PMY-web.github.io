/* ASP8024 simulator — rendering and interaction. */
(function (A) {
  'use strict';
  const t = A.t, L = A.L, N = A.N, range = A.range;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const LANG_KEY = 'asp8024.lang', SAND_KEY = 'asp8024.sandbox', VIEW_KEY = 'asp8024.view', MODE_KEY = 'asp8024.mode', SEC_KEY = 'asp8024.hiddenSecs';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
  };

  const U = A.U = { S: null, R: null, view: 'console', mode: 'sandbox', insp: null, selCable: -1, pending: null, msg: '' };

  // ---------------------------------------------------------------- state paths
  function get(path) { return path.split('.').reduce((o, p) => o == null ? o : o[p], U.S); }
  function set(path, v) {
    const ps = path.split('.'), last = ps.pop();
    const o = ps.reduce((o, p) => o[p], U.S);
    o[last] = v;
  }

  // ---------------------------------------------------------------- labels
  const TAKES = {
    vox: { lvl: -8, name: { tr: 'Vokal kaydı', en: 'Vocal take' } },
    drums: { lvl: -6, name: { tr: 'Davul kaydı', en: 'Drum take' } },
    bass: { lvl: -9, name: { tr: 'Bas kaydı', en: 'Bass take' } },
    gtr: { lvl: -10, name: { tr: 'Gitar kaydı', en: 'Guitar take' } },
    keys: { lvl: -12, name: { tr: 'Klavye kaydı', en: 'Keys take' } }
  };
  A.TAKES = TAKES;
  function pointLabel(pt) {
    let m = /^mb:(\w+):(\d+)$/.exec(pt);
    if (m) return m[1] + ' Mic ' + m[2];
    m = /^lb:(\w+):(\d+)$/.exec(pt);
    if (m) return m[1] + ' Line ' + m[2];
    if (A.J[pt]) return A.J[pt].long;
    return pt;
  }
  function srcLabel(src) {
    if (src === 'osc') return 'OSC ' + A.oscFreq(U.S.osc);
    if (src === 'tb') return 'Talkback mic';
    if (src.startsWith('take:')) return L(TAKES[src.slice(5)] ? TAKES[src.slice(5)].name : src);
    const p = A.srcPlug(U.S, src);
    if (p) return L(A.DEVICES[p.type].name) + ' (' + pointLabel(A.plugPoint(U.S, src)) + ')';
    return L(U.S.names[src]) || src;
  }
  A.srcLabel = srcLabel;
  const OBN = { hv: 'HV-3D', nv: 'Neve 5012', meq: 'Manley EQ', vm: 'Vari-Mu', tlc: 'TLC-2' };
  function tagLabel(tg) {
    const [k, a, b] = tg.split(':');
    switch (k) {
      case 'pre': return a === 'c' ? 'Ch' + b + ' PRE' : OBN[a] + ' ' + b;
      case 'hpf': return 'HPF';
      case 'tape': return 'Ch' + a + ' DAW/TR';
      case 'lf': return 'Ch' + a + ' LONG F.';
      case 'sf': return 'Ch' + a + ' SHORT F.';
      case 'eq': return a === 'c' ? 'Ch' + b + ' EQ' : OBN[a] + ' ' + b;
      case 'cmp': return a === 'bus' ? 'BUS COMP' : OBN[a] + ' ' + b;
      case 'ret': return a === 'l' ? 'Ch' + b + ' M/L INS' : a === 't' ? 'Ch' + b + ' DAW INS' : a === 's' ? 'SUB' + b + ' INS' : 'MIX INS';
      case 'bus': return 'BUS ' + a;
      case 'sub': return 'SUB ' + a;
      case 'aux': return 'AUX ' + a;
      case 'cue': return 'CUE ' + a;
      case 'efx': return 'EFX ' + a;
      case 'mix': return 'MIX BUS';
      case 'her': return 'RETRO IRON';
      case 'solo': return 'SOLO';
      case 'cr': return 'C/ROOM';
      case 'ext': return 'EXT ' + a;
      case 'sls': return 'STUDIO LS';
      case 'fb': return 'FOLDBACK ' + a;
      case 'tb': return 'TALKBACK';
      case 'play': return 'DAW ▶' + a;
      case 'rec': return 'DAW ●' + a;
      case 'lc': return 'LEVEL CONV ' + a;
      case 'ha': return 'HEADAMP ' + a;
      case 'tie': return a + ' ' + (b[0] === 'x' ? 'XLR' : 'TRS') + ' ' + b.slice(1);
      case 'lb': return A.roomOfCh(+a) + ' TRS ' + A.boxIdx(+a);
      case 'par': return 'PARALLELS ' + a;
      case 'pc': return '⇢';
      default: return tg;
    }
  }
  A.tagLabel = tagLabel;
  const dbStr = l => l === -Infinity ? '-∞' : (l > 0 ? '+' : '') + l.toFixed(1);
  A.dbStr = dbStr;
  function routeStr(c) {
    const out = [];
    for (const tg of c.chain) {
      if (tg.startsWith('pc:')) { out.push('<span class="pc" title="patch: ' + esc(A.J[tg.slice(3)] ? A.J[tg.slice(3)].long : '') + '">⇢</span>'); continue; }
      const cls = /^(pre|eq|cmp|her|hpf|lc|rec|play)/.test(tg) ? 'pt proc' : 'pt';
      out.push('<span class="' + cls + '">' + esc(tagLabel(tg)) + '</span>');
    }
    return out.join('<span class="ar">›</span>');
  }
  function compsHtml(cs) {
    if (!cs || !cs.length) return '<div class="muted small">' + t('side.silent') + '</div>';
    return '<ul class="comps">' + cs.slice().sort((a, b) => b.lvl - a.lvl).map(c =>
      '<li><div class="cs"><b>' + esc(srcLabel(c.src)) + '</b><span class="lv ' + lvCls(c.lvl) + '">' + dbStr(c.lvl) + ' dBu</span>' +
      (c.pol ? '<span class="pol">Ø ' + t('side.polarity') + '</span>' : '') + '</div>' +
      '<div class="route">' + routeStr(c) + '</div></li>').join('') + '</ul>';
  }
  const lvCls = l => l > 18 ? 'hot' : l > 4 ? 'warm' : l < -40 ? 'low' : '';

  // ---------------------------------------------------------------- control builders
  function sw(k, lab, cls, v) {
    return '<button class="sw ' + (cls || '') + '" data-k="' + k + '"' + (v !== undefined ? ' data-v="' + v + '"' : '') + '>' + lab + '</button>';
  }
  function knob(k, o, cls) {
    return '<div class="kn ' + (cls || '') + '" data-k="' + k + '" data-min="' + o.min + '" data-max="' + o.max + '" data-def="' + o.def + '" data-fmt="' + o.fmt + '">' +
      '<div class="dial"><i></i></div><span class="kl"' + (o.lattr || '') + '>' + o.lab + '</span><span class="kv"></span></div>';
  }
  const K = {
    db15: lab => ({ min: -15, max: 15, def: 0, fmt: 'db', lab }),
    pan: lab => ({ min: -1, max: 1, def: 0, fmt: 'pan', lab: lab || 'PAN' }),
    send: (lab, def) => ({ min: 0, max: 1, def: def === undefined ? 0 : def, fmt: 'send', lab })
  };
  // fader with a printed scale; the cap is positioned from the stored 0..1 value
  function fader(k, cls, curve, def) {
    curve = curve || 'fader';
    const marks = curve === 'fader' ? [10, 5, 0, -5, -10, -20, -40, -Infinity] : [0, -5, -10, -20, -40, -Infinity];
    const ticks = marks.map(db => '<span style="top:calc(' + (1 - A.invCurve(curve, db)).toFixed(4) + ' * (100% - 24px) + 12px)">' + (db === -Infinity ? '∞' : Math.abs(db)) + '</span>').join('');
    return '<div class="fdw ' + (cls || '') + '"><div class="fdr" data-k="' + k + '" data-curve="' + curve + '" data-def="' + (def === undefined ? 0.75 : def) + '">' +
      '<div class="ticks">' + ticks + '</div><div class="slot"></div><div class="cap"></div></div><span class="fv"></span></div>';
  }
  function meter(spec, lab) { return '<span class="mt" data-m="' + spec + '" title="' + (lab || '') + '">' + (lab ? '<em>' + lab + '</em>' : '') + '<b></b><s></s></span>'; }
  function vmeter(spec, cls) { return '<span class="vm ' + (cls || '') + '" data-m="' + spec + '"><b></b></span>'; }
  function fmtVal(fmt, v) {
    const [f, a] = fmt.split(':');
    switch (f) {
      case 'db': return (v > 0 ? '+' : '') + (+v).toFixed(1);
      case 'gain': return A.micGain(v, U.S.ch[a - 1].line).toFixed(0) + 'dB';
      case 'pan': return Math.abs(v) < 0.04 ? 'C' : (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 100);
      case 'send': case 'fader': case 'osc': case 'tb': return dbStr(A.curve(f, v));
      case 'hmf': { const hz = 450 * Math.pow(20000 / 450, v); return (hz / 1000).toFixed(hz < 10000 ? 2 : 1) + 'k'; }
      case 'lmf': { const hz = 50 * Math.pow(30, v); return hz >= 1000 ? (hz / 1000).toFixed(2) + 'k' : Math.round(hz) + ''; }
      case 'q': return (0.4 + v * 2.6).toFixed(1);
      case 'raw': return Math.round(v) + 'dB';
      default: return String(v);
    }
  }

  // ---------------------------------------------------------------- console
  // channel strip, laid out top to bottom like the desk: input, bus routing + sends, EQ, short fader, long fader
  function strip(n) {
    const k = 'ch.' + (n - 1) + '.';
    const kn = (key, o, cls) => knob(k + key, o, cls);
    const lbl = (s, cls) => '<span class="lbl ' + (cls || '') + '">' + s + '</span>';
    const row = (h, cls) => '<div class="row ' + (cls || '') + '">' + h + '</div>';
    const busBtns = range(1, 12).map(b => '<div class="busb">' + sw(k + 'bus.' + (b - 1), '', 'sq') +
      '<span class="bn" data-busn="' + n + ':' + b + '"><i>' + b + '</i><i>' + (b + 12) + '</i></span></div>').join('');
    const auxKnob = j => kn('aux.' + j, Object.assign(K.send('AUX ' + (j + 1)), { lattr: ' data-auxlab="' + n + ':' + j + '"' }), 'sm black');
    const sendBtns = (p, shiftLab) => '<div class="bcol">' + lbl('SF') + sw(k + 'sendSF.' + p, '', 'sq') + lbl('PRE') + sw(k + 'sendPre.' + p, '', 'sq') +
      (shiftLab ? lbl('AUX<br>' + shiftLab) + sw(k + 'auxShift.' + p, '', 'sq') : '') + '</div>';
    const auxPair = p => '<div class="auxrow"><div class="kcol">' + auxKnob(2 * p) + auxKnob(2 * p + 1) + '</div>' + sendBtns(p, (7 + 2 * p) + '-' + (8 + 2 * p)) + '</div>';
    return '<div class="strip" data-n="' + n + '">' +
      // --- mic / line input module
      '<div class="sec inp">' +
      '<div class="vurow">' + vmeter('vu:' + n, 'vu') +
      '<div class="vusc"><span class="over">OVER</span><span>+18</span><span>+12</span><span>+8</span><span>+4</span><span>0</span><span>-4</span><span>-8</span><span>-12</span><span>-18</span><span>dBu</span></div>' +
      // small indicator for the section not on the big meter (Mic/Line unless MTR FLIP): OVER / 0VU / SIG
      '<div class="vuaux"><div class="ledbox" data-led2="' + n + '"><span class="ovr">OVER</span>' +
      '<div class="lr"><i class="l0"></i><span>0VU</span></div><div class="lr"><i class="ls"></i><span>SIG</span></div></div></div></div>' +
      '<div class="lblbox"><span>TAPE</span><span>DAW</span></div>' +
      // buttons with their legend printed just to the right, as on the desk
      row(sw(k + 'tapeIns', '', 'sq') + lbl('INSERT<br>ACTIVE', 'l'), 'lft') +
      row(kn('trim', K.db15('TRIM'), 'md blue') + lbl('MTR<br>FLIP'), 'kb') +
      row(sw(k + 'line', '', 'sq') + lbl('LINE', 'l') + '<span class="sp"></span>' + sw(k + 'mflip', '', 'sq'), 'lft') +
      row(sw(k + 'micIns', '', 'sq') + lbl('INSERT<br>ACTIVE', 'l'), 'lft') +
      row(kn('gain', { min: 0, max: 1, def: 0.4, fmt: 'gain:' + n, lab: 'GAIN' }, 'md red') + '<div class="bcol">' + lbl('Ø') + sw(k + 'pol', '', 'sq') + '</div>', 'kb') +
      row(sw(k + 'phantom', '', 'sq red') + lbl('48V', 'l') + '<span class="sp"></span>' + lbl('HPF', 'l') + sw(k + 'hpf', '', 'sq'), 'lft') +
      '<div class="lblbox ml"><span data-ml="' + n + ':mic">MIC</span><span data-ml="' + n + ':line">LINE</span></div>' +
      '<div class="snum big">' + n + '</div></div>' +
      // --- bus routing, aux and cue
      '<div class="sec bus"><h4>BUS ROUTING</h4><div class="busgrid">' + busBtns + '</div>' +
      row('<div class="bcol">' + lbl('+12') + sw(k + 'busShift', '', 'sq') + lbl('SHIFT') + '</div><div class="bcol">' + lbl('FOLLOW') + sw(k + 'fpan', '', 'sq') + lbl('PAN') + '</div><div class="bcol">' + lbl('&nbsp;') + sw(k + 'busLF', '', 'sq') + lbl('LF') + '</div>') + '</div>' +
      '<div class="sec aux">' + auxPair(0) + auxPair(1) + auxPair(2) +
      '<div class="auxrow cue"><div class="kcol">' + kn('cueA', K.send('A'), 'sm black') + kn('cueB', K.send('B'), 'sm black') + '</div>' + sendBtns(3, '') + '</div>' +
      '<div class="cuelab">CUE</div></div>' +
      // --- equaliser
      '<div class="sec eq"><h4>EQUALISER</h4>' +
      row(sw(k + 'shelfIn', '', 'sq') + '<span class="sym">)(</span>' + sw(k + 'shelfSF', '', 'sq'), 'inrow') +
      row(lbl('IN') + lbl('SF'), 'inlab') +
      row('<div class="bcol">' + lbl('AIR') + sw(k + 'air', '', 'sq') + '<span class="band">HF</span></div>' + kn('hfg', K.db15('dB'), 'lg blue')) +
      row('<div class="bcol">' + lbl('100Hz') + sw(k + 'lo100', '', 'sq') + '<span class="band">LF</span></div>' + kn('lfg', K.db15('dB'), 'lg red')) +
      row(sw(k + 'peqIn', '', 'sq') + '<span class="sym">oo</span>' + sw(k + 'peqSF', '', 'sq'), 'inrow') +
      row(lbl('IN') + lbl('SF'), 'inlab') +
      row(kn('hmff', { min: 0, max: 1, def: 0.5, fmt: 'hmf', lab: 'kHz' }, 'sm blue') + '<span class="band">HMF</span>') +
      row(kn('hmfq', { min: 0, max: 1, def: 0.5, fmt: 'q', lab: 'BW' }, 'sm blue') + kn('hmfg', K.db15('dB'), 'lg blue')) +
      row(kn('lmff', { min: 0, max: 1, def: 0.5, fmt: 'lmf', lab: 'Hz' }, 'sm red') + '<span class="band">LMF</span>') +
      row(kn('lmfq', { min: 0, max: 1, def: 0.5, fmt: 'q', lab: 'BW' }, 'sm red') + kn('lmfg', K.db15('dB'), 'lg red')) + '</div>' +
      // --- short fader
      '<div class="sec sfs">' +
      row('<div class="bcol">' + lbl('COPY<br>LF') + sw(k + 'sf.copy', '', 'sq') + '</div><div class="srcind" data-srcind="sf:' + n + '"><span>MIC</span><span>TAPE</span><span>LF</span></div>') +
      row(kn('sf.pan', K.pan(), 'lg black') + '<div class="bcol">' + sw(k + 'sf.mix', '', 'sq org') + lbl('MIX') + '</div>') +
      '<div class="frow2">' + vmeter('sf:' + n) + fader(k + 'sf.fader', 'short') + '<div class="bcol bot">' + sw(k + 'sf.solo', 'SOLO', 'key yel') + sw(k + 'sf.cut', 'CUT', 'key red') + '</div></div></div>' +
      // --- long fader
      '<div class="sec lfs">' +
      row('<div class="bcol">' + sw(k + 'flip', '', 'sq') + lbl('CH FLIP') + '</div><div class="srcind" data-srcind="lf:' + n + '"><span>TAPE</span><span>MIC</span></div>') +
      row(kn('lf.pan', K.pan(), 'sm black') + '<div class="bcol">' + sw(k + 'lf.mix', '', 'sq org') + lbl('MIX') + '</div>') +
      row(sw(k + 'lf.solo', 'SOLO', 'key yel') + sw(k + 'lf.cut', 'CUT', 'key red')) +
      '<input class="scrib" data-name="' + n + '" maxlength="12" spellcheck="false" aria-label="Ch ' + n + ' name">' +
      '<div class="frow2">' + vmeter('lf:' + n) + fader(k + 'lf.fader', 'long') + '</div>' +
      '<div class="snum big">' + n + '</div></div></div>';
  }
  function block(title, body, cls) { return '<div class="blk ' + (cls || '') + '"><h3>' + title + '</h3>' + body + '</div>'; }
  function renderConsole() {
    $('#strips').innerHTML = range(1, N).map(strip).join('');
    const c = [];
    c.push(block('MULTITRACK BUS TRIM', '<div class="kgrid">' + range(1, N).map(b =>
      '<div class="kc">' + knob('busTrim.' + (b - 1), { min: -10, max: 10, def: 0, fmt: 'db', lab: 'BUS ' + b }) + meter('bus:' + b) + '</div>').join('') + '</div>', 'wide'));
    c.push(block('AUX / CUE MASTERS', '<div class="kgrid">' + range(1, 12).map(a =>
      '<div class="kc">' + knob('auxTrim.' + (a - 1), K.send('AUX ' + a, 1)) + meter('aux:' + a) + sw('auxSolo.' + (a - 1), 'S', 'yel') + '</div>').join('') +
      ['A', 'B'].map(x => '<div class="kc">' + knob('cueTrim.' + x, K.send('CUE ' + x, 1)) + meter('cue:' + x) + sw('cueSolo.' + x, 'S', 'yel') + '</div>').join('') + '</div>'));
    c.push(block('SUBGROUPS', '<div class="minis">' + range(1, 8).map(m => {
      const k = 'sub.' + (m - 1) + '.';
      return '<div class="mini"><div class="snum">' + m + '</div>' + knob(k + 'pan', K.pan()) +
        '<div class="bx v">' + sw(k + 'mix', 'MIX', 'grn') + sw(k + 'solo', 'S', 'yel') + sw(k + 'cut', 'CUT', 'red') + '</div>' +
        '<div class="frow">' + meter('sub:' + m) + fader(k + 'fader', 'short') + '</div></div>';
    }).join('') + '</div>'));
    c.push(block('STEREO EFX RETURNS', '<div class="minis">' + range(1, 4).map(e => {
      const k = 'efx.' + (e - 1) + '.';
      return '<div class="mini efxm"><div class="snum">EFX ' + e + '</div>' +
        '<div class="busgrid b2">' + range(0, 5).map(p => sw(k + 'route.' + p, '<span data-efxlab="' + e + ':' + p + '">' + (2 * p + 1) + '-' + (2 * p + 2) + '</span>', 'bb')).join('') + '</div>' +
        '<div class="bx">' + sw(k + 'shift', '+12') + '</div>' +
        knob(k + 'fb', K.send('FOLDBACK')) + knob(k + 'trim', { min: -20, max: 20, def: 0, fmt: 'db', lab: 'TRIM' }) +
        knob(k + 'level', { min: 0, max: 1, def: 0.75, fmt: 'fader', lab: 'FADER' }) +
        '<div class="bx">' + sw(k + 'mix', 'MIX', 'grn') + sw(k + 'solo', 'S', 'yel') + sw(k + 'cut', 'CUT', 'red') + '</div>' + meter('efx:' + e) + '</div>';
    }).join('') + '</div>'));
    c.push(block('MONITOR', '<div class="lab">SOURCE</div><div class="bx">' + sw('mon.mix', 'MIX') + sw('mon.ext1', 'EXT1') + sw('mon.ext2', 'EXT2') + sw('mon.ext3', 'EXT3') + '</div>' +
      '<div class="lab">OUTPUT</div><div class="bx">' + sw('mon.out', 'MAIN', '', 'main') + sw('mon.out', 'ALT1', '', 'alt1') + sw('mon.out', 'ALT2', '', 'alt2') + sw('mon.out', 'ALT3', '', 'alt3') + '</div>' +
      '<div class="bx">' + sw('mon.mono', 'MONO') + sw('mon.cutL', 'CUT L', 'red') + sw('mon.cutR', 'CUT R', 'red') + sw('mon.dim', 'DIM', 'yel') + '</div>' +
      '<div class="kr">' + knob('mon.level', K.send('LEVEL', 0.7)) + meter('mon', 'C/R') + '</div>'));
    const srcBtns = k => sw(k, 'EXT1', '', 'ext1') + sw(k, 'EXT2', '', 'ext2') + sw(k, 'C/ROOM', '', 'croom') + sw(k, 'CUE A', '', 'cueA') + sw(k, 'CUE B', '', 'cueB');
    c.push(block('STUDIO LOUDSPEAKER', '<div class="bx">' + srcBtns('sls.src') + '</div><div class="kr">' + knob('sls.level', K.send('dB', 0.7)) +
      sw('sls.on', 'ON', 'grn') + meter('sls') + '</div>'));
    for (const f of [1, 2]) {
      const k = 'fb.' + (f - 1) + '.';
      c.push(block('ARTIST FOLDBACK ' + f, '<div class="lab">L</div><div class="bx">' + srcBtns(k + 'L') + '</div><div class="lab">R</div><div class="bx">' + srcBtns(k + 'R') + '</div>' +
        '<div class="kr">' + knob(k + 'level', K.send('dB', 0.7)) + sw(k + 'solo', 'SOLO', 'yel') + meter('fb:' + f) + '</div>'));
    }
    c.push(block('TALKBACK', '<div class="bx">' + sw('tb.talk', 'TALK', 'red') + '</div>' + knob('tb.level', { min: 0, max: 1, def: 0.5, fmt: 'tb', lab: 'LEVEL' }) +
      '<div class="bx">' + sw('tb.slate', 'SLATE') + sw('tb.studio', 'STUDIO LS') + sw('tb.artist', 'ARTIST FB') + '</div>'));
    c.push(block('OSCILLATOR & SOLO', '<div class="bx">' + sw('osc.f1', 'F1') + sw('osc.f2', 'F2') + '<span class="oscf" id="oscF"></span></div>' +
      '<div class="kr">' + knob('osc.level', { min: 0, max: 1, def: 0.5, fmt: 'osc', lab: 'LEVEL' }) + '</div>' +
      '<div class="bx">' + sw('osc.on', 'ON', 'red') + sw('osc.bus', 'BUS') + sw('osc.mix', 'MIX') + '</div>' +
      '<div class="lab">SOLO</div><div class="kr">' + knob('solo.level', { min: -10, max: 10, def: 0, fmt: 'db', lab: 'SOLO LVL' }) + '</div>' +
      '<div class="bx">' + sw('solo.front', 'SOLO IN FRONT') + sw('solo.sip', 'SOLO IN PLACE', 'red') + sw('solo.pfl', 'PFL') + '</div>'));
    c.push(block('HERITAGE OUTPUT CARD', '<div class="bx">' + sw('her.dfa', 'BUS LINK (DFA)') + sw('her.retro', 'RETRO IRON', 'grn') + '</div>' +
      '<div class="bx">' + sw('her.bump', 'LOW BUMP') + sw('her.lift', 'HIGH LIFT') + '</div>'));
    c.push(block('BUS COMP & MASTER', '<div class="bx">' + sw('bcomp', 'BUS COMP IN', 'grn') + '</div>' +
      '<div class="frow master">' + vmeter('mixL', 'mst') + vmeter('mixR', 'mst') + fader('master', 'long', 'send', 1) + '</div>'));
    $('#center').innerHTML = c.join('');
  }

  // ---------------------------------------------------------------- patchbay
  function jk(id) {
    const j = A.J[id];
    return '<span class="jk ' + (j.cls || '') + '" data-j="' + id + '" title="' + esc(j.long) + '"><i></i><em>' + esc(j.label) + '</em></span>';
  }
  function renderPatch() {
    const h = [];
    const sec = id => A.LAYOUT.find(s => s.id === id);
    h.push('<div class="pbrow">');
    for (const b of sec('mt').blocks) {
      h.push('<div class="pblk"><h5>' + b.title + '</h5><div class="cells">' + b.cells.map(c =>
        '<div class="cell"><div class="r">' + c.rows[0].map(jk).join('') + '</div><div class="num">' + c.num + '</div><div class="r">' + c.rows[1].map(jk).join('') + '</div></div>').join('') + '</div></div>');
    }
    h.push('</div><div class="pbrow">');
    for (const b of sec('paths').blocks) {
      h.push('<div class="pblk paths"><h5><span>TAPE RETURN PATH</span><span>CHANNEL PATH</span></h5>' + b.rows.map(r =>
        '<div class="prow"><div class="grp tape">' + r.tape.map(jk).join('') + '</div><div class="pnum">' + r.num + '</div><div class="grp chan">' + r.chan.map(jk).join('') + '</div></div>').join('') + '</div>');
    }
    h.push('<div class="pcol">');
    for (const b of sec('right').blocks) {
      h.push('<div class="pblk"><h5>' + b.title + '</h5><div class="cells">' + b.cells.map(c =>
        '<div class="cell' + (c.par ? ' par' : '') + '">' + c.rows.map(r => '<div class="r">' + r.map(jk).join('') + '</div>').join('') + (c.num !== '' ? '<div class="num">' + c.num + '</div>' : '') + '</div>').join('') + '</div></div>');
    }
    h.push('</div></div>');
    for (const id of ['ties', 'gear']) {
      const s = sec(id);
      h.push('<div class="pbrow wrap"><h4 class="pbh">' + s.title + '</h4>');
      for (const b of s.blocks) h.push('<div class="pblk tie ' + (b.cls || '') + '"><h5>' + b.title + '</h5><div class="r">' + b.jacks.map(jk).join('') + '</div></div>');
      h.push('</div>');
    }
    $('#pb').innerHTML = h.join('') + '<svg id="pbSvg" class="cables"></svg>';
  }
  const CABLE_COLORS = ['#ff5c7a', '#5cb8ff', '#ffd25c', '#c77dff', '#00ff96', '#ff9f43', '#4dd0e1', '#f06292', '#aed581', '#ffffff'];
  function holeXY(id) {
    const el = $('#pb .jk[data-j="' + CSS.escape(id) + '"] i');
    if (!el) return null;
    const pr = $('#pb').getBoundingClientRect(), r = el.getBoundingClientRect();
    return [r.left - pr.left + r.width / 2, r.top - pr.top + r.height / 2];
  }
  function cablePath(p, q) {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const sag = 24 + d * 0.18;
    return 'M' + p[0] + ' ' + p[1] + ' C' + p[0] + ' ' + (p[1] + sag) + ' ' + q[0] + ' ' + (q[1] + sag) + ' ' + q[0] + ' ' + q[1];
  }
  function drawCables() {
    const pb = $('#pb'), svg = $('#pbSvg');
    if (!pb || !svg || U.view !== 'patch') return;
    svg.setAttribute('width', pb.scrollWidth);
    svg.setAttribute('height', pb.scrollHeight);
    const parts = [];
    U.S.cables.forEach((c, i) => {
      const p = holeXY(c.a), q = holeXY(c.b);
      if (!p || !q) return;
      const d = cablePath(p, q), col = CABLE_COLORS[i % CABLE_COLORS.length];
      parts.push('<g class="cab' + (i === U.selCable ? ' sel' : '') + '" data-c="' + i + '"><path class="hit" d="' + d + '"/><path class="wire" d="' + d + '" stroke="' + col + '"/>' +
        '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="5" fill="' + col + '"/><circle cx="' + q[0] + '" cy="' + q[1] + '" r="5" fill="' + col + '"/></g>');
    });
    parts.push('<path id="dragWire" class="drag" d=""/>');
    svg.innerHTML = parts.join('');
  }
  function cableIndexAt(id) { return U.S.cables.findIndex(c => c.a === id || c.b === id); }
  function connect(a, b) {
    if (a === b) return;
    if (cableIndexAt(a) >= 0 || cableIndexAt(b) >= 0) { setMsg(t('pb.busy'), true); return; }
    U.S.cables.push({ a, b });
    U.selCable = U.S.cables.length - 1;
    setMsg('');
    changed();
  }
  function removeCable(i) {
    if (i < 0 || i >= U.S.cables.length) return;
    U.S.cables.splice(i, 1);
    U.selCable = -1;
    if (U.insp && U.insp.cable !== undefined) U.insp = null;
    changed();
  }
  function setMsg(m, bad) { U.msg = m; const el = $('#pbMsg'); if (el) { el.textContent = m || t('pb.hint'); el.classList.toggle('bad', !!bad); } }

  // ---------------------------------------------------------------- rooms & outboard
  function ptSelect(pt, allowDst) {
    const opts = ['<option value="">—</option>'].concat(Object.entries(A.DEVICES)
      .filter(([, d]) => allowDst || d.kind === 'src')
      .map(([k, d]) => '<option value="' + k + '">' + esc(L(d.name)) + '</option>'));
    return '<select data-pt="' + pt + '">' + opts.join('') + '</select>';
  }
  function renderRooms() {
    const h = [];
    for (const r of A.ROOMS) {
      const rl = A.roomLabel(r), g = [];
      if (r.box) {
        g.push('<h5>' + t('rooms.box') + '</h5><div class="pts">' + range(1, 8).map(k => {
          const pt = 'mb:' + r.id + ':' + k;
          return '<label class="pt"><span>MIC ' + k + ' → Ch' + (r.ch0 + k - 1) + '</span>' + ptSelect(pt) + '<i class="led" data-led="' + pt + '"></i></label>';
        }).join('') + '</div>');
        g.push('<h5>' + t('rooms.line') + '</h5><div class="pts">' + range(1, 8).map(k => {
          const pt = 'lb:' + r.id + ':' + k;
          return '<label class="pt"><span>LINE ' + k + ' → DEV ' + (r.ch0 + k - 1) + '</span>' + ptSelect(pt) + '<i class="led" data-led="' + pt + '"></i></label>';
        }).join('') + '</div>');
      }
      for (const [kind, cnt] of [['x', r.xlr], ['t', r.trs]]) {
        if (!cnt) continue;
        g.push('<h5>' + t(kind === 'x' ? 'rooms.xlr' : 'rooms.trs') + '</h5><div class="pts">' + range(1, cnt).map(k => {
          const pt = 'tie:' + r.id + ':' + kind + k;
          return '<label class="pt"><span>' + (kind === 'x' ? 'XLR ' : 'TRS ') + k + '</span>' + ptSelect(pt, true) + '<i class="led" data-led="' + pt + '"></i></label>';
        }).join('') + '</div>');
      }
      h.push('<div class="room"><h3>' + rl + '</h3>' + g.join('') + '</div>');
    }
    $('#rooms').innerHTML = h.join('');
    const o = [];
    for (const d of A.OUTBOARD) {
      o.push('<div class="unit"><h3>' + d.name + '</h3><div class="uch">' + range(1, d.ch).map(i => {
        const extra = d.kind === 'pre' ? knob('ob.' + d.id + '.' + (i - 1) + '.gain', { min: 10, max: 65, def: 40, fmt: 'raw', lab: 'GAIN' }) + sw('ob.' + d.id + '.' + (i - 1) + '.ph', '48V', 'red') : '';
        return '<div class="uc"><div class="snum">' + i + '</div>' + meter('obin:' + d.id + ':' + i, t('ob.in')) + extra + meter('ob:' + d.id + ':' + i, t('ob.out')) + '</div>';
      }).join('') + '</div></div>');
    }
    $('#rack').innerHTML = o.join('');
  }

  // ---------------------------------------------------------------- DAW
  function renderDaw() {
    const rows = range(1, N).map(n =>
      '<tr><td class="tn">' + n + '</td><td>' + meter('daw:' + n) + '<div class="sum" data-dawin="' + n + '"></div></td>' +
      '<td><button class="sw red rec" data-rec="' + n + '">●</button></td>' +
      '<td><div class="sum" data-dawc="' + n + '"></div></td>' +
      '<td class="dctl"><select data-load="' + n + '"><option value="">' + t('daw.load') + '</option>' +
      Object.entries(TAKES).map(([k, v]) => '<option value="' + k + '">' + esc(L(v.name)) + '</option>').join('') + '</select>' +
      '<button class="btn sm" data-clr="' + n + '">' + t('daw.clear') + '</button></td></tr>').join('');
    $('#daw').innerHTML = '<p class="muted small">' + t('daw.hint') + '</p><div class="tblwrap"><table class="dawt"><thead><tr><th>#</th><th>' + t('daw.input') + '</th><th>' + t('daw.rec') + '</th><th>' + t('daw.content') + '</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<h3 class="sub">' + t('daw.recb') + '</h3><div id="recb" class="small"></div><div id="dawMsg" class="small muted"></div>';
  }
  function procSummary(c) {
    const p = c.chain.filter(tg => /^(pre|eq|cmp|her|hpf|lc|rec|play|bus|sub|mix|ret)/.test(tg)).map(tagLabel);
    return esc(srcLabel(c.src)) + (p.length ? ' <span class="muted">[' + esc(p.join(' › ')) + ']</span>' : '') + ' <span class="lv ' + lvCls(c.lvl) + '">' + dbStr(c.lvl) + '</span>';
  }
  function record(n) {
    const inp = U.R.jackIn('daw' + n + '.in');
    const msg = $('#dawMsg');
    if (!inp.length) { msg.textContent = t('daw.recEmpty', n); return; }
    if (inp.some(c => c.chain.includes('play:' + n))) { msg.textContent = t('daw.recSelf', n); return; }
    U.S.daw[n - 1].content = A.tag(inp, 'rec:' + n);
    msg.textContent = t('daw.recDone', n);
    changed();
  }

  // ---------------------------------------------------------------- meters / inspector specs
  function specComps(spec) {
    const R = U.R, [k, a, b] = spec.split(':');
    const lr = f => A.sum(f('L'), f('R'));
    switch (k) {
      case 'vu': return U.S.ch[a - 1].mflip ? R.pre(+a) : R.tapeSig(+a);
      case 'vu2': return U.S.ch[a - 1].mflip ? R.tapeSig(+a) : R.pre(+a);
      case 'pre': return R.pre(+a);
      case 'tape': return R.tapeSig(+a);
      case 'lf': return R.lfPost(+a);
      case 'sf': return R.sfPost(+a);
      case 'bus': return R.busOut(+a);
      case 'sub': return R.subPost(+a);
      case 'efx': return lr(s => R.efxPost(+a, s));
      case 'aux': return R.auxOut(+a);
      case 'cue': return R.cueOut(a);
      case 'mixL': return R.mixFinal('L');
      case 'mixR': return R.mixFinal('R');
      case 'mon': return lr(s => R.croom(s));
      case 'fb': return lr(s => R.fbOut(+a, s));
      case 'sls': return lr(s => R.slsOut(s));
      case 'daw': return R.jackIn('daw' + a + '.in');
      case 'ob': return R.outboard(a, +b);
      case 'obin': return R.jackIn(a + '.in' + b);
      case 'ji': return A.sum.apply(null, a.split(',').map(j => R.jackIn(j)));
      default: return [];
    }
  }
  function specTitle(spec) {
    const [k, a, b] = spec.split(':');
    const m = { vu: 'Ch' + a + ' VU (' + (U.S.ch[a - 1].mflip ? 'MIC/LINE' : 'DAW/TR') + ')', pre: 'Ch' + a + ' MIC/LINE PRE', tape: 'Ch' + a + ' DAW/TR', lf: 'Ch' + a + ' LONG FADER', sf: 'Ch' + a + ' SHORT FADER', bus: 'MULTITRACK BUS ' + a, sub: 'SUBGROUP ' + a, efx: 'STEREO EFX ' + a, aux: 'AUX ' + a, cue: 'CUE ' + a, mixL: 'MIX L', mixR: 'MIX R', mon: 'CONTROL ROOM', fb: 'ARTIST FOLDBACK ' + a, sls: 'STUDIO LOUDSPEAKER', daw: 'DAW IN ' + a, ob: (OBN[a] || a) + ' ' + b + ' OUT', obin: (OBN[a] || a) + ' ' + b + ' IN' };
    return m[k] || spec;
  }

  // ---------------------------------------------------------------- refresh
  function refreshControls() {
    for (const el of $$('[data-k]')) {
      const k = el.dataset.k, v = get(k);
      if (el.classList.contains('sw')) {
        el.classList.toggle('on', el.dataset.v !== undefined ? String(v) === el.dataset.v : !!v);
      } else if (el.classList.contains('kn')) {
        const min = +el.dataset.min, max = +el.dataset.max;
        el.querySelector('.dial').style.setProperty('--a', (-135 + 270 * (v - min) / (max - min)) + 'deg');
        el.querySelector('.kv').textContent = fmtVal(el.dataset.fmt, v);
        el.classList.toggle('moved', Math.abs(v - +el.dataset.def) > 1e-6);
      } else if (el.classList.contains('fdr')) {
        el.style.setProperty('--p', v);
        el.classList.toggle('moved', Math.abs(v - +el.dataset.def) > 1e-6);
        el.parentNode.querySelector('.fv').textContent = dbStr(A.curve(el.dataset.curve, v));
      }
    }
    for (const el of $$('[data-auxlab]')) { const [n, j] = el.dataset.auxlab.split(':'); el.textContent = 'AUX ' + (+j + 1 + (U.S.ch[n - 1].auxShift[j >> 1] ? 6 : 0)); }
    for (const el of $$('[data-busn]')) {
      const n = +el.dataset.busn.split(':')[0], sh = U.S.ch[n - 1].busShift;
      el.children[0].classList.toggle('on', !sh);
      el.children[1].classList.toggle('on', sh);
    }
    for (const el of $$('[data-srcind]')) {
      const [f, n] = el.dataset.srcind.split(':'), c = U.S.ch[n - 1];
      const cur = f === 'sf' ? (c.sf.copy ? 'LF' : c.flip ? 'TAPE' : 'MIC') : (c.flip ? 'MIC' : 'TAPE');
      for (const s of el.children) s.classList.toggle('on', s.textContent === cur);
    }
    for (const el of $$('[data-ml]')) { const [n, w] = el.dataset.ml.split(':'); el.classList.toggle('on', U.S.ch[n - 1].line === (w === 'line')); }
    for (const el of $$('input[data-name]')) if (document.activeElement !== el) el.value = U.S.ch[el.dataset.name - 1].name || '';
    for (const el of $$('[data-efxlab]')) { const [e, p] = el.dataset.efxlab.split(':'); const o = 2 * p + 1 + (U.S.efx[e - 1].shift ? 12 : 0); el.textContent = o + '-' + (o + 1); }
    const of = $('#oscF'); if (of) of.textContent = A.oscFreq(U.S.osc);
    for (const el of $$('select[data-pt]')) { const p = U.S.plug[el.dataset.pt]; el.value = p ? p.type : ''; }
  }
  function refreshMeters() {
    for (const el of $$('.vm[data-m]')) {
      if (!el.offsetParent) continue;
      const l = A.lvlOf(specComps(el.dataset.m));
      const b = el.querySelector('b');
      b.style.height = (100 - (l === -Infinity ? 0 : Math.max(3, Math.min(100, (l + 30) / 52 * 100)))) + '%';
      el.classList.toggle('over', l > 18);
      el.title = l === -Infinity ? '' : dbStr(l) + ' dBu';
    }
    for (const el of $$('[data-led2]')) {
      if (!el.offsetParent) continue;
      // SIG: any signal above -40 dBu, 0VU: +4 dBu (0 VU) or more, OVER: above +18 dBu
      const l = A.lvlOf(specComps('vu2:' + el.dataset.led2));
      el.classList.toggle('sig', l > -40);
      el.classList.toggle('vu0', l >= 4);
      el.classList.toggle('over', l > 18);
    }
    for (const el of $$('.mt[data-m]')) {
      if (!el.offsetParent) continue;
      const l = A.lvlOf(specComps(el.dataset.m));
      const pct = l === -Infinity ? 0 : Math.max(2, Math.min(100, (l + 60) / 84 * 100));
      el.querySelector('b').style.width = pct + '%';
      el.querySelector('b').className = lvCls(l);
      el.querySelector('s').textContent = l === -Infinity ? '' : Math.round(l);
      el.classList.toggle('sig', l > -Infinity);
    }
  }
  function refreshPatch() {
    if (U.view !== 'patch') return;
    const R = U.R;
    for (const el of $$('#pb .jk')) {
      const id = el.dataset.j, role = R.roleOf(id);
      el.classList.toggle('r-src', role === 'src');
      el.classList.toggle('r-dst', role === 'dst');
      const sig = (role === 'src' || role === 'par') ? R.jackOut(id) : (role === 'dst' ? R.jackIn(id) : []);
      el.classList.toggle('sig', sig.length > 0);
      el.classList.toggle('used', cableIndexAt(id) >= 0);
      el.classList.toggle('pend', U.pending === id);
      el.classList.toggle('insp', !!(U.insp && U.insp.jack === id));
    }
    drawCables();
    const cnt = $('#pbCount'); if (cnt) cnt.textContent = t('pb.count', U.S.cables.length);
  }
  function refreshRooms() {
    if (U.view !== 'rooms') return;
    for (const el of $$('[data-led]')) {
      const pt = el.dataset.led, p = U.S.plug[pt];
      let on = false;
      if (p) {
        const d = A.DEVICES[p.type];
        on = d.kind === 'src' ? U.R.devOut(pt).length > 0 : U.R.jackIn(pt).length > 0;
      }
      el.classList.toggle('on', on);
      el.classList.toggle('dead', !!p && !on);
      el.title = p ? p.id : '';
    }
  }
  function refreshDaw() {
    if (U.view !== 'daw') return;
    for (const el of $$('[data-dawin]')) {
      const cs = U.R.jackIn('daw' + el.dataset.dawin + '.in');
      el.innerHTML = cs.length ? cs.map(procSummary).join('<br>') : '<span class="muted">—</span>';
    }
    for (const el of $$('[data-dawc]')) {
      const c = U.S.daw[el.dataset.dawc - 1].content;
      el.innerHTML = c ? c.map(procSummary).join('<br>') : '<span class="muted">' + t('daw.empty') + '</span>';
    }
    const rb = range(1, N).map(n => ({ n, cs: U.R.jackIn('recb' + n) })).filter(x => x.cs.length);
    $('#recb').innerHTML = rb.length ? rb.map(x => '<div>REC B ' + x.n + ': ' + x.cs.map(procSummary).join(', ') + '</div>').join('') : '<span class="muted">—</span>';
  }
  function refreshSide() {
    const R = U.R;
    // warnings
    const W = R.warnings.slice();
    const wl = $('#warnList');
    wl.innerHTML = W.length ? W.map(w => {
      const args = w.args.map(a => typeof a === 'number' && !Number.isInteger(a) ? dbStr(a) + ' dBu' : (A.J[a] ? A.J[a].long : (typeof a === 'string' && /^d\d+$/.test(a) ? srcLabel(a) : a)));
      return '<li class="' + w.lvl + '">' + esc(t.apply(null, [w.key].concat(args))) + '</li>';
    }).join('') : '<li class="ok">' + t('side.none') + '</li>';
    // inspector
    const ins = $('#insp');
    if (!U.insp) ins.innerHTML = '<p class="muted small">' + t('side.inspHint') + '</p>';
    else if (U.insp.jack) {
      const id = U.insp.jack, j = A.J[id], role = R.roleOf(id);
      const parts = ['<div class="ih">' + esc(j.long) + '</div>'];
      const nd = A.NORM_D.get(id), ns = A.NORM_S.get(id);
      const nm = nd || ns;
      if (nm) {
        const broken = (R.cableAt.has(nm.s) && !nm.half) || R.cableAt.has(nm.d);
        parts.push('<div class="small muted">' + esc(t('pb.normTo', A.J[nm.s].long, A.J[nm.d].long, t(nm.half ? 'pb.half' : 'pb.full'))) + (broken ? ' — <b class="bad">' + t('pb.broken') + '</b>' : '') + '</div>');
      }
      const ci = cableIndexAt(id);
      if (ci >= 0) {
        const c = U.S.cables[ci];
        parts.push('<div class="small">' + esc(t('pb.cable', A.J[c.a].long, A.J[c.b].long)) + ' <button class="btn sm danger" data-rmc="' + ci + '">' + t('btn.rmCable') + '</button></div>');
      }
      if (role === 'src' || role === 'par') parts.push('<h4>' + t('pb.gives') + '</h4>' + compsHtml(R.jackOut(id)));
      if (role === 'dst' || role === 'inert') parts.push('<h4>' + t('pb.gets') + '</h4>' + compsHtml(R.jackIn(id)));
      ins.innerHTML = parts.join('');
    } else if (U.insp.spec) {
      ins.innerHTML = '<div class="ih">' + esc(U.insp.title || specTitle(U.insp.spec)) + '</div>' + compsHtml(specComps(U.insp.spec));
    }
    // who hears what
    const items = [];
    const add = (title, jacks, always) => {
      const cs = A.sum.apply(null, jacks.map(j => R.jackIn(j)));
      if (cs.length || always) items.push({ title, spec: 'ji:' + jacks.join(','), cs });
    };
    const outName = { main: 'MAIN (FP01)', alt1: 'ALT 1 (A8X)', alt2: 'ALT 2 (AUR)', alt3: 'ALT 3 (phones)' };
    let crShown = false;
    for (const o of ['main', 'alt1', 'alt2', 'alt3']) {
      const js = ['spk.' + o + 'L', 'spk.' + o + 'R'];
      const has = js.some(j => R.jackIn(j).length);
      if (has || (o === U.S.mon.out && !crShown)) { add(t('h.cr') + ' — ' + outName[o], js, true); crShown = true; }
    }
    add(t('h.sls'), ['spk.slsL', 'spk.slsR'], true);
    add(t('h.ha6'), ['ha6.L', 'ha6.R'], true);
    add(t('h.ha4'), ['ha4.L', 'ha4.R'], true);
    for (const n of range(1, N)) add('DAW In ' + n, ['daw' + n + '.in']);
    for (const [pt, p] of Object.entries(U.S.plug)) if (A.DEVICES[p.type].kind === 'dst') add(t('h.roomspk') + ' — ' + pointLabel(pt), [pt], true);
    const nMain = items.length;
    for (const n of range(1, N)) add('REC B ' + n, ['recb' + n]);
    for (const k of [1, 2, 3]) add('MIX OUTPUT ' + k, ['mixout' + k + '.L', 'mixout' + k + '.R']);
    for (const m of range(1, 8)) add('SUBGROUP ' + m + ' DEV', ['sub' + m + '.dev']);
    add('CUE A FX IN', ['cueA.fx']); add('CUE B FX IN', ['cueB.fx']);
    for (const a of range(1, 12)) add('AUX ' + a + ' FX IN', ['aux' + a + '.fx']);
    const card = it => {
      const srcs = [...new Set(it.cs.map(c => c.src))];
      const l = A.lvlOf(it.cs);
      return '<div class="hi' + (it.cs.length ? '' : ' silent') + (U.insp && U.insp.spec === it.spec ? ' on' : '') + '" data-spec="' + esc(it.spec) + '" data-title="' + esc(it.title) + '">' +
        '<div class="ht"><b>' + esc(it.title) + '</b>' + (it.cs.length ? '<span class="lv ' + lvCls(l) + '">' + dbStr(l) + '</span>' : '') + '</div>' +
        '<div class="hs">' + (srcs.length ? srcs.map(s => esc(srcLabel(s))).join(', ') : t('side.silent')) + '</div></div>';
    };
    const others = items.slice(nMain);
    const open = $('#hearsOther') && $('#hearsOther').open;
    $('#hears').innerHTML = items.slice(0, nMain).map(card).join('') +
      (others.length ? '<details id="hearsOther"' + (open ? ' open' : '') + '><summary class="small muted">' + t('h.other') + ' (' + others.length + ')</summary>' + others.map(card).join('') + '</details>' : '');
  }

  let raf = 0;
  function changed() {
    if (A.EX && U.mode === 'ex') A.EX.saveState(); else store.set(SAND_KEY, JSON.stringify(U.S));
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; refresh(); });
  }
  U.changed = changed;
  function refresh() {
    U.R = A.evaluate(U.S);
    refreshControls();
    refreshMeters();
    refreshPatch();
    refreshRooms();
    refreshDaw();
    refreshSide();
    if (A.EX) A.EX.refresh();
  }
  U.refresh = refresh;

  // ---------------------------------------------------------------- events
  function bind() {
    document.addEventListener('click', e => {
      const swb = e.target.closest('button.sw[data-k]');
      if (swb) {
        const k = swb.dataset.k;
        if (swb.dataset.v !== undefined) set(k, swb.dataset.v); else set(k, !get(k));
        changed();
        return;
      }
      const m = e.target.closest('.mt[data-m]');
      if (m) { U.insp = { spec: m.dataset.m }; refreshSide(); showSide(); return; }
      const hi = e.target.closest('.hi[data-spec]');
      if (hi) { U.insp = { spec: hi.dataset.spec, title: hi.dataset.title }; refreshSide(); return; }
      const rm = e.target.closest('[data-rmc]');
      if (rm) { removeCable(+rm.dataset.rmc); return; }
      const rec = e.target.closest('[data-rec]');
      if (rec) { record(+rec.dataset.rec); return; }
      const clr = e.target.closest('[data-clr]');
      if (clr) { U.S.daw[clr.dataset.clr - 1].content = null; changed(); return; }
      const vb = e.target.closest('#viewSeg button');
      if (vb) { setView(vb.dataset.view); return; }
      const cab = e.target.closest('g.cab');
      if (cab) { U.selCable = +cab.dataset.c; const c = U.S.cables[U.selCable]; U.insp = { jack: c.a }; refreshPatch(); refreshSide(); return; }
    });
    document.addEventListener('change', e => {
      const s = e.target;
      if (s.matches('select[data-pt]')) {
        const pt = s.dataset.pt, old = U.S.plug[pt];
        if (!s.value) delete U.S.plug[pt];
        else U.S.plug[pt] = { type: s.value, id: old && old.type === s.value ? old.id : 'd' + (U.S.nextDev++) };
        changed();
      } else if (s.matches('select[data-load]')) {
        const n = +s.dataset.load, k = s.value;
        if (k) U.S.daw[n - 1].content = [A.C('take:' + k, TAKES[k].lvl)];
        s.value = '';
        changed();
      }
    });
    document.addEventListener('input', e => {
      if (e.target.matches('input[data-name]')) { U.S.ch[e.target.dataset.name - 1].name = e.target.value; changed(); }
    });
    // knobs and faders: drag vertically; faders move one-to-one with the pointer
    let drag = null;
    const range01 = el => el.classList.contains('fdr') ? [0, 1] : [+el.dataset.min, +el.dataset.max];
    document.addEventListener('pointerdown', e => {
      const kn = e.target.closest('.kn, .fdr');
      if (kn) {
        e.preventDefault();
        const px = kn.classList.contains('fdr') ? Math.max(40, kn.clientHeight - 24) : 160;
        drag = { kn, y: e.clientY, v: get(kn.dataset.k), px };
        kn.setPointerCapture(e.pointerId);
        return;
      }
      const j = e.target.closest('#pb .jk');
      if (j) { e.preventDefault(); pbDown(j, e); }
    });
    document.addEventListener('pointermove', e => {
      if (drag) {
        const [min, max] = range01(drag.kn);
        let v = drag.v + (drag.y - e.clientY) * (max - min) / (drag.px * (e.shiftKey ? 4 : 1));
        v = Math.max(min, Math.min(max, v));
        set(drag.kn.dataset.k, Math.round(v * 1000) / 1000);
        changed();
      } else if (pbDrag) pbMove(e);
    });
    document.addEventListener('pointerup', e => {
      if (drag) { drag = null; return; }
      if (pbDrag) pbUp(e);
    });
    document.addEventListener('dblclick', e => {
      const kn = e.target.closest('.kn, .fdr');
      if (kn) { set(kn.dataset.k, +kn.dataset.def); changed(); }
    });
    document.addEventListener('keydown', e => {
      if (e.target.matches('input, select, textarea')) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && U.selCable >= 0 && U.view === 'patch') { e.preventDefault(); removeCable(U.selCable); }
      if (e.key === 'Escape') { U.pending = null; U.selCable = -1; setMsg(''); refreshPatch(); }
    });
    window.addEventListener('resize', () => drawCables());
  }

  let pbDrag = null;
  function pbDown(j, e) {
    pbDrag = { id: j.dataset.j, x: e.clientX, y: e.clientY, moved: false };
  }
  function pbMove(e) {
    if (Math.hypot(e.clientX - pbDrag.x, e.clientY - pbDrag.y) > 6) pbDrag.moved = true;
    if (!pbDrag.moved) return;
    const p = holeXY(pbDrag.id), pr = $('#pb').getBoundingClientRect();
    const q = [e.clientX - pr.left, e.clientY - pr.top];
    const w = $('#dragWire');
    if (p && w) w.setAttribute('d', cablePath(p, q));
    for (const el of $$('#pb .jk.drop')) el.classList.remove('drop');
    const over = document.elementFromPoint(e.clientX, e.clientY);
    const tj = over && over.closest('#pb .jk');
    if (tj && tj.dataset.j !== pbDrag.id) tj.classList.add('drop');
  }
  function pbUp(e) {
    const d = pbDrag;
    pbDrag = null;
    const w = $('#dragWire'); if (w) w.setAttribute('d', '');
    for (const el of $$('#pb .jk.drop')) el.classList.remove('drop');
    const over = document.elementFromPoint(e.clientX, e.clientY);
    const tj = over && over.closest('#pb .jk');
    const id = d.id;
    if (d.moved) {
      if (tj && tj.dataset.j !== id) { U.pending = null; connect(id, tj.dataset.j); }
      return;
    }
    // plain click
    U.insp = { jack: id };
    const ci = cableIndexAt(id);
    if (U.pending && U.pending !== id) {
      const a = U.pending;
      U.pending = null;
      connect(a, id);
    } else if (ci >= 0) {
      U.selCable = ci; U.pending = null; setMsg('');
    } else if (U.pending === id) {
      U.pending = null; setMsg('');
    } else {
      U.pending = id; U.selCable = -1; setMsg(t('pb.pending'));
    }
    refreshPatch();
    refreshSide();
  }

  function setView(v) {
    U.view = v;
    store.set(VIEW_KEY, v);
    for (const b of $$('#viewSeg button')) b.classList.toggle('on', b.dataset.view === v);
    for (const s of $$('.view')) s.hidden = s.id !== 'v-' + v;
    refresh();
  }
  function showSide() { /* the side panel is always visible on wide screens; on phones it follows the views */ }

  // ---------------------------------------------------------------- language
  function applyLang(lang) {
    A.lang = lang;
    document.documentElement.lang = lang;
    store.set(LANG_KEY, lang);
    for (const b of $$('#langSeg button')) b.classList.toggle('on', b.dataset.lang === lang);
    for (const el of $$('[data-t]')) el.textContent = t(el.dataset.t);
    renderRooms();
    renderDaw();
    setMsg(U.msg);
    if (A.EX) A.EX.render();
    refresh();
  }

  // ---------------------------------------------------------------- import / export
  function exportState() {
    const blob = new Blob([JSON.stringify(U.S, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'asp8024-' + (U.mode === 'ex' && A.EX ? A.EX.cur : 'sandbox') + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function importState(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const s = JSON.parse(r.result);
        if (!s || !Array.isArray(s.ch) || s.ch.length !== N) throw new Error('bad');
        U.S = A.upgrade(s);
        changed();
      } catch (err) { alert('JSON?'); }
    };
    r.readAsText(file);
  }
  // fill in fields that older saved states may lack
  A.upgrade = function (s) {
    const d = A.defaultState();
    const merge = (dst, src) => {
      for (const k of Object.keys(src)) {
        if (dst[k] === undefined) continue;
        if (Array.isArray(dst[k]) !== Array.isArray(src[k])) continue; // shape changed between versions: keep the default
        if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k]) && !['plug', 'names'].includes(k)) merge(dst[k], src[k]);
        else if (Array.isArray(src[k]) && Array.isArray(dst[k]) && dst[k].length && typeof dst[k][0] === 'object' && dst[k][0] !== null && k !== 'cables') src[k].forEach((v, i) => { if (dst[k][i] && v && typeof v === 'object') merge(dst[k][i], v); });
        else dst[k] = src[k];
      }
    };
    merge(d, s);
    return d;
  };

  // ---------------------------------------------------------------- init
  A.init = function () {
    const saved = store.get(LANG_KEY);
    A.lang = saved === 'en' ? 'en' : 'tr';
    let S = null;
    try { const raw = store.get(SAND_KEY); if (raw) S = A.upgrade(JSON.parse(raw)); } catch (e) { S = null; }
    U.sandbox = S || A.defaultState();
    U.S = U.sandbox;
    renderConsole();
    renderPatch();
    bind();
    for (const b of $$('#langSeg button')) b.addEventListener('click', () => applyLang(b.dataset.lang));
    $('#resetBtn').addEventListener('click', () => {
      if (!confirm(t('btn.resetConfirm'))) return;
      if (U.mode === 'ex' && A.EX) A.EX.resetCurrent();
      else { U.S = U.sandbox = A.defaultState(); }
      U.insp = null; U.selCable = -1; U.pending = null;
      changed();
    });
    $('#clearCablesBtn').addEventListener('click', () => { U.S.cables = []; U.selCable = -1; changed(); });
    let hidden = [];
    try { hidden = JSON.parse(store.get(SEC_KEY) || '[]'); } catch (e) { hidden = []; }
    for (const cb of $$('input[data-sec]')) {
      const apply = () => $('#v-console').classList.toggle('no-' + cb.dataset.sec, !cb.checked);
      cb.checked = !hidden.includes(cb.dataset.sec);
      apply();
      cb.addEventListener('change', () => {
        apply();
        store.set(SEC_KEY, JSON.stringify($$('input[data-sec]').filter(c => !c.checked).map(c => c.dataset.sec)));
      });
    }
    $('#exportBtn').addEventListener('click', exportState);
    $('#importBtn').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', e => { if (e.target.files[0]) importState(e.target.files[0]); e.target.value = ''; });
    if (A.EX) A.EX.init(store.get(MODE_KEY) === 'ex');
    $$('#modeSeg button').forEach(b => b.addEventListener('click', () => { store.set(MODE_KEY, b.dataset.mode); A.EX.setMode(b.dataset.mode); }));
    const v = store.get(VIEW_KEY);
    U.view = ['console', 'patch', 'rooms', 'daw'].includes(v) ? v : 'console';
    applyLang(A.lang);
    setView(U.view);
  };
})(window.ASP = window.ASP || {});
