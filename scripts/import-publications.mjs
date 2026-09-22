import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { parse as parseBibTeX } from '@retorquere/bibtex-parser';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const sourceArgument = args.indexOf('--source');
if (sourceArgument < 0 || !args[sourceArgument + 1]) {
  throw new Error('Usage: node scripts/import-publications.mjs --source <Achivement root> [--check]');
}
const sourceRoot = path.resolve(args[sourceArgument + 1]);
const checkOnly = args.includes('--check');
const hash = value => createHash('sha256').update(value).digest('hex');
const read = relative => readFile(path.join(sourceRoot, relative), 'utf8');
const sourcePath = 'CV_publish/data/publications.json';
const canonicalPath = 'bibtex/canonical/cv_complete.bib';
const policyPaths = ['AGENTS.md', 'bibtex/README.md', 'CV_publish/README.md'];
const sourceText = await read(sourcePath);
const canonicalText = await read(canonicalPath);
const overridePath = 'scripts/import-publications.overrides.json';
const overrideText = await readFile(path.join(root, overridePath), 'utf8');
const overrides = JSON.parse(overrideText);
const sourceSchema = z.array(z.object({
  key: z.string().regex(/^[a-z0-9_-]+$/),
  kind: z.literal('publication'),
  recordType: z.enum(['publication', 'accepted_in_press']),
  sectionId: z.enum(['conference_proceedings', 'journal_papers']),
  verificationStatus: z.string(),
  sourceWarnings: z.array(z.string()),
  plainText: z.string(),
  record: z.object({ title: z.string().min(1), authors: z.string().min(1),
    year: z.number().int(), venue: z.string().min(1), url: z.string().optional(),
    doi: z.string().optional() }),
  displayNotes: z.object({ rendered: z.array(z.object({ text: z.string(), status: z.string() })) }),
  recordLinks: z.array(z.object({ category: z.string(), url: z.url() })),
}));
const rawRecords = JSON.parse(sourceText);
const upstream = sourceSchema.parse(rawRecords);
assert.equal(upstream.length, 28, 'Publication scope changed; review the public export before reimporting');
assert.equal(new Set(upstream.map(record => record.key)).size, upstream.length, 'Duplicate upstream publication keys');

const canonicalLibrary = parseBibTeX(canonicalText, { raw: true });
assert.deepEqual(canonicalLibrary.errors, [], 'Canonical bibliography parse failed');
const canonicalEntries = new Map(canonicalLibrary.entries.map(entry => [entry.key, entry.type]));

function canonicalDate(value, expectedYear) {
  if (!value) return undefined;
  // Zotero mirrors prefix the original date with YYYY-MM-DD, using 00 for unknown parts.
  const parts = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(?:\s+.*)?$/.exec(value);
  assert.ok(parts, `Unsupported canonical date format: ${value}`);
  const [, year, month, day] = parts;
  assert.equal(Number(year), expectedYear, 'Canonical date disagrees with the public publication year');
  assert.ok(!month || Number(month) <= 12, `Invalid canonical month: ${value}`);
  assert.ok(!day || Number(day) <= new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate(), `Invalid canonical day: ${value}`);
  assert.ok(Number(month) || !Number(day), `Canonical day has no month: ${value}`);
  return [year, Number(month) ? month : undefined, Number(day) ? day : undefined].filter(Boolean).join('-');
}

