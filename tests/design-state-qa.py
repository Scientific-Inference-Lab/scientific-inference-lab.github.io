import os

from playwright.sync_api import expect

from qa_support import (PROGRAMS, ROUTES, arguments, contrast, fallback_content,
                        geometry, identities, link_tab_key, media, menu_is_open, readable,
                        program_heading_in_view, session, set_menu_open, visit)


def load_held_page_fonts(page):
    # WebKit's set-level ready promise waits for deliberately held page scripts.
    # Individual font faces can finish without releasing the fault injection.
    page.evaluate("""async () => {
      const faces = [...document.fonts];
      if (!faces.length) throw new Error('No declared fonts in delayed-script page');
      let deadline;
      try {
        await Promise.race([
          Promise.all(faces.map(face => face.load())),
          new Promise((_, reject) => {
            deadline = setTimeout(() => reject(new Error('Font loading exceeded 10s')), 10000);
          })
        ]);
        if (faces.some(face => face.status !== 'loaded')) throw new Error('Font face not loaded');
      } finally {
        clearTimeout(deadline);
      }
    }""")


def script_fallbacks(browser, evidence):
    for mode in ["delayed", "failed"]:
        for route, preopen in [(route, False) for route in ROUTES] + ([("/", True)] if mode == "delayed" else []):
            context = browser.new_context(viewport={"width": 390, "height": 844})
            held = []
            injected = []
            released = False

            def intercept(request_route):
                request = request_route.request
                if request.resource_type != "script" or not request.url.startswith(evidence.args.base.rstrip("/") + "/") or released:
                    request_route.continue_()
                    return
                injected.append(request.url)
                if mode == "failed":
                    request_route.abort("failed")
                else:
                    held.append(request_route)

            context.route("**/*", intercept)
            page = evidence.watch(context.new_page(), injected_scripts=injected if mode == "failed" else None)
            response = page.goto(evidence.args.base.rstrip("/") + route, wait_until="commit")
            assert response is not None and response.status == 200
            page.locator("main h1").wait_for(state="visible")
            page.wait_for_function("document.readyState !== 'loading'")
            load_held_page_fonts(page)
            media(page)
            fallback_content(page)
            geometry(page, 390)
            identities(page)
            if preopen:
                set_menu_open(page, True)
                assert menu_is_open(page)
            before_h1 = page.locator("main h1").bounding_box()["y"]
            before_header = page.locator("[data-site-header]").bounding_box()["height"]
            before_publications = page.locator("[data-publication]").evaluate_all("els => els.map(el => ({id:el.dataset.publication, top:el.getBoundingClientRect().top}))")
            # First-party module scripts only; the production GA4 loader is third-party.
            external_scripts = page.locator('script[src]').evaluate_all("els => els.filter(el => new URL(el.src).origin === location.origin).length")
            if external_scripts:
                assert injected, "The script fault injection did not intercept any first-party script"
            else:
                assert route in ["/", "/research/", "/people/"], "Unexpected loss of an interactive route's external scripts"
                assert page.locator("astro-island[client]").count() == 0, "A static route must not leave an untested island"
            evidence.screenshot(page, f"{route.strip('/') or 'home'}-{mode}-scripts{'-preopened' if preopen else ''}")
            evidence.check("readable first paint with unavailable JavaScript", {"route": route, "mode": mode, "preopenedMenu": preopen, "injectedScripts": list(injected)})
            if mode == "delayed":
                released = True
                for pending in held:
                    pending.continue_()
                page.wait_for_load_state("networkidle")
                expect(page.locator("[data-menu-toggle]")).to_be_visible(timeout=5000)
                assert menu_is_open(page) == preopen, "Hydration reset the native disclosure state"
                after_h1 = page.locator("main h1").bounding_box()["y"]
                after_header = page.locator("[data-site-header]").bounding_box()["height"]
                assert abs(after_h1 - before_h1) <= 1, {"beforeH1": before_h1, "afterH1": after_h1, "preopened": preopen}
                assert abs(after_header - before_header) <= 1, {"beforeHeader": before_header, "afterHeader": after_header, "preopened": preopen}
                if preopen:
                    page.keyboard.press("Escape")
                    expect(page.locator("details[data-mobile-navigation]")).to_have_js_property("open", False)
                    expect(page.locator("[data-menu-toggle]")).to_be_focused()
                if route == "/research/":
                    expect(page.locator('[role="tab"],[role="tabpanel"]')).to_have_count(0)
                    expect(page.locator("[data-program-panel]:visible")).to_have_count(len(PROGRAMS))
                if route == "/publications/":
                    expect(page.locator("[data-search]")).to_be_visible()
                    expect(page.locator("[data-search]")).to_be_enabled()
                    after_publications = page.locator("[data-publication]").evaluate_all("els => els.map(el => ({id:el.dataset.publication, top:el.getBoundingClientRect().top}))")
                    assert [record["id"] for record in before_publications] == [record["id"] for record in after_publications]
                    shifts = [{"id": before["id"], "before": before["top"], "after": after["top"]}
                              for before, after in zip(before_publications, after_publications)
                              if abs(before["top"] - after["top"]) > 1]
                    assert not shifts, {"publicationHydrationDisplacement": shifts}
                    evidence.check("stable publication layout through hydration", {"records": len(after_publications),
                        "firstBefore": before_publications[0]["top"], "firstAfter": after_publications[0]["top"],
                        "tolerancePixels": 1, "fallback": "visible disabled controls become enabled without moving publication rows"})
                if route == "/contact/":
                    expect(page.locator("[data-copy-email]")).to_be_visible()
                readable(page)
                geometry(page, 390)
                media(page)
                evidence.check("delayed script recovery without header jump", {"route": route, "preopenedMenu": preopen,
                    "beforeH1": before_h1, "afterH1": after_h1, "beforeHeader": before_header, "afterHeader": after_header})
            else:
                page.wait_for_load_state("networkidle")
                fallback_content(page)
            context.close()


