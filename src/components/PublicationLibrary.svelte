<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Search, X } from '@lucide/svelte';
  import { publicationStatusLabel, publicationType, type Publication } from '../lib/data/publications';
  import PublicationRecord from './PublicationRecord.svelte';

  let { publications }: { publications: Publication[] } = $props();

  let ready = $state(false);
  let query = $state('');
  let year = $state('');
  let type = $state('');
  let searchField: HTMLInputElement | undefined = $state();
  let commitTimer: ReturnType<typeof setTimeout>;
  const years = $derived([...new Set(publications.map((record) => record.year))].sort((a, b) => b - a));
  const recentYears = $derived(years.filter((value) => value >= 2023));
  const earlierPublications = $derived(publications.filter((record) => record.year < 2023));
  const types = $derived([...new Set(publications.map(publicationType))].sort());
  const words = $derived(query.trim().toLowerCase().split(/\s+/).filter(Boolean));
  const matching = $derived(publications.filter((record) => {
    const searchText = [record.title, ...record.authors, record.venue, record.venueName, publicationStatusLabel(record), publicationType(record), record.recognition ?? ''].join(' ').toLowerCase();
    return words.every((word) => searchText.includes(word)) && (!year || String(record.year) === year) && (!type || publicationType(record) === type);
  }));
  const matchingIds = $derived(new Set(matching.map(({ id }) => id)));
  const isFiltered = $derived(Boolean(query || year || type));

  function readURL() {
    clearTimeout(commitTimer);
    const params = new URLSearchParams(window.location.search);
    query = params.get('q') ?? '';
    const requestedYear = params.get('year') ?? '';
    const requestedType = params.get('type') ?? '';
    year = years.some(value => String(value) === requestedYear) ? requestedYear : '';
    type = types.includes(requestedType) ? requestedType : '';
    const url = new URL(window.location.href);
    if (!year) url.searchParams.delete('year');
    if (!type) url.searchParams.delete('type');
    const target = publications.find(p => p.id === url.hash.slice(1) || p.aliases?.includes(url.hash.slice(1)));
    if (target && !matchingIds.has(target.id)) url.hash = '';
    if (url.href !== window.location.href) history.replaceState(null, '', url);
  }

  onMount(() => {
    ready = true;
    readURL();
    window.addEventListener('popstate', readURL);
    return () => window.removeEventListener('popstate', readURL);
  });
  onDestroy(() => { clearTimeout(commitTimer); });

  function commitFilters() {
    clearTimeout(commitTimer);
    const url = new URL(window.location.href);
    for (const [key, value] of [['q', query.trim()], ['year', year], ['type', type]]) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    if (url.search !== window.location.search) {
      url.hash = '';
      history.pushState(null, '', url);
    }
  }

  function searchInput(event: Event) {
    query = (event.currentTarget as HTMLInputElement).value;
    clearTimeout(commitTimer);
    commitTimer = setTimeout(commitFilters, 300);
  }

  function clearFilters() {
    query = ''; year = ''; type = '';
    commitFilters();
    searchField?.focus();
  }
</script>

