'use strict';
// 请求生成回归检查：请求券 / 审查栏位 / 前两天的出题范围 / 手册与通告版面。
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
const InfoWin = get('InfoWin');
const tw = get('tw');
const fmtDate = get('fmtDate');
const addDays = get('addDays');
const TITLE_H = get('TITLE_H');
const HOME_REGIONS = get('HOME_REGIONS');

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

// 無盡模式的世界觀日期：難度 1 是 2078.01.01，難度 2 是 2078.01.02
{
  const worldDate = get('worldDate');
  if (fmtDate(worldDate(1)) !== '2078.01.01') fail(`難度 1 的世界觀日期錯：${fmtDate(worldDate(1))}`, {});
  if (fmtDate(worldDate(2)) !== '2078.01.02') fail(`難度 2 的世界觀日期錯：${fmtDate(worldDate(2))}`, {});
}

const stats = { day3: { total: 0, home: 0, foreign: 0, unsupported: 0, voucher: 0, noVoucher: 0, voucherExpired: 0, credExpired: 0, validForeign: 0 }, flaws: {} };
for (let i = 0; i < 20000; i++) {
  const spec = makeRequest(day(3), 0.45, [], STORY[2]);
  stats.day3.total++;
  const by = Object.fromEntries(spec.docs.map((d) => [d.key, d]));
  const cred = by.cred;
  if (!cred) fail('day3 沒有憑證', spec);
  const region = cred.rows.find((r) => r[0] === '地区')[1];
  const supported = STORY[2].regions.includes(region);
  const foreign = supported && !HOME_REGIONS.includes(region);
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
      if (!spec.checks.has(pairKey('voucher.有效期', 'notice.date'))) fail('請求券缺少與通告日期的比對關係', spec);
      const vd = voucher.rows[0][1];
      if (spec.flaw === 'exp' && spec.issues.some((is) => is.title === '請求券過期' || is.title === '请求券过期')) {
        stats.day3.voucherExpired++;
        if (vd >= today(3)) fail('請求券過期日期不在過去', spec);
        if (!issuesOf(spec, 'voucher.有效期', 'sys.日期').length) fail('請求券過期缺少矛盾', spec);
        if (!issuesOf(spec, 'voucher.有效期', 'notice.date').length) fail('請求券過期缺少與通告日期的矛盾', spec);
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
    // 本國（美國、英國）請求免券；地區仍在支持範圍內
    stats.day3.home++;
    if (voucher) fail('本國請求不應有請求券', spec);
    const note = spec.notes && spec.notes.get(pairKey('cred.地区', 'rule.voucher'));
    if (!note) fail('本國請求缺少免券說明', spec);
    if (issuesOf(spec, 'cred.地区', 'rule.voucher').length) fail('本國請求不應有請求券矛盾', spec);
  }
  if (spec.flaw === 'exp') {
    const exp = spec.issues.find((is) => is.title === '证件过期' || is.title === '请求券过期' || is.title === '請求券過期');
    if (!exp) fail('exp 缺少過期矛盾', spec);
    if (!exp.pairs.some((p) => p.includes('notice.date'))) fail('exp 缺少與通告日期的比對', spec);
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
    // 沒有令牌：看不到請求摘要，接入者也不會說明來意
    if (spec.taskOnTok) fail(`day${idx + 1} 沒有令牌卻顯示請求摘要`, spec);
    if ([...spec.checks].some((k) => k.includes('请求'))) fail(`day${idx + 1} 沒有令牌卻建立請求摘要的比對`, spec);
  }
}

// 無盡模式的規則組：下面幾段回歸都會用到
const FULL_RULES = get('FULL_RULES');

// 請求摘要印在令牌上：前三天（沒有令牌）看不到摘要；第四天起與無盡模式的令牌多了「請求」一欄
for (const [label, rs, date] of [['day1', STORY[0], day(1)], ['day2', STORY[1], day(2)], ['day3', STORY[2], day(3)]]) {
  for (let i = 0; i < 3000; i++) {
    const spec = makeRequest(date, 0.45, [], rs);
    if (spec.docs.some((d) => d.key === 'tok')) fail(`${label} 不應有令牌`, spec);
    if (spec.taskOnTok) fail(`${label} 沒有令牌卻顯示請求摘要`, spec);
    if ([...spec.checks].some((k) => k.includes('tok.请求'))) fail(`${label} 沒有令牌卻建立請求摘要的比對`, spec);
    if (spec.issues.some((is) => is.pairs.some((p) => p.includes('rv.请求') || p.includes('tok.请求')))) {
      fail(`${label} 沒有令牌卻出現請求摘要的矛盾`, spec);
    }
  }
}
let sawTaskOnTok = false;
for (const [label, rs, date] of [['day4', STORY[3], day(4)], ['day5', STORY[4], day(5)], ['endless', FULL_RULES, day(1)]]) {
  for (let i = 0; i < 3000; i++) {
    const spec = makeRequest(date, 0.45, [], rs);
    const tok = spec.docs.find((d) => d.key === 'tok');
    if (!tok) {
      if (spec.flaw !== 'no_tok') fail(`${label} 缺少令牌`, spec);
      // 沒交令牌：摘要同樣看不到，本人也不會說明來意
      if (spec.taskOnTok) fail(`${label} 沒有令牌卻顯示請求摘要`, spec);
      if ([...spec.checks].some((k) => k.includes('tok.请求'))) fail(`${label} 沒有令牌卻建立請求摘要的比對`, spec);
      continue;
    }
    sawTaskOnTok = true;
    const rows = Object.fromEntries(tok.rows);
    if (rows.请求 !== spec.task) fail(`${label} 令牌上的請求摘要錯`, spec);
    if (!tok.fields['tok.请求']) fail(`${label} 令牌的請求摘要不可比對`, spec);
    if (!spec.taskOnTok) fail(`${label} 有令牌卻沒有標記請求摘要`, spec);
    if (!spec.checks.has(pairKey('tok.请求', 'hist.请求'))) fail(`${label} 令牌請求摘要缺少與歷史紀錄的比對關係`, spec);
  }
}
if (!sawTaskOnTok) fail('令牌上應該印請求摘要', {});