def delayed_research_fragments(browser, evidence):
    for width in [390, 1440]:
        for program in PROGRAMS:
            context = browser.new_context(viewport={"width": width, "height": 900})
            held = []
            released = False

            def intercept(request_route):
                request = request_route.request
                if request.resource_type == "script" and request.url.startswith(evidence.args.base.rstrip("/") + "/") and not released:
                    held.append(request_route)
                else:
                    request_route.continue_()

            context.route("**/*", intercept)
            page = evidence.watch(context.new_page())
            response = page.goto(f"{evidence.args.base.rstrip('/')}/research/#{program}", wait_until="commit")
            assert response is not None and response.status == 200
            page.locator("main h1").wait_for(state="visible")
            page.wait_for_function("document.readyState !== 'loading'")
            load_held_page_fonts(page)
            media(page)
            fallback_content(page)
            if page.locator('script[src]').count():
                assert held, "Delayed fragment check must intercept existing first-party JavaScript"
            else:
                assert page.locator('astro-island[client]').count() == 0
            before = page.locator(f'[data-program-panel][id="{program}"] h2').bounding_box()
            evidence.screenshot(page, f"research-{program}-{width}-before-hydration", full=False)
            released = True
            for pending in held:
                pending.continue_()
            page.wait_for_load_state("networkidle")
            expect(page.locator('[role="tab"],[role="tabpanel"]')).to_have_count(0)
            expect(page.locator("[data-program-panel]:visible")).to_have_count(len(PROGRAMS))
            assert page.evaluate("location.hash") == f"#{program}"
            destination = program_heading_in_view(page, program)
            geometry(page, width)
            evidence.screenshot(page, f"research-{program}-{width}-after-hydration", full=False)
            evidence.check("delayed Research fragment keeps destination visible", {"width": width,
                "beforeHeading": before, **destination, "interceptedScripts": len(held)})
            context.close()


