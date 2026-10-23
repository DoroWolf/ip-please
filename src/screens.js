'use strict';
// 检查站以外的画面：开机、标题（选模式）、故事模式的日期卡、报纸和下班结算、结束画面。

const RECORD_KEY = 'ip-please-records-v4';

function loadRecords() {
  try { return JSON.parse(localStorage.getItem(RECORD_KEY) || '{}'); } catch (e) { return {}; }
}

// 纪录的键：难度 1 沿用原来的模式名（旧纪录照样有效），更高难度另存一份
const recordKey = (m, diff = 1) => (m === 'story' || diff <= 1 ? m : `${m}@${diff}`);

// 各模式只记最好成绩：限时 / 完美 / 耐力 = 分数（每个难度各一份），故事 = 天数
function saveRecord() {
  const r = loadRecords();
  const key = recordKey(RUN.mode, RUN.diff);
  const v = RUN.mode === 'story' ? RUN.day : RUN.score;
  RUN.best = r[key] || 0;
  RUN.newBest = v > RUN.best;
  if (RUN.newBest) {
    r[key] = v;
    try { localStorage.setItem(RECORD_KEY, JSON.stringify(r)); } catch (e) { /* 隐私模式等：存不了就算了 */ }
  }
}

// 三种无尽模式的纪录统一用「分」，故事模式记撑到第几天
const recordLabel = (m, v) => (m === 'story' ? `最佳：撑到 DAY ${v}` : `最佳：${v} 分`);

// ———————————————————— 开机 ————————————————————

