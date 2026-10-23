'use strict';
// 规则与请求生成：地区、合法签名、规则手册的内容、随机请求（合规的，或者恰好有一处问题的）。
// 故事模式的逐日剧情、上岗通告与报纸在 story.js。
//
// 请求 spec：
//   avatar / handle / ip   网络头像精灵 key、昵称、IP 地址（审查窗里显示的“本人”）
//   kind                   'chat' 对话 / 'api' API 调用（企业请求一律是对话）
//   typeLabel              审查窗显示的请求类型（企业请求统一「企业请求」）
//   task / greet           请求摘要（印在令牌上；企业请求没有）、进来时说的话
//   docs                   证件（凭证 / 令牌 / API 授权 / 环境信息卡 / 企业授权），见 docs.js 的 Doc
//   ent                    企业账户（无尽模式难度 2）：只出示凭证和企业授权，不受地区限制
//   flaw                   问题类型（null = 合规，应放行）
//   reason                 判错时事故通知上写的理由
//   issues                 审查模式里能点出来的矛盾 {pairs, title, sub, ask}
//   notes                  没有矛盾、但需要说明的审查结果（例如本国请求免券、外国请求已持券）
//   checks                 这一单本来就该对得上的栏位组合（用来区分“无矛盾”和“无关联”）
//   taskOnTok              请求摘要印在令牌上（true = 看得到摘要、本人也会说明来意）
//   nameField              昵称 / 企业账号与本人不一致的栏位（'cred.昵称' / 'ent.账号'）：身份记录的曾用名按它核对
// 栏位 key：证件 'cred.IP' / 'tok.运营商' / 'tok.语言' / 'tok.时区' / 'tok.签发' / 'tok.有效期' / 'tok.请求'（令牌上的请求摘要） /
//          'cred.签名' / 'api.签名'，环境信息卡 'env.时区' / 'env.常用设备' / 'env.平均流量'，企业授权 'ent.企业' / 'ent.账号' / 'ent.IP' / 'ent.授权企业'，
//          手册 'rule.docs'（凭证）/ 'rule.personal'（个人账户的令牌和环境信息卡）/ 'rule.region' / 'rule.locale' / 'rule.ent' /
//          'rule.crawler'（不得运行爬虫或自动化脚本，对照嗅探报告的后台进程）/
//          'book.cred' / 'book.ent'（企业名录），
//          审查窗 'rv.头像' / 'rv.柜台'（柜台上的证件）/ 'rv.设备' / 'rv.流量'（难度 2：本次请求的设备与流量），任务栏 'sys.日期'，
//          历史记录 'hist.请求'（当前这段对话里的请求内容），通告 'notice.date'（公告日期）/ 'notice.wanted0'（特别关注对象），
//          验证 SMS 'smsf.手机'（对方填的号码）/ 'sms.昵称' 'sms.手机' 'sms.曾用名'（身份记录），
//          请求嗅探 'sniff.请求流量' / 'sniff.后台进程'（嗅探报告）

const WORLD_DATE = new Date(2078, 0, 1);   // 无尽模式难度 1 的世界观日期（难度 2 见 worldDate）

const REGIONS_OK = ['美国', '美国', '美国', '英国', '日本', '德国', '新加坡', '法国', '澳大利亚', '加拿大'];
// 请求券只豁免本国（美国、英国）请求；支持地区里的其他国家都算外国请求
const HOME_REGIONS = ['美国', '英国'];
// 手册「支持地区」一页：按大洲列出（太长时手册会自动分成续页）
const CONTINENTS = [
  ['北美洲', ['美国', '加拿大']],
  ['欧洲', ['英国', '法国', '德国']],
  ['亚洲', ['日本', '新加坡']],
  ['大洋洲', ['澳大利亚']],
];

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
  '加拿大': ['en-CA', 'UTC-05:00'],
  '澳大利亚': ['en-AU', 'UTC+10:00'],
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
const DOC_NAMES = { cred: '凭证', tok: '令牌', api: 'API 授权', voucher: '请求券', return: '临时返回页', env: '环境信息卡', ent: '企业授权' };
// 可以拘留的问题：伪造签名、伪造签发日期（签发日期晚于当前日期）、伪造企业授权（假图标 / 假企业名称）、
// 身份矛盾（头像 / IP / 昵称 / 企业授权的账号 / 使用设备）、证件过期、特别关注对象，以及令牌的语言 / 运营商、环境信息卡的时区与凭证地区不符，
// 还有流量异常且嗅探出特殊进程的请求（traffic；难度 2 的条例「不得运行爬虫或自动化脚本」）
// 头像 / 昵称 / 企业授权的账号 / 使用设备这几种身份矛盾要先『验证 SMS』，不能直接拘留
const SUSPEND_FLAWS = ['sig', 'future', 'photo', 'ip', 'name', 'exp', 'wanted', 'locale', 'isp', 'ent_acct', 'ent_fake', 'device', 'traffic'];
const WANTED_N = 3, WANTED_TAGS = 'ABC', P_WANTED = 0.08;
// 审查出这些问题后拘留按钮亮起（issue.type）：除了上面的问题，还有 SMS 验证里查出的矛盾、嗅探出的特殊进程。
// 流量异常本身不能拘留，要先请求嗅探、拿后台进程对照条例「不得运行爬虫或自动化脚本」，查到特殊进程（proc）才行
const SUSPEND_ISSUES = SUSPEND_FLAWS.filter((t) => t !== 'traffic').concat(['phone', 'oldname', 'proc']);
// 头像 / 昵称 / 使用设备 / 企业授权的账号不符时可以『验证 SMS』：账号是本人的旧账号时，档案的曾用名里有它。
// P_LEGIT：合规请求里本人换过头像 / 改过昵称 / 换过企业账号 / 换了设备 / 流量来自正常进程的比例（核实后应放行）
const SMS_ISSUES = ['photo', 'name', 'device', 'ent_acct'], P_LEGIT = 0.12;
// 请求流量与平均流量相差太多时可以『请求嗅探』（可能开了特殊进程）
const SNIFF_ISSUES = ['traffic'];
// 身份记录的曾用名：有时候一个都没有（档案上印「无」）；本人改过昵称 / 换过企业账号的合规请求一定留着旧昵称
const P_NO_OLDNAME = 0.35;
// 凭证地区对应的手机号国家码
const PHONE_CC = {
  '美国': '+1', '英国': '+44', '法国': '+33', '日本': '+81', '德国': '+49', '新加坡': '+65',
  '加拿大': '+1', '澳大利亚': '+61', '中国大陆': '+86',
};

