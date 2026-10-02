import { getProfileLinks, site } from './data/lab';
import type { loadContent } from './content';
import type { Publication } from './data/publications';

type Content = Awaited<ReturnType<typeof loadContent>>;
export type PageKind = 'home' | 'research' | 'publications' | 'teaching' | 'people' | 'contact';

// Google Analytics 4 measurement ID supplied by the PI (2026-09-29).
export const analytics = { id: 'G-H8EZQ381WH', hostname: new URL(site.url).hostname } as const;

const url = (path: string) => new URL(path, site.url).href;
const ids = {
  website: url('/#website'),
  lab: url('/#organization'),
  university: url('/#university'),
  school: url('/#school'),
  pi: url('/people/#pi'),
};

// The visible address is one comma-separated line; structured data splits it
// and fails the build if the recorded format changes.
function postalAddress(pi: Content['pi']) {
  const match = /^(.+), ([^,]+-si), ([^,]+-do) (\d{5}), Republic of Korea$/.exec(pi.address);
  if (!match) throw new Error(`Unrecognised address format: ${pi.address}`);
  const [, street, locality, region, postalCode] = match;
  return { '@type': 'PostalAddress', streetAddress: `${pi.office}, ${street}`, addressLocality: locality, addressRegion: region, postalCode, addressCountry: 'KR' };
}

const doi = (publication: Publication) => publication.bibtex?.match(/\bdoi\s*=\s*\{([^}]+)\}/i)?.[1];

// Audit 60: only a bibliographic date is a publication date. A canonical date
// is used as is; a CV presentation month is never emitted, and falls back to
// an explicit canonical BibTeX year when one exists.
function publicationDate(publication: Publication) {
  if (publication.status !== 'published') return undefined;
  if (publication.dateSource === 'canonical') return publication.date;
  return publication.bibtex?.match(/\byear\s*=\s*\{?(\d{4})\}?/i)?.[1];
}

function article(publication: Publication, pi: Content['pi']) {
  const identifier = doi(publication);
  const published = publicationDate(publication);
  return {
    '@type': 'ScholarlyArticle',
    '@id': url(`/publications/#${publication.id}`),
    headline: publication.title,
    name: publication.title,
    author: publication.authors.map(name => name === pi.name ? { '@id': ids.pi } : { '@type': 'Person', name }),
    isPartOf: { '@type': publication.category === 'journal' ? 'Periodical' : 'CreativeWork', name: publication.venueName, alternateName: publication.venue },
    ...(published ? { datePublished: published } : {}),
    url: publication.url,
    ...(identifier ? { sameAs: `https://doi.org/${identifier}` } : {}),
    ...(publication.codeUrl ? { codeRepository: publication.codeUrl } : {}),
  };
}

// schema.org puts `instructor` on CourseInstance, not Course; the instance
// carries no term because the page states none (audit 61).
function course(entry: Content['courses'][number]) {
  return {
    '@type': 'Course',
    '@id': url(`/teaching/#${entry.id}`),
    name: entry.title,
    alternateName: entry.koreanTitle,
    description: entry.description,
    inLanguage: 'ko',
    url: entry.url,
    provider: { '@id': ids.university },
    hasCourseInstance: { '@type': 'CourseInstance', instructor: { '@id': ids.pi } },
  };
}

// One JSON-LD graph per page. It restates facts that the site already shows
// (no telephone number, no names absent from the pages).
export function structuredData(kind: PageKind, page: { path: string; title: string; description: string }, content: Content, image?: string) {
  const { pi, programs, publications, courses } = content;
  const topics = programs.map(program => program.title);
  const pageTypes: Record<PageKind, string> = { home: 'WebPage', research: 'WebPage', publications: 'CollectionPage', teaching: 'CollectionPage', people: 'ProfilePage', contact: 'ContactPage' };
  const webpage = {
    '@type': pageTypes[kind],
    '@id': url(`${page.path}#webpage`),
    url: url(page.path),
    name: page.title,
    description: page.description,
    inLanguage: 'en',
    isPartOf: { '@id': ids.website },
    about: { '@id': kind === 'people' ? ids.pi : ids.lab },
    ...(kind === 'people' ? { mainEntity: { '@id': ids.pi } } : {}),
    ...(kind === 'teaching' ? { mainEntity: { '@type': 'ItemList', numberOfItems: courses.length, itemListElement: courses.map((entry, index) => ({ '@type': 'ListItem', position: index + 1, item: course(entry) })) } } : {}),
    ...(kind === 'publications' ? { mainEntity: { '@type': 'ItemList', numberOfItems: publications.length, itemListElement: publications.map((publication, index) => ({ '@type': 'ListItem', position: index + 1, item: article(publication, pi) })) } } : {}),
  };
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': ids.website, url: url('/'), name: site.name, description: site.intro, inLanguage: 'en', publisher: { '@id': ids.lab } },
      {
        '@type': 'ResearchOrganization',
        '@id': ids.lab,
        name: site.name,
        url: url('/'),
        description: site.scope,
        foundingDate: site.founded,
        email: pi.email,
        address: postalAddress(pi),
        knowsAbout: topics,
        founder: { '@id': ids.pi },
        member: { '@id': ids.pi },
        parentOrganization: { '@id': ids.school },
      },
      { '@type': 'Organization', '@id': ids.school, name: site.school, parentOrganization: { '@id': ids.university } },
      { '@type': 'CollegeOrUniversity', '@id': ids.university, name: site.institution, url: site.universityUrl },
      {
        '@type': 'Person',
        '@id': ids.pi,
        name: pi.name,
        url: url('/people/'),
        jobTitle: pi.role,
        description: pi.shortBio,
        email: `mailto:${pi.email}`,
        worksFor: [{ '@id': ids.lab }, { '@id': ids.university }],
        affiliation: { '@id': ids.school },
        alumniOf: [...new Set(pi.education.map(entry => entry.where))].map(name => ({ '@type': 'CollegeOrUniversity', name })),
        knowsAbout: topics,
        sameAs: getProfileLinks(pi.links).map(profile => profile.href),
        ...(image ? { image } : {}),
      },
      webpage,
    ],
  };
}

// Serialise for a <script type="application/ld+json"> body without allowing "</script>".
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');
