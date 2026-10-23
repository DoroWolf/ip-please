# tools

开发与素材工具。游戏本身不需要构建，`index.html` 直接打开就能玩。

| 路径 | 用途 |
|---|---|
| `build_assets.py` | 重新生成 `src/assets.js`（字体图集、网络头像、报纸配图、Claude 徽标）。改了游戏文字或头像画法后要跑 |
| `check_requests.js` | 纯 Node 的请求生成回归检查：请求券、审查栏位、前两天的出题范围、手册 / 通告版面 |
| `screenshot_check.py` | 用 Playwright 打开 `index.html`，跑一遍故事模式第三天的界面并截图；有 console 错误就失败 |
| `pp/base.py`、`pp/people.py` | 像素画法：画布、字体、头像生成 |
| `assets/fonts/` | 缝合像素字体 Fusion Pixel Font（8 / 10 / 12px）与 OFL 许可 |
| `requirements.txt` | 生成素材需要的依赖（pillow） |
| `requirements-dev.txt` | 另外加上浏览器检查需要的 playwright |

## 常用指令

```bash
# 生成素材（输出 src/assets.js，不要手改）
pip install -r tools/requirements.txt
python tools/build_assets.py

# 请求生成回归检查（不需要浏览器）
node tools/check_requests.js

# 浏览器回归检查（需要本机 Edge；截图输出到 tools/.out/shots/）
pip install -r tools/requirements-dev.txt
python tools/screenshot_check.py
```

`tools/.out/` 是检查脚本的输出目录，已在 `.gitignore` 里；截图不需要提交。
