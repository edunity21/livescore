// LIVE SCORE · 화면
import * as C from './core.js?v=18';
import * as SND from './sound.js?v=18';
import * as MIDI from './midi.js?v=18';
import * as SC from './score.js?v=18';
import * as HUM from './hum.js?v=18';
import qrcode from '../lib/qrcode.mjs';
import { createEditor, activeEditor } from './editor.js?v=18';
import * as PLUS from './plus.js?v=18';
import * as ORCH from './orch.js?v=18';
import * as CAM from './cam.js?v=18';
import * as A2S from './a2s.js?v=18';
import * as A2Q from './a2q.js?v=18';
import * as MXL from './mxl.js?v=18';
C.useOrchestrator(ORCH);

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
    v: 1, title: '', group: '', reflect: { items: {}, good: '', next: '' }, roles: { lyric: '', compose: '', arrange: '', record: '', present: '' }, mode: 'keys',
    tempo: 92, key: 'C', meter: '4/4', pickup: 0, lyrics: [0, 1, 2, 3].map(() => ({ text: '', chorus: false })), take: null, grid: 2, melody: [],
    arr: { settings: { genre: 'pop', mood: 'bright', inst: ['drums', 'bass', 'keys', 'guitar'], ens: ORCH.defaultEns(), intro: 2, range: 'far', perBar: 'auto' }, versions: [], chosen: null, scene: '', why: '', nv: null },
    base: null, decisions: {}, log: [], step: 1, made: false,
  };
}
function load() {
  try { const j = JSON.parse(localStorage.getItem(STORE) || 'null'); if (j && j.v === 1) return Object.assign(blank(), j); } catch (e) { }
  return null;
}
let S = migrate(load() || blank());
function migrate(x) { // 예전 프로젝트: 악기 고르기 → 편성(인원수)
  const st = x.arr.settings;
  if (!st.ens) st.ens = C.ensFromInst(st.inst);
  if (st.intro == null) st.intro = 2;
  if (st.range == null) st.range = 'far'; // 코드 범위: 2차 관계조까지(노래 음이 바랄 때만 쓴다)
  if (st.perBar == null) st.perBar = 'auto';
  st.ens = { ...ORCH.defaultEns(), ...Object.fromEntries(Object.keys(ORCH.defaultEns()).filter(k => k !== 'vocal').map(k => [k, 0])), ...st.ens };
  if (x.pickup == null) x.pickup = 0;
  if (!x.meter || !C.METERS[x.meter]) x.meter = '4/4'; // 예전 곡은 4/4
  if (![2, 3, 4].includes(x.lineBars) || x.lineBars === C.METERS[x.meter].line) delete x.lineBars; // 가사 한 줄 마디 수(박자 기본과 다를 때만)
  C.setMeter(x.meter, x.lineBars); C.METER.pickup = x.pickup;
  return x;
}
const U = { step: S.step || 1, sel: null, lySel: null, hist: [], rec: null, bar: null, pick: null, tab: 'auto', suno: { tracks: [], cfg: null }, audio: {}, mpos: null, mdur: 4, soundOk: false, playBtn: null, viewer: null };

let saveT = null;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    S.step = U.step;
    const data = JSON.stringify(S);
    for (let k = 0; k < 12; k++) {
      try { localStorage.setItem(STORE, data); $('#saveBadge').hidden = false; U.saveWarned = false; return; }
      catch (e) { if (!PLUS.snapTrim()) break; } // 작업 기록이 자리를 차지하면 오래된 것부터 비운다
    }
    $('#saveBadge').hidden = true;
    if (!U.saveWarned) { U.saveWarned = true; toast('브라우저 저장 공간이 가득 차 자동 저장이 안 돼요 — 메뉴 → 프로젝트 파일로 저장해 주세요'); }
  }, 300);
}
function pushHist() { U.hist.push(JSON.stringify(S.melody)); if (U.hist.length > 60) U.hist.shift(); }
function undo() { if (!U.hist.length) return toast('되돌릴 것이 없어요'); S.melody = JSON.parse(U.hist.pop()); save(); refresh(); }

function totalBars() {
  const end = Math.max(0, ...S.melody.map(n => n.s + n.d));
  return Math.max(2, S.lyrics.length * C.METER.lineBars, Math.ceil(end / C.BAR));
}
const units = () => totalBars() * C.BAR;
const LB = () => C.METER.lineBars; // 가사 한 줄 마디 수(4/4는 2)
const tempoLabel = t => { const m = C.tempoMark(t); return `${m.unit}=${m.bpm}`; };
// 메트로놈 클릭 자리(초): 예비 한 마디 + bars마디, 마디마다 박 시작 — 첫 박 강세
function clickTimes(tempo, start, bars) { const tu = 60 / tempo / 4, bs = C.beatStarts(), out = []; for (let b = 0; b < bars + 1; b++) bs.forEach((x, i) => out.push({ t: start + (b * C.BAR + x) * tu, acc: i === 0, pre: b === 0 })); return out; }
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
  SND.play(tracks, opts.tempo || S.tempo, {
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
  if (vocal && !S.arr.vmute) tr.push({ inst: 'voice', notes: vocal, vol: .85 * (S.arr.vvol ?? 1) });
  if (v) v.parts.forEach(p => { if (!p.mute) tr.push({ inst: SND.soundOf(p.inst), notes: p.notes, vol: (p.inst === 'drums' ? .7 : .45) * (p.vol ?? 1) }); });
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
  const wrap = cv.parentElement;
  if (!cv.dataset.h) cv.dataset.h = cv.getAttribute('height');
  const H = +cv.dataset.h;
  const z = o.zoom || 1;
  const per = o.bars > 16 ? (window.innerWidth < 700 ? 72 : 96) : (wrap.clientWidth - 40) / o.bars;
  const need = o.bars > 16 || z > 1 ? Math.ceil(o.bars * per * z + 40) : 0;
  if (need > wrap.clientWidth) cv.style.width = need + 'px'; else cv.style.width = '';
  const W = Math.max(280, need > wrap.clientWidth ? need : cv.clientWidth);
  if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px'; }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const P0 = o.from == null ? (S.pickup || 0) : 0; // 못갖춘마디 자리도 보이게
  const from = o.from != null ? o.from * C.BAR : -P0, bars = o.bars, U16 = bars * C.BAR + P0;
  const all = o.layers.flatMap(l => l.notes).filter(n => n && n.p != null);
  let lo = all.length ? Math.min(...all.map(n => n.p)) - 1 : 57, hi = all.length ? Math.max(...all.map(n => n.p)) + 1 : 79;
  while (hi - lo < 12) { lo--; hi++; }
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
  const BS = C.beatStarts(), grid = []; for (let b = Math.floor(from / C.BAR); b * C.BAR <= from + U16; b++) BS.forEach(x => { const u = b * C.BAR + x; if (u >= from && u <= from + U16) grid.push(u); });
  for (const u of grid) {
    const bar = ((u % C.BAR) + C.BAR) % C.BAR === 0;
    g.fillStyle = bar ? '#9a9a9a' : '#e6e6e6'; g.fillRect(Math.round(x(u)) - (bar ? .5 : 0), T - (bar ? 6 : 0), bar ? 1 : 1, H - T - B + (bar ? 6 : 0));
    if (bar && u < from + U16) { g.fillStyle = '#111'; g.font = '700 10px Archivo,"Noto Sans KR",sans-serif'; g.textBaseline = 'alphabetic'; g.fillText((u / C.BAR + 1) + '', x(u) + 3, T - 8); }
  }
  if (o.lyr) {
    S.lyrics.forEach((ln, i) => {
      const a = C.lineStart(i); if (a < from || a >= from + U16) return;
      const txt = C.syllables(ln.text).join(' ');
      g.fillStyle = ln.chorus ? '#31684F' : '#6e6e6e'; g.font = '11px "Noto Sans KR",sans-serif';
      g.save(); g.beginPath(); g.rect(x(a) + 14, 0, x(a + C.LINE) - x(a) - 16, 20); g.clip(); g.fillText(txt, x(a) + 16, 12); g.restore();
    });
  }
  if (o.focus != null) { g.strokeStyle = '#9A382F'; g.lineWidth = 2; g.strokeRect(x(o.focus * C.BAR) + 1, T - 2, x((o.focus + 1) * C.BAR) - x(o.focus * C.BAR) - 2, H - T - B + 4); }
  const ST = {
    raw: { f: 'rgba(110,110,110,.28)', s: 'rgba(110,110,110,.6)' }, q: { f: 'rgba(45,91,215,.18)', s: '#2D5BD7' },
    mel: { f: '#111', s: '#111' }, rec: { f: '#31684F', s: '#31684F' }, same: { f: '#9b9b9b', s: '#9b9b9b' }, diff: { f: '#D9822B', s: '#B5641A' },
    mine: { f: 'rgba(0,0,0,0)', s: '#111' }, sel: { f: '#31684F', s: '#31684F' },
  };
  const minW = (W - L - R) / U16 * .5;
  for (const l of o.layers) {
    const st = ST[l.kind] || ST.mel;
    const solid = !['raw', 'q', 'mine'].includes(l.kind);
    for (const n of l.notes) {
      if (!n || n.p == null) continue;
      const s = n.s, e = n.s + Math.max(.25, n.d);
      if (e < from || s > from + U16) continue;
      const x0 = x(Math.max(s, from)) + 1, x1 = x(Math.min(e, from + U16)) - 2;
      const w = Math.max(minW > 3 ? 3 : 2, x1 - x0);
      const kind = n.kind ? (ST[n.kind] || st) : (o.sel && n.id === o.sel ? ST.sel : st);
      const hh = Math.max(4, Math.min(rowH - 2, 16)), yy = y(n.p) + (rowH - hh) / 2;
      g.fillStyle = kind.f;
      if (g.roundRect) { g.beginPath(); g.roundRect(x0, yy, w, hh, 2); g.fill(); } else g.fillRect(x0, yy, w, hh);
      g.strokeStyle = kind.s; g.lineWidth = l.kind === 'mine' ? 2 : 1;
      if (!solid || l.kind === 'mine') { g.strokeRect(x0 + .5, yy + .5, w - 1, hh - 1); }
      // 음의 시작: 진한 머리
      g.fillStyle = solid ? 'rgba(0,0,0,.45)' : kind.s;
      g.fillRect(x0, yy, Math.min(3, w), hh);
      // 칸이 넉넉하면 음 이름
      if ((solid || l.kind === 'q') && w >= 22 && hh >= 10) {
        g.fillStyle = solid ? '#fff' : '#1d3f9e'; g.font = `700 ${Math.min(11, hh - 2)}px "Noto Sans KR",sans-serif`; g.textBaseline = 'middle';
        g.save(); g.beginPath(); g.rect(x0, yy, w, hh); g.clip(); g.fillText(C.solName(n.p, S.key), x0 + 5, yy + hh / 2 + .5); g.restore();
      }
    }
    if (l.links) { g.strokeStyle = 'rgba(45,91,215,.5)'; g.lineWidth = 1; l.links.forEach(k => { g.beginPath(); g.moveTo(x(k.from), y(k.p) + rowH / 2); g.lineTo(x(k.to), y(k.p) + rowH / 2); g.stroke(); }); }
  }
  if (o.play != null && o.play >= from && o.play <= from + U16) { g.fillStyle = '#9A382F'; g.fillRect(x(o.play) - 1, T - 6, 2, H - T - B + 6); }
  if (need > wrap.clientWidth) {
    if (o.scrollTo != null) wrap.scrollLeft = Math.max(0, x(o.scrollTo) - 40);
    else if (o.follow && o.play != null) { const px = x(o.play); if (px < wrap.scrollLeft + 40 || px > wrap.scrollLeft + wrap.clientWidth - 80) wrap.scrollLeft = Math.max(0, px - wrap.clientWidth * .25); }
  }
}

// ── 단계 이동 ──
function go(n) {
  n = Math.max(1, Math.min(8, n));
  if (U.rec) stopRec();
  if (U.hum) humStop();
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
  syncMeter();
  C.METER.pickup = S.pickup || 0;
  $$('#steps button').forEach(b => { const i = +b.dataset.step; b.classList.toggle('on', i === U.step); b.classList.toggle('done', stepDone(i)); b.setAttribute('aria-current', i === U.step ? 'step' : 'false'); });
  $('#projName').textContent = S.title ? S.title + (S.group ? ' · ' + S.group : '') : '새 창작곡';
  $('#prevBtn').disabled = U.step === 1;
  $('#nextBtn').innerHTML = U.step === 8 ? '처음으로' : `다음: ${STEPN[U.step + 1]} ▶`;
  $('#pagerMid').textContent = `${U.step} / 8 · ${STEPN[U.step]}`;
  ({ 1: r1, 2: r2, 3: r3, 4: r4, 5: r5, 6: r6, 7: r7, 8: r8 })[U.step]();
}
function drawStep() {
  const pos = SND.position();
  if (U.step === 3) { drawRoll3(pos); if (!U.hum && pos == null) drawRollHum(); }
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
  if (a === 'snap') { const ok = PLUS.snapSave(S, `${U.step}단계 · 직접 기록`); toast(ok ? '지금 상태를 작업 기록에 남겼어요' : '저장 공간이 부족해 기록하지 못했어요'); }
  if (a === 'snaps') snapUI();
  if (a === 'new') ask('지금 곡을 지우고 새 창작곡을 시작할까요? 지금 곡은 작업 기록에 남겨 둡니다.', () => { autoSnap('새 곡 시작 전'); S = blank(); U.hist = []; save(); fillSetup(); go(1); toast('새 창작곡을 시작해요'); }, '새로 시작');
  if (a === 'demo') { const doit = () => { autoSnap('예시곡 불러오기 전'); loadDemo(); toast('예시곡 「우리들의 아침」을 불러왔어요'); go(2); }; (S.melody.length || S.lyrics.some(l => l.text)) ? ask('지금 곡 대신 예시곡을 불러올까요?', doit, '불러오기') : doit(); }
  if (a === 'save') { download(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }), fileBase() + '.livescore.json'); }
  if (a === 'open') $('#openFile').click();
  if (a === 'share') share();
  if (a === 'a2s') a2sOpen();
  if (a === 'mxl') $('#mxlFile').click();
  if (a === 'suno') { U.tab = 'suno'; go(6); setTimeout(() => $('#sDrop').scrollIntoView({ behavior: 'smooth', block: 'center' }), 80); }
});
$('#openFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const j = JSON.parse(await f.text()); if (j.v !== 1) throw 0; autoSnap('파일 열기 전'); S = Object.assign(blank(), j); U.hist = []; save(); fillSetup(); go(S.step || 2); toast('프로젝트를 열었어요'); } catch (x) { toast('LIVE SCORE 프로젝트 파일이 아니에요'); }
  e.target.value = '';
};
function autoSnap(label) { if (S.melody.length || S.lyrics.some(l => l.text)) PLUS.snapSave(S, label); }
function snapUI() {
  const d = $('#snapDlg'), list = PLUS.snapList();
  $('#snapList').innerHTML = list.length ? list.map((x, i) => `<li><div><b>${esc(x.title)}</b><span>${esc(x.label)} · ${x.step}단계</span><small>${new Date(x.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></div><button type="button" class="btn sm" data-snap="${i}">되돌리기</button><button type="button" class="btn ghost sm" data-snapdel="${i}" aria-label="기록 지우기">✕</button></li>`).join('') : '<li class="empty">아직 남긴 기록이 없어요. 메뉴 → 지금 상태 기록해 두기</li>';
  if (!d.open) d.showModal();
}
$('#snapList').addEventListener('click', e => {
  const r = e.target.closest('[data-snap]'), x = e.target.closest('[data-snapdel]');
  if (x) { PLUS.snapDelete(+x.dataset.snapdel); snapUI(); return; }
  if (!r) return;
  const j = PLUS.snapGet(+r.dataset.snap); if (!j) return;
  PLUS.snapSave(S, '되돌리기 전');
  S = Object.assign(blank(), j); U.hist = []; U.edVer = null; save(); fillSetup();
  $('#snapDlg').close(); go(S.step || 1); toast('기록해 둔 상태로 되돌렸어요 (되돌리기 전 상태도 기록에 남겼어요)');
});
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
  photoUI();
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
    if (!m.silent) SND.noteOn(m.p, m.v); kbLight(m.p, true);
    $('#nowNote').textContent = `지금 누른 음: ${C.solName(m.p, S.key)}(${C.sciName(m.p, S.key)}) · 세기 ${m.v}`;
    if (!U.soundOk) { U.soundOk = true; if (U.step === 1) midiUI(MIDI.midiState); }
    if (U.rec) recOn(m);
    if (U.step === 6 || U.step === 8) { const ae = activeEditor(); if (ae && ae.sel && ae.host.offsetParent) ae.midiPitch(m.p); }
  } else {
    SND.noteOff(m.p); kbLight(m.p, false);
    if (U.rec) recOff(m);
  }
});
document.addEventListener('keydown', e => { if (U.step !== 6 && U.step !== 8) return; const ae = activeEditor(); if (ae && ae.host.offsetParent) ae.onKey(e); });
// 컴퓨터 자판으로도(건반 없을 때 연습): a s d f g h j k = 도~도
const KEYMAP = { KeyA: 60, KeyW: 61, KeyS: 62, KeyE: 63, KeyD: 64, KeyF: 65, KeyT: 66, KeyG: 67, KeyY: 68, KeyH: 69, KeyU: 70, KeyJ: 71, KeyK: 72 }; // e.code: 한글 입력 상태에서도 같은 자리
const kdown = new Set();
document.addEventListener('keydown', e => {
  if (U.step !== 3 || e.repeat || e.ctrlKey || e.metaKey || e.altKey || (e.target.closest && e.target.closest('input,textarea,select,dialog'))) return;
  const p = KEYMAP[e.code]; if (!p) return; e.preventDefault();
  if (S.mode === 'mouse') { mouseAdd(p); return; }
  kdown.add(p); MIDI.injectMidi({ on: true, p, v: 88 });
});
document.addEventListener('keyup', e => { const p = KEYMAP[e.code]; if (p && kdown.has(p)) { kdown.delete(p); MIDI.injectMidi({ on: false, p, v: 0 }); } });
window.addEventListener('blur', () => { kdown.forEach(p => MIDI.injectMidi({ on: false, p, v: 0 })); kdown.clear(); });

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
$('#addLine').onclick = () => { if (S.lyrics.length >= MAX_LINES) return toast(`최대 ${MAX_LINES}줄(${MAX_LINES * 2}마디)까지 쓸 수 있어요`); S.lyrics.push({ text: '', chorus: false }); save(); r2(); $$('#lyricRows .lt').pop().focus(); };
$('#lyricRows').addEventListener('paste', e => {
  const inp = e.target.closest('.lt'); if (!inp) return;
  const txt = (e.clipboardData || window.clipboardData).getData('text');
  if (!/\r?\n/.test(txt.trim())) return;
  e.preventDefault();
  const rows = txt.split(/\r?\n/).map(t => t.trim()).filter(Boolean);
  const i = +inp.closest('.lrow').dataset.i;
  const before = inp.value.slice(0, inp.selectionStart), after = inp.value.slice(inp.selectionEnd);
  S.lyrics[i].text = (before + rows[0]).slice(0, 40);
  const room = MAX_LINES - S.lyrics.length;
  const add = rows.slice(1, 1 + room).map(t => ({ text: t.slice(0, 40), chorus: false }));
  if (after.trim()) add.push({ text: after.trim(), chorus: false });
  // 바로 뒤의 빈 줄은 붙여 넣은 줄로 채운다
  let j = i + 1;
  while (add.length && j < S.lyrics.length && !S.lyrics[j].text.trim()) { S.lyrics[j].text = add.shift().text; j++; }
  S.lyrics.splice(j, 0, ...add.slice(0, MAX_LINES - S.lyrics.length));
  save(); r2();
  toast(rows.length - 1 > room ? `${MAX_LINES}줄까지만 넣었어요` : `${rows.length}줄을 붙여 넣었어요`);
});
function sylView() {
  let tot = 0;
  $('#sylView').innerHTML = S.lyrics.map((l, i) => {
    const s = C.syllables(l.text); tot += s.length;
    const warn = s.length > 12 ? 'warn' : s.length && s.length < 6 ? 'low' : '';
    return `<div class="sline ${l.chorus ? 'chorus' : ''}">
      <div class="sh"><b>${i + 1}줄</b><span>${i * LB() + 1}–${i * LB() + LB()}마디</span>${l.chorus ? '<em>후렴</em>' : ''}<span class="cnt ${warn}">${s.length}음절</span></div>
      <div class="sc">${s.length ? s.map(c => `<i>${esc(c)}</i>`).join('') : '<span class="empty">비어 있어요 · 음표도 없으면 반주 마디(전주·간주)</span>'}</div>
      ${warn === 'warn' ? `<p class="w">12음절이 넘으면 ${LB()}마디에 음이 촘촘해져요. 줄을 나누거나 말을 줄여 봐요.</p>` : ''}
    </div>`;
  }).join('');
  const bars = S.lyrics.length * LB();
  if ($('#s2one')) $('#s2one').textContent = `노랫말을 쓰면 글자가 음절로 나뉘고, 한 줄이 ${LB() === 2 ? '두' : LB() === 4 ? '네' : LB()} 마디로 배치됩니다.`;
  if ($('#s2sub')) $('#s2sub').textContent = `글자 1개 = 음표 1개 · 한 줄 = ${LB()}마디 · ${C.meterLabel(S.meter || '4/4')}`;
  $('#sylSum').innerHTML = `<b>합계</b><span>${S.lyrics.length}줄</span><span>${tot}음절</span><span>${bars}마디</span><span>${bars * C.METER.beats.length}박</span><small>${C.meterLabel(C.METER.key)} · 최대 ${MAX_LINES}줄 · ${MAX_LINES * LB()}마디</small><button class="btn sm" type="button" id="toS3">다음: 선율 연주 ▶</button>`;
  $('#toS3').onclick = () => go(3);
}