// 用途不一致：拿令牌上的請求摘要（或歷史紀錄）和 API 授權的用途核對，不再指向審查窗
let sawScope = false;
for (let i = 0; i < 20000 && !sawScope; i++) {
  const spec = makeRequest(day(1), 0.9, [], FULL_RULES);
  if (spec.flaw !== 'scope') continue;
  sawScope = true;
  const pairs = spec.issues.flatMap((is) => is.pairs).map((p) => pairKey(...p));
  if (!pairs.includes(pairKey('api.用途', 'tok.请求'))) fail('用途不一致應指向令牌上的請求摘要', spec);
  if (!pairs.includes(pairKey('api.用途', 'hist.请求'))) fail('用途不一致應指向歷史紀錄的請求', spec);
  if (pairs.some((p) => p.includes('rv.请求'))) fail('請求摘要不應再放在審查窗', spec);
  if (!spec.checks.has(pairKey('api.用途', 'tok.请求'))) fail('API 授權用途缺少與令牌請求摘要的比對', spec);
}
if (!sawScope) fail('無盡模式應會出用途不一致', {});
// 無盡模式的憑證不再印「套餐」：欄位與比對關係都不要留
if (FULL_RULES.credRows.includes('套餐')) fail('無盡模式憑證不應再有套餐欄', {});
for (let i = 0; i < 3000; i++) {
  const spec = makeRequest(day(1), 0.3, [], FULL_RULES);
  const cred = spec.docs.find((d) => d.key === 'cred');
  if (!cred) continue;
  if (cred.rows.some((r) => r[0] === '套餐')) fail('無盡模式憑證不應印套餐', spec);
  if (cred.fields['cred.套餐']) fail('無盡模式憑證不應登記套餐欄位', spec);
}


// API 授權：移除「持有人」欄位；暱稱不符只落在憑證上
let sawApiDoc = false, sawName = false;
for (let i = 0; i < 20000 && (!sawApiDoc || !sawName); i++) {
  const spec = makeRequest(day(1), 0.9, [], FULL_RULES);
  const api = spec.docs.find((d) => d.key === 'api');
  if (api) {
    sawApiDoc = true;
    if (api.rows.map((r) => r[0]).join(',') !== 'IP,用途,有效期') fail('API 授權欄位應為 IP / 用途 / 有效期', spec);
    if (api.fields['api.持有人']) fail('API 授權不應登記持有人比對欄位', spec);
    if ([...spec.checks].some((k) => k.includes('api.持有人'))) fail('API 授權不應與持有人建立比對', spec);
  }
  if (spec.flaw === 'name') {
    sawName = true;
    if (spec.nameField !== 'cred.昵称') fail('暱稱不符應只落在憑證上', spec);
    if (!spec.checks.has(pairKey('cred.昵称', 'rv.昵称'))) fail('憑證暱稱缺少與本人的比對關係', spec);
    if (spec.issues.some((is) => is.pairs.some((p) => p.includes('api.持有人')))) fail('暱稱不符不應再指向 API 授權', spec);
  }
}
if (!sawApiDoc) fail('無盡模式應會出 API 授權', {});
if (!sawName) fail('無盡模式應會出暱稱不符', {});



// 身份檔案：曾用名有時一個都沒有（印「無」）；本人改過暱稱的合規請求一定留著舊暱稱
let sawNoOldname = false, sawOldname = false;
for (let i = 0; i < 20000; i++) {
  const spec = makeRequest(day(1), 0.6, [], FULL_RULES);
  if (!spec.sms) continue;
  const names = spec.sms.names;
  if (names.includes(spec.handle)) fail('曾用名不應包含本人現在的暱稱', spec);
  if (names.length) sawOldname = true; else sawNoOldname = true;
  if (spec.nameField) {
    const [k, f] = spec.nameField.split('.');
    const d = spec.docs.find((x) => x.key === k);
    const docName = d && Object.fromEntries(d.rows)[f];
    if (spec.legit && !names.includes(docName)) fail('改過暱稱的合規請求，檔案裡一定要有舊暱稱', spec);
    if (!spec.legit && names.includes(docName)) fail('冒用者的證件暱稱不應出現在曾用名裡', spec);
  }
}
if (!sawNoOldname) fail('身份檔案應會出現沒有曾用名的情況', {});
if (!sawOldname) fail('身份檔案應會出現曾用名', {});

// 身份檔案的版面：底部那行核對規則不能超出視窗，欄位仍要能比對
{
  const foot = '用户的手机与请求的昵称必须与此档案一致';
  const rec = new InfoWin('sms', '身份记录', 'RECORD', [['昵称', 'mlee', true], ['曾用名', '无', true], ['手机', '+1 555 0100', true]], foot);
  if (!rec.fields['sms.曾用名'] || !rec.fields['sms.手机']) fail('身份檔案欄位錯', {});
  if (rec.w - 12 < tw(foot, 8)) fail('身份檔案太窄，底部提示會超出視窗', {});
  if (rec.h <= new InfoWin('sms', '身份记录', 'RECORD', [['昵称', 'mlee', true]]).h) fail('底部提示應讓檔案變高', {});
}
// SMS 表單：「將此表單交給用戶」是視窗頂部的獨立提示，不佔用表單列、也不登記比對欄位
{
  const note = '将此表单交给用户';
  const form = new InfoWin('smsf', '验证 SMS', 'SMS', [['手机', '________________']], '', note);
  const plain = new InfoWin('smsf', '验证 SMS', 'SMS', [['手机', '________________']]);
  if (form.note !== note) fail('SMS 表單缺少頂部提示', {});
  if (form.rows.length !== 1 || form.rows[0][0] !== '手机') fail('SMS 表單提示不應混進欄位列', {});
  if (Object.keys(form.fields).length) fail('SMS 空白表單不應登記比對欄位', {});
  const filled = new InfoWin('smsf', '验证 SMS', 'SMS', [['手机', '+1 555 0100', true]], '', note);
  const phone = filled.fields['smsf.手机'];
  if (!phone) fail('SMS 表單缺少手機欄位', {});
  if (phone[1] < TITLE_H + 18) fail('SMS 手機欄位應排在提示列下方', {});
  if (form.h <= plain.h) fail('提示列應讓 SMS 表單變高', {});
  if (phone[3] > filled.h) fail('SMS 手機欄位超出表單', {});
}



