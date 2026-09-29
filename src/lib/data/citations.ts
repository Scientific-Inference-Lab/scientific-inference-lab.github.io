import type { Publication } from './publications';

export interface Citation {
  apa: string;
  bibtex: string;
}

export function citationFor(publication: Publication): Citation | null {
  if (!publication.apa || !publication.bibtex) return null;
  return { apa: publication.apa, bibtex: publication.bibtex };
}