// ── 3 선율 연주 ──
$('#tempo').oninput = e => { S.tempo = +e.target.value; $('#tempoV').textContent = tempoLabel(S.tempo); save(); };
$('#pickSel').onchange = e => {
  const P = +e.target.value; S.pickup = P; C.METER.pickup = P;
  const first = S.melody.filter(n => n.p != null).sort((a, b) => a.s - b.s)[0];
  if (S.mode === 'mouse' && !S.melody.length) U.mpos = -P;
  save(); refresh();
  if (first && first.s !== -P) {
    const sh = -P - first.s;
    ask(`첫 음이 ${P ? '못갖춘마디(여린내기)' : '1마디 첫 박'}에서 시작하도록 선율 전체를 ${Math.abs(sh) / 4}박 ${sh < 0 ? '앞으로' : '뒤로'} 옮길까요? 옮기지 않으면 마디 나눔만 바뀌어요.`, () => {
      pushHist(); S.melody = S.melody.map(n => ({ ...n, s: n.s + sh })).filter(n => n.s >= -P);
      if (S.take) { const tu = 60 / S.take.tempo / 4; S.take.events = S.take.events.map(x => ({ ...x, t: +(x.t + sh * tu).toFixed(4) })); }
      save(); refresh(); toast('선율을 옮겼어요');
    }, '옮기기');
  }
};
// 박자 바꾸기: 음표 자리(16분음표 칸)는 그대로, 마디 나눔·줄·반주 무늬가 새 박자로
function syncMeter() { const k = S.meter || '4/4', lb = S.lineBars || C.METERS[k].line; if (C.METER.key !== k || C.METER.lineBars !== lb) C.setMeter(k, lb); }
$('#meterSel').onchange = e => {
  const to = e.target.value, from = S.meter || '4/4'; if (to === from) return;
  const apply = () => {
    S.meter = to; delete S.lineBars; C.setMeter(to);
    if (!C.PICKUPS[S.pickup || 0]) { S.pickup = 0; C.METER.pickup = 0; }
    if (S.arr.versions.length) { S.arr.versions = []; S.arr.chosen = null; }
    save(); refresh(); toast(`${C.meterLabel(to)} — 마디 나눔이 바뀌었어요${C.METER.lineBars !== 2 ? ` · 가사 한 줄 = ${C.METER.lineBars}마디` : ''}`);
  };
  if (S.arr.versions.length) { ask(`박자를 ${C.meterLabel(to)}로 바꾸면 만들어 둔 편곡 버전은 새 박자로 다시 만들어야 해요. 바꿀까요?`, apply, '바꾸기'); e.target.value = from; return; }
  apply();
};
// 가사 한 줄 마디 수: 3마디 프레이즈(3박 계열 가곡) 같은 곡
$('#lineSel').onchange = e => {
  const to = +e.target.value, from = C.METER.lineBars; if (to === from) return;
  const apply = () => {
    if (to === C.METERS[S.meter || '4/4'].line) delete S.lineBars; else S.lineBars = to;
    syncMeter(); if (S.arr.versions.length) { S.arr.versions = []; S.arr.chosen = null; }
    save(); refresh(); toast(`가사 한 줄 = ${to}마디`);
  };
  if (S.arr.versions.length) { ask(`가사 한 줄을 ${to}마디로 바꾸면 만들어 둔 편곡 버전은 다시 만들어야 해요. 바꿀까요?`, apply, '바꾸기'); e.target.value = from; return; }
  apply();
};
$('#keySel').onchange = e => {
  const old = S.key, to = e.target.value;
  if (!S.melody.length || old === to) { S.key = to; save(); return; }
  const sh = C.keyShift(old, to);
  S.key = to; save();
  if (!sh) { refresh(); return; } // 딴이름한소리조(올림바 ↔ 내림사): 조표만
  ask(`선율도 ${C.KEYS[to].name}으로 옮길까요? (${sh > 0 ? '반음 ' + sh + '개 위로' : '반음 ' + -sh + '개 아래로'}) 옮기지 않으면 조표만 바뀌어요.`, () => { transposeAll(sh, old); toast(`곡 전체를 ${C.KEYS[to].name}으로 옮겼어요`); }, '함께 옮기기');
};
const MAX_LINES = 50;
const fromBar = () => Math.max(0, Math.min(U.recFrom || 0, totalBars() - LB()));
// 박자 고르기: 홑박자 · 겹박자 · 혼합박자
function fillMeter() {
  const sel = $('#meterSel'); if (!sel) return;
  if (!sel.dataset.done) { sel.dataset.done = 1; sel.innerHTML = Object.entries(C.METER_KINDS).map(([k, nm]) => `<optgroup label="${nm}">${Object.keys(C.METERS).filter(m => C.METERS[m].kind === k).map(m => `<option value="${m}">${C.meterLabel(m)}</option>`).join('')}</optgroup>`).join(''); }
  sel.value = S.meter || '4/4';
  if ($('#lineSel')) $('#lineSel').value = String(C.METER.lineBars);
}
function fillPick() { const sel = $('#pickSel'); sel.innerHTML = Object.keys(C.PICKUPS).map(Number).sort((a, b) => a - b).map(u => `<option value="${u}">${u ? '못갖춘마디 · ' + C.PICKUPS[u] : '갖춘마디 (1박부터)'}</option>`).join(''); }
function fillFrom() {
  const sel = $('#recFrom'), lines = Math.ceil(totalBars() / LB());
  sel.innerHTML = Array.from({ length: lines }, (_, i) => `<option value="${i * LB()}">${i + 1}줄 (${i * LB() + 1}마디)부터</option>`).join('');
  sel.value = String(fromBar());
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-zoom]'); if (!b) return;
  const steps = [1, 1.5, 2, 3, 4];
  let i = steps.indexOf(U.zoom || 1); i = Math.max(0, Math.min(steps.length - 1, i + (+b.dataset.zoom)));
  U.zoom = steps[i];
  $$('.zoom-v').forEach(x => { x.textContent = Math.round(U.zoom * 100) + '%'; });
  drawStep();
});
$('#recFrom').onchange = e => {
  U.recFrom = +e.target.value;
  if (S.mode === 'mouse') { U.mpos = C.lineStart(U.recFrom / LB()); mposLabel(); }
  U.scrollReq = U.recFrom * C.BAR; drawRoll3();
};
function r3() {
  $('#tempo').value = S.tempo; $('#tempoV').textContent = tempoLabel(S.tempo); $('#keySel').value = S.key; fillMeter();
  const mouse = S.mode === 'mouse';
  $('#mousePal').hidden = !mouse; $('#recBtn').hidden = mouse;
  $('#s3one').textContent = mouse ? '음표 길이를 고른 뒤 화면 건반을 누르면 음표가 차례로 들어갑니다.' : `예비박 ${C.METER.beats.length}번 뒤 건반으로 노래를 연주하면, 누른 음이 막대로 실시간 기록됩니다.`;
  $('#recState').textContent = mouse ? '마우스 입력' : S.take ? `녹음됨 · 음 ${S.take.events.length}개` : '대기';
  fillFrom();
  if (mouse && U.mpos == null) U.mpos = S.melody.length ? Math.max(...S.melody.map(n => n.s + n.d)) : -(S.pickup || 0);
  fillPick(); $('#pickSel').value = S.pickup || 0;
  mposLabel();
  drawRoll3(SND.position());
  if (humOut) humShow(); else drawRollHum();
}
function drawRoll3(play) {
  const cv = $('#roll3'); if (!cv.offsetParent) return;
  const bars = totalBars();
  const layers = [];
  if (U.rec) {
    const tu = 60 / U.rec.tempo / 4, now = SND.audio().currentTime, off = U.rec.from * C.BAR;
    const live = U.rec.events.map(e => ({ p: e.p, s: off + e.t / tu, d: e.d / tu }));
    U.rec.on.forEach((v, p) => live.push({ p, s: off + v.t / tu, d: Math.max(.3, (now - U.rec.t0 - v.t) / tu) }));
    layers.push({ kind: 'raw', notes: S.melody }, { kind: 'rec', notes: live });
    play = off + Math.max(0, (now - U.rec.t0) / tu);
  } else if (S.mode === 'mouse' || !S.take) layers.push({ kind: 'mel', notes: S.melody });
  else { const tu = 60 / S.take.tempo / 4; layers.push({ kind: 'rec', notes: S.take.events.map(e => ({ p: e.p, s: e.t / tu, d: e.d / tu })) }); }
  const req = U.scrollReq; U.scrollReq = null;
  drawRoll(cv, { bars, layers, lyr: true, play, follow: play != null, scrollTo: req, zoom: U.zoom || 1 });
}
function startRec() {
  const c = SND.audio();
  const tu = 60 / S.tempo / 4, bars = totalBars(), f = fromBar();
  const bus = c.createGain(); bus.connect(SND.master);
  const start = c.currentTime + .15, t0 = start + C.BAR * tu; // 예비박 한 마디(박자대로)
  U.rec = { tempo: S.tempo, from: f, start, t0, end: t0 + (bars - f) * C.BAR * tu, events: [], on: new Map(), bus };
  const metro = $('#metro').checked;
  for (const k of clickTimes(S.tempo, start, bars - f)) { if (!k.pre && !metro) break; SND.voice(c, bus, 'click', k.acc ? 96 : 84, k.t, .05, k.pre ? .9 : .55); }
  $('#recBtn').textContent = '■ 멈춤'; $('#recBtn').classList.add('playing');
  $('#recFrom').disabled = true;
  stopPlay();
  loop(); recTick();
}
function recTick() {
  if (!U.rec) return;
  const c = SND.audio(), now = c.currentTime, tu = 60 / U.rec.tempo / 4;
  const at = `${U.rec.from / LB() + 1}줄부터 `;
  if (now < U.rec.t0) { const n = C.beatStarts().filter(x => x * tu <= now - U.rec.start).length; $('#recState').textContent = '예비박 ' + C.beatStarts().map((_, i) => i + 1).slice(0, Math.max(1, n)).join('·'); }
  else {
    const s = Math.floor(now - U.rec.t0), bar = U.rec.from + Math.floor((now - U.rec.t0) / (C.BAR * tu)) + 1;
    $('#recState').textContent = `${at}녹음 중 ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')} · ${bar}마디`;
  }
  if (now >= U.rec.end) { stopRec(); return; }
  setTimeout(recTick, 100);
}
function ctxTime(m) { const c = SND.audio(); return c.currentTime - Math.max(0, (performance.now() - (m.time || performance.now())) / 1000); }
function recOn(m) { const lead = (S.pickup || 0) * 15 / U.rec.tempo, t = ctxTime(m) - U.rec.t0; if (t < -lead - (60 / U.rec.tempo) / 2) return; U.rec.on.set(m.p, { t: Math.max(t, -lead - .05), v: m.v }); } // 여린내기 음은 예비박 끝에서
function recOff(m) { const o = U.rec.on.get(m.p); if (!o) return; U.rec.on.delete(m.p); U.rec.events.push({ p: m.p, v: o.v, t: o.t, d: Math.max(.03, ctxTime(m) - U.rec.t0 - o.t) }); }
function stopRec() {
  const r = U.rec; if (!r) return;
  const c = SND.audio(), now = Math.min(c.currentTime, r.end);
  r.on.forEach((o, p) => r.events.push({ p, v: o.v, t: o.t, d: Math.max(.05, now - r.t0 - o.t) }));
  r.bus.gain.setTargetAtTime(0, c.currentTime, .02); setTimeout(() => r.bus.disconnect(), 300);
  U.rec = null;
  $('#recBtn').textContent = '● 녹음'; $('#recBtn').classList.remove('playing'); $('#recFrom').disabled = false;
  if (!r.events.length) { $('#recState').textContent = '녹음된 음이 없어요 — 다시 녹음'; drawStep(); return; }
  // 녹음한 구간만 바꾸고 앞뒤 선율은 그대로 둔다
  const tu = 60 / r.tempo / 4, off = r.from * C.BAR;
  const endU = Math.min(units(), Math.ceil((off + Math.max(0, now - r.t0) / tu) / C.BAR) * C.BAR);
  const fresh = r.events.map(e => ({ p: e.p, v: e.v, t: +(e.t + off * tu).toFixed(4), d: +e.d.toFixed(4) }));
  applyTake(fresh, r.tempo, off, endU);
  save(); refresh();
  $('#recState').textContent = `녹음됨 · ${off / C.BAR + 1}~${endU / C.BAR}마디 · 음 ${fresh.length}개`;
  toast(`${off / C.BAR + 1}~${endU / C.BAR}마디를 녹음했어요 — 4단계에서 박을 맞춰요`);
}
// 녹음한 음(초)을 선율에 넣기 — 건반·흥얼거림 공통. 녹음한 구간만 바꾸고 앞뒤 선율은 그대로 둔다
function applyTake(fresh, tempo, off, endU) {
  const tu = 60 / tempo / 4, lo = off - (S.pickup || 0); // 그 줄의 여린내기 자리부터
  let kept = [];
  if (S.take) {
    const tuOld = 60 / S.take.tempo / 4;
    kept = S.take.events.map(e => ({ ...e, t: +(e.t / tuOld * tu).toFixed(4), d: +(e.d / tuOld * tu).toFixed(4) })).filter(e => { const u = e.t / tu; return u < lo || u >= endU; });
  }
  S.take = { tempo, events: [...kept, ...fresh].sort((a, b) => a.t - b.t) };
  pushHist();
  const newNotes = C.quantize(fresh, tempo, S.grid || 2, units()).filter(n => n.s >= lo && n.s < endU);
  const keepNotes = S.melody.filter(n => n.s < lo || n.s >= endU).map(n => (n.s < lo && n.s + n.d > lo ? { ...n, d: lo - n.s } : n));
  const all = [...keepNotes, ...newNotes].sort((a, b) => a.s - b.s);
  for (let i = 0; i < all.length - 1; i++) if (all[i].s + all[i].d > all[i + 1].s) all[i].d = all[i + 1].s - all[i].s;
  S.melody = all.filter(n => n.d > 0);
}
$('#recBtn').onclick = () => {
  if (U.hum || U.humBusy) return toast('흥얼거림 녹음을 먼저 끝내요');
  if (U.rec) return stopRec();
  const f = fromBar(), after = S.melody.some(n => n.s >= f * C.BAR);
  if (after) ask(`${f / LB() + 1}줄(${f + 1}마디)부터 녹음하면, 녹음한 마디까지의 선율이 새로 바뀌어요. 그 앞과 녹음을 멈춘 뒤의 마디는 그대로예요. 녹음할까요?`, startRec, '녹음');
  else startRec();
};
$('#playTake').onclick = e => {
  const from = fromBar() * C.BAR;
  if (S.mode !== 'mouse' && S.take) {
    const tu = 60 / S.take.tempo / 4;
    playWith(e.currentTarget, [{ inst: 'keys', notes: S.take.events.map(x => ({ p: x.p, s: x.t / tu, d: x.d / tu })), vol: .8 }], { from });
  } else playWith(e.currentTarget, [{ inst: 'keys', notes: S.melody, vol: .8 }], { from });
};
// 마우스 입력
$('#mousePal').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.dur) { U.mdur = +b.dataset.dur; $$('#mousePal [data-dur]').forEach(x => x.classList.toggle('on', x === b)); }
  if (b.id === 'mRest') { U.mpos = Math.min(units(), (U.mpos || 0) + U.mdur); }
  if (b.id === 'mBack') {
    pushHist();
    const cur = U.mpos || 0;
    const last = S.melody.filter(n => n.s < cur).sort((a, b2) => a.s - b2.s).pop();
    if (last && last.s + last.d >= cur) { S.melody = S.melody.filter(n => n !== last); U.mpos = last.s; }
    else U.mpos = Math.max(-(S.pickup || 0), (U.mpos || 0) - U.mdur);
    save();
  }
  if (b.id === 'mClear') { pushHist(); S.melody = []; U.mpos = -(S.pickup || 0); save(); }
  mposLabel(); drawRoll3();
});
function mouseAdd(p) {
  const c = SND.audio(); SND.voice(c, SND.master, 'keys', p, c.currentTime + .01, .35, .8);
  kbLight(p, true); setTimeout(() => kbLight(p, false), 180);
  $('#nowNote').textContent = `지금 누른 음: ${C.solName(p, S.key)}(${C.sciName(p, S.key)})`;
  const pos = U.mpos || 0;
  if (pos + U.mdur > units()) return toast('마지막 마디까지 다 채웠어요');
  pushHist();
  S.melody = S.melody.filter(n => n.s + n.d <= pos || n.s >= pos + U.mdur);
  S.melody.push({ id: C.uid(), p, s: pos, d: U.mdur, lx: 'n' });
  U.mpos = pos + U.mdur; U.soundOk = true;
  save(); mposLabel(); drawRoll3();
}
function mposLabel() { const p = U.mpos || 0, ib = ((p % C.BAR) + C.BAR) % C.BAR; $('#mPos').textContent = `다음 음표 자리: ${p < 0 ? '못갖춘마디' : Math.floor(p / C.BAR) + 1 + '마디'} ${Math.floor(ib / 4) + 1}박`; }

// ── 흥얼거림 녹음(마이크) → MP3 · 음표 ──
let humOut = null; // { pcm, sr, mp3, url, events, notes, from, tempo, endU }
async function humStart() {
  if (U.rec) return toast('건반 녹음을 먼저 멈춰요');
  if (U.humBusy) return;
  stopPlay();
  const c = SND.audio();
  $('#humState').textContent = '마이크를 여는 중…';
  let rec;
  try { U.humBusy = true; rec = await HUM.openRecorder(c); }
  catch (x) {
    U.humBusy = false;
    $('#humState').textContent = '마이크를 쓸 수 없어요';
    toast(x && x.name === 'NotAllowedError' ? '마이크 사용을 허락해 주세요 (주소창 왼쪽 아이콘 → 마이크 허용)' : '마이크를 찾지 못했어요. 이어폰 마이크나 노트북 마이크를 확인해요');
    return;
  }
  U.humBusy = false;
  const tu0 = 60 / S.tempo / 4, f = fromBar();
  const start = c.currentTime + .25, t0 = start + C.BAR * tu0, end = t0 + (totalBars() - f) * C.BAR * tu0;
  const bus = c.createGain(); bus.connect(SND.master);
  const metro = $('#humMetro').checked;
  for (const k of clickTimes(S.tempo, start, totalBars() - f)) { if (!k.pre && !metro) break; SND.voice(c, bus, 'click', k.acc ? 96 : 84, k.t, .05, k.pre ? .9 : .5); }
  U.hum = { rec, start, t0, end, from: f, tempo: S.tempo, live: [], bus };
  $('#humRec').textContent = '■ 멈춤'; $('#humRec').classList.add('playing'); $('#humOut').hidden = true;
  $('#recFrom').disabled = true;
  humTick();
}
function humTick() {
  const h = U.hum; if (!h) return;
  const c = SND.audio(), now = c.currentTime, beat = 60 / h.tempo, tu = beat / 4;
  const { rms, level, midi } = h.rec.now();
  $('#humLv').style.width = Math.round((level ?? Math.min(1, rms * 5)) * 100) + '%';
  $('#humNow').textContent = midi == null ? '—' : `${C.solName(Math.round(midi), S.key)}(${C.sciName(Math.round(midi), S.key)})`;
  if (now < h.t0) { const n = C.beatStarts().filter(x => x * tu <= now - h.start).length; $('#humState').textContent = '예비박 ' + C.beatStarts().map((_, i) => i + 1).slice(0, Math.max(1, n)).join('·'); }
  else {
    const sec = Math.floor(now - h.t0), bar = h.from + Math.floor((now - h.t0) / (C.BAR * tu)) + 1;
    $('#humState').textContent = `녹음 중 ${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')} · ${bar}마디`;
    const u = h.from * C.BAR + (now - h.t0) / tu;
    if (midi != null) { const p = Math.round(midi), last = h.live[h.live.length - 1]; if (last && last.p === p && u - (last.s + last.d) < .8) last.d = u - last.s; else h.live.push({ p, s: u, d: .3 }); }
  }
  drawRollHum(h.from * C.BAR + Math.max(0, (now - h.t0) / tu));
  if (now >= h.end) { humStop(); return; }
  setTimeout(humTick, 40);
}
async function humStop() {
  const h = U.hum; if (!h) return;
  U.hum = null; U.humBusy = true;
  const c = SND.audio(), now = Math.min(c.currentTime, h.end);
  h.bus.gain.setTargetAtTime(0, c.currentTime, .02); setTimeout(() => h.bus.disconnect(), 300);
  $('#humRec').textContent = '🎤 녹음'; $('#humRec').classList.remove('playing'); $('#humLv').style.width = '0'; $('#humNow').textContent = '—';
  $('#recFrom').disabled = false;
  try {
    if (now <= h.t0 + .5) { h.rec.cancel(); $('#humState').textContent = '녹음이 너무 짧아요 — 다시 녹음'; drawRollHum(); return; }
    // 학생은 들리는 박(출력 지연)에 맞춰 부르고, 마이크 소리는 그만큼 늦게 들어온다 → 지연만큼 당긴다
    const lat = Math.min(.15, (c.outputLatency || 0) + (c.baseLatency || 0) + .01);
    const pre = 30 / h.tempo; // 반 박 먼저부터(살짝 일찍 부른 첫 음도 담게)
    const pcm = await h.rec.finish(h.t0 - pre + lat, now + lat), sr = h.rec.sampleRate;
    const tr = await HUM.transcribe(pcm, sr, p => { $('#humState').textContent = `음 높이를 찾는 중… ${Math.round(p * 100)}%`; });
    const tu = 60 / h.tempo / 4, off = h.from * C.BAR;
    const events = tr.notes.map(n => ({ p: n.p, v: n.v, t: +(n.t - pre + off * tu).toFixed(4), d: +n.d.toFixed(4) }));
    const endU = Math.min(units(), Math.ceil((off + (now - h.t0) / tu) / C.BAR) * C.BAR);
    const notes = C.quantize(events, h.tempo, S.grid || 2, units()).filter(n => n.s >= off && n.s < endU);
    $('#humState').textContent = 'MP3를 만드는 중…';
    const mp3 = await SND.encodeMp3([HUM.normalize(pcm)], sr, 128);
    if (humOut && humOut.url) URL.revokeObjectURL(humOut.url);
    humOut = { mp3, url: URL.createObjectURL(mp3), events, notes, from: h.from, tempo: h.tempo, endU, secs: now - h.t0 };
    const s = Math.round(humOut.secs);
    $('#humState').textContent = `녹음됨 · ${Math.floor(s / 60)}분 ${s % 60}초 · 음 ${notes.length}개`;
    humShow();
  } catch (x) { console.warn(x); $('#humState').textContent = '녹음을 정리하지 못했어요 — 다시 녹음'; }
  finally { U.humBusy = false; }
}
function humShow() {
  const o = humOut; $('#humOut').hidden = !o; if (!o) return;
  const a = $('#humAudio'); if (a.src !== o.url) a.src = o.url;
  const G = { 1: '16분음표', 2: '8분음표', 4: '4분음표' }[S.grid || 2];
  $('#humInfo').textContent = o.notes.length ? `${o.from + 1}~${o.endU / C.BAR}마디 · 음 ${o.notes.length}개 · ${G} 단위로 맞춤 · ${tempoLabel(o.tempo)}` : '또렷한 음을 찾지 못했어요 — 조금 더 크고 길게 불러 봐요';
  if (o.notes.length) SC.renderAbc($('#humScore'), SC.buildAbc({ tempo: o.tempo, key: S.key, bars: totalBars(), perLine: LB() === 3 ? 3 : 4, showTitle: false, voices: [SC.melodyVoice(o.notes, S.lyrics, null)] }));
  else $('#humScore').innerHTML = '';
  drawRollHum();
}
function drawRollHum(play) {
  const cv = $('#rollHum'); if (!cv || !cv.offsetParent) return;
  const layers = [];
  if (S.melody.length) layers.push({ kind: 'raw', notes: S.melody });
  if (U.hum) layers.push({ kind: 'rec', notes: U.hum.live });
  else if (humOut && humOut.notes.length) layers.push({ kind: 'q', notes: humOut.notes });
  drawRoll(cv, { bars: totalBars(), layers, lyr: true, play, follow: play != null, zoom: U.zoom || 1 });
}
$('#humRec').onclick = () => { if (U.hum) humStop(); else humStart(); };
$('#humMp3').onclick = () => { if (humOut) download(humOut.mp3, fileBase() + '_흥얼거림.mp3'); };
$('#humUse').onclick = () => {
  const o = humOut; if (!o || !o.notes.length) return toast('찾은 음이 없어요 — 조금 더 크고 길게 불러 봐요');
  const doit = () => { applyTake(o.events, o.tempo, o.from * C.BAR, o.endU); save(); refresh(); toast(`${o.from + 1}~${o.endU / C.BAR}마디에 흥얼거린 선율을 넣었어요 — 4단계에서 박을 맞춰요`); };
  if (S.melody.some(n => n.s >= o.from * C.BAR && n.s < o.endU)) ask(`${o.from + 1}~${o.endU / C.BAR}마디의 선율이 흥얼거린 선율로 바뀌어요. 바꿀까요?`, doit, '바꾸기'); else doit();
};

