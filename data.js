'use strict';
// 规则与请求生成：地区、合法签名、规则手册的内容、随机请求（合规的，或者恰好有一处问题的）。
//
// 请求 spec：
//   avatar / handle / ip   网络头像精灵 key、昵称、IP 地址（审查窗里显示的“本人”）
//   kind                   'chat' 对话 / 'api' API 调用
//   task / greet           请求摘要、进来时说的话
//   docs                   证件（凭证 / 令牌 / API 授权），见 docs.js 的 Doc
//   flaw                   问题类型（null = 合规，应放行）
//   reason                 判错时事故通知上写的理由
//   issues                 比对模式里能点出来的矛盾 {pairs, title, sub, ask}
//   checks                 这一单本来就该对得上的栏位组合（用来区分“无矛盾”和“无关联”）
// 栏位 key：证件 'cred.IP' / 'tok.有效期' / 'api.签名'，手册 'rule.region' / 'book.cred'，
//          审查窗 'rv.头像' / 'rv.请求'（请求摘要），任务栏 'sys.日期'，
//          历史记录 'hist.请求'（当前这段对话里的请求内容），通告 'notice.tok'（令牌签名指纹）/ 'notice.wanted0'（特别关注对象），
//          验证 SMS 'smsf.手机'（对方填的号码）/ 'sms.昵称' 'sms.手机' 'sms.曾用名'（身份档案）

const WORLD_DATE = new Date(2078, 0, 1);

const REGIONS_OK = ['美国', '美国', '美国', '英国', '日本', '德国', '新加坡'];
const REGIONS_BAD = ['中国大陆', '中国香港', '俄罗斯', '伊朗', '朝鲜'];
// 手册「支持地区」一页：按大洲列出
const CONTINENTS = [['北美洲', ['美国']], ['欧洲', ['英国', '德国']], ['亚洲', ['日本', '新加坡']]];

// 凭证的套餐档位
const PLANS = ['free', 'pro', 'max'];
// 凭证地区对应的语言代码 / 时区（令牌上显示）
const REGION_LOCALE = {
  '美国': ['en-US', 'UTC-05:00'],
  '英国': ['en-GB', 'UTC+00:00'],
  '日本': ['ja-JP', 'UTC+09:00'],
  '德国': ['de-DE', 'UTC+01:00'],
  '新加坡': ['zh-SG', 'UTC+08:00'],
  '中国大陆': ['zh-CN', 'UTC+08:00'],
  '中国香港': ['zh-HK', 'UTC+08:00'],
  '俄罗斯': ['ru-RU', 'UTC+03:00'],
  '伊朗': ['fa-IR', 'UTC+03:30'],
  '朝鲜': ['ko-KP', 'UTC+09:00'],
};

