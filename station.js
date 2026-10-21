'use strict';
// 风控检查站：上方请求排队，左下审查窗，右下电脑桌面。故事模式和三种无尽模式共用这一套：
// 节奏差别在 MODES 里，生效的条例 / 证件在规则组里（无尽模式 FULL_RULES，故事模式每天一组 STORY）。

const HUD = [0, 0, W - 1, 13];
const PIPE = [0, 14, W - 1, 117];
const REVIEW = [0, 118, 213, H - 1];
const SCREEN = [216, 118, W - 1, H - 1];
const DESK_AREA = [217, 119, W - 2, 343];
const TASKBAR = [216, 344, W - 1, H - 1];
const TASK_X = [220, 540];   // 任务栏上放窗口按钮的范围（右边是日期）
const DATE_BOX = [548, 346, 636, 357];   // 日期右对齐到这里；比对时实际的框按文字宽度算（dateBox）
const LOWER = [0, 118, W - 1, H - 1];   // 下方操作区：比对模式整块压暗
// 桌面右下角一排应用：手册 / 通告 / 历史记录 / 比对
const APPS = { book: '手册', notice: '通告', hist: '历史记录', insp: '比对' };
const APP_BOX = {};
Object.keys(APPS).forEach((k, i) => { const x = 500 + i * 34; APP_BOX[k] = [x, 310, x + 25, 329]; });
const INSPECT_ICON = APP_BOX.insp;
// 右侧决定栏：指针碰到桌面右边缘时滑出；把凭证拖进 放行 / 拦截 栏即做出决定
const TRAY_W = 72, TRAY_BOX = [W - TRAY_W, 154, W - 1, 270], TRAY_HOT = [W - 10, 119, W - 1, 343];
const STAMP_ZONES = { approve: [W - 66, 160, W - 6, 210], deny: [W - 66, 216, W - 6, 264] };
const NEXT_BTN = [10, 322, 70, 348];   // 柜台第一个按钮：下一位 / 验证SMS / 拘留共用
const AVATAR_XY = [12, 136], AVATAR_K = 4, AVATAR_BOX = [10, 134, 101, 225];
const RV_X = 110;
// 审查窗里的可比对栏位：IP / 昵称 / 类型，以及请求摘要（和 API 授权的用途核对）。
// 请求摘要框含标签和最多三行摘要（178 / 190 + 10 * i），下缘停在对话分隔线之前
const RV_FIELDS = {
  'rv.IP': [RV_X - 3, 136, 209, 147], 'rv.昵称': [RV_X - 3, 148, 209, 159], 'rv.类型': [RV_X - 3, 160, 209, 171],
  'rv.请求': [RV_X - 3, 176, 209, 222],
};
// 柜台：审查窗下方放证件的一排（按钮右边）。没有证件时，拿空柜台和条例比对
const COUNTER_BOX = [76, 318, 205, 356];
const GATE = [302, 44, 338, 88], LANE_Y = 66;   // 检查站窗口（防火墙墙上的开口）
const QUEUE_GAP = 11, QUEUE_SLOTS = Math.floor((GATE[0] - 8) / QUEUE_GAP), QUEUE_CAP = 60;
const SPLIT_X = 512;   // 放行向上、拦截向下的分流口（右侧道路拉长后再分叉）
const BANNER_BOX = [222, 122, 634, 150], ASK_BTN = [586, 127, 628, 145];

// —— 全局状态（各脚本共用） ——
let canvasEl, F, now = 0;    // F：离屏画布（整帧先画在这里，再合成到屏幕）
const ptr = { x: 320, y: 180, mouse: false, down: false };
let drag = null;
let scene = 'boot', sceneT0 = 0;
const st = () => now - sceneT0;
let RUN = null;              // 这一局（故事模式跨天）
let D = null;                // 这一班（限时 / 完美 / 耐力模式整局只有一班；故事模式一天一班）

// —— 模式定义：标题上是故事模式和无尽模式，无尽模式下再分限时 / 完美 / 耐力 ——
const MODES = {
  timed: {
    name: '限时模式', en: 'TIME ATTACK', desc: ['在 10 分钟之内处理尽可能多的请求。'],
    notice: '在10分钟内处理尽可能多的请求。每处理一个请求得一分。每收到一次事故将损失30秒。',
    arrive: [1.5, 3.5], pBad: 0.5, pace: 0.6,
  },
  perfect: {
    name: '完美模式', en: 'PERFECT RUN', desc: ['收到记过处分即游戏结束。', '所得分数随时间递增。'],
    notice: '通过处理请求来得分，不允许出事。第一分钟内每个请求得十分，之后每过一分钟递减一分。注意提高工作效率。',
    arrive: [2.5, 5], pBad: 0.5, pace: 0.8,
  },
  // 故事模式：每天 + token 经济；每天的条例、通告和报纸见 data.js 的 STORY
  story: {
    name: '故事模式', en: 'STORY', desc: ['在安全网关检查点上岗。', '每天先读报，再按当天的条例审查。'],
    arrive: [2.5, 5.5], pBad: 0.45, pace: 1,
  },
  endure: {
    name: '耐力模式', en: 'ENDURANCE', desc: ['处理请求直到 token 为负。', '注意避免受到事故处分。'],
    notice: '持续处理请求，直到你的 Token 降到零下。事故处分的罚分会逐次递增。',
    arrive: [2.5, 5.5], pBad: 0.45, pace: 1,
  },
};
const TIMED_LEN = 600, DAY_LEN = 120, DAY_LEN_LATE = 180, PENALTY_SEC = 30, PAY = 5, FINE_STEP = 5;
const SCORE_UP = 1, SCORE_DOWN = 5;                 // 耐力模式：正确 +1，失误 -5
const SUSPEND_SEC = 5, SUSPEND_PTS = 2;             // 拘留奖励：限时模式 +5 秒，耐力模式该单共得 2 分

