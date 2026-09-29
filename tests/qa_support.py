"""Shared browser evidence helpers; the caller owns the served build."""

import argparse
import re
import json
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

ROUTES = ["/", "/research/", "/publications/", "/people/", "/contact/"]
WIDTHS = [320, 390, 768, 1024, 1440]
LAB_NAME = "Scientific Inference Lab"


ANALYTICS_ID = "G-H8EZQ381WH"
ANALYTICS = re.compile(r"^https://([a-z0-9-]+\.)*(googletagmanager\.com|google-analytics\.com|analytics\.google\.com)/")


def program_records():
    records = json.loads((Path(__file__).resolve().parents[1] / "src/content/programs.json").read_text())
    ids = [record["id"] for record in records]
    assert len(ids) >= 4, "The four-direction research inventory must not regress"
    assert len(set(ids)) == len(ids), "Research program IDs must be unique"
    assert {"ai-for-science", "continuous-time-modeling", "evidence-centered-ai"}.issubset(ids), "Existing research fragments must remain available"
    return sorted(records, key=lambda record: record["order"])


PROGRAMS = [record["id"] for record in program_records()]


def publication_records():
    return json.loads((Path(__file__).resolve().parents[1] / "src/content/publications.json").read_text())


def navigation(page):
    return page.locator('[data-site-header] nav[aria-label="Main navigation"]:visible').first


def link_tab_key(page, engine, reverse=False):
    # macOS WebKit's default Tab skips links; Option-Tab includes them.
    # Keep strict focus/order assertions, using the platform's native shortcut.
    # https://support.apple.com/guide/safari/cpsh003/mac
    mac_webkit = engine == 'webkit' and page.evaluate("navigator.platform.includes('Mac')")
    return ('Alt+' if mac_webkit else '') + ('Shift+' if reverse else '') + 'Tab'


def menu_is_open(page):
    return page.locator("details[data-mobile-navigation]").evaluate("el => el.open")


def set_menu_open(page, opened):
    details = page.locator("details[data-mobile-navigation]")
    if details.evaluate("el => el.open") != opened:
        page.locator("[data-menu-toggle]").click()
    expect(details).to_have_js_property("open", opened)


def arguments(description):
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--base", required=True)
    parser.add_argument("--engine", choices=["chromium", "webkit"], default="chromium")
    parser.add_argument("--out", required=True)
    parser.add_argument("--browser")
    return parser.parse_args()


