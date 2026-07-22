import { observer } from 'mobx-react-lite'
import { useEffect, useMemo, useState } from 'react'
import { bootstrapContent, createAppContainer } from '#/services/container.ts'
import { AnalysisService } from '#/services/analysis.service.ts'
import { BootService } from '#/services/boot.service.ts'
import { EditorService } from '#/services/editor.service.ts'
import { PresetService } from '#/services/preset.service.ts'
import { SettingsService } from '#/services/settings.service.ts'
import { ShareService } from '#/services/share.service.ts'
import { VisualizationStore } from '#/services/visualization.store.ts'
import { AnyBadge } from '#/views/canvas/AnyBadge.tsx'
import { CanvasPane } from '#/views/canvas/CanvasPane.tsx'
import { AppFooter } from '#/views/chrome/AppFooter.tsx'
import { AppHeader } from '#/views/chrome/AppHeader.tsx'
import { EditorDrawer } from '#/views/editor/EditorDrawer.tsx'
import { ServicesProvider, useService } from '#/views/di.tsx'
import type { LanguageAdapter } from '#/core/analysis/adapter.ts'

/**
 * Client-side application root: builds the composition root around the
 * language adapter, restores content (share hash > IndexedDB > sample)
 * and lays out the fluid canvas + editor drawer shell.
 */
export function AppView({ adapter }: { adapter: LanguageAdapter }) {
  const container = useMemo(() => createAppContainer(adapter), [adapter])

  useEffect(() => {
    void bootstrapContent(container, adapter)
    // Debug/e2e probe: stable access to services without UI coupling.
    ;(window as unknown as Record<string, unknown>).__typarium = {
      analysis: container.get(AnalysisService),
      editor: container.get(EditorService),
      presets: container.get(PresetService),
      viz: container.get(VisualizationStore),
      boot: container.get(BootService),
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
  const presets = useService(PresetService)
  const [toast, setToast] = useState<string | null>(null)

  const doShare = (withContent: boolean) => {
    void share
      .copyShareUrl({
        withContent,
        envelope: {
          languageId: adapter.descriptor.id,
          code: editor.code,
          presets: presets.activeLabels,
        },
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
    <div className="flex h-[100dvh] min-h-[480px] flex-col">
      <AppHeader onShare={doShare} />
      <main className="relative flex min-h-0 flex-1">
        <section className="min-h-0 min-w-0 flex-1">
          <CanvasPane />
        </section>
        <EditorDrawer />
      </main>
      <AppFooter engineLabel={adapter.descriptor.engineLabel} />
      <AnyBadge />
      {toast ? (
        <div className="toast-pop fixed bottom-14 left-1/2 z-50 -translate-x-1/2 rounded-full border-2 border-(--color-ink) bg-white px-5 py-2 text-sm font-bold shadow-(--shadow-sticker)">
          {toast}
        </div>
      ) : null}
    </div>
  )
})
