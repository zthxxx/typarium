# typarium

TypeScript types, drawn as sets. An interactive Euler-diagram playground
that teaches the type system through set theory: `unknown` is the
universe, `never` is the empty set (the ∅ texture in every region),
literals are points, and every exported type is drawn as the set of
values it contains. `any` floats above the plane, it is not a set.

Type `export type` declarations on the right; the diagram redraws 1.2s
after you stop typing. Presets, shareable URLs (`Cmd/Ctrl+S`), zh/en
locales, and IndexedDB persistence are built in.

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

- `src/core/` — language-agnostic set-semantics IR, invariant
  validator, deterministic basemap + bubble-sets layout engine
- `src/adapters/typescript/` — the analysis engine: TypeScript 5.9
  compiler API over `@typescript/vfs` inside a Web Worker
- `src/services/` — power-di composition root, mobx state, persistence,
  share codec
- `src/views/` — React components; render observables, forward events

The `LanguageAdapter` interface is the multi-language boundary: a second
ADT language means a new adapter emitting the same IR, with layout and
rendering untouched. Decision records live in [`docs/adr/`](./docs/adr/).

The analysis engine pins TypeScript **5.9.x**, the last line with a JS
compiler API (TS 7 is native, no browser story yet; see ADR-0011).
