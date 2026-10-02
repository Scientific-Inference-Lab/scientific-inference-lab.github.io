<script lang="ts">
  import { ArrowRight, ArrowUpRight } from '@lucide/svelte';
  // Audit 66: a linked title's destination cue (→ internal, ↗ external) is always visible and
  // travels with the last word, so it sits beside balanced lines and never wraps alone.
  let { title, external = false }: { title: string; external?: boolean } = $props();
  const split = $derived(title.trimEnd().lastIndexOf(' '));
  const head = $derived(split < 0 ? '' : title.slice(0, split + 1));
  const tail = $derived(split < 0 ? title.trimEnd() : title.slice(split + 1).trimEnd());
</script>

{head}<span class="title-tail">{tail}{#if external}<ArrowUpRight class="title-cue" aria-hidden="true" />{:else}<ArrowRight class="title-cue" aria-hidden="true" />{/if}</span>

<style>
  /* The cue scales with the title text. A unit wider than the line (enlarged text) still wraps inside instead of overflowing. */
  .title-tail { display: inline-block; max-width: 100%; text-decoration: inherit; }
  .title-tail :global(.title-cue) { display: inline-block; width: .9em; height: .9em; margin-left: .3em; vertical-align: -.1em; color: var(--color-action); }
</style>
