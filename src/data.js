'use strict';
// 规则与请求生成：地区、合法签名、规则手册的内容、随机请求（合规的，或者恰好有一处问题的）。
// 故事模式的逐日剧情、上岗通告与报纸在 story.js。
//
// 请求 spec：
//   avatar / handle / ip   网络头像精灵 key、昵称、IP 地址（审查窗里显示的“本人”）
//   kind                   'chat' 对话 / 'api' API 调用
//   task / greet           请求摘要（印在令牌上）、进来时说的话
//   docs                   证件（凭证 / 令牌 / API 授权），见 docs.js 的 Doc
//   flaw                   问题类型（null = 合规，应放行）
//   reason                 判错时事故通知上写的理由
//   issues                 比对模式里能点出来的矛盾 {pairs, title, sub, ask}
//   notes                  没有矛盾、但需要说明的比对结果（例如本国请求免券、外国请求已持券）
//   checks                 这一单本来就该对得上的栏位组合（用来区分“无矛盾”和“无关联”）
//   taskOnTok              请求摘要印在令牌上（true = 看得到摘要、本人也会说明来意）
// 栏位 key：证件 'cred.IP' / 'tok.运营商' / 'tok.语言' / 'tok.时区' / 'tok.签发' / 'tok.有效期' / 'tok.请求'（令牌上的请求摘要） /
//          'cred.签名' / 'api.签名'，
//          手册 'rule.region' / 'rule.locale' / 'book.cred'，
//          审查窗 'rv.头像' / 'rv.柜台'（柜台上的证件），任务栏 'sys.日期'，
//          历史记录 'hist.请求'（当前这段对话里的请求内容），通告 'notice.cred'（凭证签名）/ 'notice.wanted0'（特别关注对象），
//          验证 SMS 'smsf.手机'（对方填的号码）/ 'sms.昵称' 'sms.手机' 'sms.曾用名'（身份档案）

const WORLD_DATE = new Date(2078, 0, 1);

const REGIONS_OK = ['美国', '美国', '美国', '英国', '日本', '德国', '新加坡', '法国'];
// 请求券只豁免本国（美国、英国）请求；支持地区里的其他国家都算外国请求
const HOME_REGIONS = ['美国', '英国'];
// 手册「支持地区」一页：按大洲列出
const CONTINENTS = [['北美洲', ['美国']], ['欧洲', ['英国', '法国', '德国']], ['亚洲', ['日本', '新加坡']]];

// 凭证的套餐档位
const PLANS = ['free', 'pro', 'max'];
// 凭证地区对应的语言代码 / 时区（令牌印语言；时区留给之后的规则组）
const REGION_LOCALE = {
  '美国': ['en-US', 'UTC-05:00'],
  '英国': ['en-GB', 'UTC+00:00'],
  '法国': ['fr-FR', 'UTC+01:00'],
  '日本': ['ja-JP', 'UTC+09:00'],
  '德国': ['de-DE', 'UTC+01:00'],
  '新加坡': ['zh-SG', 'UTC+08:00'],
  '中国大陆': ['zh-CN', 'UTC+08:00'],
  '中国香港': ['zh-HK', 'UTC+08:00'],
  '俄罗斯': ['ru-RU', 'UTC+03:00'],
  '伊朗': ['fa-IR', 'UTC+03:30'],
  '朝鲜': ['ko-KP', 'UTC+09:00'],
};

// —— 数字签名：签名跟着签发机构走 ——
// 凭证原本由安索兹卡身份局签发，现在改用安全部会话中心（原令牌）的签名；令牌没有签名；API 授权仍由安全部接口管理处签发
const SEAL_GLYPHS = {
  cred: ['XXXXXXX', '.X...X.', '..X.X..', '...X...', '..X.X..', '.X...X.', 'XXXXXXX'],
  api: ['XX...XX', 'X.....X', '..XXX..', '..X.X..', '..XXX..', 'X.....X', 'XX...XX'],
  // 伪造的图案：乍一看差不多
  cred_f: ['XXXXXXX', '.X...X.', '..XXX..', '...X...', '..XXX..', '.X...X.', 'XXXXXXX'],
  api_f: ['XX...XX', 'X.....X', '..XXX..', '..XXX..', '..XXX..', 'X.....X', 'XX...XX'],
};
const SIGNERS = {
  cred: { issuer: '安全部会话中心', print: '7D13-0BE6', fakeIssuer: '安全部会话中台' },
  api: { issuer: '安全部接口管理处', print: 'C5E8-3A72', fakeIssuer: '安全部接口管理局' },
};
const DOC_NAMES = { cred: '凭证', tok: '令牌', api: 'API 授权', voucher: '请求券', return: '临时返回页' };
// 可以拘留的问题：伪造签名、伪造签发日期（签发日期晚于当前日期）、身份矛盾（头像 / IP / 昵称）、
// 证件过期、特别关注对象，以及令牌的语言 / 运营商与凭证地区不符
const SUSPEND_FLAWS = ['sig', 'future', 'photo', 'ip', 'name', 'exp', 'wanted', 'locale', 'isp'];
const WANTED_N = 3, WANTED_TAGS = 'ABC', P_WANTED = 0.08;
// 比对出这些问题后拘留按钮亮起（issue.type）：除了上面的问题，还有 SMS 验证里查出的矛盾
const SUSPEND_ISSUES = SUSPEND_FLAWS.concat(['phone', 'oldname']);
// 头像 / 昵称不符时可以『验证 SMS』；P_LEGIT：合规请求里本人换过头像 / 改过昵称的比例（验证后应放行）
const SMS_ISSUES = ['photo', 'name'], P_LEGIT = 0.12;
// 身份档案的曾用名：有时候一个都没有（档案上印「无」）；本人改过昵称的合规请求一定留着旧昵称
const P_NO_OLDNAME = 0.35;
// 凭证地区对应的手机号国家码
const PHONE_CC = { '美国': '+1', '英国': '+44', '法国': '+33', '日本': '+81', '德国': '+49', '新加坡': '+65' };

