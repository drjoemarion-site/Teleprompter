'use strict';

/* ======================================================================
   Prompter: teleprompter + camera recorder for Android Chrome.
   Everything stays on the device: scripts and settings live in
   localStorage, and recordings are only ever handed to the share sheet
   or downloaded.
   ====================================================================== */

const $ = (sel) => document.querySelector(sel);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ---------------- Storage ---------------- */

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
  },
};

const DEFAULTS = {
  format: 'vertical',   // 'vertical' (9:16) | 'horizontal' (16:9)
  mode: 'voice',        // 'voice' | 'steady'
  wpm: 140,
  fontSize: 36,
  sensitivity: 50,
  hangover: 700,        // ms of silence before scrolling stops
  position: 'auto',     // 'auto' | 'top' | 'left' | 'right'
};
const settings = { ...DEFAULTS, ...store.get('prompter.settings', {}) };
const saveSettings = () => store.set('prompter.settings', settings);

const SAMPLE = {
  id: 'sample',
  title: 'Sample: how this works',
  text: `Hi! This is a sample script so you can see how the prompter works.

Start talking and the text moves up. Stop talking and it waits for you. Take a breath, look at the camera, and pick up where you left off.

Tap the text to pause it yourself. Drag it to go back a line or skip ahead.

Use the gear button to pick vertical for Reels or horizontal for YouTube, change the speed, or make the text bigger.

When you're ready, go back and add your own script. Good luck with the video!`,
  updated: Date.now(),
};

let scripts = store.get('prompter.scripts', null);
if (!Array.isArray(scripts)) { scripts = [SAMPLE]; store.set('prompter.scripts', scripts); }
const saveScripts = () => store.set('prompter.scripts', scripts);

const wordCount = (text) => (text.trim().match(/\S+/g) || []).length;
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDuration = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/* ---------------- Screens & navigation ---------------- */

let view = 'library';
let currentId = null;

function show(name, push = true) {
  if (view === 'studio' && name !== 'studio') leaveStudio();
  for (const id of ['library', 'editor', 'studio']) $('#' + id).hidden = id !== name;
  view = name;
  if (push) history.pushState({ screen: name, id: currentId }, '');
  if (name === 'library') renderLibrary();
  if (name === 'studio') enterStudio();
}

window.addEventListener('popstate', (e) => {
  const st = e.state || { screen: 'library' };
  if (view === 'studio' && recorder) { history.pushState({ screen: 'studio', id: currentId }, ''); return; }
  currentId = st.id ?? currentId;
  if (st.screen === 'editor') openEditor(currentId, false);
  else show(st.screen === 'studio' && currentId ? 'studio' : 'library', false);
});

/* ---------------- Library ---------------- */

