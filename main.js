'use strict';
// 场景切换、输入分发、主循环。

function go(name) {
  scene = name; sceneT0 = now;
  lastKey = -1;
  if (name !== 'title' && titleMusic) { SFX.stop(titleMusic); titleMusic = null; }
  SFX.ambient(name === 'desk');
  if (name === 'title') titleMusic = SFX.play('title', 0.6);
  if (name === 'daycard') SFX.play('day_hit');
  if (name === 'summary') { SFX.play('sad', 0.8); initSummary(); }
  if (name === 'result') SFX.play(RUN.fail ? 'sad' : 'end', 0.8);
  if (name === 'desk') startShift();
}

// 黑屏转场：先压黑，再切场景
let fade = null;
// 标题画面的一次性背景音乐：进入游戏后要停掉
let titleMusic = null;
function fadeGo(name, dur = 0.45) {
  if (!fade) fade = { t0: now, to: name, dur };
}

// ———————————————————— 输入 ————————————————————

function toGame(ev) {
  const r = canvasEl.getBoundingClientRect();
  return [Math.floor((ev.clientX - r.left) * W / r.width), Math.floor((ev.clientY - r.top) * H / r.height)];
}

function onDown(ev) {
  SFX.init();
  const [x, y] = toGame(ev);
  Object.assign(ptr, { x, y, down: true, mouse: ev.pointerType === 'mouse' });
  if (canvasEl.setPointerCapture) canvasEl.setPointerCapture(ev.pointerId);
  ev.preventDefault();
  if (fade) return;
  if (scene === 'desk') deskDown(x, y);
  else sceneClick(x, y);
}

function onMove(ev) {
  const [x, y] = toGame(ev);
  Object.assign(ptr, { x, y, mouse: ev.pointerType === 'mouse' });
  if (scene === 'desk') deskMove(x, y);
}

function onUp(ev) {
  const [x, y] = toGame(ev);
  Object.assign(ptr, { x, y, down: false });
  if (scene === 'desk') deskUp(x, y);
}

function onKey(e) {
  const k = e.key.toLowerCase();
  if (k === 'm') { toggleMute(); return; }
  if (fade) return;
  if (scene === 'desk') { if (k === ' ') e.preventDefault(); deskKey(k); }
}

function sceneClick(x, y) {
  if (scene === 'boot') { go('title'); return; }
  if (scene === 'title') { titleClick(x, y); return; }
  if (scene === 'daycard' && st() > 0.8) { fadeGo('desk'); return; }
  if (scene === 'summary') { summaryClick(x, y); return; }
  if (scene === 'result') resultClick(x, y);
}

// ———————————————————— 主循环 ————————————————————

function update() {
  if (fade && now - fade.t0 >= fade.dur) { const to = fade.to; fade = null; go(to); }
  if (scene === 'desk') updateDesk();
  if (scene === 'boot') { bootSounds(); if (BOOT_LINES && st() > BOOT_LINES.end) go('title'); }
}

function render() {
  setCtx(F.getContext('2d'));
  const t = st();
  if (scene === 'boot') drawBoot();
  else if (scene === 'title') drawTitle(t);
  else if (scene === 'daycard') drawDayCard(t);
  else if (scene === 'desk') drawDesk();
  else if (scene === 'summary') drawSummary(t);
  else if (scene === 'result') drawResult(t);
  if (fade) darken(seg(now, fade.t0, fade.t0 + fade.dur));

  const g = canvasEl.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = K.INK; g.fillRect(0, 0, W, H);
  g.drawImage(F, 0, 0);
  if (ptr.mouse) {
    setCtx(g);
    let cursor = drag ? 'hand' : 'arrow';
    if (scene === 'desk' && D && D.insp.on && inBox(ptr.x, ptr.y, LOWER)) cursor = 'cross';
    drawCursor(ptr.x, ptr.y, cursor);
  }
}

function loop(ts) {
  now = ts / 1000;
  update();
  render();
  requestAnimationFrame(loop);
}

function fit() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  canvasEl.style.width = `${Math.floor(W * s)}px`;
  canvasEl.style.height = `${Math.floor(H * s)}px`;
}

function toggleMute() {
  SFX.init();
  SFX.toggleMute();
  updateMuteLabel();
}

function updateMuteLabel() {
  const b = document.getElementById('mute');
  if (b) b.textContent = SFX.muted ? '声音：关' : '声音：开';
}

function boot() {
  canvasEl = document.getElementById('game');
  canvasEl.width = W; canvasEl.height = H;
  [F] = makeCanvas(W, H);
  fit();
  window.addEventListener('resize', fit);
  canvasEl.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  canvasEl.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', onKey);
  loadImages().then(() => { sceneT0 = performance.now() / 1000; requestAnimationFrame(loop); });
}

window.addEventListener('DOMContentLoaded', boot);
