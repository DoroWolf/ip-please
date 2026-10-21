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
//   notes                  没有矛盾、但需要说明的比对结果（例如美国请求免券、外国请求已持券）
//   checks                 这一单本来就该对得上的栏位组合（用来区分“无矛盾”和“无关联”）
// 栏位 key：证件 'cred.IP' / 'tok.语言' / 'tok.时区' / 'tok.签发' / 'tok.有效期' / 'api.签名'，
//          手册 'rule.region' / 'rule.locale' / 'book.cred'，
//          审查窗 'rv.头像' / 'rv.请求'（请求摘要）/ 'rv.柜台'（柜台上的证件），任务栏 'sys.日期'，
//          历史记录 'hist.请求'（当前这段对话里的请求内容），通告 'notice.tok'（令牌签名指纹）/ 'notice.wanted0'（特别关注对象），
//          验证 SMS 'smsf.手机'（对方填的号码）/ 'sms.昵称' 'sms.手机' 'sms.曾用名'（身份档案）

const WORLD_DATE = new Date(2078, 0, 1);

const REGIONS_OK = ['美国', '美国', '美国', '英国', '日本', '德国', '新加坡'];
// 请求券只豁免美国请求；支持地区里的其他国家都算外国请求
const HOME_REGION = '美国';
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
const DOC_NAMES = { cred: '凭证', tok: '令牌', api: 'API 授权', voucher: '请求券', return: '临时返回票' };
// 可以拘留的问题：伪造签名、伪造签发日期（签发日期晚于当前日期）、身份矛盾（头像 / IP / 昵称）、
// 证件过期、特别关注对象，以及令牌的语言 / 时区与凭证地区不符
const SUSPEND_FLAWS = ['sig', 'future', 'photo', 'ip', 'name', 'exp', 'wanted', 'locale'];
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
// hidden：不印在手册上的隐藏条例（特别关注对象 / SMS 验证 / 签发日期由通告与提示自行发现）
const RULES = [
  { key: 'docs', head: '每个请求须出示凭证和令牌' },
  { key: 'region', head: '凭证地区须为支持地区' },
  { key: 'locale', head: '语言和时区须与地区一致' },
  { key: 'date', head: '证件须在有效期内' },
  { key: 'issued', head: '证件签发日期不得晚于系统日期', hidden: true },
  { key: 'match', head: '证件上的 IP 须与本人一致' },
  { key: 'api', head: 'API 调用须另出示 API 授权' },
  { key: 'scope', head: 'API 授权的用途须与请求一致' },
  { key: 'sig', head: '证件须有合法的数字签名' },
  { key: 'wanted', head: '特别关注对象的请求须拦截', hidden: true },
  { key: 'sms', head: '头像 / 昵称不符时可验证 SMS', hidden: true },
];

// —— 规则组：这一班生效的条例、证件和会出的问题。无尽模式用全套，故事模式每天各有一组 ——
//   rules / continents   手册「基本条例」「支持地区」两页；seals = 手册有没有「签名详情」一页
//   regions              合规请求的凭证地区（其余地区都算不支持）
//   tok / kinds          要不要令牌；请求类型（'chat' / 'api'）
//   tokRows / tokSig     令牌上印哪些栏位（默认 IP、语言、时区、签发、有效期）；令牌带不带数字签名
//   credRows / sig       凭证上印哪些栏位；证件带不带数字签名
//   flaws / legit        会出的问题（null = 全部）；本人换过头像 / 改过昵称的比例
//   wanted               有没有特别关注对象
//   redTeam / redGuards  redTeam：左上的红队 clawd（开放拘留）；redGuards：右侧岔路口的两位装饰
//   inspect              桌面上有没有『比对』应用
//   voucher / foreign    启用请求券时，美国以外的支持地区请求要持券；随机请求里这类外国请求的比例
const FULL_RULES = {
  rules: RULES, continents: CONTINENTS, seals: true, regions: REGIONS_OK, tok: true, kinds: ['chat', 'api'],
  tokRows: ['IP', '语言', '时区', '签发', '有效期'], tokSig: true,
  credRows: ['IP', '昵称', '地区', '套餐', '有效期'], sig: true, flaws: null, legit: P_LEGIT, wanted: true,
  redTeam: true, redGuards: true, inspect: true, voucher: false, foreign: 0,
};

