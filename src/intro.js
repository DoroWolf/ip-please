'use strict';
// 开场动画与拘留押送：黑屏日期打字、红队带走请求、主角走进检查站、拘留时的押送。
// 由 station.js 的 updateDesk 与 render-station.js 的 drawDesk 调用。

// ———————————————————— 开场 ————————————————————
// 黑屏后上方先亮起：主角 clawd 一开场就已经从右侧横线中点向左走（画在道路线之上、检查站之下，进站就被挡住）；
// 左上的红队 clawd 全程待机，两名红队 clawd 守在岔路口左侧上下，不压在路上；开场不播拘捕动画、窗口里也不放请求；
// 下方保持黑屏打字机打日期：打完后黑幕再停 2 秒，等主角完全走进检查站才淡入操作区。开场不可跳过。

const INTRO = { lit: [0.3, 1.0], type: 1.2, cps: 5, walk: [0, 4.9], reveal: [5.0, 5.7], end: 5.7 };
const CLAWD_PX = ['.XXXXXXXXX.', '.XXXXXXXXX.', '.XXEXXXEXX.', '.XXEXXXEXX.', 'XXXXXXXXXXX', '.XXXXXXXXX.'];
const CLAWD_LEGS = [['.X.X...X.X.', '.X.X...X.X.'], ['.X.X...X.X.', 'X.X...X.X..'], ['.X.X...X.X.', '..X.X...X.X']];
const CLAWD_K = 2;   // 11×8 像素图放大两倍
const CLAWD_W = CLAWD_PX[0].length * CLAWD_K;
const CLAWD_STEP_FPS = 4;   // 步频：跟着慢走速度放慢，避免小碎步
// 岔路口（x=512）左侧上下各一名守卫：避开横向道路与分流虚线
const RED_POST = [258, 22], RED_GUARDS = [[479, 40], [479, 76]];
const BOOTH = [309, LANE_Y - 8];   // 检查站正中（clawd 左上角坐标，身体压在线路上）
const START_X = ((GATE[2] + 1 + SPLIT_X) >> 1) - (CLAWD_W >> 1);   // 右侧横线的中点（角色身体居中）
const WALK_PATH = [[START_X, LANE_Y - 8], BOOTH];

const introT = () => now - D.intro;
const introDate = () => { const d = today(); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; };

function endIntro() {
  D.intro = null;
}

function introSounds() {
  const n = Math.floor((introT() - INTRO.type) * INTRO.cps);
  if (n === D.typed || n < 0 || n >= [...introDate()].length) return;
  D.typed = n;
  SFX.key(n);
}

// moving：走路时脚交替
function clawd(x, y, col, moving = false) {
  const legs = moving ? CLAWD_LEGS[[0, 1, 0, 2][Math.floor(now * CLAWD_STEP_FPS) % 4]] : CLAWD_LEGS[0];
  pattern(CLAWD_PX.concat(legs), Math.round(x), Math.round(y), { X: col, E: K.INK }, CLAWD_K);
}

// 折线上按长度匀速走，u 从 0 到 1
function along(pts, u) {
  const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  let d = u * lens.reduce((a, b) => a + b, 0), k = 0;
  while (k < lens.length - 1 && d > lens[k]) { d -= lens[k]; k++; }
  const v = lens[k] ? Math.min(1, d / lens[k]) : 1;
  return [lerp(pts[k][0], pts[k + 1][0], v), lerp(pts[k][1], pts[k + 1][1], v)];
}

function clipPipe() {
  G.save();
  G.beginPath(); G.rect(PIPE[0], PIPE[1], PIPE[2] - PIPE[0] + 1, PIPE[3] - PIPE[1]); G.clip();
}

// 主角 clawd：画在道路 / 分流线之上，检查站之下（走进窗口后被检查站挡住，开场结束后不再画）
function drawClawdsUnder() {
  if (D.intro === null) return;
  const t = introT(), [w0, w1] = INTRO.walk;
  if (t < w0) return;
  clipPipe();
  const [x, y] = along(WALK_PATH, seg(t, w0, w1));
  clawd(x, y, K.CLAUDE, t < w1);
  G.restore();
}