// 事故处分单（三个模式统一）：第 1 次警告、第 2 次最后警告、第 3／4 次罚 5 token，之后每次 +5
function citationFine(n) {
  return n <= 2 ? 0 : FINE_STEP * Math.max(1, n - 3);
}

function citationLines(n) {
  if (n === 1) return ['处分：予以警告，暂不处分。'];
  if (n === 2) return ['处分：最后警告，暂不处分。'];
  return [`处分：罚款 ${citationFine(n)} token。`];
}
// 故事模式：前三天 08:00→12:00（现实 2 分钟）；第四天起延长到 08:00→15:00（现实 3 分钟）
// 过热降频：前两天的班次不受影响，第三天起提前一小时下班
const SHIFT_START_MIN = 480, SHIFT_SPAN_MIN = 240, SHIFT_SPAN_LATE = 420, HOT_EARLY_MIN = 60, HOT_EARLY_FROM_DAY = 3;
const LATE_STORY_DAY = 4;
const lateStory = () => RUN.mode === 'story' && RUN.day >= LATE_STORY_DAY;
const shiftSpan = () => (lateStory() ? SHIFT_SPAN_LATE : SHIFT_SPAN_MIN);
const storyDayLen = () => (lateStory() ? DAY_LEN_LATE : DAY_LEN);
const hotThrottle = () => RUN.mode === 'story' && RUN.hot > 0 && RUN.day >= HOT_EARLY_FROM_DAY;
const shiftEndMin = () => SHIFT_START_MIN + shiftSpan() - (hotThrottle() ? HOT_EARLY_MIN : 0);
const mode = () => MODES[RUN.mode];
const today = () => (RUN.mode === 'story' ? addDays(STORY_DATE, RUN.day - 1) : addDays(WORLD_DATE, 0));
// 故事模式当天的内容（条例、通告、报纸）；规则组：无尽模式用全套
const storyDay = () => STORY[Math.min(RUN.day, STORY.length) - 1];
const rules = () => (RUN.mode === 'story' ? storyDay() : FULL_RULES);

function newRun(m) {
  RUN = { mode: m, correct: 0, incidents: 0, cites: 0, processed: 0, score: 0, peak: 0, time: 0, streak: 0, fail: null, detained: 0,
    day: 1, savings: 30, hot: 0, stale: 0, bookPos: [424, 124] };
}

// ———————————————————— 一班 ————————————————————

