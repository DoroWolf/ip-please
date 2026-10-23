'use strict';
// 绘图层：调色板、像素图元、像素字、精灵。坐标约定和 pp/base.py 一致（矩形用闭区间）。

const W = 640, H = 360;

const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// —— 调色板：近黑的蓝绿底，青色为主色；绿 = 放行，红 = 拒绝，琥珀 = 警告，Claude 橙 = 你自己 ——
const C = {
  INK: [6, 10, 13], BG: [9, 15, 19], PANEL: [13, 22, 27], PANEL_L: [19, 32, 38],
  LINE: [30, 58, 64], LINE_L: [48, 92, 98], GRID: [14, 26, 30],
  CYAN: [80, 210, 196], CYAN_D: [40, 120, 116], CYAN_L: [160, 240, 228],
  TEXT: [196, 226, 220], DIM: [96, 130, 128], DIM_D: [58, 82, 82],
  GREEN: [88, 214, 130], GREEN_D: [28, 84, 52],
  RED: [255, 92, 92], RED_D: [96, 28, 32],
  AMBER: [240, 180, 80], AMBER_D: [92, 64, 24],
  WHITE: [230, 240, 236],
  CLAUDE: [204, 112, 80], CLAUDE_L: [232, 156, 116],
};
const K = {};
for (const k in C) K[k] = rgb(C[k]);

// —— 当前画布 ——
let G = null;
function setCtx(ctx) { G = ctx; G.imageSmoothingEnabled = false; }

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}

function rect(x0, y0, x1, y1, col) {
  G.fillStyle = col;
  G.fillRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}

function outline(x0, y0, x1, y1, col, w = 1) {
  rect(x0, y0, x1, y0 + w - 1, col);
  rect(x0, y1 - w + 1, x1, y1, col);
  rect(x0, y0, x0 + w - 1, y1, col);
  rect(x1 - w + 1, y0, x1, y1, col);
}

// 切角边框（电子面板的样子）
function frame(x0, y0, x1, y1, col, fill = null) {
  if (fill) { rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, fill); }
  rect(x0 + 3, y0, x1 - 3, y0, col); rect(x0 + 3, y1, x1 - 3, y1, col);
  rect(x0, y0 + 3, x0, y1 - 3, col); rect(x1, y0 + 3, x1, y1 - 3, col);
  for (let i = 1; i < 3; i++) {
    pt(x0 + 3 - i, y0 + i, col); pt(x1 - 3 + i, y0 + i, col);
    pt(x0 + 3 - i, y1 - i, col); pt(x1 - 3 + i, y1 - i, col);
  }
}

function pt(x, y, col) { G.fillStyle = col; G.fillRect(x, y, 1, 1); }

function line(x0, y0, x1, y1, col) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  if (y0 === y1) return rect(Math.min(x0, x1), y0, Math.max(x0, x1), y0, col);
  if (x0 === x1) return rect(x0, Math.min(y0, y1), x0, Math.max(y0, y1), col);
  G.fillStyle = col;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    G.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// 虚线（数据流）：phase 让它动起来
function dashLine(x0, y0, x1, y1, col, phase = 0, on = 3, off = 3) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  G.fillStyle = col;
  for (let i = 0; i <= n; i++) {
    if (((i + Math.floor(phase)) % (on + off) + on + off) % (on + off) >= on) continue;
    G.fillRect(Math.round(lerp(x0, x1, n ? i / n : 0)), Math.round(lerp(y0, y1, n ? i / n : 0)), 1, 1);
  }
}

// 扫描线：每隔一行压暗
function scanlines(x0, y0, x1, y1, alpha = 0.18) {
  G.fillStyle = `rgba(0,0,0,${alpha})`;
  for (let y = y0 + 1; y <= y1; y += 2) G.fillRect(x0, y, x1 - x0 + 1, 1);
}

function pattern(pat, x, y, colors, k = 1) {
  for (let j = 0; j < pat.length; j++) {
    const row = pat[j];
    for (let i = 0; i < row.length; i++) {
      const c = colors[row[i]];
      if (c) { G.fillStyle = c; G.fillRect(x + i * k, y + j * k, k, k); }
    }
  }
}

const CURSOR_PX = [
  'X.........', 'XX........', 'XWX.......', 'XWWX......', 'XWWWX.....', 'XWWWWX....', 'XWWWWWX...',
  'XWWWWWWX..', 'XWWWWWWWX.', 'XWWWWXXXXX', 'XWWXWX....', 'XWX.XWX...', 'XX...XWX..', '......XX..',
];
const HAND_PX = [
  '....XX......', '...XWWX.....', '...XWWX.....', '...XWWXXX...', '...XWWXWWXX.', '.XXXWWXWWXWX',
  'XWWXWWWWWXWX', 'XWWWWWWWWWWX', '.XWWWWWWWWWX', '..XWWWWWWWX.', '...XWWWWWX..', '...XXXXXXX..',
];
const CROSS_PX = ['...X...', '...X...', '.......', 'XX.X.XX', '.......', '...X...', '...X...'];

function drawCursor(x, y, mode) {
  if (mode === 'hand') return pattern(HAND_PX, x - 5, y - 1, { X: K.INK, W: K.CYAN_L });
  if (mode === 'cross') return pattern(CROSS_PX, x - 3, y - 3, { X: K.AMBER });
  pattern(CURSOR_PX, x, y, { X: K.INK, W: K.CYAN_L });
}