function renderLibrary() {
  const list = $('#scriptList');
  list.innerHTML = '';
  if (!scripts.length) {
    list.innerHTML = '<li class="empty">No scripts yet. Tap "+ New script" to add one.</li>';
    return;
  }
  for (const s of [...scripts].sort((a, b) => b.updated - a.updated)) {
    const words = wordCount(s.text);
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="info">
        <div class="title"></div>
        <div class="meta">${words} words · about ${fmtDuration((words / settings.wpm) * 60)}</div>
      </div>
      <button class="btn" data-act="edit">Edit</button>
      <button class="btn primary" data-act="go">Record</button>`;
    li.querySelector('.title').textContent = s.title || 'Untitled';
    li.querySelector('.info').onclick = () => openStudio(s.id);
    li.querySelector('[data-act=go]').onclick = () => openStudio(s.id);
    li.querySelector('[data-act=edit]').onclick = () => openEditor(s.id);
    list.appendChild(li);
  }
}

$('#newScript').onclick = () => openEditor(null);

/* ---------------- Editor ---------------- */

function openEditor(id, push = true) {
  currentId = id;
  const s = scripts.find((x) => x.id === id);
  $('#editorHeading').textContent = s ? 'Edit script' : 'New script';
  $('#scriptTitle').value = s ? s.title : '';
  $('#scriptText').value = s ? s.text : '';
  updateEditorStats();
  let del = $('#deleteScript');
  if (s && !del) {
    del = document.createElement('button');
    del.id = 'deleteScript';
    del.className = 'btn danger';
    del.textContent = 'Delete script';
    del.onclick = deleteCurrent;
    $('#editor .row').appendChild(del);
  } else if (!s && del) del.remove();
  show('editor', push);
}

function updateEditorStats() {
  const words = wordCount($('#scriptText').value);
  $('#editorStats').textContent = words ? `${words} words · about ${fmtDuration((words / settings.wpm) * 60)} at ${settings.wpm} wpm` : '';
}
$('#scriptText').addEventListener('input', updateEditorStats);

$('#saveScript').onclick = () => {
  const text = $('#scriptText').value;
  if (!text.trim()) { alert('Add some script text first.'); return; }
  const title = $('#scriptTitle').value.trim() || text.trim().split('\n')[0].slice(0, 50);
  let s = scripts.find((x) => x.id === currentId);
  if (s) Object.assign(s, { title, text, updated: Date.now() });
  else {
    s = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title, text, updated: Date.now() };
    scripts.push(s);
  }
  saveScripts();
  currentId = s.id;
  history.back();
};

$('#editorBack').onclick = () => history.back();

function deleteCurrent() {
  const s = scripts.find((x) => x.id === currentId);
  if (!s || !confirm(`Delete "${s.title}"?`)) return;
  scripts = scripts.filter((x) => x.id !== currentId);
  saveScripts();
  currentId = null;
  history.back();
}

$('#fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  $('#scriptText').value = text;
  if (!$('#scriptTitle').value.trim()) $('#scriptTitle').value = file.name.replace(/\.[^.]+$/, '');
  updateEditorStats();
  e.target.value = '';
});

/* ======================================================================
   Studio
   ====================================================================== */

const studio = $('#studio');
const video = $('#preview');
const prompter = $('#prompter');
const body = $('#scriptBody');

let stream = null;
let wakeLock = null;
let recorder = null;
let chunks = [];
let recStart = 0;
let takeBlob = null;
let takeUrl = null;

// Scroll state
let offset = 0;            // px scrolled
let velocity = 0;          // px/s, eased towards the target speed
let running = false;       // scrolling is armed (recording or practice)
let held = false;          // paused by a tap
let dragging = false;
let words = 0;
let geom = { max: 0, pxPerWord: 1, marker: 0 };

// Voice detection state
let audioCtx = null;
let analyser = null;
let sampleBuf = null;
let level = -100;          // smoothed dB
let floor = null;          // estimated background noise in dB
let speaking = false;
let aboveSince = 0;
let belowSince = 0;
let lastVoice = 0;
let micStart = 0;
// Learn the room quickly right after the mic opens and during the countdown, while you're quiet.
const calibrating = (now) => countingDown || now - micStart < 2000;

let rafId = 0;
let lastFrame = 0;

function openStudio(id) {
  currentId = id;
  show('studio');
}

async function enterStudio() {
  const s = scripts.find((x) => x.id === currentId);
  if (!s) { show('library'); return; }
  renderScript(s.text);
  offset = 0; velocity = 0; running = false; held = false;
  applySettingsUI();
  updateLayout();
  await startCamera();
  requestWakeLock();
  lastFrame = 0;
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(frame);
}

function leaveStudio() {
  if (recorder) stopRecording(true);
  running = false;
  cancelAnimationFrame(rafId);
  stopCamera();
  releaseWakeLock();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  try { screen.orientation && screen.orientation.unlock(); } catch { /* not supported */ }
  $('#settings').hidden = true;
  $('#review').hidden = true;
  $('#countdown').hidden = true;
}

function renderScript(text) {
  const paras = text.replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/);
  body.innerHTML = paras.map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`).join('')
    + '<p class="end" style="opacity:.5">— end —</p>';
  words = wordCount(text);
}

/* ---------------- Layout ---------------- */

const isLandscape = () => window.innerWidth > window.innerHeight;