const genuine = (key) => ({ issuer: SIGNERS[key].issuer, print: SIGNERS[key].print, glyph: key });

// 伪造签名：图案、机构、签名三者之一不对；返回 [签名, 说明, 哪一项不对]
function forged(key) {
  const s = genuine(key);
  const how = pick(['glyph', 'issuer', 'print']);
  if (how === 'glyph') s.glyph = key + '_f';
  if (how === 'issuer') s.issuer = SIGNERS[key].fakeIssuer;
  if (how === 'print') {
    const chars = [...s.print];
    const i = pick([0, 1, 2, 3, 5, 6, 7, 8]);
    chars[i] = pick([...'0123456789ABCDEF'].filter((c) => c !== chars[i]));
    s.print = chars.join('');
  }
  return [s, { glyph: '签名图案与规则手册不符', issuer: '签发机构与规则手册不符', print: '签名与规则手册不符' }[how], how];
}

// —— 规则手册 ——
// hidden：不印在手册上的隐藏条例（特别关注对象 / SMS 验证 / 签发日期由通告与提示自行发现）
const RULES = [
  { key: 'docs', head: '每个请求须出示凭证和令牌' },
  { key: 'region', head: '凭证地区须为支持地区' },
  { key: 'locale', head: '语言和时区须与地区一致' },
  { key: 'isp', head: '令牌运营商须与凭证地区一致' },
  { key: 'date', head: '证件须在有效期内' },
  { key: 'issued', head: '证件签发日期不得晚于系统日期', hidden: true },
  { key: 'match', head: '证件上的 IP 须与本人一致' },
  { key: 'api', head: 'API 调用须另出示 API 授权' },
  { key: 'scope', head: 'API 授权的用途须与请求一致' },
  { key: 'sig', head: '凭证与 API 授权须有合法的数字签名' },
  { key: 'wanted', head: '特别关注对象的请求须拒绝', hidden: true },
  { key: 'sms', head: '头像 / 昵称不符时可验证 SMS', hidden: true },
];

// —— 规则组：这一班生效的条例、证件和会出的问题。无尽模式用全套，故事模式每天各有一组 ——
//   rules / continents   手册「基本条例」「支持地区」两页；seals = 手册有没有「签名详情」一页
//   regions              合规请求的凭证地区（其余地区都算不支持）
//   tok / kinds          要不要令牌；请求类型（'chat' / 'api'）
//   tokRows             令牌上印哪些栏位（默认 IP、运营商、语言、时区、签发、有效期）；令牌没有数字签名
//   credRows / sig       凭证上印哪些栏位；证件带不带数字签名
//   flaws / legit        会出的问题（null = 全部）；本人换过头像 / 改过昵称的比例
//   wanted               有没有特别关注对象
//   redTeam / redGuards  redTeam：左上的红队 clawd（开放拘留）；redGuards：右侧岔路口的两位装饰
//   inspect              桌面上有没有『比对』应用
//   voucher / foreign    启用请求券时，美国以外的支持地区请求要持券；随机请求里这类外国请求的比例
const FULL_RULES = {
  rules: RULES, continents: CONTINENTS, seals: true, regions: REGIONS_OK, tok: true, kinds: ['chat', 'api'],
  tokRows: ['IP', '运营商', '语言', '签发', '有效期'],
  credRows: ['IP', '昵称', '地区', '套餐', '有效期'], sig: true, flaws: null, legit: P_LEGIT, wanted: true,
  redTeam: true, redGuards: true, inspect: true, voucher: false, foreign: 0,
};