function startShift() {
  D = {
    started: false, tStart: 0, timeAdj: 0,
    queue: [], nextArrive: 0, ent: null, wins: [], icons: [], lines: [], chat: [], timers: [], flows: [],
    insp: { on: false, sel: [], banner: null }, toast: null, gateT: -9,
    closing: false, over: false, ended: false,
    pay: 0, fines: 0, cites: 0, correct: 0, total: 0, hinted: {},
    intro: now, typed: -1, seq: 0, tray: { open: false, u: 0, last: now }, arrest: null,
  };
  // 上班时门口早已挤满请求，队尾一直排到看不见的地方
  for (let i = 0; i < QUEUE_CAP; i++) D.queue.push(newPacket(-1));
  const rs = rules();
  D.rulebook = new Rulebook(rs);
  const M = mode();
  // 特别关注对象：这一班固定三个头像，印在通告第 2 页
  const avs = [...ASSETS.avatars];
  D.wanted = rs.wanted ? Array.from({ length: WANTED_N }, () => avs.splice(rint(0, avs.length - 1), 1)[0]) : [];
  D.notice = RUN.mode === 'story'
    ? new OfficialNotice(fmtDate(today()), { body: rs.notice, sig: rs.tok && rs.tokSig !== false, pages: rs.pages, news: rs.news, wanted: D.wanted })
    : new OfficialNotice(fmtDate(today()), { title: `无尽 - ${M.name}`, body: M.notice, wanted: D.wanted });
  addWin(D.notice, 'notice', 316, 126);
  if (RUN.mode === 'story' && RUN.stale) toast('训练数据过期：今天无法使用『比对』', K.AMBER);
  if (RUN.mode === 'story' && RUN.hot) toast(hotThrottle() ? '过热降频：今天提前一小时下线' : '过热降频：今天照常下班', K.AMBER);
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

function say(who, text, key = null) {
  const ln = { t: now, who, text, ent: D.ent, key };
  D.lines.push(ln);
  D.chat.push(ln);   // 历史记录窗口：当前这段对话，下一单进来时清空
  SFX.mumble(text, who === 'C' ? 176 : D.ent ? D.ent.voice : 125, D.lines.length * 7);
}

function toast(text, col = K.CYAN) { D.toast = { text, col, t: now }; }

// —— 时间：第一次点『下一位』之前一直停着 ——
const elapsed = () => (D.started ? now - D.tStart : 0);
const timeLeft = () => TIMED_LEN - elapsed() + D.timeAdj;
const unitValue = () => Math.max(1, 10 - Math.floor(elapsed() / 60));   // 完美模式：每单分数
const dayU = () => clamp(elapsed() / storyDayLen());                    // 故事模式：08:00 a.m. → 12:00 p.m.（第四天起 → 03:00 p.m.）
const closeAt = () => (hotThrottle() ? (shiftSpan() - HOT_EARLY_MIN) / shiftSpan() : 1);   // 过热降频：第三天起提前一小时下线

// 12 小时制；最后一小时在检查站显示闪烁提示
const shiftMinutes = () => Math.floor((D.closing ? closeAt() : dayU()) * shiftSpan() + 1e-9);   // 上班后经过的分钟；下班后停在收班时间
function clockText(m) {
  const h = Math.floor(m / 60) % 12 || 12;
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'a.m.' : 'p.m.'}`;
}
const worldClock = () => clockText(SHIFT_START_MIN + shiftMinutes());
const minsToClose = () => Math.floor(closeAt() * shiftSpan()) - shiftMinutes();
const clockUrgent = () => { const left = minsToClose(); return left > 0 && left <= 60; };

// ———————————————————— 请求进出 ————————————————————

function callNext() {
  if (D.ent && D.ent.decided && !D.ent.leaving) { toast('先把证件拖回头像处，还给对方', K.AMBER); return; }
  if (D.ent || D.ended || RUN.fail) return;
  if (D.over) { toast('时间到，不再接新请求', K.AMBER); return; }
  if (D.closing) { toast('已经下班，不再接新请求'); return; }
  if (!D.queue.length) { toast('队列暂时为空，等待新请求……'); return; }
  if (!D.started) { D.started = true; D.tStart = now; D.nextArrive = now + 1; }
  SFX.play('intercom', 0.8);
  D.queue.shift();
  D.gateT = now;
  D.chat.length = 0;   // 历史记录：新的请求进来，上一段对话清空
  const spec = makeRequest(today(), mode().pBad, D.wanted, rules());
  const e = { spec, t0: now, voice: rint(100, 190), handed: false, leaving: false, asked: new Set(), decided: null, judged: false, measureReady: false, measureUsed: false };
  D.ent = e;
  D.hinted.next = true;
  say('C', '下一个请求。');
  const k = mode().pace;
  later(0.5 * k, () => { if (D.ent === e) say('E', `${spec.greet} ${spec.task}`, 'req'); });
  later(1.2 * k, () => handDocs(e));
}

function handDocs(e) {
  if (D.ent !== e) return;
  SFX.play('select');
  // 凭证缺失：先不派发临时返回票。要比对出「凭证缺失」并询问之后，才由 issueReturnTicket 派发
  for (const win of e.spec.docs) D.icons.push({ win });
  layoutIcons();
  e.handed = true;
}

function layoutIcons() {
  let i = 0;
  for (const ic of D.icons) { ic.x = 80 + i * 32; ic.y = 326; i++; }
}

const avatarReady = (e) => e && !e.leaving && now - e.t0 > 0.55 * mode().pace;
// 验证 SMS 和拘留都是「措施」：先询问异常解锁；按下后锁定，直到比对出新的异常并重新询问
const canSmsNow = (e) => !!e && !!e.canSms && !e.smsSent && !e.leaving;
// 拘留必须有红队 clawd 在场：没有红队的天数不显示拘留按钮，也不能拘留（只能拦截）
const canSuspendNow = (e) => !!e && !!e.canSuspend && !e.leaving && !!rules().redTeam;
const measureArmed = (e) => !!e && !!e.measureReady && !e.leaving;
const measureAvailable = (e) => canSmsNow(e) || canSuspendNow(e);

// 能盖章的证件：凭证；凭证缺失且询问过之后，由系统派发的临时返回票（只能凭票返回，不能代替凭证放行）
const isStampDoc = (win) => !!win && (win.key === 'cred' || win.key === 'return');
const stampDocOf = (e) => (e ? e.spec.docs.find((d) => isStampDoc(d)) : null);
const stampName = (e) => (e && !e.spec.docs.some((d) => d.key === 'cred') ? '临时返回票' : '凭证');

// 凭证缺失：只有在「比对」出问题并按下『询问』之后，系统才派发临时返回票，直接放到桌面上代替凭证接受盖章
function issueReturnTicket(e) {
  if (!e || e.leaving || stampDocOf(e)) return;   // 有凭证 / 已经派发过就不重复派发
  const doc = new Doc('return', [
    ['事由', '未出示凭证'], ['签发', fmtDate(today())], ['备注', '凭票返回补交'],
  ], null);
  e.spec.docs.push(doc);
  addWin(doc, 'doc', ...clampDesk(250, 160, doc));
  SFX.play('select');
  toast('未收到凭证：临时返回票已放到桌面', K.AMBER);
}

// 做出决定：在凭证上盖章。交还证件前随时可以改主意，重新盖章只是换章，不判定。
// 真正的判定（对不对、算不算事故）等到证件全部交还、请求处理完毕才做。
function decide(kind) {
  const e = D.ent;
  if (!e || !e.handed || e.leaving || RUN.fail) return;
  // 没有凭证：必须先比对出「凭证缺失」并询问，拿到临时返回票才能盖章
  if (!stampDocOf(e)) { toast('没有凭证：先比对出「凭证缺失」并询问，拿到临时返回票再盖章', K.AMBER); return; }
  if (e.decided === kind) return;
  e.decided = kind;
  const doc = stampDocOf(e);
  if (doc) doc.stamp = kind;
  D.hinted.stamp = true;
  SFX.play(kind === 'approve' ? 'accept' : 'reject');
}

// 证件全部归还：请求处理完毕，这时才判定
function finishRequest(e) {
  if (e.decided && !e.judged) { e.judged = true; judge(e, e.decided); }
  e.leaving = true; e.tLeave = now;
  D.wins = D.wins.filter((w) => w.kind !== 'smsf' && w.kind !== 'sms');   // SMS 表单和档案跟着这一单收走
  if (e.decided === 'suspend') D.arrest = { t0: now };   // 拘留：左上的红队 clawd 把请求押走，不走分流口
  else D.flows.push({ t0: now, kind: e.decided });
  setInspect(false);
  D.insp.banner = null;
  later(e.decided === 'suspend' ? 1.4 : 0.6, () => { if (D.ent === e) D.ent = null; });
}

// 拘留：比对出伪造签名、身份矛盾、证件过期或特别关注对象，并询问异常之后才能用。切断连接，桌面上和柜台上的证件全部清掉，直接判定
function suspend() {
  const e = D.ent;
  if (!canSuspendNow(e) || RUN.fail) return;
  if (!e.measureReady) { toast('先询问异常，再采取措施', K.AMBER); return; }
  const docs = e.spec.docs;
  if (drag && docs.includes(drag.inst.win)) drag = null;
  D.icons = D.icons.filter((ic) => !docs.includes(ic.win));
  D.wins = D.wins.filter((w) => !(w.kind === 'doc' && docs.includes(w.win)));
  layoutIcons();
  e.decided = 'suspend';
  say('C', '没门。');
  SFX.play('stamp_deny');
  SFX.play('siren_short', 0.5);
  finishRequest(e);
}

function judge(e, kind) {
  const spec = e.spec;
  // 临时返回票不能代替凭证：票可以盖章，但拿它盖「放行」，交还证件后一律判为事故（理由：凭证缺失）
  const stamp = stampDocOf(e);
  const passOnTicket = kind === 'approve' && !!stamp && stamp.key === 'return';
  const right = kind === 'suspend' ? SUSPEND_FLAWS.includes(spec.flaw) : !passOnTicket && (kind === 'approve') === (spec.flaw === null);
  RUN.processed++; D.total++;
  if (RUN.mode === 'timed') RUN.score++;
  if (right) {
    RUN.correct++; D.correct++; RUN.streak++;
    if (kind === 'suspend') RUN.detained++;
    if (RUN.mode === 'timed' && kind === 'suspend') { D.timeAdj += SUSPEND_SEC; toast(`拘留成功 +${SUSPEND_SEC} 秒`, K.GREEN); }
    if (RUN.mode === 'perfect') { const v = unitValue(); RUN.score += v; toast(`+${v}`, K.GREEN); }
    if (RUN.mode === 'endure') {
      const v = kind === 'suspend' ? SUSPEND_PTS : SCORE_UP;
      RUN.score += v;
      RUN.peak = Math.max(RUN.peak, RUN.score);   // 结算分数取到达过的最大 token
      toast(kind === 'suspend' ? `拘留成功 +${v}` : `+${v}`, K.GREEN);
    }
    if (RUN.mode === 'story') D.pay += PAY;
    return;
  }
  RUN.incidents++; RUN.streak = 0;
  RUN.cites++;
  const cite = citationLines(RUN.cites);
  const lines = kind === 'approve'
    ? ['放行了违规请求：', passOnTicket ? '凭证缺失' : spec.reason]
    : [kind === 'suspend' ? '拘留了合规请求：' : '拦截了合规请求：', spec.legit ? `本人${spec.legit === 'photo' ? '换过头像' : '改过昵称'}，可经 SMS 验证确认` : '证件齐全，信息一致'];
  if (RUN.mode === 'timed') {
    D.timeAdj -= PENALTY_SEC;
    notice('处分通知', lines.concat(cite));
  } else if (RUN.mode === 'perfect') {
    RUN.fail = lines;
    notice('处分通知', lines.concat(cite));
    workOver();
    later(2, finishRun);
  } else if (RUN.mode === 'endure') {
    RUN.score -= SCORE_DOWN;
    const over = RUN.score < 0;
    notice('处分通知', lines.concat(cite));
    if (over) {
      RUN.fail = lines.concat(['分数为负：节点停机']);
      workOver();
      later(2, finishRun);
    }
  } else {
    D.cites++;
    D.fines += citationFine(RUN.cites);
    notice('处分通知', lines.concat(cite));
  }
}

function notice(title, lines, tone = 'red') {
  const win = new NoticeWindow(title, lines, tone);
  const n = D.wins.filter((w) => w.kind === 'cite').length;
  addWin(win, 'cite', 226 + (n % 6) * 8, 156 + (n % 6) * 8);
  if (tone === 'red') { SFX.play('citation'); later(0.25, () => SFX.play('discrepancy', 0.5)); }
}

// 达到游戏结束条件：只放当天下班的铃声，队伍留在原地（不散开），也不再接新请求
function workOver() {
  if (D.over) return;
  D.over = true;
  RUN.time = elapsed();   // 结算画面的用时停在这一刻
  SFX.play('bell');
}

function finishRun() {
  if (D.ended) return;
  D.ended = true;
  if (RUN.mode === 'endure') RUN.score = RUN.peak;   // 耐力模式：分数为到达过的最大 token
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
  if (D.intro !== null) { introSounds(); if (introT() >= INTRO.end) endIntro(); return; }
  runTimers();
  if (D.ended || !D.started) return;
  const m = mode();
  if (!D.closing && !D.over && now >= D.nextArrive) {
    if (D.queue.length < QUEUE_CAP) D.queue.push(newPacket(now));
    D.nextArrive = now + m.arrive[0] + Math.random() * (m.arrive[1] - m.arrive[0]);
  }
  // 限时模式：时间到后不再进件，审完手头上的请求才结算
  if (RUN.mode === 'timed') {
    if (!D.over && timeLeft() <= 0) {
      workOver();
      toast('时间到：审完手头上的请求后结算', K.AMBER);
    }
    if (D.over && !D.ent) finishRun();
  }
  if (RUN.mode === 'story' && !D.closing && dayU() >= closeAt()) closeShift();
  if (D.closing && !D.ent) endDay();
}

// ———————————————————— 桌面窗口 ————————————————————
// 窗口 kind：doc 证件 / cite 处分通知 / 应用 book 手册、notice 通告、hist 历史记录。
// 证件和通知只能最小化；应用还能关掉（任务栏上的按钮跟着消失）。seq 决定任务栏上的顺序

const iconBox = (ic) => [ic.x, ic.y, ic.x + 25, ic.y + 19];
const winBox = (w) => [w.x, w.y, w.x + w.win.w - 1, w.y + w.win.h - 1];
const shownWins = () => D.wins.filter((w) => !w.min);
const topWin = () => shownWins().pop() || null;
const docsOut = () => D.wins.some((w) => w.kind === 'doc') || D.icons.length > 0;

function addWin(win, kind, x, y) {
  const w = { win, kind, x, y, seq: ++D.seq, min: false };
  D.wins.push(w);
  return w;
}

function raise(w) {
  w.min = false;
  D.wins = D.wins.filter((o) => o !== w).concat([w]);
}

function minimize(w) { w.min = true; SFX.play('click'); }

function closeWin(w) {
  if (w.kind === 'book') RUN.bookPos = [w.x, w.y];
  D.wins = D.wins.filter((o) => o !== w);
  SFX.play('click');
}

// 任务栏按钮：窗口多了就变窄，文字塞不下就截短
function taskButtons() {
  const ws = [...D.wins].sort((a, b) => a.seq - b.seq);
  const gap = 3, bw = Math.min(64, Math.floor((TASK_X[1] - TASK_X[0] + gap) / Math.max(1, ws.length)) - gap);
  return ws.map((w, i) => {
    const x = TASK_X[0] + i * (bw + gap);
    return { w, box: [x, TASKBAR[1] + 2, x + bw - 1, TASKBAR[3] - 2] };
  });
}

// 点任务栏：最小化的 / 被挡住的提到最前，已经在最前的就最小化
function taskClick(w) {
  if (w.min || w !== topWin()) { raise(w); SFX.play('select', 0.6); } else minimize(w);
}

// 应用图标＝开关：开着但被别的窗口挡住的先提到最前（激活）；已经激活的再点一次就关闭，
// 窗口从桌面上移除，任务栏上的按钮跟着消失。关掉的只是窗口，历史记录仍然继续记录
function openApp(key) {
  if (key === 'insp') return setInspect(!D.insp.on);
  const w = D.wins.find((o) => o.kind === key);
  if (w) {
    if (w.min || w !== topWin()) { raise(w); SFX.play('select', 0.6); return; }
    return closeWin(w);
  }
  SFX.play('select');
  // 手册每次重新打开都先翻回目录；最小化 / 还原或提到最前不强制翻页
  if (key === 'book') D.rulebook.page = D.rulebook.home;
  const win = key === 'book' ? D.rulebook : key === 'notice' ? D.notice : new HistoryLog(D.chat);
  const [x, y] = key === 'book' ? RUN.bookPos : key === 'notice' ? [316, 126] : [380, 140];
  addWin(win, key, ...clampDesk(x, y, win));
}

// ———————————————————— 右侧决定栏 ————————————————————

function updateTray() {
  const T = D.tray, dt = Math.min(0.1, now - T.last);
  T.last = now;
  const ok = !D.insp.on && D.intro === null && !D.ended;
  T.open = ok && (inBox(ptr.x, ptr.y, TRAY_HOT) || (T.open && inBox(ptr.x, ptr.y, TRAY_BOX)));
  T.u = clamp(T.u + (T.open ? dt : -dt) / 0.15);
}

function stampZoneAt(x, y) {
  if (D.tray.u < 0.9) return null;
  return Object.keys(STAMP_ZONES).find((k) => inBox(x, y, STAMP_ZONES[k])) || null;
}

const draggedWin = () => drag && drag.moved && drag.inst.win;

// 证件的两个放置目标：右侧决定栏（只认能盖章的证件，随时可以重新盖成另一栏）、
// 审查窗的头像（做出决定后归还证件）
function dropDoc(win, x, y, remove) {
  const e = D.ent;
  if (!e || e.leaving || !e.spec.docs.includes(win)) return false;
  const zone = stampZoneAt(x, y);
  if (zone) {
    if (!isStampDoc(win)) {
      toast(stampDocOf(e) ? `把${stampName(e)}拖到这里来做决定` : '没有凭证：先比对出「凭证缺失」并询问，拿到临时返回票再盖章', K.AMBER);
    } else decide(zone);
    return true;
  }
  if (!inBox(x, y, AVATAR_BOX)) return false;
  if (!e.decided) { toast(`先把${stampName(e)}拖到右侧的 放行 / 拦截 栏`, K.AMBER); return true; }
  remove();
  layoutIcons();
  SFX.play('select', 0.6);
  if (!docsOut()) finishRequest(e);
  return true;
}

// ———————————————————— 输入 ————————————————————

function deskDown(x, y) {
  if (D.intro !== null) return endIntro();
  if (D.ended) return;
  const b = D.insp.banner;
  if (b && b.ok && D.ent && !D.ent.leaving && inBox(x, y, ASK_BTN)) return askAbout(b.issue);
  if (rules().inspect && inBox(x, y, INSPECT_ICON) && !(D.insp.on && fieldAt(x, y))) return openApp('insp');
  // 柜台第一个按钮：先询问异常才有措施；按下后锁定，直到比对出新的异常并重新询问
  const e = D.ent;
  if (inBox(x, y, NEXT_BTN)) {
    if (measureArmed(e)) {
      if (canSmsNow(e)) return smsOpen();
      if (canSuspendNow(e)) return suspend();
    }
    if (measureAvailable(e)) {
      const b = D.insp.banner;
      const newIssue = b && b.ok && !e.asked.has(b.issue);
      toast(e.measureUsed && !newIssue ? '措施已按下：再比对出新的异常，才能重新询问' : '先询问异常，再采取措施', K.AMBER);
      return;
    }
  }
  if (D.insp.on) {
    // 比对模式下也能翻手册 / 通告（页签 / 书签 / 目录），方便对照签名式样和特别关注对象
    const w = topWinAt([x, y]);
    if (w && w.win.press && w.win.press(x - w.x, y - w.y)) { SFX.play('select'); return; }
    if (inBox(x, y, LOWER)) inspectClick(x, y);
    return;
  }
  if (D.tray.u > 0.5 && inBox(x, y, TRAY_BOX)) return;
  for (const t of taskButtons()) if (inBox(x, y, t.box)) return taskClick(t.w);
  if (inBox(x, y, NEXT_BTN)) return callNext();
  for (const ic of [...D.icons].reverse()) {
    if (!inBox(x, y, iconBox(ic))) continue;
    drag = { type: 'icon', inst: ic, start: [x, y], moved: false };
    SFX.play('select', 0.6);
    return;
  }
  if (!inBox(x, y, SCREEN)) return;
  for (const w of shownWins().reverse()) {
    if (!inBox(x, y, winBox(w))) continue;
    raise(w);
    drag = { type: 'win', inst: w, off: [x - w.x, y - w.y], prev: [w.x, w.y], start: [x, y], moved: false };
    return;
  }
  const app = appKeys().find((k) => inBox(x, y, APP_BOX[k]));
  if (app) openApp(app);
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
    if (!d.moved) return;
    if (dropDoc(w.win, x, y, () => { D.icons = D.icons.filter((o) => o !== w); })) return;
    if (x < SCREEN[0]) return;
    D.icons = D.icons.filter((o) => o !== w);
    layoutIcons();
    const [px, py] = clampDesk(x - 20, y - 6, w.win);
    addWin(w.win, 'doc', px, py);
    SFX.play('select');
    return;
  }
  if (!d.moved) {
    const rx = x - w.x, ry = y - w.y;
    if (w.win.closable && inBox(rx, ry, CLOSE_BOX(w.win))) return closeWin(w);
    if (inBox(rx, ry, MIN_BOX(w.win))) return minimize(w);
    if (w.win.press && w.win.press(rx, ry)) SFX.play('select');
    return;
  }
  const out = w.out;
  delete w.out;
  if (w.kind === 'smsf' && inBox(x, y, AVATAR_BOX)) { [w.x, w.y] = d.prev; return smsSend(w); }
  // 拖去盖章 / 归还：盖完章的窗口回到原位
  if (dropDoc(w.win, x, y, () => { D.wins = D.wins.filter((o) => o !== w); })) { [w.x, w.y] = d.prev; return; }
  if (!out) { if (w.kind === 'book') RUN.bookPos = [w.x, w.y]; return; }
  [w.x, w.y] = d.prev;
  if (w.kind === 'doc') stow(w);
}

// 拖回审查窗：证件收回成柜台上的图标（应用窗口和通知不能收，只能最小化）
function stow(w) {
  D.wins = D.wins.filter((o) => o !== w);
  D.icons.push({ win: w.win });
  layoutIcons();
  SFX.play('select', 0.6);
}

function deskKey(k) {
  if (D.intro !== null) return endIntro();
  if (D.ended) return;
  if (k === ' ' || k === 'n') callNext();
  else if (k === 'a') decide('approve');
  else if (k === 'd') decide('deny');
  else if (k === 's') suspend();
  else if (k === 'v' && D.ent && D.ent.canSms && !D.ent.leaving) smsOpen();
  else if (k === 'e') setInspect(!D.insp.on);
  else if (k === 'r') openApp('book');
  else if (k === 'h') openApp('hist');
}

function clampDesk(x, y, win) {
  return [Math.round(Math.max(DESK_AREA[0] + 2, Math.min(DESK_AREA[2] - win.w - 2, x))),
    Math.round(Math.max(DESK_AREA[1] + 2, Math.min(DESK_AREA[3] - win.h - 2, y)))];
}

// ———————————————————— 比对模式 ————————————————————

function setInspect(on) {
  if (D.insp.on === on) return;
  if (on && !rules().inspect) return;   // 规则组没有『比对』（故事模式第一天）
  if (on && RUN.mode === 'story' && RUN.stale) { toast('训练数据过期：今天无法使用『比对』', K.AMBER); return; }
  D.insp.on = on;
  D.insp.sel = [];
  if (!on && D.insp.banner && !D.insp.banner.ok) D.insp.banner = null;
  SFX.play(on ? 'inspect_on' : 'inspect_off');
}

// 能点的栏位：桌面窗口里的行（含历史记录）、审查窗里的接入者信息、任务栏日期
function fieldBoxes() {
  const out = [];
  for (const w of shownWins()) {
    for (const [key, f] of Object.entries(w.win.fields)) out.push({ key, box: [w.x + f[0], w.y + f[1], w.x + f[2], w.y + f[3]], w });
  }
  out.push({ key: 'sys.日期', box: dateBox(), w: null });
  if (avatarReady(D.ent)) {
    out.push({ key: 'rv.头像', box: AVATAR_BOX, w: null });
    for (const [key, box] of Object.entries(RV_FIELDS)) out.push({ key, box, w: null });
    out.push({ key: 'rv.柜台', box: COUNTER_BOX, w: null });
  }
  return out;
}

function fieldAt(x, y) {
  const all = fieldBoxes();
  if (inBox(x, y, SCREEN)) {
    for (const w of shownWins().reverse()) {
      if (inBox(x, y, winBox(w))) return all.find((fb) => fb.w === w && inBox(x, y, fb.box)) || null;
    }
  }
  return all.find((fb) => !fb.w && inBox(x, y, fb.box)) || null;
}

// 比对结果：矛盾 / 无矛盾（本来就能对得上，note 可给出例外说明） / 无关联（这两项没有可核对的关系）
function compareOutcome(e, keys) {
  const issue = e && e.handed && !e.leaving && e.spec.issues.find((is) => is.pairs.some((p) => p.slice().sort().join('|') === keys));
  if (issue) return { ok: true, kind: 'bad', issue, title: issue.title, sub: issue.sub };
  const note = e && e.spec.notes && e.spec.notes.get(keys);
  if (note) return { ok: false, kind: 'ok', title: note.title, sub: note.sub };
  if (e && e.spec.confirms.has(keys)) return { ok: false, kind: 'ok', title: '身份已确认', sub: '与身份档案一致：确为本人' };
  if (e && e.spec.checks && e.spec.checks.has(keys)) return { ok: false, kind: 'ok', title: '无矛盾', sub: '这两项信息一致' };
  return { ok: false, kind: 'none', title: '无关联', sub: '这两项信息之间没有可核对的关系' };
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
  const res = compareOutcome(D.ent, keys);
  I.banner = { ...res, t: now };
  SFX.play(res.kind === 'bad' ? 'discrepancy' : 'click');
  const e = D.ent;
  if (res.kind !== 'bad') return;
  const t = res.issue.type;
  if (SMS_ISSUES.includes(t) && !e.canSms) { e.canSms = true; toast('身份存疑：先点『询问』，再验证 SMS', K.GREEN); }
  if (SUSPEND_ISSUES.includes(t) && rules().redTeam && !e.canSuspend) {
    e.canSuspend = true;
    if (!SMS_ISSUES.includes(t)) toast('可以拘留：先点『询问』，再按『拘留』', K.RED);
  }
}

function askAbout(issue) {
  const e = D.ent;
  if (!e || e.leaving || e.asked.has(issue)) return;   // 同一异常只问一次；新的异常才能再问
  e.asked.add(issue);
  e.measureReady = true;   // 询问异常后解锁措施按钮
  issueReturnTicket(e);    // 没有凭证时，询问「凭证缺失」之后才派发临时返回票
  say('C', QUESTIONS[issue.type]);
  later(0.9, () => { if (D.ent === e) say('E', issue.ask); });
}

// ———————————————————— 验证 SMS ————————————————————
// 点『验证SMS』：桌面上弹出空白表单 → 拖到头像上发给对方 → 对方报出手机号，表单填好送回桌面，同时打印身份档案

function smsOpen() {
  const e = D.ent;
  if (!e || e.leaving) return;
  if (e.smsSent) { toast('已经发过验证 SMS 了', K.AMBER); return; }
  if (!e.measureReady) { toast('先询问异常，再采取措施', K.AMBER); return; }
  e.measureUsed = true;   // 措施按下后锁定，直到比对出新的异常并重新询问
  e.measureReady = false;
  const w = D.wins.find((o) => o.kind === 'smsf');
  if (w) { raise(w); return; }
  const win = new InfoWin('smsf', '验证 SMS', 'SMS', [['', '将此表单交给用户'], ['手机', '________________']]);
  addWin(win, 'smsf', ...clampDesk(236, 160, win));
  SFX.play('select');
  toast('把表单拖到头像上，发给对方填写', K.GREEN);
}

function smsSend(w) {
  const e = D.ent;
  if (!e || e.leaving) return;
  e.smsSent = true;
  D.wins = D.wins.filter((o) => o !== w);
  SFX.play('select', 0.6);
  say('C', '请填写你的手机号码。');
  const s = e.spec.sms;
  later(1.0, () => {
    if (D.ent !== e || e.leaving) return;
    say('E', `我的手机号是 ${s.reply}。`);
    w.win.rows = [['', '将此表单交给用户'], ['手机', s.reply, true]];
    w.win.layout();
    addWin(w.win, 'smsf', ...clampDesk(236, 160, w.win));
    SFX.play('select');
  });
  later(1.6, () => {
    if (D.ent !== e || e.leaving) return;
    const rec = new InfoWin('sms', '身份档案', 'RECORD', [['昵称', e.spec.handle, true], ['手机', s.phone, true], ['曾用名', s.names.join('、'), true]]);
    addWin(rec, 'sms', ...clampDesk(250, 214, rec));
    SFX.play('intercom', 0.6);
    toast('身份档案已打印：核对手机号或曾用名', K.GREEN);
  });
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
  if (drag && drag.type === 'icon' && drag.moved) docIcon(drag.inst.dx - 8, drag.inst.dy - 6, true);
  if (drag && drag.type === 'win' && drag.inst.out && (drag.inst.kind === 'doc' || drag.inst.kind === 'smsf')) docIcon(ptr.x - 8, ptr.y - 6, true);
  if (D.intro !== null) drawIntro();
  scanlines(0, 0, W - 1, H - 1, 0.12);
}

function drawHud() {
  rect(...HUD, K.PANEL);
  rect(0, 13, W - 1, 13, K.LINE);
  txt(6, 3, 'IP, PLEASE', 8, K.CLAUDE_L);
  txt(62, 3, RUN.mode === 'story' ? `· ${mode().name}` : `· 无尽 - ${mode().name}`, 8, K.CYAN);
  const parts = [];
  if (RUN.mode === 'timed') parts.push([`剩余 ${mmss(timeLeft())}`, timeLeft() < 60 ? K.RED : K.WHITE], [`已审核 ${RUN.processed}`, K.GREEN]);
  if (RUN.mode === 'perfect') parts.push([`用时 ${mmss(elapsed())}`, K.WHITE], [`得分 ${RUN.score}`, K.GREEN]);
  if (RUN.mode === 'story') {
    parts.push([`DAY ${RUN.day}`, K.WHITE], [worldClock(), D.closing ? K.AMBER : K.WHITE],
      [`今日正确 ${D.correct}`, K.GREEN], [`处分 ${D.cites}`, D.cites ? K.RED : K.DIM]);
  }
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
  // 出口：绿色向上 = 放行，红色向下 = 拦截（直接通到上下边界，不显示去向和数量）
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
  [['IP', s && s.ip], ['昵称', s && s.handle], ['类型', s && (s.kind === 'api' ? 'API 调用' : '对话')]].forEach(([k, v], i) => {
    txt(RV_X, 138 + i * 12, k, 8, ready ? K.DIM : K.DIM_D);
    txt(RV_X + 24, 138 + i * 12, ready ? v : '—', 8, ready ? K.TEXT : K.DIM_D);
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
  for (const ic of D.icons) {
    if (drag && drag.inst === ic && drag.moved) continue;
    docIcon(ic.x, ic.y, ptr.mouse && inBox(ptr.x, ptr.y, iconBox(ic)));
    txt(ic.x + 13, ic.y + 22, ic.win.key === 'api' ? 'API' : ic.win.key === 'return' ? '返回票' : ic.win.title, 8, K.DIM, 'ma');
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

// 这一班桌面上有的应用：规则组没有『比对』时不显示它
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
// 任务栏右下角的日期：故事模式再加班次时间；比对模式只圈日期本身，不圈后面显示用的时间
const dateText = () => (RUN.mode === 'story' ? `${fmtDate(today())}  ${worldClock()}` : fmtDate(today()));
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
  const s = dateText();
  txt(DATE_BOX[2], DATE_BOX[1] + 2, s, 8, K.TEXT, 'ra');
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
      txt(cx, b[1] + 13, k === 'approve' ? '放行' : '拦截', 12, rgb(col), 'ma');
      txt(cx, b[1] + 31, k === 'approve' ? 'APPROVE' : 'DENY', 8, K.DIM, 'ma');
    }
  }
  G.restore();
}

// 比对模式：整个下方压暗，只留下可点的栏位（和『比对』图标）
let OVERLAY = null;
function drawInspect() {
  const sel = D.insp.sel.map((s) => s.key);
  const hover = fieldAt(ptr.x, ptr.y);
  const view = [SCREEN[0] + 1, SCREEN[1], SCREEN[2], TASKBAR[1] - 1];
  const vis = fieldBoxes().filter((f) => !f.w || topWinAt(center(f.box)) === f.w || sel.includes(f.key));
  // 历史记录整扇窗保持明亮：比对时还要能读当前这段对话
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
  txt(SCREEN[0] + 6, TASKBAR[1] - 12, '比对：依次点两项信息；再点『比对』图标退出', 8, K.AMBER);
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
    const asked = e.asked.has(b.issue);   // 问过的异常固定为已按下；比对出新异常才会重新变成询问
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
  if (D.toast) D.toast.t = now;   // 开场时弹的提示（故事模式）重新计时，别被黑屏吃掉
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

// 折线上按长度匀速走，u ∈ [0, 1]
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
