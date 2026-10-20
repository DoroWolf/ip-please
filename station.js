'use strict';
// 风控检查站：上方请求排队，左下审查窗，右下电脑桌面。三种无尽模式共用这一套，差别都在 MODES 里。

const HUD = [0, 0, W - 1, 13];
const PIPE = [0, 14, W - 1, 117];
const REVIEW = [0, 118, 213, H - 1];
const SCREEN = [216, 118, W - 1, H - 1];
const DESK_AREA = [217, 119, W - 2, 343];
const TASKBAR = [216, 344, W - 1, H - 1];
const BOOK_BTN = [220, 346, 262, 357], INSPECT_BTN = [266, 346, 308, 357];
const APPROVE_BTN = [330, 346, 384, 357], DENY_BTN = [388, 346, 442, 357];
const DATE_BOX = [548, 346, 636, 357];
const NEXT_BTN = [10, 322, 70, 348];
const AVATAR_XY = [12, 136], AVATAR_K = 4, AVATAR_BOX = [10, 134, 101, 225];
const RV_X = 110;
const RV_FIELDS = { 'rv.节点': [RV_X - 3, 136, 209, 147], 'rv.昵称': [RV_X - 3, 148, 209, 159], 'rv.类型': [RV_X - 3, 160, 209, 171] };
const BOOK_ICON = [182, 326];
const GATE = [296, 36, 344, 96], LANE_Y = 66;
const MODEL_BOX = [474, 22, 610, 52], BLOCK_BOX = [474, 80, 610, 110];
const BANNER_BOX = [222, 122, 634, 150], ASK_BTN = [586, 127, 628, 145];

// —— 全局状态（各脚本共用） ——
let canvasEl, F, now = 0;    // F：离屏画布（整帧先画在这里，再合成到屏幕）
const ptr = { x: 320, y: 180, mouse: false, down: false };
let drag = null;
let scene = 'boot', sceneT0 = 0;
const st = () => now - sceneT0;
let RUN = null;              // 这一局（持久模式跨天）
let D = null;                // 这一班（限时 / 完美模式整局只有一班；持久模式一天一班）

// —— 三种无尽模式 ——
const MODES = {
  timed: {
    name: '限时模式', en: 'TIME ATTACK', desc: ['10 分钟内处理尽可能多的请求。', '每次事故损失 30 秒。'],
    notice: '在10分钟内处理尽可能多的请求。每处理一个请求得一分。每收到一次事故将损失30秒。',
    arrive: [1.5, 3.5], pBad: 0.5, pace: 0.6,
  },
  perfect: {
    name: '完美模式', en: 'PERFECT RUN', desc: ['不允许出事：一次事故即结束。', '越早处理的请求，分数越高。'],
    notice: '通过处理请求来得分，不允许出事。第一分钟内每个请求得十分，之后每过一分钟递减一分。注意提高工作效率。',
    arrive: [2.5, 5], pBad: 0.5, pace: 0.8,
  },
  endure: {
    name: '持久模式', en: 'ENDURANCE', desc: ['处理请求赚取 token，降到零下即停机。', '事故处分的罚分逐次递增。'],
    notice: '持续处理请求，直到你的 Token 降到零下。事故处分的罚分会逐次递增。',
    arrive: [2.5, 5.5], pBad: 0.45, pace: 1,
  },
};
const TIMED_LEN = 600, DAY_LEN = 300, PENALTY_SEC = 30, PAY = 5, FINE_STEP = 5;
const SHIFT_START_MIN = 60, SHIFT_SPAN_MIN = 720;   // 持久模式：01:00 → 13:00
const mode = () => MODES[RUN.mode];
const today = () => addDays(WORLD_DATE, RUN.mode === 'endure' ? RUN.day - 1 : 0);

function newRun(m) {
  RUN = { mode: m, correct: 0, incidents: 0, processed: 0, score: 0, streak: 0, fail: null,
    day: 1, savings: 30, hot: 0, stale: 0, bookPos: [424, 124] };
}

