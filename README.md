# typarium

TypeScript 代数集合论可视化 (TypeScript algebraic set theory,
visualized). An interactive Euler-diagram playground
that teaches the type system through set theory: `unknown` is the
universe, `never` is the empty set (the ∅ texture in every region),
literals are points, and every exported type is drawn as the set of
values it contains. `any` floats above the plane, it is not a set.

Type `export type` declarations on the right; the diagram redraws 1.2s
after you stop typing. Presets, shareable URLs (`Cmd/Ctrl+S`), zh/en
locales, and IndexedDB persistence are built in.

## Packages

pnpm monorepo — the diagram and analysis capabilities are standalone
packages, embeddable without the site (`apps/web`):

- `@typarium/set-model` — the language-agnostic set-semantics IR,
  relations algebra and canvas geometry contract
- `@typarium/diagram-euler` / `@typarium/diagram-hasse` — deterministic
  pure layouts + controlled React components (own CSS, palette by
  `--set-hue-*` variables)
- `@typarium/language-adapter` — the LanguageAdapter contract, a fake
  reference language and the cross-adapter contract test suite
- `@typarium/analyzer-typescript` — the TypeScript engine (checker
  containment matrix with witness correction), node-usable

## Teaching demos (phase 1 acceptance)

- Covariance: `Co<string>` nests inside `Co<string | number>`
- Contravariance: `Handler<string | number>` nests inside
  `Handler<string>`, function parameters invert the direction
- Method bivariance: same-signature method-syntax interfaces merge into
  one region; property-function syntax nests properly
- Tagged unions: disjoint branches wrapped by their sum type

## Development

```bash
pnpm install
pnpm dev          # vite dev server on :3000
pnpm test         # vitest unit suites (core + analyzer)
pnpm test:e2e     # playwright against the dev server
pnpm typecheck && pnpm lint && pnpm check
pnpm build        # static prerender into dist/client (GitHub Pages artifact)
```

## Architecture

Four layers with inward-only dependencies (docs in Chinese under
[`docs/`](./docs/README.md), everything else in English):

- `src/core/` — language-agnostic set-semantics IR and the
  deterministic rectangle-containment layout engine
- `src/adapters/typescript/` — the analysis engine: the TypeScript
  compiler API over `@typescript/vfs` inside a Web Worker
- `src/services/` — power-di composition root, mobx state, persistence,
  share codec
- `src/views/` — React components; render observables, forward events

The `LanguageAdapter` interface is the multi-language boundary: a second
ADT language means a new adapter emitting the same IR, with layout and
rendering untouched. Decision records live in [`docs/adr/`](./docs/adr/).

The analysis engine pins TypeScript **6.0.3** (exact), the single
TypeScript resource in the bundle: one analysis worker powers both the
canvas semantics and the editor diagnostics/hover/completions, and
monaco's embedded TS worker is never loaded (see ADR-0015).
