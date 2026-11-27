// LIVE SCORE · 더하기 — 작업 기록(스냅샷), 허밍 입력, 노래방·발표 모드, 과정 보고서
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ── 작업 기록(스냅샷) ──
const SNAP = 'livescore-snaps-v1';
const SNAP_MAX = 10;
export function snapList() { try { return JSON.parse(localStorage.getItem(SNAP) || '[]'); } catch (e) { return []; } }
function snapWrite(list) {
  for (;;) {
    try { if (list.length) localStorage.setItem(SNAP, JSON.stringify(list)); else localStorage.removeItem(SNAP); return true; }
    catch (e) { if (!list.length) return false; list.pop(); }
  }
}
export function snapSave(S, label) {
  const list = snapList();
  list.unshift({ at: Date.now(), label: label || '', title: S.title || '새 창작곡', step: S.step || 1, data: JSON.stringify(S) });
  while (list.length > SNAP_MAX) list.pop();
  return snapWrite(list) && snapList().length > 0;
}
export function snapGet(i) { const l = snapList()[i]; return l ? JSON.parse(l.data) : null; }
export function snapDelete(i) { const l = snapList(); l.splice(i, 1); snapWrite(l); }
export function snapTrim() { const l = snapList(); if (!l.length) return false; l.pop(); snapWrite(l); return true; }

// ── 허밍(마이크) 입력: 노래한 음 높이 → 건반 신호 ──
function detect(b, sr) {
  let e = 0; for (let i = 0; i < b.length; i++) e += b[i] * b[i];
  const rms = Math.sqrt(e / b.length);
  if (rms < 0.012) return { f: null, rms };
  const minLag = Math.floor(sr / 1000), maxLag = Math.floor(sr / 70), N = Math.min(b.length - maxLag - 2, 1400);
  const nsdf = new Float32Array(maxLag + 2);
  let max = 0;
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let ac = 0, m = 0;
    for (let i = 0; i < N; i++) { const x = b[i], y = b[i + lag]; ac += x * y; m += x * x + y * y; }
    nsdf[lag] = m ? 2 * ac / m : 0; if (nsdf[lag] > max) max = nsdf[lag];
  }
  if (max < 0.62) return { f: null, rms };
  for (let lag = minLag + 1; lag <= maxLag; lag++) {
    const a = nsdf[lag - 1], c = nsdf[lag], d = nsdf[lag + 1];
    if (c > a && c >= d && c >= .9 * max) {
      const den = a - 2 * c + d, sh = den ? (a - d) / (2 * den) : 0;
      return { f: sr / (lag + sh), rms };
    }
  }
  return { f: null, rms };
}
export function createMic(SND, { onOn, onOff, onPitch }) {
  let stream = null, an = null, src = null, timer = null, buf = null;
  let cur = null, cand = null, candN = 0, candT = 0, quiet = 0;
  async function start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('이 브라우저는 마이크를 쓸 수 없어요');
    const c = SND.audio();
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } });
    src = c.createMediaStreamSource(stream);
    an = c.createAnalyser(); an.fftSize = 2048; src.connect(an);
    buf = new Float32Array(an.fftSize);
    timer = setInterval(() => tick(c.sampleRate), 20);
  }
  function tick(sr) {
    an.getFloatTimeDomainData(buf);
    const { f, rms } = detect(buf, sr);
    const now = performance.now();
    let m = f ? 69 + 12 * Math.log2(f / 440) : null;
    if (m != null && m < 57) m += 12; // 낮은 목소리(변성기 남학생)는 한 옥타브 올려 적는다
    if (m != null && (m < 45 || m > 90)) m = null;
    onPitch && onPitch(m == null ? null : Math.round(m), rms);
    if (m == null) {
      cand = null; candN = 0;
      if (cur != null && ++quiet >= 3) { onOff(cur, now - 50); cur = null; }
      return;
    }
    quiet = 0;
    if (cur != null && Math.abs(m - cur) < .75) { cand = null; candN = 0; return; } // 떨림·살짝 어긋남은 같은 음
    const p = Math.round(m);
    if (p === cand) candN++; else { cand = p; candN = 1; candT = now - 30; }
    if (candN >= 3) { if (cur != null) onOff(cur, candT); cur = p; onOn(p, candT); cand = null; candN = 0; }
  }
  function stop() {
    clearInterval(timer); timer = null;
    if (cur != null) { onOff(cur, performance.now()); cur = null; }
    try { src && src.disconnect(); } catch (e) { }
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null; an = null; src = null;
  }
  return { start, stop, get on() { return !!timer; } };
}