// 곡 전체 조옮김(선율·연주 기록·비교 기준·자동 편곡을 함께)
function transposeAll(sh, fromKey, sunoTo = null) {
  if (!sh) return;
  pushHist();
  S.melody = C.shiftPitches(S.melody, sh);
  if (S.take) S.take.events = S.take.events.map(e => ({ ...e, p: e.p + sh }));
  if (S.base) S.base = C.shiftPitches(S.base, sh);
  S.arr.versions.forEach(v => {
    if (v.source === 'suno') { // 수노 편곡도 함께: 노래·재료를 옮기고 편성 엔진으로 다시(악기 음역 안으로)
      v.vocal = C.shiftPitches(v.vocal || [], sh);
      if (v.src) Object.keys(v.src).forEach(k => { if (k !== 'drums') v.src[k] = C.shiftPitches(v.src[k], sh); });
      else v.parts.forEach(p => { if (!isDrum(p)) p.notes = C.shiftPitches(p.notes, sh); });
      v.key = sunoTo && v.id === U.edVer ? sunoTo : C.shiftKey(v.key || fromKey || S.key, sh);
      if (v.chords) v.chords = v.chords.map(c => ({ ...c, name: C.chordName(c, v.key) }));
      if (v.src) orchSuno(v);
      return;
    }
    if (v.source !== 'auto') return;
    v.vocal = C.shiftPitches(v.vocal || [], sh);
    v.parts.forEach(p => { if (p.inst !== 'drums') p.notes = C.shiftPitches(p.notes, sh); });
    if (fromKey && v.chords) v.chords = v.chords.map(c => ({ ...c, name: C.chordName(c, S.key) }));
  });
  if (S.arr.nv) { S.arr.nv.parts.forEach(p => { if (p.inst !== 'drums') p.notes = C.shiftPitches(p.notes, sh); }); if (S.arr.nv.chords) S.arr.nv.chords = S.arr.nv.chords.map(c => ({ ...c, name: C.chordName(c, S.key) })); }
  save(); refresh();
}
function rangeUI() {
  const r = C.range(S.melody), box = $('#rangeBox');
  $('#rKey').innerHTML = C.KEY_ORDER.map(k => `<option value="${k}" ${k === S.key ? 'selected' : ''}>${C.KEYS[k].name}</option>`).join('');
  if (!r) { box.innerHTML = '<p class="empty">선율이 생기면 가장 낮은 음과 높은 음을 보여 줘요.</p>'; return; }
  const LO = 52, HI = 84, pct = p => ((Math.max(LO, Math.min(HI, p)) - LO) / (HI - LO) * 100).toFixed(1);
  const nm = p => `${C.solName(p, S.key)}${Math.floor(p / 12) - 1}`;
  const out = r.lo < C.COMFORT.warnLo || r.hi > C.COMFORT.warnHi ? 'bad' : r.lo < C.COMFORT.lo || r.hi > C.COMFORT.hi ? 'mid' : 'ok';
  const msg = { ok: '모둠원 모두 부르기 편한 음역이에요.', mid: '조금 높거나 낮은 음이 있어요. 목을 풀고 부르거나 조를 옮겨 봐요.', bad: '부르기 힘든 음이 있어요. 아래에서 조를 옮겨 봐요.' }[out];
  const bk = C.bestKey(S.melody, S.key);
  const sug = bk && (bk.key !== S.key || bk.shift) && out !== 'ok' ? `<button type="button" class="btn sm" id="rBest" data-k="${bk.key}" data-sh="${bk.shift}">추천: ${C.KEYS[bk.key].name}${bk.shift && bk.key === S.key ? (bk.shift > 0 ? ' 옥타브 위' : ' 옥타브 아래') : ''}로 옮기기</button>` : '';
  box.innerHTML = `<div class="rng"><div class="rng-z" style="left:${pct(C.COMFORT.lo)}%;width:${(pct(C.COMFORT.hi) - pct(C.COMFORT.lo)).toFixed(1)}%"><span>편한 음역</span></div><div class="rng-m ${out}" style="left:${pct(r.lo)}%;width:${Math.max(1.5, pct(r.hi) - pct(r.lo))}%"></div></div>
    <p class="rng-t"><b>${nm(r.lo)} ~ ${nm(r.hi)}</b><span>${r.hi - r.lo}반음 · ${C.KEYS[S.key].name}</span><em class="${out}">${msg}</em></p>${sug}`;
}
$('#rangeCard').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'rBest') { const k = b.dataset.k, sh = +b.dataset.sh, old = S.key; S.key = k; transposeAll(sh, old); toast(`${C.KEYS[k].name}으로 옮겼어요`); return; }
  if (b.dataset.oct) { transposeAll(+b.dataset.oct * 12, S.key); toast(+b.dataset.oct > 0 ? '한 옥타브 올렸어요' : '한 옥타브 내렸어요'); }
});
$('#rKey').onchange = e => { const to = e.target.value, old = S.key; if (to === old) return; const sh = C.keyShift(old, to); S.key = to; if (!sh) { save(); refresh(); return; } transposeAll(sh, old); toast(`곡 전체를 ${C.KEYS[to].name}으로 옮겼어요`); };
// 작곡 기법: 마디 반복·동형진행·역행·전위
function barToolUI() {
  const bars = totalBars(), opt = (sel) => Array.from({ length: bars }, (_, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${i + 1}마디</option>`).join('');
  const f = Math.min(U.btFrom ?? 0, bars - 1), t = Math.min(U.btTo ?? 1, bars - 1);
  $('#btFrom').innerHTML = opt(f); $('#btTo').innerHTML = opt(t);
  $('#btKind').innerHTML = Object.entries(C.BAR_TOOLS).map(([k, v]) => `<button type="button" data-bt="${k}" class="${(U.btKind || 'copy') === k ? 'on' : ''}">${v}</button>`).join('');
}
$('#btKind').addEventListener('click', e => { const b = e.target.closest('[data-bt]'); if (!b) return; U.btKind = b.dataset.bt; $$('#btKind button').forEach(x => x.classList.toggle('on', x === b)); });
$('#btFrom').onchange = e => { U.btFrom = +e.target.value; };
$('#btTo').onchange = e => { U.btTo = +e.target.value; };
$('#btApply').onclick = () => {
  const f = +$('#btFrom').value, t = +$('#btTo').value, k = U.btKind || 'copy';
  if (f === t) return toast('가져올 마디와 넣을 마디를 다르게 골라요');
  const out = C.transformBar(S.melody, f, t, k, S.key);
  if (!out) return toast(`${f + 1}마디에 음표가 없어요`);
  pushHist(); S.melody = out; save(); r4();
  playWith(null, [{ inst: 'voice', notes: S.melody, vol: .8 }], { from: Math.min(f, t) * C.BAR, to: (Math.max(f, t) + 1) * C.BAR });
  toast(`${f + 1}마디를 ${C.BAR_TOOLS[k]} → ${t + 1}마디에 넣었어요 · 되돌리기로 취소`);
};

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
  SC.renderAbc($('#score4'), SC.buildAbc({ tempo: S.tempo, key: S.key, bars, perLine: LB() === 3 ? 3 : 4, showTitle: false, voices: [{ id: 'V1', name: '노래', clef: 'treble', notes: S.melody }] }));
  noteChips(); rangeUI(); barToolUI();
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
  drawRoll(cv, { bars: totalBars(), layers, play, sel: U.sel, follow: play != null, zoom: U.zoom || 1 });
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
  SC.renderAbc($('#score5'), SC.buildAbc({ tempo: S.tempo, key: S.key, bars, perLine: LB() === 3 ? 3 : 4, showTitle: false, voices: [mv] }));
  const { map, report } = mv.lyrics;
  const sorted = [...S.melody].filter(n => n.p != null).sort((a, b) => a.s - b.s);
  $('#lyEdit').innerHTML = S.lyrics.map((l, li) => {
    const ns = sorted.filter(n => n.s >= C.lineStart(li) && n.s < C.lineStart(li + 1));
    const syl = C.syllables(l.text);
    const rep = report[li];
    const cells = ns.map(n => {
      const m = map.get(n.id) || { kind: 'none', text: '' };
      let lab = '';
      if (m.kind === 'ext') lab = '<span class="ext">⌒</span>';
      else if (m.kind === 'syl') lab = [...m.text].map((ch, k) => `<span class="sy" data-li="${li}" data-j="${m.idx + k}">${esc(ch)}</span>`).join('');
      else if (m.kind === 'skip') lab = '<span class="ext" title="글자 없이 건너뛰는 음(가사 입력에서 비움) — 보통으로 되돌릴 수 있어요">·</span>';
      else lab = '<span class="miss">?</span>';
      const barStart = n.s % C.BAR === 0 || ns.indexOf(n) === 0 || Math.floor(n.s / C.BAR) !== Math.floor(ns[ns.indexOf(n) - 1].s / C.BAR);
      return `<div class="cell ${U.lySel === n.id ? 'on' : ''} ${n.lx === 'd' ? 'dbl' : ''} ${barStart ? 'bs' : ''}" data-id="${n.id}" data-li="${li}"><b>${C.solName(n.p, S.key)}</b><small>${durLabel(n.d)}</small><div class="sl">${lab}</div></div>`;
    }).join('');
    const extra = rep && rep.extra.length ? `<div class="over">남은 글자 ${rep.extra.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : '';
    return `<div class="lyline ${rep && rep.ok ? 'ok' : 'bad'}${rep && rep.rest ? ' rest' : ''}"><div class="lh"><b>${li + 1}줄</b><span>${li * LB() + 1}–${li * LB() + LB()}마디</span><span class="tx">${rep && rep.rest ? '반주 마디' : esc(syl.join(' '))}</span></div><div class="cells">${cells || `<span class="empty">${rep && rep.rest ? '노랫말과 음표가 없는 반주 마디예요(전주·간주·후주)' : '이 마디에 음표가 없어요'}</span>`}</div>${extra}</div>`;
  }).join('');
  $('#lyCheck').innerHTML = report.map(r => {
    const diff = r.syl - r.slots;
    const why = r.rest ? '✓ 반주 마디' : r.ok ? '✓ 맞음' : r.syl === 0 ? '노랫말이 비어 있어요' : diff > 0 ? `글자가 ${diff}개 남아요` : `음표 칸이 ${-diff}개 남아요`;
    return `<li class="${r.ok ? 'ok' : 'bad'}"><b>${r.line + 1}줄</b><span>${r.rest ? '노랫말·음표 없음' : `글자 ${r.syl} · 음표 칸 ${r.slots}`}</span><em>${why}</em></li>`;
  }).join('') + (report.some(r => r.syl) && report.every(r => r.ok) ? '<li class="done">모든 줄이 맞아요. 가사가 붙은 악보가 완성됐어요 → AI 편곡으로</li>' : '');
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
  const li = C.lineOf(n.s);
  const first = S.melody.filter(x => x.p != null && C.lineOf(x.s) === li).sort((a, c) => a.s - c.s)[0];
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
    pushHist(); const r = C.placeSyllable(S.melody, S.lyrics, d.li, d.j, c.dataset.id);
    if (r === 'first') { U.hist.pop(); toast('줄의 첫 글자는 첫 음에서 시작해요 — 앞 음에 두 글자를 붙여 뒤 글자를 당겨 보세요'); }
    save(); r5();
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
  chipsGroup($('#optRange'), C.CHORD_RANGE, st.range || 'far');
  chipsGroup($('#optPer'), { auto: '편곡마다 다르게', ...C.CHORD_PER }, String(st.perBar || 'auto'));
  ensUI();
  $('#scene').value = S.arr.scene || ''; $('#pickWhy').value = S.arr.why || '';
  $$('.tabs [data-tab]').forEach(t => t.setAttribute('aria-selected', t.dataset.tab === U.tab));
  $('#tabAuto').hidden = U.tab !== 'auto'; $('#tabSuno').hidden = U.tab !== 'suno';
  versionsUI(); sunoUI();
  if (!U.edVer && U.tab === 'suno') U.edVer = (S.arr.versions.find(v => v.source === 'suno') || {}).id;
  showEditor6();
}
$('.tabs').addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (!t) return; U.tab = t.dataset.tab; r6(); });
$('#optGenre').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.arr.settings.genre = b.dataset.k; save(); r6(); };
$('#optMood').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.arr.settings.mood = b.dataset.k; save(); r6(); };
$('#optRange').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.arr.settings.range = b.dataset.k; save(); r6(); };
$('#optPer').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.arr.settings.perBar = b.dataset.k; save(); r6(); };
// 우리 편성: 악기마다 연주할 사람 수
const ENS_NOTE = {
  vocal: '한 보표에 함께(제창)', flute: '1명 독주 · 2명이면 3도 화음', recorder: '노래 선율을 쉽게 · 한 옥타브 아래로 적음', clarinet: 'B♭ 이조 · 대선율과 3도 화음 선율',
  sax: 'E♭ 이조 · 팝 혼 리프', trumpet: 'B♭ 이조 · 전주 훅과 선율', trombone: '후렴에서 길게 · 2명이면 두 음', violin: '훅 · 높은 대선율 · 옥타브 위 선율',
  strings: '사람 수만큼 화음(3성부까지)', cello: '근음을 활로 길게', guitar: '1 리듬·코드 · 2 리드·아르페지오', uke: '코드 기호 + 리듬 빗금(스트로크)',
  keys: '큰보표(오른손·왼손)', bass: '한 줄 · 한 옥타브 위로 적음', mallet: '훅 · 화음음 아르페지오', drums: '두 손 + 큰북', cajon: '가운데(저음)·모서리(고음)', tamb: '2·4박 뒷박',
  oboe: '벌스 대선율 · 후렴 선율', bassoon: '근음을 길게 · 후렴은 근음·5음', horn: 'F 이조 · 화음을 길게(전주·후렴)', violin2: '벌스 피치카토 · 후렴 안쪽 화음', viola: '가온음자리표 · 안쪽 성부',
  contrabass: '근음 · 한 옥타브 위로 적음', harp: '큰보표 · 화음 펼침', timpani: '으뜸음·딸림음 두 북 · 굴림',
};
$('#ensPre').insertAdjacentHTML('beforeend', Object.entries(ORCH.PRESETS).map(([k, p]) => `<button type="button" data-pre="${k}">${p.name}</button>`).join(''));
$('#ensPre').addEventListener('click', ev => {
  const b = ev.target.closest('[data-pre]'); if (!b) return;
  const p = ORCH.PRESETS[b.dataset.pre], zero = Object.fromEntries(Object.keys(ORCH.defaultEns()).map(k => [k, 0]));
  S.arr.settings.ens = { ...zero, ...p.ens }; if (p.genre) S.arr.settings.genre = p.genre;
  save(); ensUI(); reorch(); r6();
  toast(`${p.name} 편성으로 바꿨어요 — 장르: ${C.GENRES[S.arr.settings.genre]}`);
});
const staffN = (k, n) => (!n ? 0 : k === 'keys' || k === 'harp' ? 2 : k === 'guitar' ? Math.min(2, n) : 1);
function ensUI() {
  const e = S.arr.settings.ens, keys = ['vocal', ...ORCH.ENS_ORDER];
  const cats = Object.entries(ORCH.ENS_CATS).map(([cat, label]) => {
    const ks = keys.filter(k => ORCH.ENS[k].cat === cat); if (!ks.length) return '';
    const on = ks.reduce((a, k) => a + (e[k] || 0), 0);
    return `<div class="ens-cat"><h3>${label}${on ? `<small>${on}명</small>` : ''}</h3><div class="ens">${ks.map(k => { const info = ORCH.ENS[k], n = e[k] || 0; return `<div class="ens-i ${n ? 'on' : ''}" data-ens="${k}"><b>${info.name}${info.trans ? `<i class="ens-tr" title="이조 악기 — 파트보는 기보음으로 인쇄">${({ 9: 'E♭', 7: 'F', 2: 'B♭' })[info.trans] || 'B♭'}</i>` : ''}</b><span class="ens-st"><button type="button" data-d="-1" aria-label="${info.name} 줄이기">−</button><output>${n}</output><button type="button" data-d="1" aria-label="${info.name} 늘리기">+</button></span><small>${ENS_NOTE[k] || ''} · 최대 ${info.max}명</small></div>`; }).join('')}</div></div>`;
  }).join('');
  $('#ensBox').innerHTML = cats;
  const total = keys.reduce((a, k) => a + (e[k] || 0), 0), staves = (e.vocal ? 1 : 0) + ORCH.ENS_ORDER.reduce((a, k) => a + staffN(k, e[k]), 0);
  $('#ensSum').textContent = `모두 ${total}명 · 보표 ${staves}개`;
  $('#introSel').value = S.arr.settings.intro ?? 2;
}
$('#ensBox').addEventListener('click', ev => {
  const b = ev.target.closest('[data-d]'); if (!b) return;
  const k = b.closest('[data-ens]').dataset.ens, info = ORCH.ENS[k], e = S.arr.settings.ens;
  e[k] = Math.max(0, Math.min(info.max, (e[k] || 0) + +b.dataset.d));
  if (!ORCH.ENS_ORDER.some(x => e[x])) { e[k] = 1; toast('악기를 한 가지 이상 남겨 두어요'); }
  save(); ensUI(); reorch();
});
$('#introSel').onchange = ev => { S.arr.settings.intro = +ev.target.value; save(); reorch(); };
// 편성·전주가 바뀌면 이미 만든 편곡들을 그 편성으로 다시 계산(코드·노래는 그대로)
function reorch() {
  let n = 0;
  S.arr.versions.forEach(v => {
    if (v.source === 'auto') { v.settings = { ...v.settings, ens: clone(S.arr.settings.ens), intro: S.arr.settings.intro }; rebuildParts(v, S.melody); n++; }
    else if (v.src) { orchSuno(v); n++; }
  });
  S.arr.nv = null;
  if (n) { save(); versionsUI(); showEditor6(); toast(`편곡 ${n}가지를 새 편성으로 다시 계산했어요`); }
}
$('#scene').oninput = e => { S.arr.scene = e.target.value; save(); };
$('#pickWhy').oninput = e => { S.arr.why = e.target.value; save(); };
const VARN = ['기본 코드', '색채 코드', '빠른 코드 바꿈'];
$('#genArr').onclick = () => {
  if (!S.melody.length) return toast('먼저 선율을 만들어 주세요 (3단계)');
  if (!ORCH.ENS_ORDER.some(k => S.arr.settings.ens[k])) return toast('편성에서 악기를 하나 이상 골라 주세요');
  const st = clone(S.arr.settings);
  const keep = S.arr.versions.filter(v => v.source === 'suno');
  const slots = ['A', 'B', 'C'].filter(id => !keep.some(v => v.id === id));
  const made = slots.map((id, i) => {
    const r = C.arrange(S.melody, S.lyrics, S.key, st, i);
    return { id, source: 'auto', name: `${C.GENRES[st.genre]} · ${C.MOODS[st.mood]} · ${VARN[i]}`, settings: st, variant: i, chords: r.chords, parts: r.parts, vocal: C.styleVocal(S.melody, st, i, S.key), bars: r.bars, intro: r.intro, sections: r.sections };
  });
  S.arr.versions = [...keep, ...made].sort((a, b) => a.id.localeCompare(b.id));
  if (S.arr.chosen && !S.arr.versions.some(v => v.id === S.arr.chosen)) S.arr.chosen = null;
  if (made.some(v => v.id === S.arr.chosen)) { S.arr.chosen = null; S.base = null; }
  save(); versionsUI(); if (U.edVer && !S.arr.versions.some(v => v.id === U.edVer)) U.edVer = null; showEditor6();
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
  $('#verCount').textContent = `편곡 ${vs.length}가지`;
  $('#vers').innerHTML = vs.map(v => `
    <article class="ver ${S.arr.chosen === v.id ? 'on' : ''}" data-id="${v.id}">
      <div class="vh"><b class="vid">${v.id}</b><div><h3>${esc(v.name)}</h3><span class="tag ${v.source}">${v.source === 'suno' ? '수노 AI' : '자동 편곡'}</span></div></div>
      <p class="prog">${esc(progression(v))}</p>
      <p class="vparts">${v.parts.map(p => esc(p.name)).join(' · ')}</p>
      ${U.audio[v.id] ? `<audio controls preload="none" src="${U.audio[v.id]}"></audio>` : ''}
      <div class="row"><button type="button" class="btn ghost sm" data-play="${v.id}">▶ 듣기</button><button type="button" class="btn ghost sm" data-editv="${v.id}">악보 편집</button><button type="button" class="btn sm" data-choose="${v.id}">${S.arr.chosen === v.id ? '✓ 선택됨' : '선택'}</button></div>
    </article>`).join('');
  const v = chosen();
  const vol = (id, val) => `<input type="range" class="vol" min="0" max="150" step="5" value="${Math.round((val ?? 1) * 100)}" data-vol="${id}" aria-label="음량">`;
  $('#partList').innerHTML = v ? [`<li><b>노래</b><span>${v.vocal ? v.vocal.length + '음' : '없음'}</span>${vol('__voice', S.arr.vvol)}<button type="button" class="mute ${S.arr.vmute ? 'on' : ''}" data-mute="__voice">${S.arr.vmute ? '소리 켜기' : '소리 끄기'}</button></li>`, ...v.parts.map(p => `<li><b>${esc(p.group ? (p.name ? p.name + ' 오른손' : '키보드 왼손') : p.name)}</b><span>${p.notes.length}개</span>${vol(p.id, p.vol)}<button type="button" class="mute ${p.mute ? 'on' : ''}" data-mute="${p.id}">${p.mute ? '소리 켜기' : '소리 끄기'}</button></li>`)].join('') : '<li class="empty">편곡을 하나 고르면 파트가 여기에 나뉘어 나와요. 소리 크기도 파트마다 맞출 수 있어요.</li>';
  chordUI();
}
$('#vers').addEventListener('click', e => {
  const p = e.target.closest('[data-play]'), c = e.target.closest('[data-choose]');
  if (p) { const v = S.arr.versions.find(x => x.id === p.dataset.play); playWith(p, verTracks(v, v.vocal), { tempo: v.bpm }); if (v.id === U.edVer && SND.isPlaying()) ed6.follow(); }
  const ed = e.target.closest('[data-editv]');
  if (ed) { U.edVer = ed.dataset.editv; ed6.clear(); showEditor6(); $('#edCard').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  if (c) {
    const id = c.dataset.choose;
    const doit = () => { S.arr.chosen = id; S.base = clone(S.melody); S.decisions = {}; S.log = []; U.bar = null; save(); versionsUI(); refresh(); toast(`${id} 편곡을 골랐어요 — 고른 이유를 남기고 7단계로`); };
    if (S.arr.chosen && S.arr.chosen !== id && S.log.length) ask('편곡을 바꾸면 7단계 결정 기록이 처음부터 다시 시작돼요. 바꿀까요?', doit, '바꾸기'); else if (S.arr.chosen !== id) doit();
  }
});
$('#partList').addEventListener('click', e => {
  const m = e.target.closest('[data-mute]'); if (!m) return;
  if (m.dataset.mute === '__voice') S.arr.vmute = !S.arr.vmute;
  else { const p = chosen().parts.find(x => x.id === m.dataset.mute); p.mute = !p.mute; syncNv(); }
  save(); versionsUI();
});
$('#partList').addEventListener('input', e => {
  const r = e.target.closest('[data-vol]'); if (!r) return;
  const val = +r.value / 100;
  if (r.dataset.vol === '__voice') S.arr.vvol = val; else { const p = chosen().parts.find(x => x.id === r.dataset.vol); if (p) p.vol = val; syncNv(); }
  save();
});
// 8단계에서 다시 만든 반주(nv)에도 파트 음량·끄기를 그대로
function syncNv() {
  const v = chosen(), nv = S.arr.nv; if (!v || !nv || nv.of !== v.id) return;
  nv.parts.forEach(p => { const o = v.parts.find(x => x.id === p.id); if (o) { p.mute = o.mute; p.vol = o.vol; } });
}
// ── 코드 직접 바꾸기 ──
function chordVer() { return S.arr.versions.find(x => x.id === U.edVer) || chosen() || S.arr.versions[0]; }
function chordUI() {
  const v = chordVer(), box = $('#chordBox');
  const st = S.arr.settings;
  $('#hRange').innerHTML = Object.entries(C.CHORD_RANGE).map(([k, t]) => `<option value="${k}" ${k === (st.range || 'far') ? 'selected' : ''}>${t}</option>`).join('');
  $('#hPer').innerHTML = [['auto', '편곡마다 다르게'], ...Object.entries(C.CHORD_PER)].map(([k, t]) => `<option value="${k}" ${String(k) === String(st.perBar || 'auto') ? 'selected' : ''}>${t}</option>`).join('');
  if (!v || !v.chords || !v.chords.length) { box.innerHTML = '<p class="empty">편곡을 만들면 마디마다 코드가 여기에 나와요.</p>'; return; }
  const key = v.key || S.key, voc = v.source === 'suno' ? (v.vocal || []) : S.melody;
  const fit = C.chordFit(voc, v.chords, key);
  $('#chordWho').textContent = `${v.id} · ${v.name} · ${C.KEYS[key].name}`;
  const opt = c => C.CHORD_GROUPS.map((g, gi) => `<optgroup label="${g}">${C.CHORD_POOL.filter(d => d.g === gi).map(d => `<option value="${d.r}${d.q}" ${d.r === c.r && d.q === c.q ? 'selected' : ''}>${C.chordName(d, key)} · ${d.name}${d.label ? ' (' + d.label + ')' : ''}</option>`).join('')}</optgroup>`).join('');
  const list = v.chords.map((c, i) => [c, i]).filter(([c]) => c.s >= 0);
  // 마디마다 한 칸 — 그 안에 코드가 여럿이면 나란히
  const bars = new Map(); list.forEach(([c, i]) => { const b = Math.floor(c.s / C.BAR); if (!bars.has(b)) bars.set(b, []); bars.get(b).push([c, i]); });
  box.innerHTML = [...bars.entries()].map(([b, cs]) => `<div class="cbar ${cs.length > 1 ? 'multi' : ''}"><span class="cb-n">${b + 1}마디</span><div class="cb-cs">${cs.map(([c, i], j) => {
    const f = fit[i], lvl = f == null ? '' : f >= .6 ? 'good' : f >= .35 ? 'mid' : 'low';
    const beat = C.beatStarts().filter(x => x <= ((c.s % C.BAR) + C.BAR) % C.BAR).length, dg = C.chordDeg(c);
    const nx = v.chords[i + 1], canMerge = nx && Math.floor(nx.s / C.BAR) === b;
    return `<label class="cc ${lvl} ${dg && dg.g ? 'ext g' + dg.g : ''}">${cs.length > 1 || c.d < C.BAR ? `<span>${beat}박~</span>` : ''}<select data-ci="${i}" aria-label="${b + 1}마디 ${beat}박 코드">${opt(c)}</select><i title="노래 음 가운데 화음음 비율">${f == null ? '쉼' : Math.round(f * 100) + '%'}</i><span class="cc-tools">${c.d >= 8 ? `<button type="button" data-split="${i}" title="이 코드를 반으로 나눠 코드 둘로">나누기</button>` : ''}${canMerge ? `<button type="button" data-merge="${i}" title="다음 코드와 하나로 합치기">합치기</button>` : ''}</span></label>`;
  }).join('')}</div></div>`).join('');
}
// 코드를 바꾼 뒤: 자동 편곡은 반주를 다시, 수노 편곡은 재료로 다시 계산(편성 엔진)
function afterChords(v, i) {
  v.userChords = true;
  if (v.source === 'auto') rebuildParts(v, S.melody);
  else if (v.src) orchSuno(v);
  else toast('수노 파트는 그대로 두고 코드 이름만 바꿨어요');
  if (S.arr.nv && S.arr.nv.of === v.id) S.arr.nv = null;
  save(); versionsUI(); if (U.edVer === v.id) ed6.render();
  if (i != null && v.chords[i]) playChord(v.chords[i], v.key || S.key);
}
$('#chordBox').addEventListener('change', e => {
  const sel = e.target.closest('select[data-ci]'); if (!sel) return;
  const v = chordVer(); if (!v) return;
  const d = C.CHORD_POOL.find(x => x.r + x.q === sel.value), i = +sel.dataset.ci, c = v.chords[i];
  v.chords[i] = C.makeChord(d.r, d.q, c.s, c.d, v.key || S.key);
  afterChords(v, i);
});
$('#chordBox').addEventListener('click', e => {
  const b = e.target.closest('[data-split],[data-merge]'); if (!b) return;
  e.preventDefault();
  const v = chordVer(); if (!v) return;
  const key = v.key || S.key;
  if (b.dataset.split != null) { // 한 코드를 반으로: 같은 코드 둘(뒤쪽을 바꿔 쓰면 한 마디에 코드 둘)
    const i = +b.dataset.split, c = v.chords[i], h = c.d / 2;
    v.chords.splice(i, 1, C.makeChord(c.r, c.q, c.s, h, key), C.makeChord(c.r, c.q, c.s + h, h, key));
    afterChords(v, null); toast(`${Math.floor(c.s / C.BAR) + 1}마디 코드를 둘로 나눴어요 — 뒤쪽 코드를 골라 바꿔요`);
  } else {
    const i = +b.dataset.merge, c = v.chords[i], n = v.chords[i + 1];
    v.chords.splice(i, 2, C.makeChord(c.r, c.q, c.s, c.d + n.d, key));
    afterChords(v, i);
  }
});
$('#hRange').onchange = e => { S.arr.settings.range = e.target.value; save(); chipsGroup($('#optRange'), C.CHORD_RANGE, S.arr.settings.range); };
$('#hPer').onchange = e => { S.arr.settings.perBar = e.target.value; save(); chipsGroup($('#optPer'), { auto: '편곡마다 다르게', ...C.CHORD_PER }, String(S.arr.settings.perBar)); };
// 이 설정으로 코드 다시 붙이기(고른 편곡 하나)
$('#reHarm').onclick = () => {
  const v = chordVer(); if (!v) return toast('편곡을 먼저 만들어요');
  const st = S.arr.settings;
  if (v.source === 'auto') { v.settings = { ...v.settings, range: st.range, perBar: st.perBar }; v.userChords = false; rebuildParts(v, S.melody); }
  else { const p = sunoPitched(v); v.chords = C.harmonize(p.length ? p : S.melody, v.bars, v.key || S.key, harmOpts()); v.userChords = false; if (v.src) orchSuno(v); }
  if (S.arr.nv && S.arr.nv.of === v.id) S.arr.nv = null;
  save(); versionsUI(); if (U.edVer === v.id) ed6.render();
  const ext = v.chords.filter(c => { const d = C.chordDeg(c); return d && d.g; }).length;
  toast(`코드를 다시 붙였어요 · ${v.chords.length}개${ext ? ` (관계조·부속화음 ${ext}개)` : ''}`);
};
function rebuildParts(v, melody) {
  const r = C.arrange(melody, S.lyrics, S.key, v.settings, v.variant, v.userChords ? v.chords : null);
  r.parts.forEach(p => { const o = v.parts.find(x => x.id === p.id); if (o) { p.mute = o.mute; p.vol = o.vol; } });
  v.parts = r.parts; v.chords = r.chords; v.bars = r.bars; v.intro = r.intro; v.sections = r.sections;
  return r;
}
function playChord(c, key) {
  const ctx = SND.audio(), vs = C.voicing(c, C.KEYS[key].tonic, 62);
  vs.forEach(p => SND.voice(ctx, SND.master, 'keys', p, ctx.currentTime + .02, .7, .6));
}
$('#resetChords').onclick = () => {
  const v = chordVer(); if (!v || v.source !== 'auto') return toast('자동 편곡에서만 처음 코드로 돌릴 수 있어요');
  v.userChords = false; rebuildParts(v, S.melody); save(); versionsUI(); ed6.render(); toast('처음 만든 코드로 돌렸어요');
};
// 수노 MIDI — 끌어다 놓으면 박을 맞춘(퀀타이즈) 악보로 바로
function guessPart(name, tr) {
  const stem = MIDI.stemName(name) || '';
  const n = (stem + ' ' + name + ' ' + (tr.name || '')).toLowerCase();
  if (/backing|harmony|백보컬|코러스/.test(n)) return 'skip'; // 수노 Backing Vocals: 노래 파트는 하나만
  if (/\bfx\b|effect|효과/.test(n)) return 'skip';
  if (tr.ch === 9 || /drum|perc|kick|snare|드럼|타악/.test(n)) return 'drums';
  if (/vocal|voice|vox|sing|lead|melody|보컬|노래/.test(n)) return 'melody';
  if (/bass|베이스/.test(n)) return 'bass';
  if (/guitar|gtr|기타/.test(n)) return 'guitar';
  if (/string|violin|cello|orch|스트링/.test(n)) return 'strings';
  if (/flute|wood|플루트/.test(n)) return 'flute';
  if (/brass|horn|sax|trumpet|관악/.test(n)) return 'brass';
  return 'keys';
}
const PARTOPT = { melody: '노래', drums: '드럼', bass: '베이스기타', guitar: '기타', keys: '키보드', strings: '스트링', flute: '플루트', brass: '관악기', skip: '빼기' };
const DKIT = p => (p === 35 || p === 36 ? 'kick' : [37, 38, 39, 40].includes(p) ? 'snare' : [49, 51, 52, 55, 57].includes(p) ? 'crash' : 'hat');
const PROF = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
function detectKey(notes) {
  const h = Array(12).fill(0); notes.forEach(n => { h[C.pc(n.p)] += n.d || 1; });
  let best = 'C', bs = -1e9;
  for (const [k, info] of Object.entries(C.KEYS)) { let sc = 0; for (let i = 0; i < 12; i++) sc += h[(i + info.tonic) % 12] * PROF[i]; if (sc > bs) { bs = sc; best = k; } }
  return best;
}
function autoSlot() {
  const ids = ['A', 'B', 'C'];
  return ids.find(id => !S.arr.versions.some(v => v.id === id)) || ids.find(id => S.arr.versions.find(v => v.id === id).source !== 'suno') || 'C';
}
const fmtBpm = b => String(Math.round(b * 10) / 10);
// 노래가 시작하는 마디(맞춤 단위의 8분음표 자리로 반올림해 살짝 이른 첫 음도 그 마디로)
function autoVstart() {
  const c = U.suno.cfg, voc = U.suno.tracks.filter(t => t.part === 'melody').flatMap(t => t.notes);
  if (!voc.length) return 0;
  const beat = 60 / c.bpm, first = Math.min(...voc.map(n => n.t));
  return Math.max(0, Math.floor(Math.round((first - (c.off || 0)) / beat * 2) / 2 / 4 + 1e-6));
}
// 마디 첫 박 찾기: 수노 MIDI는 첫 마디가 박 몇 개 밀려 시작하기도 한다 — 크래시·긴 음·베이스·큰북/작은북이 모이는 자리를 1박으로
function autoPhase() {
  const c = U.suno.cfg, beat = 60 / c.bpm, sc = [0, 0, 0, 0];
  let first = Infinity;
  U.suno.tracks.filter(t => t.part !== 'skip').forEach(t => t.notes.forEach(n => {
    const b = (n.t - (c.off || 0)) / beat; first = Math.min(first, b);
    const rb = Math.round(b); if (Math.abs(b - rb) > .2) return; // 박 위의 음만
    const at = ((rb % 4) + 4) % 4;
    if (t.part === 'drums') {
      if ([49, 52, 55, 57].includes(n.p)) sc[at] += 4; // 크래시: 마디 첫 박
      else if (n.p === 35 || n.p === 36) { sc[at] += .5; sc[(at + 2) % 4] += .5; } // 큰북: 1·3박
      else if (n.p >= 37 && n.p <= 40) { sc[(at + 3) % 4] += .6; sc[(at + 1) % 4] += .6; } // 작은북: 2·4박
      return;
    }
    const w = Math.min(4, n.d / beat) * (t.part === 'bass' ? 1.5 : 1); // 긴 음·베이스는 마디 첫 박에 많다
    sc[at] += w; sc[(at + 2) % 4] += w * .4;
  }));
  let k = 0; for (let i = 1; i < 4; i++) if (sc[i] > sc[k]) k = i;
  if (!k || sc[k] < sc[0] * 1.08) return { k: 0, off: c.off || 0 };
  const early = first < k - .25; // 첫 박 앞에 음이 있으면 잘라 내지 않고 한 마디를 앞에 둔다
  return { k, early, off: (c.off || 0) + (early ? k - 4 : k) * beat };
}
async function importSuno(fileList) {
  let files = [...fileList];
  const zips = files.filter(f => /\.zip$/i.test(f.name) || /zip/.test(f.type));
  files = files.filter(f => !zips.includes(f));
  for (const z of zips) { try { files.push(...await MIDI.unzipMidi(z)); } catch (x) { toast(`${z.name}: 압축을 풀지 못했어요`); } }
  files = files.filter(f => /\.midi?$/i.test(f.name) || /midi/.test(f.type));
  if (!files.length) return toast('MIDI 파일(.mid)이나 수노에서 받은 압축 파일(.zip)을 넣어 주세요');
  const lead = f => { const n = (MIDI.stemName(f.name) || f.name).toLowerCase(); return /vocal|voice|vox|lead|melody|보컬|노래/.test(n) && !/backing|harmony|백보컬|코러스/.test(n) ? 0 : 1; };
  files.sort((a, b) => lead(a) - lead(b) || a.name.localeCompare(b.name));
  const parsed = [];
  for (const f of files) {
    try { parsed.push({ f, m: MIDI.parseMidi(await f.arrayBuffer()) }); }
    catch (x) { toast(`${f.name}: ${x.message || '읽을 수 없는 파일'}`); }
  }
  if (!parsed.length) return;
  const fileBpm = MIDI.retimeAll(parsed.map(x => x.m)) || S.tempo; // 모든 스템을 한 시간 축(박)에
  const tracks = [];
  parsed.forEach(({ f, m }) => MIDI.stemTracks(f.name, m).forEach(tr => tracks.push({ file: f.name, name: tr.name, notes: tr.notes, ch: tr.ch, program: tr.program, merged: tr.merged || 1, dropped: tr.dropped || 0, part: guessPart(f.name, tr) })));
  if (!tracks.length) return toast('MIDI에 음표가 없어요');
  let seen = false; tracks.forEach(t => { if (t.part === 'melody') { if (seen) t.part = 'flute'; seen = true; } });
  if (!seen) { const c = tracks.filter(t => t.part !== 'drums' && t.part !== 'skip').map(t => ({ t, avg: t.notes.reduce((a, n) => a + n.p, 0) / t.notes.length })).sort((x, y) => y.avg - x.avg)[0]; if (c) c.t.part = 'melody'; }
  U.suno = { tracks, files: parsed.length, cfg: { bpm: fileBpm, fileBpm, grid: U.suno.cfg ? U.suno.cfg.grid : 2, off: 0, clean: true, vstart: 0, vstartSet: false }, slot: $('#sSlot').value === 'auto' ? autoSlot() : $('#sSlot').value };
  const ph = autoPhase(); U.suno.cfg.off = Math.round(ph.off * 1000) / 1000; U.suno.cfg.phase = ph.k; U.suno.cfg.early = !!ph.early;
  buildSuno(true);
}
function buildSuno(first) {
  const t = U.suno.tracks.filter(x => x.part !== 'skip'); if (!t.length) return toast('가져올 트랙이 없어요');
  const cfg = U.suno.cfg;
  if (!cfg.vstartSet) cfg.vstart = autoVstart();
  const { bpm, grid, off, clean } = cfg;
  const barSec = 240 / bpm, beat = 60 / bpm;
  const end = Math.max(...t.flatMap(x => x.notes.map(n => n.t + n.d)));
  const bars = Math.min(200, Math.max(2, Math.ceil((end - off) / barSec)));
  const keep = n => !clean || n.d >= beat * grid / 4 * .45; // 잔음 정리: 맞춤 단위의 절반보다 짧은 음은 뺀다
  const melNotes = []; const parts = [];
  t.forEach(tr => {
    if (tr.part === 'melody') { melNotes.push(...tr.notes.filter(keep)); return; } // 노래로 고른 트랙은 모두 합쳐 한 줄로
    if (tr.part === 'drums') {
      const raw = MIDI.stemToNotes(tr.notes, bpm, off, grid, 0, bars, false);
      const by = new Map();
      raw.forEach(n => { if (!by.has(n.s)) by.set(n.s, new Set()); (n.chord || [n.p]).map(DKIT).forEach(k => by.get(n.s).add(k)); });
      const ss = [...by.keys()].sort((x, y) => x - y);
      parts.push({ id: 'drums' + parts.length, name: '드럼', inst: 'drums', clef: 'perc', src: tr.name, notes: ss.map((s, i) => ({ s, d: Math.min((ss[i + 1] ?? bars * C.BAR) - s, 4), p: 36, kit: [...by.get(s)] })) });
      return;
    }
    const mono = ['bass', 'flute'].includes(tr.part);
    const notes = MIDI.stemToNotes(tr.notes.filter(keep), bpm, off, grid, 0, bars, mono);
    const info = C.INSTS[tr.part];
    parts.push({ id: tr.part + parts.length, name: info.name, inst: tr.part, clef: tr.part === 'bass' ? 'bass' : 'treble', src: tr.name, program: tr.program ?? undefined, notes: notes.map(n => ({ p: n.p, s: n.s, d: n.d, chord: n.chord })) });
  });
  // 같은 악기가 둘 이상이면 스템 이름을 붙여 구별(예: 키보드·Synth)
  parts.forEach(p => { if (parts.filter(q => q.inst === p.inst).length > 1 && p.src) p.name = `${p.name}·${p.src}`; });
  const vocal = melNotes.length ? MIDI.stemToNotes(melNotes, bpm, off, grid, 0, bars, true).map(n => ({ id: C.uid(), p: n.p, s: n.s, d: n.d, lx: 'n' })) : null;
  parts.sort((x, y) => C.INST_ORDER.indexOf(x.inst) - C.INST_ORDER.indexOf(y.inst));
  const pitched = [...(vocal || []), ...parts.filter(p => p.inst !== 'drums').flatMap(p => p.notes.flatMap(n => (n.chord || [n.p]).map(q => ({ p: q, s: n.s, d: n.d }))))];
  const key = detectKey(pitched.length ? pitched : S.melody);
  const chords = C.harmonize(pitched.length ? pitched : S.melody, bars, key, harmOpts());
  const slot = U.suno.slot;
  const prev = S.arr.versions.find(x => x.id === slot);
  const name = $('#sName').value.trim() || (prev && prev.source === 'suno' ? prev.name : `수노 편곡 ${slot}`);
  // 수노 스템은 그대로 쓰지 않고 '재료'로 모아 우리 편성에 맞게 다시 계산한다
  const src = {};
  parts.forEach(p => { const k = p.inst === 'drums' ? 'drums' : p.inst; (src[k] = src[k] || []).push(...p.notes); });
  const v = { id: slot, source: 'suno', name, parts: [], src, vocal: vocal || [], chords, bars, vstart: cfg.vstart, bpm: Math.round(bpm), key, grid };
  orchSuno(v);
  S.arr.versions = [...S.arr.versions.filter(x => x.id !== slot), v].sort((x, y) => x.id.localeCompare(y.id));
  if (S.arr.chosen === slot) { S.base = clone(S.melody); S.decisions = {}; S.log = []; }
  U.edVer = slot; save(); versionsUI(); sunoUI(); showEditor6();
  const G = { 1: '16분음표', 2: '8분음표', 4: '4분음표' }[grid];
  const merged = U.suno.tracks.reduce((a, x) => a + (x.merged || 1), 0);
  let long = !cfg.halved && bpm > 108 && vocal && vocal.length ? ' <em class="s-tip">가사 한 줄이 4마디로 길게 나오면 맞춤 설정에서 <b>÷2</b>를 눌러요</em>' : '';
  if (melNotes.length) { // 노래 첫 음이 박 사이(반 박)에 걸려 있으면 첫 박 위치를 알려 준다
    const fb = (Math.min(...melNotes.map(n => n.t)) - off) / beat, fr = fb - Math.floor(fb);
    if (fr > .35 && fr < .65) long += ' <em class="s-tip">노래 첫 음이 박과 박 사이에 있어요 — 맞춤 설정의 첫 박 위치 <b>◀ 반 박</b>(또는 <b>반 박 ▶</b>)으로 맞춰 보세요</em>';
  }
  if (first && cfg.phase) long += ` <em class="s-tip ok">수노 MIDI의 마디가 ${cfg.phase}박 밀려 있어서, 크래시·큰북·긴 음이 모이는 자리를 1박으로 맞췄어요${cfg.early ? ' — 첫 박 앞에 나오는 음이 있어 그 앞에 한 마디를 두었어요' : ''}. 다르게 들리면 악보 편집의 <b>◀ 한 박 · 한 박 ▶</b>으로 고쳐요</em>`;
  $('#sMsg').innerHTML = `<b>✓ ${slot} 칸에 악보로 넣었어요</b> · ${G} 단위로 박 맞춤 · ${bars}마디 · ♩=${fmtBpm(bpm)} · ${C.KEYS[key].name} · 노래 ${vocal ? vocal.length + '음' : '없음'}(${cfg.vstart + 1}마디부터) · 파트 ${parts.length}개${merged > U.suno.tracks.length ? ` · 쪼개진 트랙 ${merged}개를 스템 ${U.suno.tracks.length}개로 합침` : ''}${long}`;
  if (first) { toast('수노 MIDI를 박에 맞춘 악보로 바꿨어요 — 음표를 눌러 고쳐요'); setTimeout(() => $('#edCard').scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); }
}
const harmOpts = () => { const st = S.arr.settings; return { pool: ['I', 'ii', 'iii', 'IV', 'V', 'vi'], range: st.range || 'far', perBar: st.perBar && st.perBar !== 'auto' ? +st.perBar : 1 }; };
const isDrum = p => p.inst === 'drums' || p.drum;
// 수노 편곡의 노래·재료 음 → 코드 다시 붙이기
function sunoPitched(v) {
  const src = v.src ? Object.entries(v.src).filter(([k]) => k !== 'drums').flatMap(([, ns]) => ns) : v.parts.filter(p => !isDrum(p)).flatMap(p => p.notes);
  return [...(v.vocal || []), ...src.flatMap(n => (n.chord || [n.p]).map(q => ({ p: q, s: n.s, d: n.d })))];
}
// 저장된 수노 편곡을 박 단위로 옮기기(MIDI 파일 없이도) — u: 16분음표 칸(−면 앞으로). 앞으로 옮기다 음이 잘리면 한 마디를 앞에 둔다
function shiftVer(v, u) {
  const all = [...(v.vocal || []), ...(v.src ? Object.values(v.src).flat() : v.parts.flatMap(p => p.notes))];
  if (!all.length) return toast('옮길 음표가 없어요');
  const first = Math.min(...all.map(n => n.s));
  const d = first + u < 0 ? u + C.BAR : u;
  const mv = ns => (ns || []).map(n => ({ ...n, s: n.s + d })).filter(n => n.s >= 0);
  v.vocal = mv(v.vocal);
  if (v.src) Object.keys(v.src).forEach(k => { v.src[k] = mv(v.src[k]); });
  else v.parts.forEach(p => { p.notes = mv(p.notes); p.dyn = (p.dyn || []).map(x => ({ ...x, s: Math.max(0, x.s + d) })); p.tech = (p.tech || []).map(x => ({ ...x, s: Math.max(0, x.s + d) })); });
  const end = Math.max(...[...(v.vocal || []), ...(v.src ? Object.values(v.src).flat() : v.parts.flatMap(p => p.notes))].map(n => n.s + n.d));
  v.bars = Math.min(200, Math.max(2, Math.ceil(end / C.BAR)));
  if (v.vocal && v.vocal.length) v.vstart = Math.max(0, Math.floor(Math.round(Math.min(...v.vocal.map(n => n.s)) / 2) * 2 / C.BAR));
  const p = sunoPitched(v);
  v.chords = C.harmonize(p.length ? p : S.melody, v.bars, v.key || S.key, harmOpts()); v.userChords = false;
  if (v.src) orchSuno(v);
  else v.sections = v.vstart ? [{ bar: 0, s: 0, name: 'Intro' }, { bar: v.vstart, s: v.vstart * C.BAR, name: 'Verse' }] : [{ bar: 0, s: 0, name: 'Verse' }];
  if (S.arr.chosen === v.id) { S.base = clone(S.melody); S.decisions = {}; S.log = []; }
  S.arr.nv = null;
  return d;
}
function orchSuno(v) {
  const vs = v.vstart || 0, end = v.bars * C.BAR;
  const sections = vs ? [{ bar: 0, s: 0, name: 'Intro' }, { bar: vs, s: vs * C.BAR, name: 'Verse' }] : [{ bar: 0, s: 0, name: 'Verse' }];
  const old = v.parts || [];
  v.parts = ORCH.orchestrate({ melody: v.vocal || [], chords: v.chords, key: v.key, bars: v.bars, start: 0, end, intro: 0, sections, lead: [], genre: S.arr.settings.genre, mood: S.arr.settings.mood, ens: S.arr.settings.ens, sources: v.src });
  v.parts.forEach(p => { const o = old.find(x => x.id === p.id); if (o) { p.mute = o.mute; p.vol = o.vol; } });
  v.sections = sections;
}
function sunoUI() {
  const has = U.suno.tracks && U.suno.tracks.length, cfg = U.suno.cfg || { grid: 2 };
  $$('#sGridSel button').forEach(b => b.classList.toggle('on', +b.dataset.g === (cfg.grid || 2)));
  $('#sAdvBody').hidden = !has; $('#sAdvNone').hidden = !!has;
  if (!has) return;
  $('#sTracks').innerHTML = `<table><thead><tr><th>스템(파일)</th><th>트랙</th><th>음</th><th>파트</th></tr></thead><tbody>${U.suno.tracks.map((x, i) => `<tr><td>${esc(MIDI.stemName(x.file) || x.file)}</td><td>${x.merged > 1 ? `${x.merged}개 합침` : esc(x.name || '—')}${x.dropped ? ` <small>(${x.dropped}개 뺌)</small>` : ''}</td><td>${x.notes.length}</td><td><select data-ti="${i}">${Object.entries(PARTOPT).map(([k, v]) => `<option value="${k}" ${x.part === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>`;
  if (document.activeElement !== $('#sBpm')) $('#sBpm').value = fmtBpm(cfg.bpm);
  $('#sBpmInfo').textContent = cfg.fileBpm ? `MIDI ♩=${fmtBpm(cfg.fileBpm)}` : '';
  if (document.activeElement !== $('#sBar')) $('#sBar').value = (cfg.vstart || 0) + 1;
  $('#sBarAuto').hidden = !cfg.vstartSet;
  $('#sOff').value = cfg.off || 0; $('#sClean').checked = cfg.clean !== false;
}
let sunoT = null;
function sunoRe() { clearTimeout(sunoT); sunoT = setTimeout(() => { if (U.suno.tracks && U.suno.tracks.length) buildSuno(false); }, 250); }
$('#sTracks').addEventListener('change', e => { const s = e.target.closest('select[data-ti]'); if (s) { U.suno.tracks[+s.dataset.ti].part = s.value; sunoRe(); } });
$('#sGridSel').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  U.suno.cfg = { ...(U.suno.cfg || {}), grid: +b.dataset.g };
  $$('#sGridSel button').forEach(x => x.classList.toggle('on', x === b));
  if (U.suno.tracks && U.suno.tracks.length) buildSuno(false); else toast('MIDI 파일을 넣으면 이 단위로 박을 맞춰요');
});
$('#sBpm').addEventListener('input', () => { if (!U.suno.cfg) return; const v = +$('#sBpm').value; if (v >= 20 && v <= 300) { U.suno.cfg.bpm = v; sunoRe(); } });
// ÷2·×2: 빠르기를 정확히 반·두 배로(박이 한 칸도 밀리지 않게)
['sHalf', 'sDouble'].forEach(id => $('#' + id).addEventListener('click', () => {
  const c = U.suno.cfg; if (!c || !U.suno.tracks.length) return toast('MIDI 파일을 먼저 넣어요');
  c.bpm = id === 'sHalf' ? c.bpm / 2 : c.bpm * 2; c.halved = true;
  $('#sBpm').value = fmtBpm(c.bpm); sunoRe();
  toast(id === 'sHalf' ? `♩=${fmtBpm(c.bpm)} — 한 마디가 두 배로 길어져요` : `♩=${fmtBpm(c.bpm)} — 한 마디가 반으로 짧아져요`);
}));
$('#sOff').addEventListener('input', () => { if (!U.suno.cfg) return; U.suno.cfg.off = +$('#sOff').value || 0; sunoRe(); });
// 첫 박 옮기기: 반 박씩(모든 파트의 박 자리가 함께 옮겨진다)
[['sOffL', -.5], ['sOffR', .5], ['sOffL4', -1], ['sOffR4', 1]].forEach(([id, bt]) => $('#' + id).addEventListener('click', () => {
  const c = U.suno.cfg; if (!c || !U.suno.tracks.length) return toast('MIDI 파일을 먼저 넣어요');
  c.off = Math.round(((c.off || 0) + bt * 60 / c.bpm) * 1000) / 1000; c.phase = 0;
  $('#sOff').value = c.off; sunoRe();
}));
$('#sBar').addEventListener('input', () => { if (!U.suno.cfg) return; U.suno.cfg.vstart = Math.max(0, (+$('#sBar').value || 1) - 1); U.suno.cfg.vstartSet = true; $('#sBarAuto').hidden = false; sunoRe(); });
$('#sBarAuto').addEventListener('click', () => { if (!U.suno.cfg) return; U.suno.cfg.vstartSet = false; sunoRe(); });
$('#sClean').addEventListener('change', () => { if (!U.suno.cfg) return; U.suno.cfg.clean = $('#sClean').checked; sunoRe(); });
$('#sMidi').onchange = e => { importSuno(e.target.files); e.target.value = ''; };
const drop = $('#sDrop');
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => importSuno(e.dataTransfer.files));
document.addEventListener('dragover', e => { if ([...(e.dataTransfer.items || [])].some(i => i.kind === 'file')) e.preventDefault(); });
document.addEventListener('drop', e => {
  if (e.target.closest('#sDrop') || e.target.closest('#a2sDlg')) return;
  const fs = [...(e.dataTransfer.files || [])]; if (!fs.some(f => /\.(midi?|zip)$/i.test(f.name))) return;
  e.preventDefault(); U.tab = 'suno'; go(6); importSuno(fs);
});
$('#sAudio').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const slot = $('#sSlot').value === 'auto' ? (U.edVer || autoSlot()) : $('#sSlot').value;
  if (U.audio[slot]) URL.revokeObjectURL(U.audio[slot]);
  U.audio[slot] = URL.createObjectURL(f); toast(`${slot} 칸에 수노 음원을 붙였어요 (이 기기에서만)`); versionsUI();
};
// 악보 편집(6단계)
const ed6 = createEditor($('#ed6'), {
  model: () => {
    const v = S.arr.versions.find(x => x.id === U.edVer); if (!v) return null;
    const voices = [];
    const ch = v.chords ? v.chords.map(c => ({ s: c.s, name: c.name })) : null;
    if (v.vocal && v.vocal.length) voices.push({ id: 'V', name: v.source === 'suno' ? '노래(수노)' : '노래(편곡)', sub: 'Voc.', clef: 'treble', notes: v.vocal, editable: true, inst: 'melody', lyricsTarget: true, chords: ch, lyrics: noteLyrics(v.vocal) });
    v.parts.forEach((p, i) => voices.push(partVoice(p, i, true, !voices.length && i === 0 ? ch : null, ch)));
    const suno = v.source === 'suno';
    return { tempo: v.bpm || S.tempo, key: v.key || S.key, bars: v.bars || totalBars(), perLine: LB() === 3 ? 3 : 4, voices, intro: suno ? 0 : v.intro || 0, sections: v.sections, ...(suno ? { pickup: 0 } : {}), start: suno ? 0 : -(v.intro ? v.intro * C.BAR : S.pickup || 0) };
  },
  // 타이프 인 스코어: 편곡 노래 음표마다 글자(영어 붙임표 'hap-' · 늘임 '_')
  lyric: { get: (v, n) => n.ly || '', set: (v, n, t) => { if (t) n.ly = t; else delete n.ly; }, hyphen: true },
  printTitle: () => S.title || '우리 노래',
  printHeader: () => { const v = S.arr.versions.find(x => x.id === U.edVer); return { credit: [S.group, v ? `${v.id} · ${v.name}` : ''].filter(Boolean).join(' · '), style: `${STYLE[S.arr.settings.genre] || 'Pop'}` }; },
  onChange: () => { save(); versionsUI(); },
  onPlay: (at, btn, sp = 1) => { const v = S.arr.versions.find(x => x.id === U.edVer); if (v) playWith(btn, verTracks(v, v.vocal), { from: at, tempo: (v.bpm || S.tempo) * sp }); },
  toast, staffwidth: 1000,
});
// 파트 → 악보 성부(편성 정보 그대로)
function partVoice(p, i, editable, chords = null, allCh = null) {
  return { id: 'P' + i, name: p.name, sub: p.sub, clef: p.clef, notes: p.notes, drum: isDrum(p), disp: p.disp, trans: p.trans, slash: p.slash, group: p.group, band: true, dyn: p.dyn, tech: p.tech, editable, inst: p.inst, chords: chords || (p.slash ? allCh : null), lockMsg: '수노 파트는 6단계 악보 편집에서 고쳐요' };
}
// 음표마다 적은 가사(ly) → 악보 가사 줄
function noteLyrics(ns) {
  if (!ns || !ns.some(n => n.ly)) return null;
  const map = new Map(); ns.forEach(n => { if (!n.ly || !n.id) return; map.set(n.id, n.ly === '_' ? { text: '', kind: 'ext' } : { text: n.ly.replace(/-$/, ''), kind: 'syl', hy: /-$/.test(n.ly) }); });
  return { map };
}
function showEditor6() {
  const v = S.arr.versions.find(x => x.id === U.edVer);
  $('#edCard').hidden = !v; if (!v) return;
  $('#edName').textContent = `${v.id} · ${v.name}`;
  $('#etShift').hidden = v.source !== 'suno';
  keyCtl($('#etKey'), v.source === 'suno' ? v.key || S.key : S.key);
  $('#edPick').innerHTML = S.arr.versions.map(x => `<button type="button" data-edv="${x.id}" class="${x.id === v.id ? 'on' : ''}">${x.id}</button>`).join('');
  ed6.render();
}
// 악보 편집 도구 줄: 박 옮기기(수노) · 조옮김
$('#etShift').addEventListener('click', e => {
  const b = e.target.closest('[data-sh]'); if (!b) return;
  const v = S.arr.versions.find(x => x.id === U.edVer); if (!v || v.source !== 'suno') return;
  const u = +b.dataset.sh;
  if (U.suno.tracks && U.suno.tracks.length && U.suno.slot === v.id && U.suno.cfg) { // MIDI가 아직 열려 있으면 원본에서 다시
    const c = U.suno.cfg; c.off = Math.round(((c.off || 0) - u / 4 * 60 / c.bpm) * 1000) / 1000; c.phase = 0; $('#sOff').value = c.off; buildSuno(false);
  } else {
    const d = shiftVer(v, u); if (d == null) return; ed6.clear(); save(); versionsUI(); showEditor6();
    if (d !== u) return toast(`모든 파트를 ${Math.abs(u) / 4}박 앞으로 맞췄어요 — 첫 박 앞에 나오는 음이 있어 그 앞에 한 마디(못갖춘마디처럼)를 두었어요`);
  }
  toast(`모든 파트를 ${Math.abs(u) / 4}박 ${u < 0 ? '앞으로' : '뒤로'} 옮겼어요`);
});
// 조옮김 도구: 12개 장조 + 반음 ▲▼ (곡 전체 — 내 선율·자동 편곡·수노 편곡을 함께)
function keyCtl(box, cur) {
  if (!box) return;
  box.innerHTML = `<span class="et-l">조옮김</span><button type="button" data-tr="-1" title="곡 전체를 반음 내리기">반음 ▼</button><select data-keysel aria-label="조성">${C.KEY_ORDER.map(k => `<option value="${k}" ${k === cur ? 'selected' : ''}>${C.KEYS[k].name} (${k.replace('b', '♭').replace('#', '♯')})</option>`).join('')}</select><button type="button" data-tr="1" title="곡 전체를 반음 올리기">반음 ▲</button>`;
  box.dataset.cur = cur;
}
function transposeSong(sh, toKey) {
  if (!sh) return;
  const old = S.key, ev = S.arr.versions.find(x => x.id === U.edVer);
  const ref = ev && ev.source === 'suno' && U.step === 6 ? ev.key || old : old; // 보고 있는 악보의 조를 기준으로
  S.key = toKey && ref === old ? toKey : C.shiftKey(old, sh);
  transposeAll(sh, old, ev && ev.source === 'suno' && U.step === 6 ? toKey : null);
  toast(`곡 전체를 ${sh > 0 ? '반음 ' + sh + '개 위로' : '반음 ' + -sh + '개 아래로'} 옮겼어요 — ${C.KEYS[toKey || S.key].name}`);
}
document.addEventListener('click', e => {
  const b = e.target.closest('.et-key [data-tr]'); if (!b) return;
  const cur = b.closest('.et-key').dataset.cur || S.key, d = +b.dataset.tr;
  transposeSong(d, C.shiftKey(cur, d));
});
document.addEventListener('change', e => {
  const sel = e.target.closest('.et-key [data-keysel]'); if (!sel) return;
  const cur = sel.closest('.et-key').dataset.cur || S.key, to = sel.value; if (to === cur) return;
  const sh = C.keyShift(cur, to); if (!sh) { // 딴이름한소리조(올림바 ↔ 내림사): 음은 그대로, 조표만
    S.key = S.key === cur ? to : S.key; S.arr.versions.forEach(v => { if (v.key === cur) { v.key = to; if (v.chords) v.chords = v.chords.map(c => ({ ...c, name: C.chordName(c, to) })); } }); save(); refresh(); return;
  }
  transposeSong(sh, to);
});
$('#edPick').addEventListener('click', e => { const b = e.target.closest('[data-edv]'); if (!b) return; U.edVer = b.dataset.edv; ed6.clear(); showEditor6(); });

