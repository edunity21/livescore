// LIVE SCORE · 악보 편집기 — 악보의 음표를 눌러 고르고, 높이·길이를 바로 고친다
import * as C from './core.js';
import * as SC from './score.js';
import * as SND from './sound.js';

const LENS = [[1, '16분'], [2, '8분'], [4, '4분'], [6, '점4분'], [8, '2분'], [12, '점2분'], [16, '온']];
const KEYLEN = { '3': 1, '4': 2, '5': 4, '6': 8, '7': 16 };
let active = null;
export const activeEditor = () => active;

// opts: { model: () => ({tempo,key,bars,perLine,title,sub,showTitle,voices:[{id,name,clef,notes,drum,lyrics,chords,editable}]}),
//         onChange(), onPlay(fromUnit), toast(msg), staffwidth }
export function createEditor(host, opts) {
  host.classList.add('editor');
  host.innerHTML = `
    <div class="ed-bar" role="toolbar" aria-label="악보 편집 도구">
      <div class="ed-sel"><span class="ed-dot"></span><b class="ed-what">음표를 눌러 고르세요</b><small class="ed-hint">↑↓ 반음 · Shift+↑↓ 옥타브 · ←→ 이동 · 3~7 길이 · Del 지우기 · 건반을 누르면 그 음으로</small></div>
      <div class="ed-tools">
        <div class="ed-grp" aria-label="음 높이"><button type="button" data-e="up" title="반음 위 (↑)">▲</button><button type="button" data-e="down" title="반음 아래 (↓)">▼</button><button type="button" data-e="oup" title="옥타브 위 (Shift+↑)">8va</button><button type="button" data-e="odown" title="옥타브 아래 (Shift+↓)">8vb</button></div>
        <div class="ed-grp lens" aria-label="음 길이">${LENS.map(([d, n]) => `<button type="button" data-len="${d}">${n}</button>`).join('')}</div>
        <div class="ed-grp"><button type="button" data-e="del" title="지우기 (Delete)">지우기</button><button type="button" data-e="undo" title="되돌리기 (Ctrl+Z)">되돌리기</button><button type="button" data-e="play" class="pl" title="여기부터 듣기">▶ 여기부터</button></div>
      </div>
    </div>
    <div class="score ed-score"></div>`;
  const scoreEl = host.querySelector('.ed-score');
  const E = { marks: [], tune: null, sel: null, hist: [], model: null };

  function render() {
    E.model = opts.model();
    const m = E.model;
    if (!m || !m.voices.length) { scoreEl.innerHTML = '<p class="empty">아직 악보가 없어요.</p>'; return; }
    const { abc, marks } = SC.buildAbcMap({ title: m.title, sub: m.sub, tempo: m.tempo, key: m.key, bars: m.bars, perLine: m.perLine || 4, voices: m.voices, showTitle: !!m.showTitle });
    E.marks = marks;
    E.tune = SC.renderAbc(scoreEl, abc, { click: onClick, staffwidth: opts.staffwidth || 980 });
    paintSel();
  }
  const voiceOf = vi => E.model.voices[vi];
  function markAt(ch) {
    let lo = 0, hi = E.marks.length - 1, best = null;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (E.marks[mid].at <= ch) { best = E.marks[mid]; lo = mid + 1; } else hi = mid - 1; }
    return best;
  }
  function selMarks() {
    const s = E.sel; if (!s) return [];
    return E.marks.filter(m => m.vi === s.vi && (s.ref ? m.q.ref === s.ref : m.q.p == null && m.q.s === s.s));
  }
  function paintSel() {
    scoreEl.querySelectorAll('.ed-on').forEach(e => e.classList.remove('ed-on'));
    const ms = selMarks();
    ms.forEach(m => { scoreEl.querySelectorAll(`.abcjs-v${m.vi}.abcjs-mm${m.bar}.abcjs-n${m.k}`).forEach(e => e.classList.add('ed-on')); });
    label();
  }
  function label() {
    const s = E.sel, what = host.querySelector('.ed-what');
    host.classList.toggle('has-sel', !!s);
    if (!s) { what.textContent = '음표를 눌러 고르세요'; return; }
    const v = voiceOf(s.vi), bar = Math.floor((s.ref ? s.ref.s : s.s) / C.BAR) + 1;
    if (!s.ref) { what.textContent = `${v.name} · ${bar}마디 · 쉼표 — ▲▼나 건반으로 음을 넣어요`; return; }
    const n = s.ref;
    const nm = v.drum ? (n.kit || []).map(k => ({ kick: '큰북', snare: '작은북', hat: '하이햇', crash: '심벌' }[k])).join('+') : (n.chord && n.chord.length > 1 ? '화음 ' : '') + `${C.solName(n.p, E.model.key)}(${C.sciName(n.p, E.model.key)})`;
    what.textContent = `${v.name} · ${bar}마디 · ${nm} · ${(LENS.find(l => l[0] === n.d) || [0, n.d / 4 + '박'])[1]}`;
    host.querySelectorAll('[data-len]').forEach(b => b.classList.toggle('on', +b.dataset.len === n.d));
  }
  function onClick(el) {
    active = api;
    const m = markAt(Math.max(el.startChar, (el.endChar || el.startChar + 1) - 1)); if (!m) return;
    const v = voiceOf(m.vi);
    if (!v.editable) { E.sel = null; paintSel(); opts.toast && opts.toast(v.lockMsg || '이 파트는 여기서 고칠 수 없어요'); return; }
    E.sel = m.q.p == null ? { vi: m.vi, s: m.q.s, d: m.q.d } : { vi: m.vi, ref: m.q.ref };
    paintSel(); preview();
  }
  function preview() {
    const s = E.sel; if (!s || !s.ref || voiceOf(s.vi).drum) return;
    const c = SND.audio(); (s.ref.chord || [s.ref.p]).forEach(p => SND.voice(c, SND.master, voiceOf(s.vi).inst === 'melody' ? 'voice' : 'keys', p, c.currentTime + .01, .35, .7));
  }
  const snap = () => JSON.stringify(E.model.voices.map(v => v.editable ? v.notes : null));
  function commit(fn) {
    const before = snap();
    if (fn() === false) return;
    E.hist.push(before); if (E.hist.length > 80) E.hist.shift();
    opts.onChange && opts.onChange();
    render();
  }
  function sorted(v) { return [...v.notes].sort((a, b) => a.s - b.s); }
  function room(v, s, self) { const nx = sorted(v).find(n => n !== self && n.s > s); return (nx ? nx.s : E.model.bars * C.BAR) - s; }
  function prevPitch(v, s) { const pv = sorted(v).filter(n => n.s < s).pop(); return pv ? pv.p : v.clef === 'bass' ? 43 : v.clef === 'perc' ? 38 : 67; }
  function insertAt(p) {
    const s = E.sel, v = voiceOf(s.vi);
    const n = { p, s: s.s, d: Math.min(s.d, room(v, s.s)) };
    if (v.drum) { n.p = 38; n.kit = ['snare']; }
    if (v.lyricsTarget) { n.id = C.uid(); n.lx = 'n'; }
    v.notes.push(n); v.notes.sort((a, b) => a.s - b.s);
    E.sel = { vi: s.vi, ref: n };
  }
  function pitch(delta) {
    const s = E.sel; if (!s) return;
    const v = voiceOf(s.vi); if (v.drum) return opts.toast && opts.toast('드럼은 높이를 바꾸지 않아요');
    commit(() => {
      if (!s.ref) { insertAt(prevPitch(v, s.s) + (delta > 0 ? 0 : 0)); return; }
      const n = s.ref, np = Math.max(21, Math.min(108, n.p + delta));
      const dd = np - n.p; n.p = np; if (n.chord) n.chord = n.chord.map(x => x + dd);
    });
    preview();
  }
  function setLen(d) {
    const s = E.sel; if (!s) return;
    const v = voiceOf(s.vi);
    commit(() => {
      if (!s.ref) { const r = room(v, s.s); if (r <= 0) return false; insertAt(prevPitch(v, s.s)); E.sel.ref.d = Math.min(d, r); return; }
      const r = room(v, s.ref.s, s.ref);
      if (d > r && opts.toast) opts.toast('다음 음표 앞까지만 늘였어요');
      s.ref.d = Math.max(1, Math.min(d, r));
    });
  }
  function del() {
    const s = E.sel; if (!s || !s.ref) return;
    const v = voiceOf(s.vi), n = s.ref;
    commit(() => { const i = v.notes.indexOf(n); if (i >= 0) v.notes.splice(i, 1); E.sel = { vi: s.vi, s: n.s, d: n.d }; });
  }
  function undo() {
    const last = E.hist.pop(); if (!last) return opts.toast && opts.toast('되돌릴 것이 없어요');
    const arr = JSON.parse(last);
    opts.model().voices.forEach((v, i) => { if (arr[i]) v.notes.splice(0, v.notes.length, ...arr[i]); });
    E.sel = null; opts.onChange && opts.onChange(); render();
  }
  function move(dir) {
    const s = E.sel; if (!s) return;
    const list = E.marks.filter(m => m.vi === s.vi && !m.q.tiePrev);
    const cur = selMarks()[0]; if (!cur) return;
    const i = list.indexOf(list.find(m => m.at === cur.at));
    const nx = list[i + dir]; if (!nx) return;
    E.sel = nx.q.p == null ? { vi: nx.vi, s: nx.q.s, d: nx.q.d } : { vi: nx.vi, ref: nx.q.ref };
    paintSel(); preview();
    const e = scoreEl.querySelector('.ed-on'); if (e && e.scrollIntoView) e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function midiPitch(p) {
    const s = E.sel; if (!s) return false;
    const v = voiceOf(s.vi); if (v.drum) return false;
    commit(() => {
      if (!s.ref) { insertAt(p); return; }
      const n = s.ref, dd = p - n.p; n.p = p; if (n.chord) n.chord = n.chord.map(x => x + dd);
    });
    return true;
  }
  host.querySelector('.ed-bar').addEventListener('click', e => {
    active = api;
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.len) return setLen(+b.dataset.len);
    const a = b.dataset.e;
    if (a === 'undo') return undo();
    if (!E.sel && a !== 'play') return opts.toast && opts.toast('먼저 악보에서 음표를 눌러 골라요');
    if (a === 'up') pitch(1); if (a === 'down') pitch(-1);
    if (a === 'oup') pitch(12); if (a === 'odown') pitch(-12);
    if (a === 'del') del();
    if (a === 'play') { const at = E.sel ? Math.floor((E.sel.ref ? E.sel.ref.s : E.sel.s) / C.BAR) * C.BAR : 0; opts.onPlay && opts.onPlay(at, b); }
  });
  host.addEventListener('pointerdown', () => { active = api; });
  function onKey(e) {
    if (active !== api || !host.offsetParent || e.target.closest('input,textarea,select')) return false;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return true; }
    if (!E.sel) return false;
    if (e.key === 'ArrowUp') { e.preventDefault(); pitch(e.shiftKey ? 12 : 1); return true; }
    if (e.key === 'ArrowDown') { e.preventDefault(); pitch(e.shiftKey ? -12 : -1); return true; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); return true; }
    if (e.key === 'ArrowRight') { e.preventDefault(); move(1); return true; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); del(); return true; }
    if (KEYLEN[e.key]) { e.preventDefault(); setLen(KEYLEN[e.key]); return true; }
    if (e.key === 'Escape') { E.sel = null; paintSel(); return true; }
    return false;
  }
  const api = { render, onKey, midiPitch, clear: () => { E.sel = null; E.hist = []; }, host, get sel() { return E.sel; } };
  return api;
}
