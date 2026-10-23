'use strict';
// 页面上的 HTML 按钮：声音开关、全屏（顺带锁横屏）。玩法本身全部画在 canvas 里。

document.getElementById('mute').addEventListener('click', () => toggleMute());

const fullBtn = document.getElementById('full');
const root = document.documentElement;
if (!root.requestFullscreen && !root.webkitRequestFullscreen) fullBtn.style.display = 'none';
fullBtn.addEventListener('click', () => {
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    return;
  }
  const p = (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
  if (p && p.then) {
    p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}))
      .catch(() => {});
  }
});
