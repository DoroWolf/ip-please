'use strict';
// 请求生成回归检查：请求券 / 比对栏位 / 前两天的出题范围 / 手册与通告版面。
// 不依赖浏览器，直接跑：node tools/check_requests.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src');

global.window = {};
require(path.join(src, 'assets.js'));

const ctx = vm.createContext({
  ASSETS: global.window.ASSETS,
  window: { ASSETS: global.window.ASSETS },
  console, Date, Math, Set, Map, JSON, String, Number, Array, Object,
});
for (const name of ['gfx.js', 'data.js', 'story.js', 'docs.js']) {
  vm.runInContext(fs.readFileSync(path.join(src, name), 'utf8'), ctx, { filename: name });
}

const get = (expr) => vm.runInContext(expr, ctx);
const STORY = get('STORY');
const STORY_DATE = get('STORY_DATE');
const makeRequest = get('makeRequest');
const Rulebook = get('Rulebook');
const Doc = get('Doc');
const fmtDate = get('fmtDate');
const addDays = get('addDays');

const day = (n) => addDays(STORY_DATE, n - 1);
const today = (n) => fmtDate(day(n));
const pairKey = (a, b) => [a, b].sort().join('|');
const issuesOf = (spec, a, b) => spec.issues.filter((is) => is.pairs.some((p) => pairKey(...p) === pairKey(a, b)));
const fail = (msg, spec = {}) => {
  console.error('FAIL:', msg);
  console.error(JSON.stringify({
    flaw: spec.flaw, region: spec.docs?.[0]?.rows?.find((r) => r[0] === '地区')?.[1],
    docs: spec.docs?.map((d) => [d.key, d.rows]), issues: spec.issues, checks: spec.checks ? [...spec.checks] : undefined, reason: spec.reason,
  }, null, 2));
  process.exit(1);
};

const stats = { day3: { total: 0, home: 0, foreign: 0, unsupported: 0, voucher: 0, noVoucher: 0, voucherExpired: 0, credExpired: 0, validForeign: 0 }, flaws: {} };
for (let i = 0; i < 20000; i++) {
  const spec = makeRequest(day(3), 0.45, [], STORY[2]);
  stats.day3.total++;
  const by = Object.fromEntries(spec.docs.map((d) => [d.key, d]));
  const cred = by.cred;
  if (!cred) fail('day3 沒有憑證', spec);
  const region = cred.rows.find((r) => r[0] === '地区')[1];
  const supported = STORY[2].regions.includes(region);
  const foreign = supported && region !== '美国';
  const voucher = by.voucher;
  if (!spec.checks.has(pairKey('cred.地区', 'rule.region'))) fail('第三天憑證地區缺少與地區條例的比對關係', spec);
  stats.flaws[spec.flaw] = (stats.flaws[spec.flaw] || 0) + 1;
  if (!supported) {
    // 憑證地區不在支持地區：地區條例直接判死，不發請求券，也不和請求券條例建立關聯
    stats.day3.unsupported++;
    if (spec.flaw !== 'region') fail('不支援地區應為 region 問題', spec);
    if (voucher) fail('不支援地區不應有請求券', spec);
    if (!issuesOf(spec, 'cred.地区', 'rule.region').length) fail('缺少地區不支援的矛盾', spec);
    if (spec.checks.has(pairKey('cred.地区', 'rule.voucher'))) fail('不支援地區不應與請求券條例建立關聯', spec);
    if (!spec.reason.includes('不在支持地区')) fail('region 理由錯', spec);
  } else if (foreign) {
    stats.day3.foreign++;
    if (spec.flaw === 'no_voucher') {
      stats.day3.noVoucher++;
      if (voucher) fail('no_voucher 不應有請求券', spec);
      if (!issuesOf(spec, 'cred.地区', 'rule.voucher').length) fail('no_voucher 缺少對應矛盾', spec);
      if (issuesOf(spec, 'cred.地区', 'rule.region').length) fail('地區在支持範圍內，不應出現地區矛盾', spec);
      if (!spec.reason.includes('未出示请求券')) fail('no_voucher 理由錯', spec);
    } else {
      stats.day3.voucher++;
      if (!voucher) fail('外國請求（非 no_voucher）沒有請求券', spec);
      if (voucher.rows.length !== 1 || voucher.rows[0][0] !== '有效期') fail('請求券只能有有效期一欄', spec);
      if (!spec.checks.has(pairKey('voucher.有效期', 'sys.日期'))) fail('請求券缺少與系統日期的比對關係', spec);
      const vd = voucher.rows[0][1];
      if (spec.flaw === 'exp' && spec.issues.some((is) => is.title === '請求券過期' || is.title === '请求券过期')) {
        stats.day3.voucherExpired++;
        if (vd >= today(3)) fail('請求券過期日期不在過去', spec);
        if (!issuesOf(spec, 'voucher.有效期', 'sys.日期').length) fail('請求券過期缺少矛盾', spec);
        if (!issuesOf(spec, 'cred.地区', 'rule.voucher').length) fail('請求券過期缺少與請求券條例的矛盾', spec);
      } else if (vd < today(3)) {
        fail('有效請求券的日期在過去', spec);
      } else {
        stats.day3.validForeign++;
        const note = spec.notes && spec.notes.get(pairKey('cred.地区', 'rule.voucher'));
        if (!note) fail('持有效請求券的外國請求缺少已持券說明', spec);
      }
    }
  } else {
    // 美國請求免券；地區仍在支持範圍內
    stats.day3.home++;
    if (voucher) fail('美國請求不應有請求券', spec);
    const note = spec.notes && spec.notes.get(pairKey('cred.地区', 'rule.voucher'));
    if (!note) fail('美國請求缺少免券說明', spec);
    if (issuesOf(spec, 'cred.地区', 'rule.voucher').length) fail('美國請求不應有請求券矛盾', spec);
  }
  if (spec.flaw === 'exp') {
    const exp = spec.issues.find((is) => is.title === '证件过期' || is.title === '请求券过期' || is.title === '請求券過期');
    if (!exp) fail('exp 缺少過期矛盾', spec);
    if (spec.issues.some((is) => is.title === '证件过期')) stats.day3.credExpired++;
  }
  if (spec.flaw && !spec.reason) fail('有問題但沒有理由', spec);
  if (!spec.flaw && spec.reason) fail('合規請求不應有理由', spec);
  if (!['region', 'exp', 'no_voucher', null].includes(spec.flaw)) fail('第三天出現不該有的問題', spec);
}

