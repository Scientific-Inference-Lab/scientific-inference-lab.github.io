import type { APIRoute } from 'astro';
import { getProfileLinks, site } from '../lib/data/lab';
import { loadContent } from '../lib/content';

// Plain-text site summary for language-model retrieval (llmstxt.org format),
// generated from the same records as the pages.
export const GET: APIRoute = async () => {
  const { pi, programs, publications, courses } = await loadContent();
  const url = (path: string) => new URL(path, site.url).href;
  const lines = [
    `# ${site.name}`,
    '',
    `> ${site.intro}`,
    '',
    site.scope,
    '',
    `The lab is part of the ${site.affiliation}. It is directed by ${pi.name}, ${pi.role}.`,
    '',
    '## Pages',
    '',
    `- [Home](${url('/')}): lab identity, research directions and news`,
    `- [Research](${url('/research/')}): research directions with questions, related publications and research agendas`,
    `- [Publications](${url('/publications/')}): the complete publication record (${publications.length} entries)`,
    `- [Teaching](${url('/teaching/')}): undergraduate courses at Pusan National University, with links to their Korean-language course sites`,
    `- [Team](${url('/people/')}): lab members, led by the principal investigator`,
    `- [${pi.name}](${url('/people/yongkyung-oh/')}): principal investigator profile with bio, recognition, experience and education`,
    `- [Contact](${url('/contact/')}): email and office address`,
    '',
    '## Research directions',
    '',
    ...programs.map(program => `- [${program.title}](${url(`/research/#${program.id}`)}): ${program.summary} Question: ${program.question}`),
    '',
    '## Teaching',
    '',
    ...courses.map(course => `- [${course.title} (${course.koreanTitle})](${course.url}): ${course.description} Course materials are in Korean.`),
    '',
    '## Principal investigator',
    '',
    `- ${pi.name}, ${pi.role}, ${site.affiliation}`,
    `- ${pi.bio}`,
    `- Profiles: ${getProfileLinks(pi.links).map(profile => `[${profile.label}](${profile.href})`).join(', ')}`,
    '',
    '## Recognition',
    '',
    ...[...pi.honors, ...pi.awards].map(item => `- ${item.title}, ${item.organizer}, ${item.month} ${item.year}.`),
    '',
    '## Patents',
    '',
    ...pi.patents.map(patent => `- ${patent.title}: ${patent.filings.map(filing => `${filing.office} ${filing.number}, ${filing.status} ${filing.date}`).join('; ')}.`),
    '',
    '## Publications',
    '',
    ...publications.map(publication => `- [${publication.title}](${url(`/publications/#${publication.id}`)}): ${publication.authors.join(', ')}. ${publication.venueName.includes(publication.venue) ? publication.venueName : `${publication.venueName} (${publication.venue})`}, ${publication.year}. ${publication.type}.`),
    '',
    '## Contact',
    '',
    `- Email: ${pi.email}`,
    `- Office: ${pi.office}, ${pi.address}`,
    '',
  ];
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