// ── 노래방·발표 모드 ──
// lines: [{text, chorus, syl:[{t, s, e}]}]  tracks(withVoice) → 재생 트랙
export function openKaraoke({ title, sub, tempo, lines, tracks, SND, bars, lineOf = s => Math.floor(s / 32) }) {
  const BAR = 16, LEAD = BAR;
  const el = document.createElement('div');
  el.className = 'kara'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '노래방·발표 모드');
  el.innerHTML = `<div class="kara-top"><div><b>${esc(title)}</b><small>${esc(sub)}</small></div>
    <div class="kara-ctl"><button type="button" data-k="song">▶ 노래와 반주</button><button type="button" data-k="mr">▶ 반주만(MR)</button><button type="button" data-k="stop">■ 멈춤</button><button type="button" data-k="close" aria-label="닫기">닫기 ✕</button></div></div>
    <div class="kara-mid"><p class="kara-count"></p><div class="kara-cur"></div><div class="kara-next"></div></div>
    <p class="kara-msg"></p><div class="kara-bar"><i></i></div>`;
  document.body.appendChild(el); document.body.classList.add('kara-open');
  const msg = el.querySelector('.kara-msg'), cur = el.querySelector('.kara-cur'), nxt = el.querySelector('.kara-next'), cnt = el.querySelector('.kara-count'), prog = el.querySelector('.kara-bar i');
  let li = -1, raf = null, st = 0; // st: 악보 첫 자리(전주·못갖춘마디면 음수)
  const lineHtml = (L, i) => L ? `<p class="${L.chorus ? 'ch' : ''}" data-li="${i}">${L.syl.length ? L.syl.map((x, k) => `<span data-k="${k}">${esc(x.t)}</span>`).join('') : '<span class="rest">♪ 간주 ♪</span>'}</p>` : '';
  function show(i) {
    li = i;
    cur.innerHTML = lineHtml(lines[i], i) || '<p class="end">♪</p>';
    nxt.innerHTML = lineHtml(lines[i + 1], i + 1);
  }
  show(0);
  function frame() {
    const raw = SND.position();
    if (raw == null) { cnt.textContent = ''; return; }
    const pos = raw - LEAD + st;
    if (raw < LEAD) { cnt.textContent = String(4 - Math.floor(raw / 4)); show(0); }
    else cnt.textContent = pos < 0 && st < 0 && pos < -BAR / 4 ? '♪' : '';
    const i = Math.max(0, Math.min(lines.length - 1, lineOf(Math.max(0, pos))));
    if (i !== li) show(i);
    const L = lines[li];
    if (L) cur.querySelectorAll('span[data-k]').forEach(sp => {
      const x = L.syl[+sp.dataset.k];
      sp.classList.toggle('k-sung', pos >= x.e); sp.classList.toggle('k-now', pos >= x.s && pos < x.e);
    });
    prog.style.width = Math.max(0, Math.min(100, pos / (bars * BAR) * 100)) + '%';
    raf = requestAnimationFrame(frame);
  }
  function play(withVoice) {
    SND.stop();
    const base = tracks(withVoice);
    msg.textContent = !withVoice && !base.length ? '아직 반주가 없어요 — 6단계에서 편곡을 고르면 반주가 나와요. 지금은 박만 세어 줍니다.' : '';
    st = Math.min(0, ...base.flatMap(t => t.notes.map(n => n.s)));
    const tr = base.map(t => ({ ...t, notes: t.notes.map(n => ({ ...n, s: n.s + LEAD - st })) }));
    tr.push({ inst: 'click', notes: [0, 4, 8, 12].map(s => ({ p: s ? 84 : 96, s, d: 1 })), vol: .9 });
    SND.play(tr, tempo, { from: 0, to: LEAD - st + bars * BAR, onend: () => { cancelAnimationFrame(raf); cnt.textContent = ''; } }); // 반주가 짧거나 없어도 곡 끝까지
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  }
  function close() { cancelAnimationFrame(raf); SND.stop(); el.remove(); document.body.classList.remove('kara-open'); document.removeEventListener('keydown', key); }
  const key = e => { if (e.key === 'Escape') close(); if (e.key === ' ') { e.preventDefault(); SND.isPlaying() ? SND.stop() : play(true); } };
  document.addEventListener('keydown', key);
  el.querySelector('.kara-ctl').addEventListener('click', e => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    const k = b.dataset.k;
    if (k === 'song') play(true); if (k === 'mr') play(false);
    if (k === 'stop') SND.stop(); if (k === 'close') close();
  });
  if (el.requestFullscreen) el.requestFullscreen().catch(() => { });
}
// 가사 흐름 → 노래방 줄
export function karaLines(C, melody, lyrics) {
  const { map } = C.lyricFlow(melody, lyrics);
  const sorted = melody.filter(n => n.p != null).sort((a, b) => a.s - b.s);
  return lyrics.map((l, li) => {
    const syl = [];
    sorted.filter(n => n.s >= C.lineStart(li) && n.s < C.lineStart(li + 1)).forEach(n => {
      const m = map.get(n.id); if (!m) return;
      if (m.kind === 'syl' && m.text) syl.push({ t: m.text, s: n.s, e: n.s + n.d });
      else if (m.kind === 'ext' && syl.length) syl[syl.length - 1].e = n.s + n.d;
    });
    return { text: l.text, chorus: l.chorus, syl };
  });
}

