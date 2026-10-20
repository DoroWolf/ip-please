'use strict';
// 规则与请求生成：地区、合法签名、规则手册的内容、随机请求（合规的，或者恰好有一处问题的）。
//
// 请求 spec：
//   avatar / handle / id   节点头像精灵 key、昵称、节点编号（审查窗里显示的“本人”）
//   kind                   'chat' 对话 / 'api' API 调用
//   task / greet           请求摘要、进来时说的话
//   docs                   证件（凭证 / 令牌 / API 授权），见 docs.js 的 Doc
//   flaw                   问题类型（null = 合规，应放行）
//   reason                 判错时事故通知上写的理由
//   issues                 比对模式里能点出来的矛盾 {pairs, title, sub, ask}
// 栏位 key：证件 'cred.昵称' / 'tok.有效期' / 'api.签名'，手册 'rule.region' / 'book.cred'，审查窗 'rv.头像'，任务栏 'sys.日期'

const WORLD_DATE = new Date(2078, 0, 1);

const REGIONS_OK = ['美国', '美国', '美国', '英国', '日本', '德国', '新加坡'];
const REGIONS_BAD = ['中国大陆', '中国香港', '俄罗斯', '伊朗', '朝鲜'];

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
  tok: { issuer: '风控部会话中心', print: '7D13-0BE6', fakeIssuer: '风控部会话中台' },
  api: { issuer: '风控部接口管理处', print: 'C5E8-3A72', fakeIssuer: '风控部接口管理局' },
};
const DOC_NAMES = { cred: '凭证', tok: '令牌', api: 'API 授权' };

const genuine = (key) => ({ issuer: SIGNERS[key].issuer, print: SIGNERS[key].print, glyph: key });

// 伪造签名：图案、机构、指纹三者之一不对
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
  return [s, { glyph: '签名图案与规则手册不符', issuer: '签发机构与规则手册不符', print: '签名指纹与规则手册不符' }[how]];
}

// —— 规则手册 ——
const RULES = [
  { key: 'docs', head: '§1 每个请求须出示凭证和令牌' },
  { key: 'region', head: '§2 凭证地区须为支持地区', subs: ['支持：美国  英国  日本  德国  新加坡'] },
  { key: 'date', head: '§3 证件须在有效期内', subs: ['以任务栏上的系统日期为准（当天到期仍有效）'] },
  { key: 'match', head: '§4 证件须与节点本人一致', subs: ['头像、节点编号、昵称'] },
  { key: 'api', head: '§5 API 调用须另出示 API 授权' },
  { key: 'sig', head: '§6 证件须有合法的数字签名', subs: ['签发机构、指纹、图案见第 2 页'] },
];

// ———————————————— 工具 ————————————————

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const digits = (n) => Array.from({ length: n }, () => rint(0, 9)).join('');

const fmtDate = (d) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const NAMES = ['mlee', 'k.tanaka', 'jonas.w', 'sarah_k', 'dchen', 'amelia.r', 'hiro', 'lukas88', 'nina.v', 'tomw', 'ravi.k',
  'emma_j', 'yuki', 'felix', 'olivia.m', 'sam.t', 'mei', 'jbrown', 'anna.s', 'leo', 'grace_h', 'max.k', 'ivy', 'noah'];
const CHAT_TASKS = ['总结一份季度财报', '把这段代码改写成 TypeScript', '翻译一封商务邮件', '解释一个统计学概念', '起草一份租房合同',
  '调试一段 Python 报错', '润色一封求职信', '整理会议纪要', '设计一份数据库表结构', '规划一周的旅行路线', '准备一场面试'];
const API_TASKS = ['客服系统自动回复', '批量翻译产品说明', '代码审查流水线', '文档摘要服务', '工单分类', '日志异常分析'];
const SCOPES = ['文本生成', '代码辅助', '文档处理', '翻译', '数据分析'];
const GREETS = ['你好。', '你好，麻烦快一点。', '我想继续刚才的对话。', '……', '你好，我有个问题。', '谢谢。'];

// 改一位数字 / 改一点昵称：差得不多，要仔细看
function idVariant(id) {
  const chars = [...id];
  const i = rint(2, chars.length - 1);
  chars[i] = String((+chars[i] + rint(1, 9)) % 10);
  return chars.join('');
}
function nameVariant(s) {
  const opts = [s + rint(1, 9), s.slice(0, -1), s.includes('.') ? s.replace('.', '_') : s + '_', s[0] + s];
  return pick(opts.filter((v) => v !== s && v.length > 1));
}

// 比对出矛盾后 Claude 追问的话，和对方的说辞
const QUESTIONS = {
  region: '你的凭证地区不在支持范围内。', photo: '凭证上的头像不是你。', id: '证件上的节点编号对不上。',
  name: '证件上的昵称对不上。', exp: '你的证件已经过期了。', sig: '这份证件的签名不合法。', no_api: 'API 调用需要出示 API 授权。',
};
const EXCUSES = {
  region: ['我只是想用一下。', '我朋友都能用。', '这里网络有问题吧？'],
  photo: ['我最近换了头像。', '那是旧头像。', '……那是我朋友的。'],
  id: ['可能是系统出错了。', '我有好几个节点。', '……填错了吧。'],
  name: ['我改过昵称。', '那是我的小号。', '差一个字而已。'],
  exp: ['我不知道已经过期了。', '续期还在审核中。', '就差几天而已。'],
  sig: ['签名是官方给的。', '我不知道签名有什么问题。', '……网上办的。'],
  no_api: ['我只是测试一下。', '授权还在申请中。', '以前不需要这个。'],
};

