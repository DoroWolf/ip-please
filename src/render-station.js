'use strict';
// 检查站绘制：HUD、请求排队管线、审查窗、桌面窗口、任务栏、右侧决定栏、审查压暗、横幅与提示。
// 只读 station.js / desk.js 的状态，不改判定逻辑；开场动画在 intro.js。

// ———————————————————— 绘制 ————————————————————

function drawDesk() {
  rect(0, 0, W - 1, H - 1, K.INK);
  drawHud();
  drawPipe();
  drawReview();
  drawScreen();
  if (D.insp.on) drawInspect();
  if (!drawBanner()) drawToast();
  if (drag && drag.type === 'icon' && drag.moved) docIcon(drag.inst.dx - 8, drag.inst.dy - 6, true);
  if (drag && drag.type === 'win' && drag.inst.out && (drag.inst.kind === 'doc' || drag.inst.kind === 'smsf')) docIcon(ptr.x - 8, ptr.y - 6, true);
  if (D.intro !== null) drawIntro();
  scanlines(0, 0, W - 1, H - 1, 0.12);
  if (D.paused) drawPause();
}

// 暂停界面：只有继续和主菜单两个按钮
function drawPause() {
  darken(0.72);
  const [x0, y0, x1, y1] = PAUSE.panel;
  frame(x0, y0, x1, y1, K.CYAN_L, K.INK);
  bigText(W / 2, y0 + 14, '暂停', 12, 2, K.WHITE);
  button(PAUSE.resume, '继续', K.CYAN, { size: 12 });
  button(PAUSE.menu, '主菜单', K.DIM, { size: 12 });
}

function drawHud() {
  rect(...HUD, K.PANEL);
  rect(0, 13, W - 1, 13, K.LINE);
  txt(6, 3, 'IP, PLEASE', 8, K.CLAUDE_L);
  txt(62, 3, RUN.mode === 'story' ? `· ${mode().name}` : `无尽 - ${mode().name}`, 8, K.CYAN);
  const parts = [];
  if (RUN.mode === 'timed') parts.push([`剩余 ${mmss(timeLeft())}`, timeLeft() < 60 ? K.RED : K.WHITE], [`已审核 ${RUN.processed}`, K.GREEN]);
  if (RUN.mode === 'perfect') parts.push([`用时 ${mmss(elapsed())}`, K.WHITE], [`得分 ${RUN.score}`, K.GREEN]);
  if (RUN.mode === 'story') parts.push([`DAY ${RUN.day}`, K.WHITE]);
  if (RUN.mode === 'endure') {
    parts.push([`用时 ${mmss(elapsed())}`, K.WHITE],
      [`Token ${RUN.score}`, RUN.score < 0 ? K.RED : K.GREEN]);
  }
  let x = W - 96;   // 右上角留给页面上的“声音 / 全屏”按钮
  for (const [s, col] of parts.reverse()) { txt(x, 3, s, 8, col, 'ra'); x -= tw(s, 8) + 14; }
}

