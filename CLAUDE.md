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
- The `typescript` dependency is pinned exact (5.9.x): the in-browser
  analysis engine needs the JS compiler API, which ends at 5.9 (ADR-0002,
  ADR-0011). monaco-editor embeds the same version — keep them aligned
  when upgrading either.
- Visualization must never draw a lying diagram: `Cell.members` is
  upward-closed (adapters enforce a fixed-point closure — method
  bivariance breaks assignability transitivity), and layout keeps the
  anti-phantom-intersection invariant (ADR-0010).
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
