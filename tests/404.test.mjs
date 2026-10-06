import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { parse } from 'parse5';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.resolve(root, process.env.SITE_DIST ?? 'dist');
const document = parse(await readFile(path.join(dist, '404.html'), 'utf8'));
const all = (node, predicate) => [...(predicate(node) ? [node] : []), ...(node.childNodes ?? []).flatMap(child => all(child, predicate))];
const tag = name => all(document, node => node.tagName === name);
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const text = node => node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');

test('404 has a useful lab recovery path without claiming a canonical page', async () => {
  assert.equal(tag('html').length, 1);
  assert.equal(attr(tag('html')[0], 'lang'), 'en');
  assert.equal(tag('h1').length, 1);
  assert.equal(text(tag('h1')[0]).trim(), 'Page not found');
  assert(tag('a').some(link => attr(link, 'href') === '/'));
  assert(tag('a').some(link => attr(link, 'href') === '/research/'));
  assert(tag('a').some(link => attr(link, 'href') === '#main'));
  assert(tag('meta').some(meta => attr(meta, 'name') === 'robots' && attr(meta, 'content') === 'noindex, nofollow'));
  assert(!tag('link').some(link => attr(link, 'rel') === 'canonical'));
  assert(!tag('script').some(script => attr(script, 'type') === 'application/ld+json'));
  const sitemap = await readFile(path.join(dist, 'sitemap.xml'), 'utf8');
  assert(!sitemap.includes('/404/'));
});
