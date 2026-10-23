'use strict';
// 桌面窗口与本班输入：窗口开关 / 最小化 / 任务栏、右侧决定栏、证件拖放、鼠标与键盘分发。
// 依赖 station.js 的 D / RUN / 常量与 docs.js 的窗口类；绘制在 render-station.js。

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
      toast(stampDocOf(e) ? `把${stampName(e)}拖到这里来做决定` : '没有凭证：先比对出「凭证缺失」并询问，拿到临时返回页再盖章', K.AMBER);
    } else decide(zone);
    return true;
  }
  if (!inBox(x, y, AVATAR_BOX)) return false;
  if (!e.decided) { toast(`先把${stampName(e)}拖到右侧的 放行 / 拒绝 栏`, K.AMBER); return true; }
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
