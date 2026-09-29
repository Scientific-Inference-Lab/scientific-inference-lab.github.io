from urllib.parse import urlparse, parse_qs
from playwright.sync_api import expect

from qa_support import (PROGRAMS, ROUTES, arguments, control_targets, geometry,
                        identities, keyboard_focus, link_tab_key, media, publication_records,
                        program_heading_in_view, program_records, readable, whole_words, session, visit)


def anchored_program(page, program, fragment=None):
    page.wait_for_function("""program => {
      const visible=[...document.querySelectorAll('[data-program-panel]')].filter(el=>el.getClientRects().length);
      return visible.some(el=>el.id===program);
    }""", arg=program)
    visible = page.locator("[data-program-panel]:visible")
    assert visible.evaluate_all("els => els.map(el => el.id)") == PROGRAMS
    assert page.locator('[role="tab"],[role="tabpanel"]').count() == 0
    assert urlparse(page.url).fragment == (fragment or program)


def research(page, evidence):
    for program in program_records():
        for alias in program.get('aliases', []):
            visit(page, evidence.args.base, f'/research/#{alias}')
            anchored_program(page, program['id'], alias)
            program_heading_in_view(page, program['id'])
            evidence.check('research legacy fragment', {'alias': alias, 'canonical': program['id']})
    for program in PROGRAMS:
        visit(page, evidence.args.base, f"/research/#{program}")
        anchored_program(page, program)
        destination = program_heading_in_view(page, program)
        geometry(page, 1440)
        evidence.check("research direct fragment", destination)

    visit(page, evidence.args.base, f"/research/#{PROGRAMS[0]}")
    links = page.locator("[data-program-link]")
    assert links.count() == len(PROGRAMS)
    for index, program in enumerate(PROGRAMS[1:], start=1):
        links.nth(index).click()
        anchored_program(page, program)
    page.go_back(wait_until="networkidle")
    anchored_program(page, PROGRAMS[-2])
    page.go_forward(wait_until="networkidle")
    anchored_program(page, PROGRAMS[-1])
    evidence.check("research history", "back and forward restore section URLs without hiding other directions")

    links.nth(0).focus()
    page.keyboard.press("Enter")
    anchored_program(page, PROGRAMS[0])
    links.nth(0).focus()
    forward_key = link_tab_key(page, evidence.args.engine)
    reverse_key = link_tab_key(page, evidence.args.engine, reverse=True)
    page.keyboard.press(forward_key)
    expect(links.nth(1)).to_be_focused()
    page.keyboard.press(reverse_key)
    expect(links.nth(0)).to_be_focused()
    page.keyboard.press(forward_key)
    expect(links.nth(1)).to_be_focused()
    page.keyboard.press("Enter")
    anchored_program(page, PROGRAMS[1])
    keyboard_focus(page, '[data-program-link]', evidence.args.engine)
    evidence.check("research keyboard", {'forward': forward_key, 'reverse': reverse_key, 'activation': 'Enter', 'visibleFocus': True})

    selections = 18
    page.locator("[data-program-link]").evaluate_all("(links, count) => {for(let i=0;i<count;i++)links[i%links.length].click();}", selections)
    page.wait_for_timeout(400)
    expected = PROGRAMS[(selections - 1) % len(PROGRAMS)]
    anchored_program(page, expected)
    for panel in page.locator("[data-program-panel]:visible").all():
        assert panel.evaluate("el => Number(getComputedStyle(el).opacity)") == 1
    evidence.check("rapid program selection", {"inputs": selections, "expectedProgram": expected, "programs": len(PROGRAMS)})

    original_url = page.url
    modifier = "Meta" if page.evaluate("navigator.platform.includes('Mac')") else "Control"
    with page.context.expect_page() as destination:
        page.locator(f'[data-program-link][href="#{PROGRAMS[0]}"]').click(modifiers=[modifier])
    other = evidence.watch(destination.value)
    other.wait_for_load_state('networkidle')
    anchored_program(other, PROGRAMS[0])
    assert page.url == original_url, "Modified Research navigation must preserve the current topic"
    anchored_program(page, expected)
    other.close()
    evidence.check("Research modified navigation", {"modifier": modifier, "newPageProgram": PROGRAMS[0], "preservedProgram": expected})

    for width in [1440, 390, 320]:
        page.set_viewport_size({"width": width, "height": 900 if width == 1440 else 844})
        for program in PROGRAMS:
            page.locator(f'[data-program-link][href="#{program}"]').click()
            anchored_program(page, program)
            destination = program_heading_in_view(page, program)
            media(page)
            assert page.locator('[data-program-panel]:visible img').count() == 0
            geometry(page, width)
            assert page.locator('[data-program-panel] a[href^="#"]').count() == 0
            evidence.check('native Research index reaches a complete section', {'width': width, **destination})
        evidence.screenshot(page, f"research-programs-without-generated-images-{width}")
    evidence.check("research imagery removal", "all four program panels render without generated images at 1440, 390 and 320")
    terminal = page.locator('main a[href="/contact/"]')
    expect(terminal).to_have_count(1)
    terminal.click()
    page.wait_for_url(evidence.args.base.rstrip('/') + '/contact/')
    # Let Contact's islands finish importing; leaving mid-import records cancelled scripts.
    page.wait_for_function("!document.querySelector('astro-island[ssr]')")
    page.wait_for_load_state('networkidle')
    page.go_back(wait_until='networkidle')
    anchored_program(page, PROGRAMS[-1])
    evidence.check('terminal Research inquiry', 'one Contact destination after the four sections; browser Back restores the Research fragment')
    page.set_viewport_size({"width": 1440, "height": 1000})
    media(page)


