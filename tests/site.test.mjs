import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { parse } from 'parse5';

const root = fileURLToPath(new URL('../', import.meta.url));
const routes = ['/', '/research/', '/publications/', '/teaching/', '/people/', '/contact/'];
const origin = 'https://scientific-inference-lab.github.io';
const routeFile = route => path.join('dist', route, 'index.html');
const normalize = value => value.replace(/\s+/g, ' ').trim();
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const has = (node, name) => node.attrs?.some(item => item.name === name);
const children = node => node.childNodes ?? [];
const all = (node, predicate) => [...(predicate(node) ? [node] : []), ...children(node).flatMap(child => all(child, predicate))];
const text = node => node.nodeName === '#text' ? node.value : ['script', 'style'].includes(node.tagName) ? '' : children(node).map(text).join('');
const content = node => normalize(text(node));
const byTag = (node, name) => all(node, item => item.tagName === name);
const byAttr = (node, name, value) => all(node, item => has(item, name) && (value === undefined || attr(item, name) === value));
const json = async name => JSON.parse(await readFile(path.join(root, name), 'utf8'));

async function files(base) {
  const output = [];
  for (const entry of await readdir(base, { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), `Unexpected symlink in build inputs/output: ${base}/${entry.name}`);
    const filename = path.join(base, entry.name);
    if (entry.isDirectory()) output.push(...await files(filename));
    else output.push(filename);
  }
  return output;
}

async function assertFresh(directory) {
  const inputs = [];
  for (const folder of ['src', 'public']) inputs.push(...await files(path.join(directory, folder)));
  for (const file of ['package.json', 'package-lock.json', 'astro.config.mjs', 'svelte.config.js', 'tsconfig.json']) {
    inputs.push(path.join(directory, file));
  }
  let newest = { filename: '', mtime: 0 };
  for (const filename of inputs) {
    const mtime = (await stat(filename)).mtimeMs;
    if (mtime > newest.mtime) newest = { filename, mtime };
  }
  for (const route of routes) {
    const output = path.join(directory, routeFile(route));
    const information = await stat(output).catch(() => null);
    assert(information?.isFile(), `Missing prerendered route ${route}; run npm run build before npm test.`);
    assert(information.mtimeMs >= newest.mtime, `Stale dist: ${path.relative(directory, newest.filename)} is newer than ${path.relative(directory, output)}. Rebuild before testing.`);
  }
}

// Stop before any artifact-based assertion can produce a false green result.
await assertFresh(root);
const documents = new Map(await Promise.all(routes.map(async route => [route, parse(await readFile(path.join(root, routeFile(route)), 'utf8'))])));
const publications = await json('src/content/publications.json');
const news = await json('src/content/news.json');