// —— 上方：请求在风控检查站前排队 ——
function drawPipe() {
  rect(...PIPE, K.BG);
  for (let x = 0; x < W; x += 16) rect(x, PIPE[1], x, PIPE[3], K.GRID);
  for (let y = PIPE[1] + 8; y < PIPE[3]; y += 16) rect(0, y, W - 1, y, K.GRID);
  rect(0, PIPE[3], W - 1, PIPE[3], K.LINE);
  const flow = D.started && !D.closing ? -now * 12 : 0;
  dashLine(0, LANE_Y, GATE[0] - 1, LANE_Y, K.LINE, flow);
  // 队首在最靠近检查站的位置，后面一直排到画面外
  D.queue.forEach((p, i) => {
    if (i >= QUEUE_SLOTS) return;
    const tx = GATE[0] - 14 - i * QUEUE_GAP;
    const u = p.t < 0 ? 1 : easeOut(seg(now, p.t, p.t + 1.2));
    let x = Math.round(lerp(-10, tx, u)), y = LANE_Y, a = 1;
    if (p.leave) {   // 下班：离开队伍，往下淡出
      const v = smooth(seg(now, p.leave, p.leave + 1.2));
      y = Math.round(LANE_Y + v * 30); x -= Math.round(v * 20); a = 1 - v;
      if (a <= 0) return;
    }
    rect(x, y - 3, x + 7, y + 3, rgba(p.col.map((c) => c * 0.35), a));
    outline(x, y - 3, x + 7, y + 3, rgba(p.col, a));
  });
  // 防火墙：沿检查站中轴上下贯通画实线，窗口就是墙上唯一的开口
  const [gx0, gy0, gx1, gy1] = GATE;
  const wx = (gx0 + gx1) >> 1;
  line(wx, PIPE[1], wx, gy0 - 1, K.CYAN_D);
  line(wx, gy1 + 1, wx, PIPE[3], K.CYAN_D);
  // 出口：绿色向上 = 放行，红色向下 = 拒绝（直接通到上下边界，不显示去向和数量）
  const bx = SPLIT_X;
  line(gx1 + 1, LANE_Y, bx, LANE_Y, K.LINE);
  line(bx, PIPE[1], bx, PIPE[3], K.LINE);
  dashLine(bx, LANE_Y, bx, PIPE[1], K.GREEN, flow);
  dashLine(bx, LANE_Y, bx, PIPE[3], K.RED, flow);
  D.flows = D.flows.filter((f) => now - f.t0 < 1.2);
  for (const f of D.flows) {
    const u = (now - f.t0) / 1.2;
    const ty = f.kind === 'approve' ? PIPE[1] : PIPE[3];
    const pts = [[gx1, LANE_Y], [bx, LANE_Y], [bx, ty]];
    const segs = [bx - gx1, Math.abs(ty - LANE_Y)];
    let d = u * (segs[0] + segs[1]), k = 0;
    while (k < 1 && d > segs[k]) { d -= segs[k]; k++; }
    const p = pts[k], q = pts[k + 1], v = segs[k] ? Math.min(1, d / segs[k]) : 1;
    const x = Math.round(lerp(p[0], q[0], v)), y = Math.round(lerp(p[1], q[1], v));
    rect(x - 3, y - 3, x + 3, y + 3, f.kind === 'approve' ? K.GREEN : K.RED);
  }
  // 图层顺序：网格 / 队列 / 道路线 / 分流线 → 主角 clawd（压在线路上）→ 检查站（压住主角）
  drawClawdsUnder();
  // 检查站
  frame(gx0, gy0, gx1, gy1, K.CLAUDE, K.PANEL);
  if (D.started) {
    const sy = gy0 + 3 + Math.floor((now * 40) % (gy1 - gy0 - 6));
    rect(gx0 + 2, sy, gx1 - 2, sy, rgba(C.CLAUDE_L, 0.5));
  }
  const e = D.ent;
  if (e && !e.leaving) {
    const u = easeOut(seg(now, D.gateT, D.gateT + 0.4));
    const x = Math.round(lerp(gx0 - 14, ((gx0 + gx1) >> 1) - 5, u));
    rect(x, LANE_Y - 4, x + 10, LANE_Y + 4, Math.floor(now * 3) % 2 ? K.AMBER_D : K.PANEL_L);
    outline(x, LANE_Y - 4, x + 10, LANE_Y + 4, K.AMBER);
  }
  drawClawds();
}

