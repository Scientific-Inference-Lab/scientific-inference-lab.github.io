export interface Publication {
  id: string;
  canonicalKey: string;
  aliases?: string[];
  title: string;
  authors: string[];
  venue: string;
  venueName: string;
  year: number;
  date?: string;
  dateSource?: 'canonical' | 'cv-presentation';
  upstreamOrder: number;
  category: 'conference' | 'journal';
  status: 'accepted' | 'published';
  presentationStatus?: 'presented';
  bibliographyStatus?: 'final-metadata-pending';
  type: string;
  recognition?: string;
  url: string;
  codeUrl?: string;
  links: { type: string; url: string }[];
  bibtex: string | null;
  apa: string | null;
  bibtexEntryType: 'article' | 'inproceedings' | 'misc' | null;
}

export const publicationType = (publication: Publication) => publication.type;

export function comparePublications(a: Publication, b: Publication): number {
  // Year-only citations have no within-year date; retain the source's order.
  const dateA = a.date && a.date.length > 4 ? a.date : '';
  const dateB = b.date && b.date.length > 4 ? b.date : '';
  return b.year - a.year || dateB.localeCompare(dateA) || a.upstreamOrder - b.upstreamOrder;
}
