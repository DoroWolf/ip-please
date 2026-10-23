'use strict';
// 桌面上的窗口：证件（凭证 / 令牌 / API 授权 / 请求券）、规则手册、官方通告、事故通知、历史记录。
// 每种窗口知道自己的尺寸、怎么画、各栏位的相对坐标（比对模式用）。

const TITLE_H = 12;
const DOC_SUBS = { cred: 'CREDENTIAL', tok: 'TOKEN', api: 'API ACCESS', voucher: 'REQUEST PASS', return: 'TEMP RETURN' };
const SIGNER_COL = { cred: C.AMBER, api: C.GREEN };
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
  txt(x + 22, y + 4, kind === 'approve' ? '放行' : '拒绝', 10, rgb(col), 'ma');
}

// 数字签名：图案 + 签发机构 + 签名（证件上和手册里画法一样，方便对照）
function drawSeal(x, y, key, sig) {
  const col = rgb(SIGNER_COL[key]);
  frame(x, y, x + 19, y + 19, col, rgba(SIGNER_COL[key], 0.12));
  pattern(SEAL_GLYPHS[sig.glyph], x + 3, y + 3, { X: col }, 2);
  txt(x + 25, y + 1, sig.issuer, 8, K.TEXT);
  txt(x + 25, y + 11, `签名 ${sig.print}`, 8, K.DIM);
}

// 证件：标题 + 若干行 label / value + 底部签名（sig = null 时没有签名，只留盖章的位置）；凭证左侧多一张头像
// label 为空的行不登记比对栏位，只把 value 当作版面文字整行居中画出来（临时返回页）。
class Doc {
  constructor(key, rows, sig, photo = null) {
    Object.assign(this, { key, rows, sig, photo, title: DOC_NAMES[key], sub: DOC_SUBS[key] });
    this.w = photo ? 184 : 164;
    this.vx = photo ? 54 : 4;
    this.sealY = TITLE_H + 4 + Math.max(photo ? 46 : 0, 12 * rows.length) + 3;
    this.h = this.sealY + 24;
    this.fields = {};
    if (photo) this.fields[`${key}.照片`] = [4, TITLE_H + 3, 49, TITLE_H + 48];
    rows.forEach(([k], i) => {
      if (!k) return;   // 没有标签的行只是版面文字（临时返回页），不参与比对
      this.fields[`${key}.${k}`] = [this.vx, TITLE_H + 2 + 12 * i, this.w - 3, TITLE_H + 13 + 12 * i];
    });
    if (sig) this.fields[`${key}.签名`] = [3, this.sealY - 2, this.w - 4, this.h - 3];
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
      if (!k) { txt(x + w / 2, yy, v, 10, K.TEXT, 'ma'); return; }   // 无标签：整行居中
      txt(x + vx + 2, yy, k, 8, K.DIM);
      txt(x + vx + 34, yy - 1, v, tw(v, 10) > w - vx - 40 ? 8 : 10, K.TEXT);
    });
    rect(x + 4, y + this.sealY - 3, x + w - 5, y + this.sealY - 3, K.GRID);
    if (this.sig) drawSeal(x + 6, y + this.sealY + 1, this.key, this.sig);
    if (this.stamp) drawStamp(x + w - 50, y + this.sealY + 1, this.stamp);
  }
}

