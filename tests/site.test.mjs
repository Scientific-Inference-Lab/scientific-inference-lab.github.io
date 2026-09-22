import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { parse } from 'parse5';

const root = fileURLToPath(new URL('../', import.meta.url));
const routes = ['/', '/research/', '/publications/', '/people/', '/contact/'];
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
    assert(!/[\uac00-\ud7a3]/u.test(content(main[0])), `${route}: mixed-language public text`);
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
    ['/people/', 'People'],
    ['/contact/', 'Contact'],
  ]);
  for (const [route, title] of expected) {
    const main = byTag(documents.get(route), 'main')[0];
    const headers = byAttr(main, 'data-page-header');
    assert.equal(headers.length, 1, `${route}: use the shared page header exactly once`);
    assert.equal(content(byTag(headers[0], 'h1')[0]), title, `${route}: page title`);
    assert.equal(all(headers[0], node => (attr(node, 'class') ?? '').split(/\s+/).includes('kicker')).length, 1, `${route}: one shared eyebrow`);
    assert.equal(all(headers[0], node => (attr(node, 'class') ?? '').split(/\s+/).includes('page-description')).length, 1, `${route}: one task-oriented description`);
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
      assert(rendered.includes('Presented') && !rendered.includes('Accepted'), `${publication.id}: completed event must not display pending acceptance`);
      assert(rendered.includes('Final citation pending'), `${publication.id}: citation availability remains distinct`);
    }
    else if (publication.status !== 'published') assert(rendered.toLowerCase().includes(publication.status), `${publication.id}: missing visible status`);
    else assert(!/\bPublished\b/.test(rendered), `${publication.id}: redundant published status`);
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
    assert.match(record.bibtex, new RegExp(`^\\s*@(?:article|inproceedings|incollection|book|misc)\\s*\\{\\s*${record.canonicalKey}\\s*,`, 'i'), `${record.id}: malformed or mismatched canonical citation`);
    assert.equal(record.bibtex.match(/^\s*@(\w+)/)?.[1].toLowerCase(), record.bibtexEntryType, `${record.id}: preserve canonical entry type independently of display category`);
  }
  for (const id of Object.values(legacy).slice(3)) {
    const record = publications.find(record => record.id === id);
    assert.equal(record.bibtex, null, `${id}: do not substitute experimental or synthesized BibTeX for an unavailable canonical citation`);
    assert.equal(byAttr(document, 'data-cite', id).length, 0, `${id}: unavailable citation must not have a Cite control`);
  }
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
    ['Google Scholar', pi.links.scholar], ['GitHub', pi.links.github],
    ['LinkedIn', pi.links.linkedin], ['Personal website', pi.links.personal],
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
  const portraitFigure = byTag(home, 'figure').find(node => attr(node, 'class')?.split(/\s+/).includes('pi-feature'));
  assert(portraitFigure, 'Home must retain the supplied PI photograph and context');
  const peopleActions = byTag(portraitFigure, 'a').filter(node => attr(node, 'href') === '/people/');
  assert.equal(peopleActions.length, 1, 'The PI introduction needs one clear People action, not duplicate adjacent links');
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
  for (const [route, document] of documents) {
    for (const node of all(document, node => node.tagName)) {
      const references = [attr(node, 'href'), attr(node, 'src'), attr(node, 'poster')].filter(Boolean);
      const srcset = attr(node, 'srcset');
      if (srcset && !srcset.startsWith('data:')) references.push(...srcset.split(',').map(entry => entry.trim().split(/\s+/)[0]));
      for (const reference of references) {
        if (/^(?:data|blob|mailto|tel|javascript):/.test(reference)) continue;
        const url = new URL(reference, origin + route);
        if (url.origin !== origin) continue;
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

test('the executable QC contract cannot silently succeed on a deleted suite', async () => {
  const packageJson = await json('package.json');
  assert(packageJson.scripts.test.includes('tests/site.test.mjs'), 'Name the test entry explicitly so deletion is fatal');
  for (const file of ['browser-qa.py', 'mobile-qa.py', 'design-state-qa.py', 'qa_support.py']) {
    assert((await stat(path.join(root, 'tests', file))).isFile(), file);
  }
});
