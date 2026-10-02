<script lang="ts">
  import { onMount } from 'svelte';
  import { Dialog } from 'bits-ui';
  import { Award, Code, Copy, Download, Quote, X } from '@lucide/svelte';
  import { pi } from '../lib/data/lab';
  import { publicationType, type Publication } from '../lib/data/publications';
  import { citationFor } from '../lib/data/citations';
  import LinkedTitle from './LinkedTitle.svelte';

  let { publication, hidden = false, citable = true, showYear = false }: {
    publication: Publication;
    showYear?: boolean;
    hidden?: boolean;
    citable?: boolean;
  } = $props();

  let ready = $state(false);
  let open = $state(false);
  let copyStatus = $state('');
  let apaField: HTMLTextAreaElement | undefined = $state();
  let citationField: HTMLTextAreaElement | undefined = $state();
  let citationTrigger: HTMLButtonElement | null = $state(null);
  const citation = $derived(citationFor(publication));
  const download = $derived(citation ? `data:application/x-bibtex;charset=utf-8,${encodeURIComponent(citation.bibtex)}` : undefined);
  const extraLinks = $derived(publication.links.filter(link => link.url !== publication.url && link.url !== publication.codeUrl));
  const linkLabels: Record<string, string> = { paper: 'Paper', arxiv: 'arXiv', doi: 'DOI', code: 'Code', project: 'Project', slide: 'Slides', slides: 'Slides', poster: 'Poster', video: 'Video', data: 'Data', webpage: 'Project', workshop: 'Workshop', news: 'News' };

  function secondaryLinkLabel(link: Publication['links'][number]) {
    if (link.type === 'code' && publication.codeUrl) {
      const url = new URL(link.url);
      const repository = url.pathname.split('/').filter(Boolean)[1];
      if (url.hostname === 'github.com' && repository) return `Code: ${repository}`;
    }
    return linkLabels[link.type] ?? link.type;
  }

  onMount(() => { ready = true; });

  async function copyCitation(value: string, label: 'APA 7' | 'BibTeX', field?: HTMLTextAreaElement) {
    try {
      await navigator.clipboard.writeText(value);
      copyStatus = `${label} copied.`;
    } catch {
      field?.focus();
      field?.select();
      copyStatus = 'Clipboard unavailable. The citation is selected for copying.';
    }
  }
  function restoreCitationFocus(event: Event) {
    if (!citationTrigger?.isConnected) return;
    event.preventDefault();
    citationTrigger.focus({ preventScroll: true });
  }
</script>

