# 开发说明

## 核心原则

在修改机制时，**不允许改任何现有游戏说明**，除非用户要求。

## 运行

游戏没有构建步骤，也没有依赖：直接双击 `index.html`，或者

```bash
python -m http.server
# 打开 http://localhost:8000
```

因此所有代码都是经典的 `<script>`（不是 ES module），这样 `file://` 下也能运行。代价是全局状态和载入顺序需要手动维护。

## 脚本载入顺序

`index.html` 里的顺序不能随便调：

| 顺序 | 文件 | 负责 |
|---|---|---|
| 1 | `src/assets.js` | 生成的素材图集（字形、头像、报纸配图、徽标），不要手改 |
| 2 | `src/gfx.js` | 画布、像素绘图原语、文字与折行、光标、图片加载 |
| 3 | `src/sfx.js` | 音效与场景配乐：现场合成、淡入淡出、静音 |
| 4 | `src/docs.js` | 桌面窗口类：`Doc`、`Rulebook`、`OfficialNotice`、`HistoryLog` 等 |
| 5 | `src/data.js` | 地区、签名、条例、企业名录、`FULL_RULES` / `FULL_RULES_2` / `FULL_RULES_3` / `FULL_RULES_4`（无尽模式难度 1 / 2 / 3 / 4）、随机请求生成 `makeRequest` |
| 6 | `src/story.js` | `STORY_DATE`、`STORY`（逐日规则 / 通告 / 报纸） |
| 7 | `src/station.js` | 全局状态、`MODES`、一班的生命周期、请求进出、判定 |
| 8 | `src/desk.js` | 桌面窗口管理、任务栏、决定栏、拖放、输入分发 |
| 9 | `src/inspect.js` | 审查模式、验证 SMS 与请求嗅探 |
| 10 | `src/render-station.js` | 检查站绘制 |
| 11 | `src/intro.js` | 开场与拘留押送动画 |
| 12 | `src/screens.js` | 开机、标题、日期卡、报纸、下班结算、结束画面 |
| 13 | `src/main.js` | 场景切换、输入入口、主循环 |
| 14 | `src/ui.js` | 页面上的声音 / 全屏按钮（操作 canvas 之外） |

经典脚本共享同一个全局词法环境：**不要在多个文件顶层重复声明同名的 `const` / `let` / `function`**，否则会直接抛 `SyntaxError`。新增文件时记得同时改 `index.html`、本表和 `tools/build_assets.py`（它会扫描 `src/**/*.js` 收集字形）。

## 全局状态

| 名称 | 定义在 | 说明 |
|---|---|---|
| `canvasEl`、`F`、`now` | `station.js` | 屏幕画布、离屏画布、当前时间（秒） |
| `ptr`、`drag` | `station.js` | 指针状态、当前拖拽的窗口 / 图标 |
| `scene`、`sceneT0` | `station.js` | 当前场景与进入时间 |
| `RUN` | `station.js` | 这一局：模式、天数、存款、分数、最高纪录等 |
| `D` | `station.js` | 这一班：队列、当前请求、桌面窗口、计时器、审查状态等 |

`RUN` 跨天保留（故事模式），`D` 每天 / 每局重建。场景切换走 `main.js` 的 `go()` / `fadeGo()`。

## 数据流

