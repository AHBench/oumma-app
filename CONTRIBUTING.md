# Contributing to oumma-app

The React/TypeScript agentic workspace for the Oumma platform.
Companion repo: [`oumma`](https://github.com/) (Go engine & backend).

## Ground rule

**`main` must always work**: a fresh clone + `npm run dev` (against a
running engine) must render, and CI (`tsc --noEmit` + `vitest run`) must
be green.

## Running locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest run
npm run build      # tsc -b && vite build
```

The app talks to **one backend base** (the Oumma engine, `:8095`). Local
dev config lives in `public/config/config.dev.js`; production builds read
`window.APP_CONFIG` at startup (nginx entrypoint / mounted
`/config/config.js`). **There is no LLM URL in this repo** — all LLM
endpoints/keys are configured server-side in the engine's docker compose.

Architecture mirrors the Flutter original (clean layers):
`data/` (datasources, models, repositories) → `domain/` (entities,
repository interfaces) → `presentation/` (pages, components, hooks).
Feature folders live in `src/features/<feature>`.

## Branches & pull requests

- Branch off `main`: `feat/<slug>`, `fix/<slug>`, `docs/<slug>`.
- PR back to `main`, **squash-merge** — one logical change, one commit.
- PR description: what, why, and **how verified** (route hit, screenshot,
  test name).
- i18n: user-facing strings go through the locale files
  (`src/core/i18n/locales/{en,fr,ar}.json`) — all three languages, no raw
  machine strings in the UI.
- No secrets in any branch.


## Contact

All mail goes to **`contact@brief-dz.com`** — put the theme in the subject:

| Subject prefix | Use for |
|---|---|
| `[Security]` | Vulnerability reports (private — see SECURITY.md) |
| `[Conduct]` | Code of Conduct incidents |
| `[Bug]` | Bug details that are hard to file as an issue (or file an issue — preferred) |
| `[Feature]` | Ideas and use cases |
| `[Patch]` | Contribution/PR questions and anything else |

## Licensing

Apache-2.0 (see `LICENSE`).
