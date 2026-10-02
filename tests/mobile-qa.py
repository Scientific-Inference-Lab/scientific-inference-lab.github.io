from qa_support import (NAV_ROUTES, PROGRAMS, ROUTES, WIDTHS, arguments, control_targets, geometry,
                        fallback_content, identities, media, menu_is_open,
                        navigation, readable, whole_words, research_label_words, research_navigation, program_heading_in_view, session, visit)


def run(browser, evidence):
    for width in WIDTHS:
        for scale in [100, 150, 200]:  # 150 guards the intermediate-scale reflow band (lessons 16, 18)
            context = browser.new_context(viewport={"width": width, "height": 900},
                                          is_mobile=True, has_touch=True, device_scale_factor=2)
            context.add_init_script(f"document.addEventListener('DOMContentLoaded', () => document.documentElement.style.fontSize = '{scale}%')")
            page = evidence.watch(context.new_page())
            for route in ROUTES:
                visit(page, evidence.args.base, route)
                readable(page)
                dimensions = geometry(page, width)
                identity = identities(page)
                control_targets(page)
                whole_words(page, '.footer-profiles a')
                whole_words(page, '.site-nav a:visible')
                footer = page.locator('footer').bounding_box()
                main = page.locator('main').bounding_box()
                assert footer['y'] >= main['y'] + main['height'] - 1, 'Common footer must follow content, not obscure it'
                if route in ["/", "/research/"]:
                    evidence.check('research labels retain whole words', {'route': route, 'width': width,
                        'rootTextPercent': scale, **research_label_words(page), **research_navigation(page)})
                if route == '/':
                    # PI request 2026-09-29: Home carries no portrait; a "Meet the PI" button replaces it (PI 2026-10-02: to the profile).
                    intro = page.locator('.home-intro').evaluate('''el => {
                      const button = [...el.querySelectorAll('a')].find(a => a.getAttribute('href') === '/people/yongkyung-oh/');
                      const box = button?.getBoundingClientRect();
                      return {images: el.querySelectorAll('img, picture, figure').length, label: button?.innerText.trim(),
                              isButton: !!button?.classList.contains('button-secondary'), height: box?.height, right: box?.right,
                              viewport: document.documentElement.clientWidth};
                    }''')
                    assert intro['images'] == 0, f'Home intro must not show a portrait: {intro}'
                    assert intro['label'] == 'Meet the PI' and intro['isButton'], intro
                    assert intro['height'] >= 44 and intro['right'] <= intro['viewport'] + 1, intro
                    whole_words(page, '.home-actions a')
                    evidence.check('Home PI button replaces the portrait', {'width': width, 'rootTextPercent': scale, **intro})
                if route == '/research/':
                    whole_words(page, '.program-panel h2,.research-context,.approach-details')
                if route == "/contact/":
                    whole_words(page, '.contact-actions a')
                    email = page.locator('.contact-email').evaluate('''el => {
                      const parent=el.parentElement.getBoundingClientRect(), anchor=el.getBoundingClientRect();
                      const parts=[...el.querySelectorAll('span')].map(span => {
                        const rect=span.getBoundingClientRect();
                        return {text:span.textContent, left:rect.left, right:rect.right};
                      });
                      return {left:Math.max(parent.left,anchor.left), right:Math.min(parent.right,anchor.right), parts};
                    }''')
                    assert email['parts'] and all(part['left'] >= email['left'] - 1 and part['right'] <= email['right'] + 1 for part in email['parts']), email
                    evidence.check('email fits its own column', {'width': width, 'rootTextPercent': scale, **email})
                evidence.check("responsive page", {"route": route, "width": width, "rootTextPercent": scale, "geometry": dimensions, "identity": identity})
                if width in [320, 390] and scale == 200:
                    evidence.screenshot(page, f"{route.strip('/') or 'home'}-{width}-text200")
                toggle = page.locator("[data-menu-toggle]")
                if toggle.is_visible():
                    toggle.tap()
                    assert menu_is_open(page)
                    geometry(page, width)
                    control_targets(page)
                    nav = navigation(page)
                    assert nav.is_visible() and nav.locator("a:visible").count() == len(NAV_ROUTES)
                    header = page.locator('[data-site-header]').bounding_box()
                    main = page.locator('main').bounding_box()
                    assert main['y'] >= header['y'] + header['height'] - 1, 'Open menu must reflow content, not cover its opening'
                    if route != '/':
                        assert nav.locator('a[aria-current="page"]').get_attribute('href') == ('/people/' if route.startswith('/people/') else route)
                    if route == "/" and width == 320:
                        evidence.screenshot(page, f"menu-{width}-text{scale}")
                    page.keyboard.press("Escape")
                    assert not menu_is_open(page)
                    assert toggle.evaluate("el => document.activeElement === el")
                    evidence.check("compact menu", {"route": route, "width": width, "rootTextPercent": scale})
            context.close()

    for scale in [100, 150, 200]:  # 150 guards the intermediate-scale reflow band (lessons 16, 18)
        context = browser.new_context(viewport={"width": 320, "height": 900})
        context.add_init_script(f"document.addEventListener('DOMContentLoaded', () => document.documentElement.style.fontSize = '{scale}%')")
        page = evidence.watch(context.new_page())
        for route in ['/', '/research/']:
            visit(page, evidence.args.base, route)
            states = []
            for width in range(320, 1441, 32):
                page.set_viewport_size({'width': width, 'height': 900})
                research_label_words(page)
                geometry(page, width)
                states.append({'width': width, **research_navigation(page)})
            evidence.check('readable research destinations resize sweep', {'route': route, 'rootTextPercent': scale, 'states': states})
        context.close()

    context = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    page = evidence.watch(context.new_page())
    visit(page, evidence.args.base, "/")
    for route in NAV_ROUTES:
        toggle = page.locator("[data-menu-toggle]")
        toggle.tap()
        navigation(page).locator(f'a[href="{route}"]').tap()
        page.wait_for_url(evidence.args.base.rstrip("/") + route)
        page.wait_for_load_state("networkidle")
        media(page)
        geometry(page, 390)
    evidence.check("touch navigation", ROUTES)
    page.locator('[data-site-header] a[href="/"]').first.tap()
    page.wait_for_url(evidence.args.base.rstrip("/") + "/")
    page.wait_for_load_state("networkidle")
    media(page)
    page.locator("[data-menu-toggle]").tap()
    page.set_viewport_size({"width": 1440, "height": 900})
    page.wait_for_timeout(100)
    media(page)
    geometry(page, 1440)
    assert navigation(page).is_visible()
    page.set_viewport_size({"width": 320, "height": 740})
    page.wait_for_timeout(100)
    media(page)
    geometry(page, 320)
    evidence.check("menu responsive resize", [390, 1440, 320])
    context.close()

    context = browser.new_context(viewport={"width": 320, "height": 740}, java_script_enabled=False)
    page = evidence.watch(context.new_page())
    for route in ROUTES:
        visit(page, evidence.args.base, route, javascript=False)
        fallback_content(page)
        geometry(page, 320)
        identities(page)
        evidence.check("no-JavaScript mobile", route)
    toggle = page.locator("[data-menu-toggle]")
    toggle.focus()
    page.keyboard.press("Enter")
    assert menu_is_open(page)
    navigation(page).locator('a[href="/research/"]').click()
    page.wait_for_url(evidence.args.base.rstrip("/") + "/research/")
    media(page)
    assert page.locator("[data-program-panel]:visible").count() == len(PROGRAMS)
    page.locator(f'[data-program-link][href="#{PROGRAMS[-1]}"]').click()
    page.wait_for_url(evidence.args.base.rstrip('/') + f'/research/#{PROGRAMS[-1]}')
    program_heading_in_view(page, PROGRAMS[-1])
    fallback_content(page)
    page.go_back(wait_until='networkidle')
    assert page.url == evidence.args.base.rstrip('/') + '/research/'
    visit(page, evidence.args.base, '/', javascript=False)
    page.locator(f'[data-home-program="{PROGRAMS[-1]}"]').click()
    page.wait_for_url(evidence.args.base.rstrip('/') + f'/research/#{PROGRAMS[-1]}')
    program_heading_in_view(page, PROGRAMS[-1])
    fallback_content(page)
    page.go_back(wait_until='networkidle')
    assert page.url == evidence.args.base.rstrip('/') + '/'
    assert page.locator('[data-home-direction]:visible').count() == len(PROGRAMS)
    evidence.check("native no-JavaScript navigation", "Enter opens the disclosure; index and Home links reach complete Research sections; browser Back restores the originating page")
    context.close()


if __name__ == "__main__":
    args = arguments("Touch, reflow, enlarged-text and no-JavaScript checks")
    with session(args, "mobile-qa") as (browser, evidence):
        run(browser, evidence)
