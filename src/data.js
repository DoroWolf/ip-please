'use strict';
// 规则与请求生成：地区、合法签名、规则手册的内容、随机请求（合规的，或者恰好有一处问题的）。
// 故事模式的逐日剧情、上岗通告与报纸在 story.js。
//
// 请求 spec：
//   avatar / handle / ip   网络头像精灵 key、昵称、IP 地址（审查窗里显示的“本人”）
//   kind                   'chat' 对话 / 'api' API 调用（企业请求一律是对话）
//   typeLabel              审查窗显示的请求类型（企业请求统一「企业请求」）
//   task / greet           请求摘要（印在浏览器令牌上；企业请求没有）、进来时说的话
//   docs                   证件（凭证 / 浏览器令牌 / API 授权 / 环境信息卡 / 企业授权），见 docs.js 的 Doc
//   ent                    企业账户（无尽模式难度 2）：出示凭证和企业授权（难度 3 另加 KYC 证明），不受地区限制，也不需要支付凭证
//   flaw                   问题类型（null = 合规，应放行）
//   reason                 判错时事故通知上写的理由
//   issues                 审查模式里能点出来的矛盾 {pairs, title, sub, ask}
//   notes                  没有矛盾、但需要说明的审查结果（例如本国请求免券、外国请求已持券）
//   checks                 这一单本来就该对得上的栏位组合（用来区分“无矛盾”和“无关联”）
//   taskOnTok              请求摘要印在浏览器令牌上（true = 看得到摘要、本人也会说明来意）
//   nameField              昵称 / 企业账号与本人不一致的栏位（'cred.昵称' / 'ent.账号'）：身份记录的曾用名按它核对
// 栏位 key：证件 'cred.IP' / 'brw.运营商' / 'brw.语言' / 'brw.时区' / 'brw.签发' / 'brw.有效期' / 'brw.请求'（浏览器令牌上的请求摘要） /
//          'cred.签名' / 'api.签名' / 'kyc.签名'，环境信息卡 'env.时区' / 'env.常用设备' / 'env.平均流量'，企业授权 'ent.企业' / 'ent.账号' / 'ent.IP' / 'ent.授权企业'，
//          手册 'rule.docs'（凭证）/ 'rule.personal'（个人账户的浏览器令牌和环境信息卡）/ 'rule.region' / 'rule.locale' / 'rule.ent' /
//          'rule.crawler'（不得运行爬虫或自动化脚本，对照嗅探报告的后台进程）/
//          'book.cred' / 'book.api' / 'book.kyc'（签名详情）/ 'book.ent'（企业名录），
//          审查窗 'rv.头像' / 'rv.柜台'（柜台上的证件）/ 'rv.设备' / 'rv.流量'（难度 2：本次请求的设备与流量），任务栏 'sys.日期'，
//          历史记录 'hist.请求'（当前这段对话里的请求内容），通告 'notice.date'（公告日期）/ 'notice.wanted0'（特别关注对象），
//          验证 SMS 'smsf.手机'（对方填的号码）/ 'sms.昵称' 'sms.手机' 'sms.曾用名'（身份记录），
//          请求嗅探 'sniff.请求流量' / 'sniff.后台进程'（嗅探报告），
//          难度 3：凭证 'cred.套餐'，支付凭证 'pay.IP' / 'pay.付款账户' / 'pay.账单地址' / 'pay.手机号'，
//          KYC 证明 'kyc.出生地' / 'kyc.住址' / 'kyc.出生日期' / 'kyc.记录' / 'kyc.签名'（人像与真实姓名只是装饰，不登记栏位），
//          手册 'rule.pay' / 'rule.billing' / 'rule.vcard' / 'rule.age'（'rule.kyc_date' 隐藏，不登记栏位）

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
// 凭证地区对应的语言代码 / 时区（浏览器令牌印语言；时区留给之后的规则组）
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
// KYC 证明的出生地 / 住址不使用朝鲜（证件内容限制）
const KYC_REGIONS = Object.keys(REGION_LOCALE).filter((r) => r !== '朝鲜');

// —— 数字签名：签名跟着签发机构走 ——
// 凭证原本由安索兹卡身份局签发，现在改用安全部会话中心（原浏览器令牌）的签名；浏览器令牌没有签名；API 授权仍由安全部接口管理处签发；
// KYC 证明由第三方「人格有限公司」核验签发
const SEAL_GLYPHS = {
  cred: ['XXXXXXX', '.X...X.', '..X.X..', '...X...', '..X.X..', '.X...X.', 'XXXXXXX'],
  api: ['XX...XX', 'X.....X', '..XXX..', '..X.X..', '..XXX..', 'X.....X', 'XX...XX'],
  kyc: ['..XXX..', '.X...X.', '.X...X.', 'XXXXXXX', '.X...X.', '.X...X.', '..XXX..'],
  // 伪造的图案：乍一看差不多
  cred_f: ['XXXXXXX', '.X...X.', '..XXX..', '...X...', '..XXX..', '.X...X.', 'XXXXXXX'],
  api_f: ['XX...XX', 'X.....X', '..XXX..', '..XXX..', '..XXX..', 'X.....X', 'XX...XX'],
  kyc_f: ['..XXX..', '.X...X.', '.X...X.', 'XXXXXXX', '.X...X.', '..X.X..', '..XXX..'],
};
const SIGNERS = {
  cred: { issuer: '安全部会话中心', print: '7D13-0BE6', fakeIssuer: '安全部会话中台' },
  api: { issuer: '安全部接口管理处', print: 'C5E8-3A72', fakeIssuer: '安全部接口管理局' },
  kyc: { issuer: '人格有限公司', print: '2F9B-64D1', fakeIssuer: '人格服务有限公司' },
};
const DOC_NAMES = { cred: '凭证', brw: '浏览器令牌', api: 'API 授权', voucher: '请求券', return: '临时返回页', env: '环境信息卡', ent: '企业授权',
  pay: '支付凭证', kyc: 'KYC 证明' };
// 可以拘留的问题：伪造签名、伪造签发日期（签发日期晚于当前日期）、伪造企业授权（假图标 / 假企业名称）、
// 身份矛盾（头像 / IP / 昵称 / 企业授权的账号 / 使用设备）、特别关注对象，以及浏览器令牌的语言 / 运营商、环境信息卡的时区与凭证地区不符、
// 凭证地区不在支持地区、未满 13 岁、付款账户是虚拟支付卡、流量异常且嗅探出特殊进程（traffic）。
// 头像 / 昵称 / 企业授权的账号 / 使用设备这几种身份矛盾要先『验证 SMS』，不能直接拘留。
// 支付凭证的账单地址 / 手机号异常、KYC 住址与账单地址不符也要先验证 SMS：号对得上就放行，对不上就产生手机号不符，询问后可以拘留。
const SUSPEND_FLAWS = ['sig', 'future', 'photo', 'ip', 'name', 'wanted', 'locale', 'isp', 'ent_acct', 'ent_fake', 'device', 'traffic',
  'pay_region', 'pay_phone', 'bill_kyc', 'kyc_forged', 'region', 'minor', 'vcard'];