// ── 자기평가 ──
export const RUBRIC = [
  '노랫말에 우리가 전하고 싶은 마음과 장면을 담았다.',
  '말의 높낮이와 강세에 어울리게 선율을 만들었다.',
  '글자 수와 음표 수를 맞추어 가사를 자연스럽게 붙였다.',
  '편곡을 비교해 듣고, 까닭을 들어 고치거나 지켰다.',
  '맡은 역할을 해내고 모둠원과 의견을 나누며 협력했다.',
];
export const LEVELS = ['노력 중', '보통', '잘함'];

// ── 과정 보고서(포트폴리오) ──
export function openReport(d) {
  const w = window.open('', '_blank');
  if (!w) return false;
  const lv = i => (d.reflect.items && d.reflect.items[i] != null ? LEVELS[d.reflect.items[i]] : '—');
  const roles = Object.entries(d.roles).filter(([, v]) => v).map(([k, v]) => `<span><b>${esc(d.roleNames[k])}</b> ${esc(v)}</span>`).join('') || '<span>—</span>';
  const log = d.log.length ? d.log.map(l => `<tr><td>${l.bar + 1}마디</td><td>${esc(l.kind || '')}</td><td>${l.choice === 'mine' ? '내 선율 유지' : esc(d.vlab) + ' 쓰기'}</td><td>${esc(l.why)}</td><td>${esc(l.who)}</td></tr>`).join('') : '<tr><td colspan="5" class="mu">비교·수정 기록이 없어요.</td></tr>';
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(d.title)} · 창작 과정 보고서</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
@page{size:A4;margin:14mm}*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Pretendard Variable',Pretendard,'Malgun Gothic',sans-serif;color:#16181B;background:#F3F1EC;font-size:13.5px;line-height:1.65;word-break:keep-all}
.page{max-width:820px;margin:24px auto;background:#fff;padding:40px 44px;border-radius:14px;box-shadow:0 20px 50px -24px rgba(0,0,0,.3)}
.bar{display:flex;justify-content:space-between;align-items:center;max-width:820px;margin:18px auto 0;gap:10px}
.bar button{font:inherit;font-weight:700;background:#16181B;color:#fff;border:0;border-radius:9px;padding:9px 16px;cursor:pointer}
.bar small{color:#7E838A}
header{display:grid;grid-template-columns:1fr auto;gap:18px;align-items:end;border-bottom:2px solid #16181B;padding-bottom:16px}
.k{font-size:10.5px;letter-spacing:.16em;color:#A9844B;font-weight:800}
h1{font-size:28px;letter-spacing:-.03em;line-height:1.2;margin-top:4px}
.meta{text-align:right;font-size:12px;color:#3B4046}
.roles{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:8px;font-size:12.5px}.roles b{color:#1F4D3A;margin-right:3px}
h2{font-size:15px;margin:24px 0 10px;display:flex;align-items:center;gap:8px}h2 i{font-style:normal;font-size:10.5px;font-weight:800;background:#1F4D3A;color:#fff;border-radius:999px;padding:1px 8px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.box{background:#FAF9F6;border:1px solid #E4E0D7;border-radius:10px;padding:12px 14px}
.lyr li{list-style:none;padding:2px 0}.lyr li.ch{color:#1F4D3A;font-weight:700}.lyr li.ch::after{content:' 후렴';font-size:10px;color:#A9844B}
.nums{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.nums div{background:#FAF9F6;border:1px solid #E4E0D7;border-radius:10px;padding:10px;text-align:center}.nums b{display:block;font-size:20px;letter-spacing:-.03em}.nums span{font-size:11px;color:#7E838A}
table{width:100%;border-collapse:collapse;font-size:12.5px}th,td{border-bottom:1px solid #EEEBE4;padding:6px 6px;text-align:left;vertical-align:top}th{font-size:11px;color:#7E838A;font-weight:700}
.mu{color:#7E838A}.prog{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#3B4046}
.score svg{width:100%!important;height:auto}
.rub td:last-child{white-space:nowrap;font-weight:700;color:#1F4D3A}
.q{white-space:pre-wrap}
@media print{body{background:#fff}.bar{display:none}.page{box-shadow:none;margin:0;padding:0;max-width:none}.score{page-break-before:always}}
</style></head><body>
<div class="bar"><small>인쇄 창에서 'PDF로 저장'을 고르면 포트폴리오 파일이 됩니다.</small><button onclick="print()">인쇄 · PDF로 저장</button></div>
<main class="page">
<header><div><p class="k">LIVE SCORE · 창작 과정 보고서</p><h1>${esc(d.title)}</h1><div class="roles">${roles}</div></div>
<div class="meta">${esc(d.group || '')}<br>${esc(d.keyName)} · ♩=${d.tempo} · ${d.bars}마디<br>${esc(d.date)}</div></header>
<h2><i>1</i>노랫말과 장면</h2>
<div class="two"><div class="box"><ol class="lyr">${d.lyrics.map(l => `<li class="${l.chorus ? 'ch' : ''}">${esc(l.text) || '<span class="mu">(빈 줄)</span>'}</li>`).join('')}</ol></div>
<div class="box"><p><b>들을 사람과 장면</b></p><p class="q">${esc(d.scene) || '<span class="mu">—</span>'}</p><p style="margin-top:8px"><b>고른 편곡</b> ${esc(d.verName || '—')}</p><p class="prog">${esc(d.prog || '')}</p><p style="margin-top:8px"><b>고른 이유</b></p><p class="q">${esc(d.why) || '<span class="mu">—</span>'}</p></div></div>
<h2><i>2</i>창작 과정 한눈에</h2>
<div class="nums"><div><b>${d.syl}</b><span>노랫말 음절</span></div><div><b>${d.notes}</b><span>선율 음표</span></div><div><b>${d.counts.n}</b><span>비교·수정 결정</span></div><div><b>${d.counts.mine} : ${d.counts.ai}</b><span>내 선율 유지 : ${esc(d.vlab)} 채택</span></div></div>
<h2><i>3</i>비교·수정 기록 <small class="mu">— 무엇을, 왜 바꾸거나 지켰는가</small></h2>
<table><thead><tr><th>마디</th><th>바뀐 것</th><th>결정</th><th>이유</th><th>누가</th></tr></thead><tbody>${log}</tbody></table>
<h2><i>4</i>자기평가와 성찰</h2>
<table class="rub"><tbody>${RUBRIC.map((r, i) => `<tr><td>${esc(r)}</td><td>${lv(i)}</td></tr>`).join('')}</tbody></table>
<div class="two" style="margin-top:12px"><div class="box"><p><b>가장 잘된 점</b></p><p class="q">${esc(d.reflect.good) || '<span class="mu">—</span>'}</p></div><div class="box"><p><b>다음에 바꾸고 싶은 점</b></p><p class="q">${esc(d.reflect.next) || '<span class="mu">—</span>'}</p></div></div>
<h2 class="score-h"><i>5</i>완성 악보</h2>
<div class="score">${d.svg || '<p class="mu">악보가 없어요.</p>'}</div>
</main></body></html>`;
  w.document.open(); w.document.write(html); w.document.close();
  return true;
}
