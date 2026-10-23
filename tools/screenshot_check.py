"""浏览器回归检查：打开 index.html，走一遍故事模式第三天的界面，截图并报告 console 错误。

  pip install -r tools/requirements-dev.txt
  python tools/screenshot_check.py

- 直接以 file:// 打开 index.html，验证「双击就能玩」没有被破坏
- 截图输出到 tools/.out/shots/（已 gitignore）
- 有任何 pageerror / console error 就以非零状态退出
"""
from pathlib import Path
import json
import sys

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "tools" / ".out" / "shots"
SHOTS.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 640, "height": 360})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(f"console {m.type}: {m.text}") if m.type == "error" else None)
    page.goto((ROOT / "index.html").as_uri())
    page.wait_for_function("typeof STORY !== 'undefined' && scene === 'boot'")
    page.mouse.click(320, 180)
    page.wait_for_timeout(700)
    page.mouse.click(320, 186)  # 故事模式
    page.wait_for_timeout(300)
    nodes = page.evaluate("dayNodes")
    print("day nodes:", nodes)
    d3 = nodes[2]
    page.mouse.click((d3[0] + d3[2]) // 2, (d3[1] + d3[3]) // 2)
    page.wait_for_function("scene === 'daycard'")
    page.wait_for_timeout(1200)
    page.mouse.click(320, 180)  # 日期卡 -> 报纸
    page.wait_for_function("scene === 'news'")
    page.wait_for_timeout(1600)
    page.screenshot(path=str(SHOTS / "day3_news.png"))
    state1 = page.evaluate("({scene, day: RUN.day, story: STORY.length, news: STORY[2].news, voucher: rules().voucher})")
    print("state1:", json.dumps(state1, ensure_ascii=False))
    page.mouse.click(320, 180)  # 报纸 -> 上岗
    page.wait_for_function("scene === 'desk' && D")
    page.wait_for_timeout(300)
    page.evaluate("if (D.intro !== null) endIntro()")
    page.wait_for_timeout(300)
    state2 = page.evaluate("({scene, day: RUN.day, noticeH: D.notice.h, noticePages: D.notice.pages.map(p=>p.h), rulebookH: D.rulebook.h, npages: D.rulebook.npages})")
    print("state2:", json.dumps(state2, ensure_ascii=False))
    page.screenshot(path=str(SHOTS / "day3_notice1.png"))
    # 通告：标题列右侧英文副标 + ◀ 页码 ▶（第 3 页 = 请求券附页）
    def tab_center(win, box):
        return (win["x"] + (box[0] + box[2]) / 2, win["y"] + (box[1] + box[3]) / 2)
    notice = page.evaluate("(() => { const w = D.wins.find(w => w.kind === 'notice'); return { x: w.x, y: w.y, sub: w.win.sub, prev: w.win.tabs.prev, next: w.win.tabs.next }; })()")
    if notice["sub"] != "NOTICE":
        errors.append("通告缺少右侧英文副标 NOTICE")
    page.mouse.click(*tab_center(notice, notice["next"]))
    page.wait_for_timeout(150)
    page.mouse.click(*tab_center(notice, notice["next"]))
    page.wait_for_timeout(150)
    state3 = page.evaluate("({page: D.notice.page, h: D.notice.pages[D.notice.page].h})")
    print("notice page:", json.dumps(state3, ensure_ascii=False))
    page.screenshot(path=str(SHOTS / "day3_notice_voucher.png"))
    # 左按钮回到上一页，再按右按钮回来
    page.mouse.click(*tab_center(notice, notice["prev"]))
    page.wait_for_timeout(150)
    if page.evaluate("D.notice.page") != state3["page"] - 1:
        errors.append("通告左按钮没有翻回上一页")
    page.mouse.click(*tab_center(notice, notice["next"]))
    page.wait_for_timeout(150)
    if page.evaluate("D.notice.page") != state3["page"]:
        errors.append("通告右按钮没有翻回下一页")
    # 规则手册：条例页 / 支持地区页（内容太长时会自动分成续页）
    page.evaluate("openApp('book'); D.rulebook.page = 2")
    page.wait_for_timeout(200)
    # 标题列右侧英文副标 + 翻页列：先按右按钮，再按左按钮回到原页
    book = page.evaluate("(() => { const w = D.wins.find(w => w.kind === 'book'); return { x: w.x, y: w.y, sub: w.win.sub, prev: w.win.tabs.prev, next: w.win.tabs.next, page: w.win.page }; })()")
    if book["sub"] != "CONSTITUTION":
        errors.append("规则手册缺少右侧英文副标 CONSTITUTION")
    page.mouse.click(*tab_center(book, book["next"]))
    page.wait_for_timeout(150)
    if page.evaluate("D.rulebook.page") != book["page"] + 1:
        errors.append("规则手册右按钮没有翻到下一页")
    page.mouse.click(*tab_center(book, book["prev"]))
    page.wait_for_timeout(150)
    if page.evaluate("D.rulebook.page") != book["page"]:
        errors.append("规则手册左按钮没有翻回上一页")
    print("rules fields:", page.evaluate("Object.keys(D.rulebook.pages[2].fields)"))
    page.screenshot(path=str(SHOTS / "day3_rulebook_rules.png"))
    region_pages = page.evaluate("""(() => D.rulebook.pages
      .map((p, i) => [i, p.rows[0] && p.rows[0].s])
      .filter(([, head]) => head === '二、支持地区' || head === '二、支持地区（续）')
      .map(([i]) => i))()""")
    print("regions pages:", region_pages)
    for k, idx in enumerate(region_pages):
        page.evaluate(f"D.rulebook.page = {idx}")
        page.wait_for_timeout(150)
        print(f"regions fields p{idx}:", page.evaluate(f"Object.keys(D.rulebook.pages[{idx}].fields)"))
        page.screenshot(path=str(SHOTS / f"day3_rulebook_regions{k + 1}.png"))
    # 单独把请求券放到桌面上截图
    page.evaluate("""
      D.wins = D.wins.filter(w => w.kind !== 'notice' && w.kind !== 'book');
      const v = new Doc('voucher', [['有效期', '2077.12.31']], null);
      addWin(v, 'doc', 236, 150);
    """)
    page.wait_for_timeout(200)
    print("voucher doc:", page.evaluate("(() => { const w = D.wins.find(w => w.kind==='doc'); return {title:w.win.title, sub:w.win.sub, h:w.win.h, rows:w.win.rows, fields:Object.keys(w.win.fields)}; })()"))
    page.screenshot(path=str(SHOTS / "day3_voucher_window.png"))
    # SMS 表单：「将此表单交给用户」是独立提示，不能和手机号栏位混在一起
    page.evaluate("""
      D.wins = D.wins.filter(w => w.kind !== 'doc');
      const f = new InfoWin('smsf', '验证 SMS', 'SMS', [['手机', '________________']], '', '将此表单交给用户');
      addWin(f, 'smsf', 236, 150);
    """)
    page.wait_for_timeout(200)
    sms_form = page.evaluate("(() => { const w = D.wins.find(w => w.kind==='smsf'); return {note:w.win.note, rows:w.win.rows, h:w.win.h, fields:Object.keys(w.win.fields)}; })()")
    print("sms form:", json.dumps(sms_form, ensure_ascii=False))
    if sms_form["note"] != "将此表单交给用户" or sms_form["rows"] != [["手机", "________________"]]:
        errors.append("SMS 表单提示语没有独立放在表单外")
    page.screenshot(path=str(SHOTS / "sms_form.png"))
    # API 授权：只剩 IP / 用途 / 有效期，不再有「持有人」
    page.evaluate("""
      D.wins = D.wins.filter(w => w.kind !== 'smsf');
      const d = new Doc('api', [['IP', '10.0.0.1'], ['用途', API_TASKS[0]], ['有效期', '2078.01.05']], genuine('api'));
      addWin(d, 'doc', 260, 150);
    """)
    page.wait_for_timeout(200)
    api_doc = page.evaluate("(() => { const w = D.wins.find(w => w.kind === 'doc'); return {rows:w.win.rows, fields:Object.keys(w.win.fields), h:w.win.h}; })()")
    print("api doc:", json.dumps(api_doc, ensure_ascii=False))
    if [r[0] for r in api_doc["rows"]] != ["IP", "用途", "有效期"] or "api.持有人" in api_doc["fields"]:
        errors.append("API 授权仍带有持有人栏位")
    page.screenshot(path=str(SHOTS / "api_doc.png"))
    # 字形与请求生成检查
    print("glyphs:", page.evaluate("['券','堵','塞','滞','逾','积','压','者','视','澳','利','悉','尼','渥','华','续'].map(c => c + ':' + !!ASSETS.font[12][c]).join(' ')"))
    sample = page.evaluate("""(() => {
      let home = 0, foreign = 0, unsupported = 0, voucher = 0, noVoucher = 0, bad = 0;
      for (let i = 0; i < 2000; i++) {
        const s = makeRequest(today(), mode().pBad, D.wanted, rules());
        const cred = s.docs.find(d => d.key === 'cred');
        const region = cred.rows.find(r => r[0] === '地区')[1];
        const supported = rules().regions.includes(region);
        const isHome = HOME_REGIONS.includes(region);
        const isForeign = supported && !isHome;
        const isUnsupported = !supported;
        const v = s.docs.find(d => d.key === 'voucher');
        if (isHome) home++;
        if (isForeign) foreign++;
        if (isUnsupported) unsupported++;
        if (v) voucher++;
        if (isForeign && !v && s.flaw === 'no_voucher') noVoucher++;
        if (isForeign && !v && s.flaw !== 'no_voucher') bad++;
        if (isUnsupported && (v || s.flaw !== 'region')) bad++;
        if (isHome && (v || s.flaw === 'no_voucher')) bad++;
        if (v && (v.rows.length !== 1 || v.rows[0][0] !== '有效期')) bad++;
      }
      return {home, foreign, unsupported, voucher, noVoucher, bad};
    })()""")
    print("sample:", json.dumps(sample, ensure_ascii=False))
    print("errors:", errors)
    browser.close()

if errors:
    sys.exit(1)
