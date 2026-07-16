# typarium

An Euler-diagram teaching playground for the TypeScript type system.
Read `docs/README.md` first for the full picture; `docs/adr/` holds the
decision records — check them before revisiting any settled choice.

## Hard rules

- `docs/` is the ONLY place written in Chinese. All code, comments,
  commit messages, and identifiers are engineering English.
- Dependency direction: `core` ← `adapters` ← `services` ← `views`,
  inward only. `core/` must not import adapters, services, views, or
  the `typescript` package.
- The `typescript` dependency is pinned exact (6.0.3): the SINGLE
  TypeScript resource in the bundle (ADR-0015). One analysis worker
  powers canvas semantics AND editor diagnostics/hover/completions;
  monaco's embedded TS worker is never loaded — do not reintroduce it.
- Visualization expresses CONTAINMENT ONLY (ADR-0012): rectangles nest
  or sit apart, no partial-overlap geometry. The rect layout must stay
  deterministic — same input, same output, zero randomness.
- Every commit passes: `pnpm check && pnpm lint && pnpm typecheck &&
pnpm test`; run `pnpm test:e2e` for behavior-touching changes.
  Conventional commits enforced by commitlint (lowercase subject start).

## Commands

- `pnpm dev` (port 3000), `pnpm build` (static prerender → dist/client)
- `pnpm test` / `pnpm test:e2e` / `pnpm typecheck` / `pnpm lint` / `pnpm check`

## E2E probe

The app exposes `window.__typarium` ({ analysis, editor, viz }) for
tests and debugging — assert on semantic state, not DOM internals.

## Deploy

GitHub Pages via `.github/workflows/deploy.yml`, currently manual-only:
private repos on the free plan cannot enable Pages (API 422). When the
repo goes public, switch the trigger back to push and enable Pages with
build_type=workflow. `public/CNAME` targets `typarium.zthxxx.me`.
