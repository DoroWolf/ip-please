<p align="center">
  <a href="https://ip-please.github.io"><img src="media/logo.png" width="160" alt="IP, PLEASE"></a>
</p>

<h1 align="center">IP, PLEASE · 风控检查站</h1>

<p align="center">
  Papers, Please 风格的像素小游戏。<br>
  你是一个部署在入口网关前的风控小模型。每一个请求都要先经过你，才能到达模型：放行合规的，拒绝违规的。
</p>

<p align="center">
  <a href="https://ip-please.github.io"><b>▶ 在线玩</b></a><br>
  <sub>下载仓库后直接双击 <code>index.html</code> 也能玩：纯静态页面，不加载任何外部资源。</sub>
</p>

## 内容

- **故事模式**：每天先读《安索兹卡对齐报》，再按当天的条例上岗（目前做到第五天）
- **无尽模式**：限时 / 完美 / 耐力三种玩法
- 手机横屏用手指、电脑用鼠标；也支持键盘
- 画面、音乐、音效全部由程序生成，没有音频文件或外部素材请求

## 快速上手

下一位 → 把证件拖到桌面 → 对照《规则手册》和历史记录 →『审查』两项信息找矛盾 → 把凭证拖进右侧的 放行 / 拒绝 栏盖章 → 把所有证件拖回审查窗的头像处，还给对方。

| 操作 | 鼠标 / 手指 | 键盘 |
|---|---|---|
| 接入下一位 / 跳过开场 | 点柜台上的按钮 | `空格` / `N` |
| 放行 / 拒绝 | 把凭证拖进右侧决定栏 | `A` / `D` |
| 拘留 | 审查出异常并询问后按按钮 | `S` |
| 验证 SMS | 审查出异常并询问后按按钮 | `V` |
| 打开 / 关闭审查 | 桌面右下角『审查』 | `E` |
| 规则手册 / 历史记录 | 桌面右下角的应用 | `R` / `H` |
| 静音 | 页面右上角按钮 | `M` |

完整规则、证件表、验证 SMS 与拘留机制见 **[docs/GAMEPLAY.md](docs/GAMEPLAY.md)**。

## 项目结构

```
index.html              页面与脚本载入顺序
src/                    游戏代码
  assets.js             生成的素材图集（不要手改）
  gfx.js / sfx.js       像素绘制 / 音效合成
  docs.js               桌面窗口：证件、手册、通告、事故通知、历史记录
  data.js               地区、签名、条例、规则组、随机请求生成
  story.js              故事模式逐日内容（STORY）
  station.js            全局状态、模式与计时、一班的生命周期、判定
  desk.js               桌面窗口、拖放、决定栏、输入
  inspect.js            审查模式、验证 SMS
  render-station.js     检查站绘制
  intro.js              开场与拘留押送动画
  screens.js            开机、标题、日期卡、报纸、结算、结束画面
  main.js               场景切换、输入分发、主循环
  ui.js                 页面上的声音 / 全屏按钮
docs/                   玩法、剧情与开发文档
tools/                  素材生成与检查脚本（见 tools/README.md）
media/                  logo 与分享卡片
.github/workflows/      GitHub Pages 部署
```

## 本地运行

直接双击 `index.html`，或者在仓库根目录：

```bash
python -m http.server
# 打开 http://localhost:8000
```

## 修改与重建素材

改了游戏里的文字（新出现的汉字需要进字形图集）或者头像画法之后，重新生成 `src/assets.js`：

```bash
pip install -r tools/requirements.txt
python tools/build_assets.py
```

## 检查

```bash
# 请求生成 / 条例 / 版面回归（不需要浏览器）
node tools/check_requests.js

# 浏览器回归 + 截图（需要本机 Edge）
pip install -r tools/requirements-dev.txt
python tools/screenshot_check.py
```

截图输出在 `tools/.out/shots/`（已 gitignore）。

## 部署到 GitHub Pages

推送到 `main` 后，由 `.github/workflows/pages.yml` 自动把 `index.html`、`src/`、`media/` 等运行必需的文件发布到 GitHub Pages（不含 `tools/`、`docs/`）。

首次部署前需要手动开一次开关：

1. 仓库 **Settings → Pages → Build and deployment**，把 **Source** 设为 **GitHub Actions**。
2. 到 **Actions → Deploy to GitHub Pages → Run workflow** 手动跑一次（也可以再推一次 `main` 触发）。
3. 完成后访问 `https://<用户名>.github.io/ip-please/`。

游戏全部使用相对路径，部署在子路径下也能正常运行。

## 文档

- [玩法与规则](docs/GAMEPLAY.md)
- [故事模式逐日设计](docs/STORY.md)
- [开发说明](docs/DEVELOPMENT.md)

## 致谢与许可

- 致敬 Lucas Pope 的《Papers, Please》。角色和机构均为虚构。
- 画面、音乐、音效均由 Claude Code 写程序生成。
- 代码以 [MIT](LICENSE) 许可开源。
- 像素字体：[缝合像素字体 Fusion Pixel Font](https://github.com/TakWolf/fusion-pixel-font)，SIL Open Font License 1.1（见 `OFL-fusion-pixel.txt`）。