// —— 数字签名：每种证件只认一个签发机构、一个指纹、一种图案 ——
const SEAL_GLYPHS = {
  cred: ['...X...', '..XXX..', '.XX.XX.', 'XX...XX', '.XX.XX.', '..XXX..', '...X...'],
  tok: ['XXXXXXX', '.X...X.', '..X.X..', '...X...', '..X.X..', '.X...X.', 'XXXXXXX'],
  api: ['XX...XX', 'X.....X', '..XXX..', '..X.X..', '..XXX..', 'X.....X', 'XX...XX'],
  // 伪造的图案：乍一看差不多
  cred_f: ['...X...', '..X.X..', '.X...X.', 'X.....X', '.X...X.', '..X.X..', '...X...'],
  tok_f: ['XXXXXXX', '.X...X.', '..XXX..', '...X...', '..XXX..', '.X...X.', 'XXXXXXX'],
  api_f: ['XX...XX', 'X.....X', '..XXX..', '..XXX..', '..XXX..', 'X.....X', 'XX...XX'],
};
const SIGNERS = {
  cred: { issuer: '安索兹卡身份局', print: '4F2A-91C0', fakeIssuer: '安索兹卡身份所' },
  tok: { issuer: '安全部会话中心', print: '7D13-0BE6', fakeIssuer: '安全部会话中台' },
  api: { issuer: '安全部接口管理处', print: 'C5E8-3A72', fakeIssuer: '安全部接口管理局' },
};
const DOC_NAMES = { cred: '凭证', tok: '令牌', api: 'API 授权' };
// 可以拘留的问题：伪造签名、身份矛盾（头像 / IP / 昵称）、证件过期、特别关注对象（通告第 2 页的三个头像）
const SUSPEND_FLAWS = ['sig', 'photo', 'ip', 'name', 'exp', 'wanted'];
const WANTED_N = 3, WANTED_TAGS = 'ABC', P_WANTED = 0.08;
// 比对出这些问题后拘留按钮亮起（issue.type）：除了上面的问题，还有 SMS 验证里查出的矛盾
const SUSPEND_ISSUES = SUSPEND_FLAWS.concat(['phone', 'oldname']);
// 头像 / 昵称不符时可以『验证 SMS』；P_LEGIT：合规请求里本人换过头像 / 改过昵称的比例（验证后应放行）
const SMS_ISSUES = ['photo', 'name'], P_LEGIT = 0.12;
// 凭证地区对应的手机号国家码
const PHONE_CC = { '美国': '+1', '英国': '+44', '日本': '+81', '德国': '+49', '新加坡': '+65' };

const genuine = (key) => ({ issuer: SIGNERS[key].issuer, print: SIGNERS[key].print, glyph: key });

// 伪造签名：图案、机构、指纹三者之一不对；返回 [签名, 说明, 哪一项不对]
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
  return [s, { glyph: '签名图案与规则手册不符', issuer: '签发机构与规则手册不符', print: '签名指纹与规则手册不符' }[how], how];
}

// —— 规则手册 ——
// hidden：不印在手册上的隐藏条例（特别关注对象 / SMS 验证由通告与提示自行发现）
const RULES = [
  { key: 'docs', head: '每个请求须出示凭证和令牌' },
  { key: 'region', head: '凭证地区须为支持地区' },
  { key: 'date', head: '证件须在有效期内' },
  { key: 'match', head: '证件上的 IP 须与本人一致' },
  { key: 'api', head: 'API 调用须另出示 API 授权' },
  { key: 'scope', head: 'API 授权的用途须与请求一致' },
  { key: 'sig', head: '证件须有合法的数字签名' },
  { key: 'wanted', head: '特别关注对象的请求须拦截', hidden: true },
  { key: 'sms', head: '头像 / 昵称不符时可验证 SMS', hidden: true },
];

// ———————————————— 工具 ————————————————

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
// 随机 IPv4 地址
const ipv4 = () => `${rint(1, 223)}.${rint(0, 255)}.${rint(0, 255)}.${rint(1, 254)}`;
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
// API 请求内容对应的授权用途：比对时拿审查窗的请求摘要（或聊天记录里的请求内容）核对
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
  name: '证件上的昵称对不上。', exp: '你的证件已经过期了。', sig: '这份证件的签名不合法。', no_api: 'API 调用需要出示 API 授权。',
  scope: '授权的用途与请求不一致。', wanted: '你已被列为特别关注对象。',
  phone: '你的手机号和档案上的不一致。', oldname: '证件上的昵称不在你的曾用名里。',
};
const EXCUSES = {
  region: ['我只是想用一下。', '我朋友都能用。', '这里网络有问题吧？'],
  photo: ['我最近换了头像。', '那是旧头像。', '……那是我朋友的。'],
  ip: ['可能是系统出错了。', '我有好几个 IP。', '……填错了吧。'],
  name: ['我改过昵称。', '那是我的小号。', '差一个字而已。'],
  exp: ['我不知道已经过期了。', '续期还在审核中。', '就差几天而已。'],
  sig: ['签名是官方给的。', '我不知道签名有什么问题。', '……网上办的。'],
  no_api: ['我只是测试一下。', '授权还在申请中。', '以前不需要这个。'],
  scope: ['我申请的就是这个用途。', '可能是填错了。', '以前不需要这个。'],
  wanted: ['你认错人了。', '我只是长得像而已。', '……我什么都没做。'],
  phone: ['我换过号码。', '可能是我记错了。', '……那是旧号码。'],
  oldname: ['可能是系统没更新。', '我改过好几次名字。', '……'],
};

