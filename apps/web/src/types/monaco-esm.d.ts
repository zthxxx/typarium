/**
 * Deep ESM entries of monaco-editor ship without their own d.ts.
 * edcore.main re-exports the exact editor.api surface; the syntax
 * contribution only registers the monarch tokenizer (side effect).
 */
declare module 'monaco-editor/esm/vs/editor/edcore.main.js' {
  export * from 'monaco-editor/esm/vs/editor/editor.api.js'
}

declare module 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js' {
  export {}
}
