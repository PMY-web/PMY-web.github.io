/* ASP8024 simulator — exercises. Each check looks at the result (what reaches which input, through
   which stages), not at one specific patch, so any working solution passes. */
(function (A) {
  'use strict';
  const t = A.t, L = A.L, N = A.N, range = A.range;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
  };
  const PROG_KEY = 'asp8024.progress', CUR_KEY = 'asp8024.exCur';

  // ---------------------------------------------------------------- helpers
  const hasTag = (c, re) => c.chain.some(x => re.test(x));
  const OUT_PRE = /^pre:(hv|n73):/, CON_PRE = /^pre:c:/, OB_EQ = /^eq:meq:/, ANY_EQ = /^eq:/, OB_CMP = /^cmp:(vm|tlc):/;
  const dawIns = R => range(1, N).map(n => ({ n, cs: R.jackIn('daw' + n + '.in') }));
  const chansOf = c => new Set(c.chain.map(A.chanOfTag).filter(Boolean));
  const idxOf = (c, re, from) => { for (let i = from || 0; i < c.chain.length; i++) if (re.test(c.chain[i])) return i; return -1; };
  const sigOf = cs => cs.map(c => c.chain.filter(x => !x.startsWith('pc:')).map(x => x.replace(/\d+/g, '#')).join('>')).sort().join('|');
  const item = (ok, tr, en) => ({ ok: !!ok, msg: { tr, en } });
  function mic(S, pt, type) { const id = 'd' + S.nextDev++; S.plug[pt] = { type: type || 'cond', id }; return id; }
  function take(S, n, k) { S.daw[n - 1].content = [A.C('take:' + k, A.TAKES[k].lvl)]; }
  const powered = (R, id) => R.powered.has(id);
  const micItem = (R, id) => item(powered(R, id), 'Kondenser mikrofon phantom power (+48V) alıyor.', 'The condenser mic gets phantom power (+48V).');

  // ---------------------------------------------------------------- exercise list
  const EX = [
    {
      id: 'w1', group: { tr: 'Isınma', en: 'Warm-up' },
      title: { tr: 'Mikrofonu DAW\'a gönder', en: 'Send a mic to the DAW' },
      text: {
        tr: 'KS03\'teki MIC 1 noktasına bir kondenser mikrofon takılı. Bu mikrofonun sinyalini <b>DAW In 1</b>\'e sağlıklı bir seviyede (-24…+12 dBu arası) gönder.',
        en: 'A condenser mic is plugged into MIC 1 in KS03. Get it to <b>DAW In 1</b> at a healthy level (-24…+12 dBu).'
      },
      preset(S) { mic(S, 'mb:KS03:1'); },
      check(R) {
        const cs = R.jackIn('daw1.in').filter(c => c.src === 'd1');
        const l = A.lvlOf(cs);
        return [micItem(R, 'd1'),
          item(cs.length, 'Mikrofon DAW In 1\'e ulaşıyor.', 'The mic reaches DAW In 1.'),
          item(cs.length && l >= -24 && l <= 12, 'Seviye -24…+12 dBu arasında (şu an ' + A.dbStr(l) + ').', 'Level is within -24…+12 dBu (now ' + A.dbStr(l) + ').')];
      }
    },
    {
      id: 'w2', group: { tr: 'Isınma', en: 'Warm-up' },
      title: { tr: 'Kaydı kontrol odasında dinle', en: 'Hear a take in the control room' },
      text: {
        tr: 'DAW\'da 5. kanalda bir davul kaydı var. Bu kaydı kontrol odasındaki <b>MAIN</b> hoparlörlerden dinle. Mix Bus\'a gereksiz sinyal yolu gönderme.',
        en: 'DAW track 5 holds a drum take. Play it on the control-room <b>MAIN</b> speakers. Do not send unneeded paths to the Mix Bus.'
      },
      preset(S) { take(S, 5, 'drums'); },
      check(R) {
        const hit = side => R.jackIn('spk.main' + side).some(c => c.src === 'take:drums');
        return [item(hit('L') && hit('R'), 'Davul kaydı MAIN hoparlörlerin ikisinde de duyuluyor.', 'The drum take plays on both MAIN speakers.'),
          item(!R.warnings.some(w => w.key === 'w.noise'), 'Sinyalsiz yollarda MIX butonu açık değil.', 'No MIX buttons on for silent paths.'),
          item(!R.warnings.some(w => w.key === 'w.master'), 'Master fader 0 dB\'de.', 'Master fader at 0 dB.')];
      }
    },
    {
      id: 'w3', group: { tr: 'Isınma', en: 'Warm-up' },
      title: { tr: 'Sanatçıya cue mix', en: 'A cue mix for the artist' },
      text: {
        tr: 'KS03 MIC 1\'de vokal mikrofonu, DAW 3. kanalda bas kaydı var. <b>HA8000 A</b>\'ya (Foldback 1) bağlı sanatçı, ikisini de <b>Cue A</b> üzerinden iki kulağında (mono) duysun.',
        en: 'A vocal mic is on KS03 MIC 1 and a bass take is on DAW track 3. The artist on <b>HA8000 A</b> (Foldback 1) should hear both through <b>Cue A</b>, in both ears (mono).'
      },
      preset(S) { mic(S, 'mb:KS03:1'); take(S, 3, 'bass'); },
      check(R) {
        const ok = (side, src) => R.jackIn('ha8.a' + side).some(c => c.src === src && c.chain.includes('cue:A'));
        return [micItem(R, 'd1'),
          item(ok('L', 'd1') && ok('R', 'd1'), 'Vokal Cue A üzerinden HA8000 A L ve R\'de.', 'Vocal is on HA8000 A L and R via Cue A.'),
          item(ok('L', 'take:bass') && ok('R', 'take:bass'), 'Bas kaydı Cue A üzerinden HA8000 A L ve R\'de.', 'Bass take is on HA8000 A L and R via Cue A.')];
      }
    },
    {
      id: 's1a', group: { tr: 'Soru 1a', en: 'Question 1a' },
      title: { tr: 'İki preamp, iki kanal', en: 'Two preamps, two tracks' },
      text: {
        tr: 'Kayıt odasına yerleştirilmiş mikrofon ile kayıt alınıyor; EQ ve kompresör işlemleri outboard ile yapılacak.<br>Bir mikrofondan gelen sinyali kopyalayın; bir kopyayı <b>mikserin preamplifikatöründen</b>, diğer kopyayı <b>outboard preamplifikatörden</b> geçirin; iki ayrı DAW kanalına kaydedin (iki farklı DAW girişine ulaştırın).<br><span class="muted">Mikrofonu "Odalar & Outboard" sekmesinden istediğin noktaya taşıyabilirsin.</span>',
        en: 'A mic in the live room is being recorded; EQ and compression are done with outboard gear.<br>Split the signal of one mic: run one copy through the <b>console preamp</b> and the other through an <b>outboard preamp</b>, and get them to two different DAW inputs.<br><span class="muted">You can move the mic to any point in the "Rooms & Outboard" tab.</span>'
      },
      preset(S) { mic(S, 'mb:KS03:1'); },
      check(R) {
        const ins = dawIns(R);
        const a = ins.filter(x => x.cs.some(c => c.src === 'd1' && hasTag(c, CON_PRE) && !hasTag(c, OUT_PRE)));
        const b = ins.filter(x => x.cs.some(c => c.src === 'd1' && hasTag(c, OUT_PRE) && !hasTag(c, CON_PRE)));
        const two = a.some(x => b.some(y => y.n !== x.n));
        return [micItem(R, 'd1'),
          item(a.length, 'Bir DAW girişinde mikrofon yalnızca konsol preamp\'inden geçmiş olarak var.', 'One DAW input has the mic through the console preamp only.'),
          item(b.length, 'Bir DAW girişinde mikrofon yalnızca outboard preamp\'ten (HV-3D / 1073) geçmiş olarak var.', 'One DAW input has the mic through an outboard preamp only (HV-3D / 1073).'),
          item(two, 'İki kopya iki farklı DAW girişinde.', 'The two copies are on two different DAW inputs.')];
      }
    },
    {
      id: 's1b', group: { tr: 'Soru 1b', en: 'Question 1b' }, methods: 2,
      title: { tr: 'EQ\'lu ve EQ\'suz', en: 'With and without EQ' },
      text: {
        tr: 'Bir mikrofondan gelen sinyalin <b>EQ\'dan geçirilmiş</b> (outboard Massive Passive) ve <b>geçirilmemiş</b> hallerini iki ayrı DAW kanalına gönderin; bunu <b>iki farklı yöntemle</b> yapın.',
        en: 'Send the signal of one mic to two DAW inputs: one <b>through EQ</b> (outboard Massive Passive), one <b>without EQ</b>. Do it <b>two different ways</b>.'
      },
      preset(S) { mic(S, 'mb:KS03:1'); },
      check(R) {
        const ins = dawIns(R);
        let pair = null;
        for (const x of ins) for (const c of x.cs) {
          if (c.src !== 'd1' || !hasTag(c, OB_EQ)) continue;
          for (const y of ins) if (y.n !== x.n) for (const d of y.cs) if (d.src === 'd1' && !hasTag(d, ANY_EQ)) pair = pair || [c, d];
        }
        const items = [micItem(R, 'd1'),
          item(ins.some(x => x.cs.some(c => c.src === 'd1' && hasTag(c, OB_EQ))), 'Bir DAW girişinde mikrofon Massive Passive\'dan geçmiş.', 'One DAW input has the mic through the Massive Passive.'),
          item(pair, 'Başka bir DAW girişinde aynı mikrofon EQ\'suz.', 'Another DAW input has the same mic without any EQ.')];
        return { items, sig: pair ? sigOf(pair) : null };
      }
    },
    {
      id: 's1c', group: { tr: 'Soru 1c', en: 'Question 1c' },
      title: { tr: 'Tek kanalla EQ, kayıt, kompresör, kayıt', en: 'EQ, record, compress, record — one channel' },
      text: {
        tr: 'Bir mikrofondan gelen sinyali EQ\'dan geçirin; işlenmiş sinyali kaydedin; işlenmiş ve kaydedilmiş sinyali kompresörden geçirip kaydedin; bütün bu süreçte <b>yalnızca tek mikser kanalı</b> kullanın.<br><span class="muted">Kayıt için "DAW / Ses kartı" sekmesindeki ● REC düğmesini kullan.</span>',
        en: 'Run a mic through EQ and record it; then run that recorded, EQ\'d signal through a compressor and record the result. Use <b>only one mixer channel</b> for all of it.<br><span class="muted">Record with the ● REC buttons in the "DAW / Interface" tab.</span>'
      },
      preset(S) { mic(S, 'mb:KS03:1'); },
      check(R, S) {
        const recs = S.daw.map((d, i) => ({ n: i + 1, cs: d.content || [] }));
        const first = recs.filter(r => r.cs.some(c => c.src === 'd1' && hasTag(c, OB_EQ) && !hasTag(c, OB_CMP)));
        let second = null;
        for (const r of recs) for (const c of r.cs) {
          if (c.src !== 'd1') continue;
          const p = idxOf(c, /^play:\d+$/);
          if (p < 0 || idxOf(c, OB_EQ) < 0 || idxOf(c, OB_EQ) > p || idxOf(c, OB_CMP, p) < 0) continue;
          second = second || c;
        }
        return [item(first.length, 'Bir DAW kanalına mikrofonun EQ\'lu hali kaydedildi.', 'The EQ\'d mic is recorded on a DAW track.'),
          item(second, 'O kayıt çalınıp kompresörden geçirilerek başka bir kanala kaydedildi.', 'That take was played back through a compressor and recorded on another track.'),
          item(second && chansOf(second).size === 1, 'Bütün süreçte tek mikser kanalı kullanıldı.', 'Only one mixer channel was used along the way.')];
      }
    },
    {
      id: 's2a', group: { tr: 'Soru 2a', en: 'Question 2a' },
      title: { tr: 'Kompresör → EQ → ses kartı', en: 'Compressor → EQ → interface' },
      text: {
        tr: 'DAW\'da kayıtlı sinyal (1. kanal, vokal) miksere gönderilerek işlenecek. Sinyali <b>kompresör ve EQ\'ya</b> gönderin, <b>EQ çıkışını doğrudan ses kartının girişine</b> girin.',
        en: 'A recorded vocal (DAW track 1) is processed through the desk. Send it to the <b>compressor and then the EQ</b>, and patch the <b>EQ output straight into an interface input</b>.'
      },
      preset(S) { take(S, 1, 'vox'); },
      check(R) {
        let hit = null, order = null;
        for (const x of dawIns(R)) for (const c of x.cs) {
          if (c.src !== 'take:vox') continue;
          const cm = idxOf(c, OB_CMP), eq = idxOf(c, OB_EQ);
          if (cm >= 0 && eq >= 0) order = order || c;
          const rest = c.chain.slice(eq + 1).filter(x => !x.startsWith('pc:'));
          if (cm >= 0 && eq > cm && !rest.length) hit = hit || c;
        }
        return [item(order, 'Vokal kaydı kompresör ve EQ\'dan geçip bir DAW girişine ulaşıyor.', 'The vocal take reaches a DAW input through compressor and EQ.'),
          item(hit, 'Sıra kompresör → EQ, ve EQ çıkışı doğrudan (konsoldan geçmeden) ses kartı girişinde.', 'Order is compressor → EQ, and the EQ output goes straight to the interface (not through the desk).')];
      }
    },
    {
      id: 's2b', group: { tr: 'Soru 2b', en: 'Question 2b' },
      title: { tr: 'Kompresörü insert olarak ekle', en: 'Compressor as a channel insert' },
      text: {
        tr: 'DAW\'daki vokal kaydı (1. kanal) miksere geliyor. <b>Kompresörü kanala insert olarak</b> ekleyin.',
        en: 'The vocal take on DAW track 1 comes back to the desk. Add the <b>compressor as an insert</b> on the channel.'
      },
      preset(S) { take(S, 1, 'vox'); },
      check(R) {
        let ins = null;
        for (let n = 1; n <= N; n++) for (const c of [].concat(R.lfPre(n), R.sfPre(n))) {
          if (c.src !== 'take:vox') continue;
          const cm = idxOf(c, OB_CMP);
          if (cm < 0) continue;
          const nx = c.chain.slice(cm + 1).filter(x => !x.startsWith('pc:'))[0] || '';
          if (/^ret:[lt]:/.test(nx)) ins = ins || c;
        }
        return [item(ins, 'Kompresör çıkışı bir kanalın INSERT RET noktasına dönüyor ve insert devrede.', 'The compressor output returns into a channel INSERT RET and the insert is switched in.')];
      }
    },
    {
      id: 's2c', group: { tr: 'Soru 2c', en: 'Question 2c' },
      title: { tr: 'Fader\'a dokunmadan seviye artır', en: 'Raise the level without the faders' },
      text: {
        tr: 'DAW\'daki vokal kaydı (1. kanal, -8 dBu) miksere geliyor. Sinyali <b>long fader\'dan alın</b>; aynı kanalı kullanarak ve <b>hem long hem short fader\'a dokunmaksızın</b> sinyalin sesini (en az 3 dB) yükseltip başka bir DAW kanalına kaydedin.',
        en: 'The vocal take (DAW track 1, -8 dBu) comes back to the desk. Take the signal from the <b>long fader</b>; using the same channel and <b>without touching either fader</b>, raise its level (by at least 3 dB) and record it on another DAW track.'
      },
      hidden: { b64: 'YXluxLEgacWfbGVtaSBrYW5hbCB0cmlt4oCZaW5lIGRva3VubWFrc8SxesSxbiBnZXLDp2VrbGXFn3Rpcmlu', en: 'Do the same without touching the channel trim.' },
      preset(S) { take(S, 1, 'vox'); },
      check(R, S, ctx) {
        const base = ctx.base;
        const fadersOk = S.ch.every((c, i) => c.lf.fader === base.ch[i].lf.fader && c.sf.fader === base.ch[i].sf.fader);
        let hit = null;
        S.daw.forEach((d, i) => (d.content || []).forEach(c => {
          if (c.src !== 'take:vox' || !c.chain.includes('rec:' + (i + 1)) || !hasTag(c, /^lf:\d+$/) || chansOf(c).size !== 1) return;
          if (c.lvl >= -5) hit = hit || c;
        }));
        const items = [
          item(hit, 'Vokal long fader üzerinden, tek kanal kullanılarak en az 3 dB yükseltilmiş olarak başka bir kanala kaydedildi.', 'The vocal went through the long fader of one channel and was recorded at least 3 dB louder on another track.'),
          item(fadersOk, 'Hiçbir long/short fader oynatılmadı.', 'No long or short fader was moved.')];
        if (ctx.part === 2) {
          const ch = hit ? [...chansOf(hit)][0] : 0;
          items.push(item(hit && S.ch[ch - 1].trim === base.ch[ch - 1].trim, 'Kanal trim\'i (DAW/TR TRIM) değiştirilmedi.', 'The channel trim (DAW/TR TRIM) is untouched.'));
        }
        return items;
      }
    },
    {
      id: 's2d', group: { tr: 'Soru 2d', en: 'Question 2d' },
      title: { tr: 'Konsolun kompresörünü kullan', en: 'Use the desk\'s compressor' },
      text: {
        tr: 'DAW\'daki kayıtlar (1: vokal, 2: davul) miksere geliyor. <b>Mikserin üzerindeki kompresörü</b> kullanın ve sonucu kaydedin.',
        en: 'DAW tracks 1 (vocal) and 2 (drums) come back to the desk. Use the <b>console\'s own compressor</b> and record the result.'
      },
      preset(S) { take(S, 1, 'vox'); take(S, 2, 'drums'); },
      check(R, S) {
        const live = dawIns(R).some(x => x.cs.some(c => hasTag(c, /^cmp:bus$/)));
        const rec = S.daw.some(d => (d.content || []).some(c => hasTag(c, /^cmp:bus$/)));
        return [item(live, 'Bus compressor\'dan geçmiş sinyal bir DAW girişine ulaşıyor.', 'Signal through the bus compressor reaches a DAW input.'),
          item(rec, 'Sonuç bir DAW kanalına kaydedildi.', 'The result is recorded on a DAW track.')];
      }
    },
    {
      id: 's3a', group: { tr: 'Soru 3a', en: 'Question 3a' }, maxCables: 2,
      title: { tr: 'Mikrofon ve kayıt aynı kompresörde', en: 'Mic and take through one compressor' },
      text: {
        tr: 'Hem kayıt odasındaki mikrofon (KS03 MIC 1) ile kayıt alınıyor, hem de DAW\'daki kayıt (2. kanal, gitar) miksere geliyor. <b>Bütün sinyalleri aynı kompresör kanalından</b> geçirin; mikrofondan gelen sinyal henüz DAW\'a girmemiş olsun; <b>en fazla 2 patch kablosu</b> kullanın.',
        en: 'A mic in the live room (KS03 MIC 1) is being recorded while a guitar take (DAW track 2) plays back through the desk. Run <b>all of it through the same compressor channel</b>; the mic must not have gone through the DAW yet; use <b>at most 2 patch cables</b>.'
      },
      preset(S) { mic(S, 'mb:KS03:1'); take(S, 2, 'gtr'); },
      check(R, S) {
        let both = false;
        for (const dev of ['vm', 'tlc']) for (const i of range(1, 4)) {
          const o = R.outboard(dev, i);
          const m = o.some(c => c.src === 'd1' && !hasTag(c, /^(play|rec):/));
          const g = o.some(c => c.src === 'take:gtr');
          if (m && g) both = true;
        }
        return [micItem(R, 'd1'),
          item(both, 'Aynı kompresör kanalında hem canlı mikrofon hem gitar kaydı var.', 'One compressor channel carries both the live mic and the guitar take.'),
          item(S.cables.length <= 2, 'En fazla 2 kablo kullanıldı (' + S.cables.length + ').', 'At most 2 cables used (' + S.cables.length + ').')];
      }
    },
    {
      id: 's4', group: { tr: 'Soru 4', en: 'Question 4' }, methods: 2,
      title: { tr: 'Cue ve patchbay foldback olmadan', en: 'Foldback without Cue or the FB patch' },
      text: {
        tr: 'Mikrofondan (KS03 MIC 1) sinyal alın; sinyali DAW\'a sokmaksızın <b>Artist Foldback</b>\'e (HA8000) yollayın. Ancak sinyal hem <b>patchbay\'in Artist Foldback bölümünden</b>, hem de <b>Cue A ve Cue B</b> bus\'larından geçmemeli. Bunu <b>iki farklı yöntemle</b> yapın.',
        en: 'Take the mic (KS03 MIC 1) to the <b>artist foldback</b> (HA8000) without going through the DAW. The signal must not pass through the <b>Artist Foldback section of the patchbay</b>, nor through <b>Cue A or Cue B</b>. Do it <b>two different ways</b>.'
      },
      preset(S) { mic(S, 'mb:KS03:1'); },
      check(R, S) {
        const ok = c => c.src === 'd1' && !hasTag(c, /^(play|rec|cue):/);
        const hits = ['ha8.aL', 'ha8.aR', 'ha8.bL', 'ha8.bR'].map(j => R.jackIn(j).filter(ok)).reduce((a, b) => a.concat(b), []);
        const fbPatched = S.cables.some(c => A.FB_SECTION.includes(c.a) || A.FB_SECTION.includes(c.b));
        const items = [micItem(R, 'd1'),
          item(hits.length, 'Mikrofon, DAW ve Cue A/B\'ye uğramadan bir artist kulaklık amfisine ulaşıyor.', 'The mic reaches an artist headamp without the DAW or Cue A/B.'),
          item(!fbPatched, 'Patchbay\'in Artist Foldback bölümüne kablo takılmadı.', 'No cable in the Artist Foldback section of the patchbay.')];
        return { items, sig: hits.length ? sigOf(hits.slice(0, 1)) : null };
      }
    }
  ];
  A.EXERCISES = EX;

  // ---------------------------------------------------------------- runtime
  const X = A.EX = { cur: EX[0].id, prog: {}, result: null };
  const U = () => A.U;
  const def = () => EX.find(e => e.id === X.cur);
  function presetState(e) { const S = A.defaultState(); e.preset(S); return S; }
  function loadState(e) {
    try { const raw = store.get('asp8024.ex.' + e.id); if (raw) return A.upgrade(JSON.parse(raw)); } catch (err) { /* fall through */ }
    return presetState(e);
  }
  function prog(id) { return X.prog[id] || (X.prog[id] = { pass: false, part1: false, decoded: false, sigs: [] }); }
  function saveProg() { store.set(PROG_KEY, JSON.stringify(X.prog)); }
  X.saveState = () => store.set('asp8024.ex.' + X.cur, JSON.stringify(U().S));
  X.resetCurrent = () => { U().S = presetState(def()); X.result = null; X.saveState(); X.render(); };

  function decode(b64) {
    try { return new TextDecoder().decode(Uint8Array.from(atob(b64), ch => ch.charCodeAt(0))); } catch (e) { return '?'; }
  }

  function runCheck() {
    const e = def(), p = prog(e.id), S = U().S, R = A.evaluate(S);
    const part = e.hidden && p.part1 && p.decoded ? 2 : 1;
    let res = e.check(R, S, { base: presetState(e), part });
    if (Array.isArray(res)) res = { items: res };
    const ok = res.items.every(i => i.ok);
    let note = null;
    if (ok) {
      if (e.methods > 1) {
        if (p.sigs.includes(res.sig)) { note = { bad: true, msg: t('ex.sameMethod') }; }
        else {
          p.sigs.push(res.sig);
          if (p.sigs.length >= e.methods) p.pass = true;
          else note = { bad: false, msg: t('ex.method1') };
        }
      } else if (e.hidden && part === 1) {
        p.part1 = true;
        note = { bad: false, msg: t('ex.part1') };
      } else p.pass = true;
    }
    saveProg();
    X.result = { items: res.items, ok, note, part };
    X.render();
  }

  X.render = function () {
    const sel = $('#exSel');
    sel.innerHTML = EX.map(e => '<option value="' + e.id + '">' + (prog(e.id).pass ? '✓ ' : '') + esc(L(e.group)) + ' — ' + esc(L(e.title)) + '</option>').join('');
    sel.value = X.cur;
    const e = def(), p = prog(e.id);
    const h = [];
    h.push('<div class="qhead"><span class="qnum">' + esc(L(e.group)) + '</span><h2>' + esc(L(e.title)) + '</h2>' + (p.pass ? '<span class="badge">✓ ' + t('ex.solved') + '</span>' : '') + '</div>');
    h.push('<div class="qtext">' + L(e.text) + '</div>');
    if (e.hidden) {
      h.push('<div class="hint">Base64: <code>' + e.hidden.b64 + '</code> ');
      if (p.decoded) h.push('<div><b>' + t('ex.decoded') + '</b> ' + esc(decode(e.hidden.b64)) + (A.lang === 'en' ? ' <span class="muted">(' + esc(e.hidden.en) + ')</span>' : '') + '</div>');
      else h.push('<button class="btn sm" id="exReveal"' + (p.part1 ? '' : ' disabled') + '>' + t('btn.reveal') + '</button>' + (p.part1 ? '' : ' <span class="muted small">' + t('ex.b64') + '</span>'));
      h.push('</div>');
    }
    if (e.methods > 1) h.push('<div class="small muted">' + t('ex.methods', Math.min(p.sigs.length, e.methods), e.methods) + '</div>');
    if (e.maxCables) h.push('<div class="small muted" id="exCables"></div>');
    h.push('<div class="qbtns"><button class="btn primary" id="exCheck">' + t('btn.check') + '</button></div>');
    if (X.result) {
      const r = X.result;
      h.push('<div class="result ' + (r.ok && !(r.note && r.note.bad) ? 'ok' : 'bad') + '">' +
        (r.ok ? (r.note ? esc(r.note.msg) : t('ex.pass')) : t('ex.fail')) +
        '<ul class="issues">' + r.items.map(i => '<li class="' + (i.ok ? 'ok' : 'fault') + '">' + esc(L(i.msg)) + '</li>').join('') + '</ul></div>');
    }
    $('#exPanel').innerHTML = h.join('');
    $('#exCheck').addEventListener('click', runCheck);
    const rv = $('#exReveal');
    if (rv) rv.addEventListener('click', () => { p.decoded = true; saveProg(); X.result = null; X.render(); });
    X.refresh();
  };
  X.refresh = function () {
    const e = def(), el = $('#exCables');
    if (el && e.maxCables) el.textContent = t('ex.cablesLeft', U().S.cables.length, e.maxCables);
  };
  X.select = function (id) {
    X.cur = id;
    store.set(CUR_KEY, id);
    X.result = null;
    U().S = loadState(def());
    U().insp = null; U().selCable = -1; U().pending = null;
    X.render();
    U().refresh();
  };
  X.setMode = function (mode) {
    U().mode = mode;
    for (const b of document.querySelectorAll('#modeSeg button')) b.classList.toggle('on', b.dataset.mode === mode);
    $('#exPanel').hidden = mode !== 'ex';
    $('#exSel').hidden = mode !== 'ex';
    if (mode === 'ex') X.select(X.cur);
    else { U().S = U().sandbox; U().insp = null; U().selCable = -1; U().refresh(); }
  };
  X.init = function (startEx) {
    try { X.prog = JSON.parse(store.get(PROG_KEY) || '{}') || {}; } catch (e) { X.prog = {}; }
    const c = store.get(CUR_KEY);
    if (EX.some(e => e.id === c)) X.cur = c;
    $('#exSel').addEventListener('change', ev => X.select(ev.target.value));
    X.setMode(startEx ? 'ex' : 'sandbox');
  };
})(window.ASP = window.ASP || {});