// 令牌的「运营商」：第四天起（以及无尽模式）每张令牌都印运营商，格式「主要城市 · 运营商名」。
// 合规请求的运营商属于凭证地区；只有 isp 问题会印成别处的运营商，且可以拘留。
const ispOf = get('ispOf');
const SUSPEND_FLAWS = get('SUSPEND_FLAWS');
if (!SUSPEND_FLAWS.includes('isp')) fail('運營商與地區不符應可拘留', {});
if (!FULL_RULES.rules.some((r) => r.key === 'isp')) fail('無盡模式應啟用運營商條例', {});
const ispStats = { total: 0, mismatch: 0 };
for (const [label, rs, date] of [['day4', STORY[3], day(4)], ['day5', STORY[4], day(5)], ['endless', FULL_RULES, day(1)]]) {
  for (let i = 0; i < 5000; i++) {
    const spec = makeRequest(date, 0.45, [], rs);
    const tok = spec.docs.find((d) => d.key === 'tok');
    if (!tok) {
      if (spec.flaw !== 'no_tok') fail(`${label} 缺少令牌`, spec);
      continue;
    }
    const rows = Object.fromEntries(tok.rows);
    if (!('运营商' in rows)) fail(`${label} 令牌缺少運營商欄`, spec);
    if (!tok.fields['tok.运营商']) fail(`${label} 令牌運營商欄不可比對`, spec);
    // 運營商欄是「主要城市 · 名稱」：城市在前，名稱在後
    if (!/^\S+ · [A-Z]+$/.test(rows.运营商)) fail(`${label} 運營商欄應為城市 · 名稱`, spec);
    // 時區暫時不印在令牌上（資料仍保留給之後的規則組）
    if ('时区' in rows) fail(`${label} 令牌不應印時區`, spec);
    if (tok.fields['tok.时区']) fail(`${label} 令牌時區欄不應可比對`, spec);
    // 令牌不帶簽名
    if (tok.sig || tok.fields['tok.签名']) fail(`${label} 令牌不應有簽名`, spec);
    const cred = spec.docs.find((d) => d.key === 'cred');
    if (!cred) continue;   // 憑證缺失（no_cred）時沒有地區可對照
    const region = cred.rows.find((r) => r[0] === '地区')[1];
    if (!spec.checks.has(pairKey('tok.运营商', 'cred.地区'))) fail(`${label} 令牌運營商缺少與憑證地區的比對關係`, spec);
    if (rs.rules.some((r) => r.key === 'isp') && !spec.checks.has(pairKey('tok.运营商', 'rule.isp'))) {
      fail(`${label} 令牌運營商缺少與條例的比對關係`, spec);
    }
    if (spec.flaw === 'isp') {
      ispStats.mismatch++;
      if (rows.运营商 === ispOf(region)) fail(`${label} isp 問題的運營商不應落在憑證地區`, spec);
      const is = spec.issues.find((x) => x.type === 'isp');
      if (!is) fail(`${label} isp 問題缺少矛盾`, spec);
      if (is && !is.pairs.some((p) => pairKey(...p) === pairKey('tok.运营商', 'cred.地区'))) fail(`${label} isp 問題沒有指向憑證地區`, spec);
      if (is && rs.rules.some((r) => r.key === 'isp') && !is.pairs.some((p) => pairKey(...p) === pairKey('tok.运营商', 'rule.isp'))) {
        fail(`${label} isp 問題沒有指向運營商條例`, spec);
      }
      if (!spec.reason.includes('运营商') || !spec.reason.includes(region)) fail(`${label} isp 理由錯`, spec);
    } else if (rows.运营商 !== ispOf(region)) {
      fail(`${label} 合規令牌的運營商應屬於憑證地區`, spec);
    }
    ispStats.total++;
  }
}
if (!ispStats.mismatch) fail('無盡模式應會出運營商與地區不符', {});

// 時區不印在令牌上，但資料仍保留；無盡模式也不會拿看不到的 tok.時區 建立矛盾或關聯
const REGION_LOCALE = get('REGION_LOCALE');
if (!REGION_LOCALE['日本'] || REGION_LOCALE['日本'][1] !== 'UTC+09:00') fail('REGION_LOCALE 應保留時區', {});
for (let i = 0; i < 5000; i++) {
  const spec = makeRequest(day(1), 0.6, [], FULL_RULES);
  const pairs = spec.issues.flatMap((is) => is.pairs);
  if (pairs.some((p) => p.includes('tok.时区'))) fail('令牌不印時區時仍出現時區矛盾', spec);
  if ([...spec.checks].some((k) => k.includes('tok.时区'))) fail('令牌不印時區時仍建立時區比對', spec);
  if (spec.flaw === 'locale') {
    const is = spec.issues.find((x) => x.type === 'locale');
    if (!is || !is.pairs.some((p) => p.includes('tok.语言'))) fail('locale 問題應指向令牌語言', spec);
  }
}