function resolvePosition() {
  if (settings.position !== 'auto') return settings.position;
  if (!isLandscape()) return 'top';
  // Android reports 90 when the phone is turned counter-clockwise (camera on the left)
  // and 270 when turned clockwise (camera on the right).
  const angle = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 90;
  return angle === 270 || angle === -90 ? 'right' : 'left';
}

function updateLayout() {
  if (view !== 'studio') return;
  const progress = geom.max > 0 ? offset / geom.max : 0;
  const pos = resolvePosition();
  studio.classList.remove('pos-top', 'pos-left', 'pos-right');
  studio.classList.add('pos-' + pos);

  body.style.fontSize = settings.fontSize + 'px';
  const h = prompter.clientHeight;
  const line = settings.fontSize * 1.35;
  // Reading line sits level with the lens: near the top in portrait, mid-height when sideways.
  const marker = Math.round(h * (pos === 'top' ? 0.28 : 0.42));
  prompter.style.setProperty('--marker', marker + 'px');
  body.style.paddingTop = Math.max(0, marker - line / 2) + 'px';
  body.style.paddingBottom = Math.max(0, h - marker - line / 2) + 'px';

  const textHeight = body.scrollHeight - parseFloat(body.style.paddingTop) - parseFloat(body.style.paddingBottom);
  geom = {
    max: Math.max(0, body.scrollHeight - h),
    pxPerWord: words ? textHeight / words : 1,
    marker,
  };
  offset = progress * geom.max;
  applyOffset();
  checkOrientation();
}

function checkOrientation() {
  const wantLandscape = settings.format === 'horizontal';
  const wrong = wantLandscape !== isLandscape();
  const notice = $('#rotateNotice');
  // Never interrupt a take that's already rolling.
  notice.hidden = !wrong || !!recorder;
  notice.classList.toggle('to-portrait', !wantLandscape);
  $('#rotateText').textContent = wantLandscape
    ? 'Turn your phone sideways for horizontal (YouTube) video'
    : 'Hold your phone upright for vertical (Reels) video';
  return !wrong;
}

window.addEventListener('resize', () => requestAnimationFrame(updateLayout));
if (screen.orientation) screen.orientation.addEventListener('change', () => requestAnimationFrame(updateLayout));

function applyOffset() {
  body.style.transform = `translate3d(0, ${-offset}px, 0)`;
}

/* ---------------- Camera ---------------- */

async function startCamera() {
  stopCamera();
  $('#cameraError').hidden = true;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return cameraError(window.isSecureContext
      ? 'This browser can\'t use the camera. Open the app in Chrome.'
      : 'The camera only works over a secure (https://) link. Open the app from its https address.');
  }
  const vertical = settings.format === 'vertical';
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: vertical ? 1080 : 1920 },
        height: { ideal: vertical ? 1920 : 1080 },
        frameRate: { ideal: 30 },
      },
      audio: {
        echoCancellation: false,
        noiseSuppression: true,
        autoGainControl: false, // keeps silence quiet, which makes pause detection reliable
      },
    });
  } catch (err) {
    const msg = {
      NotAllowedError: 'Camera or microphone access was blocked. Tap the lock icon next to the address bar, allow both, then try again.',
      NotFoundError: 'No camera or microphone was found on this device.',
      NotReadableError: 'Another app is using the camera. Close it and try again.',
    }[err.name] || `Couldn't start the camera (${err.message || err.name}).`;
    return cameraError(msg);
  }
  video.srcObject = stream;
  await video.play().catch(() => {});
  setupVoiceDetection(stream);
  const vt = stream.getVideoTracks()[0];
  const st = vt && vt.getSettings ? vt.getSettings() : {};
  $('#cameraInfo').textContent = st.width ? `Camera: ${st.width}×${st.height} at ${Math.round(st.frameRate || 30)} fps` : '';
}

function cameraError(msg) {
  $('#cameraErrorText').textContent = msg;
  $('#cameraError').hidden = false;
}
$('#retryCamera').onclick = () => startCamera();

