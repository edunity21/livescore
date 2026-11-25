// LIVE SCORE · 화면
import * as C from './core.js';
import * as SND from './sound.js';
import * as MIDI from './midi.js';
import * as SC from './score.js';
import qrcode from '../lib/qrcode.mjs';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const STORE = 'livescore-project-v1';
const ROLE = { lyric: '작사', compose: '작곡', arrange: '편곡', record: '기록', present: '발표' };
const STEPN = ['', '연결하기', '가사 쓰기', '선율 연주', '박 맞춤', '가사 붙이기', 'AI 편곡', '비교·수정', '악보 완성'];
const DUR = { 1: '16분', 2: '♪', 3: '♪.', 4: '♩', 6: '♩.', 8: '2분', 12: '2분.', 16: '온' };
const durLabel = d => DUR[d] || (d / 4) + '박';

// ── 상태 ──
function blank() {
  return {
    v: 1, title: '', group: '', roles: { lyric: '', compose: '', arrange: '', record: '', present: '' }, mode: 'keys',
    tempo: 92, key: 'C', lyrics: [0, 1, 2, 3].map(() => ({ text: '', chorus: false })), take: null, grid: 2, melody: [],
    arr: { settings: { genre: 'pop', mood: 'bright', inst: ['drums', 'bass', 'keys', 'guitar'] }, versions: [], chosen: null, scene: '', why: '', nv: null },
    base: null, decisions: {}, log: [], step: 1, made: false,
  };
}
function load() {
  try { const j = JSON.parse(localStorage.getItem(STORE) || 'null'); if (j && j.v === 1) return Object.assign(blank(), j); } catch (e) { }
  return null;
}
let S = load() || blank();
const U = { step: S.step || 1, sel: null, lySel: null, hist: [], rec: null, bar: null, pick: null, tab: 'auto', suno: { tracks: [], tempo: 120 }, audio: {}, mpos: null, mdur: 4, soundOk: false, playBtn: null, viewer: null };

let saveT = null;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try { S.step = U.step; localStorage.setItem(STORE, JSON.stringify(S)); $('#saveBadge').hidden = false; } catch (e) { $('#saveBadge').hidden = true; }
  }, 300);
}
function pushHist() { U.hist.push(JSON.stringify(S.melody)); if (U.hist.length > 60) U.hist.shift(); }
function undo() { if (!U.hist.length) return toast('되돌릴 것이 없어요'); S.melody = JSON.parse(U.hist.pop()); save(); refresh(); }

function totalBars() {
  const end = Math.max(0, ...S.melody.map(n => n.s + n.d));
  return Math.max(2, S.lyrics.length * 2, Math.ceil(end / C.BAR));
}
const units = () => totalBars() * C.BAR;
const chosen = () => S.arr.versions.find(v => v.id === S.arr.chosen) || null;
const vlab = v => (v && v.source === 'suno' ? 'AI' : '편곡');
const roleName = r => (S.roles[r] ? `${ROLE[r]}(${S.roles[r]})` : ROLE[r]);

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2600);
}
function ask(msg, ok, okText = '계속') {
  const d = $('#askDlg'); $('#askP').textContent = msg; $('#askOk').textContent = okText;
  $('#askOk').onclick = () => { d.close(); ok(); };
  d.showModal();
}
$$('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
const fileBase = () => (S.title || '우리노래').replace(/[\\/:*?"<>|]/g, '').trim() || '우리노래';

// ── 재생 ──
function stopPlay() { SND.stop(); }
function playWith(btn, tracks, opts = {}) {
  if (U.playBtn === btn && SND.isPlaying()) { stopPlay(); return; }
  stopPlay();
  const label = btn ? btn.innerHTML : '';
  if (btn) { btn.innerHTML = '■ 멈춤'; btn.classList.add('playing'); }
  U.playBtn = btn;
  SND.play(tracks, S.tempo, {
    ...opts, onend: () => {
      if (btn) { btn.innerHTML = label; btn.classList.remove('playing'); }
      if (U.playBtn === btn) U.playBtn = null;
      drawStep();
    }
  });
  loop();
}
function verTracks(v, vocal) {
  const tr = [];
  if (vocal) tr.push({ inst: 'voice', notes: vocal, vol: .85 });
  if (v) v.parts.forEach(p => { if (!p.mute) tr.push({ inst: SND.soundOf(p.inst), notes: p.notes, vol: p.inst === 'drums' ? .7 : .45 }); });
  return tr;
}
let raf = null;
function loop() {
  cancelAnimationFrame(raf);
  const tick = () => { drawStep(); if (SND.isPlaying() || U.rec) raf = requestAnimationFrame(tick); };
  raf = requestAnimationFrame(tick);
}

// ── 피아노 롤 ──
function drawRoll(cv, o) {
  const dpr = window.devicePixelRatio || 1;
  const W = Math.max(280, cv.clientWidth), H = +cv.getAttribute('height');
  if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px'; }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const from = (o.from || 0) * C.BAR, bars = o.bars, U16 = bars * C.BAR;
  const all = o.layers.flatMap(l => l.notes).filter(n => n && n.p != null);
  let lo = all.length ? Math.min(...all.map(n => n.p)) - 2 : 57, hi = all.length ? Math.max(...all.map(n => n.p)) + 2 : 79;
  while (hi - lo < 14) { lo--; hi++; }
  const L = 34, T = o.lyr ? 34 : 18, R = 6, B = 6;
  const x = u => L + ((u - from) / U16) * (W - L - R);
  const rowH = (H - T - B) / (hi - lo + 1);
  const y = p => T + (hi - p) * rowH;
  // 바탕
  for (let p = lo; p <= hi; p++) {
    const black = [1, 3, 6, 8, 10].includes(C.pc(p));
    if (black) { g.fillStyle = '#f4f4f4'; g.fillRect(L, y(p), W - L - R, rowH); }
    if (C.pc(p) === 0) { g.fillStyle = '#6e6e6e'; g.font = '10px "Noto Sans KR",sans-serif'; g.textBaseline = 'middle'; g.fillText('도' + (Math.floor(p / 12) - 1), 3, y(p) + rowH / 2); g.fillStyle = '#e3e3e3'; g.fillRect(L, y(p) + rowH - .5, W - L - R, .5); }
  }
  for (let u = from; u <= from + U16; u += 4) {
    const bar = u % C.BAR === 0;
    g.fillStyle = bar ? '#9a9a9a' : '#e6e6e6'; g.fillRect(Math.round(x(u)) - (bar ? .5 : 0), T - (bar ? 6 : 0), bar ? 1 : 1, H - T - B + (bar ? 6 : 0));
    if (bar && u < from + U16) { g.fillStyle = '#111'; g.font = '700 10px Archivo,"Noto Sans KR",sans-serif'; g.textBaseline = 'alphabetic'; g.fillText((u / C.BAR + 1) + '', x(u) + 3, T - 8); }
  }
  if (o.lyr) {
    S.lyrics.forEach((ln, i) => {
      const a = i * 2 * C.BAR; if (a < from || a >= from + U16) return;
      const txt = C.syllables(ln.text).join(' ');
      g.fillStyle = ln.chorus ? '#31684F' : '#6e6e6e'; g.font = '11px "Noto Sans KR",sans-serif';
      g.save(); g.beginPath(); g.rect(x(a) + 14, 0, x(a + 2 * C.BAR) - x(a) - 16, 20); g.clip(); g.fillText(txt, x(a) + 16, 12); g.restore();
    });
  }
  if (o.focus != null) { g.strokeStyle = '#9A382F'; g.lineWidth = 2; g.strokeRect(x(o.focus * C.BAR) + 1, T - 2, x((o.focus + 1) * C.BAR) - x(o.focus * C.BAR) - 2, H - T - B + 4); }
  const ST = {
    raw: { f: 'rgba(110,110,110,.28)', s: 'rgba(110,110,110,.6)' }, q: { f: 'rgba(45,91,215,.18)', s: '#2D5BD7' },
    mel: { f: '#111', s: '#111' }, rec: { f: '#31684F', s: '#31684F' }, same: { f: '#9b9b9b', s: '#9b9b9b' }, diff: { f: '#D9822B', s: '#B5641A' },
    mine: { f: 'rgba(0,0,0,0)', s: '#111' }, sel: { f: '#31684F', s: '#31684F' },
  };
  for (const l of o.layers) {
    const st = ST[l.kind] || ST.mel;
    for (const n of l.notes) {
      if (!n || n.p == null) continue;
      const s = n.s, e = n.s + Math.max(.25, n.d);
      if (e < from || s > from + U16) continue;
      const x0 = x(Math.max(s, from)), x1 = x(Math.min(e, from + U16));
      const kind = n.kind ? (ST[n.kind] || st) : (o.sel && n.id === o.sel ? ST.sel : st);
      g.fillStyle = kind.f; g.strokeStyle = kind.s; g.lineWidth = l.kind === 'mine' ? 2 : 1;
      const yy = y(n.p) + 1, hh = Math.max(3, rowH - 2);
      g.fillRect(x0, yy, Math.max(2, x1 - x0 - 1), hh);
      g.strokeRect(x0 + .5, yy + .5, Math.max(2, x1 - x0 - 2), hh - 1);
    }
    if (l.links) { g.strokeStyle = 'rgba(45,91,215,.5)'; g.lineWidth = 1; l.links.forEach(k => { g.beginPath(); g.moveTo(x(k.from), y(k.p) + rowH / 2); g.lineTo(x(k.to), y(k.p) + rowH / 2); g.stroke(); }); }
  }
  if (o.play != null && o.play >= from && o.play <= from + U16) { g.fillStyle = '#9A382F'; g.fillRect(x(o.play) - 1, T - 6, 2, H - T - B + 6); }
}

// ── 단계 이동 ──
function go(n) {
  n = Math.max(1, Math.min(8, n));
  if (U.rec) stopRec();
  stopPlay();
  U.step = n; save();
  $$('.step').forEach(s => { s.hidden = +s.dataset.step !== n; });
  refresh();
  window.scrollTo(0, 0);
}
function stepDone(i) {
  switch (i) {
    case 1: return S.made;
    case 2: return S.lyrics.some(l => C.syllables(l.text).length);
    case 3: return S.melody.length > 0;
    case 4: return S.melody.length > 0 && (S.mode === 'mouse' || !!S.take);
    case 5: { const r = C.lyricFlow(S.melody, S.lyrics).report; return S.melody.length > 0 && r.length && r.every(x => x.ok); }
    case 6: return !!chosen();
    case 7: { const v = chosen(); if (!v || !S.base) return false; return diffs().every(d => S.decisions[d.bar]); }
    default: return false;
  }
}
function refresh() {
  $$('#steps button').forEach(b => { const i = +b.dataset.step; b.classList.toggle('on', i === U.step); b.classList.toggle('done', stepDone(i)); b.setAttribute('aria-current', i === U.step ? 'step' : 'false'); });
  $('#projName').textContent = S.title ? S.title + (S.group ? ' · ' + S.group : '') : '새 창작곡';
  $('#prevBtn').disabled = U.step === 1;
  $('#nextBtn').innerHTML = U.step === 8 ? '처음으로' : `다음: ${STEPN[U.step + 1]} ▶`;
  $('#pagerMid').textContent = `${U.step} / 8 · ${STEPN[U.step]}`;
  ({ 1: r1, 2: r2, 3: r3, 4: r4, 5: r5, 6: r6, 7: r7, 8: r8 })[U.step]();
}
function drawStep() {
  const pos = SND.position();
  if (U.step === 3) drawRoll3(pos);
  if (U.step === 4) drawRoll4(pos);
  if (U.step === 7) drawRoll7(pos);
}
$('#steps').addEventListener('click', e => { const b = e.target.closest('button[data-step]'); if (b) go(+b.dataset.step); });
$('#prevBtn').onclick = () => go(U.step - 1);
$('#nextBtn').onclick = () => go(U.step === 8 ? 1 : U.step + 1);

// ── 메뉴 ──
const menuBtn = $('#menuBtn'), menuPop = $('#menuPop');
menuBtn.onclick = () => { const o = menuPop.hidden; menuPop.hidden = !o; menuBtn.setAttribute('aria-expanded', o); };
document.addEventListener('click', e => { if (!e.target.closest('.menu')) { menuPop.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); } });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  menuPop.hidden = true;
  const a = b.dataset.act;
  if (a === 'new') ask('지금 곡을 지우고 새 창작곡을 시작할까요? 필요하면 먼저 프로젝트 파일로 저장하세요.', () => { S = blank(); U.hist = []; save(); fillSetup(); go(1); toast('새 창작곡을 시작해요'); }, '새로 시작');
  if (a === 'demo') { const doit = () => { loadDemo(); toast('예시곡 「우리들의 아침」을 불러왔어요'); go(2); }; (S.melody.length || S.lyrics.some(l => l.text)) ? ask('지금 곡 대신 예시곡을 불러올까요?', doit, '불러오기') : doit(); }
  if (a === 'save') { download(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }), fileBase() + '.livescore.json'); }
  if (a === 'open') $('#openFile').click();
  if (a === 'share') share();
});
$('#openFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const j = JSON.parse(await f.text()); if (j.v !== 1) throw 0; S = Object.assign(blank(), j); U.hist = []; save(); fillSetup(); go(S.step || 2); toast('프로젝트를 열었어요'); } catch (x) { toast('LIVE SCORE 프로젝트 파일이 아니에요'); }
  e.target.value = '';
};
function loadDemo() {
  const d = C.demoSong();
  S = blank();
  S.title = d.title; S.group = '예시 모둠'; S.lyrics = d.lyrics; S.made = true;
  // 사람이 친 것처럼 조금씩 어긋난 연주 기록
  const beat = 60 / S.tempo;
  S.take = { tempo: S.tempo, events: d.melody.map((n, i) => ({ p: n.p, v: 70 + (i * 37) % 40, t: (n.s / 4 + (((i * 53) % 9) - 4) * .022) * beat, d: (n.d / 4) * beat * (.9 + ((i * 29) % 7) * .012) })) };
  S.melody = C.quantize(S.take.events, S.tempo, 2, units());
  U.hist = [];
  save(); fillSetup();
}