// 前兩天回歸
for (const [idx, allowed] of [[0, [null, 'region']], [1, [null, 'region', 'exp']]]) {
  for (let i = 0; i < 5000; i++) {
    const spec = makeRequest(day(idx + 1), 0.45, [], STORY[idx]);
    if (!allowed.includes(spec.flaw)) fail(`day${idx + 1} 出現不該有的問題`, spec);
    if (spec.docs.some((d) => d.key === 'voucher')) fail(`day${idx + 1} 不應有請求券`, spec);
    if (spec.checks.has(pairKey('cred.地区', 'rule.voucher'))) fail(`day${idx + 1} 不應有請求券比對`, spec);
    if (spec.docs.length !== 1) fail(`day${idx + 1} 應該只有憑證`, spec);
  }
}

// 規則手冊：三天都要有正確的「支持地區」欄位；第三天要有請求券條例
for (let i = 0; i < STORY.length; i++) {
  const rb = new Rulebook(STORY[i]);
  const withRegion = rb.pages.filter((p) => p.fields['rule.region']);
  const withVoucher = rb.pages.filter((p) => p.fields['rule.voucher']);
  if (i < 2 && (withRegion.length !== 2 || withVoucher.length)) fail(`day${i + 1} 手冊欄位錯`, {});
  if (i === 2 && (withRegion.length !== 2 || withVoucher.length !== 1)) fail('day3 手冊應有地區條例（條例頁＋支持地區頁）與請求券條例（條例頁）', {});
  if (i === 2 && !rb.pages.some((p) => p.rows.some((r) => r.s === '外国请求须持有效请求券'))) fail('day3 手冊缺少請求券條例', {});
}

// 通告版面：第三天掛在 (316,126)，視窗底不能超過桌面下緣 (343)
const OfficialNotice = get('OfficialNotice');
for (let i = 0; i < STORY.length; i++) {
  const rs = STORY[i];
  const n = new OfficialNotice(today(i + 1), { body: rs.notice, sig: rs.tok, pages: rs.pages, news: rs.news, wanted: [] });
  if (n.pages.length !== 1 + rs.pages.length + 1) fail(`day${i + 1} 通告頁數錯`, {});
  if (126 + n.h > 343) fail(`day${i + 1} 通告太高（${n.h}）`, {});
  if (i === 2 && n.pages[0].h > 217) fail('day3 通告第 1 頁超出桌面', {});
}

// 請求券證件：只有有效期一欄、沒有簽名
const d = new Doc('voucher', [['有效期', '2078.01.01']], null);
if (d.title !== '请求券' || d.sub !== 'REQUEST PASS') fail('請求券標題錯', {});
if (d.rows.length !== 1 || !d.fields['voucher.有效期']) fail('請求券欄位錯', {});
if (d.sig) fail('請求券不應有簽名', {});

console.log('OK');
console.log(JSON.stringify(stats, null, 2));
