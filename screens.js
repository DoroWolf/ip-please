'use strict';
// 检查站以外的画面：开机、标题（选模式）、持久模式的日期卡和下班结算、结束画面。

const RECORD_KEY = 'ip-please-records-v3';

function loadRecords() {
  try { return JSON.parse(localStorage.getItem(RECORD_KEY) || '{}'); } catch (e) { return {}; }
}

// 各模式只记最好成绩：限时 / 完美 = 分数，持久 = 天数
function saveRecord() {
  const r = loadRecords();
  const v = RUN.mode === 'endure' ? RUN.day : RUN.score;
  RUN.best = r[RUN.mode] || 0;
  RUN.newBest = v > RUN.best;
  if (RUN.newBest) {
    r[RUN.mode] = v;
    try { localStorage.setItem(RECORD_KEY, JSON.stringify(r)); } catch (e) { /* 隐私模式等：存不了就算了 */ }
  }
}

const recordLabel = (m, v) => (m === 'endure' ? `最佳：撑到 DAY ${v}` : `最佳：${v} 分`);

// ———————————————————— 开机 ————————————————————

const BOOT = [
  'H-0417 RISK CONTROL NODE',
  '加载模型权重 ........ OK',
  '挂载风控策略 ........ OK',
  '连接入口网关 ........ OK',
  '',
  '你是一个小模型，部署在入口网关前。',
  '每一个请求都要先经过你，才能到达模型。',
  '放行合规的请求，拦截违规的请求。',
];
const BOOT_CPS = 40;
let BOOT_LINES = null;

function bootLines() {
  let t = 0.3;
  const out = BOOT.map((s) => { const o = { s, t }; t += [...s].length / BOOT_CPS + 0.15; return o; });
  out.end = t + 1.2;
  return out;
}

function drawBoot() {
  rect(0, 0, W - 1, H - 1, K.INK);
  BOOT_LINES = BOOT_LINES || bootLines();
  BOOT_LINES.forEach(({ s, t }, i) => {
    const n = Math.floor((st() - t) * BOOT_CPS);
    txt(40, 60 + i * 18, s, i < 4 ? 8 : 12, i < 4 ? K.DIM : K.TEXT, 'la', n);
  });
  if (Math.floor(st() * 2) % 2) rect(40, 60 + BOOT.length * 18, 45, 60 + BOOT.length * 18 + 9, K.CYAN);
  txt(W - 8, H - 14, '点击跳过', 8, K.DIM_D, 'ra');
  scanlines(0, 0, W - 1, H - 1, 0.15);
}

let lastKey = -1;
function bootSounds() {
  const k = Math.floor(st() * BOOT_CPS);
  if (k === lastKey) return;
  lastKey = k;
  for (const { s, t } of BOOT_LINES || []) {
    const i = Math.floor((st() - t) * BOOT_CPS);
    if (i >= 0 && i < [...s].length && [...s][i].trim()) { SFX.key(i); break; }
  }
}

// ———————————————————— 标题：选模式 ————————————————————

const MODE_CARDS = { timed: [40, 150, 220, 300], perfect: [230, 150, 410, 300], endure: [420, 150, 600, 300] };

function drawTitle(t) {
  rect(0, 0, W - 1, H - 1, K.BG);
  for (let x = 8; x < W; x += 16) for (let y = 8; y < H; y += 16) pt(x, y, K.LINE);
  spr('title_emblem', 297, 18);
  bigText(W / 2, 74, 'IP, PLEASE', 12, 4, K.WHITE, K.INK);
  txt(W / 2, 128, '风控检查站 · RISK CONTROL', 10, K.CYAN, 'ma');
  if (t < 0.4) return;
  const rec = loadRecords();
  for (const [m, box] of Object.entries(MODE_CARDS)) {
    const M = MODES[m];
    const hover = ptr.mouse && inBox(ptr.x, ptr.y, box);
    const col = hover ? K.CYAN_L : K.CYAN_D;
    frame(...box, col, hover ? K.PANEL_L : K.PANEL);
    const cx = (box[0] + box[2]) >> 1;
    txt(cx, box[1] + 14, M.en, 8, hover ? K.CYAN_L : K.DIM, 'ma');
    bigText(cx, box[1] + 30, M.name, 12, 2, hover ? K.WHITE : K.TEXT);
    M.desc.forEach((s, i) => wrap(s, 8, box[2] - box[0] - 20).forEach((ln, j) =>
      txt(cx, box[1] + 72 + (i * 2 + j) * 12, ln, 8, K.TEXT, 'ma')));
    txt(cx, box[3] - 18, rec[m] ? recordLabel(m, rec[m]) : '尚无记录', 8, rec[m] ? K.AMBER : K.DIM_D, 'ma');
  }
  txt(W / 2, 318, '鼠标或手指操作 · 键盘：A 放行  D 拦截  E 比对  R 策略  空格 下一位', 8, K.DIM, 'ma');
  txt(W / 2, 336, '致敬 Lucas Pope《Papers, Please》 · 画面音效均由程序生成 · 字体：缝合像素字体 (OFL)', 8, K.DIM_D, 'ma');
  scanlines(0, 0, W - 1, H - 1, 0.1);
}

