import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { parse as parseYaml } from 'yaml';
import { parse as parseBibTeX } from '@retorquere/bibtex-parser';
import { Cite } from '@citation-js/core';
import '@citation-js/plugin-bibtex';
import '@citation-js/plugin-csl';

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
  sourcePath: z.string(),
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

const upstreamRecordSchema = z.object({
  schema_version: z.literal('achievement-record-v2'),
  key: z.string(),
  record_type: z.enum(['publication', 'accepted_in_press']),
  publication_kind: z.enum(['conference', 'journal']),
  source: z.object({ type: z.enum(['zotero_bibtex_export', 'cv_tex']) }),
  title: z.string(),
  authors: z.string(),
  year: z.number().int(),
  venue: z.string(),
  zotero_key_status: z.enum(['present', 'absent_pending_publication']),
  verification: z.object({
    status: z.string(),
    events: z.array(z.object({
      result: z.string(),
      checks_failed: z.array(z.string()),
    })).min(1),
  }),
});
const upstreamRecordInputs = [];
const upstreamRecordHashes = new Map();
for (const item of upstream) {
  assert.match(item.sourcePath,
    /^records\/(publications|accepted_in_press)\/(conference|journal)\/[a-z0-9_-]+\.yaml$/,
    `${item.key}: public export points outside the allowed upstream record trees`);
  assert.equal(path.posix.normalize(item.sourcePath), item.sourcePath,
    `${item.key}: upstream record path is not normalized`);
  const expectedRecordFolder = item.recordType === 'publication' ? 'publications' : 'accepted_in_press';
  const expectedKindFolder = item.sectionId === 'journal_papers' ? 'journal' : 'conference';
  assert.equal(item.sourcePath,
    `records/${expectedRecordFolder}/${expectedKindFolder}/${item.key}.yaml`,
    `${item.key}: upstream record path contradicts its public identity or type`);
  const yamlText = await read(item.sourcePath);
  const record = upstreamRecordSchema.parse(parseYaml(yamlText));
  assert.equal(record.key, item.key, `${item.key}: upstream YAML key differs from public export`);
  assert.equal(record.record_type, item.recordType, `${item.key}: upstream YAML record type differs from public export`);
  if (record.title !== item.record.title) {
    assert.ok(item.sourceWarnings.includes('title_sentence_case_applied_from_zotero'),
      `${item.key}: public export changed the upstream YAML title without its reviewed warning`);
    assert.equal(record.title.toLocaleLowerCase('en-US'), item.record.title.toLocaleLowerCase('en-US'),
      `${item.key}: upstream YAML title differs from public export beyond reviewed letter case`);
  }
  assert.equal(record.authors, item.record.authors, `${item.key}: upstream YAML authors differ from public export`);
  assert.equal(record.year, item.record.year, `${item.key}: upstream YAML year differs from public export`);
  assert.equal(record.venue, item.record.venue, `${item.key}: upstream YAML venue differs from public export`);
  assert.equal(record.verification.status, item.verificationStatus,
    `${item.key}: upstream YAML verification status differs from public export`);
  const latestVerification = record.verification.events.at(-1);
  assert.equal(latestVerification?.result, 'pass',
    `${item.key}: latest upstream YAML verification did not pass`);
  assert.deepEqual(latestVerification?.checks_failed, [],
    `${item.key}: latest upstream YAML verification retains failed checks`);
  assert.equal(record.publication_kind, item.sectionId === 'journal_papers' ? 'journal' : 'conference',
    `${item.key}: upstream YAML publication kind differs from public export section`);
  assert.equal(record.source.type, item.recordType === 'publication' ? 'zotero_bibtex_export' : 'cv_tex',
    `${item.key}: upstream YAML source type contradicts record type`);
  assert.equal(record.zotero_key_status, item.recordType === 'publication' ? 'present' : 'absent_pending_publication',
    `${item.key}: upstream YAML Zotero state contradicts record type`);
  const yamlSha256 = hash(yamlText);
  upstreamRecordHashes.set(item.key, yamlSha256);
  upstreamRecordInputs.push({ path: item.sourcePath, sha256: yamlSha256 });
}

const canonicalLibrary = parseBibTeX(canonicalText, { raw: true });
assert.deepEqual(canonicalLibrary.errors, [], 'Canonical bibliography parse failed');
const canonicalEntries = new Map(canonicalLibrary.entries.map(entry => [entry.key, entry]));