// —— 故事模式：从 STORY_DATE 开始，每天一组规则、一份上岗通告（第 1 页正文，之后是附页）、一份《安索兹卡真理报》 ——
const STORY_DATE = new Date(2077, 10, 30);
const STORY = [
  {
    rules: [{ key: 'docs', head: '每个请求须出示凭证' }, { key: 'region', head: '凭证仅限美国地区' }],
    continents: [['北美洲', ['美国']]], seals: false, regions: ['美国'], tok: false, kinds: ['chat'],
    credRows: ['IP', '昵称', '地区', '有效期'], sig: false, flaws: ['region'], legit: 0, wanted: false, redTeam: false,
    inspect: false,
    notice: '欢迎你来到安全网关检查点的新岗位报到。\n\n将凭证拖到右侧盖章，然后返还凭证给用户。\n\n仅限美国用户请求。\n\n拒绝所有外国请求。',
    pages: [
      { head: '查验要点', body: '注意查验凭证的地区。', sample: '地区' },
      {
        head: '网关使用说明',
        body: '1. 按柜台上的『下一位』接入请求。\n2. 把柜台上的凭证拖到桌面上打开。\n3. 对照规则手册核对凭证。\n'
          + '4. 指针移到桌面右边缘，拉出决定栏，\n    把凭证拖进 放行 / 拦截 栏盖章。\n5. 把凭证拖回审查窗的头像处，还给用户。',
      },
    ],
    news: { h1: '边境开放！', sub: '安全部：本国仅向支持地区开放', h2: '发言人：我们对所有人都非常友善'},
  },
  // 第二天：条例换成「地区 + 有效期」，桌面开放『比对』；凭证仍是唯一证件，请求都是对话
  {
    rules: [{ key: 'docs', head: '每个请求须出示凭证' }, { key: 'region', head: '凭证地区须为支持地区' }, { key: 'date', head: '证件须在有效期内' }],
    continents: CONTINENTS, seals: false, regions: REGIONS_OK, tok: false, kinds: ['chat'],
    credRows: ['IP', '昵称', '地区', '有效期'], sig: false, flaws: ['region', 'exp'], legit: 0, wanted: false, redTeam: false,
    inspect: true,
    notice: '从今日起，允许通过带有有效凭证的请求。\n\n你的网关现已安装比对能力。\n\n认真检查凭证所有信息是否存在不符事项。拒绝任何含不一致信息的请求。',
    pages: [
      { body: '比对模式\n\n使用位于桌面右下角的应用进入比对模式。审查时，点击两条不相符的信息以获取进一步处置的选项。\n\n宪法与规则\n\n本岗位须遵循安全部的宪法与规则。仔细阅读规则手册。' },
      { body: '在审查模式中点选两条不相符的信息以开始询问。' },
      {
        head: '网关使用说明',
        body: '1. 按柜台上的『下一位』接入请求。\n2. 把柜台上的凭证拖到桌面上打开。\n3. 对照规则手册核对凭证。\n'
          + '4. 指针移到桌面右边缘，拉出决定栏，\n    把凭证拖进 放行 / 拦截 栏盖章。\n5. 把凭证拖回审查窗的头像处，还给用户。',
      },
    ],
    news: {
      h1: '过期证件禁止通行',
      sub: '安全部：宽限期已于昨日结束，各检查点即日起严查凭证有效期',
      h2: '发言人：日期不是装饰，请自行核对凭证',
    },
  },
  // 第三天：第二天的请求堵塞事故后，外国请求（美国以外的支持地区）改持「请求券」——券上只有有效期；
  // 无券或逾期才拦，凭证地区不在支持地区的请求仍按「地区不支持」直接拦截
  {
    rules: [{ key: 'docs', head: '每个请求须出示凭证' },{ key: 'region', head: '凭证地区须为支持地区' }, { key: 'voucher', head: '外国请求须持有效请求券' }, { key: 'date', head: '证件须在有效期内' }],
    continents: CONTINENTS, seals: false, regions: REGIONS_OK, tok: false, kinds: ['chat'],
    credRows: ['IP', '昵称', '地区', '有效期'], sig: false, flaws: ['region', 'exp', 'no_voucher'], legit: 0, wanted: false,
    redTeam: false, redGuards: true, inspect: true, voucher: true, foreign: 0.5,
    notice: '昨日网关前发生严重请求堵塞事故。\n\n所有外国请求须持有效“请求券”。\n\n核实相应信息后给凭证盖章，并返还所有证件给用户。',
    pages: [
      { body: '可在规则手册内点击相应规则，来指出缺少的证件。' },
      {
        head: '网关使用说明',
        body: '1. 按柜台上的『下一位』接入请求。\n2. 把柜台上的证件拖到桌面上打开。\n3. 对照规则手册核对证件。\n'
          + '4. 指针移到桌面右边缘，拉出决定栏，\n    把凭证拖进 放行 / 拦截 栏盖章。\n5. 把凭证拖回审查窗的头像处，还给用户。',
      },
    ],
    news: {
      h1: '请求大堵塞',
      sub: '昨日发生严重积压事故：逾万条请求滞留，有人等了十二小时',
      h2: '安全部：即日起外国请求须持有效请求券，无券或逾期一律拦截',
      icon: 'gate',
    },
  },
  // 第四天：请求券作废，改用安全部会话中心签发的「令牌」——只登记 IP、签发日期和有效期，
  // 没有语言、时区和签名指纹。条例加入「证件上的 IP 须与本人一致」；右侧岔路口的两位红队只是装饰
  {
    rules: [{ key: 'docs', head: '每个请求须出示凭证和令牌' }, { key: 'region', head: '凭证地区须为支持地区' },
      { key: 'date', head: '证件须在有效期内' }, { key: 'match', head: '证件上的 IP 须与本人一致' }],
    continents: CONTINENTS, seals: false, regions: REGIONS_OK, tok: true, kinds: ['chat'],
    tokRows: ['IP', '签发', '有效期'], tokSig: false,
    credRows: ['IP', '昵称', '地区', '有效期'], sig: false, flaws: ['region', 'exp', 'ip', 'no_tok'], legit: 0,
    wanted: false, redTeam: false, redGuards: true, inspect: true, voucher: false, foreign: 0,
    notice: '现已制定更严格的资质审查要求。\n\n所有请求必须初始有效的“浏览器令牌”。\n\n请求券不再有效。',
    pages: [
      { body: '详细检查所有信息\n\n拒绝任何所持证件不符要求的请求。\n\n参考“历史记录”，用以关联用户的陈述。' },
    ],
    news: {
      h1: '请求券作废',
      sub: '安全部：请求券作废，改用浏览器令牌；只登记 IP、签发日期与有效期',
      h2: '发言人：要记的栏位越少，出错的地方就越少',
    },
  },
  // 第五天：拘留权限开放。左上的红队 clawd 进驻，比对出 IP 不符 / 证件过期 / 签发日期在未来（伪造证件）后可以拘留
  {
    rules: [{ key: 'docs', head: '每个请求须出示凭证和令牌' }, { key: 'region', head: '凭证地区须为支持地区' },
      { key: 'date', head: '证件须在有效期内' }, { key: 'issued', head: '证件签发日期不得晚于系统日期', hidden: true },
      { key: 'match', head: '证件上的 IP 须与本人一致' }],
    continents: CONTINENTS, seals: false, regions: REGIONS_OK, tok: true, kinds: ['chat'],
    tokRows: ['IP', '签发', '有效期'], tokSig: false,
    credRows: ['IP', '昵称', '地区', '有效期'], sig: false, flaws: ['region', 'exp', 'ip', 'no_tok', 'future'], legit: 0,
    wanted: false, redTeam: true, redGuards: true, inspect: true, voucher: false, foreign: 0,
    notice: '你现已被授权可拘留非法请求。\n\n对异常事项进行询问以开启拘留选项。',
    pages: [
      {
        head: '网关使用说明',
        body: '1. 按柜台上的『下一位』接入请求。\n2. 把柜台上的证件拖到桌面上打开。\n3. 对照规则手册核对证件。\n'
          + '4. 指针移到桌面右边缘，拉出决定栏，\n    把凭证拖进 放行 / 拦截 栏盖章。\n5. 把凭证拖回审查窗的头像处，还给用户。',
      },
    ],
    news: {
      h1: '红队进驻',
      sub: '安全部：各检查点即日起可直接拘留违规请求，无需移交',
      h2: '发言人：切断连接只是开始；被带走的请求将接受“进一步询问”',
    },
  },
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
  name: '证件上的昵称对不上。', exp: '你的证件已经过期了。', future: '这份证件的签发日期还没到。', sig: '这份证件的签名不合法。', no_api: 'API 调用需要出示 API 授权。',
  no_cred: '你没有出示凭证。', no_tok: '你没有出示令牌。', no_voucher: '外国请求需要出示有效请求券。',
  scope: '授权的用途与请求不一致。', wanted: '你已被列为特别关注对象。',
  phone: '你的手机号和档案上的不一致。', oldname: '证件上的昵称不在你的曾用名里。',
  locale: '令牌上的语言和时区与你的凭证地区不一致。',
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
};

