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
    # 故事模式：新快捷键一律不可用，但 Esc 暂停仍然可用
    quick = page.evaluate("({mode: RUN.mode, keys: quickKeys(), pin: D.tray.pin})")
    print("story shortcuts:", json.dumps(quick, ensure_ascii=False))
    if quick["mode"] != "story" or quick["keys"]:
        errors.append("故事模式不应启用快捷键")
    if page.evaluate("D.rulebook.marksOn"):
        errors.append("故事模式的手册书签栏应停用")
    page.keyboard.press("Tab")
    page.wait_for_timeout(120)
    if page.evaluate("D.tray.pin"):
        errors.append("故事模式按 Tab 不应拉出印章台")
    page.mouse.click(250, 300)
    page.mouse.click(250, 300)
    page.wait_for_timeout(120)
    if page.evaluate("D.insp.on"):
        errors.append("故事模式快速双击不应开启审查")
    page.keyboard.press("Escape")
    page.wait_for_timeout(120)
    if not page.evaluate("D.paused"):
        errors.append("故事模式也应能用 Esc 暂停")
    page.screenshot(path=str(SHOTS / "pause_story.png"))
    page.keyboard.press("Escape")
    page.wait_for_timeout(120)
    if page.evaluate("D.paused"):
        errors.append("Esc 没有恢复游戏")
    # 无尽模式选模式页：不显示标题，玩法在上、难度在下，点『确定』才开局
    page.goto((ROOT / "index.html").as_uri())
    page.wait_for_function("typeof MODES !== 'undefined' && scene === 'boot'")
    page.mouse.click(320, 180)  # 跳过开机
    page.wait_for_timeout(700)
    page.mouse.click(320, 236)  # 无尽模式
    page.wait_for_timeout(300)
    layout = page.evaluate("""(() => ({
      tab: titleTab,
      pick: endlessPick,
      cardTop: ENDLESS_CARDS.timed[1],
      cardBottom: ENDLESS_CARDS.timed[3],
      diffTop: DIFF_BTNS[0][1],
      diffBottom: DIFF_BTNS[0][3],
      confirmTop: CONFIRM_BTN[1],
      confirmBottom: CONFIRM_BTN[3],
    }))()""")
    print("endless layout:", json.dumps(layout, ensure_ascii=False))
    if layout["tab"] != "endless" or layout["pick"] is not None:
        errors.append("无尽模式页面应默认没有选中玩法")
    if not (layout["cardBottom"] < layout["diffTop"] and layout["diffBottom"] < layout["confirmTop"]):
        errors.append("无尽模式页面应把玩法放上面、难度放下面、确定放最下面")
    if 360 - layout["confirmBottom"] > 24:
        errors.append("无尽模式页面的确定按钮没有贴到底部")
    diff_layout = page.evaluate("""(() => {
      const w4 = Math.floor((W - 80 - DIFF_GAP * (DIFF_SLOTS - 1)) / DIFF_SLOTS);
      return {
        slots: DIFF_SLOTS,
        fourWidth: 4 * w4 + DIFF_GAP * 3,
        room: W - 80,
        descFits: DIFFS.every((d) => tw(d.desc, 8) <= w4 - 12),
      };
    })()""")
    print("difficulty slots:", json.dumps(diff_layout))
    if diff_layout["slots"] != 4 or diff_layout["fourWidth"] > diff_layout["room"]:
        errors.append("难度按钮没有按四档预留")
    if not diff_layout["descFits"]:
        errors.append("难度按钮里的证件说明放不下")
    page.screenshot(path=str(SHOTS / "endless_select.png"))
    # 点玩法卡只选中、不直接开局；再点确定才进入检查站
    page.mouse.click(130, 130)
    page.wait_for_timeout(150)
    if page.evaluate("endlessPick") != "timed" or page.evaluate("scene") != "title":
        errors.append("无尽模式点玩法卡应只选中，不直接开局")
    page.screenshot(path=str(SHOTS / "endless_selected.png"))
    page.mouse.click(320, 320)  # 确定
    page.wait_for_function("scene === 'desk'")
    if page.evaluate("RUN.mode") != "timed":
        errors.append("无尽模式点确定后没有按选中的玩法开局")
    if not page.evaluate("D.rulebook.marksOn"):
        errors.append("无尽模式的手册书签栏应打开")
    page.wait_for_timeout(300)
    page.evaluate("if (D.intro !== null) endIntro()")
    page.wait_for_timeout(200)
    page.mouse.click(40, 335)  # 下一位
    page.wait_for_timeout(400)
    if not page.evaluate("!!D.ent"):
        errors.append("无尽模式点下一位后没有接入请求")
    # 通告日期：能核对有效期，和系统日期互查是无关联
    dateRel = page.evaluate("""(() => {
      let s;
      do { s = makeRequest(today(), 0, D.wanted, rules()); }
      while (!(s.docs.some((d) => d.key === 'cred') && s.docs.some((d) => d.key === 'brw' && d.fields['brw.签发'])));
      const e = { handed: true, leaving: false, spec: s };
      const key = (a, b) => [a, b].sort().join('|');
      return {
        expiry: compareOutcome(e, key('cred.有效期', 'notice.date')).kind,
        issued: compareOutcome(e, key('brw.签发', 'notice.date')).kind,
        dates: compareOutcome(e, key('notice.date', 'sys.日期')).kind,
      };
    })()""")
    print("notice date review:", json.dumps(dateRel, ensure_ascii=False))
    if dateRel["expiry"] != "ok":
        errors.append("通告日期應能核對有效期")
    if dateRel["issued"] != "ok":
        errors.append("通告日期應能核對簽發日期")
    if dateRel["dates"] != "none":
        errors.append("通告日期和系統日期應顯示無關聯")
    # 旧快捷键全部失效
    page.keyboard.press("a")
    page.keyboard.press("e")
    page.keyboard.press("Space")
    page.wait_for_timeout(120)
    if page.evaluate("D.ent && D.ent.decided") or page.evaluate("D.insp.on"):
        errors.append("旧的快捷键仍然有效")
    # Esc 暂停：界面出现、计时停住；再按一次恢复
    page.keyboard.press("Escape")
    page.wait_for_timeout(150)
    if not page.evaluate("D.paused"):
        errors.append("Esc 没有打开暂停界面")
    t1 = page.evaluate("elapsed()")
    page.wait_for_timeout(450)
    t2 = page.evaluate("elapsed()")
    print("pause elapsed:", round(t1, 3), round(t2, 3))
    if abs(t2 - t1) > 0.05:
        errors.append("暂停期间计时没有停住")
    page.screenshot(path=str(SHOTS / "pause_endless.png"))
    page.keyboard.press("Escape")
    page.wait_for_timeout(120)
    if page.evaluate("D.paused"):
        errors.append("Esc 没有关闭暂停界面")
    t3 = page.evaluate("elapsed()")
    page.wait_for_timeout(350)
    if page.evaluate("elapsed()") <= t3:
        errors.append("恢复后计时没有继续走")
    # 暂停界面只有『继续』和『主菜单』两个按钮；点继续恢复
    if page.evaluate("'keys' in PAUSE"):
        errors.append("暂停界面应只有继续 / 主菜单两个按钮")
    page.keyboard.press("Escape")
    page.wait_for_timeout(120)
    page.mouse.click(320, 175)  # 继续
    page.wait_for_timeout(120)
    if page.evaluate("D.paused"):
        errors.append("点继续没有恢复游戏")
    # Tab / Enter 拉出 / 收起印章台
    page.keyboard.press("Tab")
    page.wait_for_timeout(150)
    if not page.evaluate("D.tray.pin"):
        errors.append("Tab 没有钉住印章台")
    page.screenshot(path=str(SHOTS / "tray_pinned.png"))
    page.keyboard.press("Enter")
    page.wait_for_timeout(150)
    if page.evaluate("D.tray.pin"):
        errors.append("Enter 没有收起印章台")
    # 快速双击：只有审查框会开启审查并选中；空白处双击不开启
    page.mouse.click(250, 300)
    page.mouse.click(250, 300)
    page.wait_for_timeout(150)
    if page.evaluate("D.insp.on"):
        errors.append("空白处快速双击不应开启审查")
    center = page.evaluate("""(() => {
      const f = fieldBoxes().find((x) => x.key === 'notice.date');
      return f ? [(f.box[0] + f.box[2]) / 2, (f.box[1] + f.box[3]) / 2] : null;
    })()""")
    if not center:
        errors.append("通告缺少公告日期审查框")
    else:
        page.mouse.click(int(center[0]), int(center[1]))
        page.mouse.click(int(center[0]), int(center[1]))
        page.wait_for_timeout(150)
        sel = page.evaluate("D.insp.sel.map((s) => s.key)")
        if not page.evaluate("D.insp.on") or "notice.date" not in sel:
            errors.append("双击审查框没有开启审查并选中")
        page.screenshot(path=str(SHOTS / "inspect_doubleclick.png"))
    # 滑动窗口：选第三个时最早的选择取消
    for key in ["rv.IP", "rv.昵称", "rv.类型"]:
        c = page.evaluate("(() => { const f = fieldBoxes().find((x) => x.key === %r); return f ? [(f.box[0] + f.box[2]) / 2, (f.box[1] + f.box[3]) / 2] : null; })()" % key)
        if not c:
            errors.append("缺少审查框：" + key)
            continue
        page.mouse.click(int(c[0]), int(c[1]))
        page.wait_for_timeout(90)
    sel = page.evaluate("D.insp.sel.map((s) => s.key)")
    print("inspect slide:", json.dumps(sel, ensure_ascii=False))
    if sel != ["rv.昵称", "rv.类型"]:
        errors.append("审查选择没有按滑动窗口只保留最近两项")
    page.evaluate("setInspect(false)")
    # 柜台证件溢出：指针贴在左右边缘时自动滚动
    page.evaluate("""(() => {
      for (let i = 0; i < 6; i++) D.icons.push({ win: new Doc('brw', [['语言', '日本語']], null) });
      layoutIcons();
    })()""")
    page.mouse.move(205, 336)
    page.wait_for_timeout(450)
    scrolled = page.evaluate("({scroll: D.iconScroll, first: D.icons[0].x, max: iconMaxScroll()})")
    print("counter scroll:", json.dumps(scrolled, ensure_ascii=False))
    if scrolled["scroll"] <= 0 or scrolled["first"] >= 80:
        errors.append("柜台证件溢出时右侧自动滚动失效")
    page.screenshot(path=str(SHOTS / "counter_scroll.png"))
    page.mouse.move(76, 336)
    page.wait_for_timeout(600)
    if page.evaluate("D.iconScroll") != 0:
        errors.append("柜台左侧自动滚动没有回到开头")
    # 暂停界面的主菜单
    page.keyboard.press("Escape")
    page.wait_for_timeout(120)
    page.mouse.click(320, 215)  # 主菜单
    page.wait_for_function("scene === 'title'")
    print("errors:", errors)
    browser.close()

if errors:
    sys.exit(1)