// 簽名搬移：憑證由安全部會話中心簽發、令牌沒有簽名、API 授權不變
const SIGNERS = get('SIGNERS');
if (!SIGNERS.cred || SIGNERS.cred.issuer !== '安全部会话中心' || SIGNERS.cred.print !== '7D13-0BE6') fail('憑證應改用安全部會話中心的簽名', {});
if (SIGNERS.tok) fail('令牌不應再有簽名機構', {});
if (!SIGNERS.api || SIGNERS.api.issuer !== '安全部接口管理处') fail('API 授權簽發機構不應改動', {});

let sawSig = false;
for (let i = 0; i < 5000; i++) {
  const spec = makeRequest(day(1), 0.6, [], FULL_RULES);
  const tok = spec.docs.find((x) => x.key === 'tok');
  if (tok && (tok.sig || tok.fields['tok.签名'])) fail('令牌不應帶簽名', spec);
  if (spec.flaw !== 'sig') continue;
  sawSig = true;
  const keys = spec.issues.flatMap((is) => is.pairs).flat();
  if (!keys.some((k) => k === 'cred.签名' || k === 'api.签名')) fail('簽名問題應指向憑證或 API 授權', spec);
  if (keys.some((k) => k === 'tok.签名')) fail('簽名問題不應指向令牌', spec);
  if (spec.docs.some((x) => x.key === 'tok' && x.sig)) fail('偽造簽名不應落在令牌上', spec);
}
if (!sawSig) fail('無盡模式應會出簽名問題', {});

// 手冊「簽名詳情」：只有憑證與 API 授權，憑證用安全部會話中心的式樣
{
  const rb = new Rulebook(FULL_RULES);
  const sealPages = rb.pages.filter((p) => p.fields['book.cred'] || p.fields['book.api']);
  const sealFields = sealPages.flatMap((p) => Object.keys(p.fields)).sort().join(',');
  if (sealFields !== 'book.api,book.cred') fail('簽名詳情頁欄位錯', {});
  if (!sealPages.some((p) => p.rows.some((r) => r.seal === 'cred')) || !sealPages.some((p) => p.rows.some((r) => r.seal === 'api'))) fail('簽名詳情頁缺少憑證 / API 授權', {});
  const cs = get('genuine')('cred');
  if (cs.issuer !== '安全部会话中心' || cs.print !== '7D13-0BE6') fail('憑證簽名式樣錯', {});
}

// 規則手冊：三天都要有正確的「支持地區」欄位；第三天要有請求券條例
for (let i = 0; i < STORY.length; i++) {
  const rb = new Rulebook(STORY[i]);
  const withRegion = rb.pages.filter((p) => p.fields['rule.region']);
  const withVoucher = rb.pages.filter((p) => p.fields['rule.voucher']);
  const regionSection = rb.pages.filter((p) => p.rows[0] && (p.rows[0].s === '二、支持地区' || p.rows[0].s === '二、支持地区（续）'));
  if (withRegion.length < 2) fail(`day${i + 1} 手冊缺少地區條例欄位`, {});
  if (regionSection.length < 1 || regionSection.some((p) => !p.fields['rule.region'])) fail(`day${i + 1} 支持地區分頁缺少地區條例欄位`, {});
  if (withVoucher.length !== (i === 2 ? 1 : 0)) fail(`day${i + 1} 手冊請求券條例欄位錯`, {});
  if (i >= 1 && regionSection.length < 2) fail(`day${i + 1} 支持地區太長時應自動分頁`, {});
  if (rb.h > 160) fail(`day${i + 1} 手冊不應再隨內容長高（${rb.h}）`, {});
  if (i === 2 && !rb.pages.some((p) => p.rows.some((r) => r.s === '外国请求须持有效请求券'))) fail('day3 手冊缺少請求券條例', {});
}

// 無盡模式的「支持地區」頁：令牌印語言，因此列出地區 / 語言，但不列時區；內容太長要分頁
{
  const rb = new Rulebook(FULL_RULES);
  const regionSection = rb.pages.filter((p) => p.rows[0] && (p.rows[0].s === '二、支持地区' || p.rows[0].s === '二、支持地区（续）'));
  const texts = regionSection.flatMap((p) => p.rows.map((r) => r.s));
  if (regionSection.length < 2) fail('無盡模式支持地區頁應該分頁', {});
  if (!texts.includes('语言') || texts.includes('时区')) fail('無盡模式支持地區頁欄位錯', {});
  if (!texts.includes('en-US')) fail('無盡模式支持地區頁缺少語言代碼', {});
  if (texts.includes('UTC-05:00')) fail('無盡模式支持地區頁不應列出時區', {});
  // 新加入的支持地區：大洲、地區、語言都要印在分頁上
  for (const s of ['大洋洲', '澳大利亚', '加拿大', 'en-AU', 'en-CA']) {
    if (!texts.includes(s)) fail(`支持地區頁缺少 ${s}`, {});
  }
  // 令牌不印時區時，基本條例也只提語言
  const rulePages = rb.pages.filter((p) => p.fields['rule.docs']);
  const ruleTexts = rulePages.flatMap((p) => p.rows.map((r) => r.s));
  if (!ruleTexts.includes('语言须与地区一致')) fail('無盡模式條例應只提語言', {});
  if (ruleTexts.includes('语言和时区须与地区一致')) fail('無盡模式條例不應再提時區', {});
  // 隱藏條例（例如無盡模式的運營商 / IP / 簽名）仍要生效，但不印在手冊上、不登記比對欄位
  for (const r of FULL_RULES.rules) {
    if (!r.hidden) continue;
    if (rulePages.some((p) => p.fields['rule.' + r.key]) || ruleTexts.includes(r.head)) {
      fail(`隱藏條例不應印在手冊上：${r.key}`, {});
    }
  }
}