function stopCamera() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
  if (audioCtx) audioCtx.close().catch(() => {});
  audioCtx = null; analyser = null;
}

async function requestWakeLock() {
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch { wakeLock = null; }
}
function releaseWakeLock() {
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && view === 'studio') requestWakeLock();
});

/* ---------------- Voice detection ----------------
   Measures loudness on the mic and keeps a running estimate of the
   room's background noise. You're "speaking" when the level rises a
   set margin above that noise floor; scrolling stops once it has been
   quiet for the "pause after silence" time. */

function setupVoiceDetection(s) {
  const tracks = s.getAudioTracks();
  if (!tracks.length) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  audioCtx = new Ctx();
  const src = audioCtx.createMediaStreamSource(new MediaStream(tracks));
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  src.connect(analyser);
  sampleBuf = new Float32Array(analyser.fftSize);
  floor = null;
  speaking = false;
  micStart = performance.now();
}

function updateVoice(now) {
  if (!analyser) return;
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  analyser.getFloatTimeDomainData(sampleBuf);
  let sum = 0;
  for (let i = 0; i < sampleBuf.length; i++) sum += sampleBuf[i] * sampleBuf[i];
  const db = Math.max(-100, 20 * Math.log10(Math.sqrt(sum / sampleBuf.length) + 1e-9));
  level += (db - level) * 0.35;

  // Noise floor: falls fast (the gaps between words pull it down) and
  // rises slowly, so it settles on the quietest recent level.
  const dt = lastVoice ? Math.min((now - lastVoice) / 1000, 0.1) : 0;
  lastVoice = now;
  if (floor == null) floor = level;
  else if (level < floor) floor += (level - floor) * Math.min(1, 4 * dt);
  else floor += (level - floor) * Math.min(1, (calibrating(now) ? 2 : 0.12) * dt);
  floor = clamp(floor, -95, -25);

  const margin = 20 - settings.sensitivity * 0.16;                  // 20 dB (low) … 4 dB (high)
  const threshold = floor + margin;

  if (level > threshold) {
    belowSince = 0;
    if (!aboveSince) aboveSince = now;
    if (!speaking && now - aboveSince > 80) speaking = true;
  } else {
    aboveSince = 0;
    if (!belowSince) belowSince = now;
    if (speaking && level < threshold - 1.5 && now - belowSince > settings.hangover) speaking = false;
  }

  // Meter: -80 dB … -10 dB
  const pct = (v) => clamp(((v + 80) / 70) * 100, 0, 100) + '%';
  $('#meterFill').style.width = pct(level);
  $('#meterThresh').style.left = pct(threshold);
  $('#voiceChip').classList.toggle('speaking', speaking);
}

/* ---------------- Main loop ---------------- */

function frame(now) {
  rafId = requestAnimationFrame(frame);
  const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 0;
  lastFrame = now;

  updateVoice(now);

  const moving = running && !held && (settings.mode === 'steady' || speaking || !analyser);
  const target = moving && offset < geom.max ? (settings.wpm / 60) * geom.pxPerWord : 0;
  // Ease in when starting, stop a little faster when you pause.
  const k = target > velocity ? 4 : 9;
  velocity += (target - velocity) * Math.min(1, k * dt);
  if (velocity < 0.5 && target === 0) velocity = 0;

  if (!dragging && velocity > 0) {
    offset = clamp(offset + velocity * dt, 0, geom.max);
    applyOffset();
  }

  let label = 'Mic';
  if (settings.mode === 'steady') label = running ? 'Steady' : 'Ready';
  else if (!analyser) label = 'No mic';
  else if (running) label = held ? 'Paused' : speaking ? 'Scrolling' : 'Waiting for you';
  else label = speaking ? 'Hearing you' : 'Ready';
  const el = $('#voiceLabel');
  if (el.textContent !== label) el.textContent = label;

  if (recorder) $('#timer').textContent = fmtDuration((now - recStart) / 1000);
}

/* ---------------- Touch & remote controls ---------------- */

