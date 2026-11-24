import { getCollection, getEntry } from 'astro:content';
import newsRows from '../content/news.json';
import { comparePublications } from './data/publications';

const newsOrder = new Map(newsRows.map(({ id }, index) => [id, index] as const));
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthOrder = ({ year, month }: { year: number; month: string }) => year * 12 + months.indexOf(month);

const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const dayLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function formatDate(date: string) {
  if (date.length === 7) return monthLabel.format(new Date(date + '-01T00:00:00Z'));
  return dayLabel.format(new Date(date + 'T00:00:00Z'));
}

export function recognitionDate(item: { month: string; year: number; date?: string }) {
  return item.date ? formatDate(item.date) : `${item.month.slice(0, 3)} ${item.year}`;
}

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
  const news = (await getCollection('news'))
    .map(n => ({ id: n.id, ...n.data, publicationId: n.data.publicationId ? resolve(n.data.publicationId) : undefined }))
    .sort((a, b) => b.date.localeCompare(a.date)
      || (newsOrder.get(a.id) ?? newsRows.length) - (newsOrder.get(b.id) ?? newsRows.length));
  return {
    pi: { id: person.id, ...person.data },
    recognition: [...person.data.honors, ...person.data.awards].sort((a, b) => monthOrder(b) - monthOrder(a)),
    publications,
    members: (await getCollection('members')).map(m => ({ id: m.id, ...m.data })),
    programs: (await getCollection('programs')).map(p => ({ id: p.id, ...p.data, related: p.data.related.map(r => ({ ...r, id: resolve(r.id) })) })).sort((a,b) => a.order-b.order),
    courses: (await getCollection('courses')).map(c => ({ id: c.id, ...c.data })).sort((a,b) => a.order-b.order),
    news,
  };
}
