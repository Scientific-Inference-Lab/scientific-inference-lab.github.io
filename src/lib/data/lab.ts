import people from '../../content/people.json';

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
  intro: 'We develop machine learning methods for scientific discovery and informed decisions, grounded in continuous-time modeling and evidence-centered evaluation.',
  scope: 'Scientific Inference Lab develops machine learning methods for scientific discovery and informed decisions. Our research spans AI for Science, continuous-time modeling, evidence-centered AI, and industrial applications. We connect scientific knowledge, data, and simulation to understand complex systems, and bring machine learning and optimization together to support decisions in manufacturing, logistics, and service systems. Across these directions, we examine the assumptions, uncertainty, and evidence behind our conclusions.',
} as const;

export const pi = people[0];

// People and the shared footer name and order the same verified destinations.
export function getProfileLinks(links: typeof pi.links) {
  return [
    { label: 'Personal Website', href: links.personal },
    { label: 'ORCID', href: links.orcid },
    { label: 'Google Scholar', href: links.scholar },
    { label: 'GitHub', href: links.github },
    { label: 'LinkedIn', href: links.linkedin },
  ];
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