// ———————————————— 工具 ————————————————

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
// 随机 IPv4 地址
const ipv4 = () => `${rint(1, 223)}.${rint(0, 255)}.${rint(0, 255)}.${rint(1, 254)}`;
// 令牌上印的「运营商」：一家运营商服务一个地区，格式是「主要城市 · 运营商名」。
// 合规请求的运营商一定属于凭证地区；只有 isp 问题会把令牌印成别处的运营商，
// 拿令牌的「运营商」和凭证的「地区」比对就能查出来。
const ISPS = [
  ['ANTHROTZKA', '纽约', '美国'],
  ['NOVALINK', '伦敦', '英国'],
  ['KESTREL', '东京', '日本'],
  ['MERIDIAN', '柏林', '德国'],
  ['ORBITAL', '新加坡', '新加坡'],
  ['LUMIERE', '巴黎', '法国'],
  ['CIRRUS', '上海', '中国大陆'],
  ['HARBOUR', '香港', '中国香港'],
  ['AURORA', '莫斯科', '俄罗斯'],
  ['PARSA', '德黑兰', '伊朗'],
  ['CHOSON', '平壤', '朝鲜'],
];
// 凭证地区对应的运营商：主要城市写在名称前面，方便和凭证地区对照
const ispOf = (region) => {
  const [name, city] = ISPS.find((x) => x[2] === region) || ISPS[0];
  return `${city} · ${name}`;
};
const digits = (n) => Array.from({ length: n }, () => rint(0, 9)).join('');
const phoneNum = (region) => `${PHONE_CC[region] || '+1'} ${rint(2, 9)}${digits(2)}-${digits(3)}-${digits(4)}`;
// 改号码里的一位数字（国家码不动）
function phoneVariant(p) {
  const chars = [...p];
  const idx = chars.map((c, i) => i).filter((i) => i > p.indexOf(' ') && /\d/.test(chars[i]));
  const i = pick(idx);
  chars[i] = String((+chars[i] + rint(1, 9)) % 10);
  return chars.join('');
}

const fmtDate = (d) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const NAMES = ['mlee', 'k.tanaka', 'jonas.w', 'sarah_k', 'dchen', 'amelia.r', 'hiro', 'lukas88', 'nina.v', 'tomw', 'ravi.k',
  'emma_j', 'yuki', 'felix', 'olivia.m', 'sam.t', 'mei', 'jbrown', 'anna.s', 'leo', 'grace_h', 'max.k', 'ivy', 'noah'];
const CHAT_TASKS = ['总结一份季度财报', '把这段代码改写成 TypeScript', '翻译一封商务邮件', '解释一个统计学概念', '起草一份租房合同',
  '调试一段 Python 报错', '润色一封求职信', '整理会议纪要', '设计一份数据库表结构', '规划一周的旅行路线', '准备一场面试'];
const API_TASKS = ['客服系统自动回复', '批量翻译产品说明', '代码审查流水线', '文档摘要服务', '工单分类', '日志异常分析'];
const SCOPES = ['文本生成', '代码辅助', '文档处理', '翻译', '数据分析'];
// API 请求内容对应的授权用途：比对时拿令牌上的请求摘要（或历史记录里的请求内容）核对
const TASK_SCOPES = {
  '客服系统自动回复': '文本生成',
  '批量翻译产品说明': '翻译',
  '代码审查流水线': '代码辅助',
  '文档摘要服务': '文档处理',
  '工单分类': '数据分析',
  '日志异常分析': '数据分析',
};
const GREETS = ['你好。', '你好，麻烦快一点。', '我想继续刚才的对话。', '……', '你好，我有个问题。', '谢谢。'];

// 改 IP 里的一位数字 / 改一点昵称：差得不多，要仔细看
function ipVariant(ip) {
  const octets = ip.split('.');
  const i = rint(0, 3);
  let v;
  do {
    const chars = [...octets[i]];
    const d = rint(0, chars.length - 1);
    chars[d] = String((+chars[d] + rint(1, 9)) % 10);
    if (chars[0] === '0') chars[0] = String(rint(1, 9));
    v = +chars.join('');
  } while (v > 255 || String(v) === octets[i]);
  octets[i] = String(v);
  return octets.join('.');
}
function nameVariant(s) {
  const opts = [s + rint(1, 9), s.slice(0, -1), s.includes('.') ? s.replace('.', '_') : s + '_', s[0] + s];
  return pick(opts.filter((v) => v !== s && v.length > 1));
}

