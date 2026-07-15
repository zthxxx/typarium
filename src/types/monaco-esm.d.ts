/**
 * Deep ESM entries of monaco-editor ship without their own d.ts.
 * edcore.main re-exports the exact editor.api surface; the language
 * contribution modules are consumed through narrow casts at use sites.
 */
declare module 'monaco-editor/esm/vs/editor/edcore.main.js' {
  export * from 'monaco-editor/esm/vs/editor/editor.api.js'
}

declare module 'monaco-editor/esm/vs/language/typescript/monaco.contribution.js'

declare module 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js' {
  export {}
}