<section data-library-tools aria-label="Publication filters" class="library-tools">
  <form role="search" data-publication-filters onsubmit={(event) => { event.preventDefault(); commitFilters(); }} class="wrap filter-grid grid gap-4 py-4">
    <div class="search-control min-w-0">
      <label for="publication-search" class="mb-2 block text-sm font-medium">Search publications</label>
      <div class="relative">
        <Search size={19} aria-hidden="true" class="pointer-events-none absolute top-3.5 left-4 text-muted" />
        <input id="publication-search" data-search disabled={!ready} bind:this={searchField} value={query} oninput={searchInput} type="search" name="q" placeholder="Title, author, or venue" autocomplete="off" class="library-input w-full" />
      </div>
    </div>
    <div class="min-w-0">
      <label for="publication-year" class="mb-2 block text-sm font-medium">Year</label>
      <select id="publication-year" data-year-filter disabled={!ready} name="year" value={year} onchange={(event) => { year = event.currentTarget.value; commitFilters(); }} class="library-input w-full">
        <option value="">All years</option>
        {#each years as value}<option value={String(value)}>{value}</option>{/each}
      </select>
    </div>
    <div class="min-w-0">
      <label for="publication-type" class="mb-2 block text-sm font-medium">Type or track</label>
      <select id="publication-type" data-type-filter disabled={!ready} name="type" value={type} onchange={(event) => { type = event.currentTarget.value; commitFilters(); }} class="library-input w-full">
        <option value="">All types</option>
        {#each types as value}<option value={value}>{value}</option>{/each}
      </select>
    </div>
  </form>
</section>

<section class="wrap pb-20" aria-label="Publication library">
  <div class="flex min-h-12 flex-wrap items-center justify-between gap-x-5 gap-y-2 py-3 text-sm">
    <p data-result-count role="status" aria-live="polite">{matching.length} of {publications.length} publications</p>
    {#if ready && isFiltered}<button type="button" data-reset-filters onclick={clearFilters} class="text-link inline-flex min-h-11 items-center gap-2"><X size={16} aria-hidden="true" />Clear filters</button>{/if}
  </div>
  {#each recentYears as groupYear}
    <section data-year-group={groupYear} hidden={!matching.some((record) => record.year === groupYear)} aria-labelledby={`year-${groupYear}`}>
      <h2 id={`year-${groupYear}`} class="pt-3 pb-2 font-display text-3xl font-semibold text-muted">{groupYear}</h2>
      {#each publications.filter((record) => record.year === groupYear) as publication (publication.id)}
        <PublicationRecord {publication} showYear={publication.year < 2023} hidden={!matchingIds.has(publication.id)} />
      {/each}
    </section>
  {/each}
  <section id="before-2023" data-year-group="before-2023" hidden={!matching.some((record) => record.year < 2023)} aria-labelledby="year-before-2023">
    <h2 id="year-before-2023" class="pt-3 pb-2 font-display text-3xl font-semibold text-muted">{year && Number(year) < 2023 ? year : 'Before 2023'}</h2>
    {#each earlierPublications as publication, index (publication.id)}
      {#if index === 0 || earlierPublications[index - 1].year !== publication.year}
        <span id={`year-${publication.year}`} class="year-anchor" aria-hidden="true" hidden={!matching.some((record) => record.year === publication.year)}></span>
      {/if}
      <PublicationRecord {publication} showYear={publication.year < 2023} hidden={!matchingIds.has(publication.id)} />
    {/each}
  </section>
  <div hidden={matching.length !== 0} data-empty-results class="py-16">
    <h2 class="text-2xl font-semibold">No matching publications</h2>
    <p class="mt-3 text-body">No papers match the current search and filters.</p>
  </div>
  <aside class="library-note mt-10 pt-5 text-sm text-muted" aria-label="About this publication list">
    <p class="text-muted">{publications.length} publications · {publications.filter(p => p.category === 'conference').length} conference papers · {publications.filter(p => p.category === 'journal').length} journal articles · {years.at(-1)}–{years[0]}</p>
    <p class="mt-2 text-muted"><span class="font-semibold text-action">YongKyung Oh</span>, principal investigator, is highlighted in the author lists.</p>
  </aside>
</section>

<style>
  .filter-grid { grid-template-columns: minmax(0,1fr) 10rem 15rem; align-items: end; }
  @media (max-width: 63.99rem) { .filter-grid { grid-template-columns: minmax(0,1fr) minmax(0,1.8fr); } .search-control { grid-column: 1/-1; } }
  .library-tools { container: library-filters / inline-size; border-bottom: 1px solid var(--color-line); }
  @container library-filters (max-width: 23rem) {
    .filter-grid { grid-template-columns: minmax(0,1fr); }
    .search-control { grid-column: auto; }
  }
  .library-note { border-top: 1px solid var(--color-line); }
  .year-anchor { display: block; height: 0; }
  .library-input { height: 3rem; min-width: 0; border: 1px solid color-mix(in srgb, var(--color-ink) 25%, transparent); border-radius: .25rem; background: var(--color-paper); padding-inline: .9rem; font: inherit; color: var(--color-ink); }
  input.library-input { padding-left: 2.75rem; }
  .library-input:disabled { color: var(--color-muted); cursor: default; }
</style>
