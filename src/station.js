'use strict';
// 风控检查站：上方请求排队，左下审查窗，右下电脑桌面。故事模式和三种无尽模式共用这一套：
//
// 本文件：全局状态、模式与计时、一班的生命周期、请求进出与判定。
// 桌面窗口 / 拖放 → desk.js　审查 / 验证 SMS → inspect.js　绘制 → render-station.js　开场 → intro.js
// 载入顺序见 index.html：station.js 必须先于 desk.js / inspect.js / render-station.js / intro.js。
// 节奏差别在 MODES 里，生效的条例 / 证件在规则组里（无尽模式 FULL_RULES，故事模式每天一组 STORY）。

const HUD = [0, 0, W - 1, 13];
const PIPE = [0, 14, W - 1, 117];
const REVIEW = [0, 118, 213, H - 1];
const SCREEN = [216, 118, W - 1, H - 1];
const DESK_AREA = [217, 119, W - 2, 343];
const TASKBAR = [216, 344, W - 1, H - 1];
const TASK_X = [220, 540];   // 任务栏上放窗口按钮的范围（右边是日期）
const DATE_BOX = [548, 346, 636, 357];   // 日期右对齐到这里；审查时实际的框按文字宽度算（dateBox）
const LOWER = [0, 118, W - 1, H - 1];   // 下方操作区：审查模式整块压暗
// 桌面右下角一排应用：手册 / 通告 / 历史记录 / 审查
const APPS = { book: '手册', notice: '通告', hist: '历史记录', insp: '审查' };
const APP_BOX = {};
Object.keys(APPS).forEach((k, i) => { const x = 500 + i * 34; APP_BOX[k] = [x, 310, x + 25, 329]; });
const INSPECT_ICON = APP_BOX.insp;
// 右侧决定栏：指针碰到桌面右边缘时滑出；把凭证拖进 放行 / 拒绝 栏即做出决定
const TRAY_W = 72, TRAY_BOX = [W - TRAY_W, 154, W - 1, 270], TRAY_HOT = [W - 10, 119, W - 1, 343];
const STAMP_ZONES = { approve: [W - 66, 160, W - 6, 210], deny: [W - 66, 216, W - 6, 264] };
const NEXT_BTN = [10, 322, 70, 348];   // 柜台第一个按钮：下一位 / 验证SMS / 拘留共用
const AVATAR_XY = [12, 136], AVATAR_K = 4, AVATAR_BOX = [10, 134, 101, 225];
const RV_X = 110;
// 审查窗里的可审查栏位：接入者本人（IP / 昵称 / 类型）。请求摘要印在令牌上（tok.请求）。
const RV_FIELDS = {
  'rv.IP': [RV_X - 3, 136, 209, 147], 'rv.昵称': [RV_X - 3, 148, 209, 159], 'rv.类型': [RV_X - 3, 160, 209, 171],
};
// 柜台：审查窗下方放证件的一排（按钮右边）。没有证件时，拿空柜台和条例审查
const COUNTER_BOX = [76, 318, 205, 356];
const GATE = [302, 44, 338, 88], LANE_Y = 66;   // 检查站窗口（防火墙墙上的开口）
const QUEUE_GAP = 11, QUEUE_SLOTS = Math.floor((GATE[0] - 8) / QUEUE_GAP), QUEUE_CAP = 60;
const SPLIT_X = 512;   // 放行向上、拒绝向下的分流口（右侧道路拉长后再分叉）
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
    ? new OfficialNotice(fmtDate(today()), { body: rs.notice, sig: !!rs.sig, pages: rs.pages, news: rs.news, wanted: D.wanted })
    : new OfficialNotice(fmtDate(today()), { title: `无尽 - ${M.name}`, body: M.notice, wanted: D.wanted });
  addWin(D.notice, 'notice', 316, 126);
  if (RUN.mode === 'story' && RUN.stale) toast('训练数据过期：今天无法使用『审查』', K.AMBER);
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

