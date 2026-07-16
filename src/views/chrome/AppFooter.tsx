import { observer } from 'mobx-react-lite'
import { AnalysisService } from '#/services/analysis.service.ts'
import { EditorService } from '#/services/editor.service.ts'
import { SettingsService } from '#/services/settings.service.ts'
import { useService } from '#/views/di.tsx'

export const AppFooter = observer(function AppFooter({
  engineLabel,
}: {
  engineLabel: string
}) {
  const settings = useService(SettingsService)
  const editorService = useService(EditorService)
  const analysis = useService(AnalysisService)

  // The edit→canvas pipeline, made visible: waiting out the idle
  // debounce shows as "computing", the worker pass as "analyzing".
  const status = analysis.analyzing
    ? settings.t('footer.analyzing')
    : editorService.analyzeQueued
      ? settings.t('footer.computing')
      : null

  return (
    <footer className="flex h-[22px] items-center gap-4 border-t-2 border-(--color-line) bg-white px-4 font-mono text-[10px] text-(--color-ink-soft)">
      <span>{settings.t('footer.engine', { version: engineLabel })}</span>
      {status ? (
        <span className="ml-auto flex items-center gap-1.5 text-(--color-brand)">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          {status}
        </span>
      ) : null}
    </footer>
  )
})
