'use strict';
// 桌面上的窗口：证件（凭证 / 令牌 / API 授权）、规则手册、官方通告、事故通知、历史记录。
// 每种窗口知道自己的尺寸、怎么画、各栏位的相对坐标（比对模式用）。

const TITLE_H = 12;
const DOC_SUBS = { cred: 'CREDENTIAL', tok: 'TOKEN', api: 'API ACCESS' };
const SIGNER_COL = { cred: C.CYAN, tok: C.AMBER, api: C.GREEN };
// 标题栏右端的按钮（窗口内相对坐标）：应用（手册 / 通告 / 历史记录）有关闭钮，证件和通知只能最小化
const CLOSE_BOX = (win) => [win.w - 12, 1, win.w - 2, TITLE_H - 2];
const MIN_BOX = (win) => (win.closable ? [win.w - 24, 1, win.w - 14, TITLE_H - 2] : CLOSE_BOX(win));

function winChrome(x, y, w, h, title, sub, col, colD, closable = false) {
  rect(x + 2, y + 2, x + w + 1, y + h + 1, 'rgba(0,0,0,0.45)');
  rect(x, y, x + w - 1, y + h - 1, K.PANEL);
  rect(x, y, x + w - 1, y + TITLE_H - 1, colD);
  outline(x, y, x + w - 1, y + h - 1, col);
  txt(x + 5, y + 2, title, 8, K.WHITE);
  if (sub) txt(x + w - (closable ? 28 : 16), y + 2, sub, 8, col, 'ra');
  const mx = closable ? w - 22 : w - 10;
  rect(x + mx, y + TITLE_H - 4, x + mx + 6, y + TITLE_H - 3, K.WHITE);
  if (closable) txt(x + w - 7, y + 2, '×', 8, K.WHITE, 'ma');
}

// 盖在凭证上的决定章
function drawStamp(x, y, kind) {
  const [col, colD] = kind === 'approve' ? [C.GREEN, C.GREEN_D] : [C.RED, C.RED_D];
  frame(x, y, x + 43, y + 19, rgb(col), rgba(colD, 0.7));
  outline(x + 2, y + 2, x + 41, y + 17, rgba(col, 0.6));
  txt(x + 22, y + 4, kind === 'approve' ? '放行' : '拦截', 10, rgb(col), 'ma');
}

// 数字签名：图案 + 签发机构 + 指纹（证件上和手册里画法一样，方便对照）
function drawSeal(x, y, key, sig) {
  const col = rgb(SIGNER_COL[key]);
  frame(x, y, x + 19, y + 19, col, rgba(SIGNER_COL[key], 0.12));
  pattern(SEAL_GLYPHS[sig.glyph], x + 3, y + 3, { X: col }, 2);
  txt(x + 25, y + 1, sig.issuer, 8, K.TEXT);
  txt(x + 25, y + 11, `指纹 ${sig.print}`, 8, K.DIM);
}

// 证件：标题 + 若干行 label / value + 底部签名；凭证左侧多一张头像
class Doc {
  constructor(key, rows, sig, photo = null) {
    Object.assign(this, { key, rows, sig, photo, title: DOC_NAMES[key], sub: DOC_SUBS[key] });
    this.w = photo ? 184 : 164;
    this.vx = photo ? 54 : 4;
    this.sealY = TITLE_H + 4 + Math.max(photo ? 46 : 0, 12 * rows.length) + 3;
    this.h = this.sealY + 24;
    this.fields = {};
    if (photo) this.fields[`${key}.照片`] = [4, TITLE_H + 3, 49, TITLE_H + 48];
    rows.forEach(([k], i) => { this.fields[`${key}.${k}`] = [this.vx, TITLE_H + 2 + 12 * i, this.w - 3, TITLE_H + 13 + 12 * i]; });
    this.fields[`${key}.签名`] = [3, this.sealY - 2, this.w - 4, this.h - 3];
  }

  draw(x, y) {
    const { w, h, vx } = this;
    winChrome(x, y, w, h, this.title, this.sub, K.CYAN_D, rgb([18, 52, 56]));
    if (this.photo) {
      frame(x + 4, y + TITLE_H + 3, x + 49, y + TITLE_H + 48, K.LINE_L, K.INK);
      spr(this.photo, x + 5, y + TITLE_H + 4, 2);
    }
    this.rows.forEach(([k, v], i) => {
      const yy = y + TITLE_H + 4 + i * 12;
      txt(x + vx + 2, yy, k, 8, K.DIM);
      txt(x + vx + 34, yy - 1, v, tw(v, 10) > w - vx - 40 ? 8 : 10, K.TEXT);
    });
    rect(x + 4, y + this.sealY - 3, x + w - 5, y + this.sealY - 3, K.GRID);
    drawSeal(x + 6, y + this.sealY + 1, this.key, this.sig);
    if (this.stamp) drawStamp(x + w - 50, y + this.sealY + 1, this.stamp);
  }
}

