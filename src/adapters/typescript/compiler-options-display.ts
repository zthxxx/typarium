/**
 * Read-only compiler baseline shown in the editor-config popover.
 * Kept in a module WITHOUT a `typescript` import so the view layer can
 * receive it (via the adapter contract) without dragging the compiler
 * into the main bundle. The engine's actual options live in
 * create-ts-analyzer.ts and must stay in sync with this list.
 */
export const FIXED_COMPILER_OPTIONS_DISPLAY: Array<[string, string]> = [
  ['isolatedModules', 'true'],
  ['strict', 'true'],
  ['target', 'ESNext'],
  ['module', 'ESNext'],
  ['lib', 'DOM, DOM.Iterable, ESNext, react, react-dom'],
  ['types via import', 'auto acquisition (ATA)'],
]