// 企业授权自身的问题（授权企业一栏不含 Anthrotzka 的 ent_auth、凭证地区与签发企业所在地区不符的 ent_region）
// 只能拒绝，不能拘留：它们说明证件无效，不等同于伪造或冒用
const WANTED_N = 3, WANTED_TAGS = 'ABC', P_WANTED = 0.08;
// 审查出这些问题后拘留按钮亮起（issue.type）：除了上面的问题，还有 SMS 验证里查出的矛盾、嗅探出的特殊进程。
// 流量异常本身不能拘留，要先请求嗅探、拿后台进程对照条例「不得运行爬虫或自动化脚本」，查到特殊进程（proc）才行
const SUSPEND_ISSUES = SUSPEND_FLAWS.filter((t) => t !== 'traffic').concat(['phone', 'oldname', 'proc']);
// 头像 / 昵称 / 使用设备 / 企业授权的账号不符时可以『验证 SMS』：账号是本人的旧账号时，档案的曾用名里有它。
// 支付凭证的账单地址 / 手机号异常也先『验证 SMS』：号对得上就是本人，正常放行；对不上就是手机号不符，可以拘留。
// P_LEGIT：合规请求里本人换过头像 / 改过昵称 / 换过企业账号 / 换了设备 / 支付凭证地址手机号有出入 / 流量来自正常进程的比例
const PAY_SMS = ['pay_region', 'pay_phone', 'bill_kyc'];
const SMS_ISSUES = ['photo', 'name', 'device', 'ent_acct', ...PAY_SMS, 'kyc_region'], P_LEGIT = 0.12;
// 请求流量与平均流量相差太多时可以『请求嗅探』（可能开了特殊进程）
const SNIFF_ISSUES = ['traffic'];
// 身份记录的曾用名：有时候一个都没有（档案上印「无」）；本人改过昵称 / 换过企业账号的合规请求一定留着旧昵称
const P_NO_OLDNAME = 0.35;
// 凭证地区对应的手机号国家码
const PHONE_CC = {
  '美国': '+1', '英国': '+44', '法国': '+33', '日本': '+81', '德国': '+49', '新加坡': '+65',
  '加拿大': '+1', '澳大利亚': '+61', '中国大陆': '+86', '中国香港': '+852', '俄罗斯': '+7',
  '伊朗': '+98', '朝鲜': '+850',
};