def home_direction_navigation(browser, evidence):
    for width in [320, 390, 768, 1440]:
        context = browser.new_context(viewport={"width": width, "height": 900}, reduced_motion="reduce")
        page = evidence.watch(context.new_page())
        visit(page, evidence.args.base, "/")
        choices = page.locator('[data-home-program]')
        expect(choices).to_have_count(len(PROGRAMS))
        expect(page.locator('[data-home-direction]:visible')).to_have_count(len(PROGRAMS))
        expect(page.locator('[role="tab"],[role="tabpanel"]')).to_have_count(0)
        for program in PROGRAMS:
            choice = page.locator(f'[data-home-program="{program}"]')
            expect(choice).to_have_attribute('href', f'/research/#{program}')
            choice.click()
            page.wait_for_url(f'{evidence.args.base.rstrip("/")}/research/#{program}')
            page.wait_for_load_state('networkidle')
            program_heading_in_view(page, program)
            expect(page.locator('[data-program-panel]:visible')).to_have_count(len(PROGRAMS))
            media(page)
            geometry(page, width)
            page.go_back(wait_until='networkidle')
            expect(page.locator('[data-home-direction]:visible')).to_have_count(len(PROGRAMS))
        choices.first.focus()
        forward_key = link_tab_key(page, evidence.args.engine)
        reverse_key = link_tab_key(page, evidence.args.engine, reverse=True)
        page.keyboard.press(forward_key)
        expect(choices.nth(1)).to_be_focused()
        page.keyboard.press(reverse_key)
        expect(choices.first).to_be_focused()
        page.keyboard.press('Enter')
        page.wait_for_url(f'{evidence.args.base.rstrip("/")}/research/#{PROGRAMS[0]}')
        page.wait_for_load_state('networkidle')
        program_heading_in_view(page, PROGRAMS[0])
        assert page.evaluate("document.getAnimations().filter(a => a.playState === 'running').length") == 0
        evidence.screenshot(page, f'home-{width}-direct-research-destination')
        evidence.check('Home direct navigation and keyboard', {'width': width, 'programs': PROGRAMS, 'allDescriptionsOpen': True, 'reducedMotion': True, 'forwardKey': forward_key, 'reverseKey': reverse_key})
        context.close()