function presentationDate(plainText, year) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const pattern = new RegExp(`\\b(${months.join('|')})(?:\\s+\\d{1,2}(?:-\\d{1,2})?,)?\\s+${year}\\b`, 'g');
  const matches = [...plainText.matchAll(pattern)];
  assert.ok(new Set(matches.map(match => match[1])).size <= 1, 'Conflicting stated CV months require source review');
  if (!matches.length) return undefined;
  const [snippet, month] = matches[0];
  return { date: `${year}-${String(months.indexOf(month) + 1).padStart(2, '0')}`, snippet };
}
const venueLabels = [
  [/SIGKDD/, 'KDD'], [/Machine Learning \(ICML/, 'ICML'],
  [/Health, Inference, and Learning/, 'CHIL'], [/AAAI Conference/, 'AAAI'],
  [/Information and Knowledge Management/, 'CIKM'], [/Joint Conference on Artificial Intelligence/, 'IJCAI'],
  [/Learning Representations/, 'ICLR'], [/Data Mining Workshops/, 'ICDMW'],
  [/IISE Annual Conference/, 'IISE'],
];
const safeUrl = value => {
  const url = new URL(value);
  assert.ok(['https:', 'http:'].includes(url.protocol), 'Non-public URL protocol');
  return value;
};
const authorsFor = (value, override) => {
  if (override?.authors) return override.authors;
  return value.split(' and ').map(author => {
    const [family, ...given] = author.split(', ');
    assert.equal(given.length, 1, 'Unexpected author syntax; requires upstream structured author review');
    return `${given[0]} ${family}`;
  });
};
const publications = [];
const provenance = [];
for (const [upstreamOrder, item] of upstream.entries()) {
  assert.equal(item.verificationStatus, 'partially_verified', 'Review changed field-level verification status');
  assert.ok(item.sourceWarnings.every(warning => ['accepted_in_press_local_metadata',
    'title_sentence_case_applied_from_zotero', 'links_paper_overrides_source_url'].includes(warning)), 'Unreviewed source warning');
  const override = overrides[item.key];
  const fields = override?.fields ?? {};
  const category = item.sectionId === 'journal_papers' ? 'journal' : 'conference';
  const links = item.recordLinks.map(link => ({ type: link.category, url: safeUrl(link.url) }));
  const publicPaper = links.find(link => ['paper', 'doi'].includes(link.type))?.url;
  const recordUrl = fields.url ?? publicPaper ?? item.record.url ?? links.find(link => link.type === 'arxiv')?.url;
  assert.ok(recordUrl, `No public paper destination for ${item.key}`);
  const url = safeUrl(recordUrl);
  if (!links.some(link => link.url === url)) links.unshift({ type: url.includes('arxiv.org') ? 'arxiv' : 'paper', url });
  const codeUrl = links.find(link => link.type === 'code')?.url;
  const recognition = fields.recognition ?? item.displayNotes.rendered
    .filter(note => note.status === 'verified').map(note => note.text).join('; ');
  const bibtexPath = canonicalEntries.has(item.key)
    ? `bibtex/publications/${category}/${item.key}.bib` : null;
  const bibtex = bibtexPath ? await read(bibtexPath) : null;
  const parsedCitation = bibtex ? parseBibTeX(bibtex, { raw: true }) : null;
  const entry = parsedCitation?.entries[0];
  if (bibtex) {
    assert.deepEqual(parsedCitation.errors, [], `Citation parse failed: ${item.key}`);
    assert.equal(parsedCitation.entries.length, 1, 'One canonical entry is required per mirror');
    assert.equal(entry?.key, item.key, 'Mirror citation key differs from publication identity');
    assert.equal(entry?.type, canonicalEntries.get(item.key), 'Mirror type differs from canonical aggregate');
    assert.ok(['article', 'inproceedings', 'misc'].includes(entry.type), 'Unreviewed canonical entry type');
    assert.ok(!/file\s*=|file:\/\/|\/Users\/|achievement_records\/|data\/evidence\//i.test(bibtex), 'Private marker in canonical citation');
  }
  const citationDate = canonicalDate(entry?.fields.date, item.record.year);
  const cvDate = !citationDate || citationDate.length === 4 ? presentationDate(item.plainText, item.record.year) : undefined;
  const date = cvDate?.date ?? citationDate;
  const dateSource = cvDate ? 'cv-presentation' : date ? 'canonical' : undefined;
  publications.push({
    id: item.key,
    canonicalKey: item.key,
    ...(override?.aliases ? { aliases: override.aliases } : {}),
    title: fields.title ?? item.record.title,
    authors: authorsFor(item.record.authors, fields),
    venue: venueLabels.find(([pattern]) => pattern.test(item.record.venue))?.[1] ?? item.record.venue,
    venueName: fields.venueName ?? item.record.venue,
    year: item.record.year,
    ...(date ? { date } : {}),
    ...(dateSource ? { dateSource } : {}),
    upstreamOrder,
    category,
    status: fields.status ?? (item.recordType === 'accepted_in_press' ? 'accepted' : 'published'),
    ...(fields.presentationStatus ? { presentationStatus: fields.presentationStatus } : {}),
    ...(fields.bibliographyStatus ? { bibliographyStatus: fields.bibliographyStatus } : {}),
    type: fields.type ?? (category === 'journal' ? 'Journal article' : 'Conference paper'),
    ...(recognition ? { recognition } : {}),
    url,
    ...(codeUrl ? { codeUrl } : {}),
    links,
    bibtex,
    bibtexEntryType: entry?.type ?? null,
  });
  provenance.push({
    id: item.key,
    upstreamKey: item.key,
    sourceRecordSha256: hash(JSON.stringify(rawRecords.find(record => record.key === item.key))),
    bibtexSource: bibtexPath,
    bibtexSha256: bibtex ? hash(bibtex) : null,
    citationStatus: bibtex ? 'canonical-verbatim' : 'no-canonical-entry',
    canonicalDateLiteral: entry?.fields.date ?? null,
    date: date ?? null,
    dateSource: dateSource ?? null,
    cvDateSnippet: cvDate?.snippet ?? null,
    upstreamOrder,
    overrides: override ?? null,
  });
}
const inputs = [{ path: sourcePath, sha256: hash(sourceText) }, { path: canonicalPath, sha256: hash(canonicalText) }];
for (const policyPath of policyPaths) inputs.push({ path: policyPath, sha256: hash(await read(policyPath)) });
const data = `${JSON.stringify(publications, null, 2)}\n`;
const manifest = `${JSON.stringify({
  format: 'scientific-inference-lab-publications-import-v1',
  source: 'Achivement public CV and canonical BibTeX mirrors',
  policy: 'Only public CV publication records; canonical-eligible per-record BibTeX preserved byte for byte. No private record paths followed.',
  inputs,
  overrideInput: { path: overridePath, sha256: hash(overrideText) },
  output: { path: 'src/content/publications.json', sha256: hash(data) },
  counts: { total: publications.length, conference: publications.filter(p => p.category === 'conference').length,
    journal: publications.filter(p => p.category === 'journal').length, canonicalCitations: publications.filter(p => p.bibtex).length },
  records: provenance,
}, null, 2)}\n`;
const outputs = [['src/content/publications.json', data], ['docs/data/publication-import-manifest.json', manifest]];
for (const [relative, content] of outputs) {
  const destination = path.join(root, relative);
  if (checkOnly) assert.equal(await readFile(destination, 'utf8'), content, `Stale import: ${relative}`);
  else {
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
}
console.log(`${checkOnly ? 'Verified' : 'Imported'} ${publications.length} public publications; ${publications.filter(p => p.bibtex).length} verbatim canonical citations; ${publications.filter(p => !p.bibtex).length} citations unavailable.`);
