import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://scientific-inference-lab.github.io',
  output: 'static',
  trailingSlash: 'always',
  integrations: [svelte()],
  prefetch: { defaultStrategy: 'hover' },
  devToolbar: { enabled: false },
  vite: { plugins: [tailwindcss()] },
});