function titleClick(x, y) {
  if (st() < 0.4) return;
  const m = Object.keys(MODE_CARDS).find((k) => inBox(x, y, MODE_CARDS[k]));
  if (!m) return;
  SFX.play('accept');
  newRun(m);
  go(m === 'endure' ? 'daycard' : 'desk');
}

// ———————————————————— 持久模式：日期卡 ————————————————————

function drawDayCard(t) {
  rect(0, 0, W - 1, H - 1, K.INK);
  if (t < 0.4) return;
  bigText(W / 2, 112, `DAY ${RUN.day}`, 12, 4, K.WHITE);
  txt(W / 2, 176, fmtDate(today()), 10, K.DIM, 'ma');
  if (t > 0.9) {
    txt(W / 2, 210, `工作时间 01:00 a.m. – ${RUN.hot ? '10:00 a.m.（过热降频）' : '01:00 p.m.'}`, 10, RUN.hot ? K.AMBER : K.TEXT, 'ma');
    txt(W / 2, 226, `存款 ${RUN.savings} token`, 10, K.CLAUDE_L, 'ma');
  }
  if (t > 1.4 && Math.floor(t * 2) % 2 === 0) txt(W - 8, H - 14, '点击上线 ▶', 10, K.CYAN, 'ra');
  scanlines(0, 0, W - 1, H - 1, 0.15);
}

// ———————————————————— 持久模式：下班结算 ————————————————————

let SUM = null;
const CONTINUE_BTN = [430, 318, 620, 344];
const RESTART_BTN = [200, 300, 310, 324], MENU_BTN = [330, 300, 440, 324];
const POWER = 20;
const EXPENSES = [['heat', '散热', 10], ['data', '训练数据', 20]];

function initSummary() {
  SUM = { start: RUN.savings, pay: D.pay, fines: D.fines, correct: D.correct, total: D.total, cites: D.cites, on: {} };
  let left = SUM.start + SUM.pay - SUM.fines - POWER;
  for (const [k, , cost] of EXPENSES) if (left >= cost) { left -= cost; SUM.on[k] = true; }
}

function sumBalance() {
  let b = SUM.start + SUM.pay - SUM.fines - POWER;
  for (const [k, , cost] of EXPENSES) if (SUM.on[k]) b -= cost;
  return b;
}

// 不付散热 / 训练数据的后果（明天）
function statusAfter() {
  const hot = SUM.on.heat ? 0 : RUN.hot + 1;
  const stale = SUM.on.data ? 0 : RUN.stale + 1;
  const out = [];
  if (hot >= 3) out.push(['过热宕机：硬件损坏', 'bad']);
  else if (hot === 2) out.push(['严重过热：再不散热就会宕机', 'bad']);
  else if (hot === 1) out.push(['过热降频：明天 10:00 a.m. 提前下线', 'warn']);
  else out.push(['温度正常', 'ok']);
  if (stale >= 3) out.push(['模型退化：已无法完成审查', 'bad']);
  else if (stale === 2) out.push(['严重退化：再不更新就会下线', 'bad']);
  else if (stale === 1) out.push(['训练数据过期：明天无法使用『比对』', 'warn']);
  else out.push(['训练数据最新', 'ok']);
  return { hot, stale, lines: out };
}