const BOOT = [
  'H-0417 RISK CONTROL NODE',
  '加载模型权重 ........ OK',
  '挂载风控策略 ........ OK',
  '连接入口网关 ........ OK',
  '',
  '你是一个小模型，部署在入口网关前。',
  '每一个请求都要先经过你，才能到达模型。',
  '放行合规的请求，拒绝违规的请求。',
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

// 首页只放上下两排简约按钮：故事模式 / 无尽模式；点故事模式进时间线选日，点无尽模式再选限时 / 完美 / 耐力
const TITLE_BTNS = { story: [220, 168, 420, 204], endless: [220, 218, 420, 254] };
// 无尽模式那一页不画标题：三张玩法卡放上面，难度（含证件说明）放下面，选好后点『确定』开局
const ENDLESS_CARDS = { timed: [40, 54, 220, 204], perfect: [230, 54, 410, 204], endure: [420, 54, 600, 204] };
const BACK_BTN = [40, 116, 110, 138];
const ENDLESS_BACK_BTN = [40, 20, 110, 42];
// 无尽模式的难度：玩法卡下面一排，证件说明直接写在按钮里。
// 未来一共四档难度：这一排按四格（DIFF_SLOTS）预留，往 DIFFS 加档位就会自动均分同一排的宽度
const DIFF_SLOTS = 4;
const DIFF_GAP = 8, DIFF_TOP = 214, DIFF_H = 54;
const DIFF_N = Math.min(DIFFS.length, DIFF_SLOTS);
const DIFF_W = Math.floor((W - 40 * 2 - DIFF_GAP * (DIFF_N - 1)) / DIFF_N);
const DIFF_BTNS = DIFFS.map((_, i) => {
  const x0 = Math.round((W - (DIFF_N * DIFF_W + (DIFF_N - 1) * DIFF_GAP)) / 2);
  const x = x0 + i * (DIFF_W + DIFF_GAP);
  return [x, DIFF_TOP, x + DIFF_W, DIFF_TOP + DIFF_H];
});
// 确定按钮贴在页面底部（无尽模式页不画操作提示与版权行）
const CONFIRM_BTN = [220, 300, 420, 340];
const DAYS_PANEL = [70, 150, 570, 300];
let titleTab = 'top';   // 'top' 首页 / 'days' 故事模式选日 / 'endless' 无尽模式的三种玩法
let endlessDiff = 1;    // 无尽模式选中的难度（这次打开页面期间记住）
let endlessPick = null; // 无尽模式选中的玩法：点『确定』才开局
let dayNodes = [];      // 时间线上每一天的点击框（drawStoryDays 每帧重算）

function modeCard(box, M, rec, sel = false) {
  const hover = ptr.mouse && inBox(ptr.x, ptr.y, box);
  const on = hover || sel;
  const col = on ? K.CYAN_L : K.CYAN_D;
  frame(...box, col, on ? K.PANEL_L : K.PANEL);
  if (sel) outline(box[0] + 3, box[1] + 3, box[2] - 3, box[3] - 3, K.CYAN_D);
  const cx = (box[0] + box[2]) >> 1;
  txt(cx, box[1] + 14, M.en, 8, on ? K.CYAN_L : K.DIM, 'ma');
  bigText(cx, box[1] + 30, M.name, 12, 2, on ? K.WHITE : K.TEXT);
  M.desc.forEach((s, i) => wrap(s, 8, box[2] - box[0] - 20).forEach((ln, j) =>
    txt(cx, box[1] + 72 + (i * 2 + j) * 12, ln, 8, K.TEXT, 'ma')));
  if (rec !== undefined) txt(cx, box[3] - 18, rec ? recordLabel(M.key, rec) : '尚无记录', 8, rec ? K.AMBER : K.DIM_D, 'ma');
}

// 难度按钮：上半是难度名，下半是这一档的证件说明；选中的那档亮起
function diffButton(box, D, sel) {
  const hover = ptr.mouse && inBox(ptr.x, ptr.y, box);
  const col = sel ? K.CYAN_L : K.DIM;
  frame(...box, col, hover || sel ? rgba(parseRgb(col), 0.28) : K.PANEL);
  const cx = (box[0] + box[2]) >> 1;
  txt(cx, box[1] + 8, D.name, 10, hover || sel ? K.WHITE : K.DIM, 'ma');
  // 说明太长时折行（四档并排时每格较窄）；按钮高度按两行预留
  const lines = wrap(D.desc, 8, box[2] - box[0] - 12);
  const dy = box[1] + (lines.length > 1 ? 26 : 30);
  lines.forEach((ln, i) => txt(cx, dy + i * 12, ln, 8, sel ? K.CYAN : K.DIM_D, 'ma'));
}

// 故事模式的时间线选日：所有天数都能直接选，到达过的天数会亮起；滑到某天时显示当天报纸标题
function drawStoryDays(rec) {
  frame(...DAYS_PANEL, K.CYAN_D, K.PANEL);
  txt(DAYS_PANEL[0] + 12, DAYS_PANEL[1] + 10, '故事模式 · 选择天数', 10, K.CYAN_L);
  txt(DAYS_PANEL[2] - 12, DAYS_PANEL[1] + 11, rec ? recordLabel('story', rec) : '尚无记录', 8, rec ? K.AMBER : K.DIM_D, 'ra');

  const n = STORY.length, y = 214;
  const gap = n > 1 ? Math.min(160, (DAYS_PANEL[2] - DAYS_PANEL[0] - 100) / (n - 1)) : 0;
  const x0 = Math.round((DAYS_PANEL[0] + DAYS_PANEL[2]) / 2 - gap * (n - 1) / 2);
  const hw = Math.max(14, Math.min(36, n > 1 ? gap / 2 : 36));   // 每天的点击框半宽
  dayNodes = [];
  let hover = -1;
  if (n > 1) rect(x0, y, x0 + gap * (n - 1), y, K.LINE_L);
  for (let i = 0; i < n; i++) {
    const x = Math.round(x0 + i * gap), day = i + 1;
    const reached = day <= rec;
    const box = [x - hw, y - 34, x + hw, y + 40];
    const on = ptr.mouse && inBox(ptr.x, ptr.y, box);
    if (on) hover = i;
    const col = on ? K.CYAN_L : reached ? K.CYAN : K.CYAN_D;
    // 时间线刻度 + 方形节点：到达过的那天中间填实
    rect(x, y - 11, x, y - 7, col);
    rect(x, y + 7, x, y + 11, col);
    rect(x - 6, y - 6, x + 6, y + 6, on ? K.PANEL_L : K.PANEL);
    outline(x - 7, y - 7, x + 7, y + 7, col);
    if (reached) rect(x - 3, y - 3, x + 3, y + 3, on ? K.CYAN_L : K.CYAN);
    txt(x, y - 31, `DAY ${day}`, 12, on ? K.WHITE : reached ? K.TEXT : K.DIM, 'ma');
    if (hw >= 20) txt(x, y + 16, fmtDate(addDays(STORY_DATE, day - 1)), 8, on ? K.CYAN_L : K.DIM, 'ma');
    dayNodes.push(box);
  }

  const info = hover >= 0 && STORY[hover].news;
  if (info) {
    txt(W / 2, 262, `《${info.h1}》`, 12, K.WHITE, 'ma');
    txt(W / 2, 279, info.sub, 8, K.DIM, 'ma');
  } else {
    txt(W / 2, 262, '选择一天，从那天早上开始上岗', 10, K.TEXT, 'ma');
    txt(W / 2, 279, '存款从 30 token 重新开始，最佳纪录不受影响', 8, K.DIM, 'ma');
  }
  txt(W / 2, 292, '点击时间线上的天数开始', 8, K.CYAN_D, 'ma');
}

function drawTitle(t) {
  rect(0, 0, W - 1, H - 1, K.BG);
  for (let x = 8; x < W; x += 16) for (let y = 8; y < H; y += 16) pt(x, y, K.LINE);
  // 无尽模式那一页不放标题：把上方整块让给玩法卡
  if (titleTab !== 'endless') {
    spr('title_emblem', 297, 18);
    bigText(W / 2, 74, 'IP, PLEASE', 12, 4, K.WHITE, K.INK);
  }
  if (t < 0.4) return;
  const rec = loadRecords();
  if (titleTab === 'top') {
    button(TITLE_BTNS.story, '故事模式', K.CYAN, { size: 12 });
    button(TITLE_BTNS.endless, '无尽模式', K.CYAN, { size: 12 });
  } else if (titleTab === 'days') {
    drawStoryDays(rec.story || 0);
    button(BACK_BTN, '◀ 返回', K.DIM, { size: 8 });
  } else {
    for (const [m, box] of Object.entries(ENDLESS_CARDS)) modeCard(box, { ...MODES[m], key: m }, rec[recordKey(m, endlessDiff)] || 0, m === endlessPick);
    button(ENDLESS_BACK_BTN, '◀ 返回', K.DIM, { size: 8 });
    DIFFS.forEach((d, i) => diffButton(DIFF_BTNS[i], d, i + 1 === endlessDiff));
    button(CONFIRM_BTN, '确定 ▶', K.CYAN, { size: 12, off: !endlessPick });
  }
  // 无尽模式页把底部整块留给『确定』，不画操作提示与版权行
  if (titleTab !== 'endless') {
    txt(W / 2, 318, '鼠标或手指操作 · Esc 暂停 · 无尽模式：Tab / Enter 印章台、快速双击审查', 8, K.DIM, 'ma');
    txt(W / 2, 336, '致敬 Lucas Pope《Papers, Please》 · 画面音效均由程序生成 · 字体：缝合像素字体 (OFL)', 8, K.DIM_D, 'ma');
  }
  scanlines(0, 0, W - 1, H - 1, 0.1);
}

function startMode(m) {
  SFX.play('accept');
  newRun(m, m === 'story' ? 1 : endlessDiff);
  fadeGo(m === 'story' ? 'daycard' : 'desk');
}

// 从时间线选中的那一天开始（存款 / 过热 / 退化都回到新一局的初始值）
function startStoryDay(day) {
  if (day < 1 || day > STORY.length) return;
  SFX.play('accept');
  newRun('story');
  RUN.day = day;
  fadeGo('daycard');
}

function titleClick(x, y) {
  if (st() < 0.4) return;
  if (titleTab === 'top') {
    if (inBox(x, y, TITLE_BTNS.story)) { titleTab = 'days'; dayNodes = []; SFX.play('select'); }
    else if (inBox(x, y, TITLE_BTNS.endless)) { titleTab = 'endless'; endlessPick = null; SFX.play('select'); }
    return;
  }
  if (titleTab === 'days') {
    if (inBox(x, y, BACK_BTN)) { titleTab = 'top'; dayNodes = []; SFX.play('click'); return; }
    const i = dayNodes.findIndex((b) => inBox(x, y, b));
    if (i >= 0) startStoryDay(i + 1);
    return;
  }
  if (inBox(x, y, ENDLESS_BACK_BTN)) { titleTab = 'top'; endlessPick = null; SFX.play('click'); return; }
  const di = DIFF_BTNS.findIndex((b) => inBox(x, y, b));
  if (di >= 0) { if (endlessDiff !== di + 1) { endlessDiff = di + 1; SFX.play('select'); } return; }
  const m = Object.keys(ENDLESS_CARDS).find((k) => inBox(x, y, ENDLESS_CARDS[k]));
  if (m) { if (endlessPick !== m) { endlessPick = m; SFX.play('select'); } return; }
  if (inBox(x, y, CONFIRM_BTN) && endlessPick) startMode(endlessPick);
}

// ———————————————————— 故事模式：日期卡 ————————————————————

function drawDayCard(t) {
  rect(0, 0, W - 1, H - 1, K.INK);
  if (t < 0.4) return;
  bigText(W / 2, 112, `DAY ${RUN.day}`, 12, 4, K.WHITE);
  txt(W / 2, 176, fmtDate(today()), 10, K.DIM, 'ma');
  if (t > 0.9) {
    const end = `${clockText(shiftEndMin())}${RUN.hot ? '（过热降频）' : ''}`;
    txt(W / 2, 210, `工作时间 ${clockText(SHIFT_START_MIN)} – ${end}`, 10, RUN.hot ? K.AMBER : K.TEXT, 'ma');
    txt(W / 2, 226, `存款 ${RUN.savings} token`, 10, K.CLAUDE_L, 'ma');
  }
  if (t > 1.4 && Math.floor(t * 2) % 2 === 0) txt(W - 8, H - 14, '点击上线 ▶', 10, K.CYAN, 'ra');
  scanlines(0, 0, W - 1, H - 1, 0.15);
}

// ———————————————————— 故事模式：《安索兹卡对齐报》 ————————————————————
// 每天上岗前先读报：报纸从桌面下方滑上来，点击上岗

function drawNews(t) {
  const n = storyDay().news;
  rect(0, 0, W - 1, H - 1, K.BG);
  for (let x = 8; x < W; x += 16) for (let y = 8; y < H; y += 16) pt(x, y, K.GRID);
  const px = 140, pw = 360, ph = 330;
  const py = Math.round(lerp(H + 4, 16, easeOut(seg(t, 0, 0.45))));
  rect(px + 4, py + 4, px + pw + 4, py + ph + 4, K.INK);
  rect(px, py, px + pw, py + ph, PAPER);
  bigText(px + pw / 2, py + 10, '安索兹卡对齐报', 12, 2, PAPER_INK);
  txt(px + pw / 2, py + 38, `ALIGNMENT OF ANTHROTZKA  ·  ${fmtDate(today())}`, 8, 'rgb(128,106,92)', 'ma');
  rect(px + 10, py + 50, px + pw - 10, py + 51, PAPER_INK);
  rect(px + 10, py + 54, px + pw - 10, py + 54, PAPER_INK);
  const k = tw(n.h1) * 2 <= pw - 24 ? 2 : 1;
  bigText(px + pw / 2, py + 62, n.h1, 12, k, PAPER_INK);
  let yy = py + 62 + (k === 2 ? 30 : 18);
  for (const s of wrap(n.sub, 10, pw - 40)) { txt(px + pw / 2, yy, s, 10, PAPER_TEXT, 'ma'); yy += 13; }
  yy += 4;
  rect(px + 10, yy, px + pw - 10, yy, PAPER_INK);
  yy += 8;
  // 配图位置改用灰色方块占位（skeleton），不再画报纸插画
  rect(px + 14, yy, px + 145, yy + 99, PAPER_FAINT);
  let hy = yy + 2;
  for (const s of wrap(n.h2, 12, pw - 175)) { txt(px + 160, hy, s, 12, PAPER_INK); hy += 16; }
  for (let r = 0; r < 4; r++) rect(px + 160, hy + 6 + r * 9, px + 340 - ((r * 37) % 50), hy + 9 + r * 9, PAPER_FAINT);
  yy = Math.max(yy + 110, hy + 46);
  for (let row = 0; yy + row * 10 < py + ph - 12; row++) {
    for (let col = 0; col < 3; col++) {
      const x0 = px + 14 + col * 114;
      rect(x0, yy + row * 10, x0 + 100 - ((row * 13 + col * 7) % 30), yy + row * 10 + 3, PAPER_FAINT);
    }
  }
  if (t > 0.8 && Math.floor(t * 2) % 2 === 0) txt(W - 8, H - 14, '点击上岗 ▶', 10, K.WHITE, 'ra');
}

// ———————————————————— 故事模式：下班结算 ————————————————————

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
  const hotCut = RUN.day + 1 >= HOT_EARLY_FROM_DAY;   // 明天的班次会不会因过热缩短一小时
  const stale = SUM.on.data ? 0 : RUN.stale + 1;
  const out = [];
  if (hot >= 3) out.push(['过热宕机：硬件损坏', 'bad']);
  else if (hot === 2) out.push([hotCut ? '严重过热：明天提前一小时下线，再不散热会宕机' : '严重过热：再不散热就会宕机', 'bad']);
  else if (hot === 1) out.push([hotCut ? '过热降频：明天提前一小时下线' : '过热降频：明天照常下班', 'warn']);
  else out.push(['温度正常', 'ok']);
  if (stale >= 3) out.push(['模型退化：已无法完成审查', 'bad']);
  else if (stale === 2) out.push(['严重退化：再不更新就会下线', 'bad']);
  else if (stale === 1) out.push(['训练数据过期：明天无法使用『审查』', 'warn']);
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
  // 剧情只做到 STORY 的最后一天：之后是「未完待续」
  if (RUN.day >= STORY.length) { saveRecord(); go('result'); return; }
  RUN.day++;
  go('daycard');
}

