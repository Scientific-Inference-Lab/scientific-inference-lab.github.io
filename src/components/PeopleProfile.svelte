<script lang="ts">
  import { ArrowRight, ArrowUpRight } from '@lucide/svelte';
  import { getProfileLinks } from '../lib/data/lab';
  import type { pi as personData, site as siteData } from '../lib/data/lab';

  interface ResponsiveImage {
    src: string; width: number; height: number; alt: string;
    avif?: string; webp?: string; srcset?: string; sizes?: string;
  }

  interface RecognitionItem {
    id: string;
    venue: string;
    year: number;
    label: string;
  }

  let { pi, site, recognition, portrait }: {
    pi: typeof personData;
    site: typeof siteData;
    recognition: RecognitionItem[];
    portrait: ResponsiveImage;
  } = $props();

  const profiles = $derived(getProfileLinks(pi.links));
</script>

<section class="wrap profile-container pb-16" aria-labelledby="pi-name">
  <div class="profile-layout">
  <div class="profile-photo min-w-0">
    <picture>
      {#if portrait.avif}<source type="image/avif" srcset={portrait.avif} sizes={portrait.sizes} />{/if}
      {#if portrait.webp}<source type="image/webp" srcset={portrait.webp} sizes={portrait.sizes} />{/if}
      <img src={portrait.src} srcset={portrait.srcset} sizes={portrait.sizes} width={portrait.width} height={portrait.height} alt={portrait.alt} loading="eager" fetchpriority="high" class="profile-portrait block h-auto w-full" />
    </picture>
  </div>
  <div class="profile-identity min-w-0">
    <p class="kicker mb-2">Principal Investigator</p>
    <h2 id="pi-name" class="font-display font-bold">{pi.name}</h2>
    <p class="profile-role mt-3 text-xl font-medium text-ink">{pi.role}</p>
    <p class="profile-affiliation mt-2 leading-relaxed text-body">{site.affiliation}</p>
  </div>
  <section class="profile-bio min-w-0" aria-labelledby="bio-heading">
    <h3 id="bio-heading" class="bio-heading">Bio</h3>
    <p data-pi-bio class="max-w-[62ch] text-lg leading-relaxed text-body">{pi.bio}</p>
  </section>
  <ul class="profile-links" aria-label="YongKyung Oh's profiles">
    {#each profiles as profile}
      <li><a href={profile.href} class="text-link inline-flex min-h-11 items-center gap-2">{profile.label}<ArrowUpRight size={16} aria-hidden="true" /></a></li>
    {/each}
  </ul>
  </div>
</section>

<section class="bg-canvas py-12 sm:py-16" aria-labelledby="recognition-heading">
  <div class="wrap recognition-container">
    <div class="recognition-layout">
    <div class="section-heading">
      <h2 id="recognition-heading" class="section-title font-bold">Selected recognition</h2>
    </div>
    <div class="recognition-items">
      <section class="recognition-group" aria-labelledby="personal-recognition-heading">
        <h3 id="personal-recognition-heading" class="recognition-group-title">Personal recognition</h3>
        <ul class="recognition-list">
          {#each pi.honors as honor}
            <li class="recognition-row">
              <p class="recognition-meta"><strong>{honor.status}</strong> · {honor.institution} · {honor.year}</p>
              <h4 class="recognition-title">{honor.title}</h4>
            </li>
          {/each}
        </ul>
      </section>
      <section class="recognition-group" aria-labelledby="paper-recognition-heading">
        <h3 id="paper-recognition-heading" class="recognition-group-title">Paper recognition</h3>
        <ul class="recognition-list">
          {#each recognition as publication}
            <li class="recognition-row">
              <p class="recognition-meta">{publication.venue} · {publication.year}</p>
              <h4 class="recognition-title"><a href={`/publications/#${publication.id}`} class="recognition-link">{publication.label}<ArrowRight size={17} aria-hidden="true" /></a></h4>
            </li>
          {/each}
        </ul>
      </section>
      <section class="recognition-group" aria-labelledby="grant-recognition-heading">
        <h3 id="grant-recognition-heading" class="recognition-group-title">Research grant</h3>
        <ul class="recognition-list">
          {#each pi.grants as grant}
            <li class="recognition-row" data-grant>
              <p class="recognition-meta">{grant.sponsor} · {grant.year}</p>
              <div class="min-w-0">
                <h4 class="recognition-title">{grant.title}</h4>
                <p class="recognition-detail">{grant.role}: {grant.project}</p>
                <p class="recognition-detail">Principal Investigator: {grant.principalInvestigator}</p>
              </div>
            </li>
          {/each}
        </ul>
      </section>
    </div>
    </div>
  </div>
</section>

<div class="wrap history-container py-16">
  <div class="history-layout">
  <section aria-labelledby="experience-heading" class="section-heading min-w-0">
    <h2 id="experience-heading" class="section-title mb-8 font-bold">Previous experience</h2>
    <ol class="career-timeline">
      {#each pi.appointments as appointment}
        <li class="relative pb-9 pl-6 last:pb-0">
          <p class="mb-2 text-sm font-medium text-muted">{appointment.period}</p>
          <h3 class="text-lg leading-snug font-bold">{appointment.role}</h3>
          <p class="mt-2 leading-relaxed text-body">{appointment.where}</p>
        </li>
      {/each}
    </ol>
  </section>
  <section aria-labelledby="education-heading" class="section-heading min-w-0">
    <h2 id="education-heading" class="section-title mb-8 font-bold">Education</h2>
    <ol class="career-timeline">
      {#each pi.education as education}
        <li class="relative pb-9 pl-6 last:pb-0">
          <p class="mb-2 text-sm font-medium text-muted">{education.period}</p>
          <h3 class="text-lg leading-snug font-bold">{education.degree}</h3>
          <p class="mt-2 leading-relaxed text-body">{education.where}</p>
        </li>
      {/each}
    </ol>
  </section>
  </div>
</div>

<style>
  .profile-container { container: profile / inline-size; padding-top: 2.5rem; }
  .profile-layout { display: grid; grid-template-columns: minmax(0,1fr); grid-template-areas: 'photo' 'identity' 'bio' 'links'; gap: 1.25rem; align-items: start; }
  .profile-identity { grid-area: identity; container: profile-heading / inline-size; }
  #pi-name { font-size: 2.25rem; }
  .profile-role, .profile-affiliation { text-wrap: pretty; }
  .profile-photo { grid-area: photo; width: min(14rem, 100%); }
  /* PI 2026-09-29: the Email button moved out (Contact offers it); a "Bio" head
     continues the identity block into the biography. */
  .profile-bio { grid-area: bio; border-top: 1px solid var(--color-line); padding-top: 1.25rem; }
  .bio-heading { margin-bottom: .75rem; font-size: 1.25rem; font-weight: 700; line-height: 1.3; color: var(--color-ink); }
  .profile-links { grid-area: links; display: flex; flex-wrap: wrap; gap: .25rem 1.5rem; }
  .profile-links a { font-size: 1rem; }
  .profile-portrait { aspect-ratio: 1; object-fit: cover; }
  @container profile (min-width: 40rem) {
    .profile-layout { grid-template-columns: minmax(0,2fr) minmax(0,3fr); grid-template-areas: 'photo identity' 'photo bio' 'photo links'; column-gap: 4rem; }
    .profile-photo { width: 100%; }
  }
  @container profile-heading (min-width: 24rem) { #pi-name { font-size: 3rem; } }
  @container profile-heading (max-width: 14rem) { #pi-name { font-size: 1.75rem; } }
  @container profile-heading (max-width: 9rem) { #pi-name { font-size: 1.375rem; } }
  @media (max-width: 47.99rem) { .profile-container { padding-top: 2rem; } }

  .recognition-container { container: recognition / inline-size; }
  .recognition-layout { display: grid; grid-template-columns: minmax(0,1fr); gap: 1.75rem; }
  .recognition-items { container: recognition-items / inline-size; min-width: 0; display: grid; gap: 2rem; }
  .recognition-group { min-width: 0; }
  .recognition-group + .recognition-group { border-top: 1px solid var(--color-line); padding-top: 2rem; }
  .recognition-group-title { margin-bottom: 1.25rem; font-size: 1rem; font-weight: 600; color: var(--color-muted); }
  .recognition-meta { font-size: 1rem; line-height: 1.5; color: var(--color-muted); }
  .recognition-meta strong { color: var(--color-ink); font-weight: 600; }
  .recognition-title { max-width: 46ch; font-size: 1.125rem; font-weight: 700; line-height: 1.5; }
  .recognition-detail { max-width: 62ch; margin-top: .125rem; color: var(--color-body); line-height: 1.6; text-wrap: pretty; }
  /* One item per row: venue/date, then the item; stacked on narrow containers. */
  .recognition-list { display: grid; gap: 1.25rem; padding: 0; margin: 0; list-style: none; }
  .recognition-row { display: grid; grid-template-columns: minmax(0,1fr); gap: .5rem; min-width: 0; }
  /* Inline-block keeps the arrow after the last wrapped word while meeting the 44px standalone-link target. */
  .recognition-link { display: inline-block; min-height: 44px; padding-block: .5rem; color: var(--color-action); }
  .recognition-link:hover { text-decoration: underline; text-underline-offset: 4px; }
  .recognition-link :global(svg) { display: inline-block; width: .9em; height: .9em; margin-left: .375rem; vertical-align: -.1em; }
  @container recognition (min-width: 40rem) {
    .recognition-layout { grid-template-columns: minmax(0,1fr) minmax(0,2fr); gap: 3rem; }
  }
  @container recognition-items (min-width: 34rem) {
    .recognition-row { grid-template-columns: 11rem minmax(0,1fr); column-gap: 1.5rem; align-items: baseline; }
  }

  .history-container { container: history / inline-size; }
  .history-layout { display: grid; grid-template-columns: minmax(0,1fr); gap: 3.5rem; }
  @container history (min-width: 42rem) {
    .history-layout { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 4rem; }
  }
  @container history (min-width: 60rem) { .history-layout { gap: 6rem; } }
  .section-heading { container: people-heading / inline-size; min-width: 0; }
  .section-title { font-size: 1.875rem; }
  @container people-heading (max-width: 12rem) { .section-title { font-size: 1.5rem; } }
  @container people-heading (max-width: 9rem) { .section-title { font-size: 1.375rem; } }

  .career-timeline { border-left: 1px solid color-mix(in srgb, var(--color-ink) 20%, transparent); }
  .career-timeline li { container: timeline-entry / inline-size; }
  @container timeline-entry (max-width: 8rem) {
    .career-timeline h3 { font-size: 1rem; }
  }
  .career-timeline li::before { content: ''; position: absolute; width: .5rem; height: .5rem; top: .4rem; left: -.28rem; background: var(--color-action); border-radius: 50%; }
</style>