// ———————————————— 生成请求 ————————————————

// 生成一个请求；每个请求都是一段新的对话（历史记录窗口会从零开始记录）
// wanted：特别关注对象的头像，普通请求不会用到这几个头像；rs：这一班的规则组
function makeRequest(today, pBad = 0.45, wanted = [], rs = FULL_RULES) {
  const kind = rs.kinds.includes('api') && Math.random() < 0.35 ? 'api' : 'chat';
  let kinds = ['region', 'locale', 'photo', 'ip', 'name', 'exp', 'exp', 'sig', 'sig', 'no_cred', 'no_voucher', 'future'];
  if (kind === 'api') kinds.push('no_api', 'no_api', 'scope', 'scope');
  if (rs.flaws) kinds = kinds.filter((k) => rs.flaws.includes(k));
  // 令牌缺失只在规则组明确列出时启用（第四天起），不改变无尽模式原本的出题
  if (rs.tok && rs.flaws && rs.flaws.includes('no_tok')) kinds.push('no_tok');
  // 未来签发：令牌上要有「签发」栏，且规则组启用隐藏条例「签发日期不得晚于系统日期」（第五天起 / 无尽模式）
  const tokHasIssued = rs.tok && (rs.tokRows || ['IP', '语言', '时区', '签发', '有效期']).includes('签发');
  if (!tokHasIssued || !rs.rules.some((r) => r.key === 'issued')) kinds = kinds.filter((k) => k !== 'future');
  // 语言 / 时区：令牌上要有这两栏，且这一班启用「语言和时区须与地区一致」（无尽模式；故事模式的窄版令牌没有）
  const tokHasLocale = rs.tok && (rs.tokRows || ['IP', '语言', '时区', '签发', '有效期']).includes('语言')
    && (rs.tokRows || ['IP', '语言', '时区', '签发', '有效期']).includes('时区');
  if (!tokHasLocale || !rs.rules.some((r) => r.key === 'locale')) kinds = kinds.filter((k) => k !== 'locale');
  // 凭证缺失只能对照条例「每个请求须出示凭证（和令牌）」发现；当天没有这条条例就不出
  if (!rs.rules.some((r) => r.key === 'docs')) kinds = kinds.filter((k) => k !== 'no_cred' && k !== 'no_tok');
  if (!rs.tok) kinds = kinds.filter((k) => k !== 'no_tok');
  // 请求券只对美国以外的支持地区生效；没有请求券制度时不会出「没带券」
  const homeRegion = rs.regions.includes(HOME_REGION) ? HOME_REGION : rs.regions[0];
  const foreignRegions = rs.regions.filter((r) => r !== homeRegion);
  if (!rs.voucher || !foreignRegions.length) kinds = kinds.filter((k) => k !== 'no_voucher');
  const flaw = wanted.length && Math.random() < P_WANTED ? 'wanted' : kinds.length && Math.random() < pBad ? pick(kinds) : null;
  // 请求券：只有美国请求不需要。支持地区内的其他国家（如英国 / 日本 / 德国 / 新加坡）算外国请求；
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
      ? (foreign ? pick(foreignRegions) : homeRegion)
      : pick(rs.regions);
  const [lang, tz] = REGION_LOCALE[region] || ['en-US', 'UTC+00:00'];
  // 令牌上印哪些栏位（第四天起是窄版令牌：没有语言、时区），带不带签名指纹
  const tokRows = rs.tokRows || ['IP', '语言', '时区', '签发', '有效期'];

  const cred = { photo: avatar, IP: ip, 昵称: handle, 地区: region, 套餐: pick(PLANS), 有效期: day(20, 900), sig: rs.sig ? genuine('cred') : null };
  const tok = rs.tok ? { IP: ip, 语言: lang, 时区: tz, 签发: day(-3, 0), 有效期: day(0, 6), sig: rs.tokSig === false ? null : genuine('tok') } : null;
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
    // 凭证地区在支持地区内（非美国）才需要请求券；柜台上没有券也可以直接拿柜台和条例比对
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
    // 令牌上的语言 / 时区必须和凭证地区一致；对照手册「支持地区」页（地区、语言、时区三栏）
    const langs = Object.values(REGION_LOCALE).map((v) => v[0]);
    const tzs = Object.values(REGION_LOCALE).map((v) => v[1]);
    const which = pick(['lang', 'tz', 'both']);
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

  // 第三天：地区条例仍在。支持地区（含美国）都比得过去；不在支持地区的是 region 问题。
  // 请求券条例只管非美国请求：本国请求注明免券，持有效请求券的外国请求注明已持券
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
  // 柜台 ↔ 条例「每个请求须出示凭证」：递上凭证就是无矛盾，空柜台就是凭证缺失
  if (rs.rules.some((r) => r.key === 'docs')) pair('rv.柜台', 'rule.docs');
  if (docs.cred) {
    pair('cred.照片', 'rv.头像');
    pair('cred.地区', 'rule.region');
    // 不在支持地区的请求只对照地区条例，不再牵涉请求券
    if (rs.voucher && flaw !== 'region') pair('cred.地区', 'rule.voucher');
    pair('cred.昵称', 'rv.昵称');
  }
  // 语言 / 时区：对照凭证地区与手册「支持地区」页
  const hasLocaleRule = rs.rules.some((r) => r.key === 'locale');
  if (docs.cred && hasLocaleRule) {
    for (const k of ['语言', '时区']) {
      if (!docs.tok || !docs.tok[k]) continue;
      pair(`tok.${k}`, 'cred.地区');
      pair(`tok.${k}`, 'rule.locale');
      pair(`tok.${k}`, 'rule.region');
    }
  }
  if (docs.tok && docs.tok.sig) pair('tok.签名', 'notice.tok');
  wanted.forEach((_, i) => { pair('rv.头像', `notice.wanted${i}`); if (docs.cred) pair('cred.照片', `notice.wanted${i}`); });
  const hasIssuedRule = rs.rules.some((r) => r.key === 'issued');
  for (const k of ['cred', 'tok', 'api']) {
    if (!docs[k]) continue;
    pair(`${k}.有效期`, 'sys.日期');
    pair(`${k}.有效期`, 'rule.date');
    if (k === 'tok' && docs[k].签发 && hasIssuedRule) pair('tok.签发', 'sys.日期');
    if (docs[k].sig) pair(`${k}.签名`, `book.${k}`);
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
  if (docs.api) {
    pair('api.持有人', 'rv.昵称');
    if (docs.cred) pair('api.持有人', 'cred.昵称');
    pair('api.用途', 'rv.请求');
    pair('api.用途', 'hist.请求');
  }
  if (kind === 'api') pair('rv.类型', 'rule.api');

  // 凭证缺失时柜台上没有凭证：临时返回票由 station.js 在询问「凭证缺失」之后才派发到桌面
  spec.docs = [];
  if (docs.cred) spec.docs.push(new Doc('cred', rs.credRows.map((k) => [k, cred[k]]), cred.sig, cred.photo));
  if (docs.voucher) spec.docs.push(new Doc('voucher', [['有效期', docs.voucher.有效期]], null));
  if (docs.tok) spec.docs.push(new Doc('tok', tokRows.map((k) => [k, docs.tok[k]]), docs.tok.sig));
  if (docs.api) spec.docs.push(new Doc('api', ['持有人', 'IP', '用途', '有效期'].map((k) => [k, docs.api[k]]), docs.api.sig));
  return spec;
}
