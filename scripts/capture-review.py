"""Capture comparable review states from a running preview, without building."""
import argparse
import hashlib
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--base', default='http://127.0.0.1:4325')
parser.add_argument('--out', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
out = root / args.out
out.mkdir(parents=True, exist_ok=True)

def fingerprint():
    digest = hashlib.sha256()
    for directory in ['src', 'public']:
        for path in sorted((root / directory).rglob('*')):
            if path.is_file():
                digest.update(str(path.relative_to(root)).encode())
                digest.update(path.read_bytes())
    return digest.hexdigest()

before = fingerprint()
results = []
errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless=True)
    try:
        for width, height in [(1440, 960), (768, 1024), (390, 844), (320, 568)]:
            page = browser.new_page(viewport={'width': width, 'height': height}, device_scale_factor=1)
            page.on('pageerror', lambda error: errors.append(str(error)))
            for route in ['', 'research', 'publications', 'people', 'contact']:
                response = page.goto(f'{args.base}/{route + "/" if route else ""}', wait_until='networkidle')
                if response is None or response.status != 200:
                    raise RuntimeError(f'Invalid preview response for {route or "/"}: {response.status if response else "missing"}')
                page.locator('main h1').wait_for(state='visible')
                page.evaluate('document.fonts.ready')
                page.evaluate('Promise.all([...document.images].filter(i => i.loading !== "lazy").map(i => i.decode().catch(() => {})))')
                name = route or 'home'
                page.screenshot(path=str(out / f'{name}-{width}-opening.png'))
                page.screenshot(path=str(out / f'{name}-{width}-full.png'), full_page=True)
                result = page.evaluate('''() => {
                  const rect = selector => { const el = document.querySelector(selector); if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; };
                  return {scrollWidth:document.documentElement.scrollWidth, innerWidth,
                    heading:rect('h1'), researchIndex:rect('[aria-label="Research directions"]'),
                    firstPaper:rect('[data-publication]'), panel:rect('[data-program-panel]'),
                    media:[...document.images].map(i=>({src:i.currentSrc,loaded:i.complete&&i.naturalWidth>0,width:i.width,height:i.height}))};
                }''')
                results.append({'route':name, 'width':width, 'status':response.status, **result})
            page.close()
    finally:
        browser.close()
after = fingerprint()
report = {'sourceBefore':before,'sourceAfter':after,'stable':before==after,'errors':errors,'states':results}
(out / 'report.json').write_text(json.dumps(report, indent=2))
print(json.dumps({'out':str(out), 'stable':before==after, 'states':len(results), 'errors':errors}))
if before != after or errors or any(item['status'] != 200 for item in results):
    raise SystemExit(1)
