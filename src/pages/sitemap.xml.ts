import type { APIRoute } from 'astro';
import { site } from '../lib/data/lab';
import { nav } from '../lib/data/navigation';

// The five public routes; a new route must be added to navigation to be listed.
export const GET: APIRoute = () => {
  const urls = ['/', ...nav.map(item => item.href)].map(path => `  <url><loc>${new URL(path, site.url).href}</loc></url>`);
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