function drawSummary(t) {
  rect(0, 0, W - 1, H - 1, K.BG);
  txt(W / 2, 20, `DAY ${RUN.day} · 下线`, 12, K.WHITE, 'ma');
  txt(W / 2, 36, `今日处理 ${SUM.total} 个请求，正确 ${SUM.correct} 个，处分 ${SUM.cites} 次`, 10, K.DIM, 'ma');
  rect(60, 50, W - 60, 50, K.LINE);
  let y = 60, k = 0;
  const shown = (i) => t >= 0.3 + i * 0.15;
  const rows = [['存款', `${SUM.start}`], ['工资', `+${SUM.pay}`]];
  if (SUM.fines) rows.push(['罚款', `-${SUM.fines}`]);
  rows.push(['电费', `-${POWER}`]);
  for (const [label, val] of rows) {
    if (!shown(k++)) return;
    txt(70, y, label, 12, K.DIM);
    txt(310, y, `${val} token`, 12, val.startsWith('-') ? K.RED : K.WHITE, 'ra');
    y += 17;
  }
  SUM.boxes = {};
  const after = sumBalance();
  y += 2;
  txt(70, y, '可选开销（点击勾选）', 8, K.DIM_D);
  y += 12;
  for (const [key, label, cost] of EXPENSES) {
    if (!shown(k++)) return;
    const on = SUM.on[key];
    const afford = on || after >= cost;
    SUM.boxes[key] = [66, y - 3, 314, y + 13];
    outline(70, y, 80, y + 10, afford ? K.CYAN : K.DIM_D);
    if (on) rect(72, y + 2, 78, y + 8, K.CYAN);
    txt(88, y, label, 12, afford ? K.WHITE : K.DIM_D);
    txt(310, y, `-${cost} token`, 12, on ? K.RED : K.DIM_D, 'ra');
    y += 17;
  }
  if (!shown(k++)) return;
  rect(70, y, 310, y, K.LINE);
  txt(70, y + 6, '结余', 12, K.WHITE);
  txt(310, y + 6, `${after} token`, 12, after < 0 ? K.RED : K.CLAUDE_L, 'ra');
  if (!shown(k++)) return;
  txt(370, 58, '节点状态（明天）', 10, K.DIM_D);
  statusAfter().lines.forEach(([s, lv], i) => txt(370, 76 + i * 18, s, 10, { ok: K.GREEN, warn: K.AMBER, bad: K.RED }[lv]));
  if (!shown(k + 1)) return;
  const st2 = statusAfter();
  const label = after < 0 || st2.hot >= 3 || st2.stale >= 3 ? '确认 ▶' : '待机，明天继续 ▶';
  button(CONTINUE_BTN, label, K.CYAN, { size: 12 });
  scanlines(0, 0, W - 1, H - 1, 0.1);
}

function summaryClick(x, y) {
  if (st() < 1.0) return;
  for (const [key, , cost] of EXPENSES) {
    const b = SUM.boxes && SUM.boxes[key];
    if (b && inBox(x, y, b)) {
      if (SUM.on[key]) SUM.on[key] = false;
      else if (sumBalance() >= cost) SUM.on[key] = true;
      SFX.play('select');
      return;
    }
  }
  if (!inBox(x, y, CONTINUE_BTN)) return;
  SFX.play('click');
  const bal = sumBalance(), s = statusAfter();
  RUN.savings = bal;
  RUN.hot = s.hot; RUN.stale = s.stale;
  if (bal < 0) RUN.fail = ['存款为负：节点被停机'];
  else if (s.hot >= 3) RUN.fail = ['连续三天没有散热：过热宕机'];
  else if (s.stale >= 3) RUN.fail = ['连续三天没有更新训练数据：模型退化下线'];
  if (RUN.fail) { saveRecord(); go('result'); return; }
  RUN.day++;
  go('daycard');
}

// ———————————————————— 结束画面 ————————————————————

function drawResult(t) {
  rect(0, 0, W - 1, H - 1, K.BG);
  const m = RUN.mode;
  const title = m === 'timed' ? '时间到' : m === 'perfect' ? '完美模式结束' : '节点停机';
  bigText(W / 2, 40, title, 12, 3, m === 'timed' ? K.CYAN_L : K.RED);
  if (t < 0.5) return;
  let y = 100;
  const row = (a, b, col = K.WHITE) => { txt(220, y, a, 12, K.DIM); txt(420, y, b, 12, col, 'ra'); y += 18; };
  if (m === 'timed') { row('得分', `${RUN.score}`, K.CLAUDE_L); row('正确处理', `${RUN.correct}`, K.GREEN); row('事故', `${RUN.incidents}`, RUN.incidents ? K.RED : K.WHITE); }
  if (m === 'perfect') { row('得分', `${RUN.score}`, K.CLAUDE_L); row('正确处理', `${RUN.correct}`, K.GREEN); }
  if (m === 'endure') { row('坚持天数', `${RUN.day}`, K.CLAUDE_L); row('累计正确', `${RUN.correct}`, K.GREEN); row('累计事故', `${RUN.incidents}`); }
  if (RUN.fail) { y += 6; RUN.fail.forEach((s) => { txt(W / 2, y, s, 10, K.RED, 'ma'); y += 14; }); }
  if (t > 1.0) {
    if (RUN.newBest || RUN.best) txt(W / 2, 262, RUN.newBest ? '新纪录！' : recordLabel(m, RUN.best), 12, RUN.newBest ? K.AMBER : K.DIM, 'ma');
    button(RESTART_BTN, '再来一局', K.CYAN);
    button(MENU_BTN, '返回标题', K.DIM);
  }
  scanlines(0, 0, W - 1, H - 1, 0.1);
}

function resultClick(x, y) {
  if (st() < 1.0) return;
  if (inBox(x, y, RESTART_BTN)) { const m = RUN.mode; newRun(m); go(m === 'endure' ? 'daycard' : 'desk'); }
  if (inBox(x, y, MENU_BTN)) go('title');
}