// ── 1 연결하기 ──
function fillSetup() {
  $('#fTitle').value = S.title; $('#fGroup').value = S.group;
  $$('[data-role]').forEach(i => { i.value = S.roles[i.dataset.role] || ''; });
  $$('#fMode input').forEach(r => { r.checked = r.value === S.mode; });
}
$('#setupForm').addEventListener('submit', e => {
  e.preventDefault();
  S.title = $('#fTitle').value.trim() || '우리 노래';
  S.group = $('#fGroup').value.trim();
  $$('[data-role]').forEach(i => { S.roles[i.dataset.role] = i.value.trim(); });
  S.mode = $$('#fMode input').find(r => r.checked).value;
  S.made = true; save();
  toast('프로젝트를 만들었어요 — 이제 노랫말을 써요');
  go(2);
});
$$('#fMode input').forEach(r => r.addEventListener('change', () => { S.mode = r.value; save(); }));
function r1() { fillSetup(); midiUI(MIDI.midiState); }
function midiUI(st) {
  const n = st.inputs.length, badge = $('#midiBadge');
  badge.dataset.state = n ? 'on' : st.supported ? 'off' : 'no';
  badge.querySelector('span').textContent = n ? 'MIDI 건반 연결됨' : st.supported ? (st.error === 'denied' ? 'MIDI 권한 필요' : '건반 없음') : '건반 연결 불가 브라우저';
  const set = (id, ok, txt) => { const li = $(id); li.className = ok ? 'ok' : ok === false ? 'no' : ''; if (txt) li.querySelector('span').textContent = txt; };
  set('#ck1', st.supported, st.supported ? '건반을 쓸 수 있는 브라우저예요.' : '이 브라우저는 건반 연결이 안 돼요. 노트북 크롬(또는 엣지)에서 열어 주세요. 마우스 입력은 그대로 쓸 수 있어요.');
  set('#ck2', n > 0 ? true : st.error === 'denied' ? false : null, n ? `연결됨: ${st.inputs.map(i => i.name).join(', ')}` : st.error === 'denied' ? 'MIDI 사용 권한이 막혀 있어요. 주소창 왼쪽 아이콘 → MIDI 기기 허용 후 새로 고침.' : '건반을 노트북 USB에 꽂으면 자동으로 찾습니다.');
  set('#ck3', U.soundOk || null, U.soundOk ? '소리가 나요. 준비 끝!' : null);
  $('#midiBanner').hidden = !n; $('#midiName').textContent = n ? st.inputs.map(i => i.name).join(', ') : '';
  const help = $('#midiHelp');
  help.hidden = !!n || !st.supported;
  help.textContent = '건반을 꽂았는데 안 보이면: ① 케이블을 다시 꽂기 ② 다른 프로그램(뮤즈스코어 등)이 건반을 쓰고 있으면 닫기 ③ 건반 다시 찾기.';
}
MIDI.onMidiStatus(st => { midiUI(st); });
$('#findMidi').onclick = () => { MIDI.connectMidi(); toast('건반을 찾고 있어요'); };
$('#testSound').onclick = () => {
  SND.audio(); const c = SND.audio();
  [60, 64, 67, 72].forEach((p, i) => SND.voice(c, SND.master, 'keys', p, c.currentTime + .05 + i * .16, .3, .8));
  U.soundOk = true; midiUI(MIDI.midiState);
};