let touch = null;
prompter.addEventListener('pointerdown', (e) => {
  touch = { y: e.clientY, t: performance.now(), start: offset, moved: false };
  prompter.setPointerCapture(e.pointerId);
});
prompter.addEventListener('pointermove', (e) => {
  if (!touch) return;
  const dy = e.clientY - touch.y;
  if (Math.abs(dy) > 8) { touch.moved = true; dragging = true; }
  if (dragging) {
    offset = clamp(touch.start - dy, 0, geom.max);
    velocity = 0;
    applyOffset();
  }
});
const endTouch = () => {
  if (touch && !touch.moved && performance.now() - touch.t < 400) setHeld(!held);
  touch = null;
  dragging = false;
};
prompter.addEventListener('pointerup', endTouch);
prompter.addEventListener('pointercancel', () => { touch = null; dragging = false; });

function setHeld(v) {
  held = v;
  $('#holdBadge').hidden = !held;
}

// Bluetooth page-turner / keyboard support
document.addEventListener('keydown', (e) => {
  if (view !== 'studio' || !$('#settings').hidden || !$('#review').hidden) return;
  const step = settings.fontSize * 1.35 * 2;
  if (e.key === ' ' || e.key === 'Enter') { setHeld(!held); e.preventDefault(); }
  else if (e.key === 'ArrowUp' || e.key === 'PageUp') { offset = clamp(offset - step, 0, geom.max); applyOffset(); e.preventDefault(); }
  else if (e.key === 'ArrowDown' || e.key === 'PageDown') { offset = clamp(offset + step, 0, geom.max); applyOffset(); e.preventDefault(); }
});

/* ---------------- Takes: practice & recording ---------------- */

let countingDown = false;

async function goFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    await screen.orientation.lock(settings.format === 'horizontal' ? 'landscape' : 'portrait');
  } catch { /* desktop browsers or user declined; the rotate notice covers it */ }
}

async function countdown() {
  countingDown = true;
  studio.classList.add('busy');
  const el = $('#countdown');
  el.hidden = false;
  for (const n of [3, 2, 1]) {
    el.textContent = n;
    await new Promise((r) => setTimeout(r, 1000));
    if (view !== 'studio') break;
  }
  el.hidden = true;
  countingDown = false;
}

async function beginTake(record) {
  if (countingDown || !stream) return;
  await goFullscreen();
  await new Promise((r) => setTimeout(r, 250)); // let rotation settle
  updateLayout();
  if (!checkOrientation()) return;
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  setHeld(false);
  await countdown();
  if (view !== 'studio' || !stream) { studio.classList.remove('busy'); return; }
  if (record) startRecording();
  else $('#practiceBtn').classList.add('on');
  running = true;
}

function endPractice() {
  running = false;
  $('#practiceBtn').classList.remove('on');
  studio.classList.remove('busy');
}

$('#practiceBtn').onclick = () => {
  if (recorder) return;
  if (running) endPractice();
  else beginTake(false);
};

$('#recordBtn').onclick = () => {
  if (recorder) stopRecording();
  else if (running) { endPractice(); beginTake(true); }
  else beginTake(true);
};

function pickMimeType() {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return candidates.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}

function startRecording() {
  const mimeType = pickMimeType();
  try {
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 10_000_000, audioBitsPerSecond: 128_000 });
  } catch {
    recorder = new MediaRecorder(stream);
  }
  chunks = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  recorder.onstop = onRecordingStopped;
  recorder.start(1000);
  recStart = performance.now();
  $('#recordBtn').classList.add('on');
  $('#recordBtn').setAttribute('aria-label', 'Stop recording');
  $('#timer').hidden = false;
  $('#timer').textContent = '0:00';
  setFormatLocked(true);
}

function stopRecording(discard = false) {
  const r = recorder;
  recorder = null;
  running = false;
  $('#recordBtn').classList.remove('on');
  $('#recordBtn').setAttribute('aria-label', 'Start recording');
  $('#timer').hidden = true;
  studio.classList.remove('busy');
  setFormatLocked(false);
  if (!r) return;
  if (discard) r.onstop = null;
  try { r.stop(); } catch { /* already stopped */ }
  checkOrientation();
}