def visible_publications(page):
    return page.locator("[data-publication]:visible").evaluate_all("els => els.map(el => el.dataset.publication)")


def expect_publications(page, records):
    expected = sorted(record["id"] for record in records)
    page.wait_for_function("""ids => {
      const actual=[...document.querySelectorAll('[data-publication]')].filter(el=>el.getClientRects().length).map(el=>el.dataset.publication).sort();
      return JSON.stringify(actual)===JSON.stringify(ids);
    }""", arg=expected)
    assert sorted(visible_publications(page)) == expected


def inner_page_headers(page, evidence):
    routes = {
        "/research/": "Research",
        "/publications/": "Publications",
        "/people/": "People",
        "/contact/": "Contact",
    }
    for width in [390, 1440]:
        page.set_viewport_size({"width": width, "height": 900})
        measurements = []
        for route, title in routes.items():
            visit(page, evidence.args.base, route)
            header = page.locator("[data-page-header]")
            expect(header).to_have_count(1)
            expect(header.locator("h1")).to_have_text(title)
            expect(header.locator(".kicker")).to_have_count(1)
            expect(header.locator(".page-description")).to_have_count(1)
            measurements.append(header.evaluate("""element => {
              const heading = element.querySelector('h1');
              const headingStyle = getComputedStyle(heading);
              const headerStyle = getComputedStyle(element);
              const box = heading.getBoundingClientRect();
              return {
                title: heading.textContent.trim(),
                fontSize: headingStyle.fontSize,
                lineHeight: headingStyle.lineHeight,
                x: box.x,
                y: box.y,
                borderBottomWidth: headerStyle.borderBottomWidth,
                paddingTop: headerStyle.paddingTop,
                paddingBottom: headerStyle.paddingBottom,
              };
            }"""))
        for key in ["fontSize", "lineHeight", "x", "y", "borderBottomWidth", "paddingTop", "paddingBottom"]:
            assert len({str(item[key]) for item in measurements}) == 1, {"width": width, "property": key, "measurements": measurements}
        assert measurements[0]["borderBottomWidth"] == "1px", measurements
        evidence.check("shared inner-page heading system", {"width": width, "measurements": measurements})


def home_inquiry_measure(page, evidence, width):
    paragraph = page.locator('.inquiry p')
    result = paragraph.evaluate('''el => {
      const node=el.firstChild, text=node.textContent;
      const wordTop = word => {
        const start=text.indexOf(word), range=document.createRange();
        range.setStart(node,start); range.setEnd(node,start+word.length);
        return range.getBoundingClientRect().top;
      };
      return {machine:wordTop('machine'), learning:wordTop('learning'), maxWidth:getComputedStyle(el).maxWidth};
    }''')
    assert abs(result['machine'] - result['learning']) < 1, {'width': width, **result}
    evidence.check('Home inquiry preserves the machine learning phrase', {'width': width, **result})