// 比对出矛盾后 Claude 追问的话，和对方的说辞
const QUESTIONS = {
  region: '你的凭证地区不在支持范围内。', photo: '凭证上的头像不是你。', ip: '证件上的 IP 对不上。',
  name: '证件上的昵称对不上。', exp: '你的证件已经过期了。', future: '这份证件的签发日期还没到。', sig: '这份证件的签名不合法。', no_api: 'API 调用需要出示 API 授权。',
  no_cred: '你没有出示凭证。', no_tok: '你没有出示令牌。', no_voucher: '外国请求需要出示有效请求券。',
  scope: '授权的用途与请求不一致。', wanted: '你已被列为特别关注对象。',
  phone: '你的手机号和档案上的不一致。', oldname: '证件上的昵称不在你的曾用名里。',
  locale: '令牌上的语言 / 时区与你的凭证地区不一致。',
  isp: '令牌上的运营商不在你的凭证地区。',
};
const EXCUSES = {
  region: ['我只是想用一下。', '我朋友都能用。', '这里网络有问题吧？'],
  photo: ['我最近换了头像。', '那是旧头像。', '……那是我朋友的。'],
  ip: ['可能是系统出错了。', '我有好几个 IP。', '……填错了吧。'],
  name: ['我改过昵称。', '那是我的小号。', '差一个字而已。'],
  exp: ['我不知道已经过期了。', '续期还在审核中。', '就差几天而已。'],
  future: ['可能是系统时间错了吧？', '我提前拿到了。', '……那是预发的。'],
  sig: ['签名是官方给的。', '我不知道签名有什么问题。', '……网上办的。'],
  no_api: ['我只是测试一下。', '授权还在申请中。', '以前不需要这个。'],
  no_cred: ['我忘带了。', '正在办，正在办。', '没有凭证也能进吧？'],
  no_tok: ['我不知道要这个。', '正在办，正在办。', '以前不需要这个。'],
  no_voucher: ['我不知道要这个。', '正在办，正在办。', '以前不需要这个。'],
  scope: ['我申请的就是这个用途。', '可能是填错了。', '以前不需要这个。'],
  wanted: ['你认错人了。', '我只是长得像而已。', '……我什么都没做。'],
  phone: ['我换过号码。', '可能是我记错了。', '……那是旧号码。'],
  oldname: ['可能是系统没更新。', '我改过好几次名字。', '……'],
  locale: ['语言是我自己设的。', '时区跟语言不一样很正常吧？', '……我朋友的账号。'],
  isp: ['我用的是漫游网络。', '可能接了代理。', '……运营商搞错了吧。'],
};

// ———————————————— 生成请求 ————————————————

