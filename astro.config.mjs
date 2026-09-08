// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// Organization page (scientific-inference-lab.github.io) — no `base` needed.
// A project page would require base: '/repo-name' and prefixed internal links.
export default defineConfig({
  site: 'https://scientific-inference-lab.github.io',
  vite: {
    plugins: [tailwindcss()],
  },
});