// ———————————————————— 一班 ————————————————————

function startShift() {
  D = {
    started: false, tStart: 0, timeAdj: 0,
    queue: [], nextArrive: 0, ent: null, wins: [], icons: [], book: null, lines: [], timers: [], flows: [],
    insp: { on: false, sel: [], banner: null }, toast: null, gateT: -9,
    closing: false, ended: false,
    pay: 0, fines: 0, cites: 0, correct: 0, total: 0, approved: 0, blocked: 0, hinted: {},
  };
  for (let i = 0; i < rint(4, 7); i++) D.queue.push(newPacket(-1));
  D.rulebook = new Rulebook();
  D.icons.push({ win: D.rulebook, book: true });
  layoutIcons();
  const M = mode();
  const note = new OfficialNotice(fmtDate(today()), `无尽 - ${M.name}`, M.notice);
  D.wins.push({ win: note, kind: 'notice', x: 316, y: 126 });
  if (RUN.mode === 'endure' && RUN.stale) toast('训练数据过期：今天无法使用『比对』', K.AMBER);
  if (RUN.mode === 'endure' && RUN.hot) toast('过热降频：今天 10:00 提前下线', K.AMBER);
}

function later(dt, fn) { D.timers.push({ t: now + dt, fn }); }

function runTimers() {
  const due = D.timers.filter((x) => x.t <= now);
  if (!due.length) return;
  D.timers = D.timers.filter((x) => x.t > now);
  due.sort((a, b) => a.t - b.t).forEach((x) => x.fn());
}

function newPacket(t) {
  return { t, col: pick([C.CYAN, C.CYAN_D, C.CYAN_L, C.DIM, C.TEXT]) };
}

function say(who, text) {
  D.lines.push({ t: now, who, text, ent: D.ent });
  SFX.mumble(text, who === 'C' ? 176 : D.ent ? D.ent.voice : 125, D.lines.length * 7);
}

function toast(text, col = K.CYAN) { D.toast = { text, col, t: now }; }

// —— 时间：第一次点『下一位』之前一直停着 ——
const elapsed = () => (D.started ? now - D.tStart : 0);
const timeLeft = () => TIMED_LEN - elapsed() + D.timeAdj;
const unitValue = () => Math.max(1, 10 - Math.floor(elapsed() / 60));   // 完美模式：每单分数
const dayU = () => clamp(elapsed() / DAY_LEN);                          // 持久模式：01:00 → 13:00
const closeAt = () => (RUN.hot ? 0.75 : 1);                             // 过热：10:00 下线