// 《宪法与规则手册》：封面、目录、基本条例、支持地区、签名详情、版权页、封底；底部一排书签直接跳到各章。
// 内容跟着这一班的规则组 rs 走：没有签名条例就没有「签名详情」一页，没有令牌就不列语言 / 时区
const MARK_H = 12;
class Rulebook {
  constructor(rs = FULL_RULES) {
    this.w = 212;
    this.title = '规则手册';
    this.closable = true;
    const W2 = this.w / 2;
    // 每页一组行：{s, y, col, x?, size?, anchor?} 或 {seal, y}；fields 是比对用的栏位，links 是目录里可点的条目
    const page = () => ({ rows: [], fields: {}, links: [] });
    const mid = (pg, y, s, size, col) => pg.rows.push({ s, y, col, x: W2, size, anchor: 'ma' });
    const head = (pg, s) => { pg.rows.push({ s, y: TITLE_H + 5, col: K.CLAUDE_L }); return TITLE_H + 19; };

    const [cover, toc, rules, regions, seals, owner, back] = [page(), page(), page(), page(), page(), page(), page()];
    this.pages = [cover, toc, rules, regions].concat(rs.seals ? [seals] : [], [owner, back]);
    mid(cover, 26, '安索兹卡', 12, K.CLAUDE_L);
    mid(cover, 42, '安全部', 10, K.TEXT);
    mid(cover, 66, '宪法', 12, K.WHITE);
    mid(cover, 82, '与', 8, K.DIM);
    mid(cover, 94, '规则手册', 12, K.WHITE);
    mid(cover, 122, '安全模型专用', 8, K.CYAN);

    let y = head(toc, '目录');
    [['一、基本条例', rules], ['二、支持地区', regions], ['三、签名详情', seals]].filter(([, pg]) => this.pages.includes(pg)).forEach(([s, pg]) => {
      toc.rows.push({ s, y, col: K.CYAN }, { s: `第 ${this.pages.indexOf(pg) + 1} 页`, y, col: K.DIM, x: this.w - 10, anchor: 'ra' });
      toc.links.push({ box: [3, y - 3, this.w - 4, y + 10], page: this.pages.indexOf(pg) });
      y += 16;
    });

    y = head(rules, '一、基本条例');
    // hidden 的条例（wanted / sms）不印在手册上、不占版面，也不登记比对栏位
    for (const r of rs.rules) {
      if (r.hidden) continue;
      const y0 = y;
      // 令牌只印语言时（例如目前的无尽模式），条例也只提语言；等令牌重新印时区再写回「语言和时区」
      const headText = r.key === 'locale' && !(rs.tokRows || ['语言', '时区']).includes('时区')
        ? '语言须与地区一致' : r.head;
      rules.rows.push({ s: headText, y, col: K.CYAN });
      y += 12;
      rules.fields['rule.' + r.key] = [3, y0 - 2, this.w - 4, y - 2];
      y += 3;
    }
    let h = y + 2;

    y = head(regions, '二、支持地区');
    const y0 = y;
    // 支持地区页只列出令牌上真的印了的对照栏位（目前是语言；时区留给之后的规则组）
    const tokCols = rs.tok ? (rs.tokRows || ['语言', '时区']).filter((k) => k === '语言' || k === '时区') : [];
    const COL_X = { 地区: 14, 语言: 84, 时区: 140 };
    for (const s of ['地区', ...tokCols]) regions.rows.push({ s, y, col: K.DIM, x: COL_X[s] });
    y += 13;
    for (const [continent, list] of rs.continents) {
      regions.rows.push({ s: continent, y, col: K.CYAN });
      y += 11;
      for (const r of list) {
        const [lang, tz] = REGION_LOCALE[r];
        regions.rows.push({ s: r, y, col: K.TEXT, x: 14 });
        if (tokCols.includes('语言')) regions.rows.push({ s: lang, y, col: K.TEXT, x: 84 });
        if (tokCols.includes('时区')) regions.rows.push({ s: tz, y, col: K.TEXT, x: 140 });
        y += 10;
      }
      y += 3;
    }
    // 「支持地区」页始终是地区条例的参照；请求券条例留在「基本条例」页
    regions.fields['rule.region'] = [3, y0 - 2, this.w - 4, y - 4];
    h = Math.max(h, y + 2);

    y = head(seals, '三、签名详情');
    // 只有凭证和 API 授权带签名；令牌没有签名，所以不列
    for (const key of ['cred', 'api']) {
      seals.rows.push({ s: DOC_NAMES[key], y, col: K.CYAN }, { seal: key, y: y + 10 });
      seals.fields['book.' + key] = [3, y - 2, this.w - 4, y + 31];
      y += 36;
    }
    if (rs.seals) h = Math.max(h, y + 2);

    mid(owner, 52, '本手册所有权属于', 8, K.DIM);
    mid(owner, 65, '安全部', 10, K.TEXT);
    mid(owner, 100, '安全属于安索兹卡', 8, K.CLAUDE_L);

    mid(back, 20, '安索兹卡', 10, K.CLAUDE_L);
    mid(back, 34, '安全部', 8, K.TEXT);
    mid(back, 46, '安全模型专用', 8, K.CYAN);
    mid(back, 58, '宪法与规则手册', 10, K.WHITE);
    mid(back, 80, '2060版', 8, K.AMBER);
    mid(back, 102, '不得擅自传播', 8, K.RED);
    mid(back, 114, '否则将受到', 8, K.RED);
    mid(back, 126, '严厉处罚', 8, K.RED);

    this.npages = this.pages.length;
    this.h = Math.max(h, 140) + MARK_H + 2;
    this.home = this.pages.indexOf(toc);   // 目录页：手册每次从桌面打开时默认停在这里
    this.page = this.home;
    this.tab = [this.w - 68, 0, this.w - 26, TITLE_H - 1];
    const marks = [['目录', toc, K.CLAUDE], ['条例', rules, K.CYAN], ['地区', regions, K.GREEN], ['签名', seals, K.AMBER]]
      .filter(([, pg]) => this.pages.includes(pg));
    const mw = Math.floor((this.w - 8) / marks.length);
    this.marks = marks.map(([label, pg, col], i) => ({
      label, col, page: this.pages.indexOf(pg), box: [4 + i * mw, this.h - MARK_H - 2, 2 + (i + 1) * mw, this.h - 3],
    }));
  }

