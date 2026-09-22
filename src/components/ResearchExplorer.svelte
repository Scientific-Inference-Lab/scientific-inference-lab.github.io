<script lang="ts">
  import { ArrowRight } from '@lucide/svelte';
  import type { Program } from '$lib/data/lab';
  import type { Publication } from '$lib/data/publications';

  type Entry = Program & {
    papers: (Pick<Publication, 'id' | 'title' | 'venue' | 'year' | 'recognition'> & { context: string })[];
  };
  let { programs }: { programs: Entry[] } = $props();
</script>

<div class="wrap research-workspace" id="research-index" data-programs>
  <div class="research-layout">
    <aside class="research-index">
      <div class="index-content">
        <nav class="program-navigation" aria-label="Research directions">
          <p class="index-label">On this page</p>
          <ul>
            {#each programs as program}
              <li>
                <a href={'#' + program.id} data-program-link>
                  <span>{program.shortTitle}</span>
                </a>
              </li>
            {/each}
          </ul>
        </nav>
      </div>
    </aside>

    <div class="program-panels">
      {#each programs as program}
        <section class="program-panel" id={program.id} data-program-panel aria-labelledby={program.id + '-heading'} tabindex="-1">
          {#each program.aliases ?? [] as alias}
            <span id={alias} class="program-alias"></span>
          {/each}
          <header class="direction-heading">
            <h2 id={program.id + '-heading'}>{program.title}</h2>
            <p class="program-summary">{program.summary}</p>
          </header>

          <p class="research-question" data-research-question>{program.question}</p>

          <div class="direction-detail">
            <section class="research-agenda" aria-labelledby={'agenda-' + program.id}>
              <h3 id={'agenda-' + program.id}>Research agenda</h3>
              <ul>{#each program.agenda ?? [] as topic}<li>{topic}</li>{/each}</ul>
            </section>

            <section class="current-work" aria-labelledby={'work-' + program.id}>
              <h3 id={'work-' + program.id}>Related publications</h3>
              <ul class="related-papers">
                {#each program.papers as paper, paperIndex}
                  <li data-featured-evidence={paperIndex === 0 ? '' : undefined}>
                    <p class="paper-context">{paper.context}</p>
                    <h4>
                      <a class="paper-title" href={'/publications/#' + paper.id}>
                        <span>{paper.title}</span><ArrowRight size={16} />
                      </a>
                    </h4>
                    <p class="paper-meta">
                      <span>{paper.venue} {paper.year}</span>
                      {#if paper.recognition}<span class="recognition">{paper.recognition}</span>{/if}
                    </p>
                  </li>
                {/each}
              </ul>
            </section>

          </div>

        </section>
      {/each}
      <p class="research-inquiry">
        <a href="/contact/" class="text-link">Discuss a research interest <ArrowRight size={16} aria-hidden="true" /></a>
      </p>
    </div>
  </div>
</div>

<style>
  .research-workspace { container: research-layout / inline-size; }
  .research-layout { display: grid; gap: 2.5rem; padding-top: 1.5rem; }
  .research-index, .program-panels { min-width: 0; }
  .index-label { margin-bottom: .375rem; font-size: .8125rem; font-weight: 600; color: var(--color-muted); }
  .program-navigation ul { display: flex; flex-wrap: wrap; column-gap: 1.5rem; row-gap: .125rem; padding: 0; margin: 0; list-style: none; }
  .program-navigation li { max-width: 100%; min-width: 0; }
  .program-navigation a { display: flex; align-items: baseline; gap: .625rem; min-height: 44px; padding-block: .625rem; font-size: .9375rem; line-height: 1.5; font-weight: 600; }
  .program-navigation a:hover { color: var(--color-action); }
  .program-navigation a > span:last-child { min-width: 0; }
  .program-panels { container: program-content / inline-size; }
  /* The document supplies scroll-padding; another offset exposes the previous section. */
  .program-panel { position: relative; min-width: 0; scroll-margin-top: 0; }
  .program-panel + .program-panel { border-top: 1px solid var(--color-line); padding-top: 2.5rem; margin-top: 2.5rem; }
  .program-alias { position: absolute; top: 0; scroll-margin-top: 0; }
  .program-panel h2 { max-width: 30ch; font-size: 2.125rem; line-height: 1.15; }
  .program-summary { max-width: 65ch; margin-top: .875rem; color: var(--color-muted); font-size: 1.0625rem; line-height: 1.6; }
  .research-question { max-width: 52ch; margin-top: 1.5rem; color: var(--color-ink); font-size: 1.375rem; line-height: 1.45; }
  .direction-detail { display: grid; gap: 1.75rem; margin-top: 2rem; }
  .current-work, .research-agenda { min-width: 0; }
  .direction-detail h3 { font-size: 1rem; line-height: 1.4; }
  .related-papers { padding: 0; margin: .25rem 0 0; list-style: none; }
  .related-papers li { min-width: 0; padding-block: .875rem; }
  .related-papers li + li { border-top: 1px solid var(--color-line); }
  .paper-context { color: var(--color-muted); font-size: .8125rem; line-height: 1.5; }
  .related-papers h4 { margin-top: .25rem; font-size: 1.0625rem; line-height: 1.4; }
  .paper-title { display: flex; align-items: baseline; justify-content: space-between; gap: .875rem; min-height: 44px; padding-block: .25rem; }
  .paper-title:hover { color: var(--color-action); }
  .paper-title:hover span { text-decoration: underline; text-underline-offset: 3px; }
  .paper-meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: .375rem .625rem; margin-top: .125rem; font-size: .8125rem; color: var(--color-muted); line-height: 1.5; }
  .recognition { max-width: 100%; padding: .125rem .375rem; color: var(--color-recognition); background: var(--color-recognition-soft); border-radius: 2px; font-size: .75rem; }
  .research-agenda { align-self: start; border-top: 2px solid var(--color-line); padding-top: 1rem; }
  .research-agenda ul { display: grid; gap: .625rem; margin: .875rem 0 0; padding-left: 1.125rem; list-style: disc; }
  .research-agenda li { padding-left: .125rem; color: var(--color-body); font-size: .9375rem; line-height: 1.55; }
  .research-agenda li::marker { color: var(--color-muted); }
  .research-inquiry { margin-top: 2rem; }
  .research-inquiry .text-link { font-size: .875rem; }
  @container research-layout (min-width: 65rem) {
    .research-layout { grid-template-columns: 14rem minmax(0,1fr); gap: 4rem; padding-top: 2rem; }
    .index-content { position: sticky; top: 2rem; }
    .program-navigation ul { display: grid; gap: .125rem; }
    .program-navigation a { padding-block: .625rem; }
  }
  @container program-content (min-width: 45rem) {
    .direction-detail { grid-template-columns: minmax(0,1.75fr) minmax(0,1fr); gap: 2.5rem; }
    .current-work { grid-column: 1; grid-row: 1; }
    .research-agenda { grid-column: 2; grid-row: 1; border-top: 0; border-left: 1px solid var(--color-line); padding: 0 0 0 1.5rem; }
  }
  @container program-content (max-width: 35rem) {
    .program-panel h2 { font-size: 1.875rem; }
    .research-question { font-size: 1.25rem; }
    .program-summary { font-size: 1rem; }
    .direction-detail { margin-top: 1.5rem; }
    .program-panel + .program-panel { margin-top: 2rem; padding-top: 2rem; }
  }
  @container program-content (max-width: 16rem) {
    .program-panel h2 { font-size: 1.625rem; }
    .related-papers h4 { font-size: 1rem; }
    .paper-title :global(svg) { display: none; }
  }
  @container program-content (max-width: 10rem) {
    .program-panel h2 { font-size: 1.25rem; }
    .paper-title { gap: .375rem; }
  }
</style>