// 新地區與翻頁按鈕用到的字形：漏字會讓手冊、證件與標題列印出空白
for (const ch of '澳大利亚加拿大悉尼渥太华大洋洲（续）◀▶') {
  if (!get('ASSETS').font[8][ch]) fail(`缺少字形：${ch}`, {});
}

// 分頁後每一頁的正文都不能壓到底部書籤列（書籤列從 h - MARK_H - 2 開始）
for (const [label, rs] of [['endless', FULL_RULES], ...STORY.map((s, i) => [`day${i + 1}`, s])]) {
  const rb = new Rulebook(rs);
  for (const p of rb.pages) {
    for (const r of p.rows) {
      if (r.y + 8 > rb.h - 14) fail(`${label} 手冊文字壓到書籤列（y=${r.y}, h=${rb.h}）`, {});
    }
  }
}

// 通告版面：第三天掛在 (316,126)，視窗底不能超過桌面下緣 (343)
const OfficialNotice = get('OfficialNotice');
for (let i = 0; i < STORY.length; i++) {
  const rs = STORY[i];
  const n = new OfficialNotice(today(i + 1), { body: rs.notice, sig: !!rs.sig, pages: rs.pages, news: rs.news, wanted: [] });
  if (n.pages.length !== 1 + rs.pages.length + 1) fail(`day${i + 1} 通告頁數錯`, {});
  if (126 + n.h > 343) fail(`day${i + 1} 通告太高（${n.h}）`, {});
  if (i === 2 && n.pages[0].h > 217) fail('day3 通告第 1 頁超出桌面', {});
  // 故事模式的通告第 1 頁一律印憑證簽名；可審查的欄位是公告日期
  if (!rs.sig) fail(`day${i + 1} 憑證應帶簽名`, {});
  if (!n.pages[0].fields['notice.date']) fail(`day${i + 1} 通告第 1 頁缺少公告日期欄`, {});
  if (n.pages[0].fields['notice.cred']) fail(`day${i + 1} 通告第 1 頁不應再有簽名欄`, {});
}

// 故事模式：憑證上的簽名是真的，暫時不出簽名造假的題；通告只審查公告日期
for (let i = 0; i < STORY.length; i++) {
  const rs = STORY[i];
  if (rs.flaws.includes('sig')) fail(`day${i + 1} 暫時不應出簽名造假`, {});
  for (let j = 0; j < 2000; j++) {
    const spec = makeRequest(day(i + 1), 0.45, [], rs);
    const cred = spec.docs.find((d) => d.key === 'cred');
    if (!cred) fail(`day${i + 1} 沒有憑證`, spec);
    if (!cred.sig) fail(`day${i + 1} 憑證沒有簽名`, spec);
    if (!cred.fields['cred.签名']) fail(`day${i + 1} 憑證簽名不可比對`, spec);
    if (!spec.checks.has(pairKey('cred.有效期', 'notice.date'))) fail(`day${i + 1} 通告日期缺少與有效期的比對關係`, spec);
    if (spec.checks.has(pairKey('notice.date', 'sys.日期'))) fail(`day${i + 1} 通告日期不應和系統日期比對`, spec);
    if (spec.checks.has(pairKey('cred.签名', 'notice.cred'))) fail(`day${i + 1} 簽名不應再和通告比對`, spec);
    if (spec.issues.some((is) => is.type === 'sig' || is.title === '签名不合法')) fail(`day${i + 1} 不應出現簽名矛盾`, spec);
  }
}

// 通告第 1 頁：可審查的是公告日期（底部的簽名只印不審查）；不再有 notice.cred / notice.tok
{
  const n = new OfficialNotice(today(1), { body: '測試', sig: true, pages: [], news: null, wanted: [] });
  const f = n.pages[0].fields;
  if (!f['notice.date']) fail('通告缺少公告日期欄', {});
  if (f['notice.cred']) fail('通告不應再有憑證簽名欄', {});
  if (f['notice.tok']) fail('通告不應再有令牌簽名欄', {});
  const b = f['notice.date'];
  if (!b || b[0] < 0 || b[2] > n.w || b[1] < TITLE_H) fail('通告日期欄位位置錯', {});
  if (b[2] - b[0] > tw(today(1), 8) + 4) fail('通告日期欄位應只框日期本身', {});
}

// 通告只有第 1 頁印「安全归于ANTHROTZKA」；附頁與特別關注對象頁都不再印
{
  const motto = '安全归于ANTHROTZKA';
  const has = (pg) => pg.lines.some((l) => l.s === motto);
  const n = new OfficialNotice(today(1), {
    body: '測試', sig: true, pages: [{ head: '附頁', body: '測試' }], news: null, wanted: ['w0', 'w1', 'w2'],
  });
  if (!has(n.pages[0])) fail('通告第 1 頁應保留「安全归于ANTHROTZKA」', {});
  for (let i = 1; i < n.pages.length; i++) if (has(n.pages[i])) fail(`通告第 ${i + 1} 頁不應再印「安全归于ANTHROTZKA」`, {});
}

// 通告日期也能核對簽發日期（和系統日期一樣）：合規的簽發日期是「無矛盾」，未來的簽發日期是矛盾
{
  let ok = 0, future = null;
  for (let i = 0; i < 6000 && !(ok && future); i++) {
    const s = makeRequest(day(1), 0.45, [], FULL_RULES);
    if (s.flaw === 'future') { future = s; continue; }
    const tok = s.docs.find((d) => d.key === 'tok');
    if (!s.flaw && tok && tok.fields['tok.签发']) {
      if (!s.checks.has(pairKey('tok.签发', 'notice.date'))) fail('令牌簽發日期缺少與通告日期的比對關係', s);
      ok++;
    }
  }
  if (!ok) fail('找不到合規的令牌簽發日期樣本', {});
  if (!future) fail('找不到簽發日期未到的樣本', {});
  else if (!issuesOf(future, 'tok.签发', 'notice.date').length) fail('future 缺少與通告日期的矛盾', future);
}

