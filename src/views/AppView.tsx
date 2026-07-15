import { observer } from 'mobx-react-lite'
import { useEffect, useMemo, useState } from 'react'
import { bootstrapContent, createAppContainer } from '#/services/container.ts'
import { AnalysisService } from '#/services/analysis.service.ts'
import { EditorService } from '#/services/editor.service.ts'
import { SettingsService } from '#/services/settings.service.ts'
import { ShareService } from '#/services/share.service.ts'
import { VisualizationStore } from '#/services/visualization.store.ts'
import { AnyBadge } from '#/views/canvas/AnyBadge.tsx'
import { CanvasPane } from '#/views/canvas/CanvasPane.tsx'
import { AppFooter } from '#/views/chrome/AppFooter.tsx'
import { AppHeader } from '#/views/chrome/AppHeader.tsx'
import { ServicesProvider, useService } from '#/views/di.tsx'
import { MonacoEditor } from '#/views/editor/MonacoEditor.tsx'
import type { LanguageAdapter } from '#/core/analysis/adapter.ts'

/**
 * Client-side application root: builds the composition root around the
 * language adapter, restores content (share hash > IndexedDB > sample)
 * and lays out the TS-Playground-style split.
 */
export function AppView({ adapter }: { adapter: LanguageAdapter }) {
  const container = useMemo(() => {
    const built = createAppContainer(adapter)
    built.register(
      new VisualizationStore(
        built.get(AnalysisService),
        built.get(EditorService),
        adapter.universe,
      ),
      VisualizationStore,
    )
    return built
  }, [adapter])

  useEffect(() => {
    void bootstrapContent(container, adapter)
    // Debug/e2e probe: stable access to services without UI coupling.
    ;(window as unknown as Record<string, unknown>).__typarium = {
      analysis: container.get(AnalysisService),
      editor: container.get(EditorService),
      viz: container.get(VisualizationStore),
    }
  }, [container, adapter])

  return (
    <ServicesProvider container={container}>
      <AppShell adapter={adapter} />
    </ServicesProvider>
  )
}

const AppShell = observer(function AppShell({
  adapter,
}: {
  adapter: LanguageAdapter
}) {
  const settings = useService(SettingsService)
  const share = useService(ShareService)
  const editor = useService(EditorService)
  const [toast, setToast] = useState<string | null>(null)

  const doShare = (withContent: boolean) => {
    void share
      .copyShareUrl({
        withContent,
        languageId: adapter.id,
        code: editor.code,
      })
      .then(() => {
        setToast(settings.t('header.shareCopied'))
        setTimeout(() => setToast(null), 2_400)
      })
  }

  // Cmd/Ctrl+S: copy a with-content share link (product rule).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault()
        doShare(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // doShare closes over stable service refs; recreating per render is fine.
  }, [])

  return (
    <div className="flex h-[100dvh] min-h-[560px] flex-col">
      <AppHeader languageLabel={adapter.label} onShare={doShare} />
      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,58fr)_minmax(0,42fr)]">
        <section className="min-h-[45dvh] min-w-0 border-b-2 border-(--color-line) lg:border-r-2 lg:border-b-0">
          <CanvasPane presets={adapter.presets} />
        </section>
        <section className="min-h-[40dvh] min-w-0 bg-(--color-board)">
          <MonacoEditor />
        </section>
      </main>
      <AppFooter engineLabel={adapter.engineLabel} />
      <AnyBadge />
      {toast ? (
        <div className="fixed bottom-14 left-1/2 z-50 -translate-x-1/2 rounded-full border-2 border-(--color-ink) bg-white px-5 py-2 text-sm font-semibold shadow-[3px_3px_0_rgba(27,39,51,0.15)]">
          {toast}
        </div>
      ) : null}
    </div>
  )
})