// 拘留动画：左上的红队 clawd 走到检查站左侧，把请求从窗口里拖出来，押着往上带出画面，再从上方走回岗位。
// 岔路口的两名红队 clawd 只是装饰，不参与
const ARREST = { rush: [0, 0.6], grab: [0.6, 0.9], escort: [1.0, 2.0], back: [2.3, 3.3] };
const ARREST_AT = [GATE[0] - 22, LANE_Y - 18];   // 检查站左侧、道路上方（clawd 左上角）
const ARREST_OUT = PIPE[1] - 40;                 // 押出画面上方
function arrestPose(t) {
  const A = ARREST, [px, py] = RED_POST, [ax, ay] = ARREST_AT;
  let x, y, moving = true;
  if (t < A.rush[1]) { const u = smooth(seg(t, ...A.rush)); x = lerp(px, ax, u); y = lerp(py, ay, u); }
  else if (t < A.escort[0]) { x = ax; y = ay; moving = false; }
  else if (t < A.back[0]) { x = ax; y = lerp(ay, ARREST_OUT, seg(t, ...A.escort)); }
  else { x = px; y = lerp(ARREST_OUT, py, seg(t, ...A.back)); moving = t < A.back[1]; }
  // 请求：先从检查站正中被拖到 clawd 脚下，之后跟着 clawd 走
  let pkt = null;
  if (t >= A.grab[0] && t < A.back[0]) {
    const u = seg(t, ...A.grab), hold = [x + 6, y + 21];
    pkt = t < A.grab[1] ? [lerp(((GATE[0] + GATE[2]) >> 1) - 5, hold[0], u), lerp(LANE_Y, hold[1], u)] : hold;
  }
  return { guard: [x, y, moving], pkt };
}

// 检查站上层：红队 clawd。右侧岔路口的两位从第三天起出现，纯装饰；
// 左上那位只在开放拘留（redTeam）时出现、拘留时出动
function drawClawds() {
  const rs = rules();
  if (!rs.redTeam && !rs.redGuards) return;
  clipPipe();
  if (rs.redGuards) for (const [x, y] of RED_GUARDS) clawd(x, y, K.RED);
  if (!rs.redTeam) { G.restore(); return; }
  const t = D.arrest ? now - D.arrest.t0 : Infinity;
  if (t < ARREST.back[1]) {
    const p = arrestPose(t);
    if (p.pkt) {
      const [x, y] = p.pkt.map(Math.round);
      rect(x, y - 4, x + 10, y + 4, Math.floor(now * 6) % 2 ? K.RED_D : K.RED);
      outline(x, y - 4, x + 10, y + 4, K.RED);
    }
    clawd(...p.guard.slice(0, 2), K.RED, p.guard[2]);
  } else clawd(RED_POST[0], RED_POST[1], K.RED);
  G.restore();
}

function drawIntro() {
  const t = introT();
  const lit = 1 - seg(t, ...INTRO.lit), dark = 1 - seg(t, ...INTRO.reveal);
  if (lit > 0) darken(lit, C.INK, [0, 0, W - 1, PIPE[3]]);
  if (dark <= 0) return;
  G.globalAlpha = dark;
  rect(0, PIPE[3] + 1, W - 1, H - 1, K.INK);
  const s = introDate(), n = Math.max(0, Math.floor((t - INTRO.type) * INTRO.cps));
  const x = Math.round(W / 2 - tw(s, 12)), y = 224;
  const shown = [...s].slice(0, n).join('');
  if (shown) bigText(x, y, shown, 12, 2, K.WHITE, null, 'left');
  if (t > INTRO.type - 0.4 && Math.floor(t * 2) % 2 === 0) {
    const cx = x + (shown ? tw(shown, 12) * 2 : 0) + 2;
    rect(cx, y, cx + 9, y + 21, K.CYAN);
  }
  G.globalAlpha = 1;
}
