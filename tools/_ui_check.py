from playwright.sync_api import sync_playwright
import json
import os

ROOT = r"D:/dorow/Documents/GitHub/ip-please"
SHOTS = os.path.join(ROOT, "tools", "_shots")
os.makedirs(SHOTS, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 640, "height": 360})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(f"console {m.type}: {m.text}") if m.type == "error" else None)
    page.goto(f"file:///{ROOT}/index.html")
    page.wait_for_function("typeof STORY !== 'undefined' && scene === 'boot'")
    page.mouse.click(320, 180)
    page.wait_for_timeout(700)
    page.mouse.click(210, 225)  # 故事模式
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
    page.screenshot(path=os.path.join(SHOTS, "day3_news.png"))
    state1 = page.evaluate("({scene, day: RUN.day, story: STORY.length, news: STORY[2].news, voucher: rules().voucher})")
    print("state1:", json.dumps(state1, ensure_ascii=False))
    page.mouse.click(320, 180)  # 报纸 -> 上岗
    page.wait_for_function("scene === 'desk' && D")
    page.wait_for_timeout(300)
    page.evaluate("if (D.intro !== null) endIntro()")
    page.wait_for_timeout(300)
    state2 = page.evaluate("({scene, day: RUN.day, noticeH: D.notice.h, noticePages: D.notice.pages.map(p=>p.h), rulebookH: D.rulebook.h, npages: D.rulebook.npages})")
    print("state2:", json.dumps(state2, ensure_ascii=False))
    page.screenshot(path=os.path.join(SHOTS, "day3_notice1.png"))
    # 通告第 3 页（请求券附页）
    page.mouse.click(316 + 220 - 40, 126 + 6)
    page.wait_for_timeout(150)
    page.mouse.click(316 + 220 - 40, 126 + 6)
    page.wait_for_timeout(150)
    state3 = page.evaluate("({page: D.notice.page, h: D.notice.pages[D.notice.page].h})")
    print("notice page:", json.dumps(state3, ensure_ascii=False))
    page.screenshot(path=os.path.join(SHOTS, "day3_notice_voucher.png"))
    # 規則手冊：條例頁 / 支持地區頁
    page.evaluate("openApp('book'); D.rulebook.page = 2")
    page.wait_for_timeout(200)
    print("rules fields:", page.evaluate("Object.keys(D.rulebook.pages[2].fields)"))
    page.screenshot(path=os.path.join(SHOTS, "day3_rulebook_rules.png"))
    page.evaluate("D.rulebook.page = 3")
    page.wait_for_timeout(150)
    print("regions fields:", page.evaluate("Object.keys(D.rulebook.pages[3].fields)"))
    page.screenshot(path=os.path.join(SHOTS, "day3_rulebook_regions.png"))
    # 單獨把請求券放到桌面上截圖
    page.evaluate("""
      D.wins = D.wins.filter(w => w.kind !== 'notice' && w.kind !== 'book');
      const v = new Doc('voucher', [['有效期', '2077.12.31']], null);
      addWin(v, 'doc', 236, 150);
    """)
    page.wait_for_timeout(200)
    print("voucher doc:", page.evaluate("(() => { const w = D.wins.find(w => w.kind==='doc'); return {title:w.win.title, sub:w.win.sub, h:w.win.h, rows:w.win.rows, fields:Object.keys(w.win.fields)}; })()"))
    page.screenshot(path=os.path.join(SHOTS, "day3_voucher_window.png"))
    # 字型與請求生成檢查
    print("glyphs:", page.evaluate("['券','堵','塞','滞','逾','积','压','者','视'].map(c => c + ':' + !!ASSETS.font[12][c]).join(' ')"))
    sample = page.evaluate("""(() => {
      let home = 0, foreign = 0, unsupported = 0, voucher = 0, noVoucher = 0, bad = 0;
      for (let i = 0; i < 2000; i++) {
        const s = makeRequest(today(), mode().pBad, D.wanted, rules());
        const cred = s.docs.find(d => d.key === 'cred');
        const region = cred.rows.find(r => r[0] === '地区')[1];
        const supported = rules().regions.includes(region);
        const isHome = region === '美国';
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