// ── 건반 입력(실제 건반·화면 건반) ──
const KB_LO = 48, KB_HI = 84;
function buildKb() {
  const kb = $('#kb3'); kb.innerHTML = '';
  for (let p = KB_LO; p <= KB_HI; p++) {
    const black = [1, 3, 6, 8, 10].includes(C.pc(p));
    const k = document.createElement('button');
    k.type = 'button'; k.className = 'k ' + (black ? 'b' : 'w'); k.dataset.p = p;
    k.setAttribute('aria-label', C.sciName(p) + ' ' + C.solName(p));
    if (!black) k.innerHTML = `<span>${C.pc(p) === 0 ? '도' + (Math.floor(p / 12) - 1) : C.solName(p)}</span>`;
    kb.appendChild(k);
  }
  let down = null;
  kb.addEventListener('pointerdown', e => {
    const k = e.target.closest('.k'); if (!k) return; e.preventDefault();
    down = +k.dataset.p; kb.setPointerCapture && kb.setPointerCapture(e.pointerId);
    if (S.mode === 'mouse' && U.step === 3) { mouseAdd(down); return; }
    MIDI.injectMidi({ on: true, p: down, v: 90 });
  });
  const up = () => { if (down != null && !(S.mode === 'mouse' && U.step === 3)) MIDI.injectMidi({ on: false, p: down, v: 0 }); down = null; };
  kb.addEventListener('pointerup', up); kb.addEventListener('pointercancel', up);
}
function kbLight(p, on) { const k = $(`#kb3 .k[data-p="${p}"]`); if (k) k.classList.toggle('on', on); }
MIDI.onMidi(m => {
  if (m.on) {
    SND.noteOn(m.p, m.v); kbLight(m.p, true);
    $('#nowNote').textContent = `지금 누른 음: ${C.solName(m.p, S.key)}(${C.sciName(m.p, S.key)}) · 세기 ${m.v}`;
    if (!U.soundOk) { U.soundOk = true; if (U.step === 1) midiUI(MIDI.midiState); }
    if (U.rec) recOn(m);
  } else {
    SND.noteOff(m.p); kbLight(m.p, false);
    if (U.rec) recOff(m);
  }
});
// 컴퓨터 자판으로도(건반 없을 때 연습): a s d f g h j k = 도~도
const KEYMAP = { a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71, k: 72 };
const kdown = new Set();
document.addEventListener('keydown', e => {
  if (U.step !== 3 || e.repeat || e.target.closest('input,textarea,select')) return;
  const p = KEYMAP[e.key]; if (!p) return;
  if (S.mode === 'mouse') { mouseAdd(p); return; }
  kdown.add(p); MIDI.injectMidi({ on: true, p, v: 88 });
});
document.addEventListener('keyup', e => { const p = KEYMAP[e.key]; if (p && kdown.has(p)) { kdown.delete(p); MIDI.injectMidi({ on: false, p, v: 0 }); } });

// ── 2 가사 쓰기 ──
function r2() {
  const box = $('#lyricRows');
  box.innerHTML = S.lyrics.map((l, i) => `
    <div class="lrow" data-i="${i}">
      <span class="ln">${i + 1}</span>
      <input class="lt" value="${esc(l.text)}" maxlength="40" placeholder="${i === 0 ? '예: 창문 열면 아침 햇살' : '노랫말 한 줄'}" aria-label="${i + 1}번째 줄">
      <button type="button" class="ch ${l.chorus ? 'on' : ''}" aria-pressed="${l.chorus}">후렴</button>
      <button type="button" class="del" aria-label="${i + 1}번째 줄 지우기" ${S.lyrics.length < 2 ? 'disabled' : ''}>✕</button>
    </div>`).join('');
  sylView();
}
$('#lyricRows').addEventListener('input', e => {
  const r = e.target.closest('.lrow'); if (!r || !e.target.classList.contains('lt')) return;
  S.lyrics[+r.dataset.i].text = e.target.value; save(); sylView();
});
$('#lyricRows').addEventListener('click', e => {
  const r = e.target.closest('.lrow'); if (!r) return; const i = +r.dataset.i;
  if (e.target.classList.contains('ch')) { S.lyrics[i].chorus = !S.lyrics[i].chorus; save(); r2(); }
  if (e.target.classList.contains('del')) { S.lyrics.splice(i, 1); save(); r2(); }
});
$('#addLine').onclick = () => { if (S.lyrics.length >= 8) return toast('한 번에 8줄(16마디)까지 쓸 수 있어요'); S.lyrics.push({ text: '', chorus: false }); save(); r2(); $$('#lyricRows .lt').pop().focus(); };
function sylView() {
  let tot = 0;
  $('#sylView').innerHTML = S.lyrics.map((l, i) => {
    const s = C.syllables(l.text); tot += s.length;
    const warn = s.length > 12 ? 'warn' : s.length && s.length < 6 ? 'low' : '';
    return `<div class="sline ${l.chorus ? 'chorus' : ''}">
      <div class="sh"><b>${i + 1}줄</b><span>${i * 2 + 1}–${i * 2 + 2}마디</span>${l.chorus ? '<em>후렴</em>' : ''}<span class="cnt ${warn}">${s.length}음절</span></div>
      <div class="sc">${s.length ? s.map(c => `<i>${esc(c)}</i>`).join('') : '<span class="empty">아직 비어 있어요</span>'}</div>
      ${warn === 'warn' ? '<p class="w">12음절이 넘으면 두 마디에 음이 촘촘해져요. 줄을 나누거나 말을 줄여 봐요.</p>' : ''}
    </div>`;
  }).join('');
  const bars = S.lyrics.length * 2;
  $('#sylSum').innerHTML = `<b>1절 합계</b><span>${S.lyrics.length}줄</span><span>${tot}음절</span><span>${bars}마디</span><span>${bars * 4}박</span><button class="btn sm" type="button" id="toS3">다음: 선율 연주 ▶</button>`;
  $('#toS3').onclick = () => go(3);
}