// 手册底部书签栏是隐藏的布尔开关：无尽模式打开，故事模式停用（之后随剧情开放）
{
  const on = new Rulebook(FULL_RULES);
  const off = new Rulebook(FULL_RULES, { marksOn: false });
  if (!on.marksOn) fail('無盡模式手冊應顯示書籤欄', {});
  if (off.marksOn) fail('書籤開關沒有關掉', {});
  const m = on.marks[1];
  const c = [(m.box[0] + m.box[2]) / 2, (m.box[1] + m.box[3]) / 2];
  off.page = 0;
  if (off.press(...c) || off.page !== 0) fail('書籤欄關掉後仍能點書籤跳頁', {});
  on.page = 0;
  if (!on.press(...c) || on.page === 0) fail('書籤欄打開時點書籤應跳頁', {});
}

// 手冊 / 通告的標題列翻頁列：◀ 上一頁、▶ 下一頁，兩邊都要能點且可循環
{
  const center = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  const checkTabs = (label, win, sub) => {
    const { prev, next } = win.tabs;
    if (win.sub !== sub) return fail(`${label} 左側英文副標應為 ${sub}`, {});
    if (!prev || !next) return fail(`${label} 缺少左右翻頁按鈕`, {});
    if (prev[2] >= next[0]) return fail(`${label} 左右翻頁按鈕重疊`, {});
    if (next[2] >= win.w - 24) return fail(`${label} 翻頁按鈕壓到視窗按鈕`, {});
    const subRight = prev[0] - 6;
    const subLeft = subRight - tw(win.sub, 8);
    if (subLeft < 5 + tw(win.title, 8) + 6) return fail(`${label} 右側英文副標與中文標題重疊`, {});
    win.page = 0;
    if (!win.press(...center(next)) || win.page !== 1) fail(`${label} 右按鈕應翻到下一頁`, {});
    if (!win.press(...center(prev)) || win.page !== 0) fail(`${label} 左按鈕應翻回上一頁`, {});
    win.page = 0;
    if (!win.press(...center(prev)) || win.page !== win.npages - 1) fail(`${label} 左按鈕應能循環到最後一頁`, {});
  };
  checkTabs('手冊', new Rulebook(FULL_RULES), 'CONSTITUTION');
  const n = new OfficialNotice(today(1), { body: '測試', sig: true, pages: [{ head: '附頁', body: '測試' }], news: null, wanted: [] });
  if (n.npages < 2) fail('通告應該有多頁可翻', {});
  checkTabs('通告', n, 'NOTICE');
}

// 請求券證件：只有有效期一欄、沒有簽名；頂部有「欢迎使用 Claude」歡迎橫幅
const d = new Doc('voucher', [['有效期', '2078.01.01']], null);
if (d.title !== '请求券' || d.sub !== 'REQUEST PASS') fail('請求券標題錯', {});
if (d.rows.length !== 1 || !d.fields['voucher.有效期']) fail('請求券欄位錯', {});
if (d.sig) fail('請求券不應有簽名', {});
if (!d.banner) fail('請求券缺少歡迎橫幅', {});
if (d.fields['voucher.有效期'][1] <= TITLE_H + 4) fail('請求券有效期應在歡迎橫幅下方', {});

// 令牌視窗：請求摘要太長要折行，可點欄位要蓋住整段，視窗跟著變高
{
  const long = '把这段代码改写成 TypeScript，并且补上单元测试和注释';
  const doc = new Doc('tok', [['IP', '10.0.0.1'], ['请求', long, true]], null);
  if (!doc.wraps[1] || doc.wraps[1].length < 2) fail('長請求摘要應折行', {});
  const f = doc.fields['tok.请求'];
  if (!f) fail('令牌請求摘要應可比對', {});
  if (f[3] <= doc.fields['tok.IP'][3]) fail('請求摘要欄位應涵蓋折行後的高度', {});
  if (doc.h <= new Doc('tok', [['IP', '10.0.0.1']], null).h) fail('請求摘要應讓令牌視窗變高', {});
  if (doc.rows[doc.rows.length - 1][0] !== '请求') fail('請求摘要應是令牌最後一欄', {});
}

