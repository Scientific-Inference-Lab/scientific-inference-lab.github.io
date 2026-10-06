import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const publications = JSON.parse(await readFile(new URL('../src/content/publications.json', import.meta.url), 'utf8'));

// Independent release gate for the reviewed conference display vocabulary.
// Keep canonical venueName and BibTeX intact; new source forms stop for review.
const compactLabels = [
  [/SIGKDD/, 'KDD'],
  [/International Conference on Machine Learning(?:$| \(ICML)/, 'ICML'],
  [/Health, Inference, and Learning/, 'CHIL'],
  [/AAAI Conference/, 'AAAI'],
  [/Information and Knowledge Management/, 'CIKM'],
  [/Joint Conference on Artificial Intelligence/, 'IJCAI'],
  [/Learning Representations/, 'ICLR'],
  [/Data Mining Workshops/, 'ICDMW'],
  [/IISE Annual Conference/, 'IISE'],
];
const reviewedFullTitles = new Map([
  // This is a Springer volume title, not an established short conference name.
  ['oh_deep_2025', 'Human Activity Recognition and Anomaly Detection'],
]);

function assertVenueLabel(publication) {
  const { id, venue, venueName } = publication;
  if (reviewedFullTitles.has(id)) {
    assert.equal(venueName, reviewedFullTitles.get(id), `${id}: reviewed full title changed; recheck source`);
    assert.equal(venue, venueName, `${id}: do not invent an abbreviation`);
    return;
  }
  const matches = compactLabels.filter(([pattern]) => pattern.test(venueName));
  assert.equal(matches.length, 1, `${id}: canonical venue requires display-label review`);
  assert.equal(venue, matches[0][1], `${id}: incorrect short venue label`);
}

test('all published conference labels match reviewed canonical-source forms', () => {
  for (const publication of publications.filter(item => item.category === 'conference')) assertVenueLabel(publication);
});

test('old ICML proceedings fallback cannot reach release QC', () => {
  assert.throws(() => assertVenueLabel({
    id: 'oh_position_2026',
    venueName: 'Proceedings of the 43rd International Conference on Machine Learning',
    venue: 'Proceedings of the 43rd International Conference on Machine Learning',
  }), /incorrect short venue label/);
});
