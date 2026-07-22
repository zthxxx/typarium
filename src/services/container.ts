import { reaction, toJS, when } from 'mobx'
import { IocContext } from 'power-di'
import { AnalysisService } from '#/services/analysis.service.ts'
import { BootService } from '#/services/boot.service.ts'
import { EditorService } from '#/services/editor.service.ts'
import { PersistenceService } from '#/services/persistence.service.ts'
import { PresetService } from '#/services/preset.service.ts'
import { SettingsService } from '#/services/settings.service.ts'
import { ShareService } from '#/services/share.service.ts'
import { UiService } from '#/services/ui.service.ts'
import { VisualizationStore } from '#/services/visualization.store.ts'
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
  const ui = new UiService()
  const boot = new BootService()
  const analysis = new AnalysisService(adapter)
  const editor = new EditorService(analysis, persistence)
  const presets = new PresetService(adapter.descriptor.presets, {
    insertSnippet: (rhs) => editor.insertSnippetLine(rhs),
    onVirtualChange: () => editor.analyzeNow(),
  })
  editor.connectPresets({
    virtualTypes: () => presets.virtualTypes,
    activeLabels: () => presets.activeLabels,
  })
  const viz = new VisualizationStore(analysis)

  // Boot pipeline (ADR-0020): engine warmup starts immediately and in
  // parallel with content restore; the adapter streams real progress.
  adapter.onBootProgress((event) => boot.onAdapterProgress(event))
  void adapter.warmup()
  when(
    () => analysis.lastGoodResult !== null || analysis.failed,
    () => boot.markFirstAnalysisDone(),
  )

  // Cache-first snapshot writer: every FRESH last-good result persists
  // with the exact input + engine that produced it. Hydrated results
  // carry no lastGoodInput, so they never write themselves back.
  reaction(
    () => analysis.lastGoodResult,
    (result) => {
      const input = analysis.lastGoodInput
      if (!result || !input) return
      void persistence.saveSnapshot({
        engineLabel: adapter.descriptor.engineLabel,
        code: input.source,
        presets: input.virtualNames,
        result: toJS(result),
      })
    },
  )

  container.register(settings, SettingsService)
  container.register(persistence, PersistenceService)
  container.register(share, ShareService)
  container.register(ui, UiService)
  container.register(boot, BootService)
  container.register(analysis, AnalysisService)
  container.register(editor, EditorService)
  container.register(presets, PresetService)
  container.register(viz, VisualizationStore)

  return container
}

/**
 * Boot-time content restore, priority order (product rule):
 * 1. share-link hash (someone sent this exact content)
 * 2. IndexedDB (the user's own last session)
 * 3. the adapter's teaching sample (first visit)
 *
 * Whichever source wins, a stored analysis snapshot matching EXACTLY
 * (code, presets, engine) paints the canvas immediately while the
 * engine boots and re-verifies (ADR-0020).
 */
export async function bootstrapContent(
  container: IocContext,
  adapter: LanguageAdapter,
): Promise<void> {
  const share = container.get(ShareService)
  const persistence = container.get(PersistenceService)
  const editor = container.get(EditorService)
  const presets = container.get(PresetService)
  const analysis = container.get(AnalysisService)
  const boot = container.get(BootService)

  boot.markRestoreActive()
  const restore = async (code: string, presetLabels: Array<string>) => {
    presets.restore(presetLabels)
    const snapshot = await persistence.loadSnapshot()
    if (
      snapshot &&
      snapshot.engineLabel === adapter.descriptor.engineLabel &&
      snapshot.code === code &&
      sameLabels(
        snapshot.presets,
        presets.virtualTypes.map((v) => v.name),
      )
    ) {
      analysis.hydrate(snapshot.result)
    }
    // replaceCode kicks the real analysis, which re-verifies (and
    // replaces) any hydrated snapshot the moment the engine is ready.
    editor.replaceCode(code)
  }

  const fromHash = share.readHashFromLocation()
  if (fromHash && fromHash.code.trim() !== '') {
    await restore(fromHash.code, fromHash.presets ?? [])
    boot.markRestoreDone()
    return
  }

  const stored = await persistence.loadDocument()
  if (
    stored &&
    (stored.code.trim() !== '' || (stored.presets?.length ?? 0) > 0)
  ) {
    await restore(stored.code, stored.presets ?? [])
    boot.markRestoreDone()
    return
  }

  // First-ever visit: the sample ships with its build-time analysis —
  // the canvas is usable before the engine finishes booting.
  if (adapter.descriptor.sampleAnalysis) {
    analysis.hydrate(adapter.descriptor.sampleAnalysis)
  }
  await restore(adapter.descriptor.sampleSource, [])
  boot.markRestoreDone()
}

function sameLabels(a: Array<string>, b: Array<string>): boolean {
  return a.length === b.length && a.every((label, index) => label === b[index])
}
