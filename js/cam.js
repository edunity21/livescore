// LIVE SCORE · 카메라 — 인터넷·AI 없이 브라우저 안에서만 (영상은 어디로도 보내지 않는다)
// · 에어 건반: 화면 위쪽 칸에 손을 넣으면 그 음이 울리고 녹음된다(움직임 감지)
// · 그림 선율: 종이에 그린 선율선을 비추거나 사진을 올리면 가사 글자 수만큼 음을 뽑는다
// · 손 지휘 빠르기: 손을 위아래로 지휘하면 박 간격으로 빠르기를 찾는다
// · 모둠 사진 · 뮤직비디오 녹화(카메라 + 가사 자막 + 반주 + 노래)

// ── 카메라 열기 ──
export async function openCam(w = 640, h = 480) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('이 브라우저는 카메라를 쓸 수 없어요'), { name: 'NoCam' });
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: w }, height: { ideal: h }, facingMode: 'user' }, audio: false });
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.srcObject = stream;
  await video.play();
  await new Promise(r => (video.videoWidth ? r() : video.addEventListener('loadedmetadata', r, { once: true })));
  return { video, stream, stop() { stream.getTracks().forEach(t => t.stop()); video.srcObject = null; } };
}
export const camErr = x => (x && x.name === 'NotAllowedError' ? '카메라 사용을 허락해 주세요 (주소창 왼쪽 아이콘 → 카메라 허용)' : x && x.name === 'NotFoundError' ? '카메라를 찾지 못했어요' : (x && x.message) || '카메라를 켜지 못했어요');

// 작은 회색 영상(움직임 계산용) — 좌우를 뒤집어 거울처럼
const SW = 96, SH = 72;
function grayFrame(video, cv) {
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.save(); g.translate(SW, 0); g.scale(-1, 1); g.drawImage(video, 0, 0, SW, SH); g.restore();
  const d = g.getImageData(0, 0, SW, SH).data, out = new Uint8Array(SW * SH);
  for (let i = 0, j = 0; j < out.length; i += 4, j++) out[j] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
  return out;
}

