# Gamify UI with animal-island-ui

Adopt the animal-island-ui component library (v1.4.0) and its
Animal-Crossing warm-parchment design language for the app chrome,
while preserving:

- ADR-0009 canvas region palette (semantic, untouched)
- Maple Mono as the CODE voice (entity names, type text, editor)
- e2e semantic contracts: preset chips stay real `<button>`s,
  diagram mode stays `role=radio` with native checked/disabled

## Checklist

- [x] Dependency: catalog entry + apps/web dep + install; verify dist CSS import path
- [x] styles.css: import island CSS, retheme chrome tokens (teal/brown/parchment), warm dot grid, focus ring
- [x] Views: AppView (Notification toast), AppHeader (Button/Select, logo recolor), PresetsBar (Button chips), ModeBar (island Radio + Title ribbon + Card popover + Icon), EditorToolbar (Button/Icon/Tooltip/Switch/Radio/Input, Card panels), EditorDrawer restyle, RectCanvas (Progress boot bar, Typewriter empty hint, Cursor on canvas stage), AnyBadge recolor, AppFooter restyle, BootSplash recolor, theme-color meta
- [x] Remove @heroicons/react (was only used by the three rewritten views)
- [x] ADR-0024 documenting the restyle decision + boundaries
- [x] Verify: check/lint/typecheck/test ✓; build ✓ (fixed: remote Maple
      Mono @import must stay FIRST or bundlers drop it); e2e 16/16 ✓
      (fixed two pre-existing flakes: stale-server / re-optimize reload
      → optimizeDeps.include; replaceCode-vs-restore race → waitForApp
      now waits boot.done); screenshot review ✓ (chips: active=primary
      candy vs idle=ghost; Title ribbons need mr-2 for flag overhang)
- [x] README preview.png regenerated (3244x1686 via CDP 2x)
- [x] Final gates green: check/lint/typecheck/test ✓, e2e 16/16 three
      consecutive runs (waitForApp now gates on lastGoodInput != null —
      the live-engine-ready signal; boot.done alone lies on cache boots)
- [x] Feedback round 3: hand-drawn wobble on euler rect borders.
      Content-hash (FNV-1a) seeds a mulberry32 PRNG; borders are SVG
      paths with per-edge perturbed control points + quadratic
      smoothing (first tried feTurbulence displacement — tears thin
      borders into terraces, rejected). Equivalence rings reuse the
      outer's seed AND segment counts so stacked lines of identical
      elements wobble in exact parallel. ADR-0024 §9; wobble.ts +
      property tests (determinism / validity / ring coherence)
- [x] Review feedback round 2: header locale (island Select) + Share
      (island Button) clashed — both redrawn with the SAME 30px pill
      recipe as chips (locale = quiet outline + Popup dropdown,
      Share = teal fill); library Select dropped (no size hooks).
      Gates + e2e re-green, preview re-captured
- [x] Review feedback round (2026-07-28): chips → token-drawn buttons
      (color-only state, no hover lift — row stays aligned); Title
      ribbons → quiet text labels; toolbar icons → heroicons
      (conventional glyphs) inside island Buttons. ADR-0024 updated
      with the three implemented-then-rejected alternatives; gates
      re-run green, preview.png re-captured

## Notes

- animal-island-ui v1.4.0 DOES expose `--animal-*` CSS custom
  properties (AI_USAGE.md §0 note is outdated on this point).
  Source of truth: node_modules/animal-island-ui/dist/index.css,
  src/styles/variables.less in the repo (~/Project/Node/animal-island-ui).
- Palette: primary #19c8b9 (hover #3dd4c6 / active #50b9ab), text
  #794f27, secondary text #9f927d, border #aaa69d / light #e8e2d6,
  bg #f8f8f0 / secondary #f0e8d8, warning #f5c31c, error #e05a5a.
- Cursor component: force mode overrides ALL descendant cursors
  (!important); scoped mode still clobbers class-based cursors
  (monaco I-beam, col-resize). Therefore Cursor wraps ONLY the
  canvas stage (CanvasPane), never the editor pane.
- e2e `app.spec.ts:170` requires TWO literal `<button>` elements
  matching /^any$/ (preset chip + AnyBadge) — island Tag renders a
  span[role=button], so chips must use island Button instead.
- island Radio: native `input[type=radio]` (appearance:none, visible
  box) inside a label — getByRole('radio', {name}) / toBeChecked /
  toBeDisabled / click all work.