function onRecordingStopped(e) {
  const type = (e.target.mimeType || pickMimeType() || 'video/webm').split(';')[0];
  takeBlob = new Blob(chunks, { type });
  chunks = [];
  if (takeUrl) URL.revokeObjectURL(takeUrl);
  takeUrl = URL.createObjectURL(takeBlob);
  $('#playback').src = takeUrl;
  const mb = (takeBlob.size / 1048576).toFixed(1);
  $('#reviewMeta').textContent = `${type.includes('mp4') ? 'MP4' : 'WebM'} · ${mb} MB`;
  $('#review').hidden = false;
}

function takeFilename() {
  const s = scripts.find((x) => x.id === currentId);
  const slug = (s ? s.title : 'take').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'take';
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  const ext = takeBlob.type.includes('mp4') ? 'mp4' : 'webm';
  return `${slug}-${settings.format}-${stamp}.${ext}`;
}

function downloadTake() {
  const a = document.createElement('a');
  a.href = takeUrl;
  a.download = takeFilename();
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function closeReview() {
  $('#review').hidden = true;
  $('#playback').pause();
  $('#playback').removeAttribute('src');
  if (takeUrl) URL.revokeObjectURL(takeUrl);
  takeUrl = null;
  takeBlob = null;
}

$('#downloadTake').onclick = downloadTake;
$('#shareTake').onclick = async () => {
  const file = new File([takeBlob], takeFilename(), { type: takeBlob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); } catch (err) { if (err.name !== 'AbortError') downloadTake(); }
  } else downloadTake();
};
$('#discardTake').onclick = () => {
  if (confirm('Discard this take? It hasn\'t been saved.')) closeReview();
};

$('#restart').onclick = () => { offset = 0; velocity = 0; applyOffset(); };
$('#studioBack').onclick = () => history.back();

/* ---------------- Settings ---------------- */

const FORMATS = {
  wpm: (v) => `${v} wpm`,
  fontSize: (v) => `${v} px`,
  sensitivity: (v) => `${v}%`,
  hangover: (v) => `${(v / 1000).toFixed(1)} s`,
};

function applySettingsUI() {
  document.querySelectorAll('.seg').forEach((seg) => {
    const key = seg.dataset.setting;
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.value === settings[key]));
  });
  document.querySelectorAll('input[type=range][data-setting]').forEach((input) => {
    input.value = settings[input.dataset.setting];
  });
  document.querySelectorAll('output[data-for]').forEach((o) => {
    o.textContent = FORMATS[o.dataset.for](settings[o.dataset.for]);
  });
}

function setFormatLocked(locked) {
  document.querySelectorAll('[data-setting=format] button').forEach((b) => { b.disabled = locked; b.style.opacity = locked ? 0.4 : ''; });
}

document.querySelectorAll('.seg').forEach((seg) => {
  seg.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    const key = seg.dataset.setting;
    if (settings[key] === btn.dataset.value) return;
    settings[key] = btn.dataset.value;
    saveSettings();
    applySettingsUI();
    if (key === 'format') {
      try { screen.orientation.unlock(); } catch { /* not supported */ }
      startCamera().then(updateLayout);
    }
    updateLayout();
  });
});

document.querySelectorAll('input[type=range][data-setting]').forEach((input) => {
  input.addEventListener('input', () => {
    settings[input.dataset.setting] = Number(input.value);
    saveSettings();
    applySettingsUI();
    if (input.dataset.setting === 'fontSize') updateLayout();
  });
});

$('#settingsBtn').onclick = () => { applySettingsUI(); $('#settings').hidden = false; };
$('#closeSettings').onclick = () => { $('#settings').hidden = true; };
$('#settings').addEventListener('click', (e) => { if (e.target.id === 'settings') $('#settings').hidden = true; });

/* ---------------- Boot ---------------- */

history.replaceState({ screen: 'library' }, '');
renderLibrary();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
