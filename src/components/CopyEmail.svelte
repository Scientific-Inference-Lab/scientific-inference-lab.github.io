<script lang="ts">
  import { onMount } from 'svelte';
  import { Check, Copy } from '@lucide/svelte';

  let { email }: { email: string } = $props();
  let ready = $state(false);
  let copyState = $state<'idle' | 'copied' | 'failed'>('idle');
  const failedStatus = 'Clipboard unavailable. Select the email address to copy it.';
  const copyStatus = $derived(copyState === 'copied' ? 'Email address copied.' : copyState === 'failed' ? failedStatus : '');
  onMount(() => { ready = true; });

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(email);
      copyState = 'copied';
    } catch {
      copyState = 'failed';
    }
  }
</script>

<button disabled={!ready} type="button" data-copy-email={email} onclick={copyEmail} class="icon-button copy-email" aria-label="Copy email address" title="Copy email address">
  {#if copyState === 'copied'}<Check size={19} aria-hidden="true" />{:else}<Copy size={19} aria-hidden="true" />{/if}
</button>
<p class="copy-status text-sm text-muted">
  <span class="copy-status-space" aria-hidden="true">{failedStatus}</span>
  <span data-copy-status role="status">{copyStatus}</span>
</p>

<style>
  .copy-email { justify-self: start; }
  .copy-email:disabled { cursor: default; color: var(--color-muted); }
  .copy-email:disabled:hover { background: var(--color-paper); }
  .copy-status { grid-column: 1 / -1; display: grid; line-height: 1.5; }
  .copy-status > span { grid-area: 1 / 1; }
  .copy-status-space { visibility: hidden; }
</style>