// ── 에어 건반 ──
// notes: [{p, label}] — 화면 위쪽 띠를 칸으로 나눈다. onOn(p, t) / onOff(p, t)
export function airKeys(cam, view, { notes, onOn, onOff }) {
  const small = document.createElement('canvas'); small.width = SW; small.height = SH;
  const g = view.getContext('2d');
  let prev = null, raf = null, on = new Map(), quiet = new Map(), last = new Map();
  const band = [0.04, 0.36]; // 위쪽 32% 높이
  function frame() {
    const W = view.width, H = view.height;
    g.save(); g.translate(W, 0); g.scale(-1, 1); g.drawImage(cam.video, 0, 0, W, H); g.restore();
    const cur = grayFrame(cam.video, small);
    const n = notes.length, now = performance.now();
    notes.forEach((nt, i) => {
      const x0 = Math.floor(i * SW / n) + 1, x1 = Math.floor((i + 1) * SW / n) - 1, y0 = Math.floor(band[0] * SH), y1 = Math.floor(band[1] * SH);
      let hit = 0, all = 0;
      if (prev) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const k = y * SW + x; all++; if (Math.abs(cur[k] - prev[k]) > 28) hit++; }
      const r = all ? hit / all : 0;
      if (!on.has(nt.p) && r > 0.09 && now - (last.get(nt.p) || 0) > 140) { on.set(nt.p, now); quiet.set(nt.p, 0); last.set(nt.p, now); onOn(nt.p, now); }
      else if (on.has(nt.p)) { if (r < 0.035) quiet.set(nt.p, (quiet.get(nt.p) || 0) + 1); else quiet.set(nt.p, 0); if (quiet.get(nt.p) >= 5 || now - on.get(nt.p) > 1800) { on.delete(nt.p); onOff(nt.p, now); } }
      // 칸 그리기
      const X0 = i * W / n, X1 = (i + 1) * W / n, Y0 = band[0] * H, Y1 = band[1] * H;
      g.fillStyle = on.has(nt.p) ? 'rgba(201,160,90,.72)' : 'rgba(255,255,255,.16)'; g.fillRect(X0 + 3, Y0, X1 - X0 - 6, Y1 - Y0);
      g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2; g.strokeRect(X0 + 3, Y0, X1 - X0 - 6, Y1 - Y0);
      g.fillStyle = '#fff'; g.font = `800 ${Math.round(H / 16)}px Pretendard, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(nt.label, (X0 + X1) / 2, (Y0 + Y1) / 2);
    });
    prev = cur;
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return { stop() { cancelAnimationFrame(raf); const t = performance.now(); on.forEach((_, p) => onOff(p, t)); on.clear(); } };
}

// ── 손 지휘 빠르기 ──
// 움직임의 무게중심(세로)을 따라가, 내려가다 올라가는 곳(점)을 박으로 본다. onBeat(bpm|null, count)
export function conductTempo(cam, view, { onBeat }) {
  const small = document.createElement('canvas'); small.width = SW; small.height = SH;
  const g = view.getContext('2d');
  let prev = null, raf = null, ys = [], beats = [], dir = 0, lastBeat = 0, trail = [];
  function frame() {
    const W = view.width, H = view.height, now = performance.now();
    g.save(); g.translate(W, 0); g.scale(-1, 1); g.drawImage(cam.video, 0, 0, W, H); g.restore();
    const cur = grayFrame(cam.video, small);
    if (prev) {
      let sx = 0, sy = 0, n = 0;
      for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) { const k = y * SW + x; if (Math.abs(cur[k] - prev[k]) > 30) { sx += x; sy += y; n++; } }
      if (n > SW * SH * 0.006) {
        const y = sy / n, x = sx / n;
        ys.push({ y, t: now }); if (ys.length > 6) ys.shift();
        trail.push({ x: x / SW * W, y: y / SH * H }); if (trail.length > 14) trail.shift();
        if (ys.length >= 3) {
          const v = ys[ys.length - 1].y - ys[ys.length - 3].y; // +: 내려감
          if (dir > 0 && v < -0.8 && now - lastBeat > 280) { // 내려오다 튀어 오름 → 박
            lastBeat = now; beats.push(now); if (beats.length > 7) beats.shift();
            const iv = beats.slice(1).map((b, i) => b - beats[i]).filter(d => d > 280 && d < 1500).sort((a, b) => a - b);
            const bpm = iv.length >= 2 ? Math.round(60000 / iv[iv.length >> 1]) : null;
            onBeat(bpm, beats.length);
          }
          if (Math.abs(v) > 0.8) dir = Math.sign(v);
        }
      }
    }
    prev = cur;
    // 손 자취와 박 깜빡임
    g.strokeStyle = 'rgba(201,160,90,.9)'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath();
    trail.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
    if (now - lastBeat < 150) { g.fillStyle = 'rgba(201,160,90,.35)'; g.fillRect(0, 0, W, H); }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return { stop() { cancelAnimationFrame(raf); }, reset() { beats = []; } };
}

// ── 그림 선율: 그림(사진·카메라 한 장면)에서 선 찾기 ──
// 반환: { ys: 0~1(위=1) 또는 null 을 가로 칸마다, x0, x1(선이 있는 가로 범위 0~1) }
export function contourFrom(img, cols = 160) {
  const W = cols, H = Math.round(cols * (img.height || img.videoHeight) / (img.width || img.videoWidth)) || 120;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data, gray = new Float32Array(W * H);
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) gray[j] = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11;
  // 조명이 고르지 않아도 되게: 주변 밝기보다 확실히 어두운 곳만 선으로
  const R = 6, dark = new Uint8Array(W * H);
  const integ = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += gray[y * W + x]; integ[(y + 1) * (W + 1) + x + 1] = integ[y * (W + 1) + x + 1] + row; } }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const xa = Math.max(0, x - R), xb = Math.min(W, x + R + 1), ya = Math.max(0, y - R), yb = Math.min(H, y + R + 1);
    const sum = integ[yb * (W + 1) + xb] - integ[ya * (W + 1) + xb] - integ[yb * (W + 1) + xa] + integ[ya * (W + 1) + xa];
    const mean = sum / ((xb - xa) * (yb - ya));
    dark[y * W + x] = gray[y * W + x] < mean * 0.78 && gray[y * W + x] < 150 ? 1 : 0;
  }
  const ys = new Array(W).fill(null);
  for (let x = 1; x < W - 1; x++) {
    let sy = 0, n = 0; for (let y = 2; y < H - 2; y++) if (dark[y * W + x]) { sy += y; n++; }
    if (n >= 1 && n < H * 0.35) ys[x] = 1 - sy / n / H; // 너무 많이 칠해진 세로줄(그림자·테두리)은 뺀다
  }
  // 튀는 값 다듬기(중앙값 5칸)
  const sm = ys.map((v, i) => { if (v == null) return null; const w = ys.slice(Math.max(0, i - 2), i + 3).filter(z => z != null).sort((a, b) => a - b); return w[w.length >> 1]; });
  const idx = sm.map((v, i) => (v == null ? -1 : i)).filter(i => i >= 0);
  if (idx.length < W * 0.15) return null;
  return { ys: sm, x0: idx[0] / W, x1: idx[idx.length - 1] / W, W };
}
// 선 → 줄마다 가사 글자 수만큼 음(높이: 조의 음계, 리듬: 2마디에 고르게)
export function contourMelody(ct, { lines, syll, key, tonic, scale, lo = 60, hi = 76, lineStart, BAR }) {
  const tones = []; for (let p = lo; p <= hi; p++) if (scale.includes(((p - tonic) % 12 + 12) % 12)) tones.push(p);
  const at = f => { const x = Math.round((ct.x0 + (ct.x1 - ct.x0) * f) * ct.W); for (let k = 0; k < ct.W; k++) for (const xx of [x - k, x + k]) if (ct.ys[xx] != null) return ct.ys[xx]; return 0.5; };
  const out = [], L = lines.length;
  lines.forEach((l, li) => {
    const n = Math.max(1, Math.min(16, syll[li] || 8)), span = BAR * 2;
    const base = n <= 4 ? 8 : n <= 8 ? 4 : 2, durs = Array.from({ length: n }, (_, i) => (i < n - 1 ? base : Math.max(base, span - base * (n - 1))));
    let s = lineStart(li);
    for (let i = 0; i < n; i++) {
      const f = (li + (n === 1 ? .5 : i / (n - 1)) * .96) / L;
      const y = at(Math.min(1, f));
      const p = tones[Math.max(0, Math.min(tones.length - 1, Math.round(y * (tones.length - 1))))];
      const d = Math.min(durs[i], lineStart(li) + span - s);
      if (d <= 0) break;
      out.push({ p, s, d }); s += d;
    }
  });
  return out;
}

// ── 뮤직비디오 녹화 ──
// draw(g, W, H, pos) 로 자막을 그리고, 카메라 + 반주(+마이크 노래)를 webm으로 녹화
export async function recordMV({ cam, audioCtx, tap, withMic, draw, durationMs, onTick }) {
  const W = 1280, H = 720, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const dest = audioCtx.createMediaStreamDestination();
  tap.connect(dest);
  let micStream = null, micSrc = null;
  if (withMic) {
    try { micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); micSrc = audioCtx.createMediaStreamSource(micStream); const mg = audioCtx.createGain(); mg.gain.value = 1.2; micSrc.connect(mg); mg.connect(dest); } catch (x) { micStream = null; }
  }
  const stream = new MediaStream([...cv.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  const mime = types.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
  if (!mime) throw new Error('이 브라우저는 영상 녹화를 지원하지 않아요');
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 3_000_000 });
  const chunks = []; rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  let raf = null, t0 = performance.now(), stopped = false;
  const frame = () => {
    const vw = cam.video.videoWidth, vh = cam.video.videoHeight, k = Math.max(W / vw, H / vh);
    g.save(); g.translate(W, 0); g.scale(-1, 1); g.drawImage(cam.video, (W - vw * k) / 2, (H - vh * k) / 2, vw * k, vh * k); g.restore();
    const el = performance.now() - t0;
    draw(g, W, H, el); onTick && onTick(el, cv);
    if (!stopped) raf = requestAnimationFrame(frame);
  };
  const done = new Promise(res => { rec.onstop = () => res(new Blob(chunks, { type: mime.split(';')[0] })); });
  rec.start(500); frame();
  const stop = () => { if (stopped) return; stopped = true; cancelAnimationFrame(raf); try { rec.stop(); } catch (x) { } try { tap.disconnect(dest); } catch (x) { } if (micStream) micStream.getTracks().forEach(t => t.stop()); };
  const timer = setTimeout(stop, durationMs);
  return { stop: () => { clearTimeout(timer); stop(); }, done, ext: mime.includes('mp4') ? 'mp4' : 'webm' };
}

// 사진 한 장(모둠 사진)
export function snapshot(cam, w = 480) {
  const vw = cam.video.videoWidth, vh = cam.video.videoHeight, h = Math.round(w * vh / vw);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'); g.translate(w, 0); g.scale(-1, 1); g.drawImage(cam.video, 0, 0, w, h);
  return cv.toDataURL('image/jpeg', 0.72);
}
