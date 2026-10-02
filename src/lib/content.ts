import { getCollection, getEntry } from 'astro:content';
import { comparePublications } from './data/publications';
export async function loadContent() {
  const person = await getEntry('people', 'yongkyung-oh');
  if (!person) throw new Error('Principal investigator record is required');
  const publications = (await getCollection('publications')).map(p => ({ id: p.id, ...p.data })).sort(comparePublications);
  const canonical = new Map(publications.flatMap(p => [p.id, ...(p.aliases ?? [])].map(id => [id, p.id] as const)));
  const resolve = (id: string) => {
    const key = canonical.get(id);
    if (!key) throw new Error(`Unknown publication reference: ${id}`);
    return key;
  };
  return {
    pi: { id: person.id, ...person.data },
    publications,
    members: (await getCollection('members')).map(m => ({ id: m.id, ...m.data })),
    programs: (await getCollection('programs')).map(p => ({ id: p.id, ...p.data, related: p.data.related.map(r => ({ ...r, id: resolve(r.id) })) })).sort((a,b) => a.order-b.order),
    courses: (await getCollection('courses')).map(c => ({ id: c.id, ...c.data })).sort((a,b) => a.order-b.order),
    news: (await getCollection('news')).map(n => ({ id: n.id, ...n.data, publicationId: n.data.publicationId ? resolve(n.data.publicationId) : undefined })).sort((a,b) => b.date.localeCompare(a.date)),
  };
}
