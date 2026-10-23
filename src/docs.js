'use strict';
// 桌面上的窗口：证件（凭证 / 令牌 / API 授权 / 请求券）、规则手册、官方通告、事故通知、历史记录。
// 每种窗口知道自己的尺寸、怎么画、各栏位的相对坐标（审查模式用）。

const TITLE_H = 12;
const DOC_SUBS = { cred: 'CREDENTIAL', tok: 'TOKEN', api: 'API ACCESS', voucher: 'REQUEST PASS', return: 'TEMP RETURN', env: 'ENV CARD', ent: 'ENTERPRISE' };
const BANNER_H = 46;   // 请求券顶部的欢迎横幅：标题页那枚 Claude 徽记的小号版 + 「欢迎使用 Claude」装饰字样
const ENT_BANNER_H = 30;   // 企业授权顶部的横幅：签发企业的图标（2 倍）+ 企业名称

// 企业图标（data.js 的 CORPS）：k 倍像素画；颜色表转成 CSS 后缓存。icon 默认是企业名录上的图标（伪造授权会传入假图标）
const corpCols = new Map();
function drawCorpIcon(x, y, key, k = 1, icon = corpOf(key).icon) {
  if (!corpCols.has(key)) corpCols.set(key, Object.fromEntries(Object.entries(corpOf(key).icon.cols).map(([ch, v]) => [ch, rgb(v)])));
  pattern(icon.pat, x, y, corpCols.get(key), k);
}
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

