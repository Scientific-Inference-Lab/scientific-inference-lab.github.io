import type { APIRoute } from 'astro';
import { site } from '../lib/data/lab';
import { nav } from '../lib/data/navigation';

// Home and the navigation routes, with the PI profile right after Team (site order);
// a new route must be added here or to navigation.
export const GET: APIRoute = () => {
  const urls = ['/', ...nav.flatMap(item => item.href === '/people/' ? [item.href, '/people/yongkyung-oh/'] : [item.href])].map(path => `  <url><loc>${new URL(path, site.url).href}</loc></url>`);
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
