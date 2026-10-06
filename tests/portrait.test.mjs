import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { parse } from 'parse5';

const root = fileURLToPath(new URL('../', import.meta.url));
const asset = 'src/lib/assets/pi.jpg';
// PI 2026-10-06: the lectern photo, exported directly from Drive Pic/Profile.png (record: audit 59).
const expectedHash = '97fcbbca344ff3b6da44fe7605366d217aa574b6f0adf51c7259a9eee7dbeda0';
const alt = 'YongKyung Oh speaking at a lectern';
const descendants = node => [node, ...(node.childNodes ?? []).flatMap(descendants)];
const attribute = (node, name) => node.attrs?.find(item => item.name === name)?.value;

test('Team and PI profile use the lectern photo exported from the original', async () => {
  const bytes = await readFile(path.join(root, asset));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedHash);

  for (const route of ['people', 'people/yongkyung-oh']) {
    const document = parse(await readFile(path.join(root, 'dist', route, 'index.html'), 'utf8'));
    const nodes = descendants(document);
    const image = nodes.find(node => node.tagName === 'img' && attribute(node, 'alt') === alt);
    assert(image, `${route}: lectern photo with truthful alt text`);
    assert.equal(attribute(image, 'width'), '1000', `${route}: full-frame export width`);
    assert.equal(attribute(image, 'height'), '1000', `${route}: full-frame export height`);
    assert(attribute(image, 'srcset'), `${route}: responsive sources`);

    const socialImage = nodes.find(node => node.tagName === 'meta' && attribute(node, 'property') === 'og:image');
    const socialAlt = nodes.find(node => node.tagName === 'meta' && attribute(node, 'property') === 'og:image:alt');
    assert.equal(attribute(socialImage, 'content'), new URL(attribute(image, 'src'), 'https://scientific-inference-lab.github.io').href);
    assert.equal(attribute(socialAlt, 'content'), alt);
  }

  for (const component of ['src/components/PiCard.astro', 'src/components/PiProfile.astro']) {
    const source = await readFile(path.join(root, component), 'utf8');
    assert(!/\.((?:pi|profile)-portrait)\s*\{[^}]*\b(?:object-fit:\s*cover|aspect-ratio:\s*1)\b/s.test(source), `${component}: no implicit square crop`);
  }
});
