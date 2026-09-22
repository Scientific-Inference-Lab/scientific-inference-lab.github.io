import type { Publication } from './publications';

export function citationFor(publication: Publication): string | null {
  return publication.bibtex;
}
