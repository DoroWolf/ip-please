'use strict';
// 比对模式与验证 SMS：可选栏位、矛盾判定、询问、SMS 表单与身份档案。
// 依赖 station.js 的 D / RUN、desk.js 的窗口函数；绘制在 render-station.js。

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
  issueReturnTicket(e);    // 没有凭证时，询问「凭证缺失」之后才派发临时返回页
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
    const rec = new InfoWin('sms', '身份档案', 'RECORD',
      [['昵称', e.spec.handle, true], ['曾用名', s.names.length ? s.names.join('、') : '无', true], ['手机', s.phone, true]],
      '用户的手机与请求的昵称必须与此档案一致');
    addWin(rec, 'sms', ...clampDesk(250, 214, rec));
    SFX.play('intercom', 0.6);
    toast('身份档案已打印：核对手机号或曾用名', K.GREEN);
  });
}