// ── 3 선율 연주 ──
$('#tempo').oninput = e => { S.tempo = +e.target.value; $('#tempoV').textContent = '♩=' + S.tempo; save(); };
$('#keySel').onchange = e => { S.key = e.target.value; save(); };
function r3() {
  $('#tempo').value = S.tempo; $('#tempoV').textContent = '♩=' + S.tempo; $('#keySel').value = S.key;
  const mouse = S.mode === 'mouse';
  $('#mousePal').hidden = !mouse; $('#recBtn').hidden = mouse;
  $('#s3one').textContent = mouse ? '음표 길이를 고른 뒤 화면 건반을 누르면 음표가 차례로 들어갑니다.' : '예비박 네 번 뒤 건반으로 노래를 연주하면, 누른 음이 막대로 실시간 기록됩니다.';
  $('#recState').textContent = mouse ? '마우스 입력' : S.take ? `녹음됨 · 음 ${S.take.events.length}개` : '대기';
  if (mouse && U.mpos == null) U.mpos = Math.max(0, ...S.melody.map(n => n.s + n.d));
  mposLabel();
  drawRoll3(SND.position());
}
function drawRoll3(play) {
  const cv = $('#roll3'); if (!cv.offsetParent) return;
  const bars = totalBars();
  const layers = [];
  if (U.rec) {
    const tu = 60 / U.rec.tempo / 4, now = SND.audio().currentTime;
    const live = U.rec.events.map(e => ({ p: e.p, s: e.t / tu, d: e.d / tu }));
    U.rec.on.forEach((v, p) => live.push({ p, s: v.t / tu, d: Math.max(.3, (now - U.rec.t0 - v.t) / tu) }));
    layers.push({ kind: 'rec', notes: live });
    play = Math.max(0, (now - U.rec.t0) / tu);
  } else if (S.mode === 'mouse' || !S.take) layers.push({ kind: 'mel', notes: S.melody });
  else { const tu = 60 / S.take.tempo / 4; layers.push({ kind: 'rec', notes: S.take.events.map(e => ({ p: e.p, s: e.t / tu, d: e.d / tu })) }); }
  drawRoll(cv, { bars, layers, lyr: true, play });
}
function startRec() {
  const c = SND.audio();
  const beat = 60 / S.tempo, bars = totalBars();
  const bus = c.createGain(); bus.connect(SND.master);
  const start = c.currentTime + .15, t0 = start + 4 * beat;
  U.rec = { tempo: S.tempo, start, t0, end: t0 + bars * 4 * beat, events: [], on: new Map(), bus };
  const metro = $('#metro').checked;
  for (let i = 0; i < 4 + bars * 4; i++) {
    if (i >= 4 && !metro) break;
    SND.voice(c, bus, 'click', i % 4 === 0 ? 96 : 84, start + i * beat, .05, i < 4 ? .9 : .55);
  }
  $('#recBtn').textContent = '■ 멈춤'; $('#recBtn').classList.add('playing');
  stopPlay();
  loop(); recTick();
}
function recTick() {
  if (!U.rec) return;
  const c = SND.audio(), now = c.currentTime, beat = 60 / U.rec.tempo;
  if (now < U.rec.t0) $('#recState').textContent = '예비박 ' + [1, 2, 3, 4].slice(0, Math.min(4, Math.floor((now - U.rec.start) / beat) + 1)).join('·');
  else { const s = Math.floor(now - U.rec.t0); $('#recState').textContent = `녹음 중 ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
  if (now >= U.rec.end) { stopRec(); return; }
  setTimeout(recTick, 100);
}
function ctxTime(m) { const c = SND.audio(); return c.currentTime - Math.max(0, (performance.now() - (m.time || performance.now())) / 1000); }
function recOn(m) { const t = ctxTime(m) - U.rec.t0; if (t < -(60 / U.rec.tempo) / 2) return; U.rec.on.set(m.p, { t: Math.max(t, -.05), v: m.v }); }
function recOff(m) { const o = U.rec.on.get(m.p); if (!o) return; U.rec.on.delete(m.p); U.rec.events.push({ p: m.p, v: o.v, t: o.t, d: Math.max(.03, ctxTime(m) - U.rec.t0 - o.t) }); }
function stopRec() {
  const r = U.rec; if (!r) return;
  const c = SND.audio(), now = Math.min(c.currentTime, r.end);
  r.on.forEach((o, p) => r.events.push({ p, v: o.v, t: o.t, d: Math.max(.05, now - r.t0 - o.t) }));
  r.bus.gain.setTargetAtTime(0, c.currentTime, .02); setTimeout(() => r.bus.disconnect(), 300);
  U.rec = null;
  $('#recBtn').textContent = '● 녹음'; $('#recBtn').classList.remove('playing');
  if (!r.events.length) { $('#recState').textContent = '녹음된 음이 없어요 — 다시 녹음'; drawStep(); return; }
  r.events.sort((a, b) => a.t - b.t);
  S.take = { tempo: r.tempo, events: r.events.map(e => ({ ...e, t: +e.t.toFixed(4), d: +e.d.toFixed(4) })) };
  pushHist();
  S.melody = C.quantize(S.take.events, S.take.tempo, S.grid || 2, units());
  save(); refresh();
  $('#recState').textContent = `녹음됨 · 음 ${r.events.length}개`;
  toast('녹음했어요 — 4단계에서 박을 맞춰요');
}
$('#recBtn').onclick = () => { if (U.rec) stopRec(); else { if (S.take && S.melody.length) ask('다시 녹음하면 지금 선율이 바뀌어요. 녹음할까요?', startRec, '녹음'); else startRec(); } };
$('#playTake').onclick = e => {
  if (S.mode !== 'mouse' && S.take) {
    const tu = 60 / S.take.tempo / 4;
    playWith(e.currentTarget, [{ inst: 'keys', notes: S.take.events.map(x => ({ p: x.p, s: x.t / tu, d: x.d / tu })), vol: .8 }]);
  } else playWith(e.currentTarget, [{ inst: 'keys', notes: S.melody, vol: .8 }]);
};
// 마우스 입력
$('#mousePal').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.dur) { U.mdur = +b.dataset.dur; $$('#mousePal [data-dur]').forEach(x => x.classList.toggle('on', x === b)); }
  if (b.id === 'mRest') { U.mpos = Math.min(units(), (U.mpos || 0) + U.mdur); }
  if (b.id === 'mBack') {
    pushHist();
    const last = [...S.melody].sort((a, b2) => a.s - b2.s).pop();
    if (last && last.s + last.d >= (U.mpos || 0) - 0) { S.melody = S.melody.filter(n => n !== last); U.mpos = last.s; }
    else U.mpos = Math.max(0, (U.mpos || 0) - U.mdur);
    save();
  }
  if (b.id === 'mClear') { pushHist(); S.melody = []; U.mpos = 0; save(); }
  mposLabel(); drawRoll3();
});
function mouseAdd(p) {
  const c = SND.audio(); SND.voice(c, SND.master, 'keys', p, c.currentTime + .01, .35, .8);
  kbLight(p, true); setTimeout(() => kbLight(p, false), 180);
  $('#nowNote').textContent = `지금 누른 음: ${C.solName(p, S.key)}(${C.sciName(p, S.key)})`;
  const pos = U.mpos || 0;
  if (pos + U.mdur > units()) return toast('마지막 마디까지 다 채웠어요');
  pushHist();
  S.melody = S.melody.filter(n => n.s + n.d <= pos);
  S.melody.push({ id: C.uid(), p, s: pos, d: U.mdur, lx: 'n' });
  U.mpos = pos + U.mdur; U.soundOk = true;
  save(); mposLabel(); drawRoll3();
}
function mposLabel() { const p = U.mpos || 0; $('#mPos').textContent = `다음 음표 자리: ${Math.floor(p / C.BAR) + 1}마디 ${Math.floor((p % C.BAR) / 4) + 1}박`; }

// ── 4 박 맞춤 ──
$('#gridSel').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.grid = +b.dataset.g; save(); r4(); });
$('#doQuant').onclick = () => {
  if (!S.take) return toast(S.mode === 'mouse' ? '마우스로 입력한 음은 이미 박에 맞춰져 있어요' : '3단계에서 먼저 녹음해 주세요');
  pushHist();
  S.melody = C.quantize(S.take.events, S.take.tempo, S.grid, units());
  U.sel = null; save(); r4();
  toast(`${{ 4: '4분음표', 2: '8분음표', 1: '16분음표' }[S.grid]} 단위로 박을 맞췄어요`);
};
$('#playQuant').onclick = e => playWith(e.currentTarget, [{ inst: 'voice', notes: S.melody }]);
function r4() {
  $$('#gridSel button').forEach(b => b.classList.toggle('on', +b.dataset.g === S.grid));
  $('#quantMsg').textContent = !S.take ? (S.mode === 'mouse' ? '마우스로 입력한 음은 이미 박에 맞춰져 있어요. 아래에서 음표를 고칠 수 있어요.' : '3단계에서 녹음하면 원래 연주와 맞춘 결과가 여기에 겹쳐 보여요.') : '점선 회색은 원래 연주, 파랑은 박에 맞춘 위치예요. 단위를 바꿔 가며 우리 노랫말에 맞는 리듬을 골라요.';
  drawRoll4(SND.position());
  const bars = totalBars();
  SC.renderAbc($('#score4'), SC.buildAbc({ tempo: S.tempo, key: S.key, bars, perLine: 4, showTitle: false, voices: [{ id: 'V1', name: '노래', clef: 'treble', notes: S.melody }] }));
  noteChips();
}
function drawRoll4(play) {
  const cv = $('#roll4'); if (!cv.offsetParent) return;
  const layers = [];
  if (S.take) {
    const tu = 60 / S.take.tempo / 4;
    const raw = S.take.events.map(e => ({ p: e.p, s: e.t / tu, d: e.d / tu }));
    const links = raw.map(r => ({ p: r.p, from: r.s, to: Math.round(r.s / S.grid) * S.grid })).filter(k => Math.abs(k.from - k.to) > .05);
    layers.push({ kind: 'raw', notes: raw, links });
  }
  layers.push({ kind: 'q', notes: S.melody });
  drawRoll(cv, { bars: totalBars(), layers, play, sel: U.sel });
}
function noteChips() {
  const box = $('#noteChips');
  const sorted = [...S.melody].sort((a, b) => a.s - b.s);
  if (!sorted.length) { box.innerHTML = '<span class="empty">아직 음표가 없어요. 3단계에서 연주하거나 입력해요.</span>'; return; }
  let html = '', bar = -1;
  sorted.forEach(n => {
    const b = Math.floor(n.s / C.BAR);
    if (b !== bar) { if (bar >= 0) html += '</span>'; html += `<span class="cbar"><em>${b + 1}</em>`; bar = b; }
    html += `<button type="button" class="nc ${U.sel === n.id ? 'on' : ''}" data-id="${n.id}">${C.solName(n.p, S.key)}<small>${durLabel(n.d)}</small></button>`;
  });
  box.innerHTML = html + '</span>';
}
$('#noteChips').addEventListener('click', e => {
  const b = e.target.closest('.nc'); if (!b) return;
  U.sel = U.sel === b.dataset.id ? null : b.dataset.id;
  const n = S.melody.find(x => x.id === U.sel);
  if (n) { const c = SND.audio(); SND.voice(c, SND.master, 'voice', n.p, c.currentTime + .01, .35, .8); }
  noteChips(); drawRoll4();
});
$('#noteTools').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const ed = b.dataset.ed;
  if (ed === 'undo') return undo();
  const n = S.melody.find(x => x.id === U.sel);
  if (!n) return toast('먼저 고칠 음표를 눌러 골라요');
  pushHist();
  const sorted = [...S.melody].sort((a, c) => a.s - c.s), nx = sorted[sorted.indexOf(n) + 1];
  if (ed === 'up') n.p = Math.min(96, n.p + 1);
  if (ed === 'down') n.p = Math.max(36, n.p - 1);
  if (ed === 'longer') {
    const gap = (nx ? nx.s : units()) - (n.s + n.d);
    if (gap >= 2) n.d += 2; else if (gap >= 1) n.d += 1;
    else if (nx && nx.d > 2) { nx.s += 2; nx.d -= 2; n.d += 2; }
    else { U.hist.pop(); return toast('다음 음표와 붙어 있어 더 길게 할 수 없어요'); }
  }
  if (ed === 'shorter') { if (n.d > 2) n.d -= 2; else if (n.d > 1) n.d -= 1; else { U.hist.pop(); return toast('더 짧게 할 수 없어요'); } }
  if (ed === 'del') { S.melody = S.melody.filter(x => x !== n); U.sel = null; }
  if (n && ed !== 'del') { const c = SND.audio(); SND.voice(c, SND.master, 'voice', n.p, c.currentTime + .01, .3, .8); }
  save(); r4();
});

// ── 5 가사 붙이기 ──
function r5() {
  const bars = totalBars();
  const mv = SC.melodyVoice(S.melody, S.lyrics, null);
  SC.renderAbc($('#score5'), SC.buildAbc({ tempo: S.tempo, key: S.key, bars, perLine: 4, showTitle: false, voices: [mv] }));
  const { map, report } = mv.lyrics;
  const sorted = [...S.melody].filter(n => n.p != null).sort((a, b) => a.s - b.s);
  $('#lyEdit').innerHTML = S.lyrics.map((l, li) => {
    const ns = sorted.filter(n => n.s >= li * 32 && n.s < (li + 1) * 32);
    const syl = C.syllables(l.text);
    const rep = report[li];
    const cells = ns.map(n => {
      const m = map.get(n.id) || { kind: 'none', text: '' };
      let lab = '';
      if (m.kind === 'ext') lab = '<span class="ext">⌒</span>';
      else if (m.kind === 'syl') lab = [...m.text].map((ch, k) => `<span class="sy" data-li="${li}" data-j="${m.idx + k}">${esc(ch)}</span>`).join('');
      else lab = '<span class="miss">?</span>';
      const barStart = n.s % C.BAR === 0 || ns.indexOf(n) === 0 || Math.floor(n.s / C.BAR) !== Math.floor(ns[ns.indexOf(n) - 1].s / C.BAR);
      return `<div class="cell ${U.lySel === n.id ? 'on' : ''} ${n.lx === 'd' ? 'dbl' : ''} ${barStart ? 'bs' : ''}" data-id="${n.id}" data-li="${li}"><b>${C.solName(n.p, S.key)}</b><small>${durLabel(n.d)}</small><div class="sl">${lab}</div></div>`;
    }).join('');
    const extra = rep && rep.extra.length ? `<div class="over">남은 글자 ${rep.extra.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : '';
    return `<div class="lyline ${rep && rep.ok ? 'ok' : 'bad'}"><div class="lh"><b>${li + 1}줄</b><span>${li * 2 + 1}–${li * 2 + 2}마디</span><span class="tx">${esc(syl.join(' '))}</span></div><div class="cells">${cells || '<span class="empty">이 마디에 음표가 없어요</span>'}</div>${extra}</div>`;
  }).join('');
  $('#lyCheck').innerHTML = report.map(r => {
    const diff = r.syl - r.slots;
    const why = r.ok ? '✓ 맞음' : r.syl === 0 ? '노랫말이 비어 있어요' : diff > 0 ? `글자가 ${diff}개 남아요` : `음표 칸이 ${-diff}개 남아요`;
    return `<li class="${r.ok ? 'ok' : 'bad'}"><b>${r.line + 1}줄</b><span>글자 ${r.syl} · 음표 칸 ${r.slots}</span><em>${why}</em></li>`;
  }).join('') + (report.length && report.every(r => r.ok) ? '<li class="done">모든 줄이 맞아요. 가사가 붙은 악보가 완성됐어요 → AI 편곡으로</li>' : '');
}
$('#lyEdit').addEventListener('click', e => {
  const c = e.target.closest('.cell'); if (!c || dragged) return;
  U.lySel = U.lySel === c.dataset.id ? null : c.dataset.id;
  $$('#lyEdit .cell').forEach(x => x.classList.toggle('on', x.dataset.id === U.lySel));
});
$('#lyTools').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.ly === 'undo') return undo();
  const n = S.melody.find(x => x.id === U.lySel);
  if (!n) return toast('먼저 음표 칸을 눌러 골라요');
  const li = Math.floor(n.s / 32);
  const first = S.melody.filter(x => x.p != null && Math.floor(x.s / 32) === li).sort((a, c) => a.s - c.s)[0];
  if (b.dataset.ly === 'e' && first === n) return toast('줄의 첫 음은 앞 글자를 늘일 수 없어요');
  pushHist(); n.lx = b.dataset.ly; save(); r5();
});
// 끌어 놓기
let drag = null, dragged = false;
$('#lyEdit').addEventListener('pointerdown', e => {
  const sy = e.target.closest('.sy'); if (!sy) return;
  e.preventDefault(); dragged = false;
  const g = document.createElement('div'); g.className = 'drag-ghost'; g.textContent = sy.textContent; document.body.appendChild(g);
  drag = { li: +sy.dataset.li, j: +sy.dataset.j, g, x0: e.clientX, y0: e.clientY };
  moveGhost(e);
});
function moveGhost(e) { if (!drag) return; drag.g.style.left = e.clientX + 'px'; drag.g.style.top = e.clientY + 'px'; }
document.addEventListener('pointermove', e => {
  if (!drag) return; moveGhost(e);
  if (Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0) > 6) dragged = true;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const c = el && el.closest('.cell');
  $$('#lyEdit .cell').forEach(x => x.classList.toggle('drop', x === c && +c.dataset.li === drag.li));
});
document.addEventListener('pointerup', e => {
  if (!drag) return;
  const d = drag; drag = null; d.g.remove();
  $$('#lyEdit .cell.drop').forEach(x => x.classList.remove('drop'));
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const c = el && el.closest('.cell');
  if (dragged && c && +c.dataset.li === d.li) {
    pushHist(); C.placeSyllable(S.melody, S.lyrics, d.li, d.j, c.dataset.id); save(); r5();
  } else if (dragged && c) toast('같은 줄 안에서만 옮길 수 있어요');
  setTimeout(() => { dragged = false; }, 0);
});
$('#playSong5').onclick = e => playWith(e.currentTarget, [{ inst: 'voice', notes: S.melody }]);

