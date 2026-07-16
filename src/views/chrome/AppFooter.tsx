import { observer } from 'mobx-react-lite'
import { SettingsService } from '#/services/settings.service.ts'
import { useService } from '#/views/di.tsx'

export const AppFooter = observer(function AppFooter({
  engineLabel,
}: {
  engineLabel: string
}) {
  const settings = useService(SettingsService)
  return (
    <footer className="flex h-[22px] items-center gap-4 border-t-2 border-(--color-line) bg-white px-4 font-mono text-[10px] text-(--color-ink-soft)">
      <span>{settings.t('footer.engine', { version: engineLabel })}</span>
    </footer>
  )
})
