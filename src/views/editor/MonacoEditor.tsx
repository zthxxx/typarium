import { useEffect, useRef } from 'react'
import { observer } from 'mobx-react-lite'
import { EditorService } from '#/services/editor.service.ts'
import { SettingsService } from '#/services/settings.service.ts'
import { useService } from '#/views/di.tsx'
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.js'

/**
 * Monaco integration, client-only (mounted under <ClientOnly>).
 * Monaco's own TypeScript worker provides diagnostics squiggles, hover
 * and completion inside the editor; the set-semantics analysis runs in
 * the separate adapter worker (ADR-0007). Both are pinned to the same
 * TypeScript version via the monaco-editor package.
 */
export const MonacoEditor = observer(function MonacoEditor() {
  const editorService = useService(EditorService)
  const settings = useService(SettingsService)
  const hostRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const suppressChangeRef = useRef(false)

  useEffect(() => {
    let disposed = false

    void setupMonaco().then((monaco) => {
      if (disposed || !hostRef.current) return

      const model = monaco.editor.createModel(
        editorService.code,
        'typescript',
        monaco.Uri.parse('file:///main.ts'),
      )

      const editor = monaco.editor.create(hostRef.current, {
        model,
        fontSize: 14,
        fontFamily: "'JetBrains Mono Variable', monospace",
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

      editorRef.current = editor
    })

    return () => {
      disposed = true
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

  return (
    <div
      ref={hostRef}
      role="region"
      aria-label={settings.t('editor.loading')}
      className="h-full w-full"
    />
  )
})

let monacoSetup: Promise<MonacoApi> | null = null

type MonacoApi = typeof Monaco

/**
 * One-time monaco boot: worker wiring (Vite `?worker` imports), strict
 * compiler options (product rule: strict check always on), and the
 * typarium editor theme.
 */
function setupMonaco(): Promise<MonacoApi> {
  monacoSetup ??= (async () => {
    // Slim monaco assembly: full-featured editor core (edcore) plus the
    // TypeScript language only — the root `monaco-editor` entry drags in
    // every language contribution (~15MB of lazy chunks in the artifact).
    const [
      monaco,
      tsContribution,
      ,
      { default: EditorWorker },
      { default: TsWorker },
    ] = await Promise.all([
      import('monaco-editor/esm/vs/editor/edcore.main.js'),
      import('monaco-editor/esm/vs/language/typescript/monaco.contribution.js'),
      import('monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js'),
      import('monaco-editor/esm/vs/editor/editor.worker.js?worker'),
      import('monaco-editor/esm/vs/language/typescript/ts.worker.js?worker'),
    ])

    self.MonacoEnvironment = {
      getWorker(_workerId: string, label: string) {
        if (label === 'typescript' || label === 'javascript') {
          return new TsWorker()
        }
        return new EditorWorker()
      },
    }

    // monaco 0.55 types the `languages.typescript` namespace as a
    // deprecated stub; with the slim edcore assembly we consume the
    // contribution module's exports directly through a narrow cast.
    interface TsLanguageApi {
      typescriptDefaults: {
        setCompilerOptions: (options: Record<string, unknown>) => void
      }
      ScriptTarget: Record<string, number>
      ModuleResolutionKind: Record<string, number>
    }
    const tsLanguage = tsContribution as unknown as TsLanguageApi

    tsLanguage.typescriptDefaults.setCompilerOptions({
      strict: true,
      target: tsLanguage.ScriptTarget.ES2020,
      moduleResolution: tsLanguage.ModuleResolutionKind.NodeJs,
      noEmit: true,
    })

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
