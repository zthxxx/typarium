import { useEffect, useRef } from 'react'
import { autorun } from 'mobx'
import { observer } from 'mobx-react-lite'
import { AnalysisService } from '#/services/analysis.service.ts'
import { EditorService } from '#/services/editor.service.ts'
import { SettingsService } from '#/services/settings.service.ts'
import { VisualizationStore } from '#/services/visualization.store.ts'
import { useService } from '#/views/di.tsx'
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.js'

/**
 * Monaco integration, client-only (mounted under <ClientOnly>).
 *
 * ADR-0015: monaco's embedded TypeScript worker is NOT loaded — the
 * single typescript@6.0.3 analysis worker provides diagnostics
 * (markers), hover and completions through providers registered here.
 * Monaco contributes only the editor surface and syntax highlighting.
 */
export const MonacoEditor = observer(function MonacoEditor() {
  const editorService = useService(EditorService)
  const analysis = useService(AnalysisService)
  const settings = useService(SettingsService)
  const viz = useService(VisualizationStore)
  const hostRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof Monaco | null>(null)
  const suppressChangeRef = useRef(false)

  useEffect(() => {
    let disposed = false
    const disposables: Array<{ dispose: () => void }> = []

    void setupMonaco().then((monaco) => {
      if (disposed || !hostRef.current) return
      monacoRef.current = monaco

      const model = monaco.editor.createModel(
        editorService.code,
        'typescript',
        monaco.Uri.parse('file:///main.ts'),
      )

      const editor = monaco.editor.create(hostRef.current, {
        model,
        fontSize: 14,
        fontFamily: "'Maple Mono NF CN', ui-monospace, Menlo, monospace",
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        padding: { top: 16, bottom: 16 },
        renderLineHighlight: 'none',
        overviewRulerBorder: false,
        theme: 'typarium-light',
      })

      editor.onDidChangeModelContent(() => {
        if (suppressChangeRef.current) return
        editorService.setCode(model.getValue())
      })

      // Bidirectional highlight: caret inside an exported declaration
      // lights up its rectangle on the canvas; leaving the editor
      // restores every rectangle to full strength.
      editor.onDidChangeCursorPosition((event) => {
        // Programmatic setValue also moves the cursor; only a focused
        // editor expresses user intent worth highlighting.
        if (!editor.hasTextFocus()) return
        viz.setCursorOffset(model.getOffsetAt(event.position))
      })
      editor.onDidBlurEditorWidget(() => {
        viz.clearCursor()
      })

      // Language features backed by the single analysis worker.
      disposables.push(
        monaco.languages.registerHoverProvider('typescript', {
          provideHover: async (hoverModel, position) => {
            const info = await analysis.quickInfo(
              hoverModel.getValue(),
              hoverModel.getOffsetAt(position),
            )
            if (!info) return null
            return {
              contents: [{ value: '```typescript\n' + info + '\n```' }],
            }
          },
        }),
        monaco.languages.registerCompletionItemProvider('typescript', {
          triggerCharacters: ['.', '"', "'", '<'],
          provideCompletionItems: async (completionModel, position) => {
            const entries = await analysis.completions(
              completionModel.getValue(),
              completionModel.getOffsetAt(position),
              {
                quotePreference: settings.editorConfig.singleQuote
                  ? 'single'
                  : 'double',
              },
            )
            const word = completionModel.getWordUntilPosition(position)
            const range = {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: word.startColumn,
              endColumn: word.endColumn,
            }
            return {
              suggestions: entries.map((entry) => ({
                label: entry.name,
                kind: completionKind(monaco, entry.kind),
                insertText: entry.name,
                sortText: entry.sortText,
                range,
              })),
            }
          },
        }),
      )

      editorRef.current = editor
      if (import.meta.env.DEV) {
        ;(window as unknown as Record<string, unknown>).__typariumEditor = {
          editor,
          monaco,
        }
      }
    })

    return () => {
      disposed = true
      for (const disposable of disposables) disposable.dispose()
      editorRef.current?.getModel()?.dispose()
      editorRef.current?.dispose()
      editorRef.current = null
    }
    // The editor instance is created once; content sync happens below.
  }, [])

  // Programmatic code replacement (boot restore, presets, share links):
  // push service state into the model without echoing back as user input.
  useEffect(() => {
    const editor = editorRef.current
    const model = editor?.getModel()
    if (!editor || !model) return
    if (model.getValue() === editorService.code) return
    suppressChangeRef.current = true
    model.setValue(editorService.code)
    suppressChangeRef.current = false
  }, [editorService.code])

  // Editor config: word wrap follows the settings popover live.
  useEffect(() => {
    return autorun(() => {
      const wordWrap = settings.editorConfig.wordWrap
      editorRef.current?.updateOptions({ wordWrap: wordWrap ? 'on' : 'off' })
    })
  }, [settings])

  // Diagnostics markers: the fast check pass streams into monaco.
  useEffect(() => {
    return autorun(() => {
      const diagnostics = editorService.editorDiagnostics
      const monaco = monacoRef.current
      const model = editorRef.current?.getModel()
      if (!monaco || !model) return
      monaco.editor.setModelMarkers(
        model,
        'typarium',
        diagnostics.map((diagnostic) => {
          const start = model.getPositionAt(diagnostic.span.start)
          const end = model.getPositionAt(diagnostic.span.end)
          return {
            severity:
              diagnostic.severity === 'error'
                ? monaco.MarkerSeverity.Error
                : monaco.MarkerSeverity.Warning,
            message: diagnostic.message,
            startLineNumber: start.lineNumber,
            startColumn: start.column,
            endLineNumber: end.lineNumber,
            endColumn: end.column,
          }
        }),
      )
    })
  }, [editorService])

  // Twoslash `// ^?` queries render as end-of-line ghost text, the
  // TS-Playground behavior. Runs on the checked code (350ms debounce)
  // and only when a query marker is present. Uses a decorations
  // collection — editor.deltaDecorations is a deprecated no-op in
  // monaco 0.55.
  const twoslashCollection =
    useRef<Monaco.editor.IEditorDecorationsCollection | null>(null)
  useEffect(() => {
    return autorun(() => {
      // Track the same debounced signal the markers use.
      void editorService.editorDiagnostics
      const code = editorService.code
      const monaco = monacoRef.current
      const editor = editorRef.current
      const model = editor?.getModel()
      if (!monaco || !editor || !model) return
      twoslashCollection.current ??= editor.createDecorationsCollection()
      if (!code.includes('^?')) {
        twoslashCollection.current.set([])
        return
      }
      void analysis
        .twoslashQueries(code)
        .then((queries) => {
          const currentModel = editorRef.current?.getModel()
          if (!currentModel || currentModel.getValue() !== code) return
          twoslashCollection.current?.set(
            queries.map((query) => {
              const lineNumber = Math.min(
                query.line + 1,
                currentModel.getLineCount(),
              )
              const column = currentModel.getLineMaxColumn(lineNumber)
              return {
                range: new monaco.Range(lineNumber, column, lineNumber, column),
                options: {
                  // Zero-length ranges are dropped by monaco's injected
                  // text pipeline unless showIfCollapsed is set.
                  showIfCollapsed: true,
                  after: {
                    content: `  ${query.text.split('\n')[0]}`,
                    inlineClassName: 'twoslash-ghost',
                  },
                },
              }
            }),
          )
        })
        .catch((error: unknown) => {
          if (import.meta.env.DEV) {
            console.error('[typarium] twoslash decoration failed', error)
          }
        })
    })
  }, [editorService, analysis])

  return (
    <div
      ref={hostRef}
      role="region"
      aria-label={settings.t('editor.loading')}
      className="h-full w-full"
    />
  )
})