// —— 左下：审查窗 ——
// 柜台图标下的短名：证件名太长的换成简称（图标间距只有 32px）
const ICON_LABELS = { api: 'API', return: '返回票', env: '环境卡', ent: '企业' };
function drawReview() {
  const [x0, y0, x1, y1] = REVIEW;
  rect(x0, y0, x1, y1, K.BG);
  frame(x0 + 2, y0 + 2, x1 - 2, y1 - 2, K.LINE_L);
  const [ax, ay] = AVATAR_XY, as = 22 * AVATAR_K;
  frame(ax - 2, ay - 2, ax + as + 1, ay + as + 1, K.CYAN_D, K.INK);
  const e = D.ent;
  if (e) drawAvatar(e, ax, ay, as);
  else {
    for (let i = 0; i < 60; i++) {
      const nx = ax + ((i * 37 + Math.floor(now * 9) * 13) % as), ny = ay + ((i * 53 + Math.floor(now * 9) * 7) % as);
      rect(nx, ny, nx + 1, ny, K.DIM_D);
    }
    txt(ax + as / 2, ay + as / 2 - 4, Math.floor(now * 2) % 2 ? '等待连接_' : '等待连接', 8, K.DIM, 'ma');
  }
  // 做出决定后：头像处闪框，提示把证件拖回来
  if (e && e.decided && !e.leaving) outline(ax - 2, ay - 2, ax + as + 1, ay + as + 1, Math.floor(now * 3) % 2 ? K.AMBER : K.CYAN_D);
  // 接入者信息
  const ready = avatarReady(e);
  const s = e && e.spec;
  [['IP', s && s.ip], ['昵称', s && s.handle], ['类型', s && s.typeLabel]].forEach(([k, v], i) => {
    txt(RV_X, 138 + i * 12, k, 8, ready ? K.DIM : K.DIM_D);
    txt(RV_X + 24, 138 + i * 12, ready ? v : '—', 8, ready ? K.TEXT : K.DIM_D);
  });
  // 请求摘要不画在这里：它印在令牌上，没有令牌就看不到
  // 对话：最近三句
  rect(x0 + 8, 232, x1 - 8, 232, K.LINE);
  const lines = D.lines.slice(-3);
  lines.forEach((ln, i) => {
    const y = 240 + i * 26;
    const who = ln.who === 'C' ? 'CLAUDE' : ln.ent ? ln.ent.spec.handle : '';
    txt(x0 + 10, y, who, 8, ln.who === 'C' ? K.CLAUDE_L : K.CYAN);
    wrap(ln.text, 10, x1 - x0 - 24).slice(0, 1).forEach((t) => txt(x0 + 12, y + 10, t, 10, i === lines.length - 1 ? K.WHITE : K.DIM));
  });
  rect(x0 + 8, 316, x1 - 8, 316, K.LINE);
  // 柜台：下一位 / 验证SMS / 拘留共用一个按钮。措施要先询问异常才解锁，按下后锁定
  const canCall = !e && !D.closing && !D.over && !D.ended;
  const smsOk = canSmsNow(e), suspendOk = canSuspendNow(e);
  if (measureArmed(e) && (smsOk || suspendOk)) {
    if (smsOk) button(NEXT_BTN, '验证SMS', K.GREEN, { size: 8, hot: Math.floor(now * 2) % 2 === 0 });
    else button(NEXT_BTN, '拘留', K.RED, { hot: Math.floor(now * 3) % 2 === 0 });
  } else if (e && !e.leaving && (e.measureUsed || smsOk || suspendOk)) {
    if (e.measureUsed || smsOk) button(NEXT_BTN, '验证SMS', K.GREEN, { size: 8, off: true });
    else button(NEXT_BTN, '拘留', K.RED, { off: true });
  } else button(NEXT_BTN, '下一位', K.CYAN, { off: !canCall, hot: canCall && !D.hinted.next && Math.floor(now * 2) % 2 === 0 });
  // 柜台上的证件：多了就左右滚动；绘制裁在柜台内，左右边缘放滚动箭头
  clipCounter();
  for (const ic of D.icons) {
    if (drag && drag.inst === ic && drag.moved) continue;
    const on = ptr.mouse && inBox(ptr.x, ptr.y, iconBox(ic)) && inBox(ptr.x, ptr.y, COUNTER_BOX);
    docIcon(ic.x, ic.y, on);
    txt(ic.x + 13, ic.y + 22, ICON_LABELS[ic.win.key] || ic.win.title, 8, K.DIM, 'ma');
  }
  drawCounterArrows();
  G.restore();
}

function clipCounter() {
  G.save();
  G.beginPath();
  G.rect(COUNTER_BOX[0], COUNTER_BOX[1], COUNTER_BOX[2] - COUNTER_BOX[0] + 1, COUNTER_BOX[3] - COUNTER_BOX[1] + 1);
  G.clip();
}