function apaFor(bibtex, expectedKey, canonicalDate) {
  if (!bibtex) return null;
  try {
    const citation = new Cite(bibtex);
    assert.equal(citation.data.length, 1, `${expectedKey}: APA input must contain one entry`);
    assert.equal(citation.data[0]?.id, expectedKey, `${expectedKey}: CSL identity differs from the canonical key`);
    if (typeof citation.data[0].DOI === 'string') {
      citation.data[0].DOI = citation.data[0].DOI.replace(/\\_/g, '_');
    }
    // Zotero's exported date literal can retain both normalized and original
    // forms (for example `2025-05-00 05/2025`). The BibTeX parser above has
    // already validated its canonical prefix; use that same source-derived date
    // in the disposable CSL object so citeproc does not mistake it for a range.
    if (canonicalDate) {
      citation.data[0].issued = { 'date-parts': [canonicalDate.split('-').map(Number)] };
    }
    const apa = citation.format('bibliography', {
      format: 'text',
      template: 'apa',
      lang: 'en-US',
    }).trim();
    assert.ok(apa, `${expectedKey}: APA formatter returned an empty reference`);
    assert.ok(!/[\r\n]/.test(apa), `${expectedKey}: APA formatter returned unexpected line breaks`);
    return apa;
  } catch (error) {
    throw new Error(`${expectedKey}: APA generation failed`, { cause: error });
  }
}

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
// Achivement rule (owner, 2026-10-02): co-author names follow the BibTeX verbatim;
// the owner's own name is the one exception and always reads "YongKyung Oh".
const ownerName = (given, family) => (family === 'Oh' && /^yong-?kyung$/i.test(given) ? 'YongKyung' : given);
const authorsFor = (value, override) => {
  if (override?.authors) return override.authors;
  return value.split(' and ').map(author => {
    const [family, ...given] = author.split(', ');
    assert.equal(given.length, 1, 'Unexpected author syntax; requires upstream structured author review');
    return `${ownerName(given[0], family)} ${family}`;
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
  assert.equal(canonicalEntries.has(item.key), item.recordType === 'publication',
    `${item.key}: canonical eligibility contradicts the upstream record type`);
  const bibtexPath = canonicalEntries.has(item.key)
    ? `bibtex/publications/${category}/${item.key}.bib` : null;
  const bibtex = bibtexPath ? await read(bibtexPath) : null;
  const parsedCitation = bibtex ? parseBibTeX(bibtex, { raw: true }) : null;
  const entry = parsedCitation?.entries[0];
  if (bibtex) {
    assert.deepEqual(parsedCitation.errors, [], `Citation parse failed: ${item.key}`);
    assert.equal(parsedCitation.entries.length, 1, 'One canonical entry is required per mirror');
    assert.equal(entry?.key, item.key, 'Mirror citation key differs from publication identity');
    assert.equal(entry?.type, canonicalEntries.get(item.key)?.type, 'Mirror type differs from canonical aggregate');
    assert.deepEqual(entry?.fields, canonicalEntries.get(item.key)?.fields,
      'Per-record mirror fields differ from canonical aggregate');
    assert.ok(['article', 'inproceedings', 'misc'].includes(entry.type), 'Unreviewed canonical entry type');
    assert.ok(!/file\s*=|file:\/\/|\/Users\/|achievement_records\/|data\/evidence\//i.test(bibtex), 'Private marker in canonical citation');
  }
  const citationDate = canonicalDate(entry?.fields.date, item.record.year);
  const cvDate = !citationDate || citationDate.length === 4 ? presentationDate(item.plainText, item.record.year) : undefined;
  const date = cvDate?.date ?? citationDate;
  const dateSource = cvDate ? 'cv-presentation' : date ? 'canonical' : undefined;
  const apa = apaFor(bibtex, item.key, citationDate);
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
    apa,
    bibtexEntryType: entry?.type ?? null,
  });
  provenance.push({
    id: item.key,
    upstreamKey: item.key,
    publicExportRecordSha256: hash(JSON.stringify(rawRecords.find(record => record.key === item.key))),
    upstreamYamlSha256: upstreamRecordHashes.get(item.key),
    bibtexSource: bibtexPath,
    bibtexSha256: bibtex ? hash(bibtex) : null,
    apaSha256: apa ? hash(apa) : null,
    citationStatus: bibtex ? 'canonical-verbatim-with-generated-apa' : 'no-canonical-entry',
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
  format: 'scientific-inference-lab-publications-import-v3',
  source: 'Achivement public CV and canonical BibTeX mirrors',
  policy: 'Public CV publication records are cross-checked against allowlisted upstream YAML; canonical-eligible per-record BibTeX is preserved byte for byte; APA 7 is generated from that BibTeX only. No private record paths are followed.',
  citationFormatter: { library: 'Citation.js', template: 'apa', locale: 'en-US', format: 'text' },
  inputs,
  upstreamRecords: upstreamRecordInputs,
  overrideInput: { path: overridePath, sha256: hash(overrideText) },
  output: { path: 'src/content/publications.json', sha256: hash(data) },
  counts: { total: publications.length, conference: publications.filter(p => p.category === 'conference').length,
    journal: publications.filter(p => p.category === 'journal').length, canonicalCitations: publications.filter(p => p.bibtex).length,
    generatedApa: publications.filter(p => p.apa).length },
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
console.log(`${checkOnly ? 'Verified' : 'Imported'} ${publications.length} public publications; ${publications.filter(p => p.bibtex).length} verbatim canonical citations with generated APA; ${publications.filter(p => !p.bibtex).length} citations unavailable.`);