// ── 7 비교·수정 ──
const vOff = v => (v && v.source === 'suno' ? (v.vstart || 0) * C.BAR : 0);
const shiftN = (ns, off, keep = 0) => off ? ns.map(n => ({ ...n, s: n.s - off })).filter(n => n.s >= -keep) : ns;
const sunoIntro = v => Math.min(4, (v && v.vstart) || 0);
const alignedVocal = v => shiftN(v.vocal || [], vOff(v));
const alignedParts = v => vOff(v) ? v.parts.map(p => ({ ...p, notes: shiftN(p.notes, vOff(v), sunoIntro(v) * C.BAR), dyn: (p.dyn || []).map(d => ({ ...d, s: d.s - vOff(v) })), tech: (p.tech || []).map(d => ({ ...d, s: d.s - vOff(v) })) })) : v.parts;
const alignedChords = v => v.chords ? shiftN(v.chords, vOff(v), sunoIntro(v) * C.BAR) : null;
function diffs() { const v = chosen(); if (!v || !S.base) return []; return C.diffBars(S.base, alignedVocal(v), totalBars()); }
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
  // 그 줄(가사 한 줄) 악보: 내 선율 / 편곡 버전
  const line = Math.max(0, Math.floor(d.bar / LB())), a = line * C.LINE, P = line === 0 ? S.pickup || 0 : 0; // 첫 줄은 못갖춘마디까지
  const shift = ns => ns.filter(n => n.p != null && n.s >= a - P && n.s < a + C.LINE).map(n => ({ ...n, s: n.s - a }));
  const nm = vlab(v) === 'AI' ? 'AI 버전' : '편곡 버전';
  SC.renderAbc($('#score7'), SC.buildAbc({ tempo: S.tempo, key: S.key, bars: LB(), perLine: LB(), showTitle: false, pickup: P, cutEnd: 0, voices: [{ id: 'M', name: '내 선율', clef: 'treble', notes: shift(S.base) }, { id: 'A', name: nm, clef: 'treble', notes: shift(alignedVocal(v)) }] }), { staffwidth: 640 });
  drawRoll7(SND.position());
  stat('#stat7'); logUI();
}
function drawRoll7(play) {
  const cv = $('#roll7'); if (!cv.offsetParent) return;
  const v = chosen(); if (!v || U.bar == null) return;
  const line = Math.max(0, Math.floor(U.bar / LB()));
  const mine = S.base.filter(n => n.p != null);
  const ai = alignedVocal(v).map(n => ({ ...n, kind: C.sameNote(n, mine) ? 'same' : 'diff' }));
  drawRoll(cv, { bars: LB(), from: line * LB(), layers: [{ kind: 'same', notes: ai }, { kind: 'mine', notes: mine }], focus: U.bar, play });
}
$('#barTabs').addEventListener('click', e => { const b = e.target.closest('[data-bar]'); if (!b) return; U.bar = +b.dataset.bar; U.pick = null; r7(); });
$('.choose').addEventListener('click', e => {
  const v = chosen(); const d = U.bar; if (!v || d == null) return;
  const pl = e.target.closest('[data-pl]'), pk = e.target.closest('[data-pick]');
  if (pl) {
    const line = Math.max(0, Math.floor(d / LB())), a = C.lineStart(line), b = (line + 1) * C.LINE;
    const voc = pl.dataset.pl === 'mine' ? S.base : alignedVocal(v);
    playWith(pl, verTracks({ parts: alignedParts(v) }, voc), { from: a, to: b });
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
  const src = U.pick === 'ai' ? alignedVocal(v) : S.base;
  S.melody = S.melody.filter(n => !(n.s >= a && n.s < b)).map(n => (n.s < a && n.s + n.d > a ? { ...n, d: a - n.s } : n)); // 앞 마디에서 넘어온 음은 마디 앞에서 끊는다
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
function finalParts() {
  const v = chosen();
  const nv = S.arr.nv && S.arr.nv.of === S.arr.chosen ? S.arr.nv : null;
  if (nv) return { parts: nv.parts, chords: nv.chords, locked: false, intro: nv.intro || 0, sections: nv.sections };
  if (!v) return { parts: [], chords: null, locked: false, intro: 0, sections: C.layoutOf(S.melody, S.lyrics, [], 0, totalBars()).sections };
  const norm = ch => (ch && v.key && v.key !== S.key ? ch.map(c => ({ ...c, r: C.pc(C.KEYS[v.key].tonic + c.r - C.KEYS[S.key].tonic) })) : ch); // 수노 곡 조성이 달라도 코드 뿌리는 그대로
  if (v.source === 'suno') { const it = vOff(v) ? sunoIntro(v) : 0; return { parts: alignedParts(v), chords: norm(alignedChords(v)), locked: !!vOff(v), intro: it, sections: C.layoutOf(S.melody, S.lyrics, [], it, totalBars()).sections }; }
  return { parts: v.parts, chords: norm(v.chords), locked: false, intro: v.intro || 0, sections: v.sections };
}
function fullVoices(melody) {
  const { parts, chords, locked, intro, sections } = finalParts();
  const nVoc = S.arr.settings.ens.vocal || 1;
  const mv = SC.melodyVoice(melody, S.lyrics, chords, `노래${nVoc > 1 ? ` (${nVoc}명)` : ''}`, 'V1');
  const vdyn = []; let last = null; (sections || []).forEach(x => { if (/^Intro/.test(x.name)) return; const m = /^Chorus/.test(x.name) ? 'mf' : 'mp'; if (m !== last) { vdyn.push({ s: x.s, m }); last = m; } });
  const voices = [{ ...mv, sub: 'Voc.', notes: melody, editable: true, inst: 'melody', lyricsTarget: true, dyn: parts.length ? vdyn : [] }];
  const chSym = chords ? chords.map(c => ({ s: c.s, name: c.name })) : null;
  parts.forEach((p, i) => voices.push(partVoice(p, i, !locked, null, chSym)));
  return { voices, parts, chords, intro: intro || 0, sections: parts.length ? sections : null };
}
// 악보 머리: 제목·부제·지은이·빠르기 말·편성 줄
const STYLE = { pop: 'Pop', ballad: 'Ballad', rock: 'Rock', acoustic: 'Acoustic', dance: 'Dance', hiphop: 'Hip-hop' };
const isOrch = () => { const v = chosen(); const g = (v && v.settings && v.settings.genre) || S.arr.settings.genre; return g === 'orch'; };
function scoreHeader(fv) {
  const t = S.tempo, pace = t < 76 ? 'Slow' : t < 112 ? 'Medium' : 'Up-tempo';
  const orch = isOrch(), word = t < 60 ? 'Largo' : t < 72 ? 'Adagio' : t < 88 ? 'Andante' : t < 110 ? 'Moderato' : t < 126 ? 'Allegretto' : 'Allegro';
  const v = chosen(), names = fv.voices.map(x => x.name).filter(Boolean);
  const credit = [S.group && `${S.group} 작사·작곡`, S.roles.lyric && `작사 ${S.roles.lyric}`, S.roles.compose && `작곡 ${S.roles.compose}`, v && (v.source === 'suno' ? 'AI 편곡 협업' : `편곡 ${S.roles.arrange || 'LIVE SCORE'}`)].filter(Boolean).join(' · ');
  const secs = (fv.sections || []).map((x, i, a) => `${x.name} ${((a[i + 1] ? a[i + 1].bar : totalBars()) - x.bar)}마디`).join(' – ');
  return { subtitle: fv.parts.length ? (orch ? '관현악 편곡' : fv.parts.length >= 4 ? '밴드 편곡' : '합주 편곡') + ' · 중학교 음악 수업' : '', credit, style: orch ? word : `${pace} ${STYLE[S.arr.settings.genre] || 'Pop'}`, info: names.join(' · ') + (secs ? ' | ' + secs : '') };
}
const ed8 = createEditor($('#ed8'), {
  model: () => { const fv = fullVoices(S.melody); return { title: S.title || '우리 노래', sub: '', header: scoreHeader(fv), tempo: S.tempo, key: S.key, bars: totalBars(), perLine: LB() === 3 ? 3 : 4, showTitle: true, voices: fv.voices, intro: fv.intro, sections: fv.sections, start: scoreStart(fv) }; },
  onChange: () => { save(); $('#scoreInfo').textContent = info8(); },
  // 타이프 인 스코어: 내 선율에 글자를 바로 — 2단계 노랫말 줄과 5단계 글자 붙임이 함께 바뀐다
  lyric: { get: (v, n) => { const m = C.lyricFlow(S.melody, S.lyrics).map.get(n.id); return !m ? '' : m.kind === 'ext' ? '_' : m.text || ''; }, set: (v, n, t) => C.setNoteLyric(S.melody, S.lyrics, n.id, t), hyphen: false },
  state: { get: () => S.lyrics, set: x => { S.lyrics = x; } },
  onPlay: (at, btn, sp = 1) => { const { parts } = finalParts(); playWith(btn, verTracks({ parts }, S.melody), { from: at, tempo: S.tempo * sp }); },
  toast, staffwidth: 1000,
});
const info8 = () => `${totalBars()}마디 · 가사 · 코드 · 파트 ${fullVoices(S.melody).voices.length} · 음표를 눌러 바로 고쳐요`;
function r8() {
  fitBars();
  ed8.render(); keyCtl($('#etKey8'), S.key);
  $('#scoreInfo').textContent = info8(); $('#h8score').textContent = isOrch() ? '관현악 총보' : chosen() ? '밴드 총보' : '노래 악보';
  const v = chosen();
  $$('.vlab').forEach(x => { x.textContent = vlab(v) === 'AI' ? 'AI' : '편곡'; });
  $('#playFirst').disabled = !v; stat('#stat8'); reflectUI();
}
const scoreStart = fv => (fv.intro ? -fv.intro * C.BAR : -(S.pickup || 0));
function exportParts() {
  const fv = fullVoices(S.melody), { parts, chords } = fv;
  const flow = C.lyricFlow(S.melody, S.lyrics);
  const list = [{ name: fv.voices[0].name, sub: 'Voc.', clef: 'treble', notes: S.melody, lyrics: flow, chords, program: 53, dyn: fv.voices[0].dyn }, ...parts.map(p => ({ name: p.name, sub: p.sub, clef: p.clef, notes: p.notes, drum: isDrum(p), disp: p.disp, trans: p.trans, slash: p.slash, chords: p.slash ? chords : undefined, group: p.group, band: true, dyn: p.dyn, tech: p.tech, program: p.gm ?? p.program ?? (C.INSTS[p.inst] || {}).gm }))];
  list.fv = fv; return list;
}
// MIDI·MP3는 악보 첫 자리(전주·못갖춘마디)를 0으로 옮겨 만든다
function fromZero(tracks, st) { return st ? tracks.map(t => ({ ...t, notes: t.notes.map(n => ({ ...n, s: n.s - st })) })) : tracks; }
$('#exXml').onclick = () => {
  if (!S.melody.length) return toast('아직 선율이 없어요');
  const parts = exportParts(), fv = parts.fv;
  const xml = SC.buildMusicXML({ title: S.title, sub: S.group, tempo: S.tempo, key: S.key, bars: totalBars(), parts, intro: fv.intro, sections: fv.sections, header: scoreHeader(fv) });
  download(new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' }), fileBase() + '.musicxml');
  toast('악보 파일을 받았어요 — 뮤즈스코어에서 열어요');
};
$('#exMid').onclick = () => {
  if (!S.melody.length) return toast('아직 선율이 없어요');
  const ps = exportParts(), st = scoreStart(ps.fv);
  const tr = fromZero(ps.map(p => ({ name: p.name || p.sub || '키보드 왼손', program: p.program, channel: p.drum ? 9 : undefined, notes: p.notes })), st);
  download(MIDI.writeMidi(tr, S.tempo, [C.METER.n, C.METER.d]), fileBase() + '.mid');
};
$('#exPdf').onclick = () => { go(8); setTimeout(() => window.print(), 300); };
async function mp3(btn, tracks, name) {
  if (!S.melody.length) return toast('아직 선율이 없어요');
  const b = btn.querySelector('b'), t = b.textContent; btn.disabled = true; b.textContent = 'MP3 만드는 중…';
  const st = Math.min(0, ...tracks.flatMap(t => t.notes.map(n => n.s)));
  try { download(await SND.renderMp3(fromZero(tracks, st), S.tempo, units() - st, p => { b.textContent = `MP3 만드는 중… ${Math.round(p * 100)}%`; }), fileBase() + name); toast('MP3를 받았어요'); }
  catch (x) { console.warn(x); toast('MP3를 만들지 못했어요'); }
  btn.disabled = false; b.textContent = t;
}
$('#exWav').onclick = e => mp3(e.currentTarget, [{ inst: 'voice', notes: S.melody, vol: .9 }], '_선율.mp3');
$('#exMp3All').onclick = e => mp3(e.currentTarget, verTracks({ parts: finalParts().parts }, S.melody), '_노래와반주.mp3');
$('#exMr').onclick = e => mp3(e.currentTarget, verTracks({ parts: finalParts().parts }, null), '_반주MR.mp3');
// 화면 악보(abcjs) → 따로 떼어 쓸 수 있는 SVG 글
function scoreSvg() {
  const svg = $('#ed8 .ed-score svg'); if (!svg) return '';
  const c = svg.cloneNode(true);
  c.removeAttribute('style'); c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const vb = (c.getAttribute('viewBox') || '').split(/\s+/).map(Number);
  if (vb.length === 4) { c.setAttribute('width', Math.round(vb[2])); c.setAttribute('height', Math.round(vb[3])); }
  c.querySelectorAll('.ed-on,.ed-play').forEach(x => x.classList.remove('ed-on', 'ed-play'));
  c.querySelectorAll('.ed-cursor').forEach(x => x.remove());
  return c.outerHTML;
}
$('#exSvg').onclick = () => {
  if (!S.melody.length) return toast('아직 선율이 없어요'); const svg = scoreSvg(); if (!svg) return toast('아직 악보가 없어요');
  download(new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + svg], { type: 'image/svg+xml' }), fileBase() + '_악보.svg');
  toast('악보 그림(SVG)을 받았어요');
};
// ── 노래방·발표 모드 ──
$('#karaBtn').onclick = () => {
  if (!S.melody.length) return toast('아직 선율이 없어요');
  stopPlay();
  PLUS.openKaraoke({
    title: S.title || '우리 노래', sub: [S.group, C.KEYS[S.key].name, C.meterLabel(S.meter || '4/4'), tempoLabel(S.tempo)].filter(Boolean).join(' · '), tempo: S.tempo, bars: totalBars(),
    lines: PLUS.karaLines(C, S.melody, S.lyrics), SND, lineOf: C.lineOf, photo: S.photo, bar: C.BAR, beats: C.beatStarts(),
    tracks: withVoice => verTracks({ parts: finalParts().parts }, withVoice ? S.melody : null).filter(t => withVoice || t.inst !== 'voice'),
  });
};
// ── 자기평가 · 과정 보고서 ──
function reflectUI() {
  const r = S.reflect || (S.reflect = { items: {}, good: '', next: '' });
  $('#rubric').innerHTML = PLUS.RUBRIC.map((t, i) => `<li><p>${esc(t)}</p><div class="seg2 sm" data-ri="${i}">${PLUS.LEVELS.map((l, k) => `<button type="button" data-lv="${k}" class="${r.items[i] === k ? 'on' : ''}">${l}</button>`).join('')}</div></li>`).join('');
  $('#refGood').value = r.good || ''; $('#refNext').value = r.next || '';
}
$('#rubric').addEventListener('click', e => {
  const b = e.target.closest('[data-lv]'); if (!b) return;
  const i = +b.closest('[data-ri]').dataset.ri; S.reflect.items[i] = +b.dataset.lv; save(); reflectUI();
});
$('#refGood').oninput = e => { S.reflect.good = e.target.value; save(); };
$('#refNext').oninput = e => { S.reflect.next = e.target.value; save(); };
$('#reportBtn').onclick = () => {
  const v = chosen(), svgHtml = scoreSvg();
  const ok = PLUS.openReport({
    title: S.title || '우리 노래', group: S.group, photo: S.photo, roles: S.roles, roleNames: ROLE, keyName: C.KEYS[S.key].name, tempo: S.tempo, tempoText: tempoLabel(S.tempo), meter: C.meterLabel(S.meter || '4/4'), bars: totalBars(),
    date: new Date().toLocaleDateString('ko-KR'), lyrics: S.lyrics, scene: S.arr.scene, why: S.arr.why, verName: v ? `${v.id} · ${v.name}` : '', prog: v ? progression(v) : '',
    syl: S.lyrics.reduce((a, l) => a + C.syllables(l.text).length, 0), notes: S.melody.length, counts: counts(), vlab: vlab(v),
    log: S.log.map(l => ({ ...l, who: l.who === 'all' ? '모둠 전체' : roleName(l.who) })), reflect: S.reflect || { items: {} }, svg: svgHtml,
  });
  if (!ok) toast('새 창이 막혔어요 — 주소창 오른쪽에서 팝업을 허용해 주세요');
};
$('#playFirst').onclick = e => { const v = chosen(); if (v) playWith(e.currentTarget, verTracks({ parts: alignedParts(v) }, alignedVocal(v))); };
$('#playFinal').onclick = e => {
  playWith(e.currentTarget, verTracks({ parts: finalParts().parts }, S.melody));
  if (SND.isPlaying()) ed8.follow();
};
// 고친 선율(노래 마디 수)에 맞춰 합주를 새로 짠다 — 자동 편곡은 그 설정 그대로, 수노 편곡은 지금 편성·장르로
function makeNv(v) {
  const auto = v.source === 'auto', st = auto ? v.settings : { ...clone(S.arr.settings), intro: Math.min(4, sunoIntro(v) || S.arr.settings.intro || 2) };
  const r = C.arrange(S.melody, S.lyrics, S.key, st, auto ? v.variant : 0, auto && v.userChords ? v.chords : null);
  S.arr.nv = { of: v.id, parts: r.parts, chords: r.chords, intro: r.intro, sections: r.sections, bars: r.bars, mel: melSig() };
  syncNv(); return r;
}
const melSig = () => S.melody.length + ':' + S.melody.reduce((a, n) => (a * 31 + n.s * 7 + n.d * 3 + (n.p || 0)) % 1000003, 7) + ':' + S.lyrics.length + ':' + C.METER.key + C.METER.lineBars;
// 노래와 합주의 마디 수가 어긋나면(선율·가사를 고쳐 노래가 늘거나 줄면) 자동 편곡은 노래에 맞춰 다시 짠다
function fitBars() {
  const v = chosen(); if (!v || v.source !== 'auto') return false;
  const nv = S.arr.nv && S.arr.nv.of === v.id ? S.arr.nv : null, want = totalBars();
  const have = nv ? (nv.bars || want) : v.bars;
  if (have === want) return false;
  makeNv(v); save(); toast(`노래 ${want}마디에 맞춰 합주도 ${want}마디로 다시 맞췄어요`); return true;
}
$('#newVer').onclick = () => {
  let v = chosen(); const box = $('#newVerBox'); box.hidden = false;
  if (!v && S.arr.versions.length) { S.arr.chosen = S.arr.versions[0].id; v = chosen(); if (!S.base) S.base = clone(S.melody); toast(`고른 편곡이 없어 ${v.id} 편곡으로 만들어요`); }
  if (!v) {
    if (!S.melody.length) { box.innerHTML = '<p>먼저 3단계에서 선율을 만들어 주세요.</p>'; return; }
    $('#genArr').onclick(); v = S.arr.versions[0]; if (!v) { box.innerHTML = '<p>6단계 편성에서 악기를 하나 이상 골라 주세요.</p>'; return; }
    S.arr.chosen = v.id; S.base = clone(S.melody);
  }
  const r = makeNv(v); save(); r8();
  box.innerHTML = `<p><b>고친 선율(노래 ${totalBars()}마디)에 맞춰 합주 ${r.bars}마디를 새로 만들었어요.</b> 위의 <b>▶ 고친 뒤 새 버전</b>과 <b>▶ 처음 버전</b>을 차례로 들어 보세요. 악보에도 새 합주가 들어갔어요.</p>` +
    (v.source === 'auto' ? '' : `<details><summary>수노로 새 음원까지 만들려면</summary><ol class="howto"><li><b>노래 선율 MP3</b>로 고친 선율을 받아요.</li><li>수노 <b>Create → Upload Audio</b>에 올리고 <b>Cover</b>로 같은 장르·분위기의 새 버전을 만들어요.</li><li>새로 받은 음원을 여기에 올려 처음 버전과 비교해 들어요.</li></ol><label class="ctl file"><span>새 버전 음원</span><input type="file" accept="audio/*" id="nvAudio"></label><div id="nvPlayer"></div></details>`);
  const au = $('#nvAudio'); if (au) au.onchange = ev => { const f = ev.target.files[0]; if (!f) return; $('#nvPlayer').innerHTML = `<audio controls src="${URL.createObjectURL(f)}"></audio>`; };
  toast(`새 버전 합주 ${r.bars}마디를 만들었어요`);
};

// ── 태블릿으로 보기(QR) ──
async function packShare() {
  const v = chosen();
  const o = { u: S.pickup || 0, mt: S.meter && S.meter !== '4/4' ? S.meter : undefined, lb: S.lineBars || undefined, t: S.title, g: S.group, k: S.key, b: S.tempo, l: S.lyrics.map(l => [l.text, l.chorus ? 1 : 0]), m: S.melody.map(n => [n.p, n.s, n.d, n.lx === 'n' ? 0 : n.lx]) };
  if (v && v.source === 'auto') { o.a = { s: v.settings, v: v.variant }; if (v.userChords) o.a.c = v.chords.map(c => [c.s, c.d, c.r, c.q]); }
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
    const dense = q.getModuleCount() > 57;
    $('#qrBox').classList.toggle('big', dense);
    $('#qrNote').textContent = dense ? '곡이 길어 QR이 촘촘해요. 태블릿을 화면 가까이 대고 찍거나, 메뉴의 프로젝트 파일로 옮겨 주세요.' : '';
  } catch (x) { $('#qrNote').textContent = ''; $('#qrBox').innerHTML = '<p class="w">곡이 길어 QR 하나에 다 담기지 않아요. 메뉴의 <b>프로젝트 파일로 저장</b>으로 옮겨 주세요.</p>'; }
  $('#copyLink').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('주소를 복사했어요'); } catch (x) { toast('복사하지 못했어요'); } };
  d.showModal();
}
$('#shareBtn').onclick = share;
async function viewer(hash) {
  let o;
  try { o = await unpackShare(hash); } catch (x) { toast('악보 주소를 읽지 못했어요'); return false; }
  C.setMeter(o.mt || '4/4', o.lb || 0); C.METER.pickup = o.u || 0;
  const lyrics = o.l.map(([text, ch]) => ({ text, chorus: !!ch }));
  const melody = o.m.map(([p, s, d, lx]) => ({ id: C.uid(), p, s, d, lx: lx || 'n' }));
  const bars = Math.max(2, lyrics.length * C.METER.lineBars, Math.ceil(Math.max(0, ...melody.map(n => n.s + n.d)) / C.BAR));
  let parts = [], chords = null, ly = { intro: 0, sections: null };
  if (o.a) { const fx = o.a.c ? o.a.c.map(([s, d, r, q]) => ({ s, d, r, q })) : null; const r = C.arrange(melody, lyrics, o.k, o.a.s, o.a.v, fx); parts = r.parts; chords = r.chords; ly = r; }
  else if (o.c) chords = o.c.map(([s, d, r, q]) => ({ s, d, r, q, name: C.chordName({ r, q }, o.k) }));
  document.body.classList.add('viewer');
  const sec = document.createElement('section'); sec.className = 'step view'; sec.id = 'viewer';
  sec.innerHTML = `<div class="step-head"><p class="kicker">태블릿으로 보기 · 받은 악보</p><h1>${esc(o.t || '우리 노래')}</h1><p class="one">${esc(o.g || '')} · ${C.meterLabel(o.mt || '4/4')} · ${tempoLabel(o.b)} · ${C.KEYS[o.k].name}</p></div>
    <div class="card"><div class="row"><button class="btn" type="button" id="vPlay">▶ 반주와 함께 듣기</button><button class="btn ghost" type="button" id="vSing">▶ 노래만 듣기</button><button class="btn ghost" type="button" id="vTake">이 기기에서 이어서 고치기</button></div>
    <ol class="vlyr">${lyrics.map(l => `<li class="${l.chorus ? 'chorus' : ''}">${esc(l.text)}</li>`).join('')}</ol>
    <div class="score full" id="vScore"></div></div>`;
  $('#main').prepend(sec);
  $$('.step:not(#viewer)').forEach(s => { s.hidden = true; });
  const voices = [SC.melodyVoice(melody, lyrics, chords)];
  parts.forEach((p, i) => voices.push(partVoice(p, i, false)));
  SC.renderAbc($('#vScore'), SC.buildAbc({ title: '', tempo: o.b, key: o.k, bars, perLine: C.METER.lineBars === 3 ? 3 : 2, voices, intro: ly.intro || 0, sections: ly.sections }), { staffwidth: 700 });
  const tracks = [{ inst: 'voice', notes: melody, vol: .85 }, ...parts.map(p => ({ inst: SND.soundOf(p.inst), notes: p.notes, vol: p.inst === 'drums' ? .7 : .45 }))];
  $('#vPlay').onclick = e => { S.tempo = o.b; playWith(e.currentTarget, tracks); };
  $('#vSing').onclick = e => { S.tempo = o.b; playWith(e.currentTarget, [tracks[0]]); };
  $('#vTake').onclick = () => ask('받은 악보를 이 기기의 작업 곡으로 가져올까요? 이 기기에 있던 곡은 작업 기록에 남겨 둡니다.', () => {
    autoSnap('받은 악보 가져오기 전'); S = blank(); Object.assign(S, { title: o.t, group: o.g, key: o.k, tempo: o.b, pickup: o.u || 0, lyrics, melody, made: true });
    if (o.a) S.arr.settings = { ...S.arr.settings, ...o.a.s };
    save(); history.replaceState(null, '', location.pathname); location.reload();
  }, '가져오기');
  return true;
}