// 《规则手册》：第 1 页规则，第 2 页合法签名式样
class Rulebook {
  constructor() {
    this.w = 212;
    this.title = '规则手册';
    this.closable = true;
    this.npages = 2;
    const p0 = [], f0 = {};
    let y = TITLE_H + 5;
    for (const r of RULES) {
      const y0 = y;
      p0.push({ s: r.head, y, col: K.CYAN });
      y += 12;
      for (const s of r.subs || []) for (const ln of wrap(s, 8, this.w - 20)) { p0.push({ s: ln, y, col: K.DIM, indent: true }); y += 10; }
      f0['rule.' + r.key] = [3, y0 - 2, this.w - 4, y - 2];
      y += 3;
    }
    const h0 = y + 2;
    const p1 = [], f1 = {};
    y = TITLE_H + 5;
    p1.push({ s: '合法签名式样', y, col: K.CLAUDE_L });
    y += 14;
    for (const key of ['cred', 'tok', 'api']) {
      p1.push({ s: DOC_NAMES[key], y, col: K.CYAN });
      p1.push({ seal: key, y: y + 10 });
      f1['book.' + key] = [3, y - 2, this.w - 4, y + 31];
      y += 36;
    }
    this.pages = [{ rows: p0, fields: f0 }, { rows: p1, fields: f1 }];
    this.h = Math.max(h0, y + 2);
    this.page = 0;
    this.tab = [this.w - 68, 0, this.w - 26, TITLE_H - 1];
  }

  get fields() { return this.pages[this.page].fields; }

  flip() { this.page = (this.page + 1) % this.npages; }

  draw(x, y) {
    winChrome(x, y, this.w, this.h, this.title, '', K.CLAUDE, rgb([70, 36, 26]), true);
    rect(x + this.tab[0], y + 1, x + this.tab[2], y + this.tab[3], rgb([110, 56, 40]));
    txt(x + this.tab[2] - 5, y + 2, `${this.page + 1}/${this.npages} ▶`, 8, K.WHITE, 'ra');
    for (const r of this.pages[this.page].rows) {
      if (r.seal) drawSeal(x + 8, y + r.y, r.seal, genuine(r.seal));
      else txt(x + (r.indent ? 14 : 6), y + r.y, r.s, 8, r.col);
    }
  }
}

// 安全部官方通告（每次上岗时弹出）
class OfficialNotice {
  constructor(date, title, body) {
    this.w = 220;
    this.title = '通告';
    this.closable = true;
    const L = [[`安索兹卡 ${date}`, K.DIM, 'ma'], ['安全部', K.TEXT, 'ma'], ['官方通告', K.CLAUDE_L, 'ma'], null,
      [title, K.WHITE], null, ...wrap(body, 8, this.w - 20).map((s) => [s, K.TEXT]), null,
      ['翻阅规则手册查看生效的策略。', K.CYAN], null, ['安全归于ANTHROTZKA', K.CLAUDE_L, 'ma']];
    let y = TITLE_H + 7;
    this.lines = L.map((l) => { const o = l ? { s: l[0], col: l[1], anchor: l[2] || 'la', y } : null; y += l ? 11 : 6; return o; }).filter(Boolean);
    this.h = y + 4;
    this.fields = {};
  }

  draw(x, y) {
    winChrome(x, y, this.w, this.h, '通告 NOTICE', '', K.CLAUDE, rgb([70, 36, 26]), true);
    for (const l of this.lines) txt(l.anchor === 'ma' ? x + this.w / 2 : x + 10, y + l.y, l.s, 8, l.col, l.anchor);
  }
}

// 通知：处分、事故
class NoticeWindow {
  constructor(title, lines, tone = 'red') {
    this.title = title;
    this.tone = tone;
    this.w = 184;
    this.lines = lines.flatMap((s) => wrap(s, 8, this.w - 14));
    this.h = TITLE_H + 6 + 11 * this.lines.length + 2;
    this.fields = {};
  }

  draw(x, y) {
    const [col, colD] = this.tone === 'red' ? [K.RED, K.RED_D] : [K.AMBER, K.AMBER_D];
    winChrome(x, y, this.w, this.h, this.title, '', col, colD);
    this.lines.forEach((s, i) => txt(x + 7, y + TITLE_H + 5 + i * 11, s, 8, i === this.lines.length - 1 ? col : K.TEXT));
  }
}