// —— 像素字：字形图集（白字），按 (字号, 颜色, 字符串) 缓存上好色的小画布 ——
let FONT_IMG = null, ATLAS_IMG = null;
const FM = window.ASSETS.font;
const PL = 2, PT = 4;
const textCache = new Map();

function tw(s, size = 12) {
  let w = 0;
  for (const ch of s) {
    const g = FM[size][ch];
    w += g ? g[6] : size;
  }
  return w;
}

function textCanvas(s, size, col) {
  const key = size + '|' + col + '|' + s;
  let c = textCache.get(key);
  if (c) return c;
  if (textCache.size > 1500) textCache.clear();
  const w = tw(s, size) + PL * 2 + 2, h = size + PT + 6;
  const [cv, g] = makeCanvas(Math.max(1, w), h);
  let x = PL;
  for (const ch of s) {
    const gl = FM[size][ch];
    if (!gl) { x += size; continue; }
    if (gl[2] > 0) g.drawImage(FONT_IMG, gl[0], gl[1], gl[2], gl[3], x + gl[4], PT + gl[5], gl[2], gl[3]);
    x += gl[6];
  }
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = col;
  g.fillRect(0, 0, cv.width, cv.height);
  textCache.set(key, cv);
  return cv;
}

// anchor: 'la' 左对齐，'ma' 居中，'ra' 右对齐；y 是字形的视觉顶边；n = 只画前 n 个字（打字机）
function txt(x, y, s, size = 12, col = K.TEXT, anchor = 'la', n = null) {
  s = String(s);
  if (!s) return;
  const c = textCanvas(s, size, col);
  const w = tw(s, size);
  if (anchor === 'ma') x = Math.round(x - w / 2);
  else if (anchor === 'ra') x = x - w;
  if (n !== null) {
    if (n <= 0) return;
    const part = tw([...s].slice(0, n).join(''), size);
    G.drawImage(c, 0, 0, PL + part, c.height, x - PL, y - PT, PL + part, c.height);
    return;
  }
  G.drawImage(c, x - PL, y - PT);
}

// 放大 k 倍的像素字（整块像素）
function bigText(x, y, s, size, k, col, shadow = null, align = 'center') {
  const w = tw(s, size) * k;
  if (align === 'center') x = Math.round(x - w / 2);
  else if (align === 'right') x -= w;
  const draw1 = (cc, dx, dy) => {
    const c = textCanvas(s, size, cc);
    G.drawImage(c, 0, 0, c.width, c.height, dx - PL * k, dy - PT * k, c.width * k, c.height * k);
  };
  if (shadow) draw1(shadow, x + k, y + k);
  draw1(col, x, y);
  return [w, size * k];
}

// 逐字折行
function wrap(s, size, width) {
  const lines = [];
  let cur = '';
  for (const ch of s) {
    if (ch === '\n') { lines.push(cur); cur = ''; continue; }
    if (cur && tw(cur + ch, size) > width) { lines.push(cur); cur = ch.trim(); } else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}

// —— 精灵 ——
const SPR = window.ASSETS.sprites;

function spr(key, x, y, k = 1) {
  const s = SPR[key];
  if (!s) return false;
  G.drawImage(ATLAS_IMG, s[0], s[1], s[2], s[3], x + s[4] * k, y + s[5] * k, s[2] * k, s[3] * k);
  return true;
}

// 把一块区域往某个颜色压暗
function darken(alpha, col = C.INK, box = null) {
  G.fillStyle = rgba(col, alpha);
  if (box) G.fillRect(box[0], box[1], box[2] - box[0] + 1, box[3] - box[1] + 1);
  else G.fillRect(0, 0, W, H);
}

function loadImages() {
  const load = (src) => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
  const A = window.ASSET_IMAGES;
  return Promise.all([load(A.font), load(A.atlas)]).then(([f, a]) => { FONT_IMG = f; ATLAS_IMG = a; });
}

// —— 缓动 ——
const clamp = (u) => Math.max(0, Math.min(1, u));
const seg = (t, t0, t1) => (t1 > t0 ? clamp((t - t0) / (t1 - t0)) : +(t >= t1));
const smooth = (u) => u * u * (3 - 2 * u);
const easeOut = (u) => 1 - (1 - u) ** 3;
const lerp = (a, b, u) => a + (b - a) * u;
const inBox = (x, y, b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
const center = (b) => [Math.floor((b[0] + b[2]) / 2), Math.floor((b[1] + b[3]) / 2)];

// 按钮：hover 时提亮；off = 不可用
function button(box, label, col, { off = false, size = 10, hot = false } = {}) {
  const hover = !off && ptr.mouse && inBox(ptr.x, ptr.y, box);
  const c = off ? K.DIM_D : col;
  frame(...box, c, hover || hot ? rgba(off ? C.DIM_D : parseRgb(col), 0.28) : K.PANEL);
  txt(center(box)[0], Math.round((box[1] + box[3]) / 2 - size / 2) + 1, label, size, off ? K.DIM_D : hover ? K.WHITE : c, 'ma');
}

const parseRgb = (s) => s.match(/\d+/g).slice(0, 3).map(Number);

const mmss = (sec) => {
  sec = Math.max(0, Math.ceil(sec));
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
};