// ── 카메라: 모둠 사진 · 에어 건반 · 그림 선율 · 손 지휘 빠르기 · 뮤직비디오 ──
const CAMD = { mode: null, cam: null, job: null, raf: null, ct: null, img: null, mv: null, bpm: null, tick: null };
const CAM_TXT = {
  photo: ['📸 모둠 사진', '모둠원이 화면에 모두 들어오게 서서 찍어요.'],
  air: ['🖐 에어 건반', '위쪽 칸에 손을 넣으면 그 음이 울려요. ● 녹음을 누르면 예비박 뒤 선율이 기록돼요. 밝은 곳에서, 뒤 배경은 움직이지 않게.'],
  draw: ['✏️ 그림 선율', '흰 종이에 굵은 펜으로 왼쪽에서 오른쪽으로 선율선을 하나 그려 비추거나, 사진을 올려요. 높이 올라간 곳이 높은 음이 됩니다.'],
  tempo: ['👋 손 지휘 빠르기', '카메라 앞에서 지휘하듯 손을 크게 내렸다 올려요. 내리는 순간이 한 박 — 네 번쯤 하면 빠르기가 나와요.'],
  mv: ['🎬 우리 노래 뮤직비디오', '카메라 화면 위에 가사 자막이 흐르고, 반주와 우리 노래가 함께 녹화돼요. 이어폰을 끼면 반주 소리가 노래 녹음에 섞이지 않아요.'],
};
function camCtl(mode) {
  if (mode === 'photo') return `<button class="btn" type="button" data-c="shot">📸 찍기</button><span class="state" id="camState"></span>`;
  if (mode === 'air') return `<button class="btn rec-btn" type="button" data-c="rec">● 녹음</button><span class="state" id="camState">${esc($('#recState').textContent)}</span>`;
  if (mode === 'draw') return `<button class="btn" type="button" data-c="grab">📷 이 장면으로 선 찾기</button><label class="btn ghost" tabindex="0">🖼 사진 올리기<input type="file" accept="image/*" data-c="file"></label><button class="btn ghost" type="button" data-c="live" hidden>↺ 다시 비추기</button><button class="btn" type="button" data-c="apply" disabled>♪ 선율로 만들기</button><span class="state" id="camState"></span>`;
  if (mode === 'tempo') return `<span class="big" id="camBpm">♩= —</span><button class="btn" type="button" data-c="setTempo" disabled>이 빠르기로 정하기</button><button class="btn ghost" type="button" data-c="reset">다시 재기</button><span class="state" id="camState">지금 빠르기 ♩=${S.tempo}</span>`;
  if (mode === 'mv') return `<label class="chk"><input type="checkbox" id="mvMic" checked>마이크로 우리 노래도 함께</label><label class="chk"><input type="checkbox" id="mvGuide">안내 선율 소리</label><button class="btn rec-btn" type="button" data-c="mv">● 녹화 시작</button><span class="state" id="camState"></span>`;
  return '';
}
async function camOpen(mode) {
  if (mode === 'mv' && !S.melody.length) return toast('아직 선율이 없어요');
  stopPlay();
  const d = $('#camDlg');
  CAMD.mode = mode; CAMD.ct = null; CAMD.img = null; CAMD.bpm = null;
  $('#camT').textContent = CAM_TXT[mode][0]; $('#camSub').textContent = CAM_TXT[mode][1];
  $('#camCtl').innerHTML = camCtl(mode);
  if (!d.open) d.showModal();
  const cv = $('#camView'), g = cv.getContext('2d');
  g.fillStyle = '#111'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#bbb'; g.font = '16px Pretendard,sans-serif'; g.textAlign = 'center'; g.fillText('카메라를 여는 중…', cv.width / 2, cv.height / 2);
  try { CAMD.cam = await CAM.openCam(); }
  catch (x) { g.fillStyle = '#111'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#eee'; g.fillText(CAM.camErr(x), cv.width / 2, cv.height / 2); if (mode === 'draw') $('#camState').textContent = '카메라 없이 사진 올리기로 할 수 있어요'; return; }
  if (CAMD.mode !== mode || !d.open) { CAMD.cam.stop(); CAMD.cam = null; return; }
  if (mode === 'air') {
    const t = C.KEYS[S.key].tonic, base = 60 + t - (t > 6 ? 12 : 0);
    const notes = [0, 2, 4, 5, 7, 9, 11, 12].map(x => ({ p: base + x, label: C.solName(base + x, S.key) }));
    CAMD.job = CAM.airKeys(CAMD.cam, cv, { notes, onOn: (p, time) => MIDI.injectMidi({ on: true, p, v: 92, time }), onOff: (p, time) => MIDI.injectMidi({ on: false, p, v: 0, time }) });
    CAMD.tick = setInterval(() => { const st = $('#camState'); if (st) st.textContent = $('#recState').textContent; const rb = $('#camCtl [data-c=rec]'); if (rb) { rb.textContent = U.rec ? '■ 멈춤' : '● 녹음'; rb.classList.toggle('playing', !!U.rec); } }, 200);
  } else if (mode === 'tempo') {
    CAMD.job = CAM.conductTempo(CAMD.cam, cv, { onBeat: (bpm, n) => { if (bpm) { CAMD.bpm = Math.max(40, Math.min(200, bpm)); $('#camBpm').textContent = '♩=' + CAMD.bpm; $('#camCtl [data-c=setTempo]').disabled = false; } else $('#camBpm').textContent = '박 ' + n; SND.click(SND.audio().currentTime + .01, n % C.METER.beats.length === 1); } });
  } else camLive();
}
function camLive() { // 미리 보기(그림 선율은 종이 그대로, 나머지는 거울처럼)
  const cv = $('#camView'), g = cv.getContext('2d'), mirror = CAMD.mode !== 'draw';
  cancelAnimationFrame(CAMD.raf);
  const loop = () => {
    if (!CAMD.cam || CAMD.img) return;
    g.save(); if (mirror) { g.translate(cv.width, 0); g.scale(-1, 1); } g.drawImage(CAMD.cam.video, 0, 0, cv.width, cv.height); g.restore();
    if (CAMD.mode === 'mv' && CAMD.mvDraw) CAMD.mvDraw(g, cv.width, cv.height);
    CAMD.raf = requestAnimationFrame(loop);
  };
  loop();
}
function camStop() {
  cancelAnimationFrame(CAMD.raf); clearInterval(CAMD.tick);
  if (CAMD.job) { CAMD.job.stop(); CAMD.job = null; }
  if (CAMD.mv) { CAMD.mv.stop(); }
  if (CAMD.cam) { CAMD.cam.stop(); CAMD.cam = null; }
  if (U.rec && CAMD.mode === 'air') stopRec();
  CAMD.mode = null; CAMD.mvDraw = null;
}
$('#camX').onclick = () => $('#camDlg').close();
$('#camDlg').addEventListener('close', camStop);
$('#camCard').addEventListener('click', e => { const b = e.target.closest('[data-cam]'); if (b) camOpen(b.dataset.cam); });
$('#photoBtn').onclick = () => camOpen('photo');
$('#mvBtn').onclick = () => camOpen('mv');
$('#photoDel').onclick = () => { S.photo = null; save(); photoUI(); };
function photoUI() { const el = $('#groupPhoto'); el.classList.toggle('has', !!S.photo); el.style.backgroundImage = S.photo ? `url(${S.photo})` : ''; $('#photoDel').hidden = !S.photo; }
// 그림 선율: 찾은 선과 뽑을 음을 그림 위에 보여 준다
function drawContour() {
  const cv = $('#camView'), g = cv.getContext('2d'), W = cv.width, H = cv.height, img = CAMD.img;
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  const k = Math.min(W / (img.width || img.videoWidth), H / (img.height || img.videoHeight)), iw = (img.width || img.videoWidth) * k, ih = (img.height || img.videoHeight) * k, ox = (W - iw) / 2, oy = (H - ih) / 2;
  g.globalAlpha = .55; g.drawImage(img, ox, oy, iw, ih); g.globalAlpha = 1;
  const ct = CAMD.ct; if (!ct) return;
  g.strokeStyle = '#C6613F'; g.lineWidth = 4; g.lineJoin = 'round'; g.beginPath(); let pen = false;
  ct.ys.forEach((y, x) => { if (y == null) { pen = false; return; } const X = ox + x / ct.W * iw, Y = oy + (1 - y) * ih; if (pen) g.lineTo(X, Y); else g.moveTo(X, Y); pen = true; }); g.stroke();
  const ns = camMelody(); const L = S.lyrics.length;
  ns.forEach(n => { const li = C.lineOf(n.s), f = (li + Math.min(.96, (n.s - C.lineStart(li)) / C.LINE)) / L; const X = ox + (ct.x0 + (ct.x1 - ct.x0) * f) * iw; g.fillStyle = '#1F4D3A'; g.beginPath(); g.arc(X, oy + 14 + (76 - n.p) / 18 * (ih - 28), 6, 0, 7); g.fill(); });
  $('#camState').textContent = `음 ${ns.length}개 · ${L}줄 · 줄마다 가사 글자 수만큼`;
}
function camMelody() {
  return CAM.contourMelody(CAMD.ct, { lines: S.lyrics, syll: S.lyrics.map(l => C.syllables(l.text).length), key: S.key, tonic: C.KEYS[S.key].tonic, scale: C.MAJOR, lo: 60, hi: 76, lineStart: C.lineStart, BAR: C.BAR });
}
function camUseImage(img) {
  CAMD.img = img; cancelAnimationFrame(CAMD.raf);
  CAMD.ct = CAM.contourFrom(img);
  $('#camCtl [data-c=live]').hidden = !CAMD.cam; $('#camCtl [data-c=apply]').disabled = !CAMD.ct;
  drawContour();
  if (!CAMD.ct) $('#camState').textContent = '선을 찾지 못했어요 — 흰 종이에 굵고 진하게, 가로로 길게 그려요';
}
$('#camCtl').addEventListener('change', e => {
  const f = e.target.closest('[data-c=file]'); if (!f || !f.files[0]) return;
  const img = new Image(); img.onload = () => { camUseImage(img); URL.revokeObjectURL(img.src); }; img.src = URL.createObjectURL(f.files[0]); f.value = '';
});
$('#camCtl').addEventListener('click', async e => {
  const b = e.target.closest('[data-c]'); if (!b) return;
  const c = b.dataset.c;
  if (c === 'shot' && CAMD.cam) { S.photo = CAM.snapshot(CAMD.cam); save(); photoUI(); $('#camDlg').close(); toast('모둠 사진을 넣었어요'); }
  if (c === 'rec') $('#recBtn').click();
  if (c === 'grab' && CAMD.cam) { const cv = document.createElement('canvas'); cv.width = CAMD.cam.video.videoWidth; cv.height = CAMD.cam.video.videoHeight; cv.getContext('2d').drawImage(CAMD.cam.video, 0, 0); camUseImage(cv); }
  if (c === 'live') { CAMD.img = null; CAMD.ct = null; b.hidden = true; $('#camCtl [data-c=apply]').disabled = true; $('#camState').textContent = ''; camLive(); }
  if (c === 'apply' && CAMD.ct) {
    const ns = camMelody().map(n => ({ id: C.uid(), p: n.p, s: n.s, d: n.d, lx: 'n' }));
    const doit = () => { pushHist(); S.melody = ns; S.take = null; save(); $('#camDlg').close(); refresh(); toast(`그림 선율로 음 ${ns.length}개를 만들었어요 — 4단계에서 다듬어요`); };
    if (S.melody.length) ask('지금 선율이 그림 선율로 바뀌어요(되돌리기 가능). 바꿀까요?', doit, '바꾸기'); else doit();
  }
  if (c === 'setTempo' && CAMD.bpm) { S.tempo = CAMD.bpm; save(); r3(); $('#camState').textContent = `빠르기를 ♩=${S.tempo}로 정했어요`; toast(`빠르기 ♩=${S.tempo}`); }
  if (c === 'reset' && CAMD.job) { CAMD.job.reset(); CAMD.bpm = null; $('#camBpm').textContent = '♩= —'; b.previousElementSibling.disabled = true; }
  if (c === 'mv') { if (CAMD.mv) { CAMD.mv.stop(); return; } mvRecord(b); }
});
// 뮤직비디오: 카메라 + 가사 자막 + 반주(+노래) 녹화
async function mvRecord(btn) {
  if (!CAMD.cam) return toast('카메라가 켜지지 않았어요');
  const LEAD = C.BAR, guide = $('#mvGuide').checked, mic = $('#mvMic').checked;
  const base = verTracks({ parts: finalParts().parts }, guide ? S.melody : null);
  if (!base.length) return toast('들려줄 소리가 없어요 — 6단계에서 편곡을 고르거나 안내 선율을 켜요');
  const st = Math.min(0, ...base.flatMap(t => t.notes.map(n => n.s)));
  const tr = base.map(t => ({ ...t, notes: t.notes.map(n => ({ ...n, s: n.s + LEAD - st })) }));
  tr.push({ inst: 'click', notes: [0, 4, 8, 12].map(s => ({ p: s ? 84 : 96, s, d: 1 })), vol: .9 });
  const total = LEAD - st + units(), u = 60 / S.tempo / 4;
  const lines = PLUS.karaLines(C, S.melody, S.lyrics), ttl = S.title || '우리 노래', sub = [S.group, C.KEYS[S.key].name, C.meterLabel(S.meter || '4/4'), tempoLabel(S.tempo)].filter(Boolean).join(' · ');
  const draw = (g, W, H) => {
    const raw = SND.position(); const pos = raw == null ? -Infinity : raw - LEAD + st;
    const gr = g.createLinearGradient(0, H * .55, 0, H); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.78)'); g.fillStyle = gr; g.fillRect(0, H * .55, W, H * .45);
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 0, W, H * .11);
    g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.font = `800 ${H * .045}px Pretendard,sans-serif`; g.fillText(ttl, W * .03, H * .045);
    g.fillStyle = '#E9D3AE'; g.font = `600 ${H * .026}px Pretendard,sans-serif`; g.fillText(sub, W * .03, H * .088);
    g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,.7)'; g.font = `700 ${H * .022}px Pretendard,sans-serif`; g.fillText('LIVE SCORE · 실시간 악보', W * .97, H * .055);
    if (raw != null && raw < LEAD) { g.textAlign = 'center'; g.fillStyle = '#C9A05A'; g.font = `900 ${H * .2}px Pretendard,sans-serif`; g.fillText(String(4 - Math.floor(raw / 4)), W / 2, H * .45); }
    const li = Math.max(0, Math.min(lines.length - 1, C.lineOf(Math.max(0, pos)))), L = lines[li];
    if (L && pos > -Infinity) {
      g.textAlign = 'left'; const fs = H * .075; g.font = `850 ${fs}px Pretendard,sans-serif`;
      const parts = L.syl.length ? L.syl : [{ t: '♪ 간주 ♪', s: -1e9, e: -1e9 }];
      const wsum = parts.reduce((a, x) => a + g.measureText(x.t).width + fs * .12, 0); let x = (W - wsum) / 2;
      parts.forEach(sy => { g.fillStyle = pos >= sy.s && pos < sy.e ? '#E3B35E' : pos >= sy.e ? '#fff' : 'rgba(255,255,255,.5)'; g.fillText(sy.t, x, H * .84); x += g.measureText(sy.t).width + fs * .12; });
      const N = lines[li + 1]; if (N && N.syl.length) { g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,.55)'; g.font = `700 ${H * .04}px Pretendard,sans-serif`; g.fillText(N.syl.map(y => y.t).join(''), W / 2, H * .93); }
    }
    g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(0, H - 6, W, 6); g.fillStyle = '#C9A05A'; g.fillRect(0, H - 6, W * Math.max(0, Math.min(1, (raw || 0) / total)), 6);
  };
  cancelAnimationFrame(CAMD.raf);
  CAMD.mvDraw = (g, W, H) => draw(g, W, H);
  let mv;
  try { mv = await CAM.recordMV({ cam: CAMD.cam, audioCtx: SND.audio(), tap: SND.master, withMic: mic, durationMs: (total * u + 1.2) * 1000, draw, onTick: (el, src) => { const cv = $('#camView'); cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height); } }); }
  catch (x) { toast(x.message || '녹화를 시작하지 못했어요'); camLive(); return; }
  CAMD.mv = mv; btn.textContent = '■ 멈추고 저장'; btn.classList.add('playing'); $('#camState').textContent = '녹화 중…';
  SND.play(tr, S.tempo, { from: 0, to: total, onend: () => { if (CAMD.mv === mv) mv.stop(); } });
  const blob = await mv.done; CAMD.mv = null; SND.stop();
  btn.textContent = '● 다시 녹화'; btn.classList.remove('playing');
  download(blob, `${fileBase()}_뮤직비디오.${mv.ext}`);
  $('#camState').textContent = `저장했어요 · ${(blob.size / 1048576).toFixed(1)}MB (${mv.ext.toUpperCase()}) — 패들렛·클래스룸에 올리거나 발표 때 틀어요`;
  if (CAMD.cam) camLive();
}

