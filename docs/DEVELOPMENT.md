# 开发说明

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
| 3 | `src/sfx.js` | 音效合成与播放 |
| 4 | `src/docs.js` | 桌面窗口类：`Doc`、`Rulebook`、`OfficialNotice`、`HistoryLog` 等 |
| 5 | `src/data.js` | 地区、签名、条例、`FULL_RULES`、随机请求生成 `makeRequest` |
| 6 | `src/story.js` | `STORY_DATE`、`STORY`（逐日规则 / 通告 / 报纸） |
| 7 | `src/station.js` | 全局状态、`MODES`、一班的生命周期、请求进出、判定 |
| 8 | `src/desk.js` | 桌面窗口管理、任务栏、决定栏、拖放、输入分发 |
| 9 | `src/inspect.js` | 审查模式与验证 SMS |
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
3. `rules()` 在故事模式返回当天的 `STORY` 规则组，无尽模式返回 `FULL_RULES`。
4. 玩家盖章 → `decide(kind)`；交还全部证件 → `finishRequest()` → `judge(e, kind)` 按 `spec.flaw` 判定对错。
5. 审查模式用 `fieldBoxes()` 收集可点栏位（证件栏位、手册条例、任务栏日期、审查窗字段、通告、SMS 档案），`compareOutcome()` 用 `spec.issues` / `spec.notes` / `spec.checks` 区分 矛盾 / 无矛盾 / 无关联。

`makeRequest` 的 `spec` 字段、规则组字段、审查栏位 key 的完整说明写在 `src/data.js` 文件头；改出题逻辑前先读那段注释。

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

# 浏览器回归：file:// 打开游戏、走一遍故事模式第三天、截图
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