class Evidence:
    def __init__(self, args, suite):
        self.args = args
        self.out = Path(args.out)
        self.out.mkdir(parents=True, exist_ok=True)
        self.report = {
            "suite": suite, "status": "running", "base": args.base,
            "engine": args.engine, "startedAt": datetime.now(timezone.utc).isoformat(),
            "checks": [], "pageErrors": [], "consoleErrors": [], "failedRequests": [],
            "canceledImageRequests": [], "injectedScriptErrors": [],
            "limitations": ["Browser emulation, not physical-device certification.",
                            "Root text enlargement is not browser UI zoom.",
                            "Automated results do not constitute visual acceptance."],
        }
        self.last_page = None

    def watch(self, page, injected_scripts=None):
        self.last_page = page
        page._qa_evidence = self
        page._qa_image_failures = []

        def expected_script_error(message, url=""):
            if not injected_scripts:
                return False
            if url in injected_scripts or any(source in message for source in injected_scripts):
                return True
            injected_paths = [urlparse(source).path for source in injected_scripts]
            if "Importing a module script failed." in message and any(source in message for source in injected_paths):
                return True
            return message in ["TypeError: Importing a module script failed.", "Importing a module script failed."]

        def page_error(error):
            entry = {"url": page.url, "error": str(error)}
            destination = "injectedScriptErrors" if expected_script_error(str(error)) else "pageErrors"
            self.report[destination].append(entry)

        def console_error(message):
            if message.type != "error":
                return
            entry = {"url": message.location.get("url", page.url), "error": message.text}
            destination = "injectedScriptErrors" if expected_script_error(message.text, entry["url"]) else "consoleErrors"
            self.report[destination].append(entry)

        def failed_request(request):
            # Playwright emits cancellation events for still-referenced module
            # resources when the completed test explicitly closes its context.
            # Those cleanup events occur after the final network-idle gate and
            # are not page-load failures; all earlier cancellations stay strict.
            if getattr(page, "_qa_cleanup", False):
                return
            entry = {"url": request.url, "document": page.url, "resourceType": request.resource_type, "error": request.failure}
            if injected_scripts is not None and request.resource_type == "script" and request.url in injected_scripts:
                self.report["injectedScriptErrors"].append(entry)
                return
            self.report["failedRequests"].append(entry)
            if request.resource_type == "image" and request.failure == "net::ERR_ABORTED":
                page._qa_image_failures.append(entry)

        # The production host loads GA4. QC must never reach Google: every
        # context sets GA's documented opt-out flag and answers Google requests
        # with an empty response. Both are context-wide so tabs opened by the
        # page are covered; a live run once sent a hit from such a tab when
        # only a network stub was present.
        def analytics_stub(request_route):
            self.report.setdefault("stubbedAnalytics", []).append(request_route.request.url)
            request_route.fulfill(status=200, body="", content_type="application/javascript")

        if not getattr(page.context, "_qa_analytics_stub", False):
            page.context._qa_analytics_stub = True
            page.context.add_init_script(f"window['ga-disable-{ANALYTICS_ID}'] = true;")
            page.context.route(ANALYTICS, analytics_stub)
        page.on("pageerror", page_error)
        page.on("console", console_error)
        page.on("requestfailed", failed_request)
        page.set_default_timeout(10000)
        page.set_default_navigation_timeout(30000)
        return page

    def images_settled(self, page, images):
        current = {image["src"] for image in images}
        for failure in list(page._qa_image_failures):
            if failure["url"] in current:
                continue
            # Only retired image sources are classified, after all current images
            # have decoded successfully. Current/broken media remains a failure.
            failure["reason"] = "Aborted image source is no longer used by the settled document."
            failure["settledDocument"] = page.url
            failure["replacementImages"] = sorted(current)
            self.report["failedRequests"].remove(failure)
            self.report["canceledImageRequests"].append(failure)
            page._qa_image_failures.remove(failure)

    def check(self, name, details=None):
        self.report["checks"].append({"name": name, "details": details})

    def screenshot(self, page, name, full=True):
        if full:
            # Browsers refuse bitmaps over 32767 device px per side (Linux WebKit
            # in CI enforces it; e.g. Publications at 200% text and DPR 2). Keep the
            # evidence as the top 32000 device px and record the truncation.
            height, ratio = page.evaluate("() => [document.documentElement.scrollHeight, window.devicePixelRatio]")
            if height * ratio > 32000:
                width = page.evaluate("() => document.documentElement.clientWidth")
                page.screenshot(path=str(self.out / f"{name}.png"), full_page=True, timeout=15000,
                                clip={"x": 0, "y": 0, "width": width, "height": int(32000 / ratio)})
                self.report.setdefault("truncatedScreenshots", []).append({"name": name, "cssHeight": height, "dpr": ratio})
                return
        page.screenshot(path=str(self.out / f"{name}.png"), full_page=full, timeout=15000)

    def finish(self, error=None):
        if error:
            self.report["error"] = str(error)
            if self.last_page and not self.last_page.is_closed():
                try:
                    self.screenshot(self.last_page, "failure")
                    (self.out / "failure.html").write_text(self.last_page.content())
                except Exception as screenshot_error:
                    self.report["captureError"] = str(screenshot_error)
        self.report["status"] = "failed" if error else "passed"
        self.report["finishedAt"] = datetime.now(timezone.utc).isoformat()
        (self.out / "report.json").write_text(json.dumps(self.report, indent=2) + "\n")
        print(f"{self.report['suite']} {self.report['engine']}: {self.report['status']} ({len(self.report['checks'])} checks)")

    def assert_clean(self):
        assert not self.report["pageErrors"], self.report["pageErrors"]
        assert not self.report["consoleErrors"], self.report["consoleErrors"]
        assert not self.report["failedRequests"], self.report["failedRequests"]


