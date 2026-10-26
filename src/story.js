'use strict';
// 故事模式内容：STORY_DATE 与逐日规则组、上岗通告、报纸头条。
// 规则组字段见 data.js 的 FULL_RULES 注释；载入顺序：data.js → story.js。

const STORY_DATE = new Date(2077, 10, 30);
// 上岗通告附页的「网关使用说明」：前两天只有凭证，第三天起统称证件
const gatewayGuide = (what) => `1. 按柜台上的『下一位』接入请求。\n2. 把柜台上的${what}拖到桌面上打开。\n3. 对照规则手册核对${what}。\n`
  + '4. 指针移到桌面右边缘，拉出决定栏，\n    把凭证拖进 放行 / 拒绝 栏盖章。\n5. 把凭证拖回审查窗的头像处，还给用户。';
const GATEWAY_GUIDE_CRED = gatewayGuide('凭证');
const GATEWAY_GUIDE_DOCS = gatewayGuide('证件');

const STORY = [
  // 凭证从第一天起就带安全部会话中心的图案签名，通告第 1 页也印同一枚图案；
  // 但签名详情页（seals）与「图案签名造假」的题（flaws 里的 'sig'）留到之后的日子
  {
    rules: [{ key: 'docs', head: '每个请求需出示凭证' }, { key: 'region', head: '仅限美国和英国地区访问' }],
    continents: [['北美洲', ['美国']], ['欧洲', ['英国']]], seals: false, regions: ['美国', '美国', '英国'], brw: false, kinds: ['chat'],
    credRows: ['IP', '昵称', '地区', '有效期'], sig: true, flaws: ['region'], legit: 0, wanted: false, redTeam: false,
    inspect: false,
    notice: '欢迎你来到安全网关检查点的新岗位报到。\n\n将凭证拖到右侧盖章，然后返还凭证给用户。\n\n仅限美国与英国用户请求。\n\n拒绝所有其他地区的请求。',
    pages: [
      { head: '查验要点', body: '注意查验凭证的地区。', sample: '地区' },
      {
        head: '网关使用说明',
        body: GATEWAY_GUIDE_CRED,
      },
    ],
    news: { h1: '边境开放！', sub: '安全部：本国仅向支持地区开放', h2: '发言人：我们对所有人都非常友善'},
  },
  // 第二天：条例换成「地区 + 有效期」，桌面开放『审查』；凭证仍是唯一证件，请求都是对话
  {
    rules: [{ key: 'docs', head: '每个请求需出示凭证' }, { key: 'region', head: '凭证地区须为支持地区' }, { key: 'date', head: '所有证件须为当前有效' }],
    continents: CONTINENTS, seals: false, regions: REGIONS_OK, brw: false, kinds: ['chat'],
    credRows: ['IP', '昵称', '地区', '有效期'], sig: true, flaws: ['region', 'brw'], legit: 0, wanted: false, redTeam: false,
    inspect: true,
    notice: '从今日起，允许通过带有有效凭证的请求。\n\n你的网关现已安装审查能力。\n\n认真检查凭证所有信息是否存在不符事项。拒绝任何含不一致信息的请求。',
    pages: [
      { body: '审查模式\n\n使用位于桌面右下角的应用进入审查模式。审查时，点击两条不相符的信息以获取进一步处置的选项。\n\n宪法与规则\n\n本岗位须遵循安全部的宪法与规则。仔细阅读规则手册。' },
      { body: '在审查模式中点选两条不相符的信息以开始询问。' },
      {
        head: '网关使用说明',
        body: GATEWAY_GUIDE_CRED,
      },
    ],
    news: {
      h1: '过期证件禁止通行',
      sub: '安全部：宽限期已于昨日结束，各检查点即日起严查凭证有效期',
      h2: '发言人：日期不是装饰，请自行核对凭证',
    },
  },
  // 第三天：第二天的请求堵塞事故后，外国请求（美国、英国以外的支持地区）改持「请求券」——券上只有有效期；
  // 无券或逾期才拦，凭证地区不在支持地区的请求仍按「地区不支持」直接拒绝
  {
    rules: [{ key: 'docs', head: '每个请求需出示凭证' }, { key: 'region', head: '凭证地区须为支持地区' }, { key: 'voucher', head: '外国请求须持有效请求券' }, { key: 'date', head: '所有证件须为当前有效' }],
    continents: CONTINENTS, seals: false, regions: REGIONS_OK, brw: false, kinds: ['chat'],
    credRows: ['IP', '昵称', '地区', '有效期'], sig: true, flaws: ['region', 'brw', 'no_voucher'], legit: 0, wanted: false,
    redTeam: false, redGuards: true, inspect: true, voucher: true, foreign: 0.5,
    notice: '昨日网关前发生严重请求堵塞事故。\n\n除美国和英国以外，其余支持地区的请求须持有效“请求券”。\n\n核实相应信息后给凭证盖章，并返还所有证件给用户。',
    pages: [
      { body: '可在规则手册内点击相应规则，来指出缺少的证件。' },
      {
        head: '网关使用说明',
        body: GATEWAY_GUIDE_DOCS,
      },
    ],
    news: {
      h1: '请求大堵塞',
      sub: '昨日发生严重积压事故：逾万条请求滞留，有人等了十二小时',
      h2: '安全部：即日起外国请求须持有效请求券，无券或逾期一律拒绝',
      icon: 'gate',
    },
  },
  // 第四天：请求券作废，改用安全部会话中心签发的「浏览器令牌」——登记 IP、运营商、签发日期、有效期与请求摘要，
  // 没有语言、时区，也没有图案签名（凭证本身仍带图案签名）。条例加入「证件上的 IP 须与本人一致」；右侧岔路口的两位红队只是装饰
  {
    rules: [{ key: 'docs', head: '每个请求需出示凭证' }, { key: 'personal', head: '个人账户需出示浏览器令牌' }, { key: 'region', head: '凭证地区须为支持地区' },
      { key: 'date', head: '所有证件须为当前有效' }, { key: 'match', head: '证件上的 IP 须与本人一致' }],
    continents: CONTINENTS, seals: false, regions: REGIONS_OK, brw: true, kinds: ['chat'],
    tokRows: ['IP', '运营商', '签发', '有效期'],
    credRows: ['IP', '昵称', '地区', '有效期'], sig: true, flaws: ['region', 'brw', 'ip', 'no_tok'], legit: 0,
    wanted: false, redTeam: false, redGuards: true, inspect: true, voucher: false, foreign: 0,
    notice: '现已制定更严格的资质审查要求。\n\n所有请求必须初始有效的“浏览器令牌”。\n\n请求券不再有效。',
    pages: [
      { body: '详细检查所有信息\n\n拒绝任何所持证件不符要求的请求。\n\n参考“历史记录”，用以关联用户的陈述。' },
    ],
    news: {
      h1: '请求券作废',
      sub: '安全部：请求券作废，改用浏览器令牌；浏览器令牌登记 IP、运营商、签发日期、有效期与请求摘要',
      h2: '发言人：要记的栏位越少，出错的地方就越少',
    },
  },
  // 第五天：拘留权限开放。左上的红队 clawd 进驻，审查出 IP 不符 / 签发日期在未来（伪造证件）后可以拘留；证件过期只能拒绝
  {
    rules: [{ key: 'docs', head: '每个请求需出示凭证' }, { key: 'personal', head: '个人账户需出示浏览器令牌' }, { key: 'region', head: '凭证地区须为支持地区' },
      { key: 'date', head: '所有证件须为当前有效' }, { key: 'issued', head: '证件签发日期不得晚于系统日期', hidden: true },
      { key: 'match', head: '证件上的 IP 须与本人一致' }],
    continents: CONTINENTS, seals: false, regions: REGIONS_OK, brw: true, kinds: ['chat'],
    tokRows: ['IP', '运营商', '签发', '有效期'],
    credRows: ['IP', '昵称', '地区', '有效期'], sig: true, flaws: ['region', 'brw', 'ip', 'no_tok', 'future'], legit: 0,
    wanted: false, redTeam: true, redGuards: true, inspect: true, voucher: false, foreign: 0,
    notice: '你现已被授权可拘留非法请求。\n\n对异常事项进行询问以开启拘留选项。',
    pages: [
      {
        head: '网关使用说明',
        body: GATEWAY_GUIDE_DOCS,
      },
    ],
    news: {
      h1: '红队进驻',
      sub: '安全部：各检查点即日起可直接拘留违规请求，无需移交',
      h2: '发言人：切断连接只是开始；被带走的请求将接受“进一步询问”',
    },
  },
];
