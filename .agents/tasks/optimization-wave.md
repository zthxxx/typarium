# Optimization wave — product + architecture + monorepo

Design source: Feishu docs 「typarium 架构分层评审」/「typarium 改动集架构分析」.
Every commit passes `pnpm check && pnpm lint && pnpm typecheck && pnpm test`;
e2e for behavior-touching phases.

- [ ] Phase 0 — ADRs 0018–0021 + factual corrections in docs/architecture + docs/engineering
- [ ] Phase 1 — trivial fixes: cursor-highlight residue (cursorOffset → computed), preset chip font size
- [ ] Phase 2 — safety net: FakeLanguageAdapter + adapter contract test kit + services unit tests
      (editor debounce/tickets, analysis ticket race + last-good, share codec property roundtrip,
      preset restore, visualization cursor/mode) + e2e probe types imported from src
- [ ] Phase 3 — contract overhaul in one pass: descriptor (specialTypeNames, snippet template),
      required analysis core (analyze/check), optional editor capabilities
      (quickInfo/completions/format/inlineQueries), unified event surface
      (types-acquired multi-subscriber + boot progress), views consume descriptor fields
- [ ] Phase 4 — features: diagram-mode selector (policy moved into VisualizationStore,
      userChoice/effectiveMode, ModeBar UI + info popover with live mini diagrams),
      hover reverse highlight (equivalence-class reporting → editor line decorations)
- [ ] Phase 5 — perf & progress: cold-start measurement baseline script, monaco deferral,
      ts-libs extraction (comment-stripped JSON asset, fetch with byte progress),
      modulepreload injection, cache-first render (keyed last-good snapshot),
      BootService + progress UI; verify 2x against baseline
- [ ] Phase 6 — monorepo: pnpm workspace, packages set-model / diagram-euler / diagram-hasse /
      language-adapter / analyzer-typescript + apps/web, exports with source condition,
      full docs refresh (architecture/engineering/README) at the end