// ———— 無盡模式難度 2：環境信息卡與企業授權 ————
const FULL_RULES_2 = get('FULL_RULES_2');
const ENDLESS_RULES = get('ENDLESS_RULES');
const CORPS = get('CORPS');
const HOST_CORP = get('HOST_CORP');
if (ENDLESS_RULES[0] !== FULL_RULES || ENDLESS_RULES[1] !== FULL_RULES_2) fail('ENDLESS_RULES 應依難度排列', {});
if (CORPS.map((c) => c.name).join(',') !== 'OpenMind,Anthrotzka,Googol,yAI,Mistrain,DeepThink') fail('支援企業名單錯', {});
for (const c of CORPS) {
  if (!REGION_LOCALE[c.region]) fail(`企業所在地區沒有語言 / 時區：${c.name}`, {});
  const pat = c.icon.pat;
  if (pat.length !== 11 || pat.some((r) => r.length !== 11)) fail(`企業圖示應為 11×11：${c.name}`, {});
  if (pat.some((r) => [...r].some((ch) => ch !== '.' && !c.icon.cols[ch]))) fail(`企業圖示有沒定義顏色的像素：${c.name}`, {});
}
// 難度 1 不受影響：沒有環境信息卡與企業授權
for (let i = 0; i < 3000; i++) {
  const spec = makeRequest(day(1), 0.6, [], FULL_RULES);
  if (spec.ent || spec.docs.some((d) => d.key === 'env' || d.key === 'ent')) fail('難度 1 不應出環境信息卡或企業授權', spec);
  if (['no_env', 'ent_auth', 'ent_acct'].includes(spec.flaw)) fail('難度 1 不應出難度 2 的問題', spec);
}
{
  const ENT_FLAWS = [null, 'wanted', 'photo', 'ip', 'exp', 'sig', 'ent_auth', 'ent_acct'];
  const seen = { ent: 0, env: 0, noEnv: 0, envTz: 0, entAuth: 0, entAcct: 0, deep: 0, entIp: 0 };
  const wantedAv = get('ASSETS').avatars.slice(0, 3);
  for (let i = 0; i < 40000; i++) {
    const spec = makeRequest(day(1), 0.5, wantedAv, FULL_RULES_2);
    const by = Object.fromEntries(spec.docs.map((d) => [d.key, d]));
    if (spec.flaw && !spec.reason) fail('難度 2 有問題但沒有理由', spec);
    // 審查窗的請求類型：企業請求一律「企业请求」
    const typeLabel = spec.ent ? '企业请求' : spec.kind === 'api' ? 'API 调用' : '对话';
    if (spec.typeLabel !== typeLabel) fail(`請求類型標籤錯：${spec.typeLabel}`, spec);
    if (spec.ent) {
      seen.ent++;
      const corp = CORPS.find((c) => c.key === spec.ent);
      // 企業帳戶只出示憑證和企業授權
      if (Object.keys(by).sort().join(',') !== 'cred,ent') fail('企業帳戶只應有憑證和企業授權', spec);
      if (spec.kind !== 'chat') fail('企業帳戶應是對話請求', spec);
      // 企業請求不顯示請求概述，本人也不會說明來意
      if (spec.task || spec.taskOnTok) fail('企業請求不應顯示請求概述', spec);
      if (!ENT_FLAWS.includes(spec.flaw)) fail(`企業帳戶不應出 ${spec.flaw}`, spec);
      const region = by.cred.rows.find((r) => r[0] === '地区')[1];
      if (region !== corp.region) fail('企業帳戶的憑證地區應為企業所在地區', spec);
      const ent = by.ent, rows = Object.fromEntries(ent.rows);
      if (ent.rows.map((r) => r[0]).join(',') !== '账号,IP,授权企业') fail('企業授權欄位應為 帳號 / IP / 授權企業', spec);
      if (ent.corp !== spec.ent) fail('企業授權缺少簽發企業', spec);
      for (const f of ['ent.企业', 'ent.账号', 'ent.IP', 'ent.授权企业']) if (!ent.fields[f]) fail(`企業授權缺少欄位 ${f}`, spec);
      if (ent.fields['ent.企业'][3] >= ent.fields['ent.账号'][1] + 2) fail('企業橫幅不應壓到帳號欄', spec);
      const list = rows.授权企业.split(', ');
      // 簽發企業自己不列；Anthrotzka 簽發的授權仍要列出 Anthrotzka 才有效
      if (corp.name !== HOST_CORP && list.includes(corp.name)) fail('授權企業不應列出簽發企業自己', spec);
      if (new Set(list).size !== list.length) fail('授權企業不應重複', spec);
      if (!list.every((n) => CORPS.some((c) => c.name === n))) fail('授權企業應來自支援企業', spec);
      // DeepThink 的企業授權必定不含 Anthrotzka：一律企業授權無效
      if (corp.key === 'deepthink') {
        seen.deep++;
        if (spec.flaw !== 'ent_auth') fail('DeepThink 的企業授權必定無效', spec);
        if (list.includes(HOST_CORP)) fail('DeepThink 的授權企業不應包含 Anthrotzka', spec);
      }
      for (const p of [['ent.企业', 'book.ent'], ['ent.企业', 'cred.地区'], ['ent.授权企业', 'rule.ent'], ['ent.IP', 'rv.IP'], ['rv.柜台', 'rule.ent']]) {
        if (!spec.checks.has(pairKey(...p))) fail(`企業授權缺少比對關係 ${p}`, spec);
      }
      const docsNote = spec.notes.get(pairKey('rv.柜台', 'rule.docs'));
      if (!docsNote || docsNote.title !== '企业账户') fail('企業帳戶應注明不需令牌與環境信息卡', spec);
      if (spec.flaw === 'ent_auth') {
        seen.entAuth++;
        if (list.includes(HOST_CORP)) fail('ent_auth 的授權企業不應包含 Anthrotzka', spec);
        if (corp.name === HOST_CORP) fail('ent_auth 不應由 Anthrotzka 簽發', spec);
        if (!issuesOf(spec, 'ent.授权企业', 'rule.ent').length) fail('ent_auth 缺少矛盾', spec);
        const supported = FULL_RULES_2.regions.includes(region);
        if (!supported && !issuesOf(spec, 'cred.地区', 'rule.region').length) fail('授權無效時不支援地區應是矛盾', spec);
      } else {
        if (!list.includes(HOST_CORP)) fail('有效的企業授權應包含 Anthrotzka', spec);
        if (!spec.checks.has(pairKey('ent.账号', 'cred.昵称'))) fail('企業授權帳號缺少與憑證暱稱的比對', spec);
        // DeepThink 一律 ent_auth，所以有效授權的簽發企業一定在支援地區
        if (!FULL_RULES_2.regions.includes(region)) fail('有效的企業授權不應來自不支援地區', spec);
        if (issuesOf(spec, 'cred.地区', 'rule.region').length) fail('企業帳戶不應有地區矛盾', spec);
        if (issuesOf(spec, 'ent.授权企业', 'rule.ent').length) fail('有效的企業授權不應有授權企業矛盾', spec);
      }
      if (spec.flaw === 'ent_acct') {
        seen.entAcct++;
        if (rows.账号 === spec.handle) fail('ent_acct 的帳號應與本人不同', spec);
        if (!issuesOf(spec, 'ent.账号', 'cred.昵称').length || !issuesOf(spec, 'ent.账号', 'rv.昵称').length) fail('ent_acct 缺少矛盾', spec);
      } else if (rows.账号 !== spec.handle) fail('企業授權帳號應是本人', spec);
      if (spec.flaw === 'ip' && rows.IP !== spec.ip) seen.entIp++;
      continue;
    }
    // 一般請求：令牌 + 環境信息卡
    if (spec.flaw === 'no_env') {
      seen.noEnv++;
      if (by.env) fail('no_env 不應有環境信息卡', spec);
      if (!issuesOf(spec, 'rv.柜台', 'rule.docs').length) fail('no_env 缺少矛盾', spec);
      continue;
    }
    if (!by.env && spec.flaw !== 'no_cred') fail('難度 2 一般請求應有環境信息卡', spec);
    if (!by.env) continue;
    seen.env++;
    const env = Object.fromEntries(by.env.rows);
    if (by.env.rows.map((r) => r[0]).join(',') !== '时区,系统,屏幕') fail('環境信息卡欄位錯', spec);
    if (by.env.sig || by.env.fields['env.签名']) fail('環境信息卡不應有簽名', spec);
    if (by.tok && Object.fromEntries(by.tok.rows).时区) fail('時區應印在環境信息卡、不在令牌上', spec);
    if (!by.cred) continue;
    const region = by.cred.rows.find((r) => r[0] === '地区')[1];
    for (const o of ['cred.地区', 'rule.locale', 'rule.region']) {
      if (!spec.checks.has(pairKey('env.时区', o))) fail(`環境信息卡時區缺少與 ${o} 的比對`, spec);
    }
    const tzIssue = issuesOf(spec, 'env.时区', 'cred.地区');
    if (tzIssue.length) {
      seen.envTz++;
      if (spec.flaw !== 'locale' || env.时区 === REGION_LOCALE[region][1]) fail('時區矛盾應是 locale 問題', spec);
      if (!SUSPEND_FLAWS.includes(spec.flaw)) fail('時區不符應可拘留', spec);
    } else if (env.时区 !== REGION_LOCALE[region][1]) fail('合規的環境信息卡時區應與憑證地區一致', spec);
  }
  for (const [k, v] of Object.entries(seen)) if (!v) fail(`難度 2 應會出現：${k}`, {});
  if (!SUSPEND_FLAWS.includes('ent_acct') || SUSPEND_FLAWS.includes('ent_auth') || SUSPEND_FLAWS.includes('no_env')) fail('難度 2 的拘留範圍錯', {});
  stats.diff2 = seen;
}
// 難度 2 的手冊：條例寫回「語言和時區」、支持地區列出時區、多一章企業名錄（含六家企業與圖示）
{
  const rb = new Rulebook(FULL_RULES_2);
  const texts = rb.pages.flatMap((p) => p.rows.map((r) => r.s));
  for (const s of ['每个请求须出示凭证、令牌和环境信息卡', '语言和时区须与地区一致', `企业账户须出示凭证和含 ${HOST_CORP} 的企业授权`, '时区', 'UTC-05:00', '四、企业名录']) {
    if (!texts.includes(s)) fail(`難度 2 手冊缺少：${s}`, {});
  }
  if (!rb.pages.some((p) => p.fields['rule.ent'])) fail('難度 2 手冊缺少企業授權條例欄位', {});
  if (rb.pages.some((p) => p.fields['rule.entco'])) fail('難度 2 手冊不應再有獨立的授權企業條例', {});
  const entPage = rb.pages.find((p) => p.fields['book.ent']);
  if (!entPage) fail('難度 2 手冊缺少企業名錄欄位', {});
  if (entPage.rows.filter((r) => r.icon).length !== CORPS.length) fail('企業名錄應畫出每家企業的圖示', {});
  for (const c of CORPS) if (!entPage.rows.some((r) => r.s === c.name) || !entPage.rows.some((r) => r.s === c.region)) fail(`企業名錄缺少 ${c.name}`, {});
  if (!rb.marks.some((m) => m.label === '企业' && rb.pages[m.page] === entPage)) fail('手冊缺少企業書籤', {});
  for (const p of rb.pages) for (const r of p.rows) if (r.y + 8 > rb.h - 14) fail(`難度 2 手冊文字壓到書籤列（y=${r.y}）`, {});
  // 難度 1 的手冊不變：沒有企業名錄
  if (new Rulebook(FULL_RULES).pages.some((p) => p.fields['book.ent'])) fail('難度 1 手冊不應有企業名錄', {});
}
// 企業授權視窗：「授權企業」標籤較長，值往右讓開；長名單要折行而且不超出視窗
{
  const long = 'OpenMind, Googol, Anthrotzka';
  const doc = new Doc('ent', [['账号', 'k.tanaka'], ['IP', '203.0.113.7'], ['授权企业', long, true]], null);
  doc.corp = 'deepthink';
  if (doc.kx < tw('授权企业', 8) + 6) fail('企業授權的值會壓到標籤', {});
  if (!doc.wraps[2] || doc.wraps[2].length < 2) fail('長授權企業名單應折行', {});
  if (doc.wraps[2].some((s) => doc.vx + doc.kx + tw(s, 10) > doc.w - 3)) fail('授權企業名單超出視窗', {});
  if (doc.fields['ent.账号'][1] <= TITLE_H + 30) fail('企業授權欄位應排在橫幅下方', {});
  // 其他證件的值欄位置不變
  if (new Doc('tok', [['运营商', '纽约 · ANTHROTZKA']], null).kx !== 34) fail('令牌值欄位置不應改變', {});
}
for (const ch of '环境信息卡企业授权账号名录所在地区难度新增×') {
  for (const s of [8, 10, 12]) if (!get('ASSETS').font[s][ch]) fail(`缺少字形（${s}px）：${ch}`, {});
}

console.log('OK');
console.log(JSON.stringify(stats, null, 2));