// ── 6 AI 편곡 ──
function chipsGroup(box, obj, sel, multi) {
  box.innerHTML = Object.entries(obj).map(([k, v]) => `<button type="button" data-k="${k}" class="${(multi ? sel.includes(k) : sel === k) ? 'on' : ''}" aria-pressed="${multi ? sel.includes(k) : sel === k}">${typeof v === 'string' ? v : v.name}</button>`).join('');
}
function r6() {
  const st = S.arr.settings;
  chipsGroup($('#optGenre'), C.GENRES, st.genre);
  chipsGroup($('#optMood'), C.MOODS, st.mood);
  chipsGroup($('#optInst'), Object.fromEntries(C.INST_ORDER.slice().reverse().map(k => [k, C.INSTS[k]])), st.inst, true);
  $('#scene').value = S.arr.scene || ''; $('#pickWhy').value = S.arr.why || '';
  $$('.tabs [data-tab]').forEach(t => t.setAttribute('aria-selected', t.dataset.tab === U.tab));
  $('#tabAuto').hidden = U.tab !== 'auto'; $('#tabSuno').hidden = U.tab !== 'suno';
  versionsUI();
}
$('.tabs').addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (!t) return; U.tab = t.dataset.tab; r6(); });
$('#optGenre').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.arr.settings.genre = b.dataset.k; save(); r6(); };
$('#optMood').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.arr.settings.mood = b.dataset.k; save(); r6(); };
$('#optInst').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  const a = S.arr.settings.inst, k = b.dataset.k;
  S.arr.settings.inst = a.includes(k) ? a.filter(x => x !== k) : [...a, k];
  save(); r6();
};
$('#scene').oninput = e => { S.arr.scene = e.target.value; save(); };
$('#pickWhy').oninput = e => { S.arr.why = e.target.value; save(); };
const VARN = ['기본 코드', '색채 코드', '빠른 코드 바꿈'];
$('#genArr').onclick = () => {
  if (!S.melody.length) return toast('먼저 선율을 만들어 주세요 (3단계)');
  if (!S.arr.settings.inst.length) return toast('악기를 하나 이상 골라 주세요');
  const st = clone(S.arr.settings);
  const keep = S.arr.versions.filter(v => v.source === 'suno');
  const slots = ['A', 'B', 'C'].filter(id => !keep.some(v => v.id === id));
  const made = slots.map((id, i) => {
    const r = C.arrange(S.melody, S.lyrics, S.key, st, i);
    return { id, source: 'auto', name: `${C.GENRES[st.genre]} · ${C.MOODS[st.mood]} · ${VARN[i]}`, settings: st, variant: i, chords: r.chords, parts: r.parts, vocal: C.styleVocal(S.melody, st, i, S.key), bars: r.bars };
  });
  S.arr.versions = [...keep, ...made].sort((a, b) => a.id.localeCompare(b.id));
  if (S.arr.chosen && !S.arr.versions.some(v => v.id === S.arr.chosen)) S.arr.chosen = null;
  if (made.some(v => v.id === S.arr.chosen)) { S.arr.chosen = null; S.base = null; }
  save(); versionsUI();
  toast(`편곡 ${made.length}가지를 만들었어요 — 끝까지 들어 보고 골라요`);
  $('#verWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
};
function progression(v) {
  const per = new Map();
  v.chords.forEach(c => { const b = Math.floor(c.s / C.BAR); if (!per.has(b)) per.set(b, []); per.get(b).push(c.name); });
  return [...per.values()].map(a => a.join(' ')).join(' | ');
}
function versionsUI() {
  const vs = S.arr.versions;
  $('#verWrap').hidden = !vs.length;
  if (!vs.length) return;
  $('#vers').innerHTML = vs.map(v => `
    <article class="ver ${S.arr.chosen === v.id ? 'on' : ''}" data-id="${v.id}">
      <div class="vh"><b class="vid">${v.id}</b><div><h3>${esc(v.name)}</h3><span class="tag ${v.source}">${v.source === 'suno' ? '수노 AI' : '자동 편곡'}</span></div></div>
      <p class="prog">${esc(progression(v))}</p>
      <p class="vparts">${v.parts.map(p => esc(p.name)).join(' · ')}</p>
      ${U.audio[v.id] ? `<audio controls preload="none" src="${U.audio[v.id]}"></audio>` : ''}
      <div class="row"><button type="button" class="btn ghost sm" data-play="${v.id}">▶ 끝까지 듣기</button><button type="button" class="btn sm" data-choose="${v.id}">${S.arr.chosen === v.id ? '✓ 선택됨' : '선택'}</button></div>
    </article>`).join('');
  const v = chosen();
  $('#partList').innerHTML = v ? [`<li><b>노래</b><span>${v.vocal ? v.vocal.length + '음' : '없음'}</span><em>${v.vocal && v.vocal.length ? '✓ 음표로' : '노래 파트 없음'}</em></li>`, ...v.parts.map(p => `<li><b>${esc(p.name)}</b><span>${p.notes.length}개</span><em>✓ 음표로</em><button type="button" class="mute ${p.mute ? 'on' : ''}" data-mute="${p.id}">${p.mute ? '소리 켜기' : '소리 끄기'}</button></li>`)].join('') : '<li class="empty">편곡을 하나 고르면 파트가 여기에 나뉘어 나와요.</li>';
}
$('#vers').addEventListener('click', e => {
  const p = e.target.closest('[data-play]'), c = e.target.closest('[data-choose]');
  if (p) { const v = S.arr.versions.find(x => x.id === p.dataset.play); playWith(p, verTracks(v, v.vocal)); }
  if (c) {
    const id = c.dataset.choose;
    const doit = () => { S.arr.chosen = id; S.base = clone(S.melody); S.decisions = {}; S.log = []; U.bar = null; save(); versionsUI(); refresh(); toast(`${id} 편곡을 골랐어요 — 고른 이유를 남기고 7단계로`); };
    if (S.arr.chosen && S.arr.chosen !== id && S.log.length) ask('편곡을 바꾸면 7단계 결정 기록이 처음부터 다시 시작돼요. 바꿀까요?', doit, '바꾸기'); else if (S.arr.chosen !== id) doit();
  }
});
$('#partList').addEventListener('click', e => {
  const m = e.target.closest('[data-mute]'); if (!m) return;
  const p = chosen().parts.find(x => x.id === m.dataset.mute); p.mute = !p.mute; save(); versionsUI();
});
// 수노 MIDI
function guessPart(name, tr) {
  const n = (name + ' ' + (tr.name || '')).toLowerCase();
  if (tr.ch === 9 || /drum|perc|드럼/.test(n)) return 'drums';
  if (/vocal|voice|vox|sing|lead|보컬|노래/.test(n)) return 'melody';
  if (/bass|베이스/.test(n)) return 'bass';
  if (/guitar|gtr|기타/.test(n)) return 'guitar';
  if (/string|violin|cello|스트링/.test(n)) return 'strings';
  if (/flute|wood|플루트/.test(n)) return 'flute';
  if (/brass|horn|sax|trumpet|관악/.test(n)) return 'brass';
  return 'keys';
}
const PARTOPT = { melody: '노래', drums: '드럼', bass: '베이스기타', guitar: '일렉기타', keys: '키보드', strings: '스트링', flute: '플루트', brass: '관악기', skip: '빼기' };
$('#sMidi').onchange = async e => {
  const files = [...e.target.files]; if (!files.length) return;
  U.suno.tracks = [];
  for (const f of files) {
    try {
      const m = MIDI.parseMidi(await f.arrayBuffer());
      U.suno.tempo = m.tempo;
      m.tracks.forEach((tr, i) => U.suno.tracks.push({ file: f.name, name: tr.name, notes: tr.notes, ch: tr.ch, part: guessPart(f.name, tr), key: f.name + i }));
    } catch (x) { toast(`${f.name}: ${x.message || '읽을 수 없는 파일'}`); }
  }
  sunoTracksUI();
};
$('#sAudio').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const slot = $('#sSlot').value;
  if (U.audio[slot]) URL.revokeObjectURL(U.audio[slot]);
  U.audio[slot] = URL.createObjectURL(f); toast(`${slot} 칸에 음원을 붙였어요 (이 기기에서만)`); versionsUI();
};
function sunoTracksUI() {
  const t = U.suno.tracks;
  $('#sAlign').hidden = !t.length;
  $('#sTracks').innerHTML = t.length ? `<table><thead><tr><th>파일</th><th>트랙</th><th>음 개수</th><th>파트</th></tr></thead><tbody>${t.map((x, i) => `<tr><td>${esc(x.file)}</td><td>${esc(x.name || '—')}</td><td>${x.notes.length}</td><td><select data-ti="${i}">${Object.entries(PARTOPT).map(([k, v]) => `<option value="${k}" ${x.part === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>` : '';
  if (t.length) {
    $('#sBpm').value = U.suno.tempo || S.tempo;
    const voc = t.find(x => x.part === 'melody') || t[0];
    const first = Math.min(...voc.notes.map(n => n.t));
    const barSec = 60 / (U.suno.tempo || S.tempo) * 4;
    $('#sBar').value = Math.floor(first / barSec + .02) + 1;
    $('#sMsg').textContent = `MIDI 빠르기 ♩=${U.suno.tempo}. 수노 곡의 실제 빠르기와 다르면 고쳐 주세요. 노래가 시작되는 마디를 맞추면 그 마디부터 ${totalBars()}마디를 가져와요.`;
  }
}
$('#sTracks').addEventListener('change', e => { const s = e.target.closest('select[data-ti]'); if (s) U.suno.tracks[+s.dataset.ti].part = s.value; });
$('#sApply').onclick = () => {
  const t = U.suno.tracks.filter(x => x.part !== 'skip'); if (!t.length) return toast('가져올 트랙이 없어요');
  const bpm = +$('#sBpm').value || 120, from = Math.max(0, (+$('#sBar').value || 1) - 1), off = +$('#sOff').value || 0, grid = +$('#sGrid').value || 2;
  const bars = totalBars();
  const DK = p => (p === 35 || p === 36 ? 'kick' : [37, 38, 39, 40].includes(p) ? 'snare' : [49, 51, 52, 55, 57].includes(p) ? 'crash' : 'hat');
  let vocal = null; const parts = [];
  t.forEach(tr => {
    if (tr.part === 'drums') {
      const raw = MIDI.stemToNotes(tr.notes, bpm, off, grid, from, bars, false);
      const by = new Map();
      raw.forEach(n => { const kit = (n.chord || [n.p]).map(DK); if (!by.has(n.s)) by.set(n.s, new Set()); kit.forEach(k => by.get(n.s).add(k)); });
      const ss = [...by.keys()].sort((a, b) => a - b);
      parts.push({ id: 'drums' + parts.length, name: '드럼', inst: 'drums', clef: 'perc', notes: ss.map((s, i) => ({ s, d: Math.min((ss[i + 1] ?? bars * C.BAR) - s, 4), p: 36, kit: [...by.get(s)] })) });
      return;
    }
    const mono = ['melody', 'bass', 'flute'].includes(tr.part);
    const notes = MIDI.stemToNotes(tr.notes, bpm, off, grid, from, bars, mono);
    if (tr.part === 'melody') { vocal = notes.map(n => ({ id: C.uid(), p: n.p, s: n.s, d: n.d, lx: 'n' })); return; }
    const info = C.INSTS[tr.part];
    parts.push({ id: tr.part + parts.length, name: info.name, inst: tr.part, clef: tr.part === 'bass' ? 'bass' : 'treble', notes: notes.map(n => ({ p: n.p, s: n.s, d: n.d, chord: n.chord })) });
  });
  parts.sort((a, b) => C.INST_ORDER.indexOf(a.inst) - C.INST_ORDER.indexOf(b.inst));
  const harm = [...(vocal || []), ...parts.filter(p => p.inst !== 'drums').flatMap(p => p.notes.flatMap(n => (n.chord || [n.p]).map(q => ({ p: q, s: n.s, d: n.d }))))];
  const chords = C.harmonize(harm.length ? harm : S.melody, bars, S.key, { pool: ['I', 'ii', 'iii', 'IV', 'V', 'vi'] });
  const slot = $('#sSlot').value;
  const v = { id: slot, source: 'suno', name: $('#sName').value.trim() || `수노 편곡 ${slot}`, parts, vocal: vocal || [], chords, bars };
  S.arr.versions = [...S.arr.versions.filter(x => x.id !== slot), v].sort((a, b) => a.id.localeCompare(b.id));
  if (S.arr.chosen === slot) { S.base = clone(S.melody); S.decisions = {}; S.log = []; }
  save(); versionsUI();
  $('#sMsg').textContent = vocal ? `${slot} 칸에 수노 편곡을 넣었어요. 노래 ${vocal.length}음 · 파트 ${parts.length}개.` : `${slot} 칸에 넣었어요. 노래 트랙이 없어서 7단계 비교는 할 수 없어요 — 노래 MIDI를 '노래'로 지정해 주세요.`;
  toast('✓ 음표로 바꿨어요');
};

// ── 7 비교·수정 ──
function diffs() { const v = chosen(); if (!v || !S.base) return []; return C.diffBars(S.base, v.vocal || [], totalBars()); }
const BANK = ['빠르기', '셈여림', '음색', '리듬', '화음', '짜임새', '구성', '센박', '말맛', '또렷하게'];
function r7() {
  const v = chosen();
  $$('.vlab').forEach(x => { x.textContent = vlab(v) === 'AI' ? 'AI' : '편곡'; });
  $('.vlab2').textContent = vlab(v) === 'AI' ? 'AI가' : '편곡이';
  if (!v) { $('#cmpBody').hidden = true; $('#cmpEmpty').hidden = false; $('#cmpEmpty').innerHTML = '<h2>아직 고른 편곡이 없어요</h2><p>6단계에서 편곡 3가지를 끝까지 듣고 하나를 골라 주세요.</p><button class="btn" type="button" id="to6">6단계로 가기</button>'; $('#to6').onclick = () => go(6); return; }
  if (!S.base) S.base = clone(S.melody);
  const ds = diffs();
  if (!ds.length) { $('#cmpBody').hidden = true; $('#cmpEmpty').hidden = false; $('#cmpEmpty').innerHTML = `<h2>바뀐 마디가 없어요</h2><p>${esc(v.name)}은 내 선율을 그대로 썼어요. 다른 편곡을 골라 비교하거나 8단계로 가서 총보를 완성해요.</p><button class="btn" type="button" id="to8">8단계로 가기</button>`; $('#to8').onclick = () => go(8); return; }
  $('#cmpBody').hidden = false; $('#cmpEmpty').hidden = true;
  if (U.bar == null || !ds.some(d => d.bar === U.bar)) U.bar = (ds.find(d => !S.decisions[d.bar]) || ds[0]).bar;
  $('#barTabs').innerHTML = ds.map(d => { const dc = S.decisions[d.bar]; return `<button type="button" data-bar="${d.bar}" class="${d.bar === U.bar ? 'on' : ''} ${dc ? 'done ' + dc.choice : ''}"><b>${d.bar + 1}마디</b><span>${d.kind}</span>${dc ? `<em>${dc.choice === 'mine' ? '내 것' : vlab(v)}</em>` : ''}</button>`; }).join('');
  const d = ds.find(x => x.bar === U.bar);
  $('#barAlert').textContent = `${d.bar + 1}마디: ${vlab(v) === 'AI' ? 'AI가' : '편곡이'} ${d.kind}을 바꿨어요`;
  const word = d.rhythm ? (d.pitch ? '선율' : '리듬') : '음';
  $('.choose [data-pick=mine]').textContent = `✓ 내 ${word} 유지`;
  $('.choose [data-pick=ai]').textContent = `${vlab(v)} ${word} 쓰기`;
  U.word = word;
  const dc = S.decisions[d.bar];
  U.pick = U.pick && U.pickBar === d.bar ? U.pick : dc ? dc.choice : null; U.pickBar = d.bar;
  $$('.choose .opt-c').forEach(o => o.classList.toggle('on', o.dataset.c === U.pick));
  if (U.whyBar !== d.bar) { $('#why').value = dc ? dc.why : ''; U.whyBar = d.bar; }
  $('#bank').innerHTML = '<span class="lab">낱말 은행</span>' + BANK.map(w => `<button type="button">${w}</button>`).join('');
  $('#who').innerHTML = Object.keys(ROLE).map(r => `<option value="${r}" ${r === 'record' ? 'selected' : ''}>${esc(roleName(r))}</option>`).join('') + '<option value="all">모둠 전체</option>';
  if (dc) $('#who').value = dc.who;
  validDec();
  // 그 줄(2마디) 악보: 내 선율 / 편곡 버전
  const line = Math.floor(d.bar / 2), a = line * 2 * C.BAR;
  const shift = ns => ns.filter(n => n.p != null && n.s >= a && n.s < a + 2 * C.BAR).map(n => ({ ...n, s: n.s - a }));
  const nm = vlab(v) === 'AI' ? 'AI 버전' : '편곡 버전';
  SC.renderAbc($('#score7'), SC.buildAbc({ tempo: S.tempo, key: S.key, bars: 2, perLine: 2, showTitle: false, voices: [{ id: 'M', name: '내 선율', clef: 'treble', notes: shift(S.base) }, { id: 'A', name: nm, clef: 'treble', notes: shift(v.vocal) }] }), { staffwidth: 640 });
  drawRoll7(SND.position());
  stat('#stat7'); logUI();
}
function drawRoll7(play) {
  const cv = $('#roll7'); if (!cv.offsetParent) return;
  const v = chosen(); if (!v || U.bar == null) return;
  const line = Math.floor(U.bar / 2);
  const mine = S.base.filter(n => n.p != null);
  const ai = (v.vocal || []).map(n => ({ ...n, kind: C.sameNote(n, mine) ? 'same' : 'diff' }));
  drawRoll(cv, { bars: 2, from: line * 2, layers: [{ kind: 'same', notes: ai }, { kind: 'mine', notes: mine }], focus: U.bar, play });
}
$('#barTabs').addEventListener('click', e => { const b = e.target.closest('[data-bar]'); if (!b) return; U.bar = +b.dataset.bar; U.pick = null; r7(); });
$('.choose').addEventListener('click', e => {
  const v = chosen(); const d = U.bar; if (!v || d == null) return;
  const pl = e.target.closest('[data-pl]'), pk = e.target.closest('[data-pick]');
  if (pl) {
    const line = Math.floor(d / 2), a = line * 2 * C.BAR, b = a + 2 * C.BAR;
    const voc = pl.dataset.pl === 'mine' ? S.base : v.vocal;
    playWith(pl, verTracks(v, voc), { from: a, to: b });
  }
  if (pk) { U.pick = pk.dataset.pick; $$('.choose .opt-c').forEach(o => o.classList.toggle('on', o.dataset.c === U.pick)); validDec(); }
});
$('#bank').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const w = $('#why'); w.value = (w.value.trim() + ' ' + b.textContent).trim(); w.focus(); validDec(); });
$('#why').addEventListener('input', validDec);
function validDec() {
  const ok = !!U.pick && $('#why').value.trim().length >= 4;
  $('#saveDec').disabled = !ok;
  $('#decMsg').textContent = !U.pick ? '두 쪽을 모두 들어 본 뒤 하나를 골라요.' : $('#why').value.trim().length < 4 ? '고친 이유를 한 줄로 써 주세요. (어디서 + 무엇이 + 어떻게 들려서)' : '';
}
$('#saveDec').onclick = () => {
  const v = chosen(), bar = U.bar; if (!v || bar == null || !U.pick) return;
  const why = $('#why').value.trim(), who = $('#who').value;
  const d = diffs().find(x => x.bar === bar);
  pushHist();
  const a = bar * C.BAR, b = a + C.BAR;
  const src = U.pick === 'ai' ? v.vocal : S.base;
  S.melody = S.melody.filter(n => !(n.s >= a && n.s < b));
  src.filter(n => n.p != null && n.s >= a && n.s < b).forEach(n => S.melody.push({ id: C.uid(), p: n.p, s: n.s, d: Math.min(n.d, (S.melody.find(m => m.s >= b) || { s: Infinity }).s - n.s), lx: U.pick === 'mine' ? (n.lx || 'n') : 'n' }));
  S.melody.sort((x, y) => x.s - y.s);
  S.decisions[bar] = { choice: U.pick, why, who, at: Date.now() };
  S.log.push({ bar, choice: U.pick, why, who, kind: d ? d.kind : '', word: U.word || '리듬', at: Date.now() });
  save();
  const rep = C.lyricFlow(S.melody, S.lyrics).report;
  const bad = rep.filter(r => !r.ok).map(r => r.line + 1);
  toast(`${bar + 1}마디 결정을 저장했어요`);
  const next = diffs().find(x => !S.decisions[x.bar]);
  U.pick = null; U.whyBar = null;
  if (next) U.bar = next.bar;
  r7(); refresh();
  if (bad.length) $('#decMsg').textContent = `가사 칸이 맞지 않는 줄이 있어요(${bad.join('·')}줄) → 5단계에서 맞춰 주세요.`;
  else if (!next) $('#decMsg').textContent = '바뀐 마디를 모두 정했어요. 8단계에서 총보를 완성해요.';
};
function counts() { const ds = Object.values(S.decisions); return { n: S.log.length, mine: ds.filter(d => d.choice === 'mine').length, ai: ds.filter(d => d.choice === 'ai').length }; }
function stat(sel) { const c = counts(), v = chosen(); $(sel).innerHTML = `<b>수정 ${c.n}회</b><span>학생 결정 ${c.mine}</span><span>${vlab(v)} 채택 ${c.ai}</span>`; }
function logUI() {
  const v = chosen();
  $('#log').innerHTML = S.log.length ? S.log.slice().reverse().map(l => `<li><b>${l.bar + 1}마디</b><span class="c ${l.choice}">${l.choice === 'mine' ? `내 ${l.word || '리듬'} 유지` : `${vlab(v)} ${l.word || '리듬'} 쓰기`}</span><p>${esc(l.why)}</p><small>${esc(l.who === 'all' ? '모둠 전체' : roleName(l.who))} · ${new Date(l.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</small></li>`).join('') : '<li class="empty">아직 기록이 없어요. 주황 마디마다 결정과 이유가 여기에 쌓여요.</li>';
}

