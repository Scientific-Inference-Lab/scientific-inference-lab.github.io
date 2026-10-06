import { defineCollection } from 'astro:content';
import { z } from 'zod';
import { file } from 'astro/loaders';
import papers from './content/publications.json';
import programRows from './content/programs.json';

const text = z.string().min(1);
const url = z.url();
const paperIds = new Set(papers.map(p => p.id));
if (paperIds.size !== papers.length) throw new Error('Duplicate publication IDs');
for (const paper of papers) {
  if (paper.id !== paper.canonicalKey) throw new Error('Publication ID must equal its canonical key');
  for (const alias of paper.aliases ?? []) {
    if (paperIds.has(alias)) throw new Error(`Duplicate publication alias: ${alias}`);
    paperIds.add(alias);
  }
}
const paperId = text.refine(id => paperIds.has(id), 'Unknown publication reference');
const programIds = new Set(programRows.map(program => program.id));
if (programIds.size !== programRows.length) throw new Error('Duplicate research direction IDs');
for (const program of programRows) {
  for (const alias of program.aliases ?? []) {
    if (programIds.has(alias)) throw new Error(`Duplicate research direction alias: ${alias}`);
    programIds.add(alias);
  }
}
const publications = defineCollection({
  loader: file('src/content/publications.json'),
  schema: z.object({ canonicalKey: text.regex(/^[a-z0-9_-]+$/), aliases: z.array(text).optional(),
    title: text, authors: z.array(text).min(1), venue: text, venueName: text,
    year: z.number().int().min(1900), date: text.regex(/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/).optional(),
    upstreamOrder: z.number().int().nonnegative(), category: z.enum(['conference', 'journal']),
    dateSource: z.enum(['canonical', 'cv-presentation']).optional(),
    status: z.enum(['accepted', 'published']), type: text, recognition: text.optional(),
    presentationStatus: z.literal('presented').optional(),
    bibliographyStatus: z.literal('final-metadata-pending').optional(),
    url, codeUrl: url.optional(), links: z.array(z.object({ type: text, url })),
    bibtex: text.nullable(), apa: text.nullable(), bibtexEntryType: z.enum(['article', 'inproceedings', 'misc']).nullable() }),
});
const people = defineCollection({
  loader: file('src/content/people.json'),
  schema: z.object({ name: text, role: text, affiliation: text, photoAlt: text,
    shortBio: text, bio: text, email: z.email(), phone: text, office: text,
    honors: z.array(z.object({ cvLabel: z.string().regex(/^H\d{2}$/), title: text, organizer: text, month: text, year: z.number().int(), detail: text.optional() })),
    awards: z.array(z.object({ cvLabel: z.string().regex(/^HR\d{2}$/), title: text, paper: text, organizer: text, month: text, year: z.number().int(), note: text.optional() })),
    patents: z.array(z.object({ cvLabel: z.string().regex(/^PT\d{2}$/), title: text,
      filings: z.array(z.object({ office: z.enum(['KR', 'JP', 'US']), number: text, status: z.enum(['granted', 'applied']), date: text })).min(1),
      jointApplicants: text.optional() })),
    grants: z.array(z.object({ title: text, sponsor: text, year: z.number().int(), period: text, role: text, projectLabel: z.enum(['Project', 'Research title']).optional(), project: text.optional(), principalInvestigator: text.optional(), description: text.optional(), context: text.optional() })),
    address: text, links: z.object({ orcid: url, scholar: url, github: url, linkedin: url, personal: url }),
    education: z.array(z.object({ period: text, degree: text, where: text })),
    appointments: z.array(z.object({ period: text, role: text, where: text })) }),
});
// Lab members other than the PI (consented fields only); the PI stays in people.json.
const members = defineCollection({
  loader: file('src/content/members.json'),
  schema: z.object({ name: text, role: z.enum(['PhD student', 'MS student', 'Undergraduate researcher', 'Alumni', 'Prospective student']),
    since: text.regex(/^\d{4}$/).optional(), photo: text.optional(), summary: text.optional(),
    placeholder: z.boolean().optional(), contact: text.optional(),
    // A local profile route; only then does the card show the Full profile button.
    profile: text.regex(/^\/people\/[a-z0-9-]+\/$/).optional(),
    links: z.object({ personal: url.optional(), github: url.optional(), scholar: url.optional(), linkedin: url.optional() }).optional() }),
});
const programs = defineCollection({
  loader: file('src/content/programs.json'),
  schema: z.object({ title: text, shortTitle: text, aliases: z.array(text).optional(), order: z.number().int(), question: text,
    summary: text, description: text, agenda: z.array(text).optional(), related: z.array(z.object({ id: paperId, label: text })) }),
});
const news = defineCollection({
  loader: file('src/content/news.json'),
  schema: z.object({ date: z.string().regex(/^\d{4}-\d{2}$/), title: text,
    text, category: z.enum(['Lab', 'Grant', 'Publication', 'Award', 'Talk']), publicationId: paperId.optional() }),
});
// PI decision 2026-10-01 (audit 61): English titles follow the PNU English
// syllabus Course Title in title case; course sites live under the lab origin.
const courses = defineCollection({
  loader: file('src/content/courses.json'),
  schema: z.object({ order: z.number().int(), title: text, koreanTitle: text, description: text,
    url: url.refine(value => value.startsWith('https://scientific-inference-lab.github.io/'), 'Course sites live under the lab origin') }),
});
export const collections = { publications, people, members, programs, news, courses };