// 柜台左右边缘的滚动箭头：指针贴到哪边，哪边的箭头亮起（同时自动滚动）
function drawCounterArrows() {
  const max = iconMaxScroll();
  if (!max) return;
  const y = ICON_Y + 4;
  const onY = ptr.y >= COUNTER_BOX[1] && ptr.y <= COUNTER_BOX[3];
  const onL = onY && ptr.x >= COUNTER_BOX[0] && ptr.x <= COUNTER_BOX[0] + COUNTER_EDGE;
  const onR = onY && ptr.x >= COUNTER_BOX[2] - COUNTER_EDGE && ptr.x <= COUNTER_BOX[2];
  if (D.iconScroll > 0) {
    rect(COUNTER_BOX[0], COUNTER_BOX[1], COUNTER_BOX[0] + 6, COUNTER_BOX[3], K.BG);
    txt(COUNTER_BOX[0] + 1, y, '◀', 8, onL ? K.AMBER : K.CYAN);
  }
  if (D.iconScroll < max) {
    rect(COUNTER_BOX[2] - 6, COUNTER_BOX[1], COUNTER_BOX[2], COUNTER_BOX[3], K.BG);
    txt(COUNTER_BOX[2] - 1, y, '▶', 8, onR ? K.AMBER : K.CYAN, 'ra');
  }
}

// 头像：接入时自上而下“加载”，离开时被噪点吞掉
function drawAvatar(e, x, y, s) {
  const k = mode().pace;
  const u = seg(now, e.t0 + 0.15 * k, e.t0 + 0.55 * k);
  const out = e.leaving ? seg(now, e.tLeave, e.tLeave + 0.5) : 0;
  const rows = Math.floor(22 * u * (1 - out));
  G.save();
  G.beginPath(); G.rect(x, y, s, rows * AVATAR_K); G.clip();
  spr(e.spec.avatar, x, y, AVATAR_K);
  G.restore();
  if (rows < 22) {
    for (let i = 0; i < 22; i++) {
      const by = y + rows * AVATAR_K + ((i * 7 + Math.floor(now * 20)) % Math.max(1, (22 - rows))) * AVATAR_K;
      const bx = x + ((i * 11 + Math.floor(now * 20) * 5) % 22) * AVATAR_K;
      if (by < y + s) rect(bx, by, bx + AVATAR_K - 1, by + AVATAR_K - 1, K.DIM_D);
    }
  }
  scanlines(x, y, x + s - 1, y + s - 1, 0.25);
  if (e.decided === 'suspend' && e.leaving) {
    const a = seg(now, e.tLeave, e.tLeave + 0.2);
    rect(x, y + s / 2 - 12, x + Math.round((s - 1) * a), y + s / 2 + 11, K.RED_D);
    if (a >= 1) {
      txt(x + s / 2, y + s / 2 - 9, '连接已切断', 8, K.WHITE, 'ma');
      txt(x + s / 2, y + s / 2 + 1, '已拘留', 8, Math.floor(now * 4) % 2 ? K.RED : K.WHITE, 'ma');
    }
  }
}

// —— 右下：电脑桌面 ——
function clipScreen() {
  G.save();
  G.beginPath(); G.rect(SCREEN[0] + 1, SCREEN[1], SCREEN[2] - SCREEN[0], TASKBAR[1] - SCREEN[1]); G.clip();
}

// 正在拖的窗口最后画（盖在决定栏上面，拖去盖章时看得见）
const draggingWin = () => (drag && drag.type === 'win' && drag.moved && !drag.inst.out ? drag.inst : null);

function drawWins(only = null) {
  clipScreen();
  for (const w of only ? [only] : shownWins()) if (!w.out && (only || w !== draggingWin())) w.win.draw(w.x, w.y);
  G.restore();
}

function drawScreen() {
  const [x0, y0, x1, y1] = SCREEN;
  rect(x0, y0, x1, y1, K.BG);
  for (let x = x0 + 8; x < x1; x += 16) for (let y = y0 + 8; y < TASKBAR[1]; y += 16) pt(x, y, K.LINE);
  txt((x0 + x1) >> 1, 236, 'H-0417  RISK CONTROL TERMINAL', 8, K.GRID, 'ma');
  rect(x0, y0, x0, y1, K.LINE);
  drawAppIcons();
  drawWins();
  if (D.wins.some((w) => w.kind === 'doc')) D.hinted.drag = true;
  const e = D.ent;
  drawTaskbar();
  drawTray();
  if (draggingWin()) drawWins(draggingWin());
}

// 这一班桌面上有的应用：规则组没有『审查』时不显示它
const appKeys = () => Object.keys(APPS).filter((k) => k !== 'insp' || rules().inspect);