  get fields() { return this.pages[this.page].fields; }

  flip() { this.page = (this.page + 1) % this.npages; }

  // 点页签翻到下一页，点书签 / 目录条目跳到那一页；点中了返回 true
  press(rx, ry) {
    if (inBox(rx, ry, this.tab)) { this.flip(); return true; }
    const l = [...this.marks, ...this.pages[this.page].links].find((l) => inBox(rx, ry, l.box));
    if (l) this.page = l.page;
    return !!l;
  }

  draw(x, y) {
    winChrome(x, y, this.w, this.h, this.title, '', K.CLAUDE, rgb([70, 36, 26]), true);
    rect(x + this.tab[0], y + 1, x + this.tab[2], y + this.tab[3], rgb([110, 56, 40]));
    txt(x + this.tab[2] - 5, y + 2, `${this.page + 1}/${this.npages} ▶`, 8, K.WHITE, 'ra');
    for (const r of this.pages[this.page].rows) {
      if (r.seal) drawSeal(x + 8, y + r.y, r.seal, genuine(r.seal));
      else txt(x + (r.x ?? 6), y + r.y, r.s, r.size || 8, r.col, r.anchor);
    }
    rect(x + 1, y + this.h - MARK_H - 4, x + this.w - 2, y + this.h - MARK_H - 4, K.GRID);
    for (const m of this.marks) {
      const [x0, y0, x1, y1] = m.box, on = m.page === this.page;
      rect(x + x0, y + y0 + (on ? 0 : 2), x + x1, y + y1, on ? m.col : K.INK);
      outline(x + x0, y + y0 + (on ? 0 : 2), x + x1, y + y1, m.col);
      txt(x + (x0 + x1) / 2, y + y0 + (on ? 2 : 3), m.label, 8, on ? K.INK : m.col, 'ma');
    }
  }
}