<article id={publication.id} data-publication={publication.id} data-year={publication.year} data-type={publicationType(publication)} {hidden} class="publication-record min-w-0">
  {#each publication.aliases ?? [] as alias}<span id={alias} class="publication-alias" aria-hidden="true"></span>{/each}
    <h3 class="publication-title font-bold text-ink">
      <a href={publication.url} class="publication-title-link"><LinkedTitle title={publication.title} external /></a>
    </h3>
    <p class="publication-authors text-body">
      {#each publication.authors as author, index}
        <span class="author-unit"><span data-author={author} class:is-pi={author.toLowerCase() === pi.name.toLowerCase()}>{author}</span>{index < publication.authors.length - 1 ? ',' : ''}</span>{index < publication.authors.length - 1 ? ' ' : ''}
      {/each}
    </p>
    <div class="publication-meta flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span data-publication-venue class="font-medium text-body">{publication.venue}</span>
      <span data-publication-type class="rounded-sm bg-canvas px-1.5 font-medium text-muted">{publicationType(publication)}</span>
      {#if showYear}<span data-publication-year class="text-muted">{publication.year}</span>{/if}
      {#if publication.recognition}
        <span data-publication-recognition class="inline-flex max-w-full items-center gap-1.5 font-medium text-recognition"><Award size={14} class="shrink-0" aria-hidden="true" />{publication.recognition}</span>
      {/if}
      {#if publication.codeUrl}<a href={publication.codeUrl} class="publication-link text-link"><Code size={14} aria-hidden="true" />Code</a>{/if}
      {#each extraLinks as link}<a href={link.url} title={link.url} class="publication-link text-link">{secondaryLinkLabel(link)}</a>{/each}
      {#if citable && citation}
        <Dialog.Root bind:open onOpenChange={() => { copyStatus = ''; }}>
          <Dialog.Trigger bind:ref={citationTrigger} disabled={!ready} data-cite={publication.id} class="publication-link text-link disabled:cursor-default disabled:text-muted"><Quote size={14} aria-hidden="true" />Cite</Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay class="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm" />
            <Dialog.Content data-citation-dialog onCloseAutoFocus={restoreCitationFocus} class="citation-dialog fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md bg-paper text-ink shadow-2xl">
              <div class="citation-header flex items-center justify-between gap-4">
                <Dialog.Title class="text-2xl font-semibold">Cite this paper</Dialog.Title>
                <Dialog.Close data-close-citation class="icon-button" aria-label="Close citation" title="Close citation"><X size={20} aria-hidden="true" /></Dialog.Close>
              </div>
              <Dialog.Description data-citation-title class="mt-5 leading-relaxed text-body">{publication.title}</Dialog.Description>
              <label for={`apa-${publication.id}`} class="mt-6 mb-2 block text-sm font-medium">APA 7</label>
              <textarea id={`apa-${publication.id}`} data-apa-citation bind:this={apaField} value={citation.apa} readonly rows="5" spellcheck="false" class="citation-text w-full resize-y rounded-sm border bg-canvas p-4 text-sm leading-relaxed"></textarea>
              <label for={`citation-${publication.id}`} class="mt-6 mb-2 block text-sm font-medium">BibTeX</label>
              <textarea id={`citation-${publication.id}`} data-citation-text bind:this={citationField} value={citation.bibtex} readonly rows="10" spellcheck="false" class="citation-text w-full resize-y rounded-sm border bg-canvas p-4 font-mono text-sm leading-relaxed"></textarea>
              <div class="citation-actions mt-5 flex flex-wrap gap-3">
                <button type="button" data-copy-apa onclick={() => copyCitation(citation.apa, 'APA 7', apaField)} class="button"><Copy size={17} aria-hidden="true" />Copy APA 7</button>
                <button type="button" data-copy-citation onclick={() => copyCitation(citation.bibtex, 'BibTeX', citationField)} class="button-secondary"><Copy size={17} aria-hidden="true" />Copy BibTeX</button>
                <a data-download-citation href={download} download={`${publication.id}.bib`} class="button-secondary"><Download size={17} aria-hidden="true" />Download</a>
              </div>
              <p data-citation-status role="status" class="mt-3 min-h-6 text-sm text-muted">{copyStatus}</p>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      {/if}
    </div>
</article>

<style>
  .publication-record { container: publication-record / inline-size; position: relative; padding-block: .75rem; border-bottom: 1px solid color-mix(in srgb, var(--color-ink) 13%, transparent); scroll-margin-top: 7rem; }
  .publication-alias { position: absolute; top: 0; scroll-margin-top: 7rem; }
  .publication-record:target,.publication-record:has(.publication-alias:target) { background: var(--color-action-soft); }
  .publication-title { font-size: 1.125rem; line-height: 1.35; overflow-wrap: break-word; }
  /* Audit 66 (variant A): the title is the primary-source link; an always-visible ↗ marks it as external. */
  .publication-title a { display: inline-block; min-height: 1.5rem; transition: color var(--duration-state); }
  .publication-title a:hover { color: var(--color-action); text-decoration: underline; text-underline-offset: .15em; }
  .publication-authors { margin-top: .125rem; font-size: .9375rem; line-height: 1.4; }
  /* Audit 63 D4: each author (with its comma) is one unit, so the list wraps between
     authors; a unit wider than the line (enlarged text) still wraps inside. No NBSP in data. */
  .author-unit { display: inline-block; max-width: 100%; }
  .publication-meta { margin-top: .25rem; line-height: 1.4; }
  .publication-meta > span { min-width: 0; }
  [data-publication-type] { padding-block: .125rem; }
  .publication-meta :global(.publication-link) { min-width: 1.5rem; min-height: 1.5rem; gap: .25rem; }
  .is-pi { color: var(--color-ink); font-weight: 700; }
  .citation-text { border-color: color-mix(in srgb, var(--color-ink) 25%, transparent); }
  :global(.citation-dialog) { container: citation-shell / inline-size; padding: min(2rem, 5vw); }
  @container citation-shell (max-width: 16rem) {
    .citation-header { flex-direction: column-reverse; align-items: stretch; gap: .5rem; }
    .citation-header :global([data-close-citation]) { align-self: end; }
    .citation-actions { flex-direction: column; }
    .citation-actions > * { padding-inline: .5rem; }
  }
  :global(.citation-dialog[data-state='open']) { animation: citation-in 140ms ease-out; }
  @keyframes citation-in { from { opacity: 0; } to { opacity: 1; } }
  @media (min-width: 48rem) { .publication-title { font-size: 1.25rem; line-height: 1.3; } }
  @container publication-record (max-width: 10rem) { .publication-title { font-size: 1rem; } }
  @media (prefers-reduced-motion: reduce) { :global(.citation-dialog[data-state='open']) { animation: none; } }
</style>
