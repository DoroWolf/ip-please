'use strict';
// 场景切换、输入分发、主循环。

function go(name) {
  scene = name; sceneT0 = now;
  lastKey = -1;
  sceneMusic();
  SFX.ambient(name === 'desk');
  if (name === 'daycard') SFX.play('day_hit');
  if (name === 'news') SFX.play('whoosh');
  if (name === 'summary') initSummary();
  if (name === 'desk') startShift();
}

// 场景配乐：同一时间只播一首，换场时由 SFX 淡出旧曲 / 淡入新曲（不会硬切）。
// 三种无尽模式的结算统一用结束曲，不播坏结局的曲子；故事模式的停机才播 sad。
function sceneMusic() {
  if (scene === 'title') SFX.music('title', 0.6);
  else if (scene === 'summary') SFX.music('sad', 0.8);
  else if (scene === 'result') SFX.music(RUN.mode === 'story' && RUN.fail ? 'sad' : 'end', 0.8);
  else SFX.stopMusic();
}

// 黑屏转场：先压黑，再切场景；inDur > 0 时切完从全黑淡回来
let fade = null;
function fadeGo(name, dur = 0.45, inDur = 0) {
  if (!fade) fade = { t0: now, to: name, dur, inDur };
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
  if (scene === 'desk') {
    if (D && D.paused) pauseClick(x, y);
    else deskDown(x, y);
  } else sceneClick(x, y);
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
  if (scene === 'desk') {
    if (k === 'escape') { e.preventDefault(); togglePause(); return; }
    // Tab / Enter 是印章台快捷键：挡掉浏览器的焦点切换 / 按钮触发
    if (k === 'tab' || k === 'enter') e.preventDefault();
    if (D && D.paused) return;
    deskKey(k);
  }
}

function sceneClick(x, y) {
  if (scene === 'boot') { go('title'); return; }
  if (scene === 'title') { titleClick(x, y); return; }
  if (scene === 'daycard' && st() > 0.8) { fadeGo('news'); return; }
  if (scene === 'news' && st() > 0.8) { fadeGo('desk'); return; }
  if (scene === 'summary') { summaryClick(x, y); return; }
  if (scene === 'result') resultClick(x, y);
}

// ———————————————————— 主循环 ————————————————————

function update() {
  if (fade) {
    if (fade.to && now - fade.t0 >= fade.dur) {
      const to = fade.to;
      fade = { t0: now, to: null, dur: 0, inDur: fade.inDur };   // 切完场景，从全黑淡入
      go(to);
    } else if (!fade.to && now - fade.t0 >= fade.inDur) fade = null;
  }
  if (scene === 'desk') updateDesk();
  if (scene === 'boot') { bootSounds(); if (BOOT_LINES && st() > BOOT_LINES.end) go('title'); }
}

function render() {
  setCtx(F.getContext('2d'));
  const t = st();
  if (scene === 'boot') drawBoot();
  else if (scene === 'title') drawTitle(t);
  else if (scene === 'daycard') drawDayCard(t);
  else if (scene === 'news') drawNews(t);
  else if (scene === 'desk') drawDesk();
  else if (scene === 'summary') drawSummary(t);
  else if (scene === 'result') drawResult(t);
  if (fade) darken(fade.to ? seg(now, fade.t0, fade.t0 + fade.dur) : 1 - seg(now, fade.t0, fade.t0 + fade.inDur));

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
