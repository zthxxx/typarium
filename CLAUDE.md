# typarium

An Euler-diagram teaching playground for the TypeScript type system.
Read `docs/README.md` first for the full picture; `docs/adr/` holds the
decision records — check them before revisiting any settled choice.

## Hard rules

- `docs/` is the ONLY place written in Chinese. All code, comments,
  commit messages, and identifiers are engineering English.
- pnpm monorepo (ADR-0021), dependency direction enforced by the
  package graph, inward only:
  `@typarium/set-model` ← `diagram-euler` / `diagram-hasse` /
  `language-adapter` ← `analyzer-typescript` ← `apps/web`.
  Packages must not import app code; only `analyzer-typescript` may
  import the `typescript` package. Language knowledge stays behind the
  `LanguageAdapter` contract (descriptor + analysis core + optional
  editor capabilities, ADR-0019) — views/services never hardcode TS
  names or grammar.
- The `typescript` dependency is pinned exact (6.0.3): the SINGLE
  TypeScript resource in the bundle (ADR-0015). One analysis worker
  powers canvas semantics AND editor diagnostics/hover/completions;
  monaco's embedded TS worker is never loaded — do not reintroduce it.
- Visualization expresses CONTAINMENT ONLY (ADR-0012): rectangles nest
  or sit apart, no partial-overlap geometry. Layouts stay deterministic
  — same input, same output, zero randomness. Euler/Hasse choice is
  app policy in VisualizationStore (ADR-0018), not a core concern.
- The canvas never shows a result that was not true for its input:
  cache-first boot snapshots are keyed by (engine, code, presets) and
  re-verified by the live engine (ADR-0020).
- Every commit passes: `pnpm check && pnpm lint && pnpm typecheck &&
pnpm test`; run `pnpm test:e2e` for behavior-touching changes.
  Conventional commits enforced by commitlint (lowercase subject start).

## Commands (root, delegate into apps/web)

- `pnpm dev` (port 3000), `pnpm build` (static prerender →
  `apps/web/dist/client`), `pnpm build:packages` (dist + d.ts for the
  publishable packages)
- `pnpm test` / `pnpm test:e2e` / `pnpm typecheck` / `pnpm lint` / `pnpm check`
- `pnpm perf:cold` — cold-start "time to usable" gauge (ADR-0020);
  run against a fresh `pnpm build`

## E2E probe

The app exposes `window.__typarium` ({ analysis, editor, presets, viz,
boot }) for tests and debugging — assert on semantic state, not DOM
internals. The probe is typed with the real service classes.

## Deploy

GitHub Pages via `.github/workflows/deploy.yml`: every push to main
deploys (`build_type=workflow`; the custom domain lives in repo
settings — workflow deploys ignore `public/CNAME`, the file is kept as
documentation). `typarium.zthxxx.me` is proxied through Cloudflare.