// 安全部官方通告（每次上岗时弹出）：第 1 页通告正文（sig：底部印凭证签名）；
// 之后依次是附页 pages（{head, body, sample}）、特别关注对象的头像（wanted 非空时）、当天的报纸（news）
const PAPER = 'rgb(224,214,192)', PAPER_INK = 'rgb(40,34,30)', PAPER_FAINT = 'rgb(176,164,144)', PAPER_TEXT = 'rgb(74,56,48)';
class OfficialNotice {
  constructor(date, { title = null, body, wanted = [], sig = true, pages = [], news = null }) {
    this.w = 220;
    this.title = '通告';
    this.closable = true;
    this.wanted = wanted;
    this.date = date;
    this.news = news;
    // 按行往下排：[文字, 颜色, 对齐]，null 是段落间距
    const flow = (L, y) => {
      const lines = L.map((l) => { const o = l ? { s: l[0], col: l[1], anchor: l[2] || 'la', y } : null; y += l ? 11 : 6; return o; }).filter(Boolean);
      return [lines, y];
    };
    const para = (s) => wrap(s, 8, this.w - 20).map((ln) => [ln, K.TEXT]);
    const motto = ['安全归于ANTHROTZKA', K.CLAUDE_L, 'ma'];
    this.pages = [];

    let [lines0, y] = flow([[`安索兹卡 ${date}`, K.DIM, 'ma'], ['安全部', K.TEXT, 'ma'], ['官方通告', K.CLAUDE_L, 'ma'], null,
      ...(title ? [[title, K.WHITE], null] : []), ...para(body), null,
      ['翻阅规则手册查看生效的策略。', K.CYAN], null, motto], TITLE_H + 7);
    const f0 = {};
    if (sig) {
      // 底部：安全部会话中心（凭证签发机构）的有效签名
      y += 4;
      f0['notice.cred'] = [3, y - 2, this.w - 4, y + 20];
      lines0.push({ s: `${SIGNERS.cred.issuer}`, col: K.DIM, anchor: 'ma', y, rule: true },
        { s: SIGNERS.cred.print, col: K.AMBER, anchor: 'ma', y: y + 11 });
      y += 15;
    }
    this.pages.push({ lines: lines0, fields: f0, h: y + 11 });

    for (const pg of pages) {
      // 附页可以没有标题（head）：没有就不画标题行，避免印出 undefined
      const head = pg.head ? [[pg.head, K.CLAUDE_L, 'ma'], null] : [];
      let [lines, y1] = flow([...head, ...para(pg.body), null], TITLE_H + 7);
      const page = { lines, fields: {} };
      if (pg.sample) { page.sample = { y: y1 + 2, row: pg.sample }; y1 += 64; }
      lines.push({ s: motto[0], col: motto[1], anchor: 'ma', y: y1 + 4 });
      page.h = y1 + 20;
      this.pages.push(page);
    }

    if (wanted.length) {
      y = TITLE_H + 7;
      const lines1 = [{ s: '特别关注对象', col: K.RED, anchor: 'ma', y }];
      y += 21;
      const f1 = {};
      this.avY = y;
      this.avX = wanted.map((_, i) => 20 + i * 66);
      this.avX.forEach((ax, i) => {
        f1[`notice.wanted${i}`] = [ax - 3, y - 3, ax + 48, y + 59];
        lines1.push({ s: `对象 ${WANTED_TAGS[i]}`, col: K.RED, anchor: 'ma', y: y + 50, x: ax + 23 });
      });
      y += 66;
      lines1.push({ s: motto[0], col: motto[1], anchor: 'ma', y: y + 4 });
      this.pages.push({ lines: lines1, fields: f1, avatars: true, h: y + 20 });
    }

    if (news) this.pages.push({ lines: [], fields: {}, news: true, h: TITLE_H + 168 });

    this.npages = this.pages.length;
    this.page = 0;
    this.h = Math.max(...this.pages.map((pg) => pg.h));
    this.tab = [this.w - 68, 0, this.w - 26, TITLE_H - 1];
  }

  get fields() { return this.pages[this.page].fields; }

  flip() { this.page = (this.page + 1) % this.npages; }

  press(rx, ry) {
    if (!inBox(rx, ry, this.tab)) return false;
    this.flip();
    return true;
  }

  draw(x, y) {
    winChrome(x, y, this.w, this.h, '通告 NOTICE', '', K.CLAUDE, rgb([70, 36, 26]), true);
    rect(x + this.tab[0], y + 1, x + this.tab[2], y + this.tab[3], rgb([110, 56, 40]));
    txt(x + this.tab[2] - 5, y + 2, `${this.page + 1}/${this.npages} ▶`, 8, K.WHITE, 'ra');
    const pg = this.pages[this.page];
    for (const l of pg.lines) {
      if (l.rule) rect(x + 10, y + l.y - 5, x + this.w - 11, y + l.y - 5, K.GRID);
      txt(l.x !== undefined ? x + l.x : l.anchor === 'ma' ? x + this.w / 2 : x + 10, y + l.y, l.s, 8, l.col, l.anchor);
    }
    if (pg.sample) this.drawSample(x, y + pg.sample.y, pg.sample.row);
    if (pg.news) this.drawNews(x, y);
    if (!pg.avatars) return;
    this.wanted.forEach((av, i) => {
      const ax = x + this.avX[i], ay = y + this.avY;
      frame(ax - 2, ay - 2, ax + 45, ay + 45, K.RED, K.INK);
      spr(av, ax, ay, 2);
    });
  }