// 证件栏位的折行：先按空格分词（避免把 TypeScript 拆成两半），单个词太长才逐字拆
function wrapDoc(s, size, width) {
  const lines = [];
  let cur = '';
  for (const word of String(s).split(' ')) {
    if (cur && tw(`${cur} ${word}`, size) > width) { lines.push(cur); cur = word; } else cur = cur ? `${cur} ${word}` : word;
    while (tw(cur, size) > width) {
      const chars = [...cur];
      let i = 1;
      while (i < chars.length && tw(chars.slice(0, i + 1).join(''), size) <= width) i++;
      lines.push(chars.slice(0, i).join(''));
      cur = chars.slice(i).join('');
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// 证件：标题 + 若干行 label / value + 底部签名（sig = null 时没有签名，只留盖章的位置）；凭证左侧多一张头像
// label 为空的行不登记审查栏位，只把 value 当作版面文字整行居中画出来（临时返回页）。
// 行的第三项为 true 时，value 太长就折行印出来（令牌上的请求摘要）；整段仍算同一个审查栏位。
class Doc {
  constructor(key, rows, sig, photo = null) {
    Object.assign(this, { key, rows, sig, photo, title: DOC_NAMES[key], sub: DOC_SUBS[key] });
    this.w = photo ? 184 : 164;
    this.vx = photo ? 54 : 4;
    // 请求券 / 企业授权顶上多一条横幅，下面的栏位整体往下让出横幅的高度
    this.bannerH = key === 'voucher' ? BANNER_H : key === 'ent' ? ENT_BANNER_H : 0;
    this.banner = this.bannerH > 0;
    const top = TITLE_H + 4 + this.bannerH;
    // 栏位值从标签右边开始：标签较长（企业授权的「授权企业」）时整列往右让
    this.kx = Math.max(34, ...rows.map(([k]) => (k ? tw(k, 8) + 8 : 0)));
    // 折行的行先算好每行文字（10px），下面的行高、签名线和审查栏位都跟着变
    const avail = this.w - this.vx - this.kx - 6;
    this.wraps = rows.map(([, v, multi]) => (multi && v ? wrapDoc(String(v), 10, avail) : null));
    this.rowY = [];
    let y = top;
    rows.forEach((r, i) => {
      this.rowY.push(y);
      y += this.wraps[i] ? this.wraps[i].length * 11 + 2 : 12;
    });
    // 没有签名、也不能盖章的证件（令牌 / 请求券）不留底部的签名 / 盖章区，窗口不用空一大块
    this.plain = !sig && key !== 'cred' && key !== 'return';
    this.sealY = Math.max(top + (photo ? 46 : 0), y) + 3;
    this.h = this.plain ? y + 5 : this.sealY + 24;
    this.fields = {};
    if (photo) this.fields[`${key}.照片`] = [4, TITLE_H + 3, 49, TITLE_H + 48];
    // 企业授权的横幅就是「签发企业」这一栏
    if (key === 'ent') this.fields['ent.企业'] = [4, TITLE_H + 2, this.w - 5, TITLE_H + ENT_BANNER_H - 1];
    rows.forEach(([k], i) => {
      if (!k) return;   // 没有标签的行只是版面文字（临时返回页），不参与审查
      const bh = this.wraps[i] ? this.wraps[i].length * 11 + 1 : 11;
      this.fields[`${key}.${k}`] = [this.vx, this.rowY[i] - 2, this.w - 3, this.rowY[i] + bh - 2];
    });
    if (sig) this.fields[`${key}.签名`] = [3, this.sealY - 2, this.w - 4, this.h - 3];
  }

  // 请求券的欢迎横幅：左边是标题页那枚徽记的小号版（33px，上下留边距），右边是装饰字样
  drawBanner(x, y) {
    const x0 = x + 4, x1 = x + this.w - 5, y0 = y + TITLE_H + 2, y1 = y0 + BANNER_H - 3;
    rect(x0, y0, x1, y1, rgba(C.CLAUDE, 0.12));
    outline(x0, y0, x1, y1, rgba(C.CLAUDE, 0.45));
    spr('voucher_emblem', x0 + 6, y0 + 5);
    txt(x0 + 48, y0 + 9, '欢迎使用', 10, K.CLAUDE_L);
    txt(x0 + 48, y0 + 22, 'Claude', 12, K.WHITE);
  }

  // 企业授权的横幅：签发企业的图标（2 倍）+ 企业名称；伪造的授权（this.fake）印山寨的名称或图标
  drawEntBanner(x, y) {
    const c = this.fake || corpOf(this.corp);
    const x0 = x + 4, x1 = x + this.w - 5, y0 = y + TITLE_H + 2, y1 = y0 + ENT_BANNER_H - 3;
    rect(x0, y0, x1, y1, K.INK);
    outline(x0, y0, x1, y1, K.LINE_L);
    drawCorpIcon(x0 + 3, y0 + 2, this.corp, 2, c.icon);
    txt(x0 + 32, y0 + 3, c.name, 12, K.WHITE);
    txt(x0 + 32, y0 + 17, '企业账户授权', 8, K.DIM);
  }

  draw(x, y) {
    const { w, h, vx } = this;
    winChrome(x, y, w, h, this.title, this.sub, K.CYAN_D, rgb([18, 52, 56]));
    if (this.key === 'ent') this.drawEntBanner(x, y);
    else if (this.banner) this.drawBanner(x, y);
    if (this.photo) {
      frame(x + 4, y + TITLE_H + 3, x + 49, y + TITLE_H + 48, K.LINE_L, K.INK);
      spr(this.photo, x + 5, y + TITLE_H + 4, 2);
    }
    this.rows.forEach(([k, v], i) => {
      const yy = y + this.rowY[i];
      if (!k) { txt(x + w / 2, yy, v, 10, K.TEXT, 'ma'); return; }   // 无标签：整行居中
      txt(x + vx + 2, yy, k, 8, K.DIM);
      const lines = this.wraps[i];
      if (lines) lines.forEach((s, j) => txt(x + vx + this.kx, yy - 1 + j * 11, s, 10, K.TEXT));
      else txt(x + vx + this.kx, yy - 1, v, tw(v, 10) > w - vx - this.kx - 6 ? 8 : 10, K.TEXT);
    });
    if (!this.plain) rect(x + 4, y + this.sealY - 3, x + w - 5, y + this.sealY - 3, K.GRID);
    if (this.sig) drawSeal(x + 6, y + this.sealY + 1, this.key, this.sig);
    if (this.stamp) drawStamp(x + w - 50, y + this.sealY + 1, this.stamp);
  }
}

// 《宪法与规则手册》：封面、目录、基本条例、支持地区、签名详情、版权页、封底；底部一排书签直接跳到各章。
// 内容跟着这一班的规则组 rs 走：没有签名条例就没有「签名详情」一页，没有令牌就不列语言 / 时区。
// 每页正文排到 PAGE_BOTTOM 就翻到续页（续页重复章节标题），窗口高度不会跟着内容一直长高。
const MARK_H = 12;
const PAGE_BOTTOM = 138;   // 单页正文的下限；再长就分页
// 手册 / 通告标题栏右侧的翻页列：◀ 上一页 · 页码 · ▶ 下一页。
// 右侧这一组里，英文副标在相对左边、翻页列在相对右边（… CONSTITUTION ◀ 3/7 ▶）。
const pageTabs = (w) => ({
  prev: [w - 68, 0, w - 58, TITLE_H - 1],
  next: [w - 36, 0, w - 26, TITLE_H - 1],
});
function drawPageTabs(win, x, y, col) {
  const { prev, next } = win.tabs;
  if (win.sub) txt(x + prev[0] - 6, y + 2, win.sub, 8, col, 'ra');
  rect(x + prev[0], y + 1, x + next[2], y + prev[3], rgb([110, 56, 40]));
  const hover = (b) => typeof ptr !== 'undefined' && inBox(ptr.x - x, ptr.y - y, b);
  for (const b of [prev, next]) {
    if (hover(b)) rect(x + b[0], y + 1, x + b[2], y + b[3], rgb([158, 82, 56]));
  }
  txt(x + (prev[0] + prev[2]) / 2, y + 2, '◀', 8, K.WHITE, 'ma');
  txt(x + (prev[2] + next[0]) / 2, y + 2, `${win.page + 1}/${win.npages}`, 8, K.WHITE, 'ma');
  txt(x + (next[0] + next[2]) / 2, y + 2, '▶', 8, K.WHITE, 'ma');
}
// 两个按钮共用的点击处理；点中了返回 true
function pressPageTabs(win, rx, ry) {
  if (inBox(rx, ry, win.tabs.prev)) { win.back(); return true; }
  if (inBox(rx, ry, win.tabs.next)) { win.flip(); return true; }
  return false;
}
class Rulebook {
  constructor(rs = FULL_RULES, opts = {}) {
    this.w = 212;
    this.title = '规则手册';
    this.sub = 'CONSTITUTION';
    this.closable = true;
    // 底部书签栏的隐藏开关：故事模式停用（之后随剧情开放）；无尽模式打开
    this.marksOn = opts.marksOn !== false;
    const W2 = this.w / 2;
    // 每页一组行：{s, y, col, x?, size?, anchor?} 或 {seal, y}；fields 是审查用的栏位，links 是目录里可点的条目
    const page = () => ({ rows: [], fields: {}, links: [] });
    const mid = (pg, y, s, size, col) => pg.rows.push({ s, y, col, x: W2, size, anchor: 'ma' });
    const head = (pg, s) => { pg.rows.push({ s, y: TITLE_H + 5, col: K.CLAUDE_L }); return TITLE_H + 19; };
    // 这一段还排得下吗？排不下就开续页
    const fits = (y, need) => y + need <= PAGE_BOTTOM;

    const cover = page(), toc = page(), owner = page(), back = page();
    mid(cover, 26, '安索兹卡', 12, K.CLAUDE_L);
    mid(cover, 42, '安全部', 10, K.TEXT);
    mid(cover, 66, '宪法', 12, K.WHITE);
    mid(cover, 82, '与', 8, K.DIM);
    mid(cover, 94, '规则手册', 12, K.WHITE);
    mid(cover, 122, '安全模型专用', 8, K.CYAN);

    // —— 一、基本条例：逐条往下排，排不下就续页 ——
    const rulesPages = [];
    let rules = null, ry = 0, rulesBody = 0;
    const newRulesPage = () => {
      rules = page();
      rulesPages.push(rules);
      ry = head(rules, rulesPages.length === 1 ? '一、基本条例' : '一、基本条例（续）');
      rulesBody = ry;
    };
    newRulesPage();
    // hidden 的条例（wanted / sms）不印在手册上、不占版面，也不登记审查栏位
    for (const r of rs.rules) {
      if (r.hidden) continue;
      if (ry > rulesBody && !fits(ry, 15)) newRulesPage();
      const y0 = ry;
      // 令牌只印语言、也没有环境信息卡时（无尽模式难度 1），条例只提语言；看得到时区（难度 2）才写「语言和时区」
      const headText = r.key === 'locale' && !tzShown(rs) ? '语言须与地区一致' : r.head;
      rules.rows.push({ s: headText, y: ry, col: K.CYAN });
      ry += 12;
      rules.fields['rule.' + r.key] = [3, y0 - 2, this.w - 4, ry - 2];
      ry += 3;
    }

    // —— 二、支持地区：按大洲排；整章排不下就续页，续页重复栏位表头 ——
    const regionPages = [];
    let regions = null, gy = 0, gTop = 0, gBody = 0;
    // 支持地区页只列出真的印在证件上的对照栏位：令牌上的语言；时区印在令牌或环境信息卡（难度 2）上才列
    const tokCols = [];
    if (rs.tok && (rs.tokRows || TOK_ROWS_ALL).includes('语言')) tokCols.push('语言');
    if (tzShown(rs)) tokCols.push('时区');
    const COL_X = { 地区: 14, 语言: 84, 时区: 140 };
    const endRegionPage = () => {
      // 「支持地区」的每一页都是地区条例的参照；请求券条例留在「基本条例」页
      if (regions) regions.fields['rule.region'] = [3, gTop - 2, this.w - 4, Math.min(gy, PAGE_BOTTOM) - 2];
    };
    const newRegionPage = () => {
      endRegionPage();
      regions = page();
      regionPages.push(regions);
      gy = head(regions, regionPages.length === 1 ? '二、支持地区' : '二、支持地区（续）');
      gTop = gy;
      for (const s of ['地区', ...tokCols]) regions.rows.push({ s, y: gy, col: K.DIM, x: COL_X[s] });
      gy += 13;
      gBody = gy;
    };
    newRegionPage();
    for (const [continent, list] of rs.continents) {
      // 大洲标题和它下面的地区尽量留在同一页；只有大洲自己就排不下时，才在洲内分页
      if (gy > gBody && !fits(gy, 11 + list.length * 10 + 3)) newRegionPage();
      regions.rows.push({ s: continent, y: gy, col: K.CYAN });
      gy += 11;
      for (const r of list) {
        if (!fits(gy, 10)) {
          newRegionPage();
          regions.rows.push({ s: `${continent}（续）`, y: gy, col: K.CYAN });
          gy += 11;
        }
        const [lang, tz] = REGION_LOCALE[r];
        regions.rows.push({ s: r, y: gy, col: K.TEXT, x: 14 });
        if (tokCols.includes('语言')) regions.rows.push({ s: lang, y: gy, col: K.TEXT, x: 84 });
        if (tokCols.includes('时区')) regions.rows.push({ s: tz, y: gy, col: K.TEXT, x: 140 });
        gy += 10;
      }
      gy += 3;
    }
    endRegionPage();

    // —— 三、签名详情：只有凭证和 API 授权带签名；令牌没有签名，所以不列 ——
    const sealPages = [];
    let seals = null, sy = 0, sealsBody = 0;
    const newSealsPage = () => {
      seals = page();
      sealPages.push(seals);
      sy = head(seals, sealPages.length === 1 ? '三、签名详情' : '三、签名详情（续）');
      sealsBody = sy;
    };
    newSealsPage();
    for (const key of ['cred', 'api']) {
      if (sy > sealsBody && !fits(sy, 36)) newSealsPage();
      seals.rows.push({ s: DOC_NAMES[key], y: sy, col: K.CYAN }, { seal: key, y: sy + 10 });
      seals.fields['book.' + key] = [3, sy - 2, this.w - 4, sy + 31];
      sy += 36;
    }

    // —— 四、企业名录（无尽模式难度 2）：能签发企业授权的企业、图标与所在地区；整张表是一个审查栏位 ——
    const entPage = page();
    if (rs.ent) {
      let ey = head(entPage, '四、企业名录');
      for (const [s, x] of [['企业', 30], ['所在地区', 124]]) entPage.rows.push({ s, y: ey, col: K.DIM, x });
      ey += 13;
      const top = ey;
      for (const c of CORPS) {
        entPage.rows.push({ icon: c.key, y: ey - 2, x: 14 }, { s: c.name, y: ey, col: K.TEXT, x: 30 }, { s: c.region, y: ey, col: K.TEXT, x: 124 });
        ey += 14;
      }
      entPage.fields['book.ent'] = [3, top - 4, this.w - 4, ey - 4];
    }

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

    // 页面顺序：封面 → 目录 → 各章（长章带续页）→ 版权页 → 封底
    this.pages = [cover, toc].concat(rulesPages, regionPages, rs.seals ? sealPages : [], rs.ent ? [entPage] : [], [owner, back]);
    this.npages = this.pages.length;
    // 所有分页共用同一个高度：正文最长只排到 PAGE_BOTTOM，窗口不再随内容长高
    this.h = Math.max(140, PAGE_BOTTOM) + MARK_H + 2;

    // 目录只列章节的第一页，页码就是该章在手册里的第一页
    let y = head(toc, '目录');
    [['一、基本条例', rulesPages[0]], ['二、支持地区', regionPages[0]], ['三、签名详情', sealPages[0]], ['四、企业名录', entPage]]
      .filter(([, pg]) => pg && this.pages.includes(pg))
      .forEach(([s, pg]) => {
        toc.rows.push({ s, y, col: K.CYAN }, { s: `第 ${this.pages.indexOf(pg) + 1} 页`, y, col: K.DIM, x: this.w - 10, anchor: 'ra' });
        toc.links.push({ box: [3, y - 3, this.w - 4, y + 10], page: this.pages.indexOf(pg) });
        y += 16;
      });

    this.home = this.pages.indexOf(toc);   // 目录页：手册每次从桌面打开时默认停在这里
    this.page = this.home;
    this.tabs = pageTabs(this.w);
    const marks = [['目录', toc, K.CLAUDE], ['条例', rulesPages[0], K.CYAN], ['地区', regionPages[0], K.GREEN], ['签名', sealPages[0], K.AMBER],
      ['企业', entPage, K.CYAN_L]]
      .filter(([, pg]) => this.pages.includes(pg));
    const mw = Math.floor((this.w - 8) / Math.max(1, marks.length));
    this.marks = marks.map(([label, pg, col], i) => ({
      label, col, page: this.pages.indexOf(pg), box: [4 + i * mw, this.h - MARK_H - 2, 2 + (i + 1) * mw, this.h - 3],
    }));
  }

  get fields() { return this.pages[this.page].fields; }

  flip() { this.page = (this.page + 1) % this.npages; }

  back() { this.page = (this.page - 1 + this.npages) % this.npages; }

  // 点 ◀ / ▶ 前后翻页，点书签 / 目录条目跳到那一页；点中了返回 true
  press(rx, ry) {
    if (pressPageTabs(this, rx, ry)) return true;
    // 书签栏关掉时只剩目录里的文字链接
    const l = [...(this.marksOn ? this.marks : []), ...this.pages[this.page].links].find((l) => inBox(rx, ry, l.box));
    if (l) this.page = l.page;
    return !!l;
  }

  draw(x, y) {
    winChrome(x, y, this.w, this.h, this.title, '', K.CLAUDE, rgb([70, 36, 26]), true);
    drawPageTabs(this, x, y, K.CLAUDE);
    for (const r of this.pages[this.page].rows) {
      if (r.seal) drawSeal(x + 8, y + r.y, r.seal, genuine(r.seal));
      else if (r.icon) drawCorpIcon(x + r.x, y + r.y, r.icon);
      else txt(x + (r.x ?? 6), y + r.y, r.s, r.size || 8, r.col, r.anchor);
    }
    rect(x + 1, y + this.h - MARK_H - 4, x + this.w - 2, y + this.h - MARK_H - 4, K.GRID);
    if (this.marksOn) for (const m of this.marks) {
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
    this.sub = 'NOTICE';
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
    // 第 1 页可审查的是公告日期：和任务栏右下角的系统日期是同一用法，框也只圈日期本身
    const lw = tw(`安索兹卡 ${date}`, 8);
    const left = Math.round((this.w - lw) / 2) + tw('安索兹卡 ', 8);
    const f0 = { 'notice.date': [left - 2, TITLE_H + 4, left + tw(date, 8) + 2, TITLE_H + 18] };
    if (sig) {
      // 底部：安全部会话中心（凭证签发机构）的有效签名（只印，不作为审查栏位）
      y += 4;
      lines0.push({ s: `${SIGNERS.cred.issuer}`, col: K.DIM, anchor: 'ma', y, rule: true },
        { s: SIGNERS.cred.print, col: K.AMBER, anchor: 'ma', y: y + 11 });
      y += 15;
    }
    this.pages.push({ lines: lines0, fields: f0, h: y + 11 });

    for (const pg of pages) {
      // 附页可以没有标题（head）：没有就不画标题行，避免印出 undefined
      const head = pg.head ? [[pg.head, K.CLAUDE_L, 'ma'], null] : [];
      const [lines, y1] = flow([...head, ...para(pg.body), null], TITLE_H + 7);
      const page = { lines, fields: {} };
      if (pg.sample) { page.sample = { y: y1 + 2, row: pg.sample }; }
      page.h = y1 + 8 + (pg.sample ? 64 : 0);
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
      this.pages.push({ lines: lines1, fields: f1, avatars: true, h: y + 8 });
    }

    if (news) this.pages.push({ lines: [], fields: {}, news: true, h: TITLE_H + 168 });

    this.npages = this.pages.length;
    this.page = 0;
    this.h = Math.max(...this.pages.map((pg) => pg.h));
    this.tabs = pageTabs(this.w);
  }

  get fields() { return this.pages[this.page].fields; }

  flip() { this.page = (this.page + 1) % this.npages; }

  back() { this.page = (this.page - 1 + this.npages) % this.npages; }

  press(rx, ry) {
    return pressPageTabs(this, rx, ry);
  }

  draw(x, y) {
    winChrome(x, y, this.w, this.h, this.title, '', K.CLAUDE, rgb([70, 36, 26]), true);
    drawPageTabs(this, x, y, K.CLAUDE);
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

  // 最后一页：当天的《安索兹卡对齐报》剪报
  drawNews(x, y) {
    const n = this.news, px = x + 8, pw = this.w - 17, py = y + TITLE_H + 5, ph = 154;
    rect(px, py, px + pw, py + ph, PAPER);
    txt(px + pw / 2, py + 6, '安索兹卡对齐报', 12, PAPER_INK, 'ma');
    txt(px + pw / 2, py + 22, `ALIGNMENT OF ANTHROTZKA  ·  ${this.date}`, 8, PAPER_TEXT, 'ma');
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

// 验证 SMS 的两扇窗：发给对方填的表单（smsf）、按凭证查到的身份记录（sms）。
// 行和栏位的排法同证件；note 是窗口顶部的独立提示（不属于表单栏位，不登记比对栏位）；
// foot 是窗口底部的一行说明（例如档案下方那句核对规则），会按文字宽度把窗口放宽，画在分隔线下面。
class InfoWin {
  constructor(key, title, sub, rows, foot = '', note = '') {
    Object.assign(this, { key, title, sub, rows, foot, note, closable: true, w: 164 });
    this.layout();
  }

  layout() {
    this.noteH = this.note ? 18 : 0;
    this.w = Math.max(164, this.foot ? tw(this.foot, 8) + 14 : 0, this.note ? tw(this.note, 8) + 20 : 0);
    this.h = TITLE_H + 6 + this.noteH + 12 * this.rows.length + 4 + (this.foot ? 13 : 0);
    this.fields = {};
    this.rows.forEach(([k, v, field], i) => {
      if (field) this.fields[`${this.key}.${k}`] = [3, TITLE_H + 2 + this.noteH + 12 * i, this.w - 4, TITLE_H + 13 + this.noteH + 12 * i];
    });
  }

  draw(x, y) {
    winChrome(x, y, this.w, this.h, this.title, this.sub, K.GREEN, rgb([20, 50, 34]), true);
    // 顶部提示单独一行：置中、琥珀色，下面一条分隔线，和表单栏位分开
    if (this.note) {
      const ny = y + TITLE_H + 4;
      txt(x + this.w / 2, ny, this.note, 8, K.AMBER, 'ma');
      rect(x + 5, ny + 10, x + this.w - 6, ny + 10, K.GRID);
    }
    const top = TITLE_H + 4 + this.noteH;
    this.rows.forEach(([k, v], i) => {
      const yy = y + top + i * 12;
      if (!k) { txt(x + this.w / 2, yy, v, 8, K.TEXT, 'ma'); return; }   // 无标签：整行居中
      txt(x + 6, yy, k, 8, K.DIM);
      txt(x + 42, yy, v, 8, v.startsWith('_') ? K.DIM_D : K.TEXT);
    });
    if (this.foot) {
      const fy = y + this.h - 12;
      rect(x + 5, fy - 5, x + this.w - 6, fy - 5, K.GRID);
      txt(x + 6, fy, this.foot, 8, K.AMBER);
    }
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
// 请求内容那一句是可审查栏位（hist.请求），可以和令牌上的请求摘要（tok.请求）
// 或 API 授权的用途核对；没有令牌时本人不会说明来意，也就没有这一句。
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

  // 给每一行补上纵坐标：审查栏位要和画出来的位置一致
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

// 桌面右下角的应用图标：手册 / 通告 / 历史记录 / 审查
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
