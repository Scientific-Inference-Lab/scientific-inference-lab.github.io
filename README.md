# Scientific Inference Lab

Website for the Scientific Inference Lab at Pusan National University.
The current implementation uses Astro, Svelte 5, Tailwind CSS 4 and TypeScript. Five
static routes provide research exploration, a searchable publication record,
the principal investigator's profile, contact details, and dated Home updates.
Core content and navigation remain available without JavaScript.

## Local Development

Use Node 24 (see `.nvmrc`).

```sh
npm ci
npm run dev
```

The development server reports its local URL. To verify the production output:

```sh
npm run build
npm test
```

`build` runs Astro and Svelte diagnostics and validates Content Collections before
generating `dist/`. Tests check publication metadata, research references,
responsive images, English-only content and the artifact's public/private boundary.
Static tests refuse stale or missing output; browser QC measures rendered contrast.
No internal planning material is needed to build.

## Browser QC

Install the pinned Python test dependency and matching browsers once:

```sh
python3 -m pip install -r tests/requirements-qc.txt
python3 -m playwright install chromium webkit
npm run qc
```

On Linux, use `python3 -m playwright install --with-deps chromium webkit` to
install browser system libraries too. A Python virtual environment is recommended.
Set `QC_PYTHON` when its executable is not named `python3`.

`qc` builds fresh output, runs the static tests, starts an isolated local preview,
then runs all three browser suites in Chromium and WebKit. It exits nonzero on
failure, stops its preview, and preserves screenshots and reports under
`output/qc/<run-id>/`. `output/qc/latest.json` identifies the latest run and its
status; a focused run is not a two-engine pass. Input and output fingerprints
detect source edits or concurrent builds during verification. Each child command
has a ten-minute deadline. On macOS and Linux, interruption also terminates its
process group; Windows descendant cleanup is not certified.

For a focused check, use `npm run qc -- --engine chromium` or `--engine webkit`.
`QC_BROWSER` optionally selects an installed Chromium executable. To examine an
existing preview directly, run a suite with `--base URL --engine ENGINE --out DIR`:

- `tests/browser-qa.py`: all routes, keyboard navigation, Research index/fragments
  and native history, publication filters/citations and contact actions.
- `tests/design-state-qa.py`: delayed/failed scripts, reduced motion, first paint,
  direct Research destinations, browser history and retained content/state.
- `tests/mobile-qa.py`: mobile/touch contexts, portrait/landscape, intermediate
  widths, 200% root text, full-document bounds and every open-menu destination.

Browser emulation does not replace testing a physical phone. WebKit's clipboard
success state uses an explicit test fixture; Chromium also checks native readback.

If Playwright reports `Executable doesn't exist`, the browser suite has not run.
Install matching browsers using the same Python environment, or set `QC_BROWSER`
to an existing Chromium executable. When reusing a non-default browser cache,
set `PLAYWRIGHT_BROWSERS_PATH` consistently for installation and execution;
`QC_BROWSER` does not select WebKit. Check permissions separately from missing
files. Keep failed reports and distinguish the latest attempt from a previous
successful run; reuse earlier evidence only when scope and fingerprints match.

## Change-scoped Verification

Use the highest-risk row touched by a change. A later edit to that surface needs
fresh evidence; a prior green run does not certify a different source tree.

| Change | Minimum verification |
| --- | --- |
| Operating documents only | Check local links and instruction conflicts; confirm no application, content, dependency or generated-output diff was introduced. |
| Content or bibliography | Compare with the public-safe source; run import/static checks; inspect every affected route and state. |
| Shared CSS, header, footer or layout | Compare all five routes before/after in Chromium and WebKit at 320, 390, 768, 1024 and 1440px, at 200% text, with keyboard and no-JS states. |
| Dependencies, build configuration or workflows | Perform a clean install, full build/static checks, complete two-engine QC and a deployment-impact review. |

Focused checks are useful during iteration but do not satisfy a broader row.
Record implementation, technical testing, visual review and user acceptance as
separate states.

## Architecture and Content

- `src/pages/`, `src/layouts/`: five static routes, metadata and the shared shell.
- `src/content/*.json`: publications, PI, research programs and dated updates.
- `src/content.config.ts`: collection schemas, IDs and reference validation.
- `src/lib/content.ts`: typed content access and ordering.
- `src/components/*.svelte`: local interaction state and reusable presentation.
- `src/lib/styles/app.css`: Tailwind theme, local fonts and shared styles.
- `src/lib/assets/`, `src/lib/media.ts`: responsive AVIF/WebP image pipeline.
- `public/`: explicitly allowlisted static files and asset attribution.