function drawAppIcons() {
  const hov = (b) => ptr.mouse && inBox(ptr.x, ptr.y, b);
  const stale = RUN.mode === 'story' && RUN.stale > 0;
  for (const k of appKeys()) {
    const label = APPS[k], b = APP_BOX[k];
    const on = k === 'insp' ? D.insp.on : D.wins.some((w) => w.kind === k && !w.min);
    const off = k === 'insp' && stale;
    appIcon(b[0], b[1], k, hov(b), on, off);
    txt(center(b)[0], b[3] + 3, label, 8, off ? K.DIM_D : on ? (k === 'insp' ? K.AMBER : K.TEXT) : K.DIM, 'ma');
  }
}

// 任务栏：每个桌面窗口一个按钮（色块 + 名字）
const TASK_COL = { doc: C.CYAN, cite: C.RED, book: C.CLAUDE, notice: C.CLAUDE, hist: C.CYAN, smsf: C.GREEN, sms: C.GREEN };
// 任务栏右下角的日期：故事模式再加班次时间；审查模式只圈日期本身，不圈后面显示用的时间
function dateBox() {
  const date = fmtDate(today());
  const clock = RUN.mode === 'story' ? tw(`  ${worldClock()}`, 8) : 0;
  const right = DATE_BOX[2] - clock;
  return [right - tw(date, 8) - 2, DATE_BOX[1], right + 2, DATE_BOX[3]];
}
function drawTaskbar() {
  rect(...TASKBAR, K.PANEL);
  rect(TASKBAR[0], TASKBAR[1], TASKBAR[2], TASKBAR[1], K.LINE_L);
  const top = topWin();
  for (const { w, box } of taskButtons()) {
    const col = w.win.tone ? (w.win.tone === 'red' ? C.RED : C.AMBER) : TASK_COL[w.kind];
    const hover = ptr.mouse && inBox(ptr.x, ptr.y, box);
    frame(...box, rgb(w.min ? C.DIM_D : col), w === top ? rgba(col, 0.28) : hover ? K.PANEL_L : K.INK);
    rect(box[0] + 3, box[1] + 3, box[0] + 5, box[3] - 3, rgb(col));
    let s = w.win.title;
    while (s && tw(s, 8) > box[2] - box[0] - 11) s = s.slice(0, -1);
    if (s) txt(box[0] + 9, box[1] + 2, s, 8, w.min ? K.DIM : K.TEXT);
  }
  // 世界观时间只在故事模式显示；日期都要显示（核对有效期）
  const date = fmtDate(today());
  if (RUN.mode === 'story') {
    const clock = worldClock();
    // 下班前一小时：时间在黄白之间闪烁，日期保持原色
    const col = lastHour() ? (Math.floor(now * 3) % 2 ? K.WHITE : K.AMBER) : K.TEXT;
    txt(DATE_BOX[2] - tw(`  ${clock}`, 8), DATE_BOX[1] + 2, date, 8, K.TEXT, 'ra');
    txt(DATE_BOX[2], DATE_BOX[1] + 2, clock, 8, col, 'ra');
  } else {
    txt(DATE_BOX[2], DATE_BOX[1] + 2, date, 8, K.TEXT, 'ra');
  }
}

// 决定栏：收起时只在右边缘露出把手
function drawTray() {
  updateTray();
  const dx = Math.round((1 - easeOut(D.tray.u)) * TRAY_W);
  const [bx0, by0, bx1, by1] = TRAY_BOX;
  clipScreen();
  frame(bx0 + dx - 5, 196, bx0 + dx, 228, K.LINE_L, K.PANEL_L);
  for (const yy of [206, 211, 216]) rect(bx0 + dx - 3, yy, bx0 + dx - 2, yy + 1, K.DIM);
  if (D.tray.u > 0) {
    frame(bx0 + dx, by0, bx1 + dx + 4, by1, K.LINE_L, K.PANEL);
    const win = draggedWin();
    const holding = win && isStampDoc(win) && D.ent && D.ent.spec.docs.includes(win) && !D.ent.leaving;
    for (const [k, b] of Object.entries(STAMP_ZONES)) {
      const [col, colD] = k === 'approve' ? [C.GREEN, C.GREEN_D] : [C.RED, C.RED_D];
      const over = holding && inBox(ptr.x, ptr.y, b);
      frame(b[0] + dx, b[1], b[2] + dx, b[3], rgb(col), over ? rgba(col, 0.35) : rgba(colD, holding ? 0.8 : 0.45));
      const cx = ((b[0] + b[2]) >> 1) + dx;
      txt(cx, b[1] + 13, k === 'approve' ? '放行' : '拒绝', 12, rgb(col), 'ma');
      txt(cx, b[1] + 31, k === 'approve' ? 'APPROVE' : 'DENY', 8, K.DIM, 'ma');
    }
  }
  G.restore();
}