// ── 시작 ──
buildKb();
fillSetup();
MIDI.connectMidi();
window.addEventListener('resize', () => drawStep());
window.addEventListener('beforeprint', () => { if (document.body.classList.contains('ls-printing')) return; if (U.step !== 8) go(8); }); // 악보 인쇄(총보·파트보)는 그 자리에서
(async () => {
  if (location.hash.startsWith('#s=') && await viewer(location.hash.slice(3))) { $('#pager').hidden = true; $('#steps').hidden = true; return; }
  go(U.step);
})();
// 시험용 고리
window.__ls = { S: () => S, U, go, C, SC, MIDI, SND, loadDemo: () => { loadDemo(); refresh(); }, a2: () => A2 };


// ── 음원(MP3)으로 악보 만들기 ── 노래 선율 찾기(Basic Pitch, 이 기기 안에서) → 박·조 → 가사 붙이기 → 새 곡
const A2 = { mix: null, vox: null, midi: null, tag: null, res: null, song: null, src: null };
function a2sOpen() { $('#a2sDlg').showModal(); }
(() => { const sel = $('#a2sMeter'); if (sel) sel.innerHTML = '<option value="auto">자동(박자 찾기)</option>' + Object.entries(C.METER_KINDS).map(([k, nm]) => `<optgroup label="${nm}">${Object.keys(C.METERS).filter(m => C.METERS[m].kind === k).map(m => `<option value="${m}">${C.meterLabel(m)}</option>`).join('')}</optgroup>`).join(''); })();
$('#a2sX').onclick = () => { a2sStop(); $('#a2sDlg').close(); };
const a2sVocal = n => { const s = (MIDI.stemName(n) || n).toLowerCase(); return /vocal|voice|vox|lead|melody|보컬|노래/.test(s) && !/backing|harmony|백보컬|코러스/.test(s); };
async function a2sSet(f, kind) {
  if (!f) return;
  // MIDI(·수노 MIDI 압축 파일)는 어느 칸에 넣어도 '노래 MIDI'로 — 음은 MIDI에서, 박·소리는 MP3에서
  let mid = null;
  try {
    if (/\.zip$/i.test(f.name)) {
      const fs = await MIDI.unzipMidi(f);
      mid = fs.find(x => a2sVocal(x.name)) || (fs.length === 1 ? fs[0] : null);
      if (!mid) return toast(fs.length ? 'zip 안에서 노래(Vocals) MIDI를 찾지 못했어요 — Vocals MIDI 파일만 넣어요' : 'zip 안에 MIDI 파일이 없어요');
    } else if (/\.midi?$/i.test(f.name) || new TextDecoder().decode(new Uint8Array(await f.slice(0, 4).arrayBuffer())) === 'MThd') mid = f;
  } catch (x) { return toast('파일을 열지 못했어요 — ' + (x.message || '')); }
  if (mid) {
    let parsed; try { parsed = MIDI.parseMidi(await mid.arrayBuffer()); } catch (x) { return toast('MIDI를 읽지 못했어요 — ' + (x.message || '')); }
    if (!parsed.tracks.some(t => t.ch !== 9 && t.notes.length)) return toast('MIDI 안에 음이 없어요');
    A2.midi = { file: mid, parsed }; A2.vox = null; A2.res = null; $('#a2sOut').hidden = true;
    $('#a2sName2').textContent = mid.name + ' · MIDI'; $('#a2sDrop2').classList.add('has');
    if (kind === 'mix') toast('MIDI는 노래 칸에 넣었어요 — 완성곡 칸에는 MP3를 넣어요');
    $('#a2sGo').disabled = false;
    $('#a2sState').textContent = '악보 만들기를 눌러요 — 노래 MIDI가 있으면 몇 초면 돼요';
    return;
  }
  A2[kind] = f; A2.res = null; $('#a2sOut').hidden = true;
  if (kind === 'vox') A2.midi = null;
  $(kind === 'mix' ? '#a2sName' : '#a2sName2').textContent = f.name;
  $(kind === 'mix' ? '#a2sDrop' : '#a2sDrop2').classList.add('has');
  if (kind === 'mix') {
    try { A2.tag = A2S.readId3(await f.arrayBuffer()); } catch (x) { A2.tag = {}; }
    if (A2.tag.lyrics && !$('#a2sLyr').value.trim()) { $('#a2sLyr').value = A2.tag.lyrics.trim(); toast('MP3 안에 들어 있던 가사를 읽어 왔어요'); }
  }
  $('#a2sGo').disabled = !A2.mix && !A2.vox && !A2.midi;
  $('#a2sState').textContent = A2.midi ? '악보 만들기를 눌러요 — 노래 MIDI가 있으면 몇 초면 돼요' : '악보 만들기를 눌러요 — 3분짜리 곡이면 노트북에 따라 1~4분 걸려요';
}
$('#a2sFile').onchange = e => { a2sSet(e.target.files[0], 'mix'); e.target.value = ''; };
$('#a2sVox').onchange = e => { a2sSet(e.target.files[0], 'vox'); e.target.value = ''; };
[['#a2sDrop', 'mix'], ['#a2sDrop2', 'vox']].forEach(([sel, kind]) => {
  const el = $(sel);
  ['dragenter', 'dragover'].forEach(t => el.addEventListener(t, e => { e.preventDefault(); el.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => el.addEventListener(t, e => { e.preventDefault(); el.classList.remove('over'); }));
  el.addEventListener('drop', e => { e.stopPropagation(); a2sSet((e.dataTransfer.files || [])[0], kind); });
});
let TFP = null, BPM = null;
function loadTF() {
  if (window.tf) return Promise.resolve(window.tf);
  return TFP || (TFP = new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = 'lib/tf.min.js'; sc.onload = () => ok(window.tf); sc.onerror = () => { TFP = null; no(new Error('음 찾기 도구를 불러오지 못했어요(인터넷 연결 확인)')); }; document.head.appendChild(sc); }));
}
async function bpModel(tf) {
  if (!BPM) { try { await tf.setBackend('webgl'); await tf.ready(); } catch (x) { await tf.setBackend('cpu'); await tf.ready(); } BPM = tf.loadGraphModel('lib/basic-pitch/model.json').catch(x => { BPM = null; throw x; }); }
  return BPM;
}
async function a2sOpenAudio(file) {
  try { return await SND.audio().decodeAudioData((await file.arrayBuffer()).slice(0)); }
  catch (x) { throw new Error(`「${file.name}」을(를) 소리로 열지 못했어요 — MP3·WAV·M4A를 넣어요 (MIDI는 노래 칸에)`); }
}
async function a2sDecode(file) {
  const buf = await a2sOpenAudio(file);
  const len = Math.ceil(buf.duration * A2S.SR), off = new OfflineAudioContext(2, len, A2S.SR);
  const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
  const r = await off.startRendering();
  return { buf, L: r.getChannelData(0), R: r.getChannelData(1) };
}
const a2sMono = (L, R) => { const x = new Float32Array(L.length); for (let i = 0; i < x.length; i++) x[i] = (L[i] + R[i]) / 2; return x; };
$('#a2sGo').onclick = async () => {
  const st = m => { $('#a2sState').textContent = m; }, bar = p => { $('#a2sBar').style.width = Math.round(p * 100) + '%'; };
  $('#a2sGo').disabled = true; $('#a2sOut').hidden = true; a2sStop();
  try {
    if (A2.midi) { await a2sFromMidi(st, bar); return; }
    st('음원을 여는 중…'); bar(.02);
    const mix = A2.mix ? await a2sDecode(A2.mix) : null, vox = A2.vox ? await a2sDecode(A2.vox) : null;
    const base = mix || vox; A2.src = base.buf;
    const mixMono = a2sMono(base.L, base.R);
    let x, vad = null, how;
    if (vox) { x = a2sMono(vox.L, vox.R); vad = A2S.energyActivity(x); how = '노래 스템'; }
    else {
      let d = 0, e = 0; for (let i = 0; i < base.L.length; i += 7) { const a = base.L[i], b = base.R[i]; d += (a - b) ** 2; e += ((a + b) / 2) ** 2; }
      if (d < e * 1e-4) { x = mixMono; how = '완성곡(모노)'; }
      else { st('노래 소리를 앞으로 꺼내는 중…'); x = await A2S.centerExtract(base.L, base.R, { onProg: p => bar(.03 + p * .1) }); vad = A2S.vocalActivity(base.L, base.R, x); how = '완성곡(가운데 소리)'; }
    }
    st('박을 세는 중…'); bar(.15);
    const env = A2S.onsetEnvelope(mixMono);
    st('음 찾기 도구를 준비하는 중… (처음 한 번은 몇 초 걸려요)');
    const tf = await loadTF(), model = await bpModel(tf);
    const an = await A2S.analyze(tf, model, x, p => { bar(.18 + p * .72); st(`음을 찾는 중… ${Math.round(p * 100)}%`); });
    st('선율과 가사를 맞추는 중…');
    const tc = A2S.tempoCandidates(env);
    let bpm = tc.length ? tc[0].bpm : S.tempo;
    const beats = A2S.beatTrack(env, bpm);
    const ibi = beats.slice(1).map((t, i) => t - beats[i]).sort((a, b) => a - b); if (ibi.length > 8) bpm = 60 / ibi[ibi.length >> 1];
    const k = A2S.downbeatPhase(an, beats);
    const rng = A2S.vocalRange(an, vad);
    const path = A2S.melodyTrack(an, { lo: rng[0], hi: rng[1], vad });
    const notes = A2S.trackNotes(an, path, { vad });
    const regions = vad ? A2S.vocalRegions(vad, vox ? { thr: .2, minLen: 1.5 } : {}) : null;
    // 가사 한 줄 = 2마디(8박)가 되게: 한 줄이 12박 넘게 걸리면 ÷2, 5박도 안 되면 ×2
    const bpl = A2S.beatsPerLine(regions, beats, A2S.parseLyrics($('#a2sLyr').value).length), mul = bpl >= 12 ? .5 : bpl && bpl <= 5 ? 2 : 1;
    A2.res = { q: true, notes, regions, beats, autoBpm: bpm, bpm: bpm * mul, mul, autoMul: mul, k, shift: 0, half: false, fixed: false, how, dur: base.buf.duration, tc: tc.slice(0, 4).map(c => Math.round(c.bpm)) };
    a2sBuild(); bar(1); st('다 됐어요 — 아래 악보를 원곡과 함께 들어 보고, 빠르기·첫 박을 맞춰요');
  } catch (x) { console.warn(x); st('분석하지 못했어요 — ' + (x.message || '다른 파일로 해 봐요')); bar(0); }
  finally { $('#a2sGo').disabled = false; }
};
// 노래 MIDI로 만들기: 음높이·박은 MIDI(수노 MIDI는 원곡 박마다 빠르기가 적혀 있어 MP3와 시각이 맞는다), 소리는 MP3
async function a2sFromMidi(st, bar) {
  const { file, parsed: pm } = A2.midi;
  st('노래 MIDI에서 음을 읽는 중…'); bar(.2);
  const trs = MIDI.stemTracks(file.name, pm).filter(t => t.ch !== 9 && t.notes.length);
  const tr = trs.length === 1 ? trs[0] : (trs.find(t => a2sVocal(t.name || '')) || trs.slice().sort((a, b) => b.notes.length - a.notes.length)[0]);
  const lastTick = Math.max(...tr.notes.map(n => n.t1));
  const notes = A2S.midiNotes(tr.notes, pm.sec, pm.div), beats = A2S.midiBeats(pm.sec, pm.div, lastTick);
  if (!notes.length) throw new Error('MIDI에서 노래 음을 찾지 못했어요');
  A2.src = null;
  let env = null;
  if (A2.mix) {
    st('원곡 소리를 여는 중…'); bar(.4);
    try {
      A2.src = await a2sOpenAudio(A2.mix);
      st('원곡의 박을 따로 세는 중… (MIDI 박과 견주려고)'); bar(.6); await new Promise(r => setTimeout(r, 20));
      const len = Math.ceil(A2.src.duration * A2S.SR), off = new OfflineAudioContext(1, len, A2S.SR), sn = off.createBufferSource();
      sn.buffer = A2.src; sn.connect(off.destination); sn.start(); env = A2S.onsetEnvelope((await off.startRendering()).getChannelData(0));
    } catch (x) { toast(x.message + ' — MIDI만으로 만들어요'); }
  }
  const regions = A2S.noteRegions(notes);
  // 가사 한 줄 = 2마디(8박)가 되게: 한 줄이 12박 넘게 걸리면 ÷2, 5박도 안 되면 ×2
  const bpl = A2S.beatsPerLine(regions, beats, A2S.parseLyrics($('#a2sLyr').value).length);
  const mul = bpl >= 12 ? .5 : bpl && bpl <= 5 ? 2 : 1, auto = A2S.medianBpm(beats);
  A2.res = { midi: true, q: true, env, notes, regions, beats, autoBpm: auto, mul, autoMul: mul, bpm: auto * mul, k: 0, shift: 0, half: false, fixed: false, how: '노래 MIDI', dur: A2.src ? A2.src.duration : beats[beats.length - 1], tc: [] };
  a2sBuild(); bar(1); st('다 됐어요 — 아래 악보를 원곡과 함께 들어 보고, 빠르기·첫 박을 맞춰요');
}
// 지금 빠르기 배수(÷2·×2)·반 박에 맞춘 박 시각과, 1마디 첫 박이 되는 박 번호
function a2sGrid() {
  const r = A2.res, mul = r.mul || 1; r.cut = 0;
  let beats, i0;
  if (r.q) {
    // 박 교차 검증: MIDI 박 지도 · MP3 박 추적 · 고른 빠르기 · 음표로 센 박 → 저마다 3번 넘게 다듬어 가장 잘 맞는 박(첫 박·마디는 곡 만들 때 가설로 견준다)
    const key = mul + '|' + A2S.parseLyrics($('#a2sLyr').value).length;
    if (!r.cv || r.cv.key !== key) {
      const off = mul < 1 ? A2S.bestOffset(r.notes, r.beats, Math.round(1 / mul)) : 0;
      const a = A2S.scaleBeats(r.beats, mul, off);
      const cands = [{ name: r.midi ? 'MIDI 박 지도' : 'MP3 박 추적', beats: a }];
      if (r.midi && r.env) cands.push({ name: 'MP3 박 추적', beats: A2S.beatTrack(r.env, A2S.medianBpm(a)) });
      r.cv = { key, ...(A2Q.crossGrids(r.notes, cands, { dur: r.dur, regions: r.regions, nLines: A2S.parseLyrics($('#a2sLyr').value).length, triple: true }) || { beats: a, best: cands[0].name, cands: [] }) };
    }
    const cb = r.half ? A2S.halfShift(r.cv.beats) : r.cv.beats; // 반 박 밀기는 고른 박에서
    // 박자 찾기(v17): 박자 × 세는 박 크기 × 가사 한 줄 마디 수 가설을 견준다(가사 태그의 박자는 힌트로)
    const want = $('#a2sMeter').value || 'auto', lyr = $('#a2sLyr').value, mkey = [key, r.half, want, $('#a2sGrid').value, lyr].join('|');
    if (!r.mt || r.mt.key !== mkey) r.mt = { key: mkey, want, pick: 0, list: A2Q.findMeter({ notes: r.notes, lyrics: lyr, beats: cb, regions: r.regions, mode: $('#a2sGrid').value, meters: want === 'auto' ? null : [want] }) };
    const h = r.mt.list[r.mt.pick] || r.mt.list[0];
    const geo = A2Q.meterGeom(h ? h.meter : '4/4', h ? h.lineBars : 0);
    r.gridBpm = h ? h.bpm * geo.U / 4 : (r.cv.cands && r.cv.cands[0] && r.cv.cands[0].bpm || 0); // 고른 박자의 빠르기(♩, 노래하는 곳의 가운데 값)
    const pb = h ? h.beats : cb;
    if (r.fixed) { const g = A2S.makeGrid({ bpm: r.bpm * 4 / geo.U, offset: pb[0], fixed: true, dur: r.dur }); return { beats: g, bar1: 0, meter: geo.key, lineBars: geo.lineBars }; }
    return { beats: pb, bar1: 0, meter: geo.key, lineBars: geo.lineBars, h };
  } else if (r.midi) {
    const off = mul < 1 ? A2S.bestOffset(r.notes, r.beats, Math.round(1 / mul)) : 0;
    beats = A2S.scaleBeats(r.beats, mul, off); if (r.half) beats = A2S.halfShift(beats);
    const starts = A2S.lyricLineStarts(r.notes, $('#a2sLyr').value, r.regions, true);
    const al = (starts.length >= 2 && A2S.alignLines(beats, starts, r.regions)) || A2S.alignSections(r.notes, beats, r.regions);
    beats = al.beats; i0 = al.k; r.cut = al.cut;
  } else {
    const a0 = r.beats[Math.min(r.beats.length - 1, r.k)];
    beats = A2S.scaleBeats(r.beats, mul, r.k);
    if (r.half) beats = A2S.halfShift(beats);
    i0 = 0; beats.forEach((t, i) => { if (Math.abs(t - a0) < Math.abs(beats[i0] - a0)) i0 = i; });
    if (r.lineAlign) { // (시험용) 가사 줄 첫 음으로 첫 박 맞추기 — 완성곡에서 찾은 음은 흔들려 화음으로 찾은 첫 박이 대개 낫다
      const starts = A2S.lyricLineStarts(r.notes, $('#a2sLyr').value, r.regions);
      const al = starts.length >= 2 && A2S.alignLines(beats, starts, r.regions);
      if (al) { beats = al.beats; i0 = al.k; r.cut = al.cut; } else r.cut = 0;
    }
  }
  if (r.fixed) { // 빠르기를 손으로 적었을 때: 한 가지 빠르기 격자
    const anchor = beats[i0], g = A2S.makeGrid({ bpm: r.bpm, offset: anchor, fixed: true, dur: r.dur });
    let j = 0; g.forEach((t, i) => { if (Math.abs(t - anchor) < Math.abs(g[j] - anchor)) j = i; });
    return { beats: g, bar1: (((j + r.shift) % 4) + 4) % 4 };
  }
  return { beats, bar1: (((i0 + r.shift) % 4) + 4) % 4 };
}
// 교차 검증·붙임새 요약
const jo = (w, a, b) => { const c = w.charCodeAt(w.length - 1); return w + (c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 ? a : b); }; // 받침에 따라 을/를 · 과/와
const KIND = { syllabic: '실러빅(한 글자 한 음)', neumatic: '네우마틱(한 글자 2~4음)', melismatic: '멜리스마틱(한 글자 5음 넘게)' };
function a2sCheck(song) {
  const r = A2.res; if (!r || !r.q || !song) return '';
  let h = '';
  const cv = r.cv;
  if (cv && cv.cands && cv.cands.length && !r.fixed) {
    const b = cv.cands[0], near = cv.cands.slice(1).sort((x, y) => y.agree - x.agree)[0];
    const shown = cv.cands.slice(0, 4).map((c, i) => `${i ? '' : '<b>'}${c.name.replace(/\(♩=\d+\)/, '')} ♩${Math.round(c.bpm || 0)} · ${Math.round(c.err * 1000)}ms${i ? '' : '</b>'}`).join(' / ');
    h += `<br>박 교차 검증: 박 후보 ${cv.cands.length}개를 저마다 3~5번 다듬어(루바토를 따라 · 2박 갈래와 3박 갈래로) 견줌 — ${shown}${cv.cands.length > 4 ? ` 외 ${cv.cands.length - 4}개` : ''} → 박 간격에 견준 어긋남 · 박자 단순함 · 가사 한 줄 길이를 함께 보고 고른 박: <b>${b.name.replace(/\(♩=\d+\)/, '')} ♩${Math.round(b.bpm || 0)}</b>${near ? ` (가장 가까운 다른 후보와 노래하는 박 ${Math.round(near.agree * 100)}% 겹침)` : ''}`;
  }
  const mt = r.mt;
  if (mt && mt.list.length && !r.fixed) {
    const hint = A2Q.meterHints($('#a2sLyr').value), hk = Object.keys(hint);
    const cur = mt.list[mt.pick] || mt.list[0];
    h += `<br>박자 교차 검증: ${mt.want === 'auto' ? '박자 6가지(2/4·3/4·4/4·6/8·9/8·12/8)' : C.meterLabel(mt.want)} × 박 크기 × 가사 한 줄 마디 수 가설을 음표 자리로 먼저 거르고, 앞선 ${mt.list.length}개를 가사 줄·마디까지 맞춰 당김음·자리 복잡도와 함께 견줌${hk.length ? ` · 가사 태그 박자 힌트 ${hk.join('·')}` : ''} → <b>${C.meterLabel(cur.meter)} · 한 줄 ${cur.lineBars}마디 · ${C.tempoText(cur.bpm * A2Q.meterGeom(cur.meter).U / 4, cur.meter)}</b>` +
      ` <span class="a2s-mt">${mt.list.slice(0, 4).map((x, i) => `<button type="button" class="chip${x === cur ? ' on' : ''}" data-mt="${i}" title="점수 ${x.score.toFixed(2)} (낮을수록 잘 맞음)">${C.meterLabel(x.meter)} · ${x.lineBars}마디 · ${C.tempoText(x.bpm * A2Q.meterGeom(x.meter).U / 4, x.meter)}</button>`).join('')}</span>`;
  }
  if (song.hyps && song.hyps.length) h += `<br>마디 교차 검증: 첫 박 ${song.geom ? song.geom.nb : 4} × 못갖춘마디 ${A2Q.meterGeom(song.meter || '4/4').pickups.length} = 가설 ${song.nHyp || 24}개(간주 뒤 구간은 한 줄 안 어긋남까지)를 견줘 가사 줄 첫 음이 줄(${song.lineBars || 2}마디) 첫 박에 가장 잘 맞는 것으로`;
  const c = song.count; if (c && (c.syllabic + c.neumatic + c.melismatic)) h += `<br>가사 붙임새: ${Object.keys(KIND).filter(k => c[k]).map(k => `${KIND[k]} <b>${c[k]}줄</b>`).join(' · ')}`;
  return h;
}
function a2sBuild() {
  const r = A2.res; if (!r) return;
  const mode = $('#a2sGrid').value, g = a2sGrid();
  const song = r.q ? (g.h && !r.shift && g.h.song ? g.h.song : A2Q.buildSongQ({ notes: r.notes, lyrics: $('#a2sLyr').value, beats: g.beats, regions: r.regions, mode, shift: r.shift, meter: g.meter, lineBars: g.lineBars }))
    : A2S.buildSong({ notes: r.notes, lyrics: $('#a2sLyr').value, beats: g.beats, bar1: g.bar1, grid: mode === 'auto' ? 2 : +mode, regions: r.regions, dp: !!r.midi });
  A2.song = song; A2.grid = song && song.grid ? song.grid : g;
  if (song && song.grid) r.cut = song.cut;
  if (!song) { $('#a2sOut').hidden = false; $('#a2sSum').innerHTML = '<em>노래 선율을 찾지 못했어요</em> — 노래(Vocals) 스템을 넣거나 다른 음원으로 해 봐요'; $('#a2sScore').innerHTML = ''; return; }
  const key = detectKey(song.melody), bpm = Math.round(!r.fixed && r.q && r.gridBpm ? r.gridBpm : r.bpm);
  A2.key = key;
  const lyrN = A2S.parseLyrics($('#a2sLyr').value).length, used = song.lines.filter(l => l.text).length;
  const sm = song.meter || '4/4', slb = song.lineBars || 2;
  C.setMeter(sm, slb); const P = C.PICKUPS[song.pickup]; syncMeter(); // 미리보기는 찾은 박자로, 지금 곡의 박자는 그대로
  $('#a2sBpm').value = bpm;
  $('#a2sSum').innerHTML = `<b>${C.tempoText(bpm, sm)}</b> · <b>${C.KEYS[key].name}</b> · <b>${C.meterLabel(sm)}</b> · 노래는 원곡 <b>${Math.round(song.firstBar) + 1}마디</b>부터 · ${song.lines.length * slb}마디 · 음 ${song.melody.length}개${song.pickup ? ` · 못갖춘마디(${P || song.pickup + '칸'})` : ''} · 분석: ${r.how}<br>` +
    (lyrN ? `가사 ${lyrN}줄을 음표에 붙였어요 → 플랫폼 줄(${slb}마디)로 ${used}줄` : '<em>가사가 없어 음표만 만들었어요 — 위 칸에 가사를 붙여 넣고 다시 만들면 글자가 붙어요</em>') +
    (r.tc.length > 1 ? ` · 빠르기 후보 ${r.tc.join(', ')}` : '') + (r.autoMul && r.autoMul !== 1 && r.mul === r.autoMul ? ` · 가사 한 줄 길이에 맞게 ${r.midi ? 'MIDI ' : ''}빠르기를 ${r.autoMul < 1 ? '÷2' : '×2'}로 읽었어요` : '') + (r.cut ? ` · 간주에서 박 ${r.cut}개를 덜어 뒷 구간도 줄 첫 박에 맞췄어요` : '') + (r.midi && !A2.src ? ' · <em>원곡 MP3가 없어 악보 소리만 들을 수 있어요</em>' : '') + a2sCheck(song) + '<br><small>원곡과 함께 들어 보고 박이 어긋나면 빠르기(÷2·×2)와 첫 박을 고쳐요. 틀린 음은 새 곡으로 연 뒤 4·5단계에서 고쳐요.</small>';
  const old = C.METER.pickup; C.setMeter(sm, slb); C.METER.pickup = song.pickup;
  try {
    const mel = song.melody.map(n => ({ ...n, id: C.uid() }));
    SC.renderAbc($('#a2sScore'), SC.buildAbc({ tempo: bpm, key, bars: Math.max(2, song.lines.length * slb), perLine: slb === 3 ? 3 : 4, showTitle: false, pickup: song.pickup, voices: [SC.melodyVoice(mel, song.lines, null)] }));
  } finally { syncMeter(); C.METER.pickup = old; }
  $('#a2sOut').hidden = false;
}
$('#a2sGrid').onchange = () => a2sBuild();
$('#a2sMeter').onchange = () => { if (A2.res) { A2.res.shift = 0; a2sBuild(); } };
$('#a2sSum').addEventListener('click', e => { const b = e.target.closest('[data-mt]'), r = A2.res; if (!b || !r || !r.mt) return; r.mt.pick = +b.dataset.mt; r.shift = 0; a2sBuild(); });
$('#a2sLyr').addEventListener('change', () => { if (A2.res) a2sBuild(); });
$('#a2sBpm').addEventListener('change', e => { const r = A2.res; if (!r) return; const v = +e.target.value; if (v >= 30 && v <= 220) { r.bpm = v; r.fixed = Math.abs(v - (r.q && r.gridBpm ? r.gridBpm : r.autoBpm * (r.mul || 1))) > .6; a2sBuild(); } });
document.querySelector('.a2s-adj').addEventListener('click', e => {
  const b = e.target.closest('[data-a]'), r = A2.res; if (!b || !r) return;
  const a = b.dataset.a;
  if (a === 'x2' || a === 'h2') {
    const f = a === 'x2' ? 2 : .5;
    if (r.fixed) r.bpm *= f; // 손으로 적은 빠르기는 그대로 곱한다
    else { const m = (r.mul || 1) * f; if (m < .25 || m > 4) return; r.mul = m; r.bpm = r.autoBpm * m; } // 찾은 박을 따라(빠르기가 흔들려도 밀리지 않게)
    a2sBuild();
  }
  if (a === 'b-' || a === 'b+') { r.shift += a === 'b+' ? 1 : -1; a2sBuild(); }
  if (a === 'hb') { r.half = !r.half; a2sBuild(); toast(r.half ? '박을 반 박 뒤로 옮겼어요' : '박을 처음 자리로 돌렸어요'); }
  if (a === 'orig' || a === 'both') a2sPlay(a === 'both');
  if (a === 'stop') a2sStop();
  if (a === 'score') { // 악보만: 적힌 빠르기(♩ 칸의 값)대로 — 새 곡으로 열었을 때 들릴 소리
    a2sStop(); const song = A2.song; if (!song) return;
    SND.play([{ inst: 'voice', vol: .95, notes: song.melody }], Math.max(30, Math.min(220, +$('#a2sBpm').value || A2.res.bpm)), { from: -song.pickup });
  }
});
// 원곡에서 악보 1마디(못갖춘마디면 그 앞)가 시작하는 시각
function a2sTimeOf(u) { const { beats, bar1 } = A2.grid, song = A2.song, gm = song.geom || { U: 4, nb: 4 }; const b = bar1 + song.firstBar * gm.nb + u / gm.U; const i = Math.floor(b), f = b - i; const P = 60 / (A2.res.bpm * 4 / gm.U); const t = j => beats[j] ?? (beats[beats.length - 1] + (j - beats.length + 1) * P); return t(i) + f * (t(i + 1) - t(i)); }
let a2sSrc = null;
function a2sStop() { if (a2sSrc) { try { a2sSrc.stop(); } catch (x) { } a2sSrc = null; } SND.stop(); }
function a2sPlay(both) {
  a2sStop(); const song = A2.song; if (!song) return;
  if (!A2.src) { if (!both) return toast('원곡 MP3가 없어요 — 완성곡 칸에 MP3를 넣으면 같이 들을 수 있어요'); SND.play([{ inst: 'voice', vol: .95, notes: song.melody }], A2.res.bpm, { from: -song.pickup, warp: a2sTimeOf }); return; }
  const c = SND.audio(), from = -song.pickup - (both ? 0 : (song.geom ? song.geom.bar : C.BAR)), at = Math.max(0, a2sTimeOf(from));
  const src = c.createBufferSource(); src.buffer = A2.src; const g = c.createGain(); g.gain.value = both ? .55 : .9; src.connect(g); g.connect(c.destination);
  if (both) SND.play([{ inst: 'voice', vol: .95, notes: song.melody }], A2.res.bpm, { from, warp: a2sTimeOf }); // 박 지도대로(루바토를 따라) 친다
  src.start(c.currentTime + .12, at); a2sSrc = src;
}
$('#a2sUse').onclick = () => {
  const song = A2.song; if (!song) return;
  ask('지금 곡 대신 이 음원으로 만든 악보로 새 곡을 시작할까요? 지금 곡은 작업 기록에 남겨 둡니다.', () => {
    autoSnap('음원으로 새 곡 전'); a2sStop();
    const old = S; S = blank(); S.group = old.group; S.roles = old.roles; S.mode = old.mode;
    const srcF = A2.mix || A2.vox || A2.midi.file;
    S.title = ((A2.tag && A2.tag.title) || (A2.midi ? A2.midi.file.name.replace(/\s*\([^()]*\)\s*\.midi?$/i, '') : srcF.name).replace(/\.[^.]+$/, ''))
      .replace(/\s*\((?:lead |backing |main )?(?:vocals?|voice|보컬|노래)\)\s*$/i, '').replace(/^\d+[ _]+/, '').slice(0, 40) || '새 노래'; // 스템 이름표 '(Vocals)'는 뺀다
    S.tempo = Math.max(40, Math.min(200, Math.round(+$('#a2sBpm').value || A2.res.bpm)));
    S.key = A2.key; S.meter = song.meter || '4/4'; if (song.lineBars && song.lineBars !== C.METERS[S.meter].line) S.lineBars = song.lineBars; C.setMeter(S.meter, S.lineBars); S.pickup = C.PICKUPS[song.pickup] ? song.pickup : 0; C.METER.pickup = S.pickup; S.grid = $('#a2sGrid').value === 'auto' ? (song.melody.some(n => n.s % 2 || n.d % 2) ? 1 : 2) : +$('#a2sGrid').value;
    S.lyrics = song.lines.map(l => ({ text: l.text, chorus: !!l.chorus }));
    S.melody = song.melody.map(n => ({ id: C.uid(), p: n.p, s: n.s, d: n.d, lx: n.lx }));
    const tu = 60 / S.tempo / 4;
    S.take = { tempo: S.tempo, events: song.melody.map(n => ({ p: n.p, v: 88, t: +((n.uq ?? n.s) * tu).toFixed(4), d: +((n.ud ?? n.d) * tu).toFixed(4) })) };
    S.made = true; S.from = { kind: A2.midi ? 'midi' : 'audio', name: A2.midi ? A2.midi.file.name : srcF.name, bpm: Math.round(A2.res.bpm * 10) / 10, at: Date.now() };
    if (song.firstBar > 0) S.arr.settings.intro = Math.min(4, song.firstBar >= 4 ? 4 : 2);
    U.hist = []; save(); fillSetup(); $('#a2sDlg').close(); go(5);
    toast(`「${S.title}」 — ${S.lyrics.length}줄 · 음 ${S.melody.length}개로 새 곡을 열었어요. 5단계에서 글자 자리를 확인해요`);
  }, '새 곡 시작');
};

