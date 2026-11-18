import profileCatalog from '../../content/profile-links.json';
import people from '../../content/people.json';

interface ProfileLink { id: string; label: string; url: string; group: string; omitOn: string[]; webFeatured?: boolean }
const profileLinks: ProfileLink[] = profileCatalog.links;

export const site = {
  name: 'Scientific Inference Lab',
  institution: 'Pusan National University',
  major: 'Data Science Major',
  school: 'School of BioMedical Convergence Engineering',
  department: 'Data Science Major, School of BioMedical Convergence Engineering',
  affiliation: 'Data Science Major, School of BioMedical Convergence Engineering, Pusan National University',
  footerAffiliation: 'School of BioMedical Convergence Engineering · Pusan National University',
  universityUrl: 'https://www.pusan.ac.kr/eng/Main.do',
  url: 'https://scientific-inference-lab.github.io',
  founded: '2026-09-01',
  identity: 'Scientific inference for discovery and decision-making.',
  description: 'Machine learning for scientific discovery and informed decisions.',
  intro: 'We develop machine learning methods for scientific discovery and informed decisions, grounded in continuous-time modeling and evidence-centered evaluation.',
  scope: 'Scientific Inference Lab develops machine learning methods for scientific discovery and informed decisions. Our research spans AI for Science, industrial AI and decision-making, evidence-centered AI, and continuous-time modeling. We connect scientific knowledge, data, and simulation to understand complex systems, and bring machine learning and optimization together to support decisions in manufacturing, logistics, and service systems. Across these directions, we examine the assumptions, uncertainty, and evidence behind our conclusions.',
} as const;

export const pi = people[0];

// The PI profile, card and footer consume one ordered public catalog.
export function getProfileLinks(links: typeof pi.links) {
  for (const id of ['personal', 'orcid', 'scholar', 'github', 'linkedin'] as const) {
    const entry = profileLinks.find(link => link.id === id);
    if (!entry || links[id] !== entry.url) throw new Error(`PI profile destination drift: ${id}`);
  }
  return profileLinks
    .filter(link => !link.omitOn.includes('lab'))
    .map(link => ({ label: link.label, href: link.url, featured: link.webFeatured === true }));
}

// Structured data lists the person's profiles in the visible order: featured first, then the collapsed ones.
export function getPersonProfileUrls() {
  const person = profileLinks.filter(link => !['lab', 'cv'].includes(link.id));
  return [...person.filter(link => link.webFeatured === true), ...person.filter(link => link.webFeatured !== true)].map(link => link.url);
}

export interface Program {
  id: string;
  aliases?: string[];
  title: string;
  shortTitle: string;
  question: string;
  summary: string;
  description: string;
  agenda?: string[];
  related: { id: string; label: string }[];
}
export const joinUs = {
  heading: 'Join Us',
  body: 'We welcome inquiries about research opportunities and collaboration in machine learning and scientific inference.',
} as const;