// 12 小时制
const shiftMinutes = () => Math.floor((D.closing ? closeAt() : dayU()) * shiftSpan() + 1e-9);   // 上班后经过的分钟；下班后停在收班时间
function clockText(m) {
  const h = Math.floor(m / 60) % 12 || 12;
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'a.m.' : 'p.m.'}`;
}
const worldClock = () => clockText(SHIFT_START_MIN + shiftMinutes());
// 下班前一小时：右下角的时间开始黄白闪烁，提醒收班
const lastHour = () => RUN.mode === 'story' && !D.closing && shiftEndMin() - (SHIFT_START_MIN + shiftMinutes()) <= 60;

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
  // 请求摘要印在令牌上：没有令牌时本人只会打招呼，不会主动说明来意
  const said = spec.taskOnTok ? `${spec.greet} ${spec.task}` : spec.greet;
  later(0.5 * k, () => { if (D.ent === e) say('E', said, spec.taskOnTok ? 'req' : null); });
  later(1.2 * k, () => handDocs(e));
}

function handDocs(e) {
  if (D.ent !== e) return;
  SFX.play('select');
  // 凭证缺失：先不派发临时返回页。要审查出「凭证缺失」并询问之后，才由 issueReturnTicket 派发
  for (const win of e.spec.docs) D.icons.push({ win });
  layoutIcons();
  e.handed = true;
}

function layoutIcons() {
  let i = 0;
  for (const ic of D.icons) { ic.x = 80 + i * 32; ic.y = 326; i++; }
}

const avatarReady = (e) => e && !e.leaving && now - e.t0 > 0.55 * mode().pace;
// 验证 SMS 和拘留都是「措施」：先询问异常解锁；按下后锁定，直到审查出新的异常并重新询问
const canSmsNow = (e) => !!e && !!e.canSms && !e.smsSent && !e.leaving;
// 拘留必须有红队 clawd 在场：没有红队的天数不显示拘留按钮，也不能拘留（只能拒绝）
const canSuspendNow = (e) => !!e && !!e.canSuspend && !e.leaving && !!rules().redTeam;
const measureArmed = (e) => !!e && !!e.measureReady && !e.leaving;
const measureAvailable = (e) => canSmsNow(e) || canSuspendNow(e);

// 能盖章的证件：凭证；凭证缺失且询问过之后，由系统派发的临时返回页（只能凭票返回，不能代替凭证放行）
const isStampDoc = (win) => !!win && (win.key === 'cred' || win.key === 'return');
const stampDocOf = (e) => (e ? e.spec.docs.find((d) => isStampDoc(d)) : null);
const stampName = (e) => (e && !e.spec.docs.some((d) => d.key === 'cred') ? '临时返回页' : '凭证');

// 凭证缺失：只有在「审查」出问题并按下『询问』之后，系统才派发临时返回页，直接放到桌面上代替凭证接受盖章
function issueReturnTicket(e) {
  if (!e || e.leaving || stampDocOf(e)) return;   // 有凭证 / 已经派发过就不重复派发
  // 版面只印一行：这张票只用于拒绝请求
  const doc = new Doc('return', [['', '仅限用于拒绝请求']], null);
  e.spec.docs.push(doc);
  addWin(doc, 'doc', ...clampDesk(250, 160, doc));
  SFX.play('select');
  toast('未收到凭证：临时返回页已放到桌面', K.AMBER);
}

// 做出决定：在凭证上盖章。交还证件前随时可以改主意，重新盖章只是换章，不判定。
// 真正的判定（对不对、算不算事故）等到证件全部交还、请求处理完毕才做。
function decide(kind) {
  const e = D.ent;
  if (!e || !e.handed || e.leaving || RUN.fail) return;
  // 没有凭证：必须先审查出「凭证缺失」并询问，拿到临时返回页才能盖章
  if (!stampDocOf(e)) { toast('没有凭证：先审查出「凭证缺失」并询问，拿到临时返回页再盖章', K.AMBER); return; }
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

// 拘留：审查出伪造签名、身份矛盾、证件过期或特别关注对象，并询问异常之后才能用。切断连接，桌面上和柜台上的证件全部清掉，直接判定
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
  // 临时返回页不能代替凭证：票可以盖章，但拿它盖「放行」，交还证件后一律判为事故（理由：凭证缺失）
  const stamp = stampDocOf(e);
  const passOnTicket = kind === 'approve' && !!stamp && stamp.key === 'return';
  const right = kind === 'suspend' ? SUSPEND_FLAWS.includes(spec.flaw) : !passOnTicket && (kind === 'approve') === (spec.flaw === null);
  RUN.processed++; D.total++;
  if (RUN.mode === 'timed') RUN.score++;
  // 放行：网关对通过的请求说一句标准招呼
  if (kind === 'approve') say('C', '欢迎使用 Claude。');
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
    : [kind === 'suspend' ? '拘留了合规请求：' : '拒绝了合规请求：', spec.legit ? `本人${spec.legit === 'photo' ? '换过头像' : '改过昵称'}，可经 SMS 验证确认` : '证件齐全，信息一致'];
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
  fadeGo('result', 0.9, 0.5);   // 先慢慢压黑，再从黑屏进入结算
}

// 下班：排队的请求全部离开，处理完手上这个就结束
function closeShift() {
  D.closing = true;
  for (const p of D.queue) p.leave = now + Math.random() * 0.4;
  later(1.8, () => { D.queue = []; });
  SFX.play('bell');
  toast(`排队的请求已离开`, K.AMBER);
}

function endDay() {
  if (D.ended) return;
  D.ended = true;
  later(2.4, () => fadeGo('summary', 0.9, 0.5));   // 先慢慢压黑，再从黑屏进入结算
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