def publications(page, context, evidence):
    records = publication_records()
    flowpath = next(record for record in records if record["title"].startswith("FlowPath:"))
    flowpath_matches = [record for record in records if "flowpath" in record["title"].lower()]
    year_matches = [record for record in records if record["year"] == 2024]
    position_matches = [record for record in records if record.get("type") == "Position paper"]
    assert year_matches and position_matches, "The verified inventory must include the regression's year and type"
    visit(page, evidence.args.base, "/publications/")
    visible_metadata = " ".join(page.locator("[data-publication]").all_inner_texts())
    assert not any(label in visible_metadata for label in ["Final citation pending", "Presented", "Accepted", "Published"])
    assert page.locator("[data-publication-status],[data-bibliography-status]").count() == 0
    evidence.check("publication workflow metadata remains internal", "Presented, acceptance and citation-pending labels are absent from rendered records")
    for width, text_percent in [(390, 100), (1440, 100), (320, 200)]:
        page.set_viewport_size({'width': width, 'height': 900})
        visit(page, evidence.args.base, f'/publications/#{flowpath["id"]}')
        page.evaluate('(percent)=>document.documentElement.style.fontSize=percent+"%"', text_percent)
        page.locator(f'[data-cite="{flowpath["id"]}"]').click()
        frames = page.locator('[data-citation-dialog]').evaluate('''async el => {
          const samples=[];
          for(let i=0;i<14;i++) {
            const r=el.getBoundingClientRect();
            samples.push({left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight});
            await new Promise(requestAnimationFrame);
          }
          return samples;
        }''')
        assert all(r['left'] >= -1 and r['right'] <= r['width']+1 and r['top'] >= -1 and r['bottom'] <= r['height']+1 for r in frames), frames
        whole_words(page, '[data-citation-dialog] h2,[data-citation-title]')
        evidence.screenshot(page, f'citation-opening-{width}-{text_percent}', full=False)
        page.locator('[data-download-citation]').scroll_into_view_if_needed()
        whole_words(page, '[data-copy-apa],[data-copy-citation],[data-download-citation]')
        evidence.screenshot(page, f'citation-actions-{width}-{text_percent}', full=False)
        page.keyboard.press('Escape')
        evidence.check('citation stays inside viewport throughout opening with whole-word title', {'width': width, 'textPercent': text_percent, 'frames': frames})
    page.set_viewport_size({'width': 1440, 'height': 1000})
    visit(page, evidence.args.base, '/publications/#oh_exploiting_2019')
    assert page.locator('#before-2023 [data-publication]:visible').count() == len([r for r in records if r['year'] < 2023])
    expect(page.locator('#oh_exploiting_2019 [data-publication-year]')).to_have_text('2019')
    page.locator('[data-year-filter]').select_option('2019')
    expect_publications(page, [r for r in records if r['year'] == 2019])
    expect(page.locator('#year-before-2023')).to_have_text('2019')
    page.reload(wait_until='networkidle')
    expect_publications(page, [r for r in records if r['year'] == 2019])
    page.locator('[data-reset-filters]').click()
    page.locator('[data-search]').fill('Exploiting')
    page.locator('[data-search]').press('Enter')
    expect_publications(page, [r for r in records if r['id'] == 'oh_exploiting_2019'])
    evidence.check('older work remains reachable by fragment, exact year, reload and search', '2019 IISE preserved without collapsing records')
    visit(page, evidence.args.base, "/publications/")
    assert len(visible_publications(page)) == len(records)
    keyboard_focus(page, "[data-search]", evidence.args.engine)
    search = page.locator("[data-search]")
    search.fill("FlowPath")
    search.press("Enter")
    page.wait_for_timeout(300)
    expect_publications(page, flowpath_matches)
    assert parse_qs(urlparse(page.url).query).get("q") == ["FlowPath"]
    page.reload(wait_until="networkidle")
    expect_publications(page, flowpath_matches)
    page.locator("[data-reset-filters]").click()
    page.wait_for_timeout(150)
    assert len(visible_publications(page)) == len(records)

    page.locator("[data-year-filter]").select_option("2024")
    expect_publications(page, year_matches)
    assert parse_qs(urlparse(page.url).query).get("year") == ["2024"]
    page.locator("[data-reset-filters]").click()
    page.locator("[data-type-filter]").select_option(label="Position paper")
    expect_publications(page, position_matches)
    page.go_back(wait_until="networkidle")
    assert len(visible_publications(page)) == len(records)
    page.go_forward(wait_until="networkidle")
    expect_publications(page, position_matches)
    evidence.check("publication filtering", "query, year, type, reload, reset, back and forward")

    page.locator("[data-search]").fill("no-publication-matches-this-query")
    page.locator("[data-search]").press("Enter")
    page.wait_for_timeout(300)
    assert visible_publications(page) == []
    assert page.locator("[data-empty-results]").is_visible()
    assert "0" in page.locator("[data-result-count]").inner_text()
    page.locator("[data-reset-filters]").click()
    assert len(visible_publications(page)) == len(records)
    evidence.check("publication empty state", "zero results and working reset")

    visit(page, evidence.args.base, "/publications/?year=1900&type=unknown&q=FlowPath")
    expect_publications(page, flowpath_matches)
    expect(page.locator("[data-year-filter]")).to_have_value("")
    expect(page.locator("[data-type-filter]")).to_have_value("")
    params = parse_qs(urlparse(page.url).query)
    assert params.get("q") == ["FlowPath"] and "year" not in params and "type" not in params, params
    page.reload(wait_until="networkidle")
    expect_publications(page, flowpath_matches)
    evidence.check("invalid categorical URL normalization", "unknown year/type removed from controls and URL while preserving valid query")

    visit(page, evidence.args.base, f"/publications/#{flowpath['id']}")
    expect_publications(page, records)
    assert urlparse(page.url).fragment == flowpath["id"]
    page.locator("[data-year-filter]").select_option("2024")
    expect_publications(page, year_matches)
    assert urlparse(page.url).fragment == "", "A filter that hides the target must clear the stale fragment"
    page.go_back(wait_until="networkidle")
    expect_publications(page, records)
    assert urlparse(page.url).fragment == flowpath["id"]
    page.go_forward(wait_until="networkidle")
    expect_publications(page, year_matches)
    assert urlparse(page.url).fragment == ""
    page.locator("[data-reset-filters]").click()
    expect_publications(page, records)
    evidence.check("filtered publication fragments", "hidden target fragment cleared and history restores both filter and fragment")

    aliases = [(alias, record) for record in records for alias in record.get("aliases", [])]
    assert len(aliases) >= 6, "Previously published semantic fragments must remain usable"
    for alias, record in aliases:
        visit(page, evidence.args.base, f"/publications/#{alias}")
        expect_publications(page, records)
        target = page.locator(f'[id="{alias}"]')
        assert target.count() == 1
        assert target.evaluate("el => el.closest('[data-publication]')?.dataset.publication") == record["id"]
        assert urlparse(page.url).fragment in [alias, record["id"]]
    flowpath_alias = flowpath["aliases"][0]
    visit(page, evidence.args.base, f"/publications/#{flowpath_alias}")
    page.locator("[data-year-filter]").select_option("2024")
    expect_publications(page, year_matches)
    assert urlparse(page.url).fragment == "", "Filtering must also clear a hidden legacy target"
    page.go_back(wait_until="networkidle")
    expect_publications(page, records)
    assert urlparse(page.url).fragment in [flowpath_alias, flowpath["id"]]
    evidence.check("legacy publication fragments", {"aliases": len(aliases), "behavior": "static target, hydrated deep link and filter/history restoration"})

    canonical = [record for record in records if record.get("bibtex") is not None]
    unavailable = [record for record in records if record.get("bibtex") is None]
    assert len(canonical) >= 25 and len(unavailable) >= 3
    assert all(bool(record.get("apa")) for record in canonical)
    assert all(record.get("apa") is None for record in unavailable)
    assert page.locator("[data-cite]:visible").count() == len(canonical)
    for record in unavailable:
        assert page.locator(f'[data-cite="{record["id"]}"]').count() == 0, record["id"]
    for record in canonical:
        trigger = page.locator(f'[data-cite="{record["id"]}"]')
        trigger.click()
        dialog = page.locator("[data-citation-dialog]")
        expect(dialog).to_be_visible(timeout=3000)
        assert page.locator("[data-apa-citation]").input_value() == record["apa"], record["id"]
        assert page.locator("[data-citation-text]").input_value() == record["bibtex"], record["id"]
        assert page.locator("[data-download-citation]").evaluate("el => decodeURIComponent(el.href.slice(el.href.indexOf(',') + 1))") == record["bibtex"], record["id"]
        page.locator("[data-close-citation]").click()
        expect(dialog).to_be_hidden(timeout=3000)
        expect(trigger).to_be_focused(timeout=3000)
    evidence.check("canonical citation availability and exact text", {"canonical": len(canonical), "unavailableWithoutCite": len(unavailable), "comparison": "every dialog and download URI equal imported canonical BibTeX"})

    if evidence.args.engine == "chromium":
        context.grant_permissions(["clipboard-read", "clipboard-write"], origin=evidence.args.base)
        evidence.check("clipboard environment", "native Chromium clipboard write/readback")
    else:
        page.evaluate("""() => Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__qaClipboard=text}}})""")
        evidence.report["limitations"].append("WebKit clipboard success uses a writeText fixture; native operating-system clipboard was not tested.")

    cite = page.locator(f'[data-cite="{flowpath["id"]}"]')
    cite.click()
    dialog = page.locator("[data-citation-dialog]")
    expect(dialog).to_be_visible(timeout=3000)
    assert dialog.get_attribute("role") == "dialog"
    apa = page.locator("[data-apa-citation]").input_value()
    assert apa == flowpath["apa"], "APA must come from the committed canonical-BibTeX derivative"
    page.locator("[data-copy-apa]").click()
    actual = page.evaluate("navigator.clipboard.readText()" if evidence.args.engine == "chromium" else "window.__qaClipboard")
    assert actual == apa
    assert "apa 7 copied" in page.locator("[data-citation-status]").inner_text().lower()
    content = page.locator("[data-citation-text]").input_value()
    assert content == flowpath["bibtex"], "Citation must preserve canonical upstream text, not synthesize display fields"
    page.locator("[data-copy-citation]").click()
    actual = page.evaluate("navigator.clipboard.readText()" if evidence.args.engine == "chromium" else "window.__qaClipboard")
    assert actual == content
    assert page.locator("[data-citation-status]").inner_text().strip()
    with page.expect_download() as download_info:
        page.locator("[data-download-citation]").click()
    download = download_info.value
    target = evidence.out / download.suggested_filename
    download.save_as(target)
    assert target.read_bytes() == flowpath["bibtex"].encode("utf-8")
    page.evaluate("""() => Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('Simulated denied permission')}}})""")
    page.locator("[data-copy-citation]").click()
    assert "unavailable" in page.locator("[data-citation-status]").inner_text().lower()
    assert page.locator("[data-citation-text]").evaluate("el => el===document.activeElement && el.selectionStart===0 && el.selectionEnd===el.value.length")
    page.keyboard.press("Escape")
    expect(dialog).to_be_hidden(timeout=3000)
    expect(cite).to_be_focused(timeout=3000)
    evidence.check("publication citation", "generated APA and exact BibTeX copy/readback, BibTeX download, denied-copy selected-text fallback, Escape and restored focus")

    visit(page, evidence.args.base, "/contact/")
    if evidence.args.engine == "webkit":
        page.evaluate("""() => Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__qaClipboard=text}}})""")
    page.locator("[data-copy-email]").click()
    actual = page.evaluate("navigator.clipboard.readText()" if evidence.args.engine == "chromium" else "window.__qaClipboard")
    assert actual == "yongkyung.oh@pusan.ac.kr"
    assert "copied" in page.locator("[data-copy-status]").inner_text().lower()
    page.evaluate("""() => Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('Simulated denied permission')}}})""")
    page.locator("[data-copy-email]").click()
    assert "unavailable" in page.locator("[data-copy-status]").inner_text().lower()
    assert page.locator('a[href="mailto:yongkyung.oh@pusan.ac.kr"]').count() > 0
    page.wait_for_load_state("networkidle")
    evidence.check("contact copy", "success, denied-permission feedback and mailto fallback")


def run(browser, evidence):
    context = browser.new_context(viewport={"width": 1440, "height": 1000}, accept_downloads=True)
    page = evidence.watch(context.new_page())
    inner_page_headers(page, evidence)
    for width in [390, 768, 1440]:
        page.set_viewport_size({"width": width, "height": 900})
        for route in ROUTES:
            visit(page, evidence.args.base, route)
            readable(page)
            geometry(page, width)
            identities(page)
            images = media(page)
            control_targets(page)
            if route == "/contact/":
                expect(page.locator("[data-copy-email]")).to_be_enabled(timeout=3000)
            if route == "/" and width >= 768:
                home_inquiry_measure(page, evidence, width)
            evidence.screenshot(page, f"{route.strip('/') or 'home'}-{width}")
            evidence.check("route and media", {"route": route, "width": width, "images": images})
    page.set_viewport_size({"width": 1440, "height": 1000})
    research(page, evidence)
    publications(page, context, evidence)
    page._qa_cleanup = True
    context.close()


if __name__ == "__main__":
    args = arguments("Route, research, library, dialog and clipboard checks")
    with session(args, "browser-qa") as (browser, evidence):
        run(browser, evidence)