def run(browser, evidence):
    script_fallbacks(browser, evidence)
    delayed_research_fragments(browser, evidence)
    home_direction_navigation(browser, evidence)
    for width in [320, 390]:
        context = browser.new_context(viewport={"width": width, "height": 844})
        page = evidence.watch(context.new_page())
        visit(page, evidence.args.base, "/people/")
        # PI 2026-09-29: no Email button on People (Contact offers it); a "Bio" head leads into the biography.
        assert page.locator("[data-pi-contact]").count() == 0, "People must not repeat the Contact email button"
        name = page.locator("#pi-name").bounding_box()
        head = page.locator("#bio-heading").bounding_box()
        bio = page.locator("[data-pi-bio]").bounding_box()
        assert name and head and bio
        assert name["y"] + name["height"] <= head["y"], {"name": name, "bioHeading": head}
        assert head["y"] + head["height"] <= bio["y"], {"bioHeading": head, "bio": bio}
        assert page.locator("#bio-heading").inner_text().strip() == "Bio"
        assert name["y"] < 844, "Mobile identity must precede the long biography"
        geometry(page, width)
        evidence.screenshot(page, f"people-{width}-identity-first", full=False)
        evidence.check("mobile PI identity, Bio head, then biography", {"width": width, "name": name, "bioHeading": head, "bio": bio})
        context.close()
    for width, height in [(320, 568), (390, 667), (1440, 800)]:
        context = browser.new_context(viewport={"width": width, "height": height})
        page = evidence.watch(context.new_page())
        visit(page, evidence.args.base, "/")
        readable(page)
        geometry(page, width)
        identities(page)
        intro = page.locator('main header[aria-labelledby="lab-heading"]').bounding_box()
        heading = page.locator('#lab-heading').bounding_box()
        assert intro and heading and heading['y'] + heading['height'] <= height, {'intro': intro, 'heading': heading}
        directions = page.locator('section[aria-label="Research directions"]')
        research_links = directions.locator('[data-home-program]')
        assert research_links.count() == len(PROGRAMS)
        assert research_links.evaluate_all("links => links.map(link => link.getAttribute('href'))") == [f"/research/#{program}" for program in PROGRAMS]
        actions = {}
        for destination in ["/research/"]:
            link = page.locator(f'main header[aria-labelledby="lab-heading"] a[href="{destination}"]')
            expect(link).to_be_visible()
            bounds = link.bounding_box()
            assert bounds and bounds["y"] >= 0 and bounds["y"] + bounds["height"] <= height + 1, {"destination": destination, "bounds": bounds, "viewportHeight": height}
            actions[destination] = bounds
        evidence.screenshot(page, f"home-{width}x{height}-short-opening", full=False)
        evidence.check("short Home first screen", {"viewport": [width, height],
            "intro": intro, "programs": PROGRAMS, "primaryDestinations": actions,
            "hierarchy": "purpose and primary research destination in the opening; direction comparison remains openly readable below"})
        context.close()
    for width in [320, 390, 768, 1440, 1920]:
        context = browser.new_context(viewport={"width": width, "height": 900}, device_scale_factor=1)
        page = evidence.watch(context.new_page())
        visit(page, evidence.args.base, "/")
        readable(page)
        identity = identities(page)
        images = media(page)
        geometry(page, width)
        evidence.screenshot(page, f"home-{width}-opening", full=False)
        evidence.check("Home first screen", {"width": width, "identity": identity, "images": images})
        context.close()

    for ratio in [1, 2, 3]:
        context = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=ratio)
        page = evidence.watch(context.new_page())
        for route in ["/", "/research/", "/people/"]:
            visit(page, evidence.args.base, route)
            images = media(page)
            raster = [item for item in images if not item["src"].split("?")[0].endswith(".svg")]
            vector = [item for item in images if item["src"].split("?")[0].endswith(".svg")]
            assert vector, {"route": route, "images": images}
            assert all(item["srcset"] for item in raster), raster
            if route == "/people/":
                assert raster, {"route": route, "images": images}
            if route == "/":
                # PI request 2026-09-29: the Home portrait was replaced by a "Meet the PI" button.
                assert not raster, {"route": route, "images": images}
            evidence.check("responsive image sources", {"route": route, "DPR": ratio, "raster": raster, "vector": vector})
        context.close()

    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = evidence.watch(context.new_page())
    for route in ROUTES:
        visit(page, evidence.args.base, route)
        evidence.check("rendered text contrast", {"route": route, **contrast(page)})
    context.close()

    context = browser.new_context(viewport={"width": 390, "height": 844}, reduced_motion="reduce")
    page = evidence.watch(context.new_page())
    for route in ROUTES:
        visit(page, evidence.args.base, route)
        readable(page)
        geometry(page, 390)
        animations = page.evaluate("""() => document.getAnimations().filter(animation => {
          const timing=animation.effect.getComputedTiming();
          return animation.playState==='running' && (timing.duration>50 || timing.iterations===Infinity);
        }).map(animation=>({name:animation.animationName||'',duration:animation.effect.getComputedTiming().duration}))""")
        assert not animations, animations
        evidence.check("reduced-motion first paint", route)
    visit(page, evidence.args.base, "/research/" + "#" + PROGRAMS[0])
    selections = 24
    page.locator("[data-program-link]").evaluate_all("(links, count) => {for(let i=0;i<count;i++)links[i%links.length].click();}", selections)
    page.wait_for_timeout(150)
    assert page.locator("[data-program-panel]:visible").count() == len(PROGRAMS)
    expected = PROGRAMS[(selections - 1) % len(PROGRAMS)]
    assert page.evaluate('location.hash') == f'#{expected}'
    program_heading_in_view(page, expected)
    assert page.locator("[data-program-panel]:visible").evaluate_all("els=>els.every(el=>Number(getComputedStyle(el).opacity)===1)")
    assert page.evaluate("document.getAnimations().filter(animation=>animation.playState==='running').length") == 0
    geometry(page, 390)
    images = media(page)
    evidence.screenshot(page, "research-reduced-motion-final")
    settled_images = media(page)
    evidence.check("reduced-motion rapid selection", {"inputs": selections, "expectedProgram": expected,
        "programs": len(PROGRAMS), "imagesBeforeCapture": images, "imagesAfterCapture": settled_images,
        "behavior": "all sections readable, final destination retained, decoded current images and no running animations"})
    context.close()


if __name__ == "__main__":
    args = arguments("First-screen, rendered contrast, media and motion evidence")
    # This suite checks real font readiness itself, including before script release.
    # This internal Playwright flag skips its duplicate, blocked set-level wait.
    os.environ["PW_TEST_SCREENSHOT_NO_FONTS_READY"] = "1"
    with session(args, "design-state-qa") as (browser, evidence):
        run(browser, evidence)