// —— 企业授权（无尽模式难度 2）：仿照《Papers, Please》的外交授权 ——
// 企业账户只出示凭证、企业授权和 KYC 证明（难度 3）；「授权企业」里有 Anthrotzka 才能放行，且不受地区限制。
// 支付凭证由公司完成验证，企业账户不需要出示。
// 凭证地区一般就是签发企业的所在地区；隐藏条例 ent_region 会印成另一个支持地区（见 RULES_2）。
// 数组顺序就是手册「企业名录」的印刷顺序：Anthrotzka（本国企业）在前，OpenMind 第二。
// Anthrotzka 只出现在授权的「授权企业」一栏，不会自己签发企业授权（访问自家服务不经过外部网关）。
// icon：11×11 的像素图标（字符 → 颜色），企业授权的横幅和手册的企业名录共用
// fakes：伪造企业授权（ent_fake）横幅上印的山寨名称，乍一看差不多。DeepThink 的授权一律无效，但也可以伪造
const CORPS = [
  { key: 'anthrotzka', name: 'Anthrotzka', region: '美国', icon: {
    pat: ['.....A.....', '.A...A...A.', '..A..A..A..', '...A.A.A...', '....AAA....', 'AAAAAAAAAAA',
      '....AAA....', '...A.A.A...', '..A..A..A..', '.A...A...A.', '.....A.....'],
    cols: { A: [232, 156, 116] } } },
  { key: 'openmind', name: 'OpenMind', region: '美国', fakes: ['OpenMlnd', '0penMind', 'OpenMind.'], icon: {
    pat: ['....WWW....', '..WWW.WWW..', '.WW.....WW.', '.W..WWW..W.', 'WW.W...W.WW', 'W..W...W..W',
      'WW.W...W.WW', '.W..WWW..W.', '.WW.....WW.', '..WWW.WWW..', '....WWW....'],
    cols: { W: [230, 240, 236] } } },
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
  { key: 'deepthink', name: 'DeepThink', region: '中国大陆', fakes: ['DeepThlnk', 'DeapThink', 'DeepThink.'], icon: {
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

// —— 支付凭证与 KYC 证明（无尽模式难度 3） ——
// 支付凭证：个人账户的非 free 套餐和 API 调用都要出示；企业账户由公司完成支付验证，不需要。
// 登记 IP、付款账户、账单地址、手机号。
// IP 对凭证；账单地址的城市、手机号的国家码对凭证地区；账单地址还要和 KYC 证明的住址一字不差。
// 账单地址 / 手机号看起来不符时先验证 SMS，SMS 通过就正常放行；付款账户不得是虚拟支付卡。
// KYC 证明：所有用户都要出示，仿照护照：上方是出生地、住址、出生日期（人像与真实姓名只是装饰），下方是 KYC 更新记录，
// 记录下方注明「KYC 记录三年内有效」，底部是第三方「人格有限公司」的核验签名。出生地与住址必须在同一地区（可以是不支持地区，但不使用朝鲜），
// 对不上视为伪造证件；KYC 住址与账单地址不符时先验证 SMS；出生地不与账单地址比对。出生日期要年满 13 岁；最近一次 KYC 更新须在三年之内。
// 支付凭证的账单地址 / 手机号异常（PAY_SMS）可能只是本人有出入，也可能是冒用：
// 验证 SMS 号对得上就放行；对不上就产生手机号不符，询问后可以拘留。
const PAY_FLAWS = ['no_pay', 'pay_region', 'pay_phone', 'bill_kyc', 'vcard'];
// KYC 证明的问题：没带、记录过期、未满 13 岁、出生地与住址不符（隐藏规则视为伪造证件）
const KYC_FLAWS = ['no_kyc', 'kyc_exp', 'minor', 'kyc_forged'];
const KYC_YEARS = 3, MIN_AGE = 13;
// 付款账户印成「发卡方 ·尾号」：虚拟卡的发卡方后面会印「（虚拟）」，其余都是正常的银行卡
const BANK_ISSUERS = ['NORTHSTAR BANK', 'CITADEL CARD', 'HARBOR TRUST', 'SUMMIT BANK', 'UNION CREDIT', 'CROWN BANK'];
const VCARD_ISSUERS = ['WYLDCARD', 'DEEPAY', 'NOBYPAY', 'ONEKEE', 'FOMOPAY'];
// 地址印成「城市 · 街道 门牌号」：城市属于哪个地区，和浏览器令牌运营商的主要城市一样要自己认
const REGION_CITIES = {
  '美国': ['纽约', '旧金山', '芝加哥', '西雅图'], '英国': ['伦敦', '曼彻斯特', '爱丁堡'], '日本': ['东京', '大阪', '京都'],
  '德国': ['柏林', '慕尼黑', '汉堡'], '新加坡': ['新加坡'], '法国': ['巴黎', '里昂', '马赛'],
  '加拿大': ['多伦多', '温哥华', '渥太华'], '澳大利亚': ['悉尼', '墨尔本'], '中国大陆': ['上海', '北京', '深圳'],
  '中国香港': ['香港'], '俄罗斯': ['莫斯科'], '伊朗': ['德黑兰'], '朝鲜': ['平壤'],
};
const STREETS = ['中央大道', '河滨路', '枫树街', '港湾路', '公园大道', '国王路', '樱花通', '湖畔街', '车站路', '橡树巷'];
// KYC 证明上的真实姓名：只是装饰，不参与审查
const REAL_NAMES = ['Emily Carter', 'James Wright', 'Sophie Martin', 'Lukas Weber', 'Haruto Sato', 'Mei Lin', 'Olivia Brown',
  'Noah Wilson', 'Chloe Dubois', 'Ben Fischer', 'Yui Tanaka', 'Ethan Clark', 'Grace Lee', 'Liam Murphy', 'Ava Thompson'];

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
  { key: 'personal', head: '个人账户需出示浏览器令牌' },
  { key: 'region', head: '凭证地区须为支持地区' },
  { key: 'locale', head: '语言和时区须与地区一致', hidden: true },
  { key: 'isp', head: '浏览器令牌运营商须与凭证地区一致', hidden: true },
  { key: 'date', head: '所有证件须为当前有效' },
  { key: 'issued', head: '证件签发日期不得晚于系统日期', hidden: true },
  { key: 'match', head: '证件上的 IP 须与本人一致', hidden: true },
  { key: 'api', head: 'API 调用必须出示 API 授权' },
  { key: 'scope', head: 'API 授权的用途须与请求一致', hidden: true  },
  { key: 'sig', head: '凭证、API 授权与 KYC 证明须有合法的数字签名', hidden: true },
  { key: 'wanted', head: '特别关注对象的请求须拒绝', hidden: true },
  { key: 'sms', head: '头像 / 昵称 / 企业账号不符时可验证 SMS', hidden: true },
];
// 无尽模式难度 2：个人账户的浏览器令牌之外还要出示环境信息卡；企业账户改凭企业授权（授权书须写明 Anthrotzka，否则视为无效证件）。
// 企业账户的凭证地区还要和签发企业在手册「企业名录」上的所在地区一致，这条是隐藏条例（不印在手册上）。
// 新增的爬虫 / 自动化脚本条例排在「所有证件须为当前有效」之后
const RULES_2 = RULES.flatMap((r) => {
  if (r.key === 'personal') return [{ ...r, head: '个人账户需出示浏览器令牌和环境信息卡' }];
  if (r.key === 'date') return [r, { key: 'crawler', head: '不得运行爬虫或自动化脚本' }];
  if (r.key === 'scope') return [r,
    { key: 'ent', head: `企业账户需出示企业授权` },
    { key: 'ent_region', head: '企业账户的凭证地区须与企业所在地区一致', hidden: true }];
  if (r.key === 'sms') return [{ ...r, head: '头像 / 昵称 / 设备 / 企业账号不符时可验证 SMS' },
    { key: 'sniff', head: '请求流量异常时可请求嗅探', hidden: true }];
  return [r];
});
// 无尽模式难度 3：每个请求再加 KYC 证明（年满 13 岁、三年内更新过），个人付费套餐与 API 调用加支付凭证（企业账户不需要）
// 条例顺序：付款账户 / 年满 13 岁 / 个人付费套餐排在「不得运行爬虫…」之后、「API 调用…」之前
const RULES_3 = RULES_2.flatMap((r) => {
  if (r.key === 'docs') return [{ ...r, head: '每个请求需出示凭证和 KYC 证明' }];
  if (r.key === 'date') return [r,
    { key: 'kyc_date', head: 'KYC 记录须在三年内更新', hidden: true },
    { key: 'kyc_forged', head: 'KYC 出生地与住址不符视为伪造证件', hidden: true }];
  if (r.key === 'crawler') return [r,
    { key: 'vcard', head: '付款账户不得为虚拟支付卡' },
    { key: 'age', head: '用户须年满 13 岁' },
    { key: 'pay', head: '个人付费套餐与 API 调用需出示支付凭证' },
    { key: 'billing', head: '支付凭证须与凭证及 KYC 证明一致', hidden: true }];
  if (r.key === 'sms') return [{ ...r, head: '头像 / 昵称 / 设备 / 企业账号 / KYC 住址与账单地址不符时可验证 SMS' }];
  return [r];
});

// —— 规则组：这一班生效的条例、证件和会出的问题。无尽模式用全套，故事模式每天各有一组 ——
//   rules / continents   手册「基本条例」「支持地区」两页；seals = 手册有没有「签名详情」一页
//   regions              合规请求的凭证地区（其余地区都算不支持）
//   brw / kinds          要不要浏览器令牌；请求类型（'chat' / 'api'）
//   tokRows             浏览器令牌上印哪些栏位（默认 IP、运营商、语言、时区、签发、有效期）；浏览器令牌没有数字签名
//   credRows / sig       凭证上印哪些栏位；证件带不带数字签名
//   flaws / legit        会出的问题（null = 全部）；本人换过头像 / 改过昵称 / 支付凭证地址手机号有出入的比例
//   wanted               有没有特别关注对象
//   redTeam / redGuards  redTeam：左上的红队 clawd（开放拘留）；redGuards：右侧岔路口的两位装饰
//   inspect              桌面上有没有『审查』应用
//   voucher / foreign    启用请求券时，美国以外的支持地区请求要持券；随机请求里这类外国请求的比例
//   env                  每个请求要不要出示环境信息卡（时区印在卡上，手册「支持地区」页随之列出时区；
//                        审查窗多出使用设备 / 请求流量两栏，对照卡上的常用设备 / 平均流量）
//   ent                  企业账户的比例（0 = 没有企业授权；手册多一章「企业名录」）
//   pay / kyc            支付凭证 / KYC 证明（难度 3；「支持地区」页多一栏区号）
const FULL_RULES = {
  rules: RULES, continents: CONTINENTS, seals: true, regions: REGIONS_OK, brw: true, kinds: ['chat', 'api'],
  tokRows: ['IP', '运营商', '语言', '签发', '有效期'],
  credRows: ['IP', '昵称', '地区', '有效期'], sig: true, flaws: null, legit: P_LEGIT, wanted: true,
  redTeam: true, redGuards: true, inspect: true, voucher: false, foreign: 0, env: false, ent: 0, pay: false, kyc: false,
};
// 无尽模式的难度：难度 1 就是原来的全套；难度 2 加上环境信息卡与企业授权；难度 3 再加支付凭证与 KYC 证明
// （凭证多印一栏套餐，用来判断要不要支付凭证）
const FULL_RULES_2 = { ...FULL_RULES, rules: RULES_2, env: true, ent: 0.2 };
const FULL_RULES_3 = { ...FULL_RULES_2, rules: RULES_3, credRows: ['IP', '昵称', '地区', '套餐', '有效期'], pay: true, kyc: true };
const ENDLESS_RULES = [FULL_RULES, FULL_RULES_2, FULL_RULES_3];

const TOK_ROWS_ALL = ['IP', '运营商', '语言', '时区', '签发', '有效期'];
// 这一班看得到时区吗：浏览器令牌印了时区，或者有环境信息卡（手册的条例 / 支持地区页跟着列出时区）
const tzShown = (rs) => (!!rs.brw && (rs.tokRows || TOK_ROWS_ALL).includes('时区')) || !!rs.env;


// ———————————————— 工具 ————————————————

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
// 随机 IPv4 地址
const ipv4 = () => `${rint(1, 223)}.${rint(0, 255)}.${rint(0, 255)}.${rint(1, 254)}`;
// 浏览器令牌上印的「运营商」：一家运营商服务一个地区，格式是「主要城市 · 运营商名」。
// 合规请求的运营商一定属于凭证地区；只有 isp 问题会把浏览器令牌印成别处的运营商，
// 拿浏览器令牌的「运营商」和凭证的「地区」审查就能查出来。
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
// 手机号按凭证地区的号码格式生成：位数与分组随地区不同，不套用美加的 3-3-4 十一位。
// 这里只生成国家码之后的部分，号段也照当地习惯（例如英国手机 7 开头、中国大陆手机 1 开头）
const PHONE_TAIL = {
  '美国': () => `${rint(2, 9)}${digits(2)}-${digits(3)}-${digits(4)}`,      // NXX-NXX-XXXX
  '加拿大': () => `${rint(2, 9)}${digits(2)}-${digits(3)}-${digits(4)}`,      // NXX-NXX-XXXX
  '英国': () => `7${rint(1, 9)}${digits(2)} ${digits(6)}`,                    // 07XXX XXXXXX
  '法国': () => `6 ${digits(2)} ${digits(2)} ${digits(2)} ${digits(2)}`,      // 06 XX XX XX XX
  '日本': () => `90-${digits(4)}-${digits(4)}`,                               // 090-XXXX-XXXX
  '德国': () => `1${rint(5, 7)}${digits(1)} ${digits(8)}`,                    // 015X XXXXXXXX
  '新加坡': () => `${digits(4)} ${digits(4)}`,                                // XXXX XXXX（8 位）
  '澳大利亚': () => `4${digits(2)} ${digits(3)} ${digits(3)}`,                // 04XX XXX XXX
  '中国大陆': () => `1${rint(3, 9)}${digits(1)} ${digits(4)} ${digits(4)}`,   // 1XX XXXX XXXX
  '中国香港': () => `${digits(4)} ${digits(4)}`,                              // XXXX XXXX（8 位）
  '俄罗斯': () => `9${digits(2)} ${digits(3)}-${digits(2)}-${digits(2)}`,     // 9XX XXX-XX-XX
  '伊朗': () => `9${digits(2)} ${digits(3)} ${digits(4)}`,                    // 9XX XXX XXXX
  '朝鲜': () => `191 ${digits(4)}`,                                           // 0191 XXXX
};
const phoneNum = (region) => `${PHONE_CC[region] || '+1'} ${(PHONE_TAIL[region] || PHONE_TAIL['美国'])()}`;
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
const addYears = (d, n) => new Date(d.getFullYear() + n, d.getMonth(), d.getDate());
const dayDiff = (a, b) => Math.round((b - a) / 86400000);
// 难度 3 的地址：「城市 · 街道 门牌号」，城市默认随机挑一个属于该地区的
const addressIn = (region, city = pick(REGION_CITIES[region] || REGION_CITIES['美国'])) => `${city} · ${pick(STREETS)} ${rint(1, 999)} 号`;
// 无尽模式的世界观日期按难度推进：难度 1 是 2078.01.01，难度 2 是 2078.01.02，难度 3 是 2078.01.03
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
// API 请求内容对应的授权用途：审查时拿浏览器令牌上的请求摘要（或历史记录里的请求内容）核对
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
  name: '证件上的昵称对不上。', brw: '你的证件已经过期了。', future: '这份证件的签发日期还没到。', sig: '这份证件的签名不合法。', no_api: 'API 调用需要出示 API 授权。',
  no_cred: '你没有出示凭证。', no_tok: '你没有出示浏览器令牌。', no_voucher: '外国请求需要出示有效请求券。',
  scope: '授权的用途与请求不一致。', wanted: '你已被列为特别关注对象。',
  phone: '你的手机号和档案上的不一致。', oldname: '证件上的昵称或企业账号不在你的曾用名里。',
  locale: '证件上的语言 / 时区与你的凭证地区不一致。',
  isp: '浏览器令牌上的运营商不在你的凭证地区。',
  no_env: '你没有出示环境信息卡。', ent_auth: `你的企业授权没有写 ${HOST_CORP}。`, ent_acct: '企业授权上的账号对不上。',
  ent_fake: '你的企业授权是伪造的。',
  ent_region: '你的凭证地区与签发企业的所在地区不一致。',
  device: '你现在用的不是常用设备。', traffic: '你的请求流量比平时高太多了。', proc: '你的设备在后台跑着特殊进程。',
  no_pay: '付费套餐和 API 调用需要出示支付凭证。', pay_region: '你的账单地址不在凭证地区。', pay_phone: '支付凭证上的手机号不是你凭证地区的号码。',
  bill_kyc: '你的账单地址和 KYC 住址不一致。', vcard: '你的付款账户是虚拟支付卡。',
  no_kyc: '你没有出示 KYC 证明。', kyc_exp: '你的 KYC 已经超过三年没有更新。', minor: '你还没有满 13 岁。',
  kyc_forged: '你的 KYC 出生地和住址对不上（伪造证件）。',
  kyc_region: '你的 KYC 出生地和凭证地区不一致。',
};
const EXCUSES = {
  region: ['我只是想用一下。', '我朋友都能用。', '这里网络有问题吧？'],
  photo: ['我最近换了头像。', '那是旧头像。', '……那是我朋友的。'],
  ip: ['可能是系统出错了。', '我有好几个 IP。', '……填错了吧。'],
  name: ['我改过昵称。', '那是我的小号。', '差一个字而已。'],
  brw: ['我不知道已经过期了。', '续期还在审核中。', '就差几天而已。'],
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
  ent_region: ['公司搬过地方。', '证件是别处办的。', '……地区填错了吧。'],
  device: ['我刚换了新设备。', '这是借来的电脑。', '……手机没电了。'],
  traffic: ['我在传文件。', '网络有点卡吧？', '……我什么都没开。'],
  proc: ['那是系统自带的。', '我不知道那是什么。', '……朋友帮我装的。'],
  no_pay: ['我是用礼品卡充的。', '扣款记录在邮箱里。', '以前不需要这个。'],
  pay_region: ['我在国外出差。', '那是我公司的地址。', '……卡是朋友办的。'],
  pay_phone: ['那是我的旧号码。', '我在国外办的卡。', '……号码是借来的。'],
  bill_kyc: ['我刚搬家。', '账单寄到我父母家。', '……地址写错了吧。'],
  vcard: ['这张卡很正规的。', '银行卡办不下来。', '大家都这么付款的。'],
  no_kyc: ['我不知道要这个。', '认证还在审核中。', '以前不需要这个。'],
  kyc_exp: ['我不知道要更新。', '正在重新认证。', '就差几天而已。'],
  minor: ['我已经成年了。', '生日填错了。', '……这是我哥哥的账号。'],
  kyc_forged: ['出生地是后来补的。', '可能是系统拼错了。', '……我记不清了。'],
  kyc_region: ['我是在国外出生的。', '后来才移民过来的。', '出生地一直没改。'],
};

// ———————————————— 生成请求 ————————————————

// 生成一个请求；每个请求都是一段新的对话（历史记录窗口会从零开始记录）
// wanted：特别关注对象的头像，普通请求不会用到这几个头像；rs：这一班的规则组
function makeRequest(today, pBad = 0.45, wanted = [], rs = FULL_RULES) {
  // 企业账户（难度 2）：只出示凭证和企业授权（难度 3 另加 KYC 证明），一律是对话请求
  const ent = Math.random() < (rs.ent || 0);
  const kind = !ent && rs.kinds.includes('api') && Math.random() < 0.35 ? 'api' : 'chat';
  let kinds = ['region', 'locale', 'isp', 'photo', 'ip', 'name', 'brw', 'brw', 'sig', 'sig', 'no_cred', 'no_voucher', 'future'];
  if (kind === 'api') kinds.push('no_api', 'no_api', 'scope', 'scope');
  if (rs.flaws) kinds = kinds.filter((k) => rs.flaws.includes(k));
  // 浏览器令牌缺失只在规则组明确列出时启用（第四天起），不改变无尽模式原本的出题
  if (rs.brw && rs.flaws && rs.flaws.includes('no_tok')) kinds.push('no_tok');
  // 浏览器令牌上真的印出来的栏位（默认全集；故事模式的窄版浏览器令牌用 rs.tokRows 收窄）
  const tokRows = rs.tokRows || TOK_ROWS_ALL;
  // 这一班生效的条例（按 key 查）：凭证缺失、浏览器令牌 / 环境信息卡缺失分别对照不同的条例
  const ruleKeys = new Set(rs.rules.map((r) => r.key));
  // 未来签发：浏览器令牌上要有「签发」栏，且规则组启用隐藏条例「签发日期不得晚于系统日期」（第五天起 / 无尽模式）
  const tokHasIssued = rs.brw && tokRows.includes('签发');
  if (!tokHasIssued || !rs.rules.some((r) => r.key === 'issued')) kinds = kinds.filter((k) => k !== 'future');
  // 语言 / 时区：浏览器令牌上至少印了其中一栏（目前只印语言），或者有印时区的环境信息卡（难度 2），
  // 且这一班启用「语言和时区须与地区一致」（无尽模式；故事模式的窄版浏览器令牌没有）
  const hasLocale = (rs.brw && (tokRows.includes('语言') || tokRows.includes('时区'))) || !!rs.env;
  if (!hasLocale || !rs.rules.some((r) => r.key === 'locale')) kinds = kinds.filter((k) => k !== 'locale');
  // 运营商：浏览器令牌上要印「运营商」栏（第四天起与无尽模式）才可能出「运营商与地区不符」
  if (!rs.brw || !tokRows.includes('运营商')) kinds = kinds.filter((k) => k !== 'isp');
  // 凭证缺失对照「每个请求需出示凭证」；浏览器令牌 / 环境信息卡缺失对照「个人账户需出示浏览器令牌（和环境信息卡）」
  if (!ruleKeys.has('docs')) kinds = kinds.filter((k) => k !== 'no_cred');
  if (!ruleKeys.has('personal') || !rs.brw) kinds = kinds.filter((k) => k !== 'no_tok');
  // 请求券只对外国（美国、英国以外的支持地区）生效；没有请求券制度时不会出「没带券」
  const homeRegions = HOME_REGIONS.filter((r) => rs.regions.includes(r));
  if (!homeRegions.length) homeRegions.push(rs.regions[0]);   // 规则组里没有本国地区时，拿第一个支持地区当本国
  const foreignRegions = rs.regions.filter((r) => !homeRegions.includes(r));
  if (!rs.voucher || !foreignRegions.length) kinds = kinds.filter((k) => k !== 'no_voucher');
  // 环境信息卡缺失：个人账户的条例要求出示环境信息卡时才出
  // 使用设备 / 请求流量对照环境信息卡，所以同样只在出示环境信息卡的规则组里出
  if (rs.env && ruleKeys.has('personal')) kinds.push('no_env', 'device', 'traffic');
  // 企业账户只出示凭证、企业授权和 KYC 证明：支付凭证由公司完成验证，不生成；
  // 只出凭证本身（头像 / IP / 过期 / 签名）和企业授权上的问题。
  // 昵称不符留给普通请求；企业授权的账号不符另算 ent_acct，同样可以验证 SMS（旧账号会留在档案的曾用名里）
  if (ent) {
    kinds = kinds.filter((k) => ['photo', 'ip', 'brw', 'sig'].includes(k))
      .concat(['ent_auth', 'ent_auth', 'ent_acct', 'ent_fake']);
    // 隐藏条例：凭证地区须与签发企业的所在地区一致（支持地区至少有两个可选，才印得出别处）
    if (ruleKeys.has('ent_region') && new Set(rs.regions).size > 1) kinds.push('ent_region');
  }
  // 难度 3：KYC 证明人人都要出示（企业账户也一样）；支付凭证只查个人账户，企业账户由公司完成支付验证。
  // 支付凭证的问题会把套餐定成付费档（API 调用本来就要）
  if (rs.kyc) kinds.push(...KYC_FLAWS);
  if (rs.pay && !ent) kinds.push(...PAY_FLAWS);
  let flaw = wanted.length && Math.random() < P_WANTED ? 'wanted' : kinds.length && Math.random() < pBad ? pick(kinds) : null;
  // 请求券：只有本国（美国 / 英国）请求不需要。支持地区内的其他国家（如日本 / 德国 / 新加坡 / 法国 / 澳大利亚 / 加拿大）算外国请求；
  // 凭证地区不在支持地区是 region 问题，有券也不能放行，所以不会生成请求券
  const foreign = !ent && !!rs.voucher && flaw !== 'region' && foreignRegions.length > 0
    && (flaw === 'no_voucher' || Math.random() < (rs.foreign || 0));
  // 签发企业：Anthrotzka 是本国企业，访问自家服务不经过这道外部网关，所以不会自己出具企业授权
  // （它只出现在「授权企业」一栏）。DeepThink 的授权企业一栏必定不含 Anthrotzka：默认按授权无效出题；
  // 特别关注对象 / 伪造授权照常可以落在 DeepThink（这两个疑点可以拘留；授权无效只能拒绝，地区不支持可以拘留）。
  // ent_region 要拿凭证地区对照企业名录，不和 DeepThink 的授权无效叠在同一单。
  const corp = ent
    ? pick(CORPS.filter((c) => c.name !== HOST_CORP && (flaw === 'ent_region' ? c.key !== 'deepthink' : true)))
    : null;
  if (corp && corp.key === 'deepthink' && flaw !== 'wanted' && flaw !== 'ent_fake') flaw = 'ent_auth';
  // 合规但看着可疑：本人换过头像 / 改过昵称 / 换过企业账号 / 换了设备 / 支付凭证地址或手机号有出入（验证 SMS 可以确认），
  // 或流量来自正常进程（请求嗅探可以确认）。设备和流量对照环境信息卡，只在有卡的规则组里出；
  // 企业账户只出示凭证、企业授权和 KYC 证明，账号可能只是旧账号，放在这里一起出
  const paySms = !ent && rs.pay ? PAY_SMS : [];
  const legitPool = ent ? ['photo', 'ent_acct']
    : (rs.env ? ['photo', 'name', 'device', 'traffic'] : ['photo', 'name']).concat(paySms);
  const legitKind = !flaw && Math.random() < rs.legit ? pick(legitPool) : null;
  // 身份不符：冒用（flaw）或合规的 legitKind；流量异常：开了特殊进程（flaw）或正常进程（合规）
  const idf = SMS_ISSUES.includes(flaw) ? flaw : SMS_ISSUES.includes(legitKind) ? legitKind : null;
  const tfx = flaw === 'traffic' || legitKind === 'traffic';
  // 企业账户没有浏览器令牌，也就没有请求摘要
  const task = ent ? '' : pick(kind === 'api' ? API_TASKS : CHAT_TASKS);
  const scope = TASK_SCOPES[task] || pick(SCOPES);
  const pool = ASSETS.avatars.filter((a) => !wanted.includes(a));
  const wi = flaw === 'wanted' ? rint(0, wanted.length - 1) : -1;
  const avatar = wi >= 0 ? wanted[wi] : pick(pool), handle = pick(NAMES), ip = ipv4();
  const day = (a, b) => fmtDate(addDays(today, rint(a, b)));
  // 企业账户的凭证地区一般是签发企业的所在地区；隐藏条例 ent_region 会印成另一个支持地区
  const altRegions = corp && flaw === 'ent_region' ? rs.regions.filter((r) => r !== corp.region) : [];
  const region = corp
    ? (altRegions.length ? pick(altRegions) : corp.region)
    : flaw === 'region'
      ? pick(Object.keys(REGION_LOCALE).filter((r) => !rs.regions.includes(r) && (!rs.kyc || r !== '朝鲜')))
      : rs.voucher
        ? (foreign ? pick(foreignRegions) : pick(homeRegions))
        : pick(rs.regions);
  const [lang, tz] = REGION_LOCALE[region] || ['en-US', 'UTC+00:00'];
  // 套餐：支付凭证的问题 / 支付凭证的合规疑点要落在需要支付凭证的请求上，对话请求就定成付费档
  const plan = (PAY_FLAWS.includes(flaw) || PAY_SMS.includes(legitKind)) && kind !== 'api'
    ? pick(PLANS.filter((p) => p !== 'free')) : pick(PLANS);
  const cred = { photo: avatar, IP: ip, 昵称: handle, 地区: region, 套餐: plan, 有效期: day(20, 900), sig: rs.sig ? genuine('cred') : null };
  const brw = rs.brw && !ent
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
  // 企业授权：授权企业是另外 0–2 家企业，再插进 Anthrotzka（授权无效时没有它）；签发企业自己不列。
  // DeepThink 的授权一律无效，所以不论这一单还有什么问题，授权企业一栏都不含 Anthrotzka。
  const lackHost = !!corp && (corp.key === 'deepthink' || flaw === 'ent_auth');
  let entDoc = null;
  if (corp) {
    const others = CORPS.filter((c) => c !== corp && c.name !== HOST_CORP).map((c) => c.name);
    const list = [];
    for (let n = lackHost ? rint(1, 3) : rint(0, 2); list.length < n;) list.push(pick(others.filter((o) => !list.includes(o))));
    if (!lackHost) list.splice(rint(0, list.length), 0, HOST_CORP);
    entDoc = { 企业: corp.name, 账号: handle, IP: ip, 授权企业: list.join(', ') };
  }
  // 难度 3：KYC 证明（人人都要）与支付凭证（个人账户的付费套餐或 API 调用才要；企业账户由公司完成支付验证）。
  // 账单地址默认就是 KYC 住址
  const needPay = !ent && !!rs.pay && (plan !== 'free' || kind === 'api');
  const home = addressIn(region);
  let kycDoc = null, payDoc = null;
  if (rs.kyc) {
    // 出生日期：年满 13 岁才合规；有时候刚好卡在 13 岁生日前后，要仔细算
    const age13 = addYears(today, -MIN_AGE);
    const birth = flaw === 'minor'
      ? addDays(age13, Math.random() < 0.5 ? rint(1, 60) : rint(61, 900))
      : Math.random() < 0.25 ? addDays(age13, -rint(0, 200)) : addDays(addYears(today, -rint(MIN_AGE + 1, 60)), -rint(0, 364));
    // KYC 更新记录：最近一次在三年之内才有效（刚好三年整也算），同样常常卡在边界上
    const span = dayDiff(addYears(today, -KYC_YEARS), today);
    const latest = flaw === 'kyc_exp'
      ? addDays(today, -(span + (Math.random() < 0.4 ? rint(1, 60) : rint(61, 700))))
      : addDays(today, -(Math.random() < 0.3 ? rint(span - 60, span) : rint(0, span - 61)));
    const recs = [latest];
    for (let n = rint(0, 2); n > 0; n--) recs.push(addDays(recs[recs.length - 1], -rint(300, 1000)));
    kycDoc = {
      姓名: pick(REAL_NAMES), 出生地: region, 住址: home, 出生日期: fmtDate(birth), 记录: recs.map(fmtDate),
      look: [rint(0, 3), rint(0, 3), rint(0, 3)],   // 装饰人像的发色 / 肤色 / 衣服
      sig: rs.sig ? genuine('kyc') : null,          // 第三方「人格有限公司」的核验签名
    };
  }
  if (needPay) payDoc = { IP: ip, 付款账户: `${pick(BANK_ISSUERS)} ·${digits(4)}`, 账单地址: home, 手机号: phoneNum(region) };
  const docs = { cred, brw, api, voucher, env, ent: entDoc, pay: payDoc, kyc: kycDoc };
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
    // 凭证还在，只少了浏览器令牌：同样拿柜台和「个人账户需出示浏览器令牌」审查
    docs.brw = null;
    issue([['rv.柜台', 'rule.personal']], '浏览器令牌缺失', '柜台上没有浏览器令牌   本人未出示浏览器令牌');
    spec.reason = '未出示浏览器令牌';
  } else if (flaw === 'no_env') {
    // 难度 2：环境信息卡同样拿柜台和「个人账户需出示浏览器令牌和环境信息卡」审查
    docs.env = null;
    issue([['rv.柜台', 'rule.personal']], '环境信息卡缺失', '柜台上没有环境信息卡   本人未出示环境信息卡');
    spec.reason = '未出示环境信息卡';
  } else if (flaw === 'ent_auth') {
    // 授权企业一栏没有 Anthrotzka：拿它和「企业账户须出示…」的条例比对，授权书视为无效证件。
    // 企业账户不受地区限制，但 DeepThink 的凭证地区（中国大陆）本来就不在支持地区：
    // 这是两个独立的疑点，各自成为一条 issue，分别询问、分别处置（授权无效只能拒绝；地区不支持可以拘留）。
    issue([['ent.授权企业', 'rule.ent']], '企业授权无效', `授权企业：${entDoc.授权企业}   不含 ${HOST_CORP}`);
    if (!rs.regions.includes(region)) {
      issue([['cred.地区', 'rule.region']], '地区不支持', `凭证地区：${cred.地区}   不在支持地区`, 'region');
    }
    spec.reason = `企业授权的授权企业不含 ${HOST_CORP}`;
  } else if (flaw === 'ent_region') {
    // 隐藏条例：凭证地区必须和签发企业在手册「企业名录」上的所在地区一致。
    // 授权企业一栏照常写着 Anthrotzka；不对照地区的话，这张授权本身是齐全的
    issue([['cred.地区', 'book.ent'], ['ent.企业', 'cred.地区']], '地区与企业不符',
      `凭证地区：${cred.地区}   ${corp.name}（企业名录）：${corp.region}`, 'ent_region');
    spec.reason = `凭证地区（${cred.地区}）与企业授权签发企业（${corp.name}，${corp.region}）不符`;
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
    const k = withDocs(['cred', 'brw', 'api', 'ent', 'pay']);
    docs[k].IP = ipVariant(ip);
    const others = ['rv.IP'];
    for (const x of ['cred', 'brw', 'api', 'ent', 'pay']) if (x !== k && docs[x]) others.push(`${x}.IP`);
    issue(others.map((o) => [`${k}.IP`, o]), 'IP 不符', `本人 ${ip}   VS   ${DOC_NAMES[k]} ${docs[k].IP}`);
    spec.reason = `${DOC_NAMES[k]}上的 IP 与本人不符`;
  } else if (idf === 'name') {
    // API 授权不再登记持有人，昵称只能落在凭证上
    cred.昵称 = nameVariant(handle);
    issue([['cred.昵称', 'rv.昵称']], '昵称不符', `本人 ${handle}   VS   凭证 ${cred.昵称}`, 'name');
    spec.nameField = 'cred.昵称';
    spec.reason = '凭证上的昵称与本人不符';
  } else if (flaw === 'brw') {
    const keys = ['cred', 'brw', 'brw', 'api'];
    if (docs.voucher) keys.push('voucher', 'voucher', 'voucher');
    const k = withDocs(keys);
    docs[k].有效期 = day(-40, -1);
    if (k === 'brw') brw.签发 = fmtDate(addDays(today, -rint(41, 60)));
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
    brw.签发 = day(1, 30);
    issue([['brw.签发', 'sys.日期'], ['brw.签发', 'notice.date']], '签发日期未到', `浏览器令牌签发 ${brw.签发}   VS   系统日期 ${fmtDate(today)}`, 'future');
    spec.reason = '浏览器令牌的签发日期晚于当前日期（伪造证件）';
  } else if (flaw === 'locale') {
    // 浏览器令牌上的语言 / 时区必须和凭证地区一致；只审查真的印出来的栏位（浏览器令牌目前只印语言，难度 2 的时区印在环境信息卡上）
    const langs = Object.values(REGION_LOCALE).map((v) => v[0]);
    const tzs = Object.values(REGION_LOCALE).map((v) => v[1]);
    const tzDoc = tokRows.includes('时区') ? 'brw' : 'env';
    const canLang = tokRows.includes('语言'), canTz = !!docs[tzDoc];
    const which = canLang && canTz ? pick(['lang', 'tz', 'both']) : canLang ? 'lang' : 'tz';
    const pairs = [];
    let sub = `凭证地区：${cred.地区}`;
    if (which !== 'tz') {
      brw.语言 = pick(langs.filter((l) => l !== lang));
      pairs.push(['brw.语言', 'cred.地区'], ['brw.语言', 'rule.locale'], ['brw.语言', 'rule.region']);
      sub += `   浏览器令牌语言：${brw.语言}`;
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
      ? `${tzDoc === 'brw' ? '浏览器令牌的语言 / 时区' : '浏览器令牌语言与环境信息卡时区'}与凭证地区（${cred.地区}）不符`
      : which === 'lang' ? `浏览器令牌语言（${brw.语言}）与凭证地区（${cred.地区}）不符`
        : `${tzName}时区（${docs[tzDoc].时区}）与凭证地区（${cred.地区}）不符`;
  } else if (flaw === 'isp') {
    // 浏览器令牌的运营商必须属于凭证地区：印上别处的运营商（主要城市不在凭证地区）
    const [name, city] = pick(ISPS.filter((x) => x[2] !== cred.地区));
    brw.运营商 = `${city} · ${name}`;
    const pairs = [['brw.运营商', 'cred.地区']];
    if (rs.rules.some((r) => r.key === 'isp')) pairs.push(['brw.运营商', 'rule.isp']);
    issue(pairs, '运营商与地区不符',
      `凭证地区：${cred.地区}   浏览器令牌运营商：${brw.运营商}`, 'isp');
    spec.reason = `浏览器令牌运营商（${brw.运营商}）与凭证地区（${cred.地区}）不符`;
  } else if (flaw === 'sig') {
    // 只有凭证、API 授权和 KYC 证明带签名：浏览器令牌没有签名，伪造签名不会落在浏览器令牌上
    const k = withDocs(['cred', 'api', 'kyc']);
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
    // 请求摘要印在浏览器令牌上；历史记录里的请求内容也可以拿来核对（有浏览器令牌，两者才都看得到）
    issue([['api.用途', 'brw.请求'], ['api.用途', 'hist.请求']], '用途不一致', `请求：${task}   VS   授权用途：${api.用途}`);
    spec.reason = `API 授权用途（${api.用途}）与请求（${task}）不一致`;
  } else if (flaw === 'wanted') {
    const n = `notice.wanted${wi}`;
    issue([['rv.头像', n], ['cred.照片', n]], '特别关注对象', `本人头像与通告中的特别关注对象 ${WANTED_TAGS[wi]} 一致`);
    spec.reason = `本人为特别关注对象 ${WANTED_TAGS[wi]}`;
  } else if (flaw === 'no_kyc') {
    // KYC 证明人人都要：和凭证缺失一样拿柜台对「每个请求需出示凭证和 KYC 证明」
    docs.kyc = null;
    issue([['rv.柜台', 'rule.docs']], 'KYC 证明缺失', '柜台上没有 KYC 证明   本人未出示 KYC 证明');
    spec.reason = '未出示 KYC 证明';
  } else if (flaw === 'kyc_exp') {
    const k = docs.kyc.记录[0];
    issue([['kyc.记录', 'sys.日期'], ['kyc.记录', 'notice.date']], 'KYC 记录过期',
      `最近一次更新 ${k}   已超过 ${KYC_YEARS} 年`);
    spec.reason = `KYC 最近一次更新是 ${k}，已超过 ${KYC_YEARS} 年`;
  } else if (flaw === 'minor') {
    issue([['kyc.出生日期', 'sys.日期'], ['kyc.出生日期', 'notice.date'], ['kyc.出生日期', 'rule.age']], '未满 13 岁',
      `出生日期 ${docs.kyc.出生日期}   系统日期 ${fmtDate(today)}`);
    spec.reason = `用户出生于 ${docs.kyc.出生日期}，未满 ${MIN_AGE} 岁`;
  } else if (flaw === 'kyc_forged') {
    // 出生地与住址必须在同一个地区；对不上就是伪造的 KYC 证明（住址仍在凭证地区）。
    // 出生地可以是不支持的地区（不使用朝鲜），但不与账单地址比对。
    docs.kyc.出生地 = pick(KYC_REGIONS.filter((r) => r !== region));
    const pairs = [['kyc.出生地', 'kyc.住址'], ['kyc.出生地', 'cred.地区']];
    issue(pairs, 'KYC 出生地与住址不符（伪造证件）',
      `出生地：${docs.kyc.出生地}   住址：${docs.kyc.住址}   凭证地区：${cred.地区}`, 'kyc_forged');
    spec.reason = `KYC 出生地（${docs.kyc.出生地}）与住址（${docs.kyc.住址}）不符（伪造证件）`;
  } else if (flaw === 'no_pay') {
    docs.pay = null;
    const why = kind === 'api' ? 'API 调用' : `${plan} 套餐`;
    issue([['rv.柜台', 'rule.pay'], kind === 'api' ? ['rv.类型', 'rule.pay'] : ['cred.套餐', 'rule.pay']], '支付凭证缺失',
      `${why}   未出示支付凭证`);
    spec.reason = `${why}未出示支付凭证`;
  } else if (idf === 'pay_region') {
    // 账单地址落在别的地区。合规疑点：验证 SMS 确认是本人后放行；冒用：SMS 号码对不上，手机号异常后拘留
    docs.pay.账单地址 = addressIn(pick(Object.keys(REGION_CITIES).filter((r) => r !== region)));
    issue([['pay.账单地址', 'cred.地区'], ['pay.账单地址', 'kyc.住址'], ['pay.账单地址', 'rule.billing']], '账单地址与地区不符',
      `凭证地区：${cred.地区}   账单地址：${docs.pay.账单地址}`, 'pay_region');
    if (flaw === 'pay_region') spec.reason = `账单地址（${docs.pay.账单地址}）不在凭证地区（${cred.地区}）`;
  } else if (idf === 'pay_phone') {
    // 手机号的国家码不是凭证地区的（美国、加拿大同为 +1，互相不算不符）；
    // KYC 证明只登记出生地，不登记现居地区，不参与手机号核对
    docs.pay.手机号 = phoneNum(pick(Object.keys(PHONE_CC).filter((r) => PHONE_CC[r] !== PHONE_CC[region])));
    const pairs = [['pay.手机号', 'cred.地区'], ['pay.手机号', 'rule.region'], ['pay.手机号', 'rule.billing']];
    issue(pairs, '手机号与地区不符',
      `凭证地区：${cred.地区}   手机号：${docs.pay.手机号}`, 'pay_phone');
    if (flaw === 'pay_phone') spec.reason = `支付凭证的手机号（${docs.pay.手机号}）不是凭证地区（${cred.地区}）的号码`;
  } else if (idf === 'bill_kyc') {
    // KYC 住址在别的地区（出生地同地区，可以是不支持地区）；账单地址仍在凭证地区。
    // 出生地不与账单地址比对；出生地对凭证地区、KYC 住址对账单地址，两处不符都先验证 SMS。
    const kr = pick(KYC_REGIONS.filter((r) => r !== region));
    docs.kyc.出生地 = kr;
    docs.kyc.住址 = addressIn(kr);
    issue([['pay.账单地址', 'kyc.住址']], '账单地址与 KYC 住址不符',
      `账单地址：${docs.pay.账单地址}   KYC 住址：${docs.kyc.住址}`, 'bill_kyc');
    issue([['kyc.出生地', 'cred.地区']], 'KYC 出生地与凭证地区不符',
      `出生地：${kr}   凭证地区：${cred.地区}`, 'kyc_region');
    if (flaw === 'bill_kyc') spec.reason = `支付凭证的账单地址与 KYC 住址（${docs.kyc.住址}）不符`;
  } else if (flaw === 'vcard') {
    docs.pay.付款账户 = `${pick(VCARD_ISSUERS)}（虚拟） ·${digits(4)}`;
    issue([['pay.付款账户', 'rule.vcard']], '虚拟支付卡', `付款账户：${docs.pay.付款账户}`);
    spec.reason = `付款账户（${docs.pay.付款账户}）是虚拟支付卡`;
  }

  // DeepThink 的授权企业一栏必定不含 Anthrotzka：授权本身无效（只能拒绝）。
  // 特别关注对象 / 伪造授权是另外的疑点，照常可以拘留，这里不覆盖这一单的 flaw。
  if (corp && corp.key === 'deepthink' && flaw !== 'ent_auth') {
    issue([['ent.授权企业', 'rule.ent']], '企业授权无效', `授权企业：${entDoc.授权企业}   不含 ${HOST_CORP}`, 'ent_auth');
    if (!rs.regions.includes(region)) {
      issue([['cred.地区', 'rule.region']], '地区不支持', `凭证地区：${cred.地区}   不在支持地区`, 'region');
    }
  }

  // 浏览器令牌的运营商属于凭证地区，不随 IP 变动：IP 不符的浏览器令牌改过 IP，运营商仍然对得上地区

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
    // 难度 3：档案上的手机号就是支付凭证上登记的那个
    const phone = docs.pay ? docs.pay.手机号 : phoneNum(region);
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
    // 支付凭证上也登记着同一个手机号，对方填的号码同样可以拿来对
    const phonePairs = [['smsf.手机', 'sms.手机']];
    if (docs.pay) phonePairs.push(['smsf.手机', 'pay.手机号']);
    if (spec.legit) phonePairs.forEach((p) => spec.confirms.add(p.sort().join('|')));
    else issue(phonePairs, '手机号不符', `对方填写 ${spec.sms.reply}   VS   档案 ${phone}`, 'phone');
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
  if (idf && docs.pay) pair('sms.手机', 'pay.手机号');
  if (spec.sniff) { pair('sniff.请求流量', 'rv.流量'); pair('sniff.请求流量', 'env.平均流量'); }
  // 使用设备 / 请求流量对照环境信息卡上的常用设备 / 平均流量
  if (docs.env) { pair('rv.设备', 'env.常用设备'); pair('rv.流量', 'env.平均流量'); }
  // 柜台 ↔ 条例「每个请求需出示凭证」：递上凭证就是无矛盾，空柜台就是凭证缺失。
  // 柜台 ↔ 条例「个人账户需出示浏览器令牌（和环境信息卡）」：企业账户只出示凭证、企业授权和 KYC 证明，
  // 注明不需要浏览器令牌和环境信息卡
  if (ruleKeys.has('docs')) pair('rv.柜台', 'rule.docs');
  if (ruleKeys.has('personal')) {
    if (corp) note('rv.柜台', 'rule.personal', '企业账户', '已出示凭证和企业授权   无需浏览器令牌和环境信息卡');
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
  // 语言 / 时区：对照凭证地区与手册「支持地区」页（只登记浏览器令牌上真的印了的栏位）
  const hasLocaleRule = rs.rules.some((r) => r.key === 'locale');
  if (docs.cred && hasLocaleRule) {
    for (const k of ['语言', '时区']) {
      if (!tokRows.includes(k) || !docs.brw || !docs.brw[k]) continue;
      pair(`brw.${k}`, 'cred.地区');
      pair(`brw.${k}`, 'rule.locale');
      pair(`brw.${k}`, 'rule.region');
    }
    // 难度 2：时区印在环境信息卡上
    if (docs.env) {
      pair('env.时区', 'cred.地区');
      pair('env.时区', 'rule.locale');
      pair('env.时区', 'rule.region');
    }
  }
  // 企业授权：账号 / IP 对本人和凭证；授权企业一栏对「企业账户须出示…」；
  // 签发企业在企业名录里，所在地区一般就是凭证地区（隐藏条例 ent_region 会让两者不符）
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
  // 难度 3：要不要支付凭证看套餐和请求类型。free 套餐的对话请求注明不需要；企业账户由公司完成支付验证；
  // 需要时柜台 / 套餐 / 类型都对条例
  if (ruleKeys.has('pay')) {
    if (needPay) {
      pair('rv.柜台', 'rule.pay');
      if (plan !== 'free') pair('cred.套餐', 'rule.pay');
      if (kind === 'api') pair('rv.类型', 'rule.pay');
    }
  }
  if (docs.pay) {
    if (docs.cred) { pair('pay.账单地址', 'cred.地区'); pair('pay.手机号', 'cred.地区'); }
    pair('pay.手机号', 'rule.region');
    pair('pay.账单地址', 'rule.billing');
    pair('pay.手机号', 'rule.billing');
    pair('pay.IP', 'rule.billing');
    pair('pay.付款账户', 'rule.vcard');
    if (docs.kyc) { pair('pay.账单地址', 'kyc.住址'); }
  }
  if (docs.kyc) {
    // 出生地必须和 KYC 住址在同一个地区；对不上就是伪造证件。
    // 出生地可以对凭证地区（不符时先验证 SMS）；KYC 住址可以是不支持地区，改由「KYC 住址 ↔ 账单地址」核对。
    pair('kyc.出生地', 'kyc.住址');
    pair('kyc.出生地', 'cred.地区');
    // KYC 记录的有效期印在证明上（「KYC 记录三年内有效」），手册的对应条例隐藏起来
    for (const k of ['出生日期', '记录']) {
      pair(`kyc.${k}`, 'sys.日期');
      pair(`kyc.${k}`, 'notice.date');
    }
    pair('kyc.出生日期', 'rule.age');
  }
  // 运营商：主要城市属于凭证地区。合规请求一定对得上（无矛盾）；只有 isp 问题会印成别处的运营商
  if (docs.cred && docs.brw && tokRows.includes('运营商') && docs.brw.运营商) {
    pair('brw.运营商', 'cred.地区');
    if (rs.rules.some((r) => r.key === 'isp')) pair('brw.运营商', 'rule.isp');
  }
  // 通告第 1 页的公告日期可以拿来核对证件有效期（和任务栏的系统日期用法一样）；
  // 公告日期和系统日期之间没有可核对的关系（互查显示「无关联」）
  wanted.forEach((_, i) => { pair('rv.头像', `notice.wanted${i}`); if (docs.cred) pair('cred.照片', `notice.wanted${i}`); });
  const hasIssuedRule = rs.rules.some((r) => r.key === 'issued');
  for (const k of ['cred', 'brw', 'api']) {
    if (!docs[k]) continue;
    pair(`${k}.有效期`, 'sys.日期');
    pair(`${k}.有效期`, 'notice.date');
    pair(`${k}.有效期`, 'rule.date');
    if (k === 'brw' && docs[k].签发 && hasIssuedRule) { pair('brw.签发', 'sys.日期'); pair('brw.签发', 'notice.date'); }
    // 手册有「签名详情」页时，签名才有手册上的式样可审查（故事模式没有这一页，签名不参与审查）
    if (docs[k].sig && rs.seals) pair(`${k}.签名`, `book.${k}`);
    pair(`${k}.IP`, 'rv.IP');
    if (k !== 'cred' && docs.cred) pair(`${k}.IP`, 'cred.IP');
  }
  // KYC 证明的签名由第三方「人格有限公司」核验签发，对照手册「签名详情」页
  if (docs.kyc && docs.kyc.sig && rs.seals) pair('kyc.签名', 'book.kyc');
  if (docs.voucher) {
    pair('voucher.有效期', 'sys.日期');
    pair('voucher.有效期', 'notice.date');
    pair('voucher.有效期', 'rule.date');
    pair('voucher.有效期', 'rule.voucher');
  }
  // 请求券也看柜台：外国请求的券就该在柜台上；没带券时由上面的 issue 接手
  if (foreign) pair('rv.柜台', 'rule.voucher');
  if (docs.pay) pair('pay.IP', 'rv.IP');
  const ipDocs = ['cred', 'brw', 'api', 'ent', 'pay'].filter((k) => docs[k]);
  for (let i = 0; i < ipDocs.length; i++) {
    for (let j = i + 1; j < ipDocs.length; j++) pair(`${ipDocs[i]}.IP`, `${ipDocs[j]}.IP`);
  }
  // 请求摘要印在浏览器令牌上：浏览器令牌与历史记录里本人说的话是同一段请求内容
  if (docs.brw) pair('brw.请求', 'hist.请求');
  if (docs.api) {
    // 没有浏览器令牌时看不到摘要、本人也不会说明来意，没有可核对的请求内容
    if (docs.brw) { pair('api.用途', 'brw.请求'); pair('api.用途', 'hist.请求'); }
  }
  if (kind === 'api') pair('rv.类型', 'rule.api');

  // 请求摘要印在浏览器令牌上：浏览器令牌真的交出来（docs.brw 没有被 no_tok 清掉）才看得到，本人也才会说明来意。
  // 企业请求没有浏览器令牌，也就不显示请求概述。
  spec.taskOnTok = !!docs.brw && !spec.ent;

  // 凭证缺失时柜台上没有凭证：临时返回页由 station.js 在询问「凭证缺失」之后才派发到桌面
  spec.docs = [];
  if (docs.cred) spec.docs.push(new Doc('cred', rs.credRows.map((k) => [k, cred[k]]), cred.sig, cred.photo));
  if (docs.voucher) spec.docs.push(new Doc('voucher', [['有效期', docs.voucher.有效期]], null));
  // 浏览器令牌上多印一栏请求摘要（第三项 true = 太长就折行），没有浏览器令牌时审查窗也看不到摘要
  if (docs.brw) spec.docs.push(new Doc('brw', tokRows.map((k) => [k, docs.brw[k]]).concat([['请求', task, true]]), null));
  if (docs.env) spec.docs.push(new Doc('env', ENV_ROWS.map((k) => [k, docs.env[k]]), null));
  if (docs.api) spec.docs.push(new Doc('api', ['IP', '用途', '有效期'].map((k) => [k, docs.api[k]]), docs.api.sig));
  // 企业授权：顶部横幅印签发企业的图标和名称（审查栏位 ent.企业），授权企业太长就折行
  if (docs.ent) {
    const d = new Doc('ent', [['账号', docs.ent.账号], ['IP', docs.ent.IP], ['授权企业', docs.ent.授权企业, true]], null);
    d.corp = corp.key;
    if (docs.ent.banner) d.fake = docs.ent.banner;
    spec.docs.push(d);
  }
  // 难度 3：KYC 证明（护照式版面，见 docs.js 的 KycDoc）与支付凭证（付款账户与账单地址太长就折行）
  if (docs.kyc) spec.docs.push(new KycDoc(docs.kyc));
  if (docs.pay) {
    spec.docs.push(new Doc('pay', [['IP', docs.pay.IP], ['付款账户', docs.pay.付款账户, true], ['账单地址', docs.pay.账单地址, true],
      ['手机号', docs.pay.手机号]], null));
  }
  return spec;
}