function worldClock() {
  const m = SHIFT_START_MIN + Math.floor(dayU() * SHIFT_SPAN_MIN);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// ———————————————————— 请求进出 ————————————————————

function callNext() {
  if (D.ent || D.ended || RUN.fail) return;
  if (D.closing) { toast('已经下班，不再接新请求'); return; }
  if (!D.queue.length) { toast('队列暂时为空，等待新请求……'); return; }
  if (!D.started) { D.started = true; D.tStart = now; D.nextArrive = now + 1; }
  SFX.play('intercom', 0.8);
  D.queue.shift();
  D.gateT = now;
  const spec = makeRequest(today(), mode().pBad);
  const e = { spec, t0: now, voice: rint(100, 190), handed: false, leaving: false, asked: new Set() };
  D.ent = e;
  D.hinted.next = true;
  say('C', '下一个请求。');
  const k = mode().pace;
  later(0.5 * k, () => { if (D.ent === e) say('E', spec.greet); });
  later(1.2 * k, () => handDocs(e));
}

function handDocs(e) {
  if (D.ent !== e) return;
  SFX.play('select');
  for (const win of e.spec.docs) D.icons.push({ win });
  layoutIcons();
  e.handed = true;
}

function layoutIcons() {
  let i = 0;
  for (const ic of D.icons) {
    if (ic.book) [ic.x, ic.y] = BOOK_ICON;
    else { ic.x = 80 + i * 32; ic.y = 326; i++; }
  }
}

const avatarReady = (e) => e && !e.leaving && now - e.t0 > 0.55 * mode().pace;

function decide(kind) {
  const e = D.ent;
  if (!e || !e.handed || e.leaving || RUN.fail) return;
  e.leaving = true; e.tLeave = now;
  SFX.play(kind === 'approve' ? 'accept' : 'reject');
  D.flows.push({ t0: now, kind });
  D.wins = D.wins.filter((w) => w.kind !== 'doc');
  D.icons = D.icons.filter((ic) => ic.book);
  setInspect(false);
  D.insp.banner = null;
  judge(e, kind);
  later(0.6, () => { if (D.ent === e) D.ent = null; });
}

function judge(e, kind) {
  const spec = e.spec;
  const right = (kind === 'approve') === (spec.flaw === null);
  RUN.processed++; D.total++;
  if (kind === 'approve') D.approved++; else D.blocked++;
  if (RUN.mode === 'timed') RUN.score++;
  if (right) {
    RUN.correct++; D.correct++; RUN.streak++;
    if (RUN.mode === 'perfect') { const v = unitValue(); RUN.score += v; toast(`+${v}`, K.GREEN); }
    if (RUN.mode === 'endure') D.pay += PAY;
    return;
  }
  RUN.incidents++; RUN.streak = 0;
  const lines = kind === 'approve' ? ['放行了违规请求：', spec.reason] : ['拦截了合规请求：', '证件齐全，信息一致'];
  if (RUN.mode === 'timed') {
    D.timeAdj -= PENALTY_SEC;
    notice('事故通知', lines.concat([`损失 ${PENALTY_SEC} 秒`]));
  } else if (RUN.mode === 'perfect') {
    RUN.fail = lines;
    notice('事故通知', lines.concat(['完美模式结束']));
    later(2.2, finishRun);
  } else {
    D.cites++;
    const fine = (D.cites - 1) * FINE_STEP;
    D.fines += fine;
    notice('处分通知', lines.concat([fine ? `罚款：${fine} token（下次 ${fine + FINE_STEP}）` : `今日首次处分：警告（下次罚款 ${FINE_STEP} token）`]));
  }
}

function notice(title, lines, tone = 'red') {
  const win = new NoticeWindow(title, lines, tone);
  const n = D.wins.filter((w) => w.kind === 'notice').length;
  D.wins.push({ win, kind: 'notice', x: 226 + n * 8, y: 156 + n * 8 });
  if (tone === 'red') { SFX.play('citation'); later(0.25, () => SFX.play('discrepancy', 0.5)); }
}

function finishRun() {
  if (D.ended) return;
  D.ended = true;
  saveRecord();
  go('result');
}

// 下班：排队的请求全部离开，处理完手上这个就结束
function closeShift() {
  D.closing = true;
  for (const p of D.queue) p.leave = now + Math.random() * 0.4;
  later(1.8, () => { D.queue = []; });
  SFX.play('bell');
  toast(`${worldClock()} 下班：排队的请求已离开`, K.AMBER);
}

function endDay() {
  if (D.ended) return;
  D.ended = true;
  later(2.4, () => go('summary'));
}

// ———————————————————— 每帧 ————————————————————

function updateDesk() {
  runTimers();
  if (D.ended || !D.started) return;
  const m = mode();
  if (!D.closing && now >= D.nextArrive) {
    if (D.queue.length < 60) D.queue.push(newPacket(now));
    D.nextArrive = now + m.arrive[0] + Math.random() * (m.arrive[1] - m.arrive[0]);
  }
  if (RUN.mode === 'timed' && timeLeft() <= 0) { SFX.play('bell'); finishRun(); return; }
  if (RUN.mode === 'endure' && !D.closing && dayU() >= closeAt()) closeShift();
  if (D.closing && !D.ent) endDay();
}

// ———————————————————— 输入 ————————————————————

const iconBox = (ic) => [ic.x, ic.y, ic.x + 25, ic.y + 19];
const winBox = (w) => [w.x, w.y, w.x + w.win.w - 1, w.y + w.win.h - 1];

function deskDown(x, y) {
  if (D.ended) return;
  if (inBox(x, y, BOOK_BTN)) return toggleBook();
  if (inBox(x, y, INSPECT_BTN)) return setInspect(!D.insp.on);
  if (inBox(x, y, APPROVE_BTN)) return decide('approve');
  if (inBox(x, y, DENY_BTN)) return decide('deny');
  const b = D.insp.banner;
  if (b && b.ok && D.ent && !D.ent.leaving && inBox(x, y, ASK_BTN)) return askAbout(b.issue);
  if (D.insp.on && (inBox(x, y, SCREEN) || fieldAt(x, y))) return inspectClick(x, y);
  if (inBox(x, y, NEXT_BTN)) return callNext();
  for (const ic of [...D.icons].reverse()) {
    if (!inBox(x, y, iconBox(ic))) continue;
    drag = { type: 'icon', inst: ic, start: [x, y], moved: false };
    SFX.play('select', 0.6);
    return;
  }
  for (const w of [...D.wins].reverse()) {
    if (!inBox(x, y, winBox(w))) continue;
    D.wins = D.wins.filter((o) => o !== w).concat([w]);
    drag = { type: 'win', inst: w, off: [x - w.x, y - w.y], prev: [w.x, w.y], start: [x, y], moved: false };
    return;
  }
}

function deskMove(x, y) {
  if (!drag) return;
  if (Math.hypot(x - drag.start[0], y - drag.start[1]) > 3) drag.moved = true;
  if (!drag.moved) return;
  const w = drag.inst;
  if (drag.type === 'icon') { w.dx = x; w.dy = y; return; }
  w.x = Math.max(SCREEN[0] - w.win.w + 24, Math.min(W - 24, x - drag.off[0]));
  w.y = Math.max(DESK_AREA[1], Math.min(DESK_AREA[3] - TITLE_H, y - drag.off[1]));
  w.out = x < SCREEN[0];
}

function deskUp(x, y) {
  if (!drag) return;
  const d = drag;
  drag = null;
  const w = d.inst;
  if (d.type === 'icon') {
    delete w.dx; delete w.dy;
    if (!d.moved || x < SCREEN[0]) return;
    D.icons = D.icons.filter((o) => o !== w);
    layoutIcons();
    const [px, py] = clampDesk(x - 20, y - 6, w.win);
    const inst = { win: w.win, kind: w.book ? 'book' : 'doc', x: px, y: py };
    if (w.book) D.book = inst;
    D.wins.push(inst);
    SFX.play('select');
    return;
  }
  if (!d.moved) {
    const rx = x - w.x, ry = y - w.y;
    if (w.kind === 'book' && inBox(rx, ry, w.win.tab)) { w.win.flip(); SFX.play('select'); }
    if (w.kind === 'notice' && inBox(rx, ry, w.win.close)) stow(w);
    return;
  }
  if (!w.out) return;
  delete w.out;
  [w.x, w.y] = d.prev;
  stow(w);
}

// 拖回审查窗：证件和手册收回成柜台上的图标，通知直接关掉
function stow(w) {
  D.wins = D.wins.filter((o) => o !== w);
  if (w.kind === 'notice') { SFX.play('click'); return; }
  if (w.kind === 'book') { RUN.bookPos = [w.x, w.y]; D.book = null; }
  D.icons.push({ win: w.win, book: w.kind === 'book' });
  layoutIcons();
  SFX.play('select', 0.6);
}

function toggleBook() {
  SFX.play('select');
  if (D.book) { stow(D.book); return; }
  D.icons = D.icons.filter((ic) => !ic.book);
  layoutIcons();
  const [x, y] = clampDesk(RUN.bookPos[0], RUN.bookPos[1], D.rulebook);
  D.book = { win: D.rulebook, kind: 'book', x, y };
  D.wins.push(D.book);
}

function deskKey(k) {
  if (D.ended) return;
  if (k === ' ' || k === 'n') callNext();
  else if (k === 'a') decide('approve');
  else if (k === 'd') decide('deny');
  else if (k === 'e') setInspect(!D.insp.on);
  else if (k === 'r') toggleBook();
}

function clampDesk(x, y, win) {
  return [Math.round(Math.max(DESK_AREA[0] + 2, Math.min(DESK_AREA[2] - win.w - 2, x))),
    Math.round(Math.max(DESK_AREA[1] + 2, Math.min(DESK_AREA[3] - win.h - 2, y)))];
}

// ———————————————————— 比对模式 ————————————————————

function setInspect(on) {
  if (D.insp.on === on) return;
  if (on && RUN.mode === 'endure' && RUN.stale) { toast('训练数据过期：今天无法使用『比对』', K.AMBER); return; }
  D.insp.on = on;
  D.insp.sel = [];
  if (!on && D.insp.banner && !D.insp.banner.ok) D.insp.banner = null;
  SFX.play(on ? 'inspect_on' : 'inspect_off');
}

// 能点的栏位：桌面窗口里的行、审查窗里的节点信息、任务栏日期
function fieldBoxes() {
  const out = [];
  for (const w of D.wins) {
    for (const [key, f] of Object.entries(w.win.fields)) out.push({ key, box: [w.x + f[0], w.y + f[1], w.x + f[2], w.y + f[3]], w });
  }
  out.push({ key: 'sys.日期', box: DATE_BOX, w: null });
  if (avatarReady(D.ent)) {
    out.push({ key: 'rv.头像', box: AVATAR_BOX, w: null });
    for (const [key, box] of Object.entries(RV_FIELDS)) out.push({ key, box, w: null });
  }
  return out;
}

function fieldAt(x, y) {
  const all = fieldBoxes();
  if (inBox(x, y, SCREEN)) {
    for (const w of [...D.wins].reverse()) {
      if (inBox(x, y, winBox(w))) return all.find((fb) => fb.w === w && inBox(x, y, fb.box)) || null;
    }
  }
  return all.find((fb) => !fb.w && inBox(x, y, fb.box)) || null;
}

function inspectClick(x, y) {
  const I = D.insp;
  const f = fieldAt(x, y);
  if (!f) return;
  if (I.sel.some((s) => s.key === f.key)) { I.sel = I.sel.filter((s) => s.key !== f.key); return; }
  if (I.sel.length >= 2) I.sel = [];
  I.sel.push(f);
  SFX.play('select');
  if (I.sel.length < 2) return;
  const keys = I.sel.map((s) => s.key).sort().join('|');
  const e = D.ent;
  const issue = e && e.handed && !e.leaving && e.spec.issues.find((is) => is.pairs.some((p) => p.slice().sort().join('|') === keys));
  if (issue) {
    I.banner = { ok: true, issue, title: issue.title, sub: issue.sub, t: now };
    SFX.play('discrepancy');
  } else {
    I.banner = { ok: false, title: '未发现矛盾', sub: '这两项信息之间没有冲突', t: now };
    SFX.play('click');
  }
}

function askAbout(issue) {
  const e = D.ent;
  if (!e || e.asked.has(issue) || e.leaving) return;
  e.asked.add(issue);
  say('C', QUESTIONS[e.spec.flaw]);
  later(0.9, () => { if (D.ent === e) say('E', issue.ask); });
}

// ———————————————————— 绘制 ————————————————————

function drawDesk() {
  rect(0, 0, W - 1, H - 1, K.INK);
  drawHud();
  drawPipe();
  drawReview();
  drawScreen();
  if (D.insp.on) drawInspect();
  if (!drawBanner()) drawToast();
  if (drag && drag.type === 'icon' && drag.moved) docIcon(drag.inst.dx - 8, drag.inst.dy - 6, true, drag.inst.book);
  if (drag && drag.type === 'win' && drag.inst.out) docIcon(ptr.x - 8, ptr.y - 6, true, drag.inst.kind === 'book');
  scanlines(0, 0, W - 1, H - 1, 0.12);
}

function drawHud() {
  rect(...HUD, K.PANEL);
  rect(0, 13, W - 1, 13, K.LINE);
  txt(6, 3, 'IP, PLEASE', 8, K.CLAUDE_L);
  txt(62, 3, `· 无尽 - ${mode().name}`, 8, K.CYAN);
  const parts = [];
  if (RUN.mode === 'timed') parts.push([`剩余 ${mmss(timeLeft())}`, timeLeft() < 60 ? K.RED : K.WHITE], [`得分 ${RUN.score}`, K.GREEN], [`事故 ${RUN.incidents}`, RUN.incidents ? K.RED : K.DIM]);
  if (RUN.mode === 'perfect') parts.push([`得分 ${RUN.score}`, K.WHITE], [`每单 +${unitValue()}`, K.GREEN], [`用时 ${mmss(elapsed())}`, K.DIM]);
  if (RUN.mode === 'endure') {
    parts.push([`DAY ${RUN.day}`, K.WHITE], [worldClock(), D.closing ? K.AMBER : K.WHITE],
      [`今日正确 ${D.correct}`, K.GREEN], [`处分 ${D.cites}`, D.cites ? K.RED : K.DIM]);
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
  txt(8, 20, '入口 INGRESS', 8, K.DIM);
  const waiting = D.queue.filter((p) => !p.leave).length;
  txt(8, 104, `排队 ${waiting}`, 8, waiting > 30 ? K.AMBER : K.DIM);
  if (!D.started) txt(GATE[0] - 12, 90, '待机：点击『下一位』开始工作', 8, Math.floor(now * 2) % 2 ? K.AMBER : K.DIM, 'ra');
  const flow = D.started && !D.closing ? -now * 12 : 0;
  dashLine(0, LANE_Y, GATE[0] - 1, LANE_Y, K.LINE, flow);
  const slots = Math.floor((GATE[0] - 30) / 11);
  D.queue.forEach((p, i) => {
    if (i >= slots) return;
    const tx = GATE[0] - 14 - i * 11;
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
  if (waiting > slots) txt(14, LANE_Y + 8, `+${waiting - slots}`, 8, K.AMBER);
  // 检查站
  const [gx0, gy0, gx1, gy1] = GATE;
  txt((gx0 + gx1) >> 1, gy0 - 12, '风控检查站', 8, K.CLAUDE_L, 'ma');
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
  txt((gx0 + gx1) >> 1, gy1 + 5, 'H-0417', 8, K.DIM, 'ma');
  // 出口：放行 → 模型，拦截 → 丢弃
  const bx = 400, my = (MODEL_BOX[1] + MODEL_BOX[3]) >> 1, ky = (BLOCK_BOX[1] + BLOCK_BOX[3]) >> 1;
  line(gx1 + 1, LANE_Y, bx, LANE_Y, K.LINE);
  line(bx, my, bx, ky, K.LINE);
  dashLine(bx, my, MODEL_BOX[0] - 1, my, K.GREEN_D, flow);
  dashLine(bx, ky, BLOCK_BOX[0] - 1, ky, K.RED_D, flow);
  frame(...MODEL_BOX, K.GREEN, K.PANEL);
  txt(MODEL_BOX[0] + 8, MODEL_BOX[1] + 5, '模型 MODEL', 8, K.GREEN);
  txt(MODEL_BOX[2] - 8, MODEL_BOX[1] + 17, `放行 ${D.approved}`, 8, K.TEXT, 'ra');
  frame(...BLOCK_BOX, K.RED, K.PANEL);
  txt(BLOCK_BOX[0] + 8, BLOCK_BOX[1] + 5, '拦截 BLOCKED', 8, K.RED);
  txt(BLOCK_BOX[2] - 8, BLOCK_BOX[1] + 17, `拦截 ${D.blocked}`, 8, K.TEXT, 'ra');
  D.flows = D.flows.filter((f) => now - f.t0 < 1.2);
  for (const f of D.flows) {
    const u = (now - f.t0) / 1.2;
    const ty = f.kind === 'approve' ? my : ky;
    const pts = [[gx1, LANE_Y], [bx, LANE_Y], [bx, ty], [MODEL_BOX[0], ty]];
    const segs = [bx - gx1, Math.abs(ty - LANE_Y), MODEL_BOX[0] - bx];
    let d = u * (segs[0] + segs[1] + segs[2]), k = 0;
    while (k < 2 && d > segs[k]) { d -= segs[k]; k++; }
    const p = pts[k], q = pts[k + 1], v = segs[k] ? Math.min(1, d / segs[k]) : 1;
    const x = Math.round(lerp(p[0], q[0], v)), y = Math.round(lerp(p[1], q[1], v));
    rect(x - 3, y - 3, x + 3, y + 3, f.kind === 'approve' ? K.GREEN : K.RED);
  }
}

// —— 左下：审查窗 ——
function drawReview() {
  const [x0, y0, x1, y1] = REVIEW;
  rect(x0, y0, x1, y1, K.BG);
  frame(x0 + 2, y0 + 2, x1 - 2, y1 - 2, K.LINE_L);
  txt(x0 + 8, y0 + 5, '审查窗 · REVIEW', 8, K.CYAN);
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
  // 节点信息
  const ready = avatarReady(e);
  const s = e && e.spec;
  [['节点', s && s.id], ['昵称', s && s.handle], ['类型', s && (s.kind === 'api' ? 'API 调用' : '对话')]].forEach(([k, v], i) => {
    txt(RV_X, 138 + i * 12, k, 8, ready ? K.DIM : K.DIM_D);
    txt(RV_X + 24, 138 + i * 12, ready ? v : '—', 8, ready ? (k === '类型' && s.kind === 'api' ? K.AMBER : K.TEXT) : K.DIM_D);
  });
  if (ready) {
    txt(RV_X, 178, '请求摘要', 8, K.DIM);
    wrap(s.task, 8, x1 - RV_X - 8).slice(0, 3).forEach((ln, i) => txt(RV_X, 190 + i * 10, ln, 8, K.CYAN_L));
  }
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
  // 柜台：下一位 + 证件图标 + 规则手册
  const canCall = !e && !D.closing && !D.ended;
  button(NEXT_BTN, '下一位', K.CYAN, { off: !canCall, hot: canCall && !D.hinted.next && Math.floor(now * 2) % 2 === 0 });
  for (const ic of D.icons) {
    if (drag && drag.inst === ic && drag.moved) continue;
    docIcon(ic.x, ic.y, ptr.mouse && inBox(ptr.x, ptr.y, iconBox(ic)), ic.book);
    txt(ic.x + 13, ic.y + 22, ic.book ? '手册' : ic.win.key === 'api' ? 'API' : ic.win.title, 8, K.DIM, 'ma');
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
}

// —— 右下：电脑桌面 ——
function clipScreen() {
  G.save();
  G.beginPath(); G.rect(SCREEN[0] + 1, SCREEN[1], SCREEN[2] - SCREEN[0], TASKBAR[1] - SCREEN[1]); G.clip();
}

function drawWins() {
  clipScreen();
  for (const w of D.wins) if (!w.out) w.win.draw(w.x, w.y);
  G.restore();
}

function drawScreen() {
  const [x0, y0, x1, y1] = SCREEN;
  rect(x0, y0, x1, y1, K.BG);
  for (let x = x0 + 8; x < x1; x += 16) for (let y = y0 + 8; y < TASKBAR[1]; y += 16) pt(x, y, K.LINE);
  txt((x0 + x1) >> 1, 236, 'H-0417  RISK CONTROL TERMINAL', 8, K.GRID, 'ma');
  rect(x0, y0, x0, y1, K.LINE);
  drawWins();
  if (D.wins.some((w) => w.kind === 'doc')) D.hinted.drag = true;
  if (D.icons.some((ic) => !ic.book) && !D.hinted.drag && !D.insp.on) txt(x0 + 6, TASKBAR[1] - 12, '◀ 把柜台上的证件拖到桌面上查看', 8, K.AMBER);
  drawTaskbar();
}

function drawTaskbar() {
  rect(...TASKBAR, K.PANEL);
  rect(TASKBAR[0], TASKBAR[1], TASKBAR[2], TASKBAR[1], K.LINE_L);
  const e = D.ent, can = e && e.handed && !e.leaving;
  button(BOOK_BTN, '手册', K.CLAUDE_L, { size: 8, hot: !!D.book });
  button(INSPECT_BTN, '比对', K.AMBER, { size: 8, hot: D.insp.on, off: RUN.mode === 'endure' && RUN.stale > 0 });
  button(APPROVE_BTN, '放行', K.GREEN, { size: 8, off: !can });
  button(DENY_BTN, '拦截', K.RED, { size: 8, off: !can });
  // 世界观时间只在持久模式显示；日期都要显示（核对有效期）
  const s = RUN.mode === 'endure' ? `${fmtDate(today())}  ${worldClock()}` : fmtDate(today());
  txt(DATE_BOX[2], DATE_BOX[1] + 2, s, 8, K.TEXT, 'ra');
}

// 比对模式：桌面压暗，所有可点的栏位描黄框
function drawInspect() {
  darken(0.35, C.INK, [SCREEN[0] + 1, SCREEN[1], SCREEN[2], TASKBAR[1] - 1]);
  const sel = D.insp.sel.map((s) => s.key);
  const hover = fieldAt(ptr.x, ptr.y);
  const mark = (f) => outline(...f.box, sel.includes(f.key) ? K.AMBER : hover && hover.key === f.key ? K.CYAN_L : rgba(C.AMBER, 0.35));
  const all = fieldBoxes();
  drawWins();   // 窗口画在压暗层上面
  clipScreen();
  for (const f of all) if (f.w && (topWinAt(center(f.box)) === f.w || sel.includes(f.key))) mark(f);
  G.restore();
  for (const f of all) if (!f.w) mark(f);
  if (D.insp.sel.length === 2) {
    const [a, b] = D.insp.sel.map((s) => center(s.box));
    line(a[0], a[1], b[0], b[1], K.AMBER);
  }
  txt(SCREEN[0] + 6, TASKBAR[1] - 12, '比对：依次点两项信息（证件 / 手册 / 审查窗 / 日期）', 8, K.AMBER);
}

function topWinAt([x, y]) {
  for (const w of [...D.wins].reverse()) if (inBox(x, y, winBox(w))) return w;
  return null;
}

function drawBanner() {
  const b = D.insp.banner;
  if (!b || (!b.ok && now - b.t > 1.6)) return false;
  const col = b.ok ? K.RED : K.DIM;
  frame(...BANNER_BOX, col, K.INK);
  txt(BANNER_BOX[0] + 8, BANNER_BOX[1] + 4, b.title, 10, b.ok ? K.RED : K.TEXT);
  txt(BANNER_BOX[0] + 8, BANNER_BOX[1] + 17, b.sub, 8, K.TEXT);
  const e = D.ent;
  if (b.ok && e && !e.leaving) button(ASK_BTN, e.asked.has(b.issue) ? '已询问' : '询问', K.AMBER, { size: 8, off: e.asked.has(b.issue) });
  return true;
}

function drawToast() {
  const t = D.toast;
  if (!t || now - t.t > 2.6) return;
  const w = tw(t.text, 10) + 20, cx = (SCREEN[0] + SCREEN[2]) >> 1;
  frame(cx - w / 2, 124, cx + w / 2, 140, t.col, K.INK);
  txt(cx, 128, t.text, 10, t.col, 'ma');
}
