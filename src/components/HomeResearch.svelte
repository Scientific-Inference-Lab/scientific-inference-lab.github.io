<script lang="ts">
  import { ArrowRight } from '@lucide/svelte';
  import type { Program } from '../lib/data/lab';
  type Topic = Pick<Program, 'id' | 'title' | 'summary'>;
  let { programs }: { programs: Topic[] } = $props();
</script>

<section class="wrap research-overview" aria-label="Research directions">
  <div class="overview-layout">
    <div class="overview-intro">
      <h2>Research directions</h2>
    </div>
    <div class="direction-list">
      {#each programs as program}
        <article class="direction" data-home-direction={program.id}>
          <h3>
            <a href={'/research/#' + program.id} data-home-program={program.id}>
              <span>{program.title}</span><ArrowRight size={20} aria-hidden="true" />
            </a>
          </h3>
          <p>{program.summary}</p>
        </article>
      {/each}
    </div>
  </div>
</section>

<style>
  .research-overview { container: home-directions / inline-size; padding-block: 3rem 4.5rem; }
  .overview-layout { display: grid; grid-template-columns: minmax(0,1fr); gap: 2rem; }
  .overview-intro h2 { font-size: 2rem; line-height: 1.2; }
  .direction-list { display: grid; grid-template-columns: minmax(0,1fr); gap: 1.75rem; }
  .direction { min-width: 0; border-top: 1px solid var(--color-line); padding-top: .75rem; }
  .direction h3 { font-size: 1.25rem; line-height: 1.3; }
  .direction a { display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-height: 44px; padding-block: .25rem; }
  .direction a span { min-width: 0; }
  .direction a :global(svg) { color: var(--color-action); }
  .direction a:hover { color: var(--color-action); text-decoration: underline; text-underline-offset: .2em; }
  .direction p { margin-top: .625rem; max-width: 48ch; font-size: 1rem; line-height: 1.65; }
  @container home-directions (min-width: 42rem) {
    .direction-list { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 2.5rem 3rem; }
  }
  @container home-directions (min-width: 66rem) {
    .overview-layout { grid-template-columns: max-content minmax(0,1fr); gap: 4rem; }
  }
  @container home-directions (max-width: 22rem) {
    .overview-intro h2 { font-size: 1.75rem; }
    .direction h3 { font-size: 1.125rem; }
    .direction a { display: block; }
    .direction a :global(svg) { display: inline-block; vertical-align: middle; margin-left: .5rem; }
  }
  @container home-directions (max-width: 14rem) {
    .overview-intro h2 { font-size: 1.375rem; }
    .direction h3 { font-size: 1rem; }
  }
  @media (max-width: 47.99rem) {
    .research-overview { padding-block: 3rem; }
  }
</style>