test('freshness guard rejects a stale build and missing routes', async () => {
  const parent = path.join(root, 'output');
  await mkdir(parent, { recursive: true });
  const fixture = await mkdtemp(path.join(parent, 'freshness-test-'));
  try {
    for (const folder of ['src', 'public']) await mkdir(path.join(fixture, folder));
    for (const file of ['package.json', 'package-lock.json', 'astro.config.mjs', 'svelte.config.js', 'tsconfig.json']) await writeFile(path.join(fixture, file), '{}');
    const old = new Date('2020-01-01T00:00:00Z');
    const source = path.join(fixture, 'src', 'example.ts');
    await writeFile(source, 'export const test = true;');
    for (const route of routes) {
      const output = path.join(fixture, routeFile(route));
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, '<main>Fixture</main>');
      await utimes(output, old, old);
    }
    await assert.rejects(assertFresh(fixture), /Stale dist/);
    await rm(path.join(fixture, routeFile('/')));
    await assert.rejects(assertFresh(fixture), /Missing prerendered route/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('five substantive, distinct English documents are prerendered', () => {
  const titles = new Set();
  for (const [route, document] of documents) {
    assert.equal(attr(byTag(document, 'html')[0], 'lang'), 'en', route);
    const main = byTag(document, 'main');
    assert.equal(main.length, 1, route);
    assert(content(main[0]).length > 200, `${route}: empty page shell`);
    assert.equal(byTag(main[0], 'h1').length, 1, route);
    // Korean is allowed only where it is marked as Korean (Teaching's course names).
    const english = node => node.attrs?.some(item => item.name === 'lang' && item.value === 'ko') ? '' : node.nodeName === '#text' ? node.value : ['script', 'style'].includes(node.tagName) ? '' : children(node).map(english).join('');
    assert(!/[\uac00-\ud7a3]/u.test(english(main[0])), `${route}: mixed-language public text`);
    const title = content(byTag(document, 'title')[0]);
    assert(title.includes('Scientific Inference Lab'), `${route}: missing lab title`);
    titles.add(title);
    assert(byTag(document, 'a').some(node => attr(node, 'href') === '#main'), `${route}: missing skip link`);
  }
  assert.equal(titles.size, routes.length, 'Routes must have distinct document titles');
});

test('interior routes share one page-header hierarchy', () => {
  const expected = new Map([
    ['/research/', 'Research'],
    ['/publications/', 'Publications'],
    ['/teaching/', 'Teaching'],
    ['/people/', 'People'],
    ['/contact/', 'Contact'],
  ]);
  for (const [route, title] of expected) {
    const main = byTag(documents.get(route), 'main')[0];
    const headers = byAttr(main, 'data-page-header');
    assert.equal(headers.length, 1, `${route}: use the shared page header exactly once`);
    assert.equal(content(byTag(headers[0], 'h1')[0]), title, `${route}: page title`);
    assert.equal(all(headers[0], node => (attr(node, 'class') ?? '').split(/\s+/).includes('kicker')).length, 1, `${route}: one shared eyebrow`);
    // PI 2026-10-02: a substantive orientation sentence where one exists; People and Contact start with their content.
    const descriptions = all(headers[0], node => (attr(node, 'class') ?? '').split(/\s+/).includes('page-description'));
    assert.equal(descriptions.length, ['/people/', '/contact/'].includes(route) ? 0 : 1, `${route}: page-header description`);
  }
  assert.equal(byAttr(documents.get('/'), 'data-page-header').length, 0, 'Home keeps its distinct identity-led hierarchy');
});

test('static assets are explicitly allowed and copied without modification', async () => {
  const allowed = await json('tests/static-assets.json');
  assert.equal(new Set(allowed).size, allowed.length, 'Duplicate static asset entries');
  const actual = (await files(path.join(root, 'public'))).map(file => path.relative(path.join(root, 'public'), file).split(path.sep).join('/')).sort();
  assert.deepEqual(actual, [...allowed].sort(), 'Review additions/removals in tests/static-assets.json before shipping');
  for (const name of actual) {
    assert.deepEqual(await readFile(path.join(root, 'dist', name)), await readFile(path.join(root, 'public', name)), name);
  }
});

test('public output excludes internal records, machine paths and source maps', async () => {
  const forbidden = [/\/Users\//, /%2fUsers%2f/i, /Working\/Achivement/, /file:\/\//, /\.claude\//, /\.codex\//, /_archive\//, /docs\/(?:current|audit|data|design)\//, /AGENTS\.md/, /CLAUDE\.md/, /diagnosis before further self-directed fixes/i];
  for (const filename of await files(path.join(root, 'dist'))) {
    const relative = path.relative(path.join(root, 'dist'), filename).split(path.sep).join('/');
    assert(!/^(?:docs|_archive|output|\.claude|\.codex|src)\//.test(relative), relative);
    assert(!relative.endsWith('.map'), `Public source map: ${relative}`);
    if (!/\.(?:html|js|css|json|txt|xml|svg|bib)$/i.test(filename)) continue;
    const source = await readFile(filename, 'utf8');
    for (const pattern of forbidden) assert(!pattern.test(source), `${relative}: forbidden private material ${pattern}`);
  }
});

test('identity is real text, lab-first, and independent of the university header', () => {
  for (const [route, document] of documents) {
    const header = byAttr(document, 'data-site-header');
    assert.equal(header.length, 1, route);
    assert(!/Pusan|University/.test(content(header[0])), `${route}: university used as header identity`);
    assert.equal(all(header[0], node => (attr(node, 'class') ?? '').split(/\s+/).includes('wordmark-text')).map(content).join(''), 'Scientific Inference Lab');
    const nav = byTag(header[0], 'nav').find(node => attr(node, 'aria-label') === 'Main navigation');
    assert(nav, `${route}: named navigation`);
    for (const destination of routes.slice(1)) assert(byTag(nav, 'a').some(node => attr(node, 'href') === destination), `${route}: missing ${destination}`);
    const footer = byTag(document, 'footer');
    assert.equal(footer.length, 1, route);
    assert(content(footer[0]).includes('Pusan National University'), `${route}: missing institutional context`);
    const universityMark = byTag(footer[0], 'img').find(image => attr(image, 'alt') === 'Pusan National University');
    assert(universityMark && attr(universityMark, 'src')?.split('?')[0].endsWith('.svg'), `${route}: institutional signature must use the official vector asset`);
  }
  const home = byTag(documents.get('/'), 'h1')[0];
  assert.equal(content(home), 'Scientific inference for discovery and decision-making.', 'The approved purpose, not a repeated wordmark, leads Home');
  assert.equal(byTag(home, 'br').length, 0);
});

test('the imported public inventory retains complete titles, author order and metadata', () => {
  const records = byAttr(documents.get('/publications/'), 'data-publication');
  assert(publications.length >= 28, 'The agreed public inventory must not silently regress to the old six-paper selection');
  assert.equal(records.length, publications.length);
  assert.equal(new Set(publications.map(record => record.id)).size, publications.length);
  for (const publication of publications) {
    const record = records.find(node => attr(node, 'data-publication') === publication.id);
    assert(record, publication.id);
    const rendered = content(record);
    for (const value of [publication.title, publication.venue, publication.type, publication.recognition].filter(Boolean)) {
      assert(rendered.includes(value), `${publication.id}: missing complete ${value}`);
    }
    assert.deepEqual(byAttr(record, 'data-author').map(content), publication.authors, `${publication.id}: author spelling/order`);
    if (publication.presentationStatus === 'presented') {
      assert(!rendered.includes('Presented') && !rendered.includes('Accepted'), `${publication.id}: workflow status must not be visitor-facing metadata`);
      assert(!rendered.includes('Final citation pending'), `${publication.id}: citation workflow state must not be visitor-facing metadata`);
    }
    else assert(!/\b(?:Accepted|Published|Presented|Final citation pending)\b/i.test(rendered), `${publication.id}: internal publication status must remain out of the visible record`);
    assert.equal(attr(record, 'data-year'), String(publication.year), `${publication.id}: year association missing`);
    assert.equal(byTag(record, 'a').filter(node => attr(node, 'href') === publication.url).length, 1, `${publication.id}: duplicate primary paper link`);
    for (const url of [publication.url, publication.codeUrl].filter(Boolean)) assert(byTag(record, 'a').some(node => attr(node, 'href') === url), `${publication.id}: missing source ${url}`);
    assert(!has(record, 'hidden'), `${publication.id}: initial content hidden without JavaScript`);
  }
  const facts = Object.fromEntries(publications.flatMap(record => [record.id, ...(record.aliases ?? [])].map(id => [id, record])));
  assert.equal(facts['evidence-standards'].status, 'accepted');
  assert.equal(facts['evidence-standards'].presentationStatus, 'presented');
  assert.equal(facts['evidence-standards'].bibliographyStatus, 'final-metadata-pending');
  assert.equal(facts['evidence-standards'].bibtex, null, 'Presentation completion must not synthesize a canonical citation');
  assert.equal(facts['evidence-standards'].apa, null, 'Missing canonical BibTeX must not fall back to copied or reconstructed APA text');
  assert.deepEqual(facts['evidence-standards'].authors, ['YongKyung Oh']);
  assert.equal(facts['silent-failures'].status, 'published');
  assert.equal(facts['survey-aware'].status, 'published');
  assert.equal(facts['multi-view'].recognition, 'Best Paper Award, Models and Methods Track');
  assert.equal(facts['stable-neural-sdes'].recognition, 'Spotlight');
  assert.deepEqual(facts['flowpath'].authors, ['YongKyung Oh', 'Dong-Young Lim', 'Sungil Kim']);
  assert.deepEqual(facts['stable-neural-sdes'].authors, ['YongKyung Oh', 'Dongyoung Lim', 'Sungil Kim']);
});

test('Home news is a recent, high-signal editorial selection rather than a fixed quota', () => {
  assert(news.length > 0 && news.length <= 5, 'Home should show up to five substantive updates');
  const icmlNews = news.find(item => item.publicationId === 'evidence-standards');
  assert(icmlNews?.text.includes('presented') && !icmlNews.text.includes('is accepted'), 'ICML news must reflect the completed presentation');
  assert.equal(new Set(news.map(item => item.id)).size, news.length, 'News IDs must be unique');
  assert.deepEqual(news.map(item => item.date), [...news].map(item => item.date).sort().reverse(), 'News must be newest first');
  const newest = new Date(`${news[0].date}-01T00:00:00Z`);
  const cutoff = new Date(Date.UTC(newest.getUTCFullYear() - 1, newest.getUTCMonth(), 1));
  for (const item of news) {
    assert(new Date(`${item.date}-01T00:00:00Z`) >= cutoff, `${item.id}: Home news is older than the rolling 12-month editorial window`);
    assert(['Lab', 'Grant', 'Publication', 'Award', 'Talk'].includes(item.category), `${item.id}: missing editorial category`);
  }
  assert(news.some(item => item.category === 'Grant'), 'Current grants should not be displaced by older publication filler');
  const home = documents.get('/');
  const rendered = byAttr(home, 'class').find(node => (attr(node, 'class') ?? '').split(/\s+/).includes('news-list'));
  assert(rendered, 'Home news list missing');
  for (const item of news) {
    assert(content(rendered).includes(item.title), `${item.id}: missing from Home`);
    assert(content(rendered).includes(item.category), `${item.id}: category missing from Home`);
  }
  assert(!content(rendered).includes('CHIL'), 'Older CHIL updates must not remain as Home filler');
});

test('publication order uses explicit canonical dates then upstream order', () => {
  assert.deepEqual(publications.map(p => p.upstreamOrder).sort((a,b) => a-b), Array.from({length: publications.length}, (_,i) => i));
  const ordered = [...publications].sort((a,b) => b.year-a.year ||
    (b.date?.length > 4 ? b.date : '').localeCompare(a.date?.length > 4 ? a.date : '') || a.upstreamOrder-b.upstreamOrder);
  const rendered = byAttr(documents.get('/publications/'), 'data-publication').map(node => attr(node, 'data-publication'));
  assert.deepEqual(rendered, ordered.map(p => p.id));
  for (const publication of publications) {
    if (!publication.date) continue;
    if (publication.dateSource === 'canonical') assert(publication.bibtex?.includes(publication.date), `${publication.id}: date is not explicit in the canonical citation`);
    else assert.equal(publication.dateSource, 'cv-presentation', `${publication.id}: missing date source`);
    assert.equal(Number(publication.date.slice(0,4)), publication.year);
    assert(!/-00/.test(publication.date), `${publication.id}: unknown month/day must not become a date`);
  }
  const explicitCV = {
    oh_silent_failures_2026_accepted_in_press: '2026-08',
    oh_position_2026_accepted_in_press: '2026-07',
    oh_survey_aware_2026_accepted_in_press: '2026-06', oh_stable_2024: '2024-05',
  };
  assert.deepEqual(Object.fromEntries(publications.filter(p=>p.dateSource==='cv-presentation').map(p=>[p.id,p.date])), explicitCV);
});

test('canonical publication identities and legacy fragments survive the inventory import', () => {
  const document = documents.get('/publications/');
  const legacy = {
    flowpath: 'oh_flowpath_2026',
    'multi-view': 'oh_multi-view_2025',
    'stable-neural-sdes': 'oh_stable_2024',
    'evidence-standards': 'oh_position_2026_accepted_in_press',
    'silent-failures': 'oh_silent_failures_2026_accepted_in_press',
    'survey-aware': 'oh_survey_aware_2026_accepted_in_press',
  };
  for (const record of publications) {
    assert.equal(record.id, record.canonicalKey, `${record.id}: identity must use the stable upstream key`);
    assert(['conference', 'journal'].includes(record.category), `${record.id}: missing publication category`);
    assert.equal(byAttr(document, 'id', record.id).length, 1, `${record.id}: missing static canonical target`);
  }
  for (const [alias, id] of Object.entries(legacy)) {
    const publication = publications.find(record => record.id === id);
    assert(publication?.aliases?.includes(alias), `${id}: legacy link ${alias} discarded`);
    const article = byAttr(document, 'data-publication', id)[0];
    assert.equal(byAttr(article, 'id', alias).length, 1, `${alias}: static alias must target the corresponding publication, not a script-only redirect`);
  }
  const canonical = publications.filter(record => record.bibtex !== null);
  assert(canonical.length >= 25, 'The existing canonical citation inventory must not regress');
  for (const record of canonical) {
    assert.equal(typeof record.bibtex, 'string', `${record.id}: citation must be canonical text or explicit null`);
    assert.equal(typeof record.apa, 'string', `${record.id}: APA must be generated for every canonical citation`);
    assert(record.apa.length > 20 && !/[\r\n]/.test(record.apa), `${record.id}: generated APA must be one non-empty reference`);
    assert.match(record.bibtex, new RegExp(`^\\s*@(?:article|inproceedings|incollection|book|misc)\\s*\\{\\s*${record.canonicalKey}\\s*,`, 'i'), `${record.id}: malformed or mismatched canonical citation`);
    assert.equal(record.bibtex.match(/^\s*@(\w+)/)?.[1].toLowerCase(), record.bibtexEntryType, `${record.id}: preserve canonical entry type independently of display category`);
  }
  for (const id of Object.values(legacy).slice(3)) {
    const record = publications.find(record => record.id === id);
    assert.equal(record.bibtex, null, `${id}: do not substitute experimental or synthesized BibTeX for an unavailable canonical citation`);
    assert.equal(record.apa, null, `${id}: do not copy or synthesize APA without canonical BibTeX`);
    assert.equal(byAttr(document, 'data-cite', id).length, 0, `${id}: unavailable citation must not have a Cite control`);
  }
  assert.equal(publications.filter(record => record.apa !== null).length, canonical.length, 'APA and canonical BibTeX availability must match');
});

test('canonical citations retain the independently recorded upstream byte hashes', async () => {
  const baseline = (await json('tests/canonical-citations.json')).records;
  assert.equal(Object.keys(baseline).length, 28, 'Keep all baseline records, including unavailable citations');
  for (const [id, expected] of Object.entries(baseline)) {
    const record = publications.find(item => item.id === id);
    assert(record, `${id}: canonical baseline record removed`);
    const actual = record.bibtex === null ? null : createHash('sha256').update(record.bibtex, 'utf8').digest('hex');
    assert.equal(actual, expected, `${id}: citation bytes changed from the upstream import; verify the canonical source before updating this fixture`);
  }
});

test('older-work grouping preserves exact years, records and stable year anchors', () => {
  const library = documents.get('/publications/');
  const earlier = byAttr(library, 'data-year-group', 'before-2023')[0];
  const records = publications.filter(p => p.year < 2023);
  assert(earlier && !has(earlier, 'hidden'));
  assert.equal(content(byTag(earlier, 'h2')[0]), 'Before 2023');
  assert.deepEqual(byAttr(earlier, 'data-publication').map(p => attr(p, 'data-publication')).sort(), records.map(p => p.id).sort());
  for (const record of records) {
    const rendered = byAttr(earlier, 'data-publication', record.id)[0];
    assert.equal(content(byAttr(rendered, 'data-publication-year')[0]), String(record.year));
    assert.equal(byAttr(library, 'id', `year-${record.year}`).length, 1);
  }
  assert(records.some(record => record.id === 'oh_exploiting_2019'), 'Grouping must not silently remove IISE');
});

test('personal recognition and PI profiles preserve truthful types and destinations', async () => {
  const pi = (await json('src/content/people.json'))[0];
  const people = documents.get('/people/');
  assert(content(people).includes("Chancellor's Award for Postdoctoral Research"));
  assert(content(people).includes('Nominee'));
  assert(!content(people).includes('Best Postdoctoral') && !content(people).includes('Finalist'));
  const expectedProfiles = [
    ['Personal Website', pi.links.personal],
    ['ORCID', pi.links.orcid],
    ['Google Scholar', pi.links.scholar], ['GitHub', pi.links.github],
    ['LinkedIn', pi.links.linkedin],
  ];
  const profileDestinations = node => byTag(node, 'a').map(a => [content(a).trim(), attr(a, 'href')]);
  const peopleProfiles = byAttr(people, 'aria-label', "YongKyung Oh's profiles")[0];
  assert(peopleProfiles, 'People must name the owner of the profiles');
  assert.deepEqual(profileDestinations(peopleProfiles), expectedProfiles);
  for (const [route, document] of documents) {
    const footer = byTag(document, 'footer')[0];
    const profiles = byAttr(footer, 'aria-label', 'PI profiles')[0];
    assert(profiles, `${route}: footer must identify the profiles as the PI's`);
    assert.deepEqual(profileDestinations(profiles), expectedProfiles, `${route}: footer and People must share visible labels, order and destinations`);
    assert(content(footer).includes(pi.name) && content(footer).includes('Principal Investigator'), `${route}: PI ownership must be visible, not only an accessibility label`);
    assert.equal(byAttr(footer, 'aria-label', 'Footer navigation').length, 0, 'Repeated footer route navigation was removed by the PI');
    assert(!byTag(footer, 'a').some(a => ['/research/', '/publications/', '/people/', '/contact/'].includes(attr(a, 'href'))), 'No duplicate internal route list in the footer');
  }
  assert(content(people).includes('Data Science Major, School of BioMedical Convergence Engineering, Pusan National University'));
  assert(content(people).includes('Master in Technology and Innovation Management'));
  assert(!content(people).includes('Master of Science in Technology and Innovation Management'));
  const selectedRecognition = byAttr(people, 'aria-labelledby', 'paper-recognition-heading')[0];
  assert(selectedRecognition, 'People must retain a named paper-recognition group');
  const selectedText = content(selectedRecognition);
  assert(selectedText.indexOf('ICML · 2026') < selectedText.indexOf('CHIL · 2025'), 'ICML recognition must precede CHIL');
  assert(selectedText.includes('Sole-authored position paper'));
  for (const [route, document] of documents) {
    assert(!/single[- ]author/i.test(content(document)), `${route}: ICML authorship uses the canonical "sole-authored" wording`);
  }
  assert(content(documents.get('/')).includes('sole-authored position paper'), 'Home News uses the canonical ICML authorship wording');
  assert(selectedText.includes('Best Paper Award'));
  assert(!selectedText.includes('Models and Methods Track') && !selectedText.includes('Paper award'), 'People uses the concise CHIL recognition label');
  const grantGroup = byAttr(people, 'aria-labelledby', 'grant-recognition-heading')[0];
  assert(grantGroup, 'People must list grants and fellowships as their own recognition group');
  assert.equal(content(byTag(grantGroup, 'h3')[0]), 'Grants and fellowships');
  const grantRows = byAttr(grantGroup, 'data-grant');
  assert.equal(grantRows.length, 2, 'People lists the NVIDIA grant and the NRF fellowship, and no training programme or unverified record');
  const [nvidia, nrf] = grantRows.map(content);
  assert(nvidia.includes('NVIDIA Academic Grant Program') && nvidia.includes('NVIDIA · 2026'));
  assert(nvidia.includes('Role: Lead Scientist on the project team') && nvidia.includes('Project: Neural SDE-Augmented') && nvidia.includes('Principal Investigator: Alex A. T. Bui, UCLA'), 'Grant role, project and PI follow the public-safe CV export');
  // PI-approved review 2026-10-01: the NRF fellowship is the PI's earlier award, marked as such.
  assert(nrf.includes('Postdoctoral Fellowship for Overseas Research') && nrf.includes('National Research Foundation of Korea (NRF) · 2024-2025'));
  assert(nrf.includes('Role: Principal Investigator') && nrf.includes('Research title: Approach to Detect Distribution Shifts Over Time'));
  // PI decision 2026-10-01 (audit 58 E4): the certified title is quoted verbatim.
  assert(nrf.includes('Evaluate Model Trustworthy with Retraining in Longitudinal Medical Data') && !nrf.includes('Trustworthiness'), 'NRF title must match the certificate');
  assert.equal((nrf.match(/Principal Investigator/g) ?? []).length, 1, 'The fellowship states the PI role once, as the CV does');
  assert(nrf.includes('before joining Pusan National University'), 'The fellowship must read as the PI\'s past award, not current lab funding');
  const grantAll = content(grantGroup);
  for (const excluded of ['UniStar', 'Carnegie Mellon', 'IITP', 'Catalyst', 'KRW', 'USD']) assert(!grantAll.includes(excluded), `${excluded}: training programmes, amounts and unverified records stay off People`);
  assert(!routes.includes('/grants/') && !(documents.has('/grants/')), 'No separate Grants route');
  // PI 2026-10-02: copy need not foreground the PI's name; the project role stays on People.
  const surfaces = [...documents.values()].flatMap(document => [content(document), ...meta(document, 'description')]).join(' ');
  assert(!/led by YongKyung Oh|taught by YongKyung Oh|Contact YongKyung Oh|Publications by YongKyung Oh/.test(surfaces), 'Name-forward phrasing removed');
  // PI 2026-10-02: no meta copy that describes the page or tells the visitor what to do with it.
  assert(!/Overlapping (?:research )?directions|Explore their questions|Search the complete publication record|Meet the principal investigator|Research and laboratory updates|Each course site holds|Get in touch to discuss|inference for engineering decisions/.test(surfaces), 'Meta copy removed');
  for (const document of documents.values()) {
    const footer = byTag(document, 'footer')[0];
    assert(content(footer).includes('School of BioMedical Convergence Engineering · Pusan National University'));
    assert(!content(footer).includes('Data Science Major'), 'Footer affiliation must omit the major');
  }
});

test('research directions remain complete and generated illustrations stay out of the public site', async () => {
  const document = documents.get('/research/');
  const programs = (await json('src/content/programs.json')).sort((a, b) => a.order - b.order);
  const expectedCuration = {
    'ai-for-science': ['oh_multi-view_2025', 'oh_modeling_2025'],
    'continuous-time-modeling': ['oh_flowpath_2026', 'oh_stable_2024'],
    'evidence-centered-ai': ['oh_position_2026_accepted_in_press', 'oh_silent_failures_2026_accepted_in_press'],
    'industrial-ai-and-decision-making': ['oh_predicting_2026', 'oh_grid-based_2024'],
  };
  const ids = programs.map(program => program.id);
  assert(ids.length >= 4, 'The four-direction research inventory must not regress');
  assert.equal(new Set(ids).size, ids.length, 'Research program IDs must be unique');
  for (const id of ['ai-for-science', 'continuous-time-modeling', 'evidence-centered-ai']) {
    assert(ids.includes(id), `${id}: existing research fragment removed`);
  }
  const panels = byAttr(document, 'data-program-panel');
  assert.deepEqual(panels.map(panel => attr(panel, 'id')), ids);
  const main = byTag(document, 'main')[0];
  const index = byTag(main, 'nav').filter(node => attr(node, 'aria-label') === 'Research directions');
  assert.equal(index.length, 1, 'Research needs one named direction index');
  assert.deepEqual(byTag(index[0], 'a').map(node => attr(node, 'href')), ids.map(id => `#${id}`));
  assert.deepEqual(byAttr(main, 'data-program-link'), byTag(index[0], 'a'), 'All four direction links belong to the one index');
  assert.deepEqual(byTag(main, 'a').filter(node => attr(node, 'href')?.startsWith('#')).map(node => attr(node, 'href')), ids.map(id => `#${id}`), 'Do not restore per-section Next or index-return links');
  assert(!/Selected current work|Planned inquiry|work predating the lab|Back to directions|Next:/.test(content(main)), 'Redundant Research labels and attribution must stay removed');
  assert.equal(byTag(main, 'dl').length, 0, 'Do not restore the unexplained Observations/Inference comparison row');
  assert.equal(all(main, node => ['direction-number', 'section-number'].some(name => (attr(node, 'class') ?? '').split(/\s+/).includes(name))).length, 0, 'Peer research directions must not display ordinal numbers');
  const inquiry = byTag(main, 'a').filter(node => attr(node, 'href') === '/contact/');
  assert.equal(inquiry.length, 1, 'Research has one terminal inquiry action');
  assert(panels.every(panel => !byTag(panel, 'a').includes(inquiry[0])), 'The inquiry follows the complete research document, not an individual direction');
  const mainNodes = all(main, node => Boolean(node.tagName));
  const lastPanelNodes = all(panels.at(-1), node => Boolean(node.tagName));
  assert(mainNodes.indexOf(inquiry[0]) > Math.max(...lastPanelNodes.map(node => mainNodes.indexOf(node))), 'The inquiry must follow all four sections');
  const home = documents.get('/');
  // PI request 2026-09-29: Home shows no portrait; one "Meet the PI" button leads to People.
  const homeIntro = byTag(home, 'header').find(node => attr(node, 'class')?.split(/\s+/).includes('home-intro'));
  assert(homeIntro, 'Home must keep its introduction');
  assert.equal(byTag(homeIntro, 'img').length + byTag(homeIntro, 'picture').length + byTag(homeIntro, 'figure').length, 0, 'Home introduction must not show a portrait');
  const peopleActions = byTag(homeIntro, 'a').filter(node => attr(node, 'href') === '/people/');
  assert.equal(peopleActions.length, 1, 'Home needs exactly one People action');
  assert(attr(peopleActions[0], 'class')?.split(/\s+/).includes('button-secondary') && content(peopleActions[0]).trim() === 'Meet the PI', 'The People action is the "Meet the PI" button');
  const contactPage = documents.get('/contact/');
  assert(!content(byTag(contactPage, 'main')[0]).includes('We welcome inquiries'), 'Contact must not repeat the Home inquiry guidance (PI 2026-09-29)');
  const contactEmail = all(contactPage, node => attr(node, 'class')?.split(/\s+/).includes('contact-email'))[0];
  assert(contactEmail && byTag(contactEmail, 'wbr').length === 1, 'Contact email keeps a single preferred break point before "@"');
  const homeDirections = byAttr(home, 'aria-label', 'Research directions')[0];
  assert(homeDirections, 'Home must expose the complete research direction index');
  assert.equal(content(byTag(byTag(home, 'main')[0], 'h2')[0]), 'Research directions', 'Home should explain its directions before individual papers');
  for (const program of programs) {
    const { id } = program;
    assert.deepEqual(program.related.map(paper => paper.id), expectedCuration[id], `${id}: Related publications must remain the reviewed two-record curation`);
    const panel = panels.find(node => attr(node, 'id') === id);
    assert(panel && !has(panel, 'hidden'), `${id}: missing no-JavaScript content`);
    assert.equal(content(byTag(panel, 'h2')[0]), program.title, `${id}: missing research heading`);
    assert(content(panel).includes(program.summary), `${id}: adopted description missing`);
    const agenda = byAttr(panel, 'aria-labelledby', `agenda-${id}`)[0];
    const related = byAttr(panel, 'aria-labelledby', `work-${id}`)[0];
    assert(agenda?.tagName === 'section' && related?.tagName === 'section', `${id}: agenda and publication evidence need separate named sections`);
    assert.equal(content(byTag(agenda, 'h3')[0]), 'Research agenda');
    assert.equal(content(byTag(related, 'h3')[0]), 'Related publications');
    for (const topic of program.agenda ?? []) assert(content(agenda).includes(topic), `${id}: research agenda item missing`);
    for (const alias of program.aliases ?? []) assert.equal(byAttr(panel, 'id', alias).length, 1, `${id}: no-JS legacy fragment missing`);
    const homeLink = byTag(homeDirections, 'a').find(node => attr(node, 'href') === `/research/#${id}`);
    assert(homeLink && content(homeLink).includes(program.shortTitle), `${id}: missing labeled Home destination`);
    const overview = byAttr(homeDirections, 'data-home-direction', id)[0];
    assert(overview && byTag(overview, 'img').length === 0, `${id}: generated Home imagery must stay removed`);
    assert(content(overview).includes(program.summary), `${id}: approved summary must be openly comparable on Home`);
    assert(!has(overview, 'hidden'), `${id}: Home must not conceal direction descriptions`);
    assert(byTag(overview, 'a').some(node => attr(node, 'href') === `/research/#${id}`), `${id}: overview needs a direct research destination`);
    assert.equal(byTag(panel, 'img').length, 0, `${id}: generated Research imagery must stay removed`);
    const links = byTag(panel, 'a').map(node => attr(node, 'href'));
    const publicationLinks = links.filter(href => href?.startsWith('/publications/#'));
    const expectedPublications = program.related.map(paper => `/publications/#${paper.id}`);
    assert.equal(publicationLinks.length, 2, `${id}: show exactly two curated Related publications`);
    assert.deepEqual(publicationLinks, expectedPublications, `${id}: preserve the reviewed year/venue/recognition curation`);
    assert.deepEqual(byTag(related, 'a').map(node => attr(node, 'href')), expectedPublications, `${id}: linked evidence belongs in the related-publications section`);
  }
  assert.equal(byAttr(homeDirections, 'role', 'tab').length, 0, 'Home directions are native destinations, not a second selector');
  assert.equal(byAttr(document, 'role', 'tab').length, 0, 'Research must expose all four sections without selection');
  const notices = await readFile(path.join(root, 'dist/asset-credits.txt'), 'utf8');
  assert(!/AI-generated explanatory illustrations/i.test(notices), 'Deleted generated illustrations must not remain in the public asset record');
});

test('the official wordmark is the full name in Pretendard 700, black, from the shipped Pretendard asset', async () => {
  for (const [route, document] of documents) {
    const marks = all(document, node => (attr(node, 'class') ?? '').split(/\s+/).includes('wordmark-text'));
    assert(marks.length >= 2, `${route}: header and footer wordmarks`);
    for (const mark of marks) assert.equal(content(mark), 'Scientific Inference Lab', `${route}: wordmark is the exact full name`);
    assert(!/\bSIL\b/.test(content(document)), `${route}: the lab name is never abbreviated`);
  }
  const css = (await Promise.all((await readdir(path.join(root, 'dist/_astro'))).filter(name => name.endsWith('.css')).map(name => readFile(path.join(root, 'dist/_astro', name), 'utf8')))).join('\n');
  // PI revision 2026-09-29 (spec 001): Pretendard 700, -.018em, black; Newsreader is retired.
  const compact = css.replace(/\s+/g, ' ').replace(/ ?([{};:,]) ?/g, '$1');
  assert(/--font-wordmark:"?Pretendard"?/.test(compact), 'Wordmark token resolves to Pretendard');
  assert(/\.wordmark-text\{[^}]*font:700 [^}]*var\(--font-wordmark\)[^}]*letter-spacing:-\.018em[^}]*color:#000/.test(compact), 'Wordmark is Pretendard 700 with -.018em tracking in black');
  assert(!/Newsreader/i.test(css), 'The retired Newsreader face must not ship');
  await assert.rejects(readFile(path.join(root, 'dist/licenses/newsreader.txt')), 'The retired Newsreader notice must not ship');
  const licence = await readFile(path.join(root, 'dist/licenses/pretendard.txt'), 'utf8');
  assert(licence.includes('SIL Open Font License'), 'The Pretendard licence ships with the wordmark face');
});

test('the mobile menu is a complete native disclosure before JavaScript loads', () => {
  for (const [route, document] of documents) {
    const details = byAttr(document, 'data-mobile-navigation')[0];
    assert(details?.tagName === 'details', `${route}: native disclosure missing`);
    assert(!has(details, 'open'), `${route}: menu should start compact without JavaScript`);
    const summary = byAttr(details, 'data-menu-toggle')[0];
    assert(summary?.tagName === 'summary', `${route}: toggle must work natively`);
    const destinations = byTag(details, 'a').map(node => attr(node, 'href'));
    for (const destination of routes.slice(1)) assert(destinations.includes(destination), `${route}: fallback lacks ${destination}`);
    const ids = byAttr(document, 'id').map(node => attr(node, 'id'));
    assert.equal(new Set(ids).size, ids.length, `${route}: duplicate IDs after desktop/mobile navigation composition`);
  }
});

test('every local media/link target and fragment resolves in the static artifact', async () => {
  const courseSites = (await json('src/content/courses.json')).map(course => course.url);
  for (const [route, document] of documents) {
    for (const node of all(document, node => node.tagName)) {
      const references = [attr(node, 'href'), attr(node, 'src'), attr(node, 'poster')].filter(Boolean);
      const srcset = attr(node, 'srcset');
      if (srcset && !srcset.startsWith('data:')) references.push(...srcset.split(',').map(entry => entry.trim().split(/\s+/)[0]));
      for (const reference of references) {
        if (/^(?:data|blob|mailto|tel|javascript):/.test(reference)) continue;
        const url = new URL(reference, origin + route);
        if (url.origin !== origin) continue;
        // Course sites share the origin but deploy from their own repositories (checked live).
        if (courseSites.some(site => url.href.startsWith(site))) continue;
        let relative = decodeURIComponent(url.pathname).replace(/^\//, '');
        if (!relative || relative.endsWith('/')) relative += 'index.html';
        const target = path.resolve(root, 'dist', relative);
        assert(target.startsWith(path.join(root, 'dist') + path.sep), `${route}: escaping link ${reference}`);
        assert((await stat(target).catch(() => null))?.isFile(), `${route}: broken local target ${reference}`);
        if (url.hash && target.endsWith('.html')) {
          const targetDocument = parse(await readFile(target, 'utf8'));
          assert(byAttr(targetDocument, 'id', decodeURIComponent(url.hash.slice(1))).length, `${route}: missing fragment ${reference}`);
        }
      }
    }
  }
});

test('images include alternatives, stable dimensions and responsive raster sources', () => {
  for (const [route, document] of documents) {
    const images = byTag(document, 'img');
    assert(images.length > 0, `${route}: intended images absent`);
    for (const image of images) {
      assert(has(image, 'alt'), `${route}: image has no alternative`);
      assert(Number(attr(image, 'width')) > 0 && Number(attr(image, 'height')) > 0, `${route}: image lacks intrinsic dimensions`);
      const source = attr(image, 'src') ?? '';
      if (!source.split('?')[0].endsWith('.svg')) {
        const responsive = attr(image, 'srcset') || (image.parentNode?.tagName === 'picture' && byTag(image.parentNode, 'source').some(node => attr(node, 'srcset')));
        assert(responsive, `${route}: raster has no responsive source set`);
      }
    }
  }
});

test('Contact reuses the official vector university signature without raster upscaling', () => {
  const contact = documents.get('/contact/');
  const marks = byTag(contact, 'img').filter(image => attr(image, 'alt') === 'Pusan National University');
  assert(marks.length >= 2, 'Contact and its shared footer must both identify the university');
  for (const mark of marks) assert(attr(mark, 'src')?.split('?')[0].endsWith('.svg'), 'University signature must stay vector at every display size');
});

const scriptBody = node => children(node).map(child => child.value ?? '').join('');
const meta = (document, key) => byTag(document, 'meta').filter(node => attr(node, 'property') === key || attr(node, 'name') === key).map(node => attr(node, 'content'));

test('search metadata and structured data restate the visible site', async () => {
  const records = await json('src/content/publications.json');
  const publicationIds = new Set(byAttr(documents.get('/publications/'), 'data-publication').map(node => attr(node, 'id')));
  for (const [route, document] of documents) {
    const title = content(byTag(document, 'title')[0]);
    assert.deepEqual(meta(document, 'og:title'), [title], `${route}: og:title must equal the document title`);
    assert.deepEqual(meta(document, 'og:url'), [origin + route], route);
    assert.equal(meta(document, 'description').length, 1, `${route}: one meta description`);
    const blocks = byTag(document, 'script').filter(node => attr(node, 'type') === 'application/ld+json');
    assert.equal(blocks.length, 1, `${route}: one JSON-LD graph`);
    const source = scriptBody(blocks[0]);
    assert(!source.includes('</'), `${route}: JSON-LD must not contain a closing tag`);
    assert(!/telephone|faxNumber/.test(source), `${route}: structured data must not add unpublished contact numbers`);
    const graph = JSON.parse(source)['@graph'];
    const node = type => graph.find(item => item['@type'] === type);
    assert(node('WebSite') && node('ResearchOrganization') && node('CollegeOrUniversity'), `${route}: site entities`);
    const person = node('Person');
    const footerEmail = attr(byAttr(document, 'data-footer-email')[0], 'href');
    assert.equal(person.email, footerEmail, `${route}: Person email must equal the visible footer address`);
    const footerProfiles = all(byAttr(document, 'aria-label', 'PI profiles')[0], item => item.tagName === 'a').map(item => attr(item, 'href'));
    assert.deepEqual(person.sameAs, footerProfiles, `${route}: sameAs must equal the visible profile links`);
    const page = graph.at(-1);
    assert.equal(page.url, origin + route, `${route}: structured page URL`);
    assert.equal(page.name, title, `${route}: structured page name`);
  }
  assert.match(content(byTag(documents.get('/'), 'title')[0]), /Pusan National University/, 'Home title names the institution for search results');
  const people = JSON.parse(scriptBody(byTag(documents.get('/people/'), 'script').find(node => attr(node, 'type') === 'application/ld+json')))['@graph'];
  assert.equal(people.at(-1)['@type'], 'ProfilePage');
  assert.equal(people.find(item => item['@type'] === 'Person').image, meta(documents.get('/people/'), 'og:image')[0], 'People image must be the visible portrait');
  const collection = JSON.parse(scriptBody(byTag(documents.get('/publications/'), 'script').find(node => attr(node, 'type') === 'application/ld+json')))['@graph'].at(-1);
  const items = collection.mainEntity.itemListElement.map(entry => entry.item);
  assert.equal(items.length, records.length, 'Every publication is described once');
  for (const item of items) {
    const id = item['@id'].split('#')[1];
    assert(publicationIds.has(id), `${id}: structured article must target a visible record`);
    const record = records.find(entry => entry.id === id);
    assert.equal(item.name, record.title, `${id}: title`);
    // Audit 60: a CV presentation month is not a publication date.
    const bibtexYear = record.bibtex?.match(/\byear\s*=\s*\{?(\d{4})\}?/i)?.[1];
    const expected = record.status !== 'published' ? undefined : record.dateSource === 'canonical' ? record.date : bibtexYear;
    assert.equal(item.datePublished, expected, `${id}: datePublished must come from a bibliographic source`);
    if (record.dateSource === 'cv-presentation' && record.date) assert.notEqual(item.datePublished, record.date, `${id}: presentation month emitted as publication date`);
  }
});

test('Teaching lists the PNU courses with official English names and links to their sites', async () => {
  const courses = await json('src/content/courses.json');
  const teaching = documents.get('/teaching/');
  const main = byTag(teaching, 'main')[0];
  const rows = byAttr(main, 'data-course');
  assert.deepEqual(rows.map(row => attr(row, 'data-course')), ['machine-learning', 'data-structure']);
  // PI decision 2026-10-01 (audit 61): PNU subjectEng in title case, never the descriptive README names.
  assert.deepEqual(rows.map(row => content(byTag(row, 'h2')[0])), ['Machine Learning', 'Data Structure']);
  assert(!/Introduction to Machine Learning|Data Structures\b/.test(content(main)), 'Use the official English course names');
  for (const [index, row] of rows.entries()) {
    const korean = byAttr(row, 'lang', 'ko').find(node => node.tagName === 'p');
    assert.equal(content(korean), courses[index].koreanTitle, 'Korean course name as on the course site');
    const link = byAttr(row, 'data-course-link')[0];
    assert.equal(attr(link, 'href'), courses[index].url);
    assert.equal(attr(link, 'hreflang'), 'ko');
    assert(!has(link, 'target'), 'Same-origin course sites open in place');
    assert(content(link).includes('Course materials (in Korean)'));
  }
  assert(!/\b(?:Fall|Spring|semester|BX\d|DS\d{4}|AB\d)/i.test(content(main)), 'No term or course code without a decision to show it');
  const nav = byTag(byTag(teaching, 'header')[0], 'nav').find(node => attr(node, 'aria-label') === 'Main navigation');
  assert.deepEqual(byTag(nav, 'a').map(node => content(node)), ['Research', 'Publications', 'Teaching', 'People', 'Contact']);
  const graph = JSON.parse(scriptBody(byTag(teaching, 'script').find(node => attr(node, 'type') === 'application/ld+json')))['@graph'];
  const items = graph.at(-1).mainEntity.itemListElement.map(entry => entry.item);
  assert.deepEqual(items.map(item => [item.name, item.alternateName, item.url]), courses.map(course => [course.title, course.koreanTitle, course.url]));
  for (const item of items) {
    assert.equal(item['@type'], 'Course');
    assert.equal(item.instructor, undefined, 'instructor belongs on CourseInstance');
    assert.deepEqual(item.hasCourseInstance, { '@type': 'CourseInstance', instructor: { '@id': `${origin}/people/#pi` } });
    assert.equal(item.provider['@id'], `${origin}/#university`);
  }
  assert(graph.some(node => node['@id'] === `${origin}/people/#pi`), 'The instructor id resolves to the PI node');
});

test('the favicon is a transparent image, not an empty data URI', async () => {
  // PI 2026-10-02: no mark, but a real image so /favicon.ico requests resolve.
  for (const [route, document] of documents) {
    const icons = byTag(document, 'link').filter(node => attr(node, 'rel') === 'icon');
    assert.deepEqual(icons.map(node => attr(node, 'href')), ['/favicon.ico'], `${route}: one favicon link`);
  }
  const icon = await readFile(path.join(root, 'dist/favicon.ico'));
  assert.deepEqual([...icon.subarray(0, 4)], [0, 0, 1, 0], 'ICO header');
  assert.equal(icon.readUInt16LE(4), 3, '16, 32 and 48 px frames');
});

test('Google Analytics loads only on the production host', () => {
  for (const [route, document] of documents) {
    const loaders = byTag(document, 'script').filter(node => scriptBody(node).includes('G-H8EZQ381WH'));
    assert.equal(loaders.length, 1, `${route}: one GA4 loader`);
    const body = scriptBody(loaders[0]);
    assert(body.startsWith(`if (location.hostname === "${new URL(origin).hostname}") {`) && body.trim().endsWith('}'), `${route}: GA4 must be gated to the production host`);
    assert(!byTag(document, 'script').some(node => (attr(node, 'src') ?? '').includes('googletagmanager')), `${route}: no static third-party script request`);
  }
});

test('sitemap, robots and llms.txt describe exactly the public routes', async () => {
  const sitemap = await readFile(path.join(root, 'dist/sitemap.xml'), 'utf8');
  assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]), routes.map(route => origin + route));
  assert.match(await readFile(path.join(root, 'dist/robots.txt'), 'utf8'), new RegExp(`^Sitemap: ${origin}/sitemap\\.xml$`, 'm'));
  const llms = await readFile(path.join(root, 'dist/llms.txt'), 'utf8');
  assert(llms.startsWith('# Scientific Inference Lab\n'), 'llms.txt starts with the site name');
  assert(!/with citations/i.test(llms), 'llms.txt must not promise citations that some records lack');
  for (const route of routes) assert(llms.includes(`](${origin}${route})`), `llms.txt lacks ${route}`);
  const links = [...llms.matchAll(/\]\((https:\/\/scientific-inference-lab\.github\.io\/[^)]*#[^)]+)\)/g)].map(match => new URL(match[1]));
  for (const link of links) {
    const document = documents.get(link.pathname);
    assert(document && byAttr(document, 'id', link.hash.slice(1)).length, `llms.txt: missing fragment ${link.href}`);
  }
  for (const record of await json('src/content/publications.json')) assert(llms.includes(`[${record.title}](${origin}/publications/#${record.id})`), `llms.txt lacks ${record.id}`);
});

test('the executable QC contract cannot silently succeed on a deleted suite', async () => {
  const packageJson = await json('package.json');
  assert(packageJson.scripts.test.includes('tests/site.test.mjs'), 'Name the test entry explicitly so deletion is fatal');
  for (const file of ['browser-qa.py', 'mobile-qa.py', 'design-state-qa.py', 'qa_support.py']) {
    assert((await stat(path.join(root, 'tests', file))).isFile(), file);
  }
});