// ── 8 악보 완성 ──
function fullVoices(melody) {
  const v = chosen();
  const nv = S.arr.nv && S.arr.nv.of === S.arr.chosen ? S.arr.nv : null;
  const parts = nv ? nv.parts : v ? v.parts : [];
  const chords = nv ? nv.chords : v ? v.chords : null;
  const voices = [SC.melodyVoice(melody, S.lyrics, chords, '노래', 'V1')];
  parts.forEach((p, i) => voices.push({ id: 'P' + i, name: p.name, clef: p.clef, notes: p.notes, drum: p.inst === 'drums' }));
  return { voices, parts, chords };
}
function r8() {
  const bars = totalBars();
  const { voices, parts } = fullVoices(S.melody);
  SC.renderAbc($('#score8'), SC.buildAbc({ title: S.title || '우리 노래', sub: [S.group, S.roles.lyric && '작사 ' + S.roles.lyric, S.roles.compose && '작곡 ' + S.roles.compose].filter(Boolean).join(' · '), tempo: S.tempo, key: S.key, bars, perLine: 4, voices }), { staffwidth: 980 });
  $('#scoreInfo').textContent = `${bars}마디 · 가사 · 코드 · 파트 ${voices.length}`;
  const v = chosen();
  $$('.vlab').forEach(x => { x.textContent = vlab(v) === 'AI' ? 'AI' : '편곡'; });
  $('#playFirst').disabled = !v; stat('#stat8');
}
function exportParts() {
  const { voices, parts, chords } = fullVoices(S.melody);
  const flow = C.lyricFlow(S.melody, S.lyrics);
  return [{ name: '노래', clef: 'treble', notes: S.melody, lyrics: flow, chords, program: 53 }, ...parts.map(p => ({ name: p.name, clef: p.clef, notes: p.notes, drum: p.inst === 'drums', program: (C.INSTS[p.inst] || {}).gm }))];
}
$('#exXml').onclick = () => {
  if (!S.melody.length) return toast('아직 선율이 없어요');
  const xml = SC.buildMusicXML({ title: S.title, sub: S.group, tempo: S.tempo, key: S.key, bars: totalBars(), parts: exportParts() });
  download(new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' }), fileBase() + '.musicxml');
  toast('악보 파일을 받았어요 — 뮤즈스코어에서 열어요');
};
$('#exMid').onclick = () => {
  if (!S.melody.length) return toast('아직 선율이 없어요');
  const tr = exportParts().map(p => ({ name: p.name, program: p.program, channel: p.drum ? 9 : undefined, notes: p.notes }));
  download(MIDI.writeMidi(tr, S.tempo), fileBase() + '.mid');
};
$('#exPdf').onclick = () => { go(8); setTimeout(() => window.print(), 300); };
$('#exWav').onclick = async e => {
  if (!S.melody.length) return toast('아직 선율이 없어요');
  const b = e.currentTarget; b.disabled = true; b.querySelector('b').textContent = '만드는 중…';
  try { download(await SND.renderWav([{ inst: 'voice', notes: S.melody, vol: .9 }], S.tempo, units()), fileBase() + '_선율.wav'); }
  catch (x) { toast('음원을 만들지 못했어요'); }
  b.disabled = false; b.querySelector('b').textContent = '노래 선율 음원 받기';
};
$('#playFirst').onclick = e => { const v = chosen(); if (v) playWith(e.currentTarget, verTracks(v, v.vocal)); };
$('#playFinal').onclick = e => {
  const v = chosen(); const nv = S.arr.nv && S.arr.nv.of === S.arr.chosen ? S.arr.nv : null;
  playWith(e.currentTarget, verTracks(nv ? { parts: nv.parts } : v, S.melody));
};
$('#newVer').onclick = () => {
  const v = chosen(), box = $('#newVerBox'); box.hidden = false;
  if (!v) { box.innerHTML = '<p>6단계에서 편곡을 먼저 골라 주세요.</p>'; return; }
  if (v.source === 'auto') {
    const r = C.arrange(S.melody, S.lyrics, S.key, v.settings, v.variant);
    S.arr.nv = { of: v.id, parts: r.parts, chords: r.chords }; save(); r8();
    box.innerHTML = `<p><b>고친 선율에 맞춰 반주를 다시 만들었어요.</b> 위의 <b>▶ 고친 뒤 새 버전</b>과 <b>▶ 처음 버전</b>을 차례로 들어 보세요.</p>`;
  } else {
    box.innerHTML = `<ol class="howto"><li><b>노래 선율 음원 받기</b>로 고친 선율을 .wav로 받아요.</li><li>수노 <b>Create → Upload Audio</b>에 올리고 <b>Cover</b>로 같은 장르·분위기의 새 버전을 만들어요.</li><li>새로 받은 음원을 여기에 올려 처음 버전과 비교해 들어요.</li></ol><label class="ctl file"><span>새 버전 음원</span><input type="file" accept="audio/*" id="nvAudio"></label><div id="nvPlayer"></div>`;
    $('#nvAudio').onchange = ev => { const f = ev.target.files[0]; if (!f) return; $('#nvPlayer').innerHTML = `<audio controls src="${URL.createObjectURL(f)}"></audio>`; };
  }
};

// ── 태블릿으로 보기(QR) ──
async function packShare() {
  const v = chosen();
  const o = { t: S.title, g: S.group, k: S.key, b: S.tempo, l: S.lyrics.map(l => [l.text, l.chorus ? 1 : 0]), m: S.melody.map(n => [n.p, n.s, n.d, n.lx === 'n' ? 0 : n.lx]) };
  if (v && v.source === 'auto') o.a = { s: v.settings, v: v.variant };
  else if (v) o.c = v.chords.map(c => [c.s, c.d, c.r, c.q]);
  const bytes = new TextEncoder().encode(JSON.stringify(o));
  let out = bytes, z = '0';
  if (window.CompressionStream) { out = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); z = '1'; }
  let bin = ''; out.forEach(x => { bin += String.fromCharCode(x); });
  return z + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function unpackShare(s) {
  const z = s[0]; const b = atob(s.slice(1).replace(/-/g, '+').replace(/_/g, '/'));
  let bytes = Uint8Array.from(b, c => c.charCodeAt(0));
  if (z === '1') bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function share() {
  const d = $('#shareDlg');
  const base = location.href.split('#')[0].split('?')[0];
  const url = base + '#s=' + await packShare();
  U.shareUrl = url;
  $('#qrUrl').textContent = url.length > 90 ? url.slice(0, 60) + '…' : url;
  try {
    const q = qrcode(0, 'L'); q.addData(url); q.make();
    $('#qrBox').innerHTML = q.createSvgTag({ cellSize: 5, margin: 3, scalable: true });
  } catch (x) { $('#qrBox').innerHTML = '<p class="w">곡이 길어 QR 하나에 다 담기지 않아요. 메뉴의 <b>프로젝트 파일로 저장</b>으로 옮겨 주세요.</p>'; }
  $('#copyLink').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('주소를 복사했어요'); } catch (x) { toast('복사하지 못했어요'); } };
  d.showModal();
}
$('#shareBtn').onclick = share;
async function viewer(hash) {
  let o;
  try { o = await unpackShare(hash); } catch (x) { toast('악보 주소를 읽지 못했어요'); return false; }
  const lyrics = o.l.map(([text, ch]) => ({ text, chorus: !!ch }));
  const melody = o.m.map(([p, s, d, lx]) => ({ id: C.uid(), p, s, d, lx: lx || 'n' }));
  const bars = Math.max(2, lyrics.length * 2, Math.ceil(Math.max(0, ...melody.map(n => n.s + n.d)) / C.BAR));
  let parts = [], chords = null;
  if (o.a) { const r = C.arrange(melody, lyrics, o.k, o.a.s, o.a.v); parts = r.parts; chords = r.chords; }
  else if (o.c) chords = o.c.map(([s, d, r, q]) => ({ s, d, r, q, name: C.chordName({ r, q }, o.k) }));
  document.body.classList.add('viewer');
  const sec = document.createElement('section'); sec.className = 'step view'; sec.id = 'viewer';
  sec.innerHTML = `<div class="step-head"><p class="kicker">태블릿으로 보기 · 받은 악보</p><h1>${esc(o.t || '우리 노래')}</h1><p class="one">${esc(o.g || '')} · ♩=${o.b} · ${C.KEYS[o.k].name}</p></div>
    <div class="card"><div class="row"><button class="btn" type="button" id="vPlay">▶ 반주와 함께 듣기</button><button class="btn ghost" type="button" id="vSing">▶ 노래만 듣기</button><button class="btn ghost" type="button" id="vTake">이 기기에서 이어서 고치기</button></div>
    <ol class="vlyr">${lyrics.map(l => `<li class="${l.chorus ? 'chorus' : ''}">${esc(l.text)}</li>`).join('')}</ol>
    <div class="score full" id="vScore"></div></div>`;
  $('#main').prepend(sec);
  $$('.step:not(#viewer)').forEach(s => { s.hidden = true; });
  const voices = [SC.melodyVoice(melody, lyrics, chords)];
  parts.forEach((p, i) => voices.push({ id: 'P' + i, name: p.name, clef: p.clef, notes: p.notes, drum: p.inst === 'drums' }));
  SC.renderAbc($('#vScore'), SC.buildAbc({ title: '', tempo: o.b, key: o.k, bars, perLine: 2, voices }), { staffwidth: 700 });
  const tracks = [{ inst: 'voice', notes: melody, vol: .85 }, ...parts.map(p => ({ inst: SND.soundOf(p.inst), notes: p.notes, vol: p.inst === 'drums' ? .7 : .45 }))];
  $('#vPlay').onclick = e => { S.tempo = o.b; playWith(e.currentTarget, tracks); };
  $('#vSing').onclick = e => { S.tempo = o.b; playWith(e.currentTarget, [tracks[0]]); };
  $('#vTake').onclick = () => ask('받은 악보를 이 기기의 작업 곡으로 가져올까요? 이 기기에 있던 곡은 바뀝니다.', () => {
    S = blank(); Object.assign(S, { title: o.t, group: o.g, key: o.k, tempo: o.b, lyrics, melody, made: true });
    if (o.a) S.arr.settings = o.a.s;
    save(); history.replaceState(null, '', location.pathname); location.reload();
  }, '가져오기');
  return true;
}

// ── 시작 ──
buildKb();
fillSetup();
MIDI.connectMidi();
window.addEventListener('resize', () => drawStep());
window.addEventListener('beforeprint', () => { if (U.step !== 8) go(8); });
(async () => {
  if (location.hash.startsWith('#s=') && await viewer(location.hash.slice(3))) { $('#pager').hidden = true; $('#steps').hidden = true; return; }
  go(U.step);
})();
// 시험용 고리
window.__ls = { S: () => S, U, go, C, SC, MIDI, SND, loadDemo: () => { loadDemo(); refresh(); } };