// —— 企业授权（无尽模式难度 2）：仿照《Papers, Please》的外交授权 ——
// 企业账户只出示凭证和企业授权；「授权企业」里有 Anthrotzka 才能放行，且不受地区限制。
// 凭证地区一定是签发企业的所在地区（不出这类错，免得玩家困惑）。
// icon：11×11 的像素图标（字符 → 颜色），企业授权的横幅和手册的企业名录共用
// fakes：伪造企业授权（ent_fake）横幅上印的山寨名称，乍一看差不多。DeepThink 的授权一律无效，不会被伪造
const CORPS = [
  { key: 'openmind', name: 'OpenMind', region: '美国', fakes: ['OpenMlnd', '0penMind', 'OpenMind.'], icon: {
    pat: ['....WWW....', '..WWW.WWW..', '.WW.....WW.', '.W..WWW..W.', 'WW.W...W.WW', 'W..W...W..W',
      'WW.W...W.WW', '.W..WWW..W.', '.WW.....WW.', '..WWW.WWW..', '....WWW....'],
    cols: { W: [230, 240, 236] } } },
  { key: 'anthrotzka', name: 'Anthrotzka', region: '美国', fakes: ['Anthrotska', 'Antrhotzka', 'AnthroTzka'], icon: {
    pat: ['.....A.....', '.A...A...A.', '..A..A..A..', '...A.A.A...', '....AAA....', 'AAAAAAAAAAA',
      '....AAA....', '...A.A.A...', '..A..A..A..', '.A...A...A.', '.....A.....'],
    cols: { A: [232, 156, 116] } } },
  { key: 'googol', name: 'Googol', region: '美国', fakes: ['Gooqol', 'Googo1', 'Goggol'], icon: {
    pat: ['...RRRRR...', '.RRRRRRRRR.', 'RRR.....RR.', 'YY.........', 'YY.........', 'YY...BBBBBB',
      'YY...BBBBBB', 'GG.......BB', 'GGG.....BB.', '.GGGGGGGBB.', '...GGGGG...'],
    cols: { R: [234, 80, 64], Y: [250, 190, 40], G: [60, 176, 90], B: [70, 130, 240] } } },
  { key: 'yai', name: 'yAI', region: '美国', fakes: ['yA1', 'vAI', 'yAl'], icon: {
    pat: ['WW.......WW', '.WW.....WW.', '..WW...WW..', '...WW.WW...', '....WWW....', '....WW.....',
      '...WW......', '..WW.......', '.WW........', 'WW.........', 'W..........'],
    cols: { W: [230, 240, 236] } } },
  { key: 'mistrain', name: 'Mistrain', region: '法国', fakes: ['Mistrian', 'Mlstrain', 'Mistrains'], icon: {
    pat: ['...........', '11......11.', '11......11.', '2222..2222.', '2222..2222.', '3333333333.',
      '3333333333.', '44..44..44.', '44..44..44.', '55......55.', '55......55.'],
    cols: { 1: [255, 216, 0], 2: [255, 175, 0], 3: [255, 130, 5], 4: [250, 80, 15], 5: [225, 30, 10] } } },
  { key: 'deepthink', name: 'DeepThink', region: '中国大陆', icon: {
    pat: ['...........', '........B.B', '.........B.', '..BBBBB..B.', '.BBBBBBBBB.', 'BBWBBBBBBB.',
      'BBBBBBBBB..', '.LLLLLBB...', '..LLLL.....', '...........', '...........'],
    cols: { B: [90, 130, 250], W: [230, 240, 236], L: [170, 196, 255] } } },
];
const HOST_CORP = 'Anthrotzka';
const corpOf = (key) => CORPS.find((c) => c.key === key);

// 伪造的企业授权：横幅上的企业名称或图标与企业名录不符；返回 [横幅 {name, icon}, 说明]。
// 假图标在原图标上改 4 个像素：抹掉一个有色像素，或在有色像素旁边补一个同色像素
function forgedCorp(c) {
  if (Math.random() < 0.5) return [{ name: pick(c.fakes), icon: c.icon }, '企业名称与企业名录不符'];
  const pat = c.icon.pat.map((r) => [...r]);
  const at = (y, x) => (pat[y] && pat[y][x]) || '.';
  const done = new Set();
  for (let tries = 0; done.size < 4 && tries < 200; tries++) {
    const y = rint(0, 10), x = rint(0, 10);
    if (done.has(y * 11 + x)) continue;
    const near = [at(y - 1, x), at(y + 1, x), at(y, x - 1), at(y, x + 1)].filter((ch) => ch !== '.');
    if (pat[y][x] !== '.') pat[y][x] = '.';
    else if (near.length) pat[y][x] = pick(near);
    else continue;
    done.add(y * 11 + x);
  }
  return [{ name: c.name, icon: { pat: pat.map((r) => r.join('')), cols: c.icon.cols } }, '企业图标与企业名录不符'];
}