1. `newRun(mode)` 建 `RUN`；进入检查站时 `startShift()` 建 `D`，并按规则组生成规则手册和官方通告。
2. 点『下一位』→ `callNext()` → `makeRequest(today(), mode().pBad, D.wanted, rules())` 生成一个请求 `spec`。
3. `rules()` 在故事模式返回当天的 `STORY` 规则组，无尽模式按 `RUN.diff` 返回 `ENDLESS_RULES` 里的一组（难度 1 = `FULL_RULES`，难度 2 = `FULL_RULES_2`，难度 3 = `FULL_RULES_3`，难度 4 = `FULL_RULES_4`）。难度的名称、简介和通告附页在 `station.js` 的 `DIFFS`；最佳纪录按难度分开存（难度 1 沿用原来的键）。标题页的难度按钮按四档预留（`screens.js` 的 `DIFF_SLOTS`），之后往 `DIFFS` 加档位就会自动均分同一排的宽度。无尽模式的世界观日期跟着难度走：难度 1 是 2078.01.01，难度 2 是 2078.01.02，难度 3 是 2078.01.03，难度 4 是 2078.01.04（`data.js` 的 `worldDate`）。难度 4 的规则组带 `idc`：请求仍按浏览器令牌 / 环境信息卡 / 支付凭证生成，最后由 `mergeIdc` 把 `brw.*` / `env.*` / `pay.*` 审查栏位改成 `idc.*`、说明文字里的证件名换成身份信息卡，再印成一张 `Doc('idc')`（签名借用凭证的，见 `sealKey`）。卡面按「IP / 运营商 / 请求 → 语言 / 时区 / 常用设备 / 平均流量 → 手机号 / 账单地址 / 付款账户 → 签发 / 有效期」四类排版，类别之间插 `DOC_SEP` 画虚线；手机号与难度 3 不同，卡上始终有内容（不需要支付信息的 free 套餐对话也印身份记录上的号码，见 `idcDoc.手机号`）。环境信息卡与支付凭证也各印有效期，日期与浏览器令牌一致（难度 4 合并成一张卡时只印卡上的那一个有效期）；浏览器令牌的请求摘要固定印在「签发」上方。难度 3 起的规则组带 `denyReason`：拒绝理由抽屉的位置在 `station.js` 的 `REASON_BOX` / `REASON_TAB`，开合在 `desk.js` 的 `updateReasonTray`，盖章是 `stampReason`（`Doc.setReason`）。`judge` 只在最终决定是拒绝时检查有没有盖；理由章与抽屉画成橙色（`docs.js` 的 `drawReasonStamp`、`render-station.js` 的 `drawReasonTray`），不参与主决定，先盖理由再改成放行不会处罚。难度 3 的 KYC 证明是 `docs.js` 的 `KycDoc`（护照式版面，底部有「人格有限公司」的核验签名），支付凭证沿用 `Doc`；企业账户不出支付凭证，但仍要出示 KYC 证明。KYC 证明的出生地与住址必须在同一地区（可以是不支持地区，不使用朝鲜），不符视为伪造证件、可以拘留；KYC 出生地与凭证地区不符、KYC 住址与账单地址不符时先验证 SMS，出生地不与账单地址比对。
4. 玩家盖章 → `decide(kind)`；交还全部证件 → `finishRequest()` → `judge(e, kind)` 按 `spec.flaw`（以及同时存在的可拘留疑点）判定对错。只要审查出问题（`spec.legit`：头像 / 昵称 / 设备 / 流量 / 企业账号 / 支付凭证地址手机号），直接拒绝也算正确处理（`denyLegit`）；证件过期不能拘留（不在 `SUSPEND_FLAWS` 里）。SMS 可核验的异常（`SMS_ISSUES`）在核验通过时（`spec.sms.ok`：表单号码与身份记录一致、证件昵称 / 企业账号在曾用名里）视为本人有出入，放行同样算正确处理（`station.js` 的 `smsCleared`），也不能拘留。
5. 审查模式用 `fieldBoxes()` 收集可点栏位（证件栏位、手册条例、任务栏日期、审查窗字段、通告、SMS 档案、嗅探报告），`compareOutcome()` 用 `spec.issues` / `spec.notes` / `spec.checks` 区分 矛盾 / 无矛盾 / 无关联。

`makeRequest` 的 `spec` 字段、规则组字段、审查栏位 key 的完整说明写在 `src/data.js` 文件头；改出题逻辑前先读那段注释。

暂停（`Esc`）不会改动全局的 `now`：`elapsed()` 在暂停期间扣掉暂停时长，恢复时 `shiftTimes()` 把 `D` 里所有绝对时间戳整体后移，计时、动画与 `later()` 定时器都接着走。柜台图标放不下时由 `D.iconScroll` 控制滚动，`updateCounter()` 在指针贴住柜台左右边缘时自动滚。

## 素材

`src/assets.js` 由 `tools/build_assets.py` 生成：字体图集只渲染 `src/**/*.js` 与 `index.html` 里出现过的字符，所以新增文字后必须重新生成，否则游戏里会缺字。

```bash
pip install -r tools/requirements.txt
python tools/build_assets.py
```

`tools/pp/` 是像素画法（画布、字体、头像生成），`tools/assets/fonts/` 是缝合像素字体与 OFL 许可。

## 检查

```bash
# 请求生成、条例、手册 / 通告版面（纯 Node）
node tools/check_requests.js

# 浏览器回归：file:// 打开游戏、走一遍故事模式第三天与无尽模式的选模式 / 暂停 / 快捷键 / 柜台滚动、截图
pip install -r tools/requirements-dev.txt
python tools/screenshot_check.py
```

截图与临时输出都在 `tools/.out/`，不会进版本库。浏览器检查默认使用本机 Edge（`channel="msedge"`）。

## 部署

推送到 `main` 后，`.github/workflows/pages.yml` 会把 `index.html`、`.nojekyll`、`LICENSE`、`OFL-fusion-pixel.txt`、`src/`、`media/` 复制到 `_site` 并发布。**新增运行必需的目录时，要同步修改这个 workflow 的 `Stage game files` 步骤。**

## 约定

- 2 空格缩进、LF 换行、UTF-8（见 `.editorconfig` / `.gitattributes`）。
- 游戏文本与注释用简体中文；生成物 `src/assets.js` 不要手改。
- `src/` 里只放运行时代码；文档放 `docs/`，开发脚本放 `tools/`。
- 改动判定 / 出题逻辑后，至少跑一遍 `check_requests.js` 和 `screenshot_check.py`。
