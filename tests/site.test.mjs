import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { parse } from 'parse5';

const root = fileURLToPath(new URL('../', import.meta.url));
const profileRoute = '/people/yongkyung-oh/';
const routes = ['/', '/people/', profileRoute, '/research/', '/publications/', '/teaching/', '/contact/', '/news/'];
const navRoutes = routes.filter(route => route !== '/' && route !== profileRoute && route !== '/news/');
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
  const fixture = await mkdtemp(path.join(tmpdir(), 'lab-freshness-test-'));
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

test('substantive, distinct English documents are prerendered', () => {
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
    ['/people/', 'Team'],
    [profileRoute, 'YongKyung Oh'],
    ['/contact/', 'Contact'],
    ['/news/', 'News'],
  ]);
  for (const [route, title] of expected) {
    const main = byTag(documents.get(route), 'main')[0];
    const headers = byAttr(main, 'data-page-header');
    assert.equal(headers.length, 1, `${route}: use the shared page header exactly once`);
    assert.equal(content(byTag(headers[0], 'h1')[0]), title, `${route}: page title`);
    assert.equal(all(headers[0], node => (attr(node, 'class') ?? '').split(/\s+/).includes('kicker')).length, 0, `${route}: no eyebrow above the page title`);

    const descriptions = all(headers[0], node => (attr(node, 'class') ?? '').split(/\s+/).includes('page-description'));
    assert.equal(descriptions.length, ['/people/', profileRoute, '/contact/', '/news/'].includes(route) ? 0 : 1, `${route}: page-header description`);
  }
  assert.equal(byAttr(documents.get('/'), 'data-page-header').length, 0, 'Home keeps its distinct identity-led hierarchy');
});

test('static assets are explicitly allowed and copied without modification', async () => {
  const allowed = await json('tests/static-assets.json');
  assert.equal(new Set(allowed).size, allowed.length, 'Duplicate static asset entries');
  const actual = (await files(path.join(root, 'public'))).map(file => path.relative(path.join(root, 'public'), file).split(path.sep).join('/')).sort();
  assert.deepEqual(actual, [...allowed].sort(), 'Static assets must match tests/static-assets.json');
  for (const name of actual) {
    assert.deepEqual(await readFile(path.join(root, 'dist', name)), await readFile(path.join(root, 'public', name)), name);
  }
});

test('public output excludes internal records, machine paths and source maps', async () => {
  const forbidden = [/\/Users\//, /%2fUsers%2f/i, /file:\/\//, /\.claude\//, /\.codex\//, /_archive\//, /docs\/(?:current|audit|data|design)\//, /AGENTS\.md/, /CLAUDE\.md/];
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
    for (const destination of navRoutes) assert(byTag(nav, 'a').some(node => attr(node, 'href') === destination), `${route}: missing ${destination}`);
    const footer = byTag(document, 'footer');
    assert.equal(footer.length, 1, route);
    assert(content(footer[0]).includes('Pusan National University'), `${route}: missing institutional context`);
    const universityMark = byTag(footer[0], 'img').find(image => attr(image, 'alt') === 'Pusan National University');
    assert(universityMark && attr(universityMark, 'src')?.split('?')[0].endsWith('.svg'), `${route}: institutional signature must use the official vector asset`);
  }
  const home = byTag(documents.get('/'), 'h1')[0];
  assert.equal(content(home), 'Scientific inference for discovery and decision-making.', 'The purpose leads Home');
  assert.equal(byTag(home, 'br').length, 0);
});

test('the imported public inventory retains complete titles, author order and metadata', () => {
  const records = byAttr(documents.get('/publications/'), 'data-publication');
  assert(publications.length > 0, 'Publication records are present');
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

});