// 审查模式：整个下方压暗，只留下可点的栏位（和『审查』图标）
let OVERLAY = null;
function drawInspect() {
  const sel = D.insp.sel.map((s) => s.key);
  const hover = fieldAt(ptr.x, ptr.y);
  const view = [SCREEN[0] + 1, SCREEN[1], SCREEN[2], TASKBAR[1] - 1];
  const vis = fieldBoxes().filter((f) => !f.w || topWinAt(center(f.box)) === f.w || sel.includes(f.key));
  // 历史记录整扇窗保持明亮：审查时还要能读当前这段对话
  const hist = shownWins().filter((w) => w.kind === 'hist').map((w) => {
    const b = winBox(w);
    return [Math.max(b[0], view[0]), Math.max(b[1], view[1]), Math.min(b[2], view[2]), Math.min(b[3], view[3])];
  }).filter((b) => b[2] >= b[0] && b[3] >= b[1]);
  const holes = vis.map((f) => (f.w ? [Math.max(f.box[0], view[0]), Math.max(f.box[1], view[1]), Math.min(f.box[2], view[2]), Math.min(f.box[3], view[3])] : f.box))
    .filter((b) => b[2] >= b[0] && b[3] >= b[1]).concat(hist, [INSPECT_ICON], canSuspendNow(D.ent) ? [NEXT_BTN] : []);
  if (!OVERLAY) OVERLAY = makeCanvas(W, H);
  const [oc, og] = OVERLAY;
  og.clearRect(0, 0, W, H);
  og.fillStyle = rgba(C.INK, 0.62);
  og.fillRect(LOWER[0], LOWER[1], LOWER[2] - LOWER[0] + 1, LOWER[3] - LOWER[1] + 1);
  for (const b of holes) og.clearRect(b[0], b[1], b[2] - b[0] + 1, b[3] - b[1] + 1);
  G.drawImage(oc, 0, 0);
  const mark = (f) => outline(...f.box, sel.includes(f.key) ? K.AMBER : hover && hover.key === f.key ? K.CYAN_L : rgba(C.AMBER, 0.35));
  clipScreen();
  for (const f of vis) if (f.w) mark(f);
  G.restore();
  for (const f of vis) if (!f.w) mark(f);
  if (D.insp.sel.length === 2) {
    const [a, b] = D.insp.sel.map((s) => center(s.box));
    line(a[0], a[1], b[0], b[1], K.AMBER);
  }
  txt(SCREEN[0] + 6, TASKBAR[1] - 12, '点击不符事项', 8, K.AMBER);
}

function topWinAt([x, y]) {
  for (const w of shownWins().reverse()) if (inBox(x, y, winBox(w))) return w;
  return null;
}

function drawBanner() {
  const b = D.insp.banner;
  if (!b || (b.kind !== 'bad' && now - b.t > 1.6)) return false;
  const col = b.kind === 'bad' ? K.RED : b.kind === 'ok' ? K.GREEN : K.DIM;
  frame(...BANNER_BOX, col, K.INK);
  txt(BANNER_BOX[0] + 8, BANNER_BOX[1] + 4, b.title, 10, col);
  txt(BANNER_BOX[0] + 8, BANNER_BOX[1] + 17, b.sub, 8, K.TEXT);
  const e = D.ent;
  if (b.ok && e && !e.leaving) {
    const asked = e.asked.has(b.issue);   // 问过的异常固定为已按下；审查出新异常才会重新变成询问
    button(ASK_BTN, asked ? '已询问' : '询问', K.AMBER, { size: 8, off: asked });
  }
  return true;
}

function drawToast() {
  const t = D.toast;
  if (!t || now - t.t > 2.6) return;
  const w = tw(t.text, 10) + 20, cx = (SCREEN[0] + SCREEN[2]) >> 1;
  frame(cx - w / 2, 124, cx + w / 2, 140, t.col, K.INK);
  txt(cx, 128, t.text, 10, t.col, 'ma');
}