// ── 뮤즈스코어 연동: 고친 악보(.musicxml · .mxl) 다시 불러오기 ──
$('#mxlFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  let sc, part, song, mk;
  try {
    sc = MXL.parse(await MXL.readFile(f));
    mk = C.meterKeyOf(sc.meter[2] || sc.meter[0], sc.meter[1]);
    if (!mk) return toast(`${sc.meter[2] || sc.meter[0]}/${sc.meter[1]}박자 악보는 아직 못 읽어요 — 2/4·3/4·4/4·6/8·9/8·12/8·5/4·5/8·7/8만 돼요`);
    part = MXL.melodyPart(sc); if (!part || !part.notes.length) return toast('노래 선율이 있는 파트를 찾지 못했어요');
    const keep = C.METER.key; C.setMeter(mk);
    try { song = MXL.toSong(sc, part, { pickups: Object.keys(C.PICKUPS).map(Number), line: C.LINE, lineBars: C.METER.lineBars }); } finally { C.setMeter(keep); }
  } catch (x) { console.warn(x); return toast(x.message || '악보 파일을 읽지 못했어요'); }
  const sameSong = S.made && S.title && sc.title && S.title.trim() === sc.title.trim();
  const msg = `「${sc.title || f.name}」 — ${part.name} 파트의 선율 ${song.melody.length}음 · 가사 ${song.lines.filter(l => l.text).length}줄을 불러올까요?` + (sameSong ? ' 지금 곡의 선율·가사를 바꾸고, 모둠·역할·편성은 그대로 둬요.' : ' 새 곡으로 열어요. 지금 곡은 작업 기록에 남겨 둡니다.');
  ask(msg, () => {
    autoSnap('뮤즈스코어 악보 불러오기 전');
    if (!sameSong) { const old = S; S = blank(); S.group = old.group; S.roles = old.roles; S.mode = old.mode; }
    S.title = sc.title || S.title || f.name.replace(/\.[^.]+$/, '');
    if (sc.tempo) S.tempo = Math.max(40, Math.min(200, sc.tempo));
    S.key = sc.key; S.meter = mk; delete S.lineBars; C.setMeter(mk); S.pickup = song.pickup; C.METER.pickup = S.pickup;
    const ch = (S.lyrics || []).map(l => l.chorus);
    S.lyrics = song.lines.map((l, i) => ({ text: l.text, chorus: sameSong ? !!ch[i] : false }));
    S.melody = song.melody.map(n => ({ id: C.uid(), ...n }));
    const tu = 60 / S.tempo / 4;
    S.take = { tempo: S.tempo, events: S.melody.map(n => ({ p: n.p, v: 90, t: +(n.s * tu).toFixed(4), d: +(n.d * tu).toFixed(4) })) };
    S.made = true; S.from = { kind: 'musicxml', name: f.name, at: Date.now() };
    U.hist = []; save(); fillSetup(); go(5);
    toast('뮤즈스코어 악보를 불러왔어요 — 5단계에서 글자 자리를 확인하고, 6단계에서 편곡을 다시 만들어요');
  }, sameSong ? '바꾸기' : '새 곡으로 열기');
};
