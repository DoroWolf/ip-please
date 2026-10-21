'use strict';
// 桌面上的窗口：证件（凭证 / 令牌 / API 授权）、规则手册、官方通告、事故通知。
// 每种窗口知道自己的尺寸、怎么画、各栏位的相对坐标（比对模式用）。

const TITLE_H = 12;
const DOC_SUBS = { cred: 'CREDENTIAL', tok: 'TOKEN', api: 'API ACCESS' };
const SIGNER_COL = { cred: C.CYAN, tok: C.AMBER, api: C.GREEN };

function winChrome(x, y, w, h, title, sub, col, colD) {
  rect(x + 2, y + 2, x + w + 1, y + h + 1, 'rgba(0,0,0,0.45)');
  rect(x, y, x + w - 1, y + h - 1, K.PANEL);
  rect(x, y, x + w - 1, y + TITLE_H - 1, colD);
  outline(x, y, x + w - 1, y + h - 1, col);
  txt(x + 5, y + 2, title, 8, K.WHITE);
  if (sub) txt(x + w - 5, y + 2, sub, 8, col, 'ra');
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
  }
}

// 《规则手册》：第 1 页规则，第 2 页合法签名式样
class Rulebook {
  constructor() {
    this.w = 212;
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
    this.tab = [this.w - 44, 0, this.w - 1, TITLE_H - 1];
  }

  get fields() { return this.pages[this.page].fields; }

  flip() { this.page = (this.page + 1) % this.npages; }

  draw(x, y) {
    winChrome(x, y, this.w, this.h, '规则手册', '', K.CLAUDE, rgb([70, 36, 26]));
    rect(x + this.tab[0], y + 1, x + this.tab[2] - 1, y + this.tab[3], rgb([110, 56, 40]));
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
    const L = [[`安索兹卡 ${date}`, K.DIM, 'ma'], ['安全部', K.TEXT, 'ma'], ['官方通告', K.CLAUDE_L, 'ma'], null,
      [title, K.WHITE], null, ...wrap(body, 8, this.w - 20).map((s) => [s, K.TEXT]), null,
      ['翻阅规则手册查看生效的策略。', K.CYAN], null, ['安全归于ANTHROTZKA', K.CLAUDE_L, 'ma']];
    let y = TITLE_H + 7;
    this.lines = L.map((l) => { const o = l ? { s: l[0], col: l[1], anchor: l[2] || 'la', y } : null; y += l ? 11 : 6; return o; }).filter(Boolean);
    this.h = y + 4;
    this.fields = {};
    this.close = [this.w - 12, 1, this.w - 2, TITLE_H - 2];
  }

  draw(x, y) {
    winChrome(x, y, this.w, this.h, '通告 NOTICE', '', K.CLAUDE, rgb([70, 36, 26]));
    txt(x + this.w - 7, y + 2, '×', 8, K.WHITE, 'ma');
    for (const l of this.lines) txt(l.anchor === 'ma' ? x + this.w / 2 : x + 10, y + l.y, l.s, 8, l.col, l.anchor);
  }
}

// 通知：处分、事故。右上角有关闭钮
class NoticeWindow {
  constructor(title, lines, tone = 'red') {
    this.title = title;
    this.tone = tone;
    this.w = 184;
    this.lines = lines.flatMap((s) => wrap(s, 8, this.w - 14));
    this.h = TITLE_H + 6 + 11 * this.lines.length + 2;
    this.fields = {};
    this.close = [this.w - 12, 1, this.w - 2, TITLE_H - 2];
  }

  draw(x, y) {
    const [col, colD] = this.tone === 'red' ? [K.RED, K.RED_D] : [K.AMBER, K.AMBER_D];
    winChrome(x, y, this.w, this.h, this.title, '', col, colD);
    txt(x + this.w - 7, y + 2, '×', 8, K.WHITE, 'ma');
    this.lines.forEach((s, i) => txt(x + 7, y + TITLE_H + 5 + i * 11, s, 8, i === this.lines.length - 1 ? col : K.TEXT));
  }
}

// 审查窗柜台上的小图标：证件（青）/ 规则手册（橙）
function docIcon(x, y, hover, book = false) {
  const col = book ? (hover ? K.CLAUDE_L : K.CLAUDE) : hover ? K.CYAN_L : K.CYAN;
  frame(x, y, x + 25, y + 19, col, K.PANEL_L);
  if (book) {
    rect(x + 12, y + 4, x + 13, y + 15, col);
    for (const yy of [6, 9, 12]) { rect(x + 5, y + yy, x + 10, y + yy, K.DIM); rect(x + 15, y + yy, x + 20, y + yy, K.DIM); }
    return;
  }
  rect(x + 5, y + 5, x + 20, y + 6, col);
  rect(x + 5, y + 9, x + 16, y + 9, K.DIM);
  rect(x + 5, y + 12, x + 18, y + 12, K.DIM);
  rect(x + 5, y + 15, x + 13, y + 15, K.DIM);
}