test('Discovery metadata stays concise, canonical and consistent with sharing metadata', () => {
  for (const [route, doc] of documents) {
    const head = byTag(doc, 'head')[0];
    const title = content(byTag(head, 'title')[0]).trim();
    const descriptions = byTag(head, 'meta').filter(node => attr(node, 'name') === 'description');
    assert.equal(descriptions.length, 1, `${route}: one description`);
    const description = attr(descriptions[0], 'content');
    assert(title.length <= 40, `${route}: title should fit the 40-character title limit`);
    assert(description.length <= 80, `${route}: description should fit the 80-character description limit`);
    for (const [property, expected] of [['og:title', title], ['og:description', description]]) {
      const matches = byTag(head, 'meta').filter(node => attr(node, 'property') === property);
      assert.equal(matches.length, 1, `${route}: one ${property}`);
      assert.equal(attr(matches[0], 'content'), expected, `${route}: consistent ${property}`);
    }
    const discovery = byTag(head, 'link').filter(node => attr(node, 'rel') === 'describedby');
    assert.equal(discovery.length, 1, `${route}: llms discovery`);
    assert.equal(attr(discovery[0], 'href'), '/llms.txt');
  }
});

test('Home shows the three latest news items and links to the complete archive', () => {
  assert(news.length > 0, 'News must have published entries');
  assert.equal(new Set(news.map(item => item.id)).size, news.length, 'News IDs must be unique');
  assert.deepEqual(news.map(item => item.date), [...news].map(item => item.date).sort().reverse(), 'News must be newest first');
  const home = byAttr(documents.get('/'), 'data-home-news')[0];
  const archive = documents.get('/news/');
  const upcoming = byAttr(archive, 'aria-labelledby', 'upcoming-heading')[0];
  const published = [...news.filter(item => item.featured && !item.upcoming), ...news.filter(item => !item.featured && !item.upcoming)];
  const upcomingEntries = upcoming ? byTag(upcoming, 'article') : [];
  assert(byTag(home, 'a').some(link => attr(link, 'href') === '/news/' && content(link) === 'More news'));
  for (const [entries, items, heading] of [
    [byTag(home, 'article'), published.slice(0, 3), 'h3'],
    [byTag(archive, 'article').filter(node => !upcomingEntries.includes(node)), published, 'h2'],
    [upcomingEntries, news.filter(item => item.upcoming), 'h3'],
  ]) {
    assert.deepEqual(entries.map(node => attr(node, 'id')), items.map(item => `news-${item.id}`));
    for (const [index, item] of items.entries()) {
      assert.equal(content(byTag(entries[index], heading)[0]), item.title);
      assert.equal(attr(byTag(entries[index], 'time')[0], 'datetime'), item.date);
      assert(content(entries[index]).includes(item.category));
      if (item.source) {
        const sourceLink = byAttr(entries[index], 'href', item.source.url);
        assert.equal(sourceLink.length, 1);
        assert.equal(content(sourceLink[0]), item.source.label);
      }
    }
  }
});

test('publication order uses explicit canonical dates then upstream order', () => {
  assert.deepEqual(publications.map(p => p.order).sort((a,b) => a-b), Array.from({length: publications.length}, (_,i) => i));
  const ordered = [...publications].sort((a,b) => b.year-a.year ||
    (b.date?.length > 4 ? b.date : '').localeCompare(a.date?.length > 4 ? a.date : '') || a.order-b.order);
  const rendered = byAttr(documents.get('/publications/'), 'data-publication').map(node => attr(node, 'data-publication'));
  assert.deepEqual(rendered, ordered.map(p => p.id));
  for (const publication of publications) {
    if (!publication.date) continue;
    if (publication.dateType === 'publication') assert(publication.bibtex?.includes(publication.date), `${publication.id}: date is not explicit in the canonical citation`);
    else assert.equal(publication.dateType, 'presentation', `${publication.id}: missing date source`);
    assert.equal(Number(publication.date.slice(0,4)), publication.year);
    assert(!/-00/.test(publication.date), `${publication.id}: unknown month/day must not become a date`);
  }
});