function completionKind(
  monaco: typeof Monaco,
  kind: string,
): Monaco.languages.CompletionItemKind {
  const kinds = monaco.languages.CompletionItemKind
  switch (kind) {
    case 'keyword':
      return kinds.Keyword
    case 'type':
    case 'interface':
    case 'alias':
      return kinds.Interface
    case 'const':
    case 'var':
    case 'let':
      return kinds.Variable
    case 'function':
    case 'method':
      return kinds.Function
    case 'enum':
      return kinds.Enum
    default:
      return kinds.Text
  }
}

let monacoSetup: Promise<MonacoApi> | null = null

type MonacoApi = typeof Monaco

/**
 * One-time monaco boot: editor core + TypeScript SYNTAX only (monarch
 * tokenizer from basic-languages). The TS language worker is never
 * loaded — semantic features come from the analysis worker (ADR-0015).
 */
function setupMonaco(): Promise<MonacoApi> {
  monacoSetup ??= (async () => {
    const [monaco, , { default: EditorWorker }] = await Promise.all([
      import('monaco-editor/esm/vs/editor/edcore.main.js'),
      import('monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js'),
      import('monaco-editor/esm/vs/editor/editor.worker.js?worker'),
    ])

    self.MonacoEnvironment = {
      getWorker() {
        return new EditorWorker()
      },
    }

    monaco.editor.defineTheme('typarium-light', {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#fdfefe',
        'editorLineNumber.foreground': '#b6c4d2',
        'editorLineNumber.activeForeground': '#3178c6',
      },
    })

    return monaco
  })()
  return monacoSetup
}