  // 附页上的示意凭证：要查验的那一栏用琥珀色框出来
  drawSample(x, y, row) {
    const x0 = x + 30, x1 = x + this.w - 31;
    winChrome(x0, y, x1 - x0 + 1, 58, DOC_NAMES.cred, DOC_SUBS.cred, K.CYAN_D, rgb([18, 52, 56]));
    [['IP', '203.0.113.7'], ['昵称', 'mlee'], ['地区', '美国'], ['有效期', '2078.06.30']].forEach(([k, v], i) => {
      const yy = y + TITLE_H + 3 + i * 11;
      const on = k === row;
      if (on) outline(x0 + 3, yy - 2, x1 - 3, yy + 9, K.AMBER);
      txt(x0 + 8, yy, k, 8, on ? K.AMBER : K.DIM);
      txt(x0 + 44, yy, v, 8, on ? K.WHITE : K.DIM);
      if (on) txt(x1 - 8, yy, '◀ 查验', 8, K.AMBER, 'ra');
    });
  }

  // 最后一页：当天的《安索兹卡真理报》剪报
  drawNews(x, y) {
    const n = this.news, px = x + 8, pw = this.w - 17, py = y + TITLE_H + 5, ph = 154;
    rect(px, py, px + pw, py + ph, PAPER);
    txt(px + pw / 2, py + 6, '安索兹卡真理报', 12, PAPER_INK, 'ma');
    txt(px + pw / 2, py + 22, `THE TRUTH OF ANTHROTZKA  ·  ${this.date}`, 8, PAPER_TEXT, 'ma');
    rect(px + 6, py + 33, px + pw - 6, py + 34, PAPER_INK);
    rect(px + 6, py + 37, px + pw - 6, py + 37, PAPER_INK);
    const k = tw(n.h1) * 2 <= pw - 16 ? 2 : 1;
    bigText(px + pw / 2, py + 44, n.h1, 12, k, PAPER_INK);
    let yy = py + 44 + (k === 2 ? 30 : 18);
    for (const s of wrap(n.sub, 8, pw - 20)) { txt(px + pw / 2, yy, s, 8, PAPER_TEXT, 'ma'); yy += 11; }
    yy += 3;
    rect(px + 6, yy, px + pw - 6, yy, PAPER_INK);
    yy += 6;
    for (const s of wrap(n.h2, 8, pw - 16)) { txt(px + 8, yy, s, 8, PAPER_INK); yy += 11; }
    for (let row = 0; yy + 4 + row * 8 < py + ph - 6; row++) {
      for (let col = 0; col < 2; col++) {
        const x0 = px + 8 + col * 98;
        rect(x0, yy + 4 + row * 8, x0 + 88 - ((row * 13 + col * 7) % 24), yy + 6 + row * 8, PAPER_FAINT);
      }
    }
  }
}

// 验证 SMS 的两扇窗：发给对方填的表单（smsf）、按凭证查到的身份档案（sms）。行和栏位的排法同证件
class InfoWin {
  constructor(key, title, sub, rows) {
    Object.assign(this, { key, title, sub, rows, closable: true, w: 164 });
    this.layout();
  }

  layout() {
    this.h = TITLE_H + 6 + 12 * this.rows.length + 4;
    this.fields = {};
    this.rows.forEach(([k, v, field], i) => { if (field) this.fields[`${this.key}.${k}`] = [3, TITLE_H + 2 + 12 * i, this.w - 4, TITLE_H + 13 + 12 * i]; });
  }

  draw(x, y) {
    winChrome(x, y, this.w, this.h, this.title, this.sub, K.GREEN, rgb([20, 50, 34]), true);
    this.rows.forEach(([k, v], i) => {
      const yy = y + TITLE_H + 4 + i * 12;
      txt(x + 6, yy, k, 8, K.DIM);
      txt(x + 42, yy, v, 8, v.startsWith('_') ? K.DIM_D : K.TEXT);
    });
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
// 请求内容那一句是可比对栏位（hist.请求）；审查窗的请求摘要（rv.请求）一直看得到，
// 两者都能拿来和 API 授权的用途核对。
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