test('canonical publication identities and legacy fragments survive the inventory import', () => {
  const document = documents.get('/publications/');
  const legacy = Object.fromEntries(publications.flatMap(record => (record.aliases ?? []).map(alias => [alias, record.id])));
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
  for (const record of canonical) {
    assert.equal(typeof record.bibtex, 'string', `${record.id}: citation must be canonical text or explicit null`);
    assert.equal(typeof record.apa, 'string', `${record.id}: APA must be generated for every canonical citation`);
    assert(record.apa.length > 20 && !/[\r\n]/.test(record.apa), `${record.id}: generated APA must be one non-empty reference`);
    assert.match(record.bibtex, new RegExp(`^\\s*@(?:article|inproceedings|incollection|book|misc)\\s*\\{\\s*${record.canonicalKey}\\s*,`, 'i'), `${record.id}: malformed or mismatched canonical citation`);
    assert.equal(record.bibtex.match(/^\s*@(\w+)/)?.[1].toLowerCase(), record.bibtexEntryType, `${record.id}: preserve canonical entry type independently of display category`);
  }
  for (const record of canonical) {
    assert.equal(byAttr(document, 'data-cite', record.id).length, 1, `${record.id}: one Cite control`);
  }
  assert.equal(publications.filter(record => record.apa !== null).length, canonical.length, 'APA and canonical BibTeX availability must match');
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
});

test('people profiles render their public records and working destinations', async () => {
  const pi = (await json('src/content/people.json'))[0];
  const members = await json('src/content/members.json');
  const catalog = await json('src/content/profile-links.json');
  const profile = documents.get(profileRoute);
  const index = documents.get('/people/');
  const shown = catalog.links.filter(link => !link.omitOn.includes('lab'));
  const expectedProfiles = [...shown.filter(link => link.webFeatured === true), ...shown.filter(link => link.webFeatured !== true)].map(link => [link.label, link.url]);
  const collapsed = shown.filter(link => link.webFeatured !== true).length;
  const profileDestinations = node => byTag(node, 'a').map(link => [content(link).trim(), attr(link, 'href')]);
  for (const document of [profile, index]) {
    const profiles = byAttr(document, 'aria-label', `${pi.name}'s profiles`)[0];
    assert(profiles, 'Named profile links');
    assert.deepEqual(profileDestinations(profiles), expectedProfiles);
    const more = byTag(profiles, 'details');
    assert.equal(more.length, 1, 'One closed profile disclosure');
    assert(!has(more[0], 'open'), 'Extra profiles start collapsed');
    assert.equal(content(byTag(more[0], 'summary')[0]).trim(), 'More profiles');
    assert.equal(byTag(more[0], 'a').length, collapsed, 'Only non-featured profiles are collapsed');
  }
  assert(content(profile).includes(pi.bio), 'Profile bio matches its record');
  const card = byAttr(index, 'id', 'pi')[0];
  assert(card && content(card).includes(pi.shortBio), 'PI card matches its record');
  assert.equal(byTag(byAttr(index, 'id', 'pi-card-name')[0], 'a').length, 0);
  const actions = byTag(card, 'a').filter(link => attr(link, 'href') === profileRoute);
  assert.equal(actions.length, 1, 'One profile destination');
  assert(has(actions[0], 'data-profile-action'));
  assert.equal(attr(actions[0], 'aria-label'), `Full profile of ${pi.name}`);
  assert.equal(content(actions[0]).trim(), 'Full profile');

  const recognition = byAttr(profile, 'aria-labelledby', 'recognition-heading')[0];
  assert(recognition, 'Named recognition section');
  for (const [attribute, records] of [['data-honor', pi.honors], ['data-award', pi.awards], ['data-patent', pi.patents], ['data-grant', pi.grants]]) {
    const rows = byAttr(recognition, attribute);
    assert.equal(rows.length, records.length, `${attribute}: all records rendered`);
    for (const [position, record] of records.entries()) {
      assert(content(rows[position]).includes(record.title), `${attribute}: title`);
      if (record.organizer) assert(content(rows[position]).includes(record.organizer), `${attribute}: organizer`);
      if (record.sponsor) assert(content(rows[position]).includes(record.sponsor), `${attribute}: sponsor`);
      if (record.role) assert(content(rows[position]).includes(record.role), `${attribute}: role`);
      if (record.recipient) assert(content(rows[position]).includes(record.recipient), `${attribute}: recipient`);
      for (const filing of record.filings ?? []) assert(content(rows[position]).includes(`${filing.office} ${filing.number}, ${filing.status} ${filing.date}`), `${attribute}: filing`);
    }
  }
  const details = byTag(recognition, 'details');
  assert.deepEqual(details.map(node => content(byTag(node, 'summary')[0])), ['Research awards', 'Patents']);
  assert(details.every(node => !has(node, 'open')), 'Details start closed');
  for (const id of ['honors-heading', 'paper-recognition-heading', 'grant-recognition-heading']) {
    const group = byAttr(recognition, 'aria-labelledby', id)[0];
    assert(group && !byTag(group, 'details').length, `${id}: visible group`);
  }
  const publicationIds = new Set(publications.map(record => record.id));
  for (const link of byTag(recognition, 'a')) {
    const href = attr(link, 'href');
    assert(href?.startsWith('/publications/#') && publicationIds.has(href.slice('/publications/#'.length)), 'Recognition link resolves to a publication');
  }
  const cards = byAttr(index, 'data-member');
  assert.equal(cards.length, members.length);
  const orderedMembers = [...members.filter(member => member.role !== 'Alumni').sort((a, b) => Number(Boolean(a.placeholder)) - Number(Boolean(b.placeholder))), ...members.filter(member => member.role === 'Alumni')];
  assert.deepEqual(cards.map(node => attr(node, 'data-member')), orderedMembers.map(member => member.id));
  for (const member of members.filter(member => member.placeholder)) {
    assert(has(byAttr(index, 'data-member', member.id)[0], 'data-placeholder'));
    const graph = JSON.parse(scriptBody(byTag(index, 'script').find(node => attr(node, 'type') === 'application/ld+json')))['@graph'];
    assert(!JSON.stringify(graph).includes(member.id), 'Placeholder is not structured as a Person');
  }
  assert.equal(byAttr(index, 'data-recognition-details').length, 0);
  for (const [route, document] of documents) {
    const footer = byTag(document, 'footer')[0];
    const profiles = byAttr(footer, 'aria-label', 'PI profiles')[0];
    assert(profiles, `${route}: named footer profiles`);
    assert.deepEqual(profileDestinations(profiles), expectedProfiles, `${route}: consistent profile links`);
    assert(content(footer).includes(pi.name) && content(footer).includes('Principal Investigator'), `${route}: PI identity`);
  }
});