Bits UI manages dialog focus; Lucide supplies icons. People is rendered without
hydrating its profile component. Pagefind, MDX, analytics and a backend are not
installed. The publication collection imports the 28-record public bibliography.
Schemas catch structural errors, not factual accuracy: confirm
author order, status, venue, links and recognition against public evidence.

Home's four research directions link to a static Research document with one
index, four sections, separate agenda/related-publication groups and a final
contact link. There are no Research tabs or per-section Next/Back controls.
Cross-listed papers are editorial relationships, not duplicate library records.
The supplied Home photograph keeps its original aspect ratio. People and the
shared document-flow footer use the same named PI profile links; mobile header
navigation expands in flow rather than covering the page.

To refresh publications from the separate public-safe source repository:

```sh
node scripts/import-publications.mjs --source /path/to/Achivement
node scripts/import-publications.mjs --source /path/to/Achivement --check
```

The importer reads public CV exports and canonical BibTeX mirrors, never private
records or local attachments. IDs use upstream citation keys; six previous URLs
remain aliases. Canonical citation text is preserved verbatim, not reconstructed
from display fields. Records without an eligible canonical entry have no Cite
action. Reviewed display exceptions live in `scripts/import-publications.overrides.json`;
the import manifest stays internal under `docs/data/`. Review scope, warnings and
the independent citation hash fixture after source changes. Normal CI builds need
only the committed content, not the source repository or internal manifest.

The importer's exact record-count assertion is an intentional stop condition. If
the source count or any record changes, do not merely update the number. Use this
sequence:

1. Obtain the public-safe export and canonical BibTeX mirrors. Do not read
   `achievement_records`, `data/evidence`, `CV_working`, private attachments or
   another unpublished working source.
2. Run the importer with `--check`. Treat a count assertion, new warning, changed
   verification status or citation mismatch as a request for review, not a tool
   failure to bypass.
3. Diff added, removed and modified keys and compare public fields, links and
   status with the upstream record. Resolve factual conflicts upstream; do not
   edit a source `.bib` from this repository.
4. Review `scripts/import-publications.overrides.json` only for verified display
   exceptions. An override must not invent or reconstruct a canonical citation.
5. After the revised public scope is approved, update the explicit count guard
   and related baseline assertions as part of the reviewed change, then import.
6. Independently compare each served BibTeX entry's bytes and SHA-256 with its
   canonical source. Update `tests/canonical-citations.json` only after that
   comparison, never from the generated output alone.
7. Inspect `src/content/publications.json` and the internal import manifest; run
   `npm run build`, `npm test` and rendered checks of `/publications/` at affected
   filters, fragments and widths. Use the broader matrix row if schema, shared UI,
   dependencies or build configuration also changed.
8. Finish with a clean importer `--check`. Decide Home News and Research
   placement separately; a new library record is not automatically featured.

Only put publishable files in `public/`. Record asset sources, intended use and
applicable licenses when adding or replacing media, logos, fonts or icons.
The current asset inventory is documented in `public/asset-credits.txt`, with
third-party notices in `public/licenses/`.

## Maintainer Handoff

A model change in the same working directory can inherit the ignored operating
records and local evidence after verifying the current commit, worktree and
recorded fingerprints. A new checkout cannot: internal plans, sessions, audits
and evidence are intentionally not part of the public build, and local changes
may not yet exist in a commit.

For a new checkout, first identify a reviewed baseline commit or an explicitly
approved patch. Transfer the current operating packet through an approved private
channel, including its baseline and evidence hashes but excluding secrets and the
restricted Achivement paths listed above. The recipient verifies the checkout and
hashes before reusing test claims. Current phase, ownership and blockers belong in
the private CURRENT record; model name or reasoning level is not a verification
result.

## GitHub Pages

The organization site is configured for
`https://scientific-inference-lab.github.io/`, with no project `base` path.

Before the first deployment, a repository administrator must enable Pages in
**Settings > Pages > Build and deployment > Source: GitHub Actions**.
Repository visibility is a separate setting and is not changed by the workflow.
Private repository support depends on the organization's GitHub plan; see
[GitHub's Pages setup documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

Pushes to `main` run the same build and two-engine QC as pull requests, then
upload the verified `dist/` and deploy. Browser failures block publishing and
retain their evidence as workflow artifacts. The deployment workflow checks Pages configuration
before building; it does not auto-enable Pages or store an administrator token.

If a build succeeds but `actions/deploy-pages` reports `404` and asks to enable
Pages, check the repository's Pages setting before changing application code.
After enabling Pages, rerun the failed workflow or push a reviewed change.