@contextmanager
def session(args, suite):
    evidence = Evidence(args, suite)
    with sync_playwright() as playwright:
        browser = None
        try:
            options = {"headless": True}
            if args.browser:
                assert args.engine == "chromium", "--browser is a Chromium override only"
                options["executable_path"] = args.browser
            browser = getattr(playwright, args.engine).launch(**options)
            evidence.report["browserVersion"] = browser.version
            yield browser, evidence
            evidence.assert_clean()
        except BaseException as error:
            evidence.finish(error)
            raise
        else:
            evidence.finish()
        finally:
            if browser:
                browser.close()


def visit(page, base, route, javascript=True):
    response = page.goto(base.rstrip("/") + route, wait_until="networkidle")
    if response is not None:
        assert response.status in (200, 304), (route, response.status)
    assert page.locator("main").count() == 1, route
    page.evaluate("document.fonts.ready")
    # requestAnimationFrame need not advance in a scripts-disabled browser page.
    if javascript:
        page.evaluate("() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
        page.wait_for_function("!document.querySelector('astro-island[ssr]')")
        page.wait_for_load_state("networkidle")
    page.wait_for_timeout(80)
    media(page)


def geometry(page, viewport):
    result = page.evaluate("""(viewport) => {
      const visible = el => {
        // Closed native disclosures can expose layout boxes for unpainted content.
        for (let parent = el.parentElement; parent; parent = parent.parentElement) {
          if (parent.matches('details:not([open])') && !parent.querySelector(':scope > summary')?.contains(el)) return false;
        }
        const s = getComputedStyle(el), r = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !el.closest('[hidden]');
      };
      const root = document.documentElement, edge = Math.min(root.clientWidth, viewport), issues = [];
      for (const el of document.body.querySelectorAll('*')) {
        if (!visible(el) || el.closest('svg') || el.matches('script,style,link')) continue;
        const r = el.getBoundingClientRect();
        if (r.left < -1.5 || r.right > edge + 1.5) {
          issues.push({tag: el.tagName, id: el.id, class: String(el.className).slice(0,160), left:r.left, right:r.right, text:el.textContent.trim().slice(0,80)});
        }
      }
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode, parent = node.parentElement;
        if (!node.textContent.trim() || !parent || !visible(parent) || parent.closest('svg,script,style')) continue;
        const range = document.createRange(); range.selectNodeContents(node);
        for (const r of range.getClientRects()) {
          if (r.width > 0 && (r.left < -1.5 || r.right > edge + 1.5)) {
            issues.push({tag:'text', text:node.textContent.trim().slice(0,100), left:r.left, right:r.right});
          }
        }
      }
      return {clientWidth:root.clientWidth, innerWidth, scrollWidth:root.scrollWidth, viewport, issues:issues.slice(0,30)};
    }""", viewport)
    assert result["clientWidth"] <= viewport + 1, result
    assert result["scrollWidth"] <= viewport + 1, result
    assert not result["issues"], result
    return result


def whole_words(page, selector):
    result = page.locator(selector).evaluate_all('''links => {
      const broken=[];
      for (const link of links) {
        const walker=document.createTreeWalker(link,NodeFilter.SHOW_TEXT);
        while(walker.nextNode()) {
          const node=walker.currentNode;
          for(const match of node.textContent.matchAll(/[A-Za-z0-9]+/g)) {
            const range=document.createRange();
            range.setStart(node,match.index); range.setEnd(node,match.index+match[0].length);
            const lines=new Set([...range.getClientRects()].filter(r=>r.width>0).map(r=>Math.round(r.top)));
            if(lines.size>1) broken.push({word:match[0],lines:lines.size,link:link.getAttribute('href')});
          }
        }
      }
      return {controls:links.length,broken};
    }''')
    assert not result['broken'], result
    return result


def research_label_words(page):
    result = whole_words(page, '[data-home-program], [data-program-link]')
    assert result['controls'] == len(PROGRAMS), result
    return result


def readable(page):
    whole_words(page, 'main h1, main h2, main h3')
    heading = page.locator('main h1').evaluate('''el => {
      const parent=el.parentElement.getBoundingClientRect(), range=document.createRange();
      range.selectNodeContents(el);
      return {left:parent.left,right:parent.right,lines:[...range.getClientRects()].map(r=>({left:r.left,right:r.right}))};
    }''')
    assert all(line['left'] >= heading['left'] - 1 and line['right'] <= heading['right'] + 1 for line in heading['lines']), heading
    footer_email = page.locator('[data-footer-email]').evaluate('''el => {
      const parent=el.parentElement.getBoundingClientRect(), anchor=el.getBoundingClientRect();
      return {left:Math.max(parent.left,anchor.left),right:Math.min(parent.right,anchor.right),
        parts:[...el.querySelectorAll('.email-part')].map(part=>{
          const range=document.createRange(); range.selectNodeContents(part);
          return {text:part.textContent,rects:[...range.getClientRects()].filter(r=>r.width>0).map(r=>({left:r.left,right:r.right,top:r.top}))};
        })};
    }''')
    assert len(footer_email['parts']) == 2, footer_email
    for part in footer_email['parts']:
        assert len({round(rect['top']) for rect in part['rects']}) == 1, footer_email
        assert all(rect['left'] >= footer_email['left'] - 1 and rect['right'] <= footer_email['right'] + 1 for rect in part['rects']), footer_email
    result = page.evaluate("""() => {
      const main = document.querySelector('main'), rect = main.getBoundingClientRect();
      const h = main.querySelector('h1'), s = h && getComputedStyle(h);
      let visible = true;
      for (let node=h; node; node=node.parentElement) {
        const style=getComputedStyle(node);
        if (style.display==='none'||style.visibility==='hidden'||Number(style.opacity)<.05) visible=false;
      }
      return {text:main.innerText.trim().length, height:rect.height, h1:!!h,
        opacity:s?.opacity, visibility:s?.visibility, display:s?.display, ancestorsVisible:visible};
    }""")
    assert result["text"] > 150 and result["height"] > 100 and result["h1"], result
    assert result["opacity"] != "0" and result["visibility"] != "hidden" and result["display"] != "none", result
    assert result["ancestorsVisible"], result


def identities(page):
    result = page.evaluate("""() => [...document.querySelectorAll('.wordmark-text')].map(el => {
      const range = document.createRange(); range.selectNodeContents(el);
      const rects = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0);
      const tops = [...new Set(rects.map(r=>Math.round(r.top)))];
      return {text:el.textContent.trim(), lines:tops.length, width:el.getBoundingClientRect().width, fontSize:getComputedStyle(el).fontSize};
    })""")
    assert result, "No real-text lab identity found"
    for item in result:
        assert item["text"] == LAB_NAME and item["lines"] == 1, item
    header = page.locator("[data-site-header]").inner_text()
    assert "Pusan" not in header and "University" not in header, header
    return result


def media(page):
    page.evaluate("""async () => {
      const images = [...document.images];
      for (const image of images) image.loading = 'eager';
      await Promise.all(images.map(image => image.decode().catch(() => {})));
    }""")
    try:
        page.wait_for_function(
            "() => [...document.images].every(image => image.complete && image.naturalWidth > 0)",
            timeout=30000,
        )
    except Exception as error:
        pending = page.evaluate("""() => [...document.images]
          .filter(image => !image.complete || image.naturalWidth <= 0)
          .map(image => ({src:image.currentSrc || image.src, complete:image.complete,
            naturalWidth:image.naturalWidth, loading:image.loading}))""")
        raise AssertionError({"unsettledImages": pending, "document": page.url}) from error
    images = page.evaluate("""() => [...document.images].map(image => ({
      src:image.currentSrc || image.src, complete:image.complete,
      naturalWidth:image.naturalWidth, naturalHeight:image.naturalHeight,
      width:image.getBoundingClientRect().width,height:image.getBoundingClientRect().height,
      alt:image.getAttribute('alt'),srcset:image.getAttribute('srcset') || image.closest('picture')?.querySelector('source[srcset]')?.getAttribute('srcset'),
      widthAttribute:image.getAttribute('width'),heightAttribute:image.getAttribute('height')
    }))""")
    assert images, "This route must contain its intended visual/identity assets"
    for item in images:
        assert item["complete"] and item["naturalWidth"] > 0, item
        assert item["alt"] is not None, item
        assert item["widthAttribute"] and item["heightAttribute"], item
    if hasattr(page, "_qa_evidence"):
        page._qa_evidence.images_settled(page, images)
    return images


def fallback_content(page):
    readable(page)
    toggle = page.locator("[data-menu-toggle]")
    was_open = menu_is_open(page) if toggle.is_visible() else None
    if was_open is False:
        set_menu_open(page, True)
    assert navigation(page).is_visible()
    assert navigation(page).locator("a").count() == 4
    if was_open is False:
        set_menu_open(page, False)
    route = urlparse(page.url).path
    if route == "/research/":
        panels = page.locator("[data-program-panel]:visible")
        assert panels.count() == len(PROGRAMS)
        assert panels.evaluate_all("panels => panels.map(panel => panel.id)") == PROGRAMS
        research_navigation(page)
        for panel in panels.all():
            expect(panel.get_by_role('heading', name='Research agenda', exact=True)).to_be_visible()
            expect(panel.get_by_role('heading', name='Related publications', exact=True)).to_be_visible()
            assert panel.locator('a[href^="#"]').count() == 0
        assert page.locator('main a[href="/contact/"]').count() == 1
    if route == "/publications/":
        assert page.locator("[data-publication]:visible").count() == len(publication_records())
        for selector in ["[data-search]", "[data-year-filter]", "[data-type-filter]"]:
            expect(page.locator(selector)).to_be_visible()
            expect(page.locator(selector)).to_be_disabled()
        for trigger in page.locator("[data-cite]").all():
            expect(trigger).to_be_disabled()
    assert page.locator('a[href="/research/"]').count() > 0


def program_heading_in_view(page, program):
    page.wait_for_function("""id => {
      const heading=document.getElementById(id)?.querySelector('h2');
      if (!heading) return false;
      const rect=heading.getBoundingClientRect();
      return rect.width>0 && rect.height>0 && rect.top>=-1 && rect.bottom<=innerHeight+1
        && rect.left>=-1 && rect.right<=innerWidth+1;
    }""", arg=program, timeout=5000)
    heading = page.locator(f'[data-program-panel][id="{program}"] h2')
    expect(heading).to_be_visible()
    return {"program": program, "heading": heading.bounding_box(), "scrollY": page.evaluate("scrollY")}


def control_targets(page):
    failures = page.evaluate("""() => [...document.querySelectorAll('button,summary,input:not([type=hidden]),select,[data-site-header] nav a,[data-touch-target],[data-publication] a')].flatMap(el => {
      const r=el.getBoundingClientRect(), s=getComputedStyle(el);
      if (!r.width || !r.height || s.visibility==='hidden' || el.closest('[hidden]')) return [];
      const minimum = el.matches('[data-publication] a,[data-publication] [data-cite]') ? 23.5 : 43.5;
      return r.width < minimum || r.height < minimum ? [{tag:el.tagName,label:el.getAttribute('aria-label')||el.textContent.trim(),width:r.width,height:r.height,minimum}] : [];
    })""")
    assert not failures, failures


def research_navigation(page):
    # Native destinations need legible, nonoverlapping targets in source order.
    # Equal heights and a prescribed 1/2/4-column widget are not UX requirements.
    links = page.locator('[data-home-program],[data-program-link]').evaluate_all('''links => {
      return links.map(link => {
        const r=link.getBoundingClientRect();
        return {href:link.getAttribute('href'), tag:link.tagName, role:link.getAttribute('role'),
          left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height};
      });
    }''')
    assert len(links) == len(PROGRAMS), links
    assert [link['href'].split('#')[-1] for link in links] == PROGRAMS, links
    for index, link in enumerate(links):
        assert link['tag'] == 'A' and link['role'] not in ['tab', 'button'], link
        assert link['width'] > 0 and link['height'] >= 24, link
        for other in links[index + 1:]:
            overlap_x = min(link['right'], other['right']) - max(link['left'], other['left'])
            overlap_y = min(link['bottom'], other['bottom']) - max(link['top'], other['top'])
            assert overlap_x <= 1 or overlap_y <= 1, {'overlappingTargets': [link, other]}
    return {'destinations': links}


def keyboard_focus(page, selector, engine='chromium'):
    target = page.locator(selector).first
    is_link = target.evaluate('el => el.matches("a[href]")')
    target.focus()
    page.keyboard.press(link_tab_key(page, engine) if is_link else 'Tab')
    page.keyboard.press(link_tab_key(page, engine, reverse=True) if is_link else 'Shift+Tab')
    assert target.evaluate("el => el === document.activeElement"), selector
    style = target.evaluate("el => {const s=getComputedStyle(el);return {width:parseFloat(s.outlineWidth),style:s.outlineStyle,shadow:s.boxShadow}}")
    assert (style["width"] >= 2 and style["style"] != "none") or style["shadow"] != "none", (selector, style)


def contrast(page):
    result = page.evaluate("""() => {
      const parse = value => {const m=value.match(/^rgba?\\(([^)]+)\\)$/);if(!m)return null;const n=m[1].split(/[, /]+/).filter(Boolean).map(Number);return [...n.slice(0,3),n.length>3?n[3]:1];};
      const mix = (fg,bg) => [0,1,2].map(i=>fg[i]*fg[3]+bg[i]*(1-fg[3])).concat(1);
      const lum = c => c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((v,c,i)=>v+c*[.2126,.7152,.0722][i],0);
      const pairs=new Map(), skipped=[];
      for(const el of document.body.querySelectorAll('*')) {
        if(![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()) || el.closest('script,style,svg,[hidden]'))continue;
        const r=el.getBoundingClientRect(),s=getComputedStyle(el);
        if(!r.width||!r.height||s.visibility==='hidden'||Number(s.opacity)===0)continue;
        const fg=parse(s.color);if(!fg){skipped.push(s.color);continue;}
        let chain=[],node=el,hasImage=false;
        while(node){const cs=getComputedStyle(node);if(cs.backgroundImage!=='none')hasImage=true;const bg=parse(cs.backgroundColor);if(bg)chain.push(bg);node=node.parentElement;}
        if(hasImage){skipped.push(el.tagName+': image background');continue;}
        let bg=[255,255,255,1];for(const color of chain.reverse())bg=mix(color,bg);
        const foreground=mix(fg,bg), l1=lum(foreground),l2=lum(bg),ratio=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);
        const size=parseFloat(s.fontSize),large=size>=24||(size>=18.666&&Number(s.fontWeight)>=700),required=large?3:4.5;
        const key=foreground.join(',')+'|'+bg.join(',')+'|'+required;
        if(!pairs.has(key))pairs.set(key,{foreground,background:bg,ratio,required,text:el.textContent.trim().slice(0,60)});
      }
      return {pairs:[...pairs.values()],skipped:[...new Set(skipped)]};
    }""")
    assert result["pairs"], "No rendered text color pairs measured"
    failures = [pair for pair in result["pairs"] if pair["ratio"] + .015 < pair["required"]]
    assert not failures, failures
    return result