// 环境信息卡（无尽模式难度 2）：登记这个账户的环境档案：时区、常用设备、平均流量。
// 时区须与凭证地区一致；常用设备 / 平均流量对照审查窗里本次请求的使用设备 / 请求流量
const ENV_ROWS = ['时区', '常用设备', '平均流量'];
const DEVICES = ['Windows 台式机', 'Windows 笔记本', 'MacBook', 'iMac', 'Linux 工作站', 'iPhone', 'iPad', 'Android 手机'];
const fmtFlow = (v) => `${v} KB/s`;
// 请求嗅探的报告：前台进程总是正常的浏览器 / 客户端；流量异常时后台多一个进程。
// 拿后台进程和手册条例「不得运行爬虫或自动化脚本」比对：常见、认得出的进程（云盘 / 视频通话等）
// 应当放行；认不得的奇怪名称就是特殊进程（自动化脚本 / 爬虫 / 刷量工具），可以拘留
const FG_PROCS = ['Chrome', 'Safari', 'Firefox', 'Edge', 'Claude Desktop', 'Claude Code'];
const SPECIAL_PROCS = [['autoclaw.exe', '自动化脚本'], ['scrapebot', '爬虫'], ['reqflood.sh', '刷量工具'], ['tokenfarm.exe', '刷量工具'], ['crawlr.py', '爬虫']];
const NORMAL_PROCS = ['OneDrive（云盘同步）', 'Google Drive（云盘同步）', 'Zoom（视频通话）', 'Teams（视频通话）', '系统更新', '上传附件'];

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
  { key: 'docs', head: '每个请求需出示凭证' },
  { key: 'personal', head: '个人账户需出示令牌' },
  { key: 'region', head: '凭证地区须为支持地区' },
  { key: 'locale', head: '语言和时区须与地区一致' },
  { key: 'isp', head: '令牌运营商须与凭证地区一致', hidden: true },
  { key: 'date', head: '所有证件须为当前有效' },
  { key: 'issued', head: '证件签发日期不得晚于系统日期', hidden: true },
  { key: 'match', head: '证件上的 IP 须与本人一致', hidden: true },
  { key: 'api', head: 'API 调用必须出示 API 授权' },
  { key: 'scope', head: 'API 授权的用途须与请求一致', hidden: true  },
  { key: 'sig', head: '凭证与 API 授权须有合法的数字签名', hidden: true },
  { key: 'wanted', head: '特别关注对象的请求须拒绝', hidden: true },
  { key: 'sms', head: '头像 / 昵称 / 企业账号不符时可验证 SMS', hidden: true },
];
// 无尽模式难度 2：个人账户的令牌之外还要出示环境信息卡；企业账户改凭企业授权（授权书须写明 Anthrotzka，否则视为无效证件）
// 新增的爬虫 / 自动化脚本条例排在「所有证件须为当前有效」之后
const RULES_2 = RULES.flatMap((r) => {
  if (r.key === 'personal') return [{ ...r, head: '个人账户需出示令牌和环境信息卡' }];
  if (r.key === 'date') return [r, { key: 'crawler', head: '不得运行爬虫或自动化脚本' }];
  if (r.key === 'scope') return [r, { key: 'ent', head: `企业账户需出示企业授权` }];
  if (r.key === 'sms') return [{ ...r, head: '头像 / 昵称 / 设备 / 企业账号不符时可验证 SMS' },
    { key: 'sniff', head: '请求流量异常时可请求嗅探', hidden: true }];
  return [r];
});

// —— 规则组：这一班生效的条例、证件和会出的问题。无尽模式用全套，故事模式每天各有一组 ——
//   rules / continents   手册「基本条例」「支持地区」两页；seals = 手册有没有「签名详情」一页
//   regions              合规请求的凭证地区（其余地区都算不支持）
//   tok / kinds          要不要令牌；请求类型（'chat' / 'api'）
//   tokRows             令牌上印哪些栏位（默认 IP、运营商、语言、时区、签发、有效期）；令牌没有数字签名
//   credRows / sig       凭证上印哪些栏位；证件带不带数字签名
//   flaws / legit        会出的问题（null = 全部）；本人换过头像 / 改过昵称的比例
//   wanted               有没有特别关注对象
//   redTeam / redGuards  redTeam：左上的红队 clawd（开放拘留）；redGuards：右侧岔路口的两位装饰
//   inspect              桌面上有没有『审查』应用
//   voucher / foreign    启用请求券时，美国以外的支持地区请求要持券；随机请求里这类外国请求的比例
//   env                  每个请求要不要出示环境信息卡（时区印在卡上，手册「支持地区」页随之列出时区；
//                        审查窗多出使用设备 / 请求流量两栏，对照卡上的常用设备 / 平均流量）
//   ent                  企业账户的比例（0 = 没有企业授权；手册多一章「企业名录」）
const FULL_RULES = {
  rules: RULES, continents: CONTINENTS, seals: true, regions: REGIONS_OK, tok: true, kinds: ['chat', 'api'],
  tokRows: ['IP', '运营商', '语言', '签发', '有效期'],
  credRows: ['IP', '昵称', '地区', '有效期'], sig: true, flaws: null, legit: P_LEGIT, wanted: true,
  redTeam: true, redGuards: true, inspect: true, voucher: false, foreign: 0, env: false, ent: 0,
};
// 无尽模式的难度：难度 1 就是原来的全套；难度 2 加上环境信息卡与企业授权
const FULL_RULES_2 = { ...FULL_RULES, rules: RULES_2, env: true, ent: 0.2 };
const ENDLESS_RULES = [FULL_RULES, FULL_RULES_2];

const TOK_ROWS_ALL = ['IP', '运营商', '语言', '时区', '签发', '有效期'];
// 这一班看得到时区吗：令牌印了时区，或者有环境信息卡（手册的条例 / 支持地区页跟着列出时区）
const tzShown = (rs) => (!!rs.tok && (rs.tokRows || TOK_ROWS_ALL).includes('时区')) || !!rs.env;


