import { IocContext } from 'power-di'
import { AnalysisService } from '#/services/analysis.service.ts'
import { EditorService } from '#/services/editor.service.ts'
import { PersistenceService } from '#/services/persistence.service.ts'
import { SettingsService } from '#/services/settings.service.ts'
import { ShareService } from '#/services/share.service.ts'
import type { LanguageAdapter } from '#/core/analysis/adapter.ts'

/**
 * Composition root. Services are constructed here in dependency order
 * and registered as instances — views resolve them by class token and
 * never construct services themselves.
 */
export function createAppContainer(adapter: LanguageAdapter): IocContext {
  const container = new IocContext()

  const settings = new SettingsService()
  const persistence = new PersistenceService()
  const share = new ShareService()
  const analysis = new AnalysisService(adapter)
  const editor = new EditorService(analysis, persistence)

  container.register(settings, SettingsService)
  container.register(persistence, PersistenceService)
  container.register(share, ShareService)
  container.register(analysis, AnalysisService)
  container.register(editor, EditorService)

  return container
}

/**
 * Boot-time content restore, priority order (product rule):
 * 1. share-link hash (someone sent this exact content)
 * 2. IndexedDB (the user's own last session)
 * 3. the adapter's teaching sample (first visit)
 */
export async function bootstrapContent(
  container: IocContext,
  adapter: LanguageAdapter,
): Promise<void> {
  const share = container.get(ShareService)
  const persistence = container.get(PersistenceService)
  const editor = container.get(EditorService)

  const fromHash = share.readHashFromLocation()
  if (fromHash && fromHash.code.trim() !== '') {
    editor.replaceCode(fromHash.code)
    return
  }

  const stored = await persistence.loadDocument()
  if (stored && stored.code.trim() !== '') {
    editor.replaceCode(stored.code)
    return
  }

  editor.replaceCode(adapter.sampleSource)
}