// 生成一个请求；每个请求都是一段新的对话（历史记录窗口会从零开始记录）
// wanted：特别关注对象的头像，普通请求不会用到这几个头像；rs：这一班的规则组
function makeRequest(today, pBad = 0.45, wanted = [], rs = FULL_RULES) {
  const kind = rs.kinds.includes('api') && Math.random() < 0.35 ? 'api' : 'chat';
  let kinds = ['region', 'locale', 'isp', 'photo', 'ip', 'name', 'exp', 'exp', 'sig', 'sig', 'no_cred', 'no_voucher', 'future'];
  if (kind === 'api') kinds.push('no_api', 'no_api', 'scope', 'scope');
  if (rs.flaws) kinds = kinds.filter((k) => rs.flaws.includes(k));
  // 令牌缺失只在规则组明确列出时启用（第四天起），不改变无尽模式原本的出题
  if (rs.tok && rs.flaws && rs.flaws.includes('no_tok')) kinds.push('no_tok');
  // 令牌上真的印出来的栏位（默认全集；故事模式的窄版令牌用 rs.tokRows 收窄）
  const tokRows = rs.tokRows || ['IP', '运营商', '语言', '时区', '签发', '有效期'];
  // 未来签发：令牌上要有「签发」栏，且规则组启用隐藏条例「签发日期不得晚于系统日期」（第五天起 / 无尽模式）
  const tokHasIssued = rs.tok && tokRows.includes('签发');
  if (!tokHasIssued || !rs.rules.some((r) => r.key === 'issued')) kinds = kinds.filter((k) => k !== 'future');
  // 语言 / 时区：令牌上至少印了其中一栏（目前只印语言，时区留给之后的规则组），
  // 且这一班启用「语言和时区须与地区一致」（无尽模式；故事模式的窄版令牌没有）
  const tokHasLocale = rs.tok && (tokRows.includes('语言') || tokRows.includes('时区'));
  if (!tokHasLocale || !rs.rules.some((r) => r.key === 'locale')) kinds = kinds.filter((k) => k !== 'locale');
  // 运营商：令牌上要印「运营商」栏（第四天起与无尽模式）才可能出「运营商与地区不符」
  if (!rs.tok || !tokRows.includes('运营商')) kinds = kinds.filter((k) => k !== 'isp');
  // 凭证缺失只能对照条例「每个请求须出示凭证（和令牌）」发现；当天没有这条条例就不出
  if (!rs.rules.some((r) => r.key === 'docs')) kinds = kinds.filter((k) => k !== 'no_cred' && k !== 'no_tok');
  if (!rs.tok) kinds = kinds.filter((k) => k !== 'no_tok');
  // 请求券只对外国（美国、英国以外的支持地区）生效；没有请求券制度时不会出「没带券」
  const homeRegions = HOME_REGIONS.filter((r) => rs.regions.includes(r));
  if (!homeRegions.length) homeRegions.push(rs.regions[0]);   // 规则组里没有本国地区时，拿第一个支持地区当本国
  const foreignRegions = rs.regions.filter((r) => !homeRegions.includes(r));
  if (!rs.voucher || !foreignRegions.length) kinds = kinds.filter((k) => k !== 'no_voucher');
  const flaw = wanted.length && Math.random() < P_WANTED ? 'wanted' : kinds.length && Math.random() < pBad ? pick(kinds) : null;
  // 请求券：只有本国（美国 / 英国）请求不需要。支持地区内的其他国家（如日本 / 德国 / 新加坡 / 法国）算外国请求；
  // 凭证地区不在支持地区是 region 问题，有券也不能放行，所以不会生成请求券
  const foreign = !!rs.voucher && flaw !== 'region' && foreignRegions.length > 0
    && (flaw === 'no_voucher' || Math.random() < (rs.foreign || 0));
  // 身份不符：冒用（flaw）或本人换过头像 / 改过昵称（合规，验证 SMS 可以确认）
  const idf = SMS_ISSUES.includes(flaw) ? flaw : !flaw && Math.random() < rs.legit ? pick(SMS_ISSUES) : null;
  const task = pick(kind === 'api' ? API_TASKS : CHAT_TASKS);
  const scope = TASK_SCOPES[task] || pick(SCOPES);
  const pool = ASSETS.avatars.filter((a) => !wanted.includes(a));
  const wi = flaw === 'wanted' ? rint(0, wanted.length - 1) : -1;
  const avatar = wi >= 0 ? wanted[wi] : pick(pool), handle = pick(NAMES), ip = ipv4();
  const day = (a, b) => fmtDate(addDays(today, rint(a, b)));
  const region = flaw === 'region'
    ? pick(Object.keys(REGION_LOCALE).filter((r) => !rs.regions.includes(r)))
    : rs.voucher
      ? (foreign ? pick(foreignRegions) : pick(homeRegions))
      : pick(rs.regions);
  const [lang, tz] = REGION_LOCALE[region] || ['en-US', 'UTC+00:00'];
  const cred = { photo: avatar, IP: ip, 昵称: handle, 地区: region, 套餐: pick(PLANS), 有效期: day(20, 900), sig: rs.sig ? genuine('cred') : null };
  const tok = rs.tok
    ? { IP: ip, 运营商: ispOf(region), 语言: lang, 时区: tz, 签发: day(-3, 0), 有效期: day(0, 6) }
    : null;
  const api = kind === 'api' ? {
    持有人: handle, IP: ip, 用途: flaw === 'scope' ? pick(SCOPES.filter((s) => s !== scope)) : scope,
    有效期: day(5, 300), sig: genuine('api'),
  } : null;
  // 请求券只登记有效期；无券的外国请求（no_voucher）不生成这张证件
  const voucher = foreign && flaw !== 'no_voucher' ? { 有效期: day(0, 120) } : null;
  const docs = { cred, tok, api, voucher };
  const spec = {
    avatar, handle, ip, kind, task, greet: pick(GREETS),
    flaw, issues: [], notes: new Map(), checks: new Set(), confirms: new Set(), reason: '', legit: !flaw && idf,
  };
  const issue = (pairs, title, sub, type = flaw) => spec.issues.push({ pairs, title, sub, type, ask: pick(EXCUSES[type]) });
  // 没有矛盾、但也不是单纯「一致」的比对结果（例如外国请求持有效请求券）
  const note = (a, b, title, sub) => spec.notes.set([a, b].sort().join('|'), { title, sub });
  const withDocs = (keys) => pick(keys.filter((k) => docs[k]));
  let voucherExpired = false;

  if (flaw === 'region') {
    issue([['cred.地区', 'rule.region']], '地区不支持', `凭证地区：${cred.地区}`);
    spec.reason = `凭证地区为${cred.地区}，不在支持地区`;
  } else if (flaw === 'no_cred') {
    // 柜台上一张凭证都没有：拿柜台和条例「每个请求须出示凭证」比对
    docs.cred = null;
    issue([['rv.柜台', 'rule.docs']], '凭证缺失', '柜台上没有凭证   本人未出示凭证');
    spec.reason = '未出示凭证';
  } else if (flaw === 'no_tok') {
    // 凭证还在，只少了令牌：同样拿柜台和「每个请求须出示凭证和令牌」比对
    docs.tok = null;
    issue([['rv.柜台', 'rule.docs']], '令牌缺失', '柜台上没有令牌   本人未出示令牌');
    spec.reason = '未出示令牌';
  } else if (flaw === 'no_voucher') {
    // 凭证地区在支持地区内（非本国）才需要请求券；柜台上没有券也可以直接拿柜台和条例比对
    issue([['cred.地区', 'rule.voucher'], ['rv.柜台', 'rule.voucher']], '缺少请求券', `请求来自${cred.地区}，未出示请求券`);
    spec.reason = `外国请求（${cred.地区}）未出示请求券`;
  } else if (idf === 'photo') {
    cred.photo = pick(pool.filter((a) => a !== avatar));
    issue([['cred.照片', 'rv.头像']], '头像不符', '凭证上的头像   VS   本人的头像', 'photo');
    spec.reason = '凭证头像与本人不符';
  } else if (flaw === 'ip') {
    const k = withDocs(['cred', 'tok', 'api']);
    docs[k].IP = ipVariant(ip);
    const others = ['rv.IP'];
    for (const x of ['cred', 'tok', 'api']) if (x !== k && docs[x]) others.push(`${x}.IP`);
    issue(others.map((o) => [`${k}.IP`, o]), 'IP 不符', `本人 ${ip}   VS   ${DOC_NAMES[k]} ${docs[k].IP}`);
    spec.reason = `${DOC_NAMES[k]}上的 IP 与本人不符`;
  } else if (idf === 'name') {
    const k = withDocs(['cred', 'api']);
    const f = k === 'cred' ? '昵称' : '持有人';
    docs[k][f] = nameVariant(handle);
    const others = ['rv.昵称'];
    if (k !== 'cred') others.push('cred.昵称');
    if (k !== 'api' && docs.api) others.push('api.持有人');
    issue(others.map((o) => [`${k}.${f}`, o]), '昵称不符', `本人 ${handle}   VS   ${DOC_NAMES[k]} ${docs[k][f]}`, 'name');
    spec.nameField = `${k}.${f}`;
    spec.reason = `${DOC_NAMES[k]}上的昵称与本人不符`;
  } else if (flaw === 'exp') {
    const keys = ['cred', 'tok', 'tok', 'api'];
    if (docs.voucher) keys.push('voucher', 'voucher', 'voucher');
    const k = withDocs(keys);
    docs[k].有效期 = day(-40, -1);
    if (k === 'tok') tok.签发 = fmtDate(addDays(today, -rint(41, 60)));
    const pairs = [[`${k}.有效期`, 'sys.日期'], [`${k}.有效期`, 'rule.date']];
    if (k === 'voucher') {
      voucherExpired = true;
      // 请求券逾期时，拿凭证地区去比请求券条例也能查出问题（地区本身仍在支持范围内）
      pairs.push([`${k}.有效期`, 'rule.voucher'], ['cred.地区', 'rule.voucher']);
    }
    issue(pairs, k === 'voucher' ? '请求券过期' : '证件过期',
      `${DOC_NAMES[k]}有效期至 ${docs[k].有效期}   系统日期 ${fmtDate(today)}`);
    spec.reason = `${DOC_NAMES[k]}已于 ${docs[k].有效期} 过期`;
  } else if (flaw === 'future') {
    // 签发日期还在未来：证件不可能已经签发，按伪造证件处理
    tok.签发 = day(1, 30);
    issue([['tok.签发', 'sys.日期']], '签发日期未到', `令牌签发 ${tok.签发}   VS   系统日期 ${fmtDate(today)}`, 'future');
    spec.reason = '令牌的签发日期晚于当前日期（伪造证件）';
  } else if (flaw === 'locale') {
    // 令牌上的语言 / 时区必须和凭证地区一致；只比对令牌上真的印了的栏位（目前是语言，时区留给之后的规则组）
    const langs = Object.values(REGION_LOCALE).map((v) => v[0]);
    const tzs = Object.values(REGION_LOCALE).map((v) => v[1]);
    const canLang = tokRows.includes('语言'), canTz = tokRows.includes('时区');
    const which = canLang && canTz ? pick(['lang', 'tz', 'both']) : canLang ? 'lang' : 'tz';
    const pairs = [];
    let sub = `凭证地区：${cred.地区}`;
    if (which !== 'tz') {
      tok.语言 = pick(langs.filter((l) => l !== lang));
      pairs.push(['tok.语言', 'cred.地区'], ['tok.语言', 'rule.locale'], ['tok.语言', 'rule.region']);
      sub += `   令牌语言：${tok.语言}`;
    }
    if (which !== 'lang') {
      tok.时区 = pick(tzs.filter((t) => t !== tz));
      pairs.push(['tok.时区', 'cred.地区'], ['tok.时区', 'rule.locale'], ['tok.时区', 'rule.region']);
      sub += `   令牌时区：${tok.时区}`;
    }
    const title = which === 'both' ? '语言和时区与地区不符' : which === 'lang' ? '语言与地区不符' : '时区与地区不符';
    issue(pairs, title, sub);
    spec.reason = which === 'both'
      ? `令牌的语言 / 时区与凭证地区（${cred.地区}）不符`
      : which === 'lang' ? `令牌语言（${tok.语言}）与凭证地区（${cred.地区}）不符`
        : `令牌时区（${tok.时区}）与凭证地区（${cred.地区}）不符`;
  } else if (flaw === 'isp') {
    // 令牌的运营商必须属于凭证地区：印上别处的运营商（主要城市不在凭证地区）
    const [name, city] = pick(ISPS.filter((x) => x[2] !== cred.地区));
    tok.运营商 = `${city} · ${name}`;
    const pairs = [['tok.运营商', 'cred.地区']];
    if (rs.rules.some((r) => r.key === 'isp')) pairs.push(['tok.运营商', 'rule.isp']);
    issue(pairs, '运营商与地区不符',
      `凭证地区：${cred.地区}   令牌运营商：${tok.运营商}`, 'isp');
    spec.reason = `令牌运营商（${tok.运营商}）与凭证地区（${cred.地区}）不符`;
  } else if (flaw === 'sig') {
    // 只有凭证和 API 授权带签名：令牌没有签名，伪造签名不会落在令牌上
    const k = withDocs(['cred', 'api']);
    const [s, sub, how] = forged(k);
    docs[k].sig = s;
    // 凭证的签发机构和签名也印在通告第 1 页底部；图案只印在手册的「签名详情」页
    issue([[`${k}.签名`, `book.${k}`]].concat(k === 'cred' && how !== 'glyph' ? [['cred.签名', 'notice.cred']] : []), '签名不合法', sub);
    spec.reason = `${DOC_NAMES[k]}的数字签名不合法（${sub}）`;
  } else if (flaw === 'no_api') {
    docs.api = null;
    issue([['rv.类型', 'rule.api']], '缺少证件', '请求类型：API 调用   未出示 API 授权');
    spec.reason = 'API 调用未出示 API 授权';
  } else if (flaw === 'scope') {
    // 请求摘要印在令牌上；历史记录里的请求内容也可以拿来核对（有令牌，两者才都看得到）
    issue([['api.用途', 'tok.请求'], ['api.用途', 'hist.请求']], '用途不一致', `请求：${task}   VS   授权用途：${api.用途}`);
    spec.reason = `API 授权用途（${api.用途}）与请求（${task}）不一致`;
  } else if (flaw === 'wanted') {
    const n = `notice.wanted${wi}`;
    issue([['rv.头像', n], ['cred.照片', n]], '特别关注对象', `本人头像与通告中的特别关注对象 ${WANTED_TAGS[wi]} 一致`);
    spec.reason = `本人为特别关注对象 ${WANTED_TAGS[wi]}`;
  }

  // 令牌的运营商属于凭证地区，不随 IP 变动：IP 不符的令牌改过 IP，运营商仍然对得上地区

  // 第三天：地区条例仍在。支持地区（含美国、英国）都比得过去；不在支持地区的是 region 问题。
  // 请求券条例只管外国请求：本国（美国、英国）请求注明免券，持有效请求券的外国请求注明已持券
  if (rs.voucher && flaw !== 'region') {
    if (foreign && docs.voucher && !voucherExpired) {
      note('cred.地区', 'rule.voucher', '外国请求', `凭证地区：${cred.地区}   已持有效请求券`);
    } else if (!foreign) {
      note('cred.地区', 'rule.voucher', '本国请求', `凭证地区：${cred.地区}   无需请求券`);
    }
  }

  // 验证 SMS：身份档案（按凭证查到的账户）上的手机号和曾用名。冒用者报的号码差一位，证件昵称也不在曾用名里
  if (idf) {
    const phone = phoneNum(region);
    const docName = spec.nameField ? docs[spec.nameField.split('.')[0]][spec.nameField.split('.')[1]] : null;
    const others = NAMES.filter((n) => n !== handle && n !== docName);
    // 曾用名：改过昵称的合规请求一定留着旧昵称；其余档案有时没有任何曾用名（印「无」）
    let names;
    if (spec.legit && docName) names = [docName, pick(others)];
    else if (Math.random() < P_NO_OLDNAME) names = [];
    else {
      const n0 = pick(others);
      names = [n0, pick(others.filter((n) => n !== n0))];
    }
    spec.sms = { phone, reply: spec.legit ? phone : phoneVariant(phone), names, ip: cred.IP };
    const phonePair = ['smsf.手机', 'sms.手机'];
    if (spec.legit) spec.confirms.add(phonePair.sort().join('|'));
    else issue([phonePair], '手机号不符', `对方填写 ${spec.sms.reply}   VS   档案 ${phone}`, 'phone');
    if (spec.nameField) {
      const namePair = [spec.nameField, 'sms.曾用名'];
      if (spec.legit) spec.confirms.add(namePair.sort().join('|'));
      else issue([namePair], '不是曾用名', `证件昵称不在档案的曾用名中`, 'oldname');
    }
  }

  // 比对：哪些栏位组合本来就有可核对的关系（和这一单有没有毛病无关）
  const pair = (a, b) => spec.checks.add([a, b].sort().join('|'));
  if (idf) pair('rv.昵称', 'sms.昵称');
  // 柜台 ↔ 条例「每个请求须出示凭证」：递上凭证就是无矛盾，空柜台就是凭证缺失
  if (rs.rules.some((r) => r.key === 'docs')) pair('rv.柜台', 'rule.docs');
  if (docs.cred) {
    pair('cred.照片', 'rv.头像');
    pair('cred.地区', 'rule.region');
    // 不在支持地区的请求只对照地区条例，不再牵涉请求券
    if (rs.voucher && flaw !== 'region') pair('cred.地区', 'rule.voucher');
    pair('cred.昵称', 'rv.昵称');
  }
  // 语言 / 时区：对照凭证地区与手册「支持地区」页（只登记令牌上真的印了的栏位）
  const hasLocaleRule = rs.rules.some((r) => r.key === 'locale');
  if (docs.cred && hasLocaleRule) {
    for (const k of ['语言', '时区']) {
      if (!tokRows.includes(k) || !docs.tok || !docs.tok[k]) continue;
      pair(`tok.${k}`, 'cred.地区');
      pair(`tok.${k}`, 'rule.locale');
      pair(`tok.${k}`, 'rule.region');
    }
  }
  // 运营商：主要城市属于凭证地区。合规请求一定对得上（无矛盾）；只有 isp 问题会印成别处的运营商
  if (docs.cred && docs.tok && tokRows.includes('运营商') && docs.tok.运营商) {
    pair('tok.运营商', 'cred.地区');
    if (rs.rules.some((r) => r.key === 'isp')) pair('tok.运营商', 'rule.isp');
  }
  if (docs.cred && docs.cred.sig) pair('cred.签名', 'notice.cred');
  wanted.forEach((_, i) => { pair('rv.头像', `notice.wanted${i}`); if (docs.cred) pair('cred.照片', `notice.wanted${i}`); });
  const hasIssuedRule = rs.rules.some((r) => r.key === 'issued');
  for (const k of ['cred', 'tok', 'api']) {
    if (!docs[k]) continue;
    pair(`${k}.有效期`, 'sys.日期');
    pair(`${k}.有效期`, 'rule.date');
    if (k === 'tok' && docs[k].签发 && hasIssuedRule) pair('tok.签发', 'sys.日期');
    // 手册有「签名详情」页时，签名才有手册上的式样可比对（故事模式暂时没有这一页，只和通告核）
    if (docs[k].sig && rs.seals) pair(`${k}.签名`, `book.${k}`);
    pair(`${k}.IP`, 'rv.IP');
    if (k !== 'cred' && docs.cred) pair(`${k}.IP`, 'cred.IP');
  }
  if (docs.voucher) {
    pair('voucher.有效期', 'sys.日期');
    pair('voucher.有效期', 'rule.date');
    pair('voucher.有效期', 'rule.voucher');
  }
  // 请求券也看柜台：外国请求的券就该在柜台上；没带券时由上面的 issue 接手
  if (foreign) pair('rv.柜台', 'rule.voucher');
  const ipDocs = ['cred', 'tok', 'api'].filter((k) => docs[k]);
  for (let i = 0; i < ipDocs.length; i++) {
    for (let j = i + 1; j < ipDocs.length; j++) pair(`${ipDocs[i]}.IP`, `${ipDocs[j]}.IP`);
  }
  // 请求摘要印在令牌上：令牌与历史记录里本人说的话是同一段请求内容
  if (docs.tok) pair('tok.请求', 'hist.请求');
  if (docs.api) {
    pair('api.持有人', 'rv.昵称');
    if (docs.cred) pair('api.持有人', 'cred.昵称');
    // 没有令牌时看不到摘要、本人也不会说明来意，没有可核对的请求内容
    if (docs.tok) { pair('api.用途', 'tok.请求'); pair('api.用途', 'hist.请求'); }
  }
  if (kind === 'api') pair('rv.类型', 'rule.api');

  // 请求摘要印在令牌上：令牌真的交出来（docs.tok 没有被 no_tok 清掉）才看得到，本人也才会说明来意
  spec.taskOnTok = !!docs.tok;

  // 凭证缺失时柜台上没有凭证：临时返回页由 station.js 在询问「凭证缺失」之后才派发到桌面
  spec.docs = [];
  if (docs.cred) spec.docs.push(new Doc('cred', rs.credRows.map((k) => [k, cred[k]]), cred.sig, cred.photo));
  if (docs.voucher) spec.docs.push(new Doc('voucher', [['有效期', docs.voucher.有效期]], null));
  // 令牌上多印一栏请求摘要（第三项 true = 太长就折行），没有令牌时审查窗也看不到摘要
  if (docs.tok) spec.docs.push(new Doc('tok', tokRows.map((k) => [k, docs.tok[k]]).concat([['请求', task, true]]), null));
  if (docs.api) spec.docs.push(new Doc('api', ['持有人', 'IP', '用途', '有效期'].map((k) => [k, docs.api[k]]), docs.api.sig));
  return spec;
}