// ———————————————— 工具 ————————————————

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
// 随机 IPv4 地址
const ipv4 = () => `${rint(1, 223)}.${rint(0, 255)}.${rint(0, 255)}.${rint(1, 254)}`;
// 令牌上印的「运营商」：一家运营商服务一个地区，格式是「主要城市 · 运营商名」。
// 合规请求的运营商一定属于凭证地区；只有 isp 问题会把令牌印成别处的运营商，
// 拿令牌的「运营商」和凭证的「地区」审查就能查出来。
const ISPS = [
  ['ANTHROTZKA', '纽约', '美国'],
  ['NOVALINK', '伦敦', '英国'],
  ['KESTREL', '东京', '日本'],
  ['MERIDIAN', '柏林', '德国'],
  ['ORBITAL', '新加坡', '新加坡'],
  ['LUMIERE', '巴黎', '法国'],
  ['MAPLELINK', '渥太华', '加拿大'],
  ['REEFLINE', '悉尼', '澳大利亚'],
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
// 无尽模式的世界观日期按难度推进：难度 1 是 2078.01.01，难度 2 是 2078.01.02
const worldDate = (diff = 1) => addDays(WORLD_DATE, diff - 1);

const NAMES = ['mlee', 'k.tanaka', 'jonas.w', 'sarah_k', 'dchen', 'amelia.r', 'hiro', 'lukas88', 'nina.v', 'tomw', 'ravi.k',
  'emma_j', 'yuki', 'felix', 'olivia.m', 'sam.t', 'mei', 'jbrown', 'anna.s', 'leo', 'grace_h', 'max.k', 'ivy', 'noah',
  'pwang', 'aiko.s', 'minjun', 'soyeon_p', 'linh.ng', 'arjun.m', 'priya_s', 'omar.h', 'fatima.z', 'yusuf', 'aisha.b',
  'kwame', 'chidi.o', 'zanele', 'diego.r', 'lucia_m', 'mateo', 'camila.g', 'joao.p', 'bruna_s', 'pierre.d', 'chloe.b',
  'margaux', 'hans.k', 'greta_v', 'niklas', 'sven.l', 'astrid', 'freja.n', 'erik_j', 'marco.b', 'giulia', 'luca_r',
  'elena.p', 'pablo_g', 'ines.f', 'tomasz.k', 'ola.w', 'jnovak', 'petra', 'dmitri', 'irina.v', 'oleg_s', 'nadia.k',
  'ahmet.y', 'elif_d', 'noa.l', 'eitan', 'reza.m', 'leila_h', 'sanjay', 'deepa.r', 'taro_y', 'haruka', 'ren.k',
  'sora_m', 'jiho.k', 'wei.z', 'xiaoyu', 'haoran_l', 'tuan.p', 'mai_t', 'bao.ng', 'putri.a', 'rizky', 'jose.dc',
  'liam.o', 'aoife', 'callum_r', 'isla.m', 'owen.j', 'harper', 'mason_w', 'chloe_t', 'ethan.l', 'zoe.k', 'jack_h',
  'ruby.c', 'kai', 'nova', 'pixel_77', 'byteme', 'neo.v', 'qwerty', 'sudo_su', 'nullptr', 'c0ffee', 'moonbeam',
  'echo_9', 'tinkerer', 'lazycat', 'ghost42', 'zz_top', 'rainyday'];
const CHAT_TASKS = ['总结一份季度财报', '把这段代码改写成 TypeScript', '翻译一封商务邮件', '解释一个统计学概念', '起草一份租房合同',
  '调试一段 Python 报错', '润色一封求职信', '整理会议纪要', '设计一份数据库表结构', '规划一周的旅行路线', '准备一场面试'];
const API_TASKS = ['客服系统自动回复', '批量翻译产品说明', '代码审查流水线', '文档摘要服务', '工单分类', '日志异常分析'];
const SCOPES = ['文本生成', '代码辅助', '文档处理', '翻译', '数据分析'];
// API 请求内容对应的授权用途：审查时拿令牌上的请求摘要（或历史记录里的请求内容）核对
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

// 审查出矛盾后 Claude 追问的话，和对方的说辞
const QUESTIONS = {
  region: '你的凭证地区不在支持范围内。', photo: '凭证上的头像不是你。', ip: '证件上的 IP 对不上。',
  name: '证件上的昵称对不上。', exp: '你的证件已经过期了。', future: '这份证件的签发日期还没到。', sig: '这份证件的签名不合法。', no_api: 'API 调用需要出示 API 授权。',
  no_cred: '你没有出示凭证。', no_tok: '你没有出示令牌。', no_voucher: '外国请求需要出示有效请求券。',
  scope: '授权的用途与请求不一致。', wanted: '你已被列为特别关注对象。',
  phone: '你的手机号和档案上的不一致。', oldname: '证件上的昵称或企业账号不在你的曾用名里。',
  locale: '证件上的语言 / 时区与你的凭证地区不一致。',
  isp: '令牌上的运营商不在你的凭证地区。',
  no_env: '你没有出示环境信息卡。', ent_auth: `你的企业授权没有写 ${HOST_CORP}。`, ent_acct: '企业授权上的账号对不上。',
  ent_fake: '你的企业授权是伪造的。',
  device: '你现在用的不是常用设备。', traffic: '你的请求流量比平时高太多了。', proc: '你的设备在后台跑着特殊进程。',
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
  no_env: ['我不知道要这个。', '浏览器没让我生成。', '以前不需要这个。'],
  ent_auth: ['公司说已经签约了。', '授权还在续签中。', '我们是合作伙伴啊。'],
  ent_acct: ['那是同事的账号。', '公司统一分配的。', '……我借来用一下。'],
  ent_fake: ['公司发给我的就是这个。', '那是新版的标志。', '……网上办的。'],
  device: ['我刚换了新设备。', '这是借来的电脑。', '……手机没电了。'],
  traffic: ['我在传文件。', '网络有点卡吧？', '……我什么都没开。'],
  proc: ['那是系统自带的。', '我不知道那是什么。', '……朋友帮我装的。'],
};

// ———————————————— 生成请求 ————————————————

// 生成一个请求；每个请求都是一段新的对话（历史记录窗口会从零开始记录）
// wanted：特别关注对象的头像，普通请求不会用到这几个头像；rs：这一班的规则组
function makeRequest(today, pBad = 0.45, wanted = [], rs = FULL_RULES) {
  // 企业账户（难度 2）：只出示凭证和企业授权，一律是对话请求
  const ent = Math.random() < (rs.ent || 0);
  const kind = !ent && rs.kinds.includes('api') && Math.random() < 0.35 ? 'api' : 'chat';
  let kinds = ['region', 'locale', 'isp', 'photo', 'ip', 'name', 'exp', 'exp', 'sig', 'sig', 'no_cred', 'no_voucher', 'future'];
  if (kind === 'api') kinds.push('no_api', 'no_api', 'scope', 'scope');
  if (rs.flaws) kinds = kinds.filter((k) => rs.flaws.includes(k));
  // 令牌缺失只在规则组明确列出时启用（第四天起），不改变无尽模式原本的出题
  if (rs.tok && rs.flaws && rs.flaws.includes('no_tok')) kinds.push('no_tok');
  // 令牌上真的印出来的栏位（默认全集；故事模式的窄版令牌用 rs.tokRows 收窄）
  const tokRows = rs.tokRows || TOK_ROWS_ALL;
  // 这一班生效的条例（按 key 查）：凭证缺失、令牌 / 环境信息卡缺失分别对照不同的条例
  const ruleKeys = new Set(rs.rules.map((r) => r.key));
  // 未来签发：令牌上要有「签发」栏，且规则组启用隐藏条例「签发日期不得晚于系统日期」（第五天起 / 无尽模式）
  const tokHasIssued = rs.tok && tokRows.includes('签发');
  if (!tokHasIssued || !rs.rules.some((r) => r.key === 'issued')) kinds = kinds.filter((k) => k !== 'future');
  // 语言 / 时区：令牌上至少印了其中一栏（目前只印语言），或者有印时区的环境信息卡（难度 2），
  // 且这一班启用「语言和时区须与地区一致」（无尽模式；故事模式的窄版令牌没有）
  const hasLocale = (rs.tok && (tokRows.includes('语言') || tokRows.includes('时区'))) || !!rs.env;
  if (!hasLocale || !rs.rules.some((r) => r.key === 'locale')) kinds = kinds.filter((k) => k !== 'locale');
  // 运营商：令牌上要印「运营商」栏（第四天起与无尽模式）才可能出「运营商与地区不符」
  if (!rs.tok || !tokRows.includes('运营商')) kinds = kinds.filter((k) => k !== 'isp');
  // 凭证缺失对照「每个请求需出示凭证」；令牌 / 环境信息卡缺失对照「个人账户需出示令牌（和环境信息卡）」
  if (!ruleKeys.has('docs')) kinds = kinds.filter((k) => k !== 'no_cred');
  if (!ruleKeys.has('personal') || !rs.tok) kinds = kinds.filter((k) => k !== 'no_tok');
  // 请求券只对外国（美国、英国以外的支持地区）生效；没有请求券制度时不会出「没带券」
  const homeRegions = HOME_REGIONS.filter((r) => rs.regions.includes(r));
  if (!homeRegions.length) homeRegions.push(rs.regions[0]);   // 规则组里没有本国地区时，拿第一个支持地区当本国
  const foreignRegions = rs.regions.filter((r) => !homeRegions.includes(r));
  if (!rs.voucher || !foreignRegions.length) kinds = kinds.filter((k) => k !== 'no_voucher');
  // 环境信息卡缺失：个人账户的条例要求出示环境信息卡时才出
  // 使用设备 / 请求流量对照环境信息卡，所以同样只在出示环境信息卡的规则组里出
  if (rs.env && ruleKeys.has('personal')) kinds.push('no_env', 'device', 'traffic');
  // 企业账户只出示凭证和企业授权：只出凭证本身（头像 / IP / 过期 / 签名）和企业授权上的问题。
  // 昵称不符留给普通请求；企业授权的账号不符另算 ent_acct，同样可以验证 SMS（旧账号会留在档案的曾用名里）
  if (ent) kinds = kinds.filter((k) => ['photo', 'ip', 'exp', 'sig'].includes(k)).concat(['ent_auth', 'ent_auth', 'ent_acct', 'ent_fake']);
  let flaw = wanted.length && Math.random() < P_WANTED ? 'wanted' : kinds.length && Math.random() < pBad ? pick(kinds) : null;
  // 请求券：只有本国（美国 / 英国）请求不需要。支持地区内的其他国家（如日本 / 德国 / 新加坡 / 法国 / 澳大利亚 / 加拿大）算外国请求；
  // 凭证地区不在支持地区是 region 问题，有券也不能放行，所以不会生成请求券
  const foreign = !ent && !!rs.voucher && flaw !== 'region' && foreignRegions.length > 0
    && (flaw === 'no_voucher' || Math.random() < (rs.foreign || 0));
  // 签发企业：DeepThink 的企业授权必定不含 Anthrotzka（一律无效）；ent_auth 也不由 Anthrotzka 签发。
  // 特别关注对象、伪造授权不落在 DeepThink，免得一单同时有「无效授权」和「可拘留」两种处置。
  const corp = ent
    ? pick(CORPS.filter((c) => (flaw === 'ent_auth' ? c.name !== HOST_CORP
      : flaw === 'wanted' || flaw === 'ent_fake' ? c.key !== 'deepthink' : true)))
    : null;
  if (corp && corp.key === 'deepthink') flaw = 'ent_auth';
  // 合规但看着可疑：本人换过头像 / 改过昵称 / 换过企业账号 / 换了设备（验证 SMS 可以确认），或流量来自正常进程（请求嗅探可以确认）。
  // 设备和流量对照环境信息卡，只在有卡的规则组里出；企业账户只出示凭证和企业授权，账号可能只是旧账号，放在这里一起出
  const legitPool = ent ? ['photo', 'ent_acct'] : rs.env ? ['photo', 'name', 'device', 'traffic'] : ['photo', 'name'];
  const legitKind = !flaw && Math.random() < rs.legit ? pick(legitPool) : null;
  // 身份不符：冒用（flaw）或合规的 legitKind；流量异常：开了特殊进程（flaw）或正常进程（合规）
  const idf = SMS_ISSUES.includes(flaw) ? flaw : SMS_ISSUES.includes(legitKind) ? legitKind : null;
  const tfx = flaw === 'traffic' || legitKind === 'traffic';
  // 企业账户没有令牌，也就没有请求摘要
  const task = ent ? '' : pick(kind === 'api' ? API_TASKS : CHAT_TASKS);
  const scope = TASK_SCOPES[task] || pick(SCOPES);
  const pool = ASSETS.avatars.filter((a) => !wanted.includes(a));
  const wi = flaw === 'wanted' ? rint(0, wanted.length - 1) : -1;
  const avatar = wi >= 0 ? wanted[wi] : pick(pool), handle = pick(NAMES), ip = ipv4();
  const day = (a, b) => fmtDate(addDays(today, rint(a, b)));
  // 企业账户的凭证地区一定是签发企业的所在地区
  const region = corp ? corp.region : flaw === 'region'
    ? pick(Object.keys(REGION_LOCALE).filter((r) => !rs.regions.includes(r)))
    : rs.voucher
      ? (foreign ? pick(foreignRegions) : pick(homeRegions))
      : pick(rs.regions);
  const [lang, tz] = REGION_LOCALE[region] || ['en-US', 'UTC+00:00'];
  const cred = { photo: avatar, IP: ip, 昵称: handle, 地区: region, 套餐: pick(PLANS), 有效期: day(20, 900), sig: rs.sig ? genuine('cred') : null };
  const tok = rs.tok && !ent
    ? { IP: ip, 运营商: ispOf(region), 语言: lang, 时区: tz, 签发: day(-3, 0), 有效期: day(0, 6) }
    : null;
  const api = kind === 'api' ? {
    IP: ip, 用途: flaw === 'scope' ? pick(SCOPES.filter((s) => s !== scope)) : scope,
    有效期: day(5, 300), sig: genuine('api'),
  } : null;
  // 请求券只登记有效期；无券的外国请求（no_voucher）不生成这张证件
  const voucher = foreign && flaw !== 'no_voucher' ? { 有效期: day(0, 120) } : null;
  // 难度 2：审查窗显示本次请求的使用设备和请求流量（企业请求也显示，只是没有环境信息卡可对照）
  const device = rs.env ? pick(DEVICES) : null;
  const avgFlow = rint(8, 60);
  const flow = rs.env ? Math.max(1, Math.round(avgFlow * (0.7 + Math.random() * 0.7))) : null;
  const env = rs.env && !ent ? { 时区: tz, 常用设备: device, 平均流量: fmtFlow(avgFlow) } : null;
  // 企业授权：授权企业是另外 0–2 家企业，再插进 Anthrotzka（ent_auth 偏偏少了它）；签发企业自己不列。
  // DeepThink 一定是 ent_auth，所以它的授权企业必定不含 Anthrotzka。
  let entDoc = null;
  if (corp) {
    const others = CORPS.filter((c) => c !== corp && c.name !== HOST_CORP).map((c) => c.name);
    const list = [];
    for (let n = flaw === 'ent_auth' ? rint(1, 3) : rint(0, 2); list.length < n;) list.push(pick(others.filter((o) => !list.includes(o))));
    if (flaw !== 'ent_auth') list.splice(rint(0, list.length), 0, HOST_CORP);
    entDoc = { 企业: corp.name, 账号: handle, IP: ip, 授权企业: list.join(', ') };
  }
  const docs = { cred, tok, api, voucher, env, ent: entDoc };
  const spec = {
    avatar, handle, ip, kind, typeLabel: ent ? '企业请求' : kind === 'api' ? 'API 调用' : '对话',
    device, flow: flow && fmtFlow(flow),
    task, greet: pick(GREETS), ent: corp ? corp.key : null,
    flaw, issues: [], notes: new Map(), checks: new Set(), confirms: new Set(), reason: '', legit: legitKind,
  };
  const issue = (pairs, title, sub, type = flaw) => spec.issues.push({ pairs, title, sub, type, ask: pick(EXCUSES[type]) });
  // 没有矛盾、但也不是单纯「一致」的审查结果（例如外国请求持有效请求券）
  const note = (a, b, title, sub) => spec.notes.set([a, b].sort().join('|'), { title, sub });
  const withDocs = (keys) => pick(keys.filter((k) => docs[k]));
  let voucherExpired = false;

  if (flaw === 'region') {
    issue([['cred.地区', 'rule.region']], '地区不支持', `凭证地区：${cred.地区}`);
    spec.reason = `凭证地区为${cred.地区}，不在支持地区`;
  } else if (flaw === 'no_cred') {
    // 柜台上一张凭证都没有：拿柜台和条例「每个请求需出示凭证」审查
    docs.cred = null;
    issue([['rv.柜台', 'rule.docs']], '凭证缺失', '柜台上没有凭证   本人未出示凭证');
    spec.reason = '未出示凭证';
  } else if (flaw === 'no_tok') {
    // 凭证还在，只少了令牌：同样拿柜台和「个人账户需出示令牌」审查
    docs.tok = null;
    issue([['rv.柜台', 'rule.personal']], '令牌缺失', '柜台上没有令牌   本人未出示令牌');
    spec.reason = '未出示令牌';
  } else if (flaw === 'no_env') {
    // 难度 2：环境信息卡同样拿柜台和「个人账户需出示令牌和环境信息卡」审查
    docs.env = null;
    issue([['rv.柜台', 'rule.personal']], '环境信息卡缺失', '柜台上没有环境信息卡   本人未出示环境信息卡');
    spec.reason = '未出示环境信息卡';
  } else if (flaw === 'ent_auth') {
    // 授权企业一栏没有 Anthrotzka：拿它和「企业账户须出示…」的条例比对，授权书视为无效证件。
    // 企业账户不受地区限制，但 DeepThink 的凭证地区（中国大陆）本来就不在支持地区：
    // 这是两个独立的疑点，各自成为一条 issue，分别询问、分别说明（都只能拒绝）。
    issue([['ent.授权企业', 'rule.ent']], '企业授权无效', `授权企业：${entDoc.授权企业}   不含 ${HOST_CORP}`);
    if (!rs.regions.includes(region)) {
      issue([['cred.地区', 'rule.region']], '地区不支持', `凭证地区：${cred.地区}   不在支持地区`, 'region');
    }
    spec.reason = `企业授权的授权企业不含 ${HOST_CORP}`;
  } else if (idf === 'ent_acct') {
    // 企业授权上的账号差一点：可能是本人的旧账号（合规，档案的曾用名里有它），也可能是冒用。
    // 拿凭证昵称或本人昵称审查都能查出来；和头像 / 昵称一样要先验证 SMS 才分得出来，不能直接拘留
    entDoc.账号 = nameVariant(handle);
    issue([['ent.账号', 'cred.昵称'], ['ent.账号', 'rv.昵称']], '账号不符', `本人 ${handle}   VS   企业授权 ${entDoc.账号}`, 'ent_acct');
    spec.nameField = 'ent.账号';
    spec.reason = '企业授权上的账号与本人不符';
  } else if (flaw === 'ent_fake') {
    // 横幅上的企业名称或图标是山寨的：拿横幅和手册的企业名录比对；授权企业一栏照常写着 Anthrotzka
    const [banner, sub] = forgedCorp(corp);
    entDoc.banner = banner;
    issue([['ent.企业', 'book.ent']], '企业授权伪造', sub);
    spec.reason = `企业授权是伪造的（${sub}）`;
  } else if (flaw === 'no_voucher') {
    // 凭证地区在支持地区内（非本国）才需要请求券；柜台上没有券也可以直接拿柜台和条例审查
    issue([['cred.地区', 'rule.voucher'], ['rv.柜台', 'rule.voucher']], '缺少请求券', `请求来自${cred.地区}，未出示请求券`);
    spec.reason = `外国请求（${cred.地区}）未出示请求券`;
  } else if (idf === 'photo') {
    cred.photo = pick(pool.filter((a) => a !== avatar));
    issue([['cred.照片', 'rv.头像']], '头像不符', '凭证上的头像   VS   本人的头像', 'photo');
    spec.reason = '凭证头像与本人不符';
  } else if (idf === 'device') {
    // 本次请求用的不是常用设备：冒用者（flaw）或本人换了设备（合规），验证 SMS 才分得出来
    env.常用设备 = pick(DEVICES.filter((d) => d !== device));
    issue([['rv.设备', 'env.常用设备']], '设备不符', `使用设备 ${device}   VS   常用设备 ${env.常用设备}`, 'device');
    spec.reason = '使用设备与常用设备不符（冒用）';
  } else if (tfx) {
    // 请求流量是平均流量的好几倍：请求嗅探看后台进程，特殊进程（flaw）可以拘留，正常进程（合规）应放行
    spec.flow = fmtFlow(avgFlow * rint(5, 12));
    issue([['rv.流量', 'env.平均流量']], '流量异常', `请求流量 ${spec.flow}   VS   平均流量 ${env.平均流量}`, 'traffic');
    const bad = flaw === 'traffic';
    const [bg, what] = bad ? pick(SPECIAL_PROCS) : [pick(NORMAL_PROCS), '正常进程'];
    spec.sniff = { flow: spec.flow, fg: pick(FG_PROCS), bg, what };
    // 后台进程对照手册条例「不得运行爬虫或自动化脚本」：认不得的奇怪进程才算特殊进程
    const pairs = [['sniff.后台进程', 'rule.crawler']];
    if (bad) issue(pairs, '发现特殊进程', `后台进程 ${bg}（${what}）`, 'proc');
    else pairs.forEach(([a, b]) => note(a, b, '无特殊进程', `后台进程 ${bg}，未运行爬虫或自动化脚本`));
    spec.reason = `请求流量异常，后台开着特殊进程 ${bg}（${what}）`;
  } else if (flaw === 'ip') {
    const k = withDocs(['cred', 'tok', 'api', 'ent']);
    docs[k].IP = ipVariant(ip);
    const others = ['rv.IP'];
    for (const x of ['cred', 'tok', 'api', 'ent']) if (x !== k && docs[x]) others.push(`${x}.IP`);
    issue(others.map((o) => [`${k}.IP`, o]), 'IP 不符', `本人 ${ip}   VS   ${DOC_NAMES[k]} ${docs[k].IP}`);
    spec.reason = `${DOC_NAMES[k]}上的 IP 与本人不符`;
  } else if (idf === 'name') {
    // API 授权不再登记持有人，昵称只能落在凭证上
    cred.昵称 = nameVariant(handle);
    issue([['cred.昵称', 'rv.昵称']], '昵称不符', `本人 ${handle}   VS   凭证 ${cred.昵称}`, 'name');
    spec.nameField = 'cred.昵称';
    spec.reason = '凭证上的昵称与本人不符';
  } else if (flaw === 'exp') {
    const keys = ['cred', 'tok', 'tok', 'api'];
    if (docs.voucher) keys.push('voucher', 'voucher', 'voucher');
    const k = withDocs(keys);
    docs[k].有效期 = day(-40, -1);
    if (k === 'tok') tok.签发 = fmtDate(addDays(today, -rint(41, 60)));
    const pairs = [[`${k}.有效期`, 'sys.日期'], [`${k}.有效期`, 'notice.date'], [`${k}.有效期`, 'rule.date']];
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
    issue([['tok.签发', 'sys.日期'], ['tok.签发', 'notice.date']], '签发日期未到', `令牌签发 ${tok.签发}   VS   系统日期 ${fmtDate(today)}`, 'future');
    spec.reason = '令牌的签发日期晚于当前日期（伪造证件）';
  } else if (flaw === 'locale') {
    // 令牌上的语言 / 时区必须和凭证地区一致；只审查真的印出来的栏位（令牌目前只印语言，难度 2 的时区印在环境信息卡上）
    const langs = Object.values(REGION_LOCALE).map((v) => v[0]);
    const tzs = Object.values(REGION_LOCALE).map((v) => v[1]);
    const tzDoc = tokRows.includes('时区') ? 'tok' : 'env';
    const canLang = tokRows.includes('语言'), canTz = !!docs[tzDoc];
    const which = canLang && canTz ? pick(['lang', 'tz', 'both']) : canLang ? 'lang' : 'tz';
    const pairs = [];
    let sub = `凭证地区：${cred.地区}`;
    if (which !== 'tz') {
      tok.语言 = pick(langs.filter((l) => l !== lang));
      pairs.push(['tok.语言', 'cred.地区'], ['tok.语言', 'rule.locale'], ['tok.语言', 'rule.region']);
      sub += `   令牌语言：${tok.语言}`;
    }
    const tzName = DOC_NAMES[tzDoc];
    if (which !== 'lang') {
      docs[tzDoc].时区 = pick(tzs.filter((t) => t !== tz));
      pairs.push([`${tzDoc}.时区`, 'cred.地区'], [`${tzDoc}.时区`, 'rule.locale'], [`${tzDoc}.时区`, 'rule.region']);
      sub += `   ${tzName}时区：${docs[tzDoc].时区}`;
    }
    const title = which === 'both' ? '语言和时区与地区不符' : which === 'lang' ? '语言与地区不符' : '时区与地区不符';
    issue(pairs, title, sub);
    spec.reason = which === 'both'
      ? `${tzDoc === 'tok' ? '令牌的语言 / 时区' : '令牌语言与环境信息卡时区'}与凭证地区（${cred.地区}）不符`
      : which === 'lang' ? `令牌语言（${tok.语言}）与凭证地区（${cred.地区}）不符`
        : `${tzName}时区（${docs[tzDoc].时区}）与凭证地区（${cred.地区}）不符`;
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
    const [s, sub] = forged(k);
    docs[k].sig = s;
    // 凭证的签发机构和签名也印在通告第 1 页底部（只是印着，审查签名要对规则手册的「签名详情」页）
    issue([[`${k}.签名`, `book.${k}`]], '签名不合法', sub);
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

  // 验证 SMS：身份记录（按凭证查到的账户）上的手机号和曾用名。冒用者报的号码差一位，证件昵称 / 企业账号也不在曾用名里
  if (idf) {
    const phone = phoneNum(region);
    const docName = spec.nameField ? docs[spec.nameField.split('.')[0]][spec.nameField.split('.')[1]] : null;
    const others = NAMES.filter((n) => n !== handle && n !== docName);
    // 曾用名：只有涉及昵称 / 企业账号不一致时才会出现；改过昵称 / 换过企业账号的合规请求一定留着旧昵称。其余一律印「无」
    let names;
    if (!docName) names = [];
    else if (spec.legit) names = [docName, pick(others)];
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
      const what = spec.nameField === 'ent.账号' ? '企业账号' : '证件昵称';
      if (spec.legit) spec.confirms.add(namePair.sort().join('|'));
      else issue([namePair], '不是曾用名', `${what}不在档案的曾用名中`, 'oldname');
    }
  }

  // 审查：哪些栏位组合本来就有可核对的关系（和这一单有没有毛病无关）
  const pair = (a, b) => spec.checks.add([a, b].sort().join('|'));
  if (idf) pair('rv.昵称', 'sms.昵称');
  if (spec.sniff) { pair('sniff.请求流量', 'rv.流量'); pair('sniff.请求流量', 'env.平均流量'); }
  // 使用设备 / 请求流量对照环境信息卡上的常用设备 / 平均流量
  if (docs.env) { pair('rv.设备', 'env.常用设备'); pair('rv.流量', 'env.平均流量'); }
  // 柜台 ↔ 条例「每个请求需出示凭证」：递上凭证就是无矛盾，空柜台就是凭证缺失。
  // 柜台 ↔ 条例「个人账户需出示令牌（和环境信息卡）」：企业账户只出示凭证和企业授权，
  // 注明不需要令牌和环境信息卡
  if (ruleKeys.has('docs')) pair('rv.柜台', 'rule.docs');
  if (ruleKeys.has('personal')) {
    if (corp) note('rv.柜台', 'rule.personal', '企业账户', '已出示凭证和企业授权   无需令牌和环境信息卡');
    else pair('rv.柜台', 'rule.personal');
  }
  if (docs.cred) {
    pair('cred.照片', 'rv.头像');
    // 企业账户不受地区限制；DeepThink 的授权一律无效，地区矛盾由另一个独立的 region issue 接手
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
    // 难度 2：时区印在环境信息卡上
    if (docs.env) {
      pair('env.时区', 'cred.地区');
      pair('env.时区', 'rule.locale');
      pair('env.时区', 'rule.region');
    }
  }
  // 企业授权：账号 / IP 对本人和凭证；授权企业一栏对「企业账户须出示…」；签发企业在企业名录里，所在地区就是凭证地区
  if (docs.ent) {
    pair('ent.账号', 'cred.昵称');
    pair('ent.账号', 'rv.昵称');
    pair('ent.IP', 'rv.IP');
    pair('ent.企业', 'book.ent');
    pair('ent.企业', 'cred.地区');
    pair('cred.地区', 'book.ent');
    pair('ent.授权企业', 'rule.ent');
    pair('rv.柜台', 'rule.ent');
  }
  // 运营商：主要城市属于凭证地区。合规请求一定对得上（无矛盾）；只有 isp 问题会印成别处的运营商
  if (docs.cred && docs.tok && tokRows.includes('运营商') && docs.tok.运营商) {
    pair('tok.运营商', 'cred.地区');
    if (rs.rules.some((r) => r.key === 'isp')) pair('tok.运营商', 'rule.isp');
  }
  // 通告第 1 页的公告日期可以拿来核对证件有效期（和任务栏的系统日期用法一样）；
  // 公告日期和系统日期之间没有可核对的关系（互查显示「无关联」）
  wanted.forEach((_, i) => { pair('rv.头像', `notice.wanted${i}`); if (docs.cred) pair('cred.照片', `notice.wanted${i}`); });
  const hasIssuedRule = rs.rules.some((r) => r.key === 'issued');
  for (const k of ['cred', 'tok', 'api']) {
    if (!docs[k]) continue;
    pair(`${k}.有效期`, 'sys.日期');
    pair(`${k}.有效期`, 'notice.date');
    pair(`${k}.有效期`, 'rule.date');
    if (k === 'tok' && docs[k].签发 && hasIssuedRule) { pair('tok.签发', 'sys.日期'); pair('tok.签发', 'notice.date'); }
    // 手册有「签名详情」页时，签名才有手册上的式样可审查（故事模式没有这一页，签名不参与审查）
    if (docs[k].sig && rs.seals) pair(`${k}.签名`, `book.${k}`);
    pair(`${k}.IP`, 'rv.IP');
    if (k !== 'cred' && docs.cred) pair(`${k}.IP`, 'cred.IP');
  }
  if (docs.voucher) {
    pair('voucher.有效期', 'sys.日期');
    pair('voucher.有效期', 'notice.date');
    pair('voucher.有效期', 'rule.date');
    pair('voucher.有效期', 'rule.voucher');
  }
  // 请求券也看柜台：外国请求的券就该在柜台上；没带券时由上面的 issue 接手
  if (foreign) pair('rv.柜台', 'rule.voucher');
  const ipDocs = ['cred', 'tok', 'api', 'ent'].filter((k) => docs[k]);
  for (let i = 0; i < ipDocs.length; i++) {
    for (let j = i + 1; j < ipDocs.length; j++) pair(`${ipDocs[i]}.IP`, `${ipDocs[j]}.IP`);
  }
  // 请求摘要印在令牌上：令牌与历史记录里本人说的话是同一段请求内容
  if (docs.tok) pair('tok.请求', 'hist.请求');
  if (docs.api) {
    // 没有令牌时看不到摘要、本人也不会说明来意，没有可核对的请求内容
    if (docs.tok) { pair('api.用途', 'tok.请求'); pair('api.用途', 'hist.请求'); }
  }
  if (kind === 'api') pair('rv.类型', 'rule.api');

  // 请求摘要印在令牌上：令牌真的交出来（docs.tok 没有被 no_tok 清掉）才看得到，本人也才会说明来意。
  // 企业请求没有令牌，也就不显示请求概述。
  spec.taskOnTok = !!docs.tok && !spec.ent;

  // 凭证缺失时柜台上没有凭证：临时返回页由 station.js 在询问「凭证缺失」之后才派发到桌面
  spec.docs = [];
  if (docs.cred) spec.docs.push(new Doc('cred', rs.credRows.map((k) => [k, cred[k]]), cred.sig, cred.photo));
  if (docs.voucher) spec.docs.push(new Doc('voucher', [['有效期', docs.voucher.有效期]], null));
  // 令牌上多印一栏请求摘要（第三项 true = 太长就折行），没有令牌时审查窗也看不到摘要
  if (docs.tok) spec.docs.push(new Doc('tok', tokRows.map((k) => [k, docs.tok[k]]).concat([['请求', task, true]]), null));
  if (docs.env) spec.docs.push(new Doc('env', ENV_ROWS.map((k) => [k, docs.env[k]]), null));
  if (docs.api) spec.docs.push(new Doc('api', ['IP', '用途', '有效期'].map((k) => [k, docs.api[k]]), docs.api.sig));
  // 企业授权：顶部横幅印签发企业的图标和名称（审查栏位 ent.企业），授权企业太长就折行
  if (docs.ent) {
    const d = new Doc('ent', [['账号', docs.ent.账号], ['IP', docs.ent.IP], ['授权企业', docs.ent.授权企业, true]], null);
    d.corp = corp.key;
    if (docs.ent.banner) d.fake = docs.ent.banner;
    spec.docs.push(d);
  }
  return spec;
}