// 历史记录：当前这段对话（下一个请求进来时清空）。
// 请求内容那一句是可比对栏位（hist.请求），拿来和 API 授权的用途核对。
class HistoryLog {
  constructor(chat) {
    this.chat = chat;   // 直接引用 D.chat：新请求时清空、对话时实时追加
    this.title = '历史记录';
    this.closable = true;
    this.w = 212;
    this.h = 164;
  }

  // 对话：从最新往回取到塞不下为止，返回按时间顺序排好的行
  chatRows() {
    const width = this.w - 26, top = TITLE_H + 20, bottom = this.h - 8, out = [];
    let used = 0;
    for (let i = this.chat.length - 1; i >= 0; i--) {
      const ln = this.chat[i];
      const lines = wrap(ln.text, 10, width).slice(0, 3);
      const need = 10 + lines.length * 11 + 5;
      if (out.length && top + used + need > bottom) break;
      out.unshift({ ln, lines, last: i === this.chat.length - 1 });
      used += need;
    }
    return out;
  }

  // 给每一行补上纵坐标：比对栏位要和画出来的位置一致
  layout() {
    let y = TITLE_H + 20;
    return this.chatRows().map((r) => {
      const row = { ...r, y };
      y += 10 + r.lines.length * 11 + 5;
      return row;
    });
  }

  get fields() {
    const f = {};
    for (const r of this.layout()) {
      if (r.ln.key !== 'req') continue;
      f['hist.请求'] = [6, r.y - 2, this.w - 8, r.y + 12 + r.lines.length * 11];
    }
    return f;
  }

  draw(x, y) {
    winChrome(x, y, this.w, this.h, this.title, 'CHAT LOG', K.CYAN_D, rgb([18, 52, 56]), true);
    txt(x + 6, y + TITLE_H + 4, '本次对话', 8, K.CYAN);
    rect(x + 5, y + TITLE_H + 14, x + this.w - 6, y + TITLE_H + 14, K.LINE);
    if (!this.chat.length) { txt(x + this.w / 2, y + TITLE_H + 30, '等待连接', 8, K.DIM, 'ma'); return; }
    for (const { ln, lines, last, y: ry } of this.layout()) {
      const col = ln.who === 'C' ? K.CLAUDE_L : K.CYAN;
      const who = ln.who === 'C' ? 'CLAUDE' : ln.ent ? ln.ent.spec.handle : '';
      txt(x + 8, y + ry, who, 8, col);
      lines.forEach((s, i) => txt(x + 10, y + ry + 10 + i * 11, s, 10, last ? K.WHITE : K.TEXT));
    }
  }
}

// 桌面右下角的应用图标：手册 / 通告 / 历史记录 / 比对
function appIcon(x, y, kind, hover, on = false, off = false) {
  const base = kind === 'book' || kind === 'notice' ? [C.CLAUDE, C.CLAUDE_L] : [C.CYAN, C.CYAN_L];
  const col = off ? K.DIM_D : on && kind === 'insp' ? K.AMBER : rgb(hover || on ? base[1] : base[0]);
  frame(x, y, x + 25, y + 19, col, on ? rgba(kind === 'insp' ? C.AMBER : base[0], 0.25) : K.PANEL_L);
  if (kind === 'book') {
    rect(x + 12, y + 4, x + 13, y + 15, col);
    for (const yy of [6, 9, 12]) { rect(x + 5, y + yy, x + 10, y + yy, K.DIM); rect(x + 15, y + yy, x + 20, y + yy, K.DIM); }
  } else if (kind === 'notice') {
    outline(x + 5, y + 5, x + 20, y + 14, col);
    for (let i = 0; i < 4; i++) { pt(x + 6 + i * 2, y + 6 + i, col); pt(x + 19 - i * 2, y + 6 + i, col); }
  } else if (kind === 'hist') {
    for (const yy of [5, 9, 13]) { rect(x + 5, y + yy, x + 7, y + yy + 1, col); rect(x + 10, y + yy, x + 20, y + yy, K.DIM); }
  } else {
    outline(x + 7, y + 4, x + 15, y + 12, col);
    for (let i = 0; i < 4; i++) rect(x + 15 + i, y + 12 + i, x + 16 + i, y + 13 + i, col);
  }
}

// 审查窗柜台上的证件小图标
function docIcon(x, y, hover) {
  const col = hover ? K.CYAN_L : K.CYAN;
  frame(x, y, x + 25, y + 19, col, K.PANEL_L);
  rect(x + 5, y + 5, x + 20, y + 6, col);
  rect(x + 5, y + 9, x + 16, y + 9, K.DIM);
  rect(x + 5, y + 12, x + 18, y + 12, K.DIM);
  rect(x + 5, y + 15, x + 13, y + 15, K.DIM);
}
