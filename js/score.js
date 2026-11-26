// LIVE SCORE · 악보 — abc 악보 글(화면 표시), MusicXML(뮤즈스코어)
import { BAR, KEYS, pc, toPieces, lyricFlow } from './core.js';

const SHARP_N = [['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0], ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0]];
const FLAT_N = [['C', 0], ['D', -1], ['D', 0], ['E', -1], ['E', 0], ['F', 0], ['G', -1], ['G', 0], ['A', -1], ['A', 0], ['B', -1], ['B', 0]];
const KEYSIG = { C: {}, G: { F: 1 }, D: { F: 1, C: 1 }, F: { B: -1 } };
export function spell(p, key) {
  const [L, alt] = ((KEYS[key] || KEYS.C).flat ? FLAT_N : SHARP_N)[pc(p)];
  return { L, alt, oct: Math.floor((p - alt) / 12) - 1 };
}
const DRUM_POS = { kick: 'F', snare: 'c', hat: 'g', crash: 'a' };

function abcPitch(p, key, bar) {
  const { L, alt, oct } = spell(p, key);
  const sig = (KEYSIG[key] || {})[L] || 0;
  const id = L + oct;
  const cur = bar.has(id) ? bar.get(id) : sig;
  let acc = '';
  if (alt !== cur) { acc = alt === 1 ? '^' : alt === -1 ? '_' : '='; bar.set(id, alt); }
  let s = oct >= 5 ? L.toLowerCase() + "'".repeat(oct - 5) : L + ','.repeat(Math.max(0, 4 - oct));
  return acc + s;
}

// voices: [{id, name, clef, notes, drum?, lyrics?:{map}, chords?:[{s,name}]}]
export function buildAbc(o) { return buildAbcMap(o).abc; }
// 편집기용: 악보 글과 함께, 글 속 각 음표·쉼표 위치(marks)를 돌려준다
export function buildAbcMap({ title = '', sub = '', tempo = 92, key = 'C', bars, perLine = 4, voices, showTitle = true }) {
  const total = bars * BAR;
  const lines = []; let pos = 0;
  const push = l => { lines.push(l); pos += l.length + 1; };
  const marks = [];
  push('X:1');
  if (showTitle && title) push('T:' + title.replace(/\n/g, ' '));
  if (showTitle && sub) push('C:' + sub);
  push('M:4/4'); push('L:1/16');
  if (showTitle) push(`Q:1/4=${tempo}`);
  ['%%vocalfont "Pretendard" 13', '%%gchordfont "Pretendard" 12', '%%titlefont "Pretendard" 22', '%%composerfont "Pretendard" 11', '%%voicefont "Pretendard" 11'].forEach(push);
  if (voices.length > 1) push('%%score ' + voices.map(v => v.id).join(' '));
  push('K:' + key);
  voices.forEach(v => push(`V:${v.id} clef=${v.clef === 'perc' ? 'perc' : v.clef || 'treble'}${voices.length > 1 ? ` name="${v.name}"` : ''}`));
  const vp = voices.map(v => {
    const notes = v.drum ? v.notes.map(n => ({ ...n, chord: undefined, ref: n })) : v.notes;
    const pieces = toPieces(notes, total);
    if (v.drum) pieces.forEach(q => { if (q.ref && q.ref.ref) q.ref = q.ref.ref; });
    return { v, pieces };
  });
  for (let b0 = 0; b0 < bars; b0 += perLine) {
    const b1 = Math.min(bars, b0 + perLine);
    vp.forEach(({ v, pieces }, vi) => {
      let mus = `[V:${v.id}] `;
      const lyr = [], local = [];
      for (let b = b0; b < b1; b++) {
        const bar = new Map();
        const inBar = pieces.filter(q => q.s >= b * BAR && q.s < (b + 1) * BAR);
        inBar.forEach((q, k) => {
          local.push({ off: mus.length, vi, bar: b, k, q });
          let tok = '';
          if (v.chords) { const c = v.chords.find(c => c.s === q.s); if (c) tok += `"${c.name.replace(/♯/g, '#').replace(/♭/g, 'b')}"`; }
          if (q.p == null) { mus += tok + 'z' + q.d + ' '; return; }
          if (v.drum) {
            const kit = q.ref.kit || ['kick'];
            const ps = kit.map(kk => (kk === 'hat' || kk === 'crash' ? '!style=x!' : '') + DRUM_POS[kk]);
            tok += (ps.length > 1 ? '[' + ps.join('') + ']' : ps[0]) + q.d;
          } else if (q.ref && q.ref.chord && q.ref.chord.length > 1) {
            tok += '[' + q.ref.chord.map(p => abcPitch(p, v.key || key, bar)).join('') + ']' + q.d;
          } else tok += abcPitch(q.p, v.key || key, bar) + q.d;
          if (q.tieNext) tok += '-';
          mus += tok + ' ';
          if (v.lyrics) {
            if (q.tiePrev) lyr.push('_');
            else { const m = v.lyrics.map.get(q.ref.id); lyr.push(m ? (m.kind === 'ext' ? '_' : m.text ? m.text.replace(/[-_*~\\|]/g, '') : '*') : '*'); }
          }
        });
        mus += (b === bars - 1 ? '|]' : '|') + ' ';
      }
      local.forEach(m => marks.push({ at: pos + m.off, vi: m.vi, bar: m.bar, k: m.k, q: m.q }));
      push(mus.trim());
      if (v.lyrics && lyr.length) push('w: ' + lyr.join(' '));
    });
  }
  marks.sort((x, y) => x.at - y.at);
  return { abc: lines.join('\n') + '\n', marks };
}

// 노래 성부 만들기(가사·화음 기호 포함)
export function melodyVoice(melody, lyricsLines, chords, name = '노래', id = 'V1') {
  const flow = lyricFlow(melody, lyricsLines);
  return { id, name, clef: 'treble', notes: melody.filter(n => n.p != null), lyrics: flow, chords: chords ? chords.map(c => ({ s: c.s, name: c.name })) : null };
}

export function renderAbc(el, abc, opts = {}) {
  if (!window.ABCJS) { el.textContent = '악보 그리기 도구를 불러오지 못했습니다.'; return null; }
  const r = window.ABCJS.renderAbc(el, abc, {
    add_classes: true, responsive: 'resize', paddingtop: 6, paddingbottom: 6, paddingleft: 4, paddingright: 4,
    staffwidth: opts.staffwidth || 740, scale: opts.scale || 1, clickListener: opts.click, foregroundColor: '#1a1c1f', selectionColor: '#1F4D3A', dragging: false,
    format: { vocalfont: 'Pretendard 13', gchordfont: 'Pretendard 12' },
  });
  return r && r[0];
}

// ── MusicXML ──
const TYPE = { 16: ['whole', 0], 12: ['half', 1], 8: ['half', 0], 6: ['quarter', 1], 4: ['quarter', 0], 3: ['eighth', 1], 2: ['eighth', 0], 1: ['16th', 0] };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const DRUM_X = { kick: ['F', 4, 36], snare: ['C', 5, 38], hat: ['G', 5, 42], crash: ['A', 5, 49] };

// parts: [{name, clef, notes, drum?, program, lyrics?:flow, chords?:[{s,r,q,name}] }]
export function buildMusicXML({ title, sub, tempo, key, bars, parts }) {
  const total = bars * BAR;
  const k = KEYS[key] || KEYS.C;
  let x = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>${esc(title || '우리 노래')}</work-title></work>
  <identification>${sub ? `<creator type="composer">${esc(sub)}</creator>` : ''}<encoding><software>LIVE SCORE 실시간 악보</software></encoding></identification>
  <part-list>\n`;
  parts.forEach((p, i) => {
    const id = 'P' + (i + 1);
    x += `    <score-part id="${id}"><part-name>${esc(p.name)}</part-name>`;
    if (p.drum) {
      Object.entries(DRUM_X).forEach(([kk, v]) => { x += `<score-instrument id="${id}-${kk}"><instrument-name>${kk}</instrument-name></score-instrument>`; });
      Object.entries(DRUM_X).forEach(([kk, v]) => { x += `<midi-instrument id="${id}-${kk}"><midi-channel>10</midi-channel><midi-unpitched>${v[2] + 1}</midi-unpitched></midi-instrument>`; });
    } else {
      x += `<score-instrument id="${id}-I1"><instrument-name>${esc(p.name)}</instrument-name></score-instrument><midi-instrument id="${id}-I1"><midi-channel>${i + 1 >= 10 ? i + 2 : i + 1}</midi-channel><midi-program>${(p.program ?? 0) + 1}</midi-program></midi-instrument>`;
    }
    x += `</score-part>\n`;
  });
  x += `  </part-list>\n`;
  parts.forEach((p, i) => {
    const id = 'P' + (i + 1);
    x += `  <part id="${id}">\n`;
    const pieces = toPieces(p.drum ? p.notes.map(n => ({ ...n, chord: undefined })) : p.notes, total);
    for (let b = 0; b < bars; b++) {
      x += `    <measure number="${b + 1}">\n`;
      if (b === 0) {
        const clef = p.drum ? '<sign>percussion</sign><line>2</line>' : p.clef === 'bass' ? '<sign>F</sign><line>4</line>' : '<sign>G</sign><line>2</line>';
        x += `      <attributes><divisions>4</divisions><key><fifths>${k.fifths}</fifths><mode>major</mode></key><time><beats>4</beats><beat-type>4</beat-type></time><clef>${clef}</clef></attributes>\n`;
        if (i === 0) x += `      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${tempo}</per-minute></metronome></direction-type><sound tempo="${tempo}"/></direction>\n`;
      }
      const inBar = pieces.filter(q => q.s >= b * BAR && q.s < (b + 1) * BAR);
      for (const q of inBar) {
        if (p.chords) {
          const c = p.chords.find(c => c.s === q.s);
          if (c) {
            const sp = spell(60 + pc(k.tonic + c.r), key);
            x += `      <harmony><root><root-step>${sp.L}</root-step>${sp.alt ? `<root-alter>${sp.alt}</root-alter>` : ''}</root><kind>${c.q === 'm' ? 'minor' : 'major'}</kind></harmony>\n`;
          }
        }
        const [type, dot] = TYPE[q.d] || ['16th', 0];
        if (q.p == null) {
          x += q.d === BAR ? `      <note><rest measure="yes"/><duration>16</duration><voice>1</voice></note>\n` : `      <note><rest/><duration>${q.d}</duration><voice>1</voice><type>${type}</type>${dot ? '<dot/>' : ''}</note>\n`;
          continue;
        }
        const tie = (q.tiePrev ? '<tie type="stop"/>' : '') + (q.tieNext ? '<tie type="start"/>' : '');
        const tied = (q.tiePrev ? '<tied type="stop"/>' : '') + (q.tieNext ? '<tied type="start"/>' : '');
        const notations = tied ? `<notations>${tied}</notations>` : '';
        if (p.drum) {
          (q.ref.kit || ['kick']).forEach((kk, j) => {
            const [st, oc] = DRUM_X[kk];
            x += `      <note>${j ? '<chord/>' : ''}<unpitched><display-step>${st}</display-step><display-octave>${oc}</display-octave></unpitched><duration>${q.d}</duration><instrument id="${id}-${kk}"/><voice>1</voice><type>${type}</type>${dot ? '<dot/>' : ''}<stem>up</stem>${kk === 'hat' || kk === 'crash' ? '<notehead>x</notehead>' : ''}</note>\n`;
          });
          continue;
        }
        const ps = q.ref && q.ref.chord && q.ref.chord.length > 1 ? q.ref.chord : [q.p];
        ps.forEach((pp, j) => {
          const sp = spell(pp, key);
          let ly = '';
          if (j === 0 && p.lyrics && !q.tiePrev) {
            const m = p.lyrics.map.get(q.ref.id);
            if (m && m.kind === 'syl' && m.text) ly = `<lyric number="1"><syllabic>single</syllabic><text>${esc(m.text)}</text></lyric>`;
            else if (m && m.kind === 'ext') ly = `<lyric number="1"><extend/></lyric>`;
          }
          x += `      <note>${j ? '<chord/>' : ''}<pitch><step>${sp.L}</step>${sp.alt ? `<alter>${sp.alt}</alter>` : ''}<octave>${sp.oct}</octave></pitch><duration>${q.d}</duration>${tie}<voice>1</voice><type>${type}</type>${dot ? '<dot/>' : ''}${notations}${ly}</note>\n`;
        });
      }
      if (b === bars - 1) x += `      <barline location="right"><bar-style>light-heavy</bar-style></barline>\n`;
      x += `    </measure>\n`;
    }
    x += `  </part>\n`;
  });
  x += `</score-partwise>\n`;
  return x;
}