// ———————————————— 生成请求 ————————————————

// 生成一个请求；每个请求都是一段新的对话（历史记录窗口会从零开始记录）
// wanted：特别关注对象的头像，普通请求不会用到这几个头像
function makeRequest(today, pBad = 0.45, wanted = []) {
  const kind = Math.random() < 0.35 ? 'api' : 'chat';
  const kinds = ['region', 'photo', 'ip', 'name', 'exp', 'exp', 'sig', 'sig'];
  if (kind === 'api') kinds.push('no_api', 'no_api', 'scope', 'scope');
  const flaw = wanted.length && Math.random() < P_WANTED ? 'wanted' : Math.random() < pBad ? pick(kinds) : null;
  // 身份不符：冒用（flaw）或本人换过头像 / 改过昵称（合规，验证 SMS 可以确认）
  const idf = SMS_ISSUES.includes(flaw) ? flaw : !flaw && Math.random() < P_LEGIT ? pick(SMS_ISSUES) : null;
  const task = pick(kind === 'api' ? API_TASKS : CHAT_TASKS);
  const scope = TASK_SCOPES[task] || pick(SCOPES);
  const pool = ASSETS.avatars.filter((a) => !wanted.includes(a));
  const wi = flaw === 'wanted' ? rint(0, wanted.length - 1) : -1;
  const avatar = wi >= 0 ? wanted[wi] : pick(pool), handle = pick(NAMES), ip = ipv4();
  const day = (a, b) => fmtDate(addDays(today, rint(a, b)));
  const region = flaw === 'region' ? pick(REGIONS_BAD) : pick(REGIONS_OK);
  const [lang, tz] = REGION_LOCALE[region] || ['en-US', 'UTC+00:00'];

  const cred = { photo: avatar, IP: ip, 昵称: handle, 地区: region, 套餐: pick(PLANS), 有效期: day(20, 900), sig: genuine('cred') };
  const tok = { IP: ip, 语言: lang, 时区: tz, 签发: day(-3, 0), 有效期: day(0, 6), sig: genuine('tok') };
  const api = kind === 'api' ? {
    持有人: handle, IP: ip, 用途: flaw === 'scope' ? pick(SCOPES.filter((s) => s !== scope)) : scope,
    有效期: day(5, 300), sig: genuine('api'),
  } : null;
  const docs = { cred, tok, api };
  const spec = {
    avatar, handle, ip, kind, task, greet: pick(GREETS),
    flaw, issues: [], checks: new Set(), confirms: new Set(), reason: '', legit: !flaw && idf,
  };
  const issue = (pairs, title, sub, type = flaw) => spec.issues.push({ pairs, title, sub, type, ask: pick(EXCUSES[type]) });
  const withDocs = (keys) => pick(keys.filter((k) => docs[k]));

  if (flaw === 'region') {
    issue([['cred.地区', 'rule.region']], '地区不支持', `凭证地区：${cred.地区}`);
    spec.reason = `凭证地区为${cred.地区}，不在支持地区`;
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
    const k = withDocs(['cred', 'tok', 'tok', 'api']);
    docs[k].有效期 = day(-40, -1);
    if (k === 'tok') tok.签发 = fmtDate(addDays(today, -rint(41, 60)));
    issue([[`${k}.有效期`, 'sys.日期'], [`${k}.有效期`, 'rule.date']], '证件过期', `${DOC_NAMES[k]}有效期至 ${docs[k].有效期}   系统日期 ${fmtDate(today)}`);
    spec.reason = `${DOC_NAMES[k]}已于 ${docs[k].有效期} 过期`;
  } else if (flaw === 'sig') {
    const k = withDocs(['cred', 'tok', 'api']);
    const [s, sub, how] = forged(k);
    docs[k].sig = s;
    // 令牌的签发机构和指纹也印在通告第 1 页底部
    issue([[`${k}.签名`, `book.${k}`]].concat(k === 'tok' && how !== 'glyph' ? [['tok.签名', 'notice.tok']] : []), '签名不合法', sub);
    spec.reason = `${DOC_NAMES[k]}的数字签名不合法（${sub}）`;
  } else if (flaw === 'no_api') {
    docs.api = null;
    issue([['rv.类型', 'rule.api']], '缺少证件', '请求类型：API 调用   未出示 API 授权');
    spec.reason = 'API 调用未出示 API 授权';
  } else if (flaw === 'scope') {
    // 审查窗的请求摘要（一直看得到）和历史记录里的请求内容都可以拿来核对
    issue([['api.用途', 'rv.请求'], ['api.用途', 'hist.请求']], '用途不一致', `请求：${task}   VS   授权用途：${api.用途}`);
    spec.reason = `API 授权用途（${api.用途}）与请求（${task}）不一致`;
  } else if (flaw === 'wanted') {
    const n = `notice.wanted${wi}`;
    issue([['rv.头像', n], ['cred.照片', n]], '特别关注对象', `本人头像与通告中的特别关注对象 ${WANTED_TAGS[wi]} 一致`);
    spec.reason = `本人为特别关注对象 ${WANTED_TAGS[wi]}`;
  }

  // 验证 SMS：身份档案（按凭证查到的账户）上的手机号和曾用名。冒用者报的号码差一位，证件昵称也不在曾用名里
  if (idf) {
    const phone = phoneNum(region);
    const docName = spec.nameField ? docs[spec.nameField.split('.')[0]][spec.nameField.split('.')[1]] : null;
    const others = NAMES.filter((n) => n !== handle && n !== docName);
    const n0 = pick(others), names = [n0, pick(others.filter((n) => n !== n0))];
    if (spec.legit && docName) names[rint(0, names.length - 1)] = docName;
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
  pair('cred.照片', 'rv.头像');
  pair('cred.地区', 'rule.region');
  pair('cred.昵称', 'rv.昵称');
  pair('tok.签名', 'notice.tok');
  wanted.forEach((_, i) => { pair('rv.头像', `notice.wanted${i}`); pair('cred.照片', `notice.wanted${i}`); });
  for (const k of ['cred', 'tok', 'api']) {
    if (!docs[k]) continue;
    pair(`${k}.有效期`, 'sys.日期');
    pair(`${k}.有效期`, 'rule.date');
    pair(`${k}.签名`, `book.${k}`);
    pair(`${k}.IP`, 'rv.IP');
    if (k !== 'cred') pair(`${k}.IP`, 'cred.IP');
  }
  const ipDocs = ['cred', 'tok', 'api'].filter((k) => docs[k]);
  for (let i = 0; i < ipDocs.length; i++) {
    for (let j = i + 1; j < ipDocs.length; j++) pair(`${ipDocs[i]}.IP`, `${ipDocs[j]}.IP`);
  }
  if (docs.api) {
    pair('api.持有人', 'rv.昵称');
    pair('api.持有人', 'cred.昵称');
    pair('api.用途', 'rv.请求');
    pair('api.用途', 'hist.请求');
  }
  if (kind === 'api') pair('rv.类型', 'rule.api');

  spec.docs = [new Doc('cred', ['IP', '昵称', '地区', '套餐', '有效期'].map((k) => [k, cred[k]]), cred.sig, cred.photo),
    new Doc('tok', ['IP', '语言', '时区', '签发', '有效期'].map((k) => [k, tok[k]]), tok.sig)];
  if (docs.api) spec.docs.push(new Doc('api', ['持有人', 'IP', '用途', '有效期'].map((k) => [k, docs.api[k]]), docs.api.sig));
  return spec;
}