test('research directions remain complete and generated illustrations stay out of the public site', async () => {
  const document = documents.get('/research/');
  const programs = (await json('src/content/programs.json')).sort((a, b) => a.order - b.order);
  const ids = programs.map(program => program.id);
  assert(ids.length > 0, 'Research directions are present');
  assert.equal(new Set(ids).size, ids.length, 'Research program IDs must be unique');
  const panels = byAttr(document, 'data-program-panel');
  assert.deepEqual(panels.map(panel => attr(panel, 'id')), ids);
  const main = byTag(document, 'main')[0];
  const index = byTag(main, 'nav').filter(node => attr(node, 'aria-label') === 'Research directions');
  assert.equal(index.length, 1, 'Research needs one named direction index');
  assert.deepEqual(byTag(index[0], 'a').map(node => attr(node, 'href')), ids.map(id => `#${id}`));
  assert.deepEqual(byAttr(main, 'data-program-link'), byTag(index[0], 'a'), 'All four direction links belong to the one index');
  assert.deepEqual(byTag(main, 'a').filter(node => attr(node, 'href')?.startsWith('#')).map(node => attr(node, 'href')), ids.map(id => `#${id}`), 'Do not restore per-section Next or index-return links');
  assert.equal(all(main, node => ['direction-number', 'section-number'].some(name => (attr(node, 'class') ?? '').split(/\s+/).includes(name))).length, 0, 'Peer research directions must not display ordinal numbers');
  const inquiry = byTag(main, 'a').filter(node => attr(node, 'href') === '/contact/');
  assert.equal(inquiry.length, 1, 'Research has one terminal inquiry action');
  assert(panels.every(panel => !byTag(panel, 'a').includes(inquiry[0])), 'The inquiry follows the complete research document, not an individual direction');
  const mainNodes = all(main, node => Boolean(node.tagName));
  const lastPanelNodes = all(panels.at(-1), node => Boolean(node.tagName));
  assert(mainNodes.indexOf(inquiry[0]) > Math.max(...lastPanelNodes.map(node => mainNodes.indexOf(node))), 'The inquiry must follow all four sections');
  const home = documents.get('/');

  const homeIntro = byTag(home, 'header').find(node => attr(node, 'class')?.split(/\s+/).includes('home-intro'));
  assert(homeIntro, 'Home must keep its introduction');
  assert.equal(byTag(homeIntro, 'img').length + byTag(homeIntro, 'picture').length + byTag(homeIntro, 'figure').length, 0, 'Home introduction must not show a portrait');
  const peopleActions = byTag(homeIntro, 'a').filter(node => ['/people/', profileRoute].includes(attr(node, 'href')));
  assert.equal(peopleActions.length, 1, 'Home needs exactly one People action');
  assert(attr(peopleActions[0], 'class')?.split(/\s+/).includes('button-secondary') && content(peopleActions[0]).trim() === 'Principal Investigator' && attr(peopleActions[0], 'href') === profileRoute, 'The People action is the "Principal Investigator" button to the profile');
  const contactPage = documents.get('/contact/');
  assert(!content(byTag(contactPage, 'main')[0]).includes('We welcome inquiries'), 'Contact must not repeat the Home inquiry guidance');
  const contactEmail = all(contactPage, node => attr(node, 'class')?.split(/\s+/).includes('contact-email'))[0];
  assert(contactEmail && byTag(contactEmail, 'wbr').length === 1, 'Contact email keeps a single preferred break point before "@"');
  const homeDirections = byAttr(home, 'aria-label', 'Research directions')[0];
  assert(homeDirections, 'Home must expose the complete research direction index');
  assert.deepEqual(byTag(homeDirections, 'a').map(node => attr(node, 'href')), ids.map(id => `/research/#${id}`), 'Home and Research must present the same direction order');
  const llms = await readFile(path.join(root, 'dist/llms.txt'), 'utf8');
  const llmsDirections = llms.split('## Research directions\n')[1].split('## Teaching\n')[0];
  assert.deepEqual([...llmsDirections.matchAll(/\/research\/#([^)]*)\)/g)].map(match => match[1]), ids, 'llms.txt must preserve the direction order');
  assert.equal(content(byTag(byTag(home, 'main')[0], 'h2')[0]), 'Research directions', 'Home should explain its directions before individual papers');
  for (const program of programs) {
    const { id } = program;
    const panel = panels.find(node => attr(node, 'id') === id);
    assert(panel && !has(panel, 'hidden'), `${id}: missing no-JavaScript content`);
    assert.equal(content(byTag(panel, 'h2')[0]), program.title, `${id}: missing research heading`);

    assert(!content(panel).includes(program.summary), `${id}: the Home description is not repeated on Research`);
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
    assert(overview && byTag(overview, 'img').length === 0, `${id}: direction overviews contain no images`);
    assert(content(overview).includes(program.summary), `${id}: summary must be openly comparable on Home`);
    assert(!has(overview, 'hidden'), `${id}: Home must not conceal direction descriptions`);
    assert(byTag(overview, 'a').some(node => attr(node, 'href') === `/research/#${id}`), `${id}: overview needs a direct research destination`);
    assert.equal(byTag(panel, 'img').length, 0, `${id}: direction panels contain no images`);
    const links = byTag(panel, 'a').map(node => attr(node, 'href'));
    const publicationLinks = links.filter(href => href?.startsWith('/publications/#'));
    const expectedPublications = program.related.map(paper => `/publications/#${paper.id}`);
    assert.equal(publicationLinks.length, program.related.length, `${id}: all related publications`);
    assert.deepEqual(publicationLinks, expectedPublications, `${id}: render the related publication destinations`);
    assert.deepEqual(byTag(related, 'a').map(node => attr(node, 'href')), expectedPublications, `${id}: linked evidence belongs in the related-publications section`);
  }
  assert.equal(byAttr(homeDirections, 'role', 'tab').length, 0, 'Home directions are native destinations, not a second selector');
  assert.equal(byAttr(document, 'role', 'tab').length, 0, 'Research must expose all four sections without selection');
});

test('the official wordmark is the full name in Pretendard 700, black, from the shipped Pretendard asset', async () => {
  for (const [route, document] of documents) {
    const marks = all(document, node => (attr(node, 'class') ?? '').split(/\s+/).includes('wordmark-text'));
    assert(marks.length >= 2, `${route}: header and footer wordmarks`);
    for (const mark of marks) assert.equal(content(mark), 'Scientific Inference Lab', `${route}: wordmark is the exact full name`);
    assert(!/\bSIL\b/.test(content(document)), `${route}: the lab name is never abbreviated`);
  }
  const css = (await Promise.all((await readdir(path.join(root, 'dist/_astro'))).filter(name => name.endsWith('.css')).map(name => readFile(path.join(root, 'dist/_astro', name), 'utf8')))).join('\n');

  const compact = css.replace(/\s+/g, ' ').replace(/ ?([{};:,]) ?/g, '$1');
  assert(/--font-wordmark:"?Pretendard"?/.test(compact), 'Wordmark token resolves to Pretendard');
  assert(/\.wordmark-text\{[^}]*font:700 [^}]*var\(--font-wordmark\)[^}]*letter-spacing:-\.018em[^}]*color:#000/.test(compact), 'Wordmark is Pretendard 700 with -.018em tracking in black');
  const licence = await readFile(path.join(root, 'dist/licenses/pretendard.txt'), 'utf8');
  assert(licence.includes('SIL Open Font License'), 'The Pretendard licence ships with the wordmark face');
});

test('People is the current navigation item on both People routes', () => {
  for (const [route, document] of documents) {
    for (const nav of byTag(document, 'nav').filter(node => attr(node, 'aria-label') === 'Main navigation')) {
      const current = byTag(nav, 'a').filter(node => attr(node, 'aria-current') === 'page').map(node => attr(node, 'href'));
      const destination = route === profileRoute ? '/people/' : route;
      const expected = navRoutes.includes(destination) ? [destination] : [];
      assert.deepEqual(current, expected, `${route}: current navigation item`);
    }
  }
});

test('the mobile menu is a complete native disclosure before JavaScript loads', () => {
  for (const [route, document] of documents) {
    const details = byAttr(document, 'data-mobile-navigation')[0];
    assert(details?.tagName === 'details', `${route}: native disclosure missing`);
    assert(!has(details, 'open'), `${route}: menu should start compact without JavaScript`);
    const summary = byAttr(details, 'data-menu-toggle')[0];
    assert(summary?.tagName === 'summary', `${route}: toggle must work natively`);
    const destinations = byTag(details, 'a').map(node => attr(node, 'href'));
    for (const destination of navRoutes) assert(destinations.includes(destination), `${route}: fallback lacks ${destination}`);
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
  const researchTitles = (await json('src/content/programs.json')).sort((a, b) => a.order - b.order).map(program => program.title);
  const fieldEnumeration = 'AI for Science, industrial AI and decision-making, evidence-centered AI, and continuous-time modeling';
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
    assert.equal(node('CollegeOrUniversity').name, 'Pusan National University', `${route}: institution stays explicit in structured data`);
    const person = node('Person');
    assert.deepEqual(person.knowsAbout, researchTitles, `${route}: Person topics must follow the visible research order`);
    assert.deepEqual(node('ResearchOrganization').knowsAbout, researchTitles, `${route}: lab topics must follow the visible research order`);
    assert(node('ResearchOrganization').description.includes(fieldEnumeration), `${route}: lab scope must use the research field enumeration`);
    const footerEmail = attr(byAttr(document, 'data-footer-email')[0], 'href');
    assert.equal(person.email, footerEmail, `${route}: Person email must equal the visible footer address`);
    const footerProfiles = all(byAttr(document, 'aria-label', 'PI profiles')[0], item => item.tagName === 'a').map(item => attr(item, 'href'));
    assert.deepEqual(person.sameAs, footerProfiles.filter(url => !url.startsWith('https://drive.google.com/')), `${route}: sameAs must equal the visible person profiles, excluding the CV document`);
    const page = graph.at(-1);
    assert.equal(page.url, origin + route, `${route}: structured page URL`);
    assert.equal(page.name, title, `${route}: structured page name`);
  }
  assert((await readFile(path.join(root, 'dist/llms.txt'), 'utf8')).includes(fieldEnumeration), 'llms.txt scope must use the research field enumeration');
  assert.equal(content(byTag(documents.get('/'), 'title')[0]), 'Scientific Inference Lab', 'Home title names the lab concisely');
  const graphOf = route => JSON.parse(scriptBody(byTag(documents.get(route), 'script').find(node => attr(node, 'type') === 'application/ld+json')))['@graph'];
  const piRecord = (await json('src/content/people.json'))[0];
  const profile = graphOf(profileRoute);
  assert.equal(profile.at(-1)['@type'], 'ProfilePage');
  assert.deepEqual(profile.at(-1).mainEntity, { '@id': `${origin}/people/#pi` });
  const profilePerson = profile.find(item => item['@type'] === 'Person');
  assert.equal(profilePerson['@id'], `${origin}/people/#pi`, 'The PI @id stays stable for the course sites');
  assert.equal(profilePerson.url, `${origin}${profileRoute}`, 'Person url is the profile page');
  const scheduledAwards = piRecord.awards.filter(award => award.scheduled);
  assert.equal(profilePerson.award.length, piRecord.honors.length + piRecord.awards.length - scheduledAwards.length, 'Person JSON-LD lists each honor and research award already presented');
  for (const award of scheduledAwards) assert(!profilePerson.award.some(item => item.startsWith(award.title)), 'Scheduled presentations are omitted from the award property');
  assert.equal(profilePerson.image, meta(documents.get(profileRoute), 'og:image')[0], 'Profile image must be the visible portrait');
  const indexGraph = graphOf('/people/');
  assert.equal(indexGraph.at(-1)['@type'], 'CollectionPage');
  assert.deepEqual(indexGraph.at(-1).mainEntity.itemListElement.map(entry => entry.item['@id']), [`${origin}/people/#pi`]);
  assert.equal(indexGraph.find(item => item['@type'] === 'Person').image, meta(documents.get('/people/'), 'og:image')[0], 'People image must be the visible portrait');
  const collection = JSON.parse(scriptBody(byTag(documents.get('/publications/'), 'script').find(node => attr(node, 'type') === 'application/ld+json')))['@graph'].at(-1);
  const items = collection.mainEntity.itemListElement.map(entry => entry.item);
  assert.equal(items.length, records.length, 'Every publication is described once');
  for (const item of items) {
    const id = item['@id'].split('#')[1];
    assert(publicationIds.has(id), `${id}: structured article must target a visible record`);
    const record = records.find(entry => entry.id === id);
    assert.equal(item.name, record.title, `${id}: title`);
    // a CV presentation month is not a publication date.
    const bibtexYear = record.bibtex?.match(/\byear\s*=\s*\{?(\d{4})\}?/i)?.[1];
    const expected = record.status !== 'published' ? undefined : record.publishedOnline ?? (record.dateType === 'publication' ? record.date : bibtexYear);
    assert.equal(item.datePublished, expected, `${id}: datePublished must come from a bibliographic source`);
    if (record.dateType === 'presentation' && record.date) assert.notEqual(item.datePublished, record.date, `${id}: presentation month emitted as publication date`);
  }
});

test('Teaching lists the PNU courses with official English names and links to their sites', async () => {
  const courses = await json('src/content/courses.json');
  const teaching = documents.get('/teaching/');
  const main = byTag(teaching, 'main')[0];
  const rows = byAttr(main, 'data-course');
  assert.deepEqual(rows.map(row => attr(row, 'data-course')), ['machine-learning', 'data-structure']);

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
  assert.deepEqual(byTag(nav, 'a').map(node => content(node)), ['Team', 'Research', 'Publications', 'Teaching', 'Contact']);
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
  assert.equal(byAttr(documents.get('/people/'), 'id', 'pi').length, 1, 'The instructor id resolves to an element on /people/');
});

test('the favicon is a transparent image, not an empty data URI', async () => {

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

test('line breaking is set by role in app.css and never pinned in prose', async () => {
  const sources = (await files(path.join(root, 'src'))).filter(file => /\.(astro|svelte|css|ts|json)$/.test(file));
  for (const file of sources) {
    const source = await readFile(file, 'utf8');
    const name = path.relative(root, file);
    if (!name.endsWith('app.css')) assert(!/text-wrap\s*:|\btext-(balance|pretty)\b/.test(source), `${name}: text-wrap belongs in app.css by role`);
    assert(!/ |‑|&nbsp;|&#160;|<br\s*\/?>/i.test(source), `${name}: no line pinning (NBSP, U+2011 or <br>)`);
    for (const match of source.matchAll(/([.\w-]+)\s*\{[^}]*overflow-wrap:\s*anywhere/g)) {
      assert(['.contact-email', '.footer-email'].includes(match[1]), `${name}: overflow-wrap:anywhere only on email, URL and DOI elements (${match[1]})`);
    }
  }
});



test('lab-authored copy spells "decision-making" one way', async () => {
  // Publications are excluded: venue names such as "Medical Decision Making" are verbatim.
  for (const file of ['src/content/people.json', 'src/content/news.json', 'src/content/programs.json', 'src/lib/data/lab.ts', 'src/components/ContactPanel.astro']) {
    assert(!/decision making/i.test(await readFile(path.join(root, file), 'utf8')), `${file}: use "decision-making"`);
  }
  const researchLabels = route => byTag(byTag(documents.get(route), 'main')[0], 'a').filter(node => attr(node, 'href') === '/research/').map(node => content(node).trim());
  assert.deepEqual(researchLabels('/contact/'), researchLabels('/').slice(0, 1), 'Contact names the Research destination with the Home label');
  assert.deepEqual(researchLabels('/'), ['Research'], 'The Home Research action names its destination');
});


test('page purpose stays independent of catalogue topics and agrees across discovery surfaces', async () => {
  const llms = await readFile(path.join(root, 'dist/llms.txt'), 'utf8');
  const pageIndex = llms.split('## Pages\n')[1].split('## Research directions\n')[0];
  const labels = new Map([['/research/', 'Research'], ['/publications/', 'Publications'], ['/teaching/', 'Teaching'], ['/contact/', 'Contact'], ['/news/', 'News']]);
  for (const [route, label] of labels) {
    const document = documents.get(route);
    const description = meta(document, 'description')[0];
    assert(description && !/\b(?:explore|search|meet|contact)\b/i.test(description), `${route}: describe the subject, without a visitor command`);
    assert(!/\b(?:complete|comprehensive|all)\b/i.test(description), `${route}: no unsupported completeness claim`);
    assert.deepEqual(meta(document, 'og:description'), [description], `${route}: Open Graph agrees`);
    const graph = JSON.parse(scriptBody(byTag(document, 'script').find(node => attr(node, 'type') === 'application/ld+json')))['@graph'];
    assert.equal(graph.at(-1).description, description, `${route}: JSON-LD page description agrees`);
    assert(pageIndex.includes(`- [${label}](${origin}${route}): ${description}`), `${route}: LLM page summary agrees`);
  }
  const teaching = documents.get('/teaching/');
  const purpose = meta(teaching, 'description')[0];
  const header = byAttr(teaching, 'data-page-header')[0];
  const visible = all(header, node => (attr(node, 'class') ?? '').split(/\s+/).includes('page-description'));
  assert.equal(content(visible[0]), purpose, 'Teaching header and metadata have the same enduring purpose');
  assert(!/\b(?:undergraduate|graduate)\b/i.test(purpose), 'Teaching purpose does not prescribe the current degree level');
  for (const course of await json('src/content/courses.json')) {
    assert(!purpose.toLowerCase().includes(course.title.toLowerCase()), `Teaching purpose must not enumerate a current course: ${course.id}`);
    assert(byAttr(teaching, 'data-course', course.id).length === 1, `${course.id}: keep the real course in the catalogue`);
  }
  const researchPurpose = meta(documents.get('/research/'), 'description')[0].toLowerCase();
  for (const program of await json('src/content/programs.json')) {
    assert(!researchPurpose.includes(program.title.toLowerCase()), `Research purpose must not enumerate a current direction: ${program.id}`);
  }
  const publications = documents.get('/publications/');
  const publicationHeader = byAttr(publications, 'data-page-header')[0];
  const publicationDescription = all(publicationHeader, node => (attr(node, 'class') ?? '').split(/\s+/).includes('page-description'));
  assert.equal(content(publicationDescription[0]), meta(publications, 'description')[0], 'Publications header and metadata agree');
  assert(!/complete publication record|\b\d+ entries\b/i.test(pageIndex), 'LLM navigation has no universal inventory/count claim');
});