// ———————————————— 生成请求 ————————————————

function makeRequest(today, pBad = 0.45) {
  const kind = Math.random() < 0.35 ? 'api' : 'chat';
  const kinds = ['region', 'photo', 'id', 'name', 'exp', 'exp', 'sig', 'sig'];
  if (kind === 'api') kinds.push('no_api', 'no_api');
  const flaw = Math.random() < pBad ? pick(kinds) : null;
  const avatar = pick(ASSETS.avatars), handle = pick(NAMES), id = `N-${digits(5)}`;
  const day = (a, b) => fmtDate(addDays(today, rint(a, b)));

  const cred = { photo: avatar, 节点: id, 昵称: handle, 地区: flaw === 'region' ? pick(REGIONS_BAD) : pick(REGIONS_OK), 有效期: day(20, 900), sig: genuine('cred') };
  const tok = { 节点: id, 签发: day(-3, 0), 有效期: day(0, 6), sig: genuine('tok') };
  const api = kind === 'api' ? { 持有人: handle, 节点: id, 用途: pick(SCOPES), 有效期: day(5, 300), sig: genuine('api') } : null;
  const docs = { cred, tok, api };
  const spec = {
    avatar, handle, id, kind, task: pick(kind === 'api' ? API_TASKS : CHAT_TASKS), greet: pick(GREETS),
    flaw, issues: [], reason: '',
  };
  const issue = (pairs, title, sub) => spec.issues.push({ pairs, title, sub, ask: pick(EXCUSES[flaw]) });
  const withDocs = (keys) => pick(keys.filter((k) => docs[k]));

  if (flaw === 'region') {
    issue([['cred.地区', 'rule.region']], '地区不支持', `凭证地区：${cred.地区}`);
    spec.reason = `凭证地区为${cred.地区}，不在支持地区`;
  } else if (flaw === 'photo') {
    cred.photo = pick(ASSETS.avatars.filter((a) => a !== avatar));
    issue([['cred.照片', 'rv.头像']], '头像不符', '凭证上的头像   VS   节点本人的头像');
    spec.reason = '凭证头像与节点本人不符';
  } else if (flaw === 'id') {
    const k = withDocs(['cred', 'tok', 'api']);
    docs[k].节点 = idVariant(id);
    const pairs = [[`${k}.节点`, 'rv.节点']];
    if (k !== 'cred') pairs.push([`${k}.节点`, 'cred.节点']);
    issue(pairs, '节点编号不符', `本人 ${id}   VS   ${DOC_NAMES[k]} ${docs[k].节点}`);
    spec.reason = `${DOC_NAMES[k]}上的节点编号与本人不符`;
  } else if (flaw === 'name') {
    const k = withDocs(['cred', 'api']);
    const f = k === 'cred' ? '昵称' : '持有人';
    docs[k][f] = nameVariant(handle);
    const pairs = [[`${k}.${f}`, 'rv.昵称']];
    if (k !== 'cred') pairs.push([`${k}.${f}`, 'cred.昵称']);
    issue(pairs, '昵称不符', `本人 ${handle}   VS   ${DOC_NAMES[k]} ${docs[k][f]}`);
    spec.reason = `${DOC_NAMES[k]}上的昵称与本人不符`;
  } else if (flaw === 'exp') {
    const k = withDocs(['cred', 'tok', 'tok', 'api']);
    docs[k].有效期 = day(-40, -1);
    if (k === 'tok') tok.签发 = fmtDate(addDays(today, -rint(41, 60)));
    issue([[`${k}.有效期`, 'sys.日期'], [`${k}.有效期`, 'rule.date']], '证件过期', `${DOC_NAMES[k]}有效期至 ${docs[k].有效期}   系统日期 ${fmtDate(today)}`);
    spec.reason = `${DOC_NAMES[k]}已于 ${docs[k].有效期} 过期`;
  } else if (flaw === 'sig') {
    const k = withDocs(['cred', 'tok', 'api']);
    const [s, sub] = forged(k);
    docs[k].sig = s;
    issue([[`${k}.签名`, `book.${k}`]], '签名不合法', sub);
    spec.reason = `${DOC_NAMES[k]}的数字签名不合法（${sub}）`;
  } else if (flaw === 'no_api') {
    docs.api = null;
    issue([['rv.类型', 'rule.api']], '缺少证件', '请求类型：API 调用   未出示 API 授权');
    spec.reason = 'API 调用未出示 API 授权';
  }

  spec.docs = [new Doc('cred', ['节点', '昵称', '地区', '有效期'].map((k) => [k, cred[k]]), cred.sig, cred.photo),
    new Doc('tok', ['节点', '签发', '有效期'].map((k) => [k, tok[k]]), tok.sig)];
  if (docs.api) spec.docs.push(new Doc('api', ['持有人', '节点', '用途', '有效期'].map((k) => [k, docs.api[k]]), docs.api.sig));
  return spec;
}