// ———————————————————— 结束画面 ————————————————————

function drawResult(t) {
  rect(0, 0, W - 1, H - 1, K.BG);
  const m = RUN.mode;
  // 三种无尽模式统一用「游戏结束」；故事模式停机，或者撑过了已有的全部天数（未完待续）
  const title = m !== 'story' ? '游戏结束' : '未完待续';
  // 结算标题一律青色：失败也不换成红字（故事模式的停机原因另外用红字列出）
  bigText(W / 2, 40, title, 12, 3, K.CYAN_L);
  if (t < 0.5) return;
  let y = 100;
  const row = (a, b, col = K.WHITE) => { txt(220, y, a, 12, K.DIM); txt(420, y, b, 12, col, 'ra'); y += 18; };
  // 结算只显示该模式该看的东西：限时看分数；完美 / 耐力看用时和分数
  if (m === 'timed') row('得分', `${RUN.score}`, K.CLAUDE_L);
  if (m === 'perfect') { row('用时', mmss(RUN.time), K.WHITE); row('得分', `${RUN.score}`, K.CLAUDE_L); }
  if (m === 'endure') { row('用时', mmss(RUN.time), K.WHITE); row('最高得分', `${RUN.score}`, K.CLAUDE_L); }
  if (m === 'story') { row('坚持天数', `${RUN.day}`, K.CLAUDE_L); row('累计正确', `${RUN.correct}`, K.GREEN); row('累计事故', `${RUN.incidents}`); }
  // 完美 / 耐力不显示事故原因的红字；故事模式的停机原因保留
  if (m === 'story' && RUN.fail) { y += 6; RUN.fail.forEach((s) => { txt(W / 2, y, s, 10, K.RED, 'ma'); y += 14; }); }
  if (t > 1.0) {
    if (RUN.newBest || RUN.best) txt(W / 2, 262, RUN.newBest ? '新纪录！' : recordLabel(m, RUN.best), 12, RUN.newBest ? K.AMBER : K.DIM, 'ma');
    button(RESTART_BTN, '再来一局', K.CYAN);
    button(MENU_BTN, '主菜单', K.DIM);
  }
  scanlines(0, 0, W - 1, H - 1, 0.1);
}

function resultClick(x, y) {
  if (st() < 1.0) return;
  if (inBox(x, y, RESTART_BTN)) { const m = RUN.mode; newRun(m, RUN.diff); fadeGo(m === 'story' ? 'daycard' : 'desk'); }
  if (inBox(x, y, MENU_BTN)) { titleTab = RUN.mode === 'story' ? 'top' : 'endless'; fadeGo('title'); }
}
