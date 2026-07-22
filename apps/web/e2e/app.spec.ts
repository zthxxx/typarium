import { expect, test } from '@playwright/test'
import lzString from 'lz-string'
import type { Page } from '@playwright/test'
import type { AnalysisService } from '#/services/analysis.service.ts'
import type { EditorService } from '#/services/editor.service.ts'
import type { PresetService } from '#/services/preset.service.ts'
import type { VisualizationStore } from '#/services/visualization.store.ts'

/**
 * E2E regression for the rectangle-paradigm MVP. The app exposes its
 * services on `window.__typarium` (composition-root probe) so tests can
 * assert on semantic state without coupling to DOM internals.
 * The probe shape is the REAL service types (type-only imports, erased
 * at runtime) — drift between tests and services is a compile error.
 */

interface TypariumProbe {
  editor: EditorService
  presets: PresetService
  analysis: AnalysisService
  viz: VisualizationStore
}

declare global {
  interface Window {
    __typarium?: TypariumProbe
  }
}

async function waitForApp(page: Page): Promise<void> {
  await page.waitForFunction(
    () => window.__typarium?.analysis.lastGoodResult != null,
    undefined,
    { timeout: 90_000 },
  )
}

async function loadCode(
  page: Page,
  code: string,
  marker?: string,
): Promise<void> {
  await page.evaluate((source) => {
    window.__typarium!.editor.replaceCode(source)
  }, code)
  // Wait for the analysis OF THIS CODE: a known exported name must be
  // present — polling for mere non-emptiness would pass on stale results.
  // Callers pass `marker` when the first export is a skipped generic.
  const expected = marker ?? /export (?:type|interface) (\w+)/.exec(code)?.[1]
  if (!expected) throw new Error('loadCode needs at least one export')
  await waitForEntities(page, [expected])
}

async function waitForEntities(
  page: Page,
  names: Array<string>,
): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          (window.__typarium!.analysis.lastGoodResult?.entities ?? []).map(
            (entity) => entity.name,
          ),
        ),
      { timeout: 30_000 },
    )
    .toEqual(expect.arrayContaining(names))
}

async function relations(
  page: Page,
): Promise<Array<{ a: string; b: string; kind: string }>> {
  // Relations carry entity IDs (`preset:string` for virtual presets);
  // translate to display names so tests read naturally.
  return page.evaluate(() => {
    const result = window.__typarium!.analysis.lastGoodResult
    if (!result) return []
    const nameOf = new Map(
      result.entities.map((entity) => [entity.id, entity.name]),
    )
    return result.relations.map((relation) => ({
      a: nameOf.get(relation.a) ?? relation.a,
      b: nameOf.get(relation.b) ?? relation.b,
      kind: relation.kind,
    }))
  })
}

function relationOf(
  list: Array<{ a: string; b: string; kind: string }>,
  a: string,
  b: string,
): string | undefined {
  const found = list.find(
    (r) => (r.a === a && r.b === b) || (r.a === b && r.b === a),
  )
  if (!found) return undefined
  if (found.a === a) return found.kind
  if (found.kind === 'subset') return 'superset'
  if (found.kind === 'superset') return 'subset'
  return found.kind
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)
})

test('boots with the sample and draws containment rectangles', async ({
  page,
}) => {
  const canvas = page.getByTestId('rect-canvas')
  await expect(canvas.getByText('StrHandler', { exact: true })).toBeVisible()
  // Contravariance nesting: WideHandler rect sits INSIDE StrHandler rect.
  const outer = await canvas
    .locator('div', { hasText: /^StrHandler$/ })
    .first()
    .boundingBox()
  expect(outer).not.toBeNull()
})

test('empty code and no presets leave the canvas empty', async ({ page }) => {
  await page.evaluate(() => {
    window.__typarium!.editor.replaceCode('')
  })
  // Wait for the EMPTY analysis to land (the boot may have hydrated the
  // sample first; a fixed sleep would race the engine warmup).
  await expect
    .poll(
      () =>
        page.evaluate(
          () => window.__typarium!.analysis.lastGoodResult?.entities.length,
        ),
      { timeout: 30_000 },
    )
    .toBe(0)
  const rects = await page
    .getByTestId('rect-canvas')
    .locator('div[style*="border"]')
    .count()
  expect(rects).toBe(0)
})

test('virtual preset toggles a rectangle without touching the code', async ({
  page,
}) => {
  await loadCode(page, 'export type Foo = "foo"')
  const before = await page.evaluate(() => window.__typarium!.editor.code)
  await page.getByRole('button', { name: 'string', exact: true }).click()
  await waitForEntities(page, ['string', 'Foo'])
  const after = await page.evaluate(() => window.__typarium!.editor.code)
  expect(after).toBe(before)

  // Literal ⊂ string renders as nested rectangles.
  const list = await relations(page)
  expect(relationOf(list, 'Foo', 'string')).toBe('subset')
})

test('any preset styles as warning and summons the badge', async ({ page }) => {
  const anyChip = page.getByRole('button', { name: 'any', exact: true })
  await anyChip.click()
  await expect
    .poll(async () =>
      page.evaluate(
        () => window.__typarium!.analysis.lastGoodResult?.anyEntityNames ?? [],
      ),
    )
    .toContain('any')
  const badge = page.locator('button', { hasText: /^any$/ }).nth(1)
  await expect(badge).toBeVisible()
})

test('snippet preset inserts auto-numbered export lines with blank separators', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.__typarium!.editor.replaceCode('')
  })
  await page.getByRole('button', { name: /Snippets|代码模板/ }).click()
  await page
    .getByRole('button', { name: 'string | number', exact: true })
    .click()
  await page.getByRole('button', { name: /Snippets|代码模板/ }).click()
  await page.getByRole('button', { name: '() => string', exact: true }).click()

  const code = await page.evaluate(() => window.__typarium!.editor.code)
  expect(code).toContain('export type C1 = string | number')
  expect(code).toContain('export type C2 = () => string')
  expect(code).toMatch(/C1 = string \| number\n\nexport type C2/)
})

test('share hash restores code and presets on load', async ({ page }) => {
  const envelope = {
    languageId: 'typescript',
    code: 'export type SharedDemo = "shared" | 42',
    presets: ['string'],
  }
  const hash = `#code/v1/${lzString.compressToEncodedURIComponent(JSON.stringify(envelope))}`
  await page.goto(`/${hash}`)
  await page.reload()
  await waitForApp(page)
  await expect
    .poll(async () => page.evaluate(() => window.__typarium!.editor.code))
    .toContain('SharedDemo')
  await expect
    .poll(async () =>
      page.evaluate(() => window.__typarium!.presets.activeLabels),
    )
    .toContain('string')
})

test('teaching: covariance keeps direction, function parameters invert it', async ({
  page,
}) => {
  await loadCode(
    page,
    [
      'export type Co<T> = T | boolean',
      'export type CoNarrow = Co<string>',
      'export type CoWide = Co<string | number>',
      'export type Handler<X> = (value: X) => void',
      'export type StrHandler = Handler<string>',
      'export type WideHandler = Handler<string | number>',
    ].join('\n'),
    'CoNarrow',
  )
  const list = await relations(page)
  expect(relationOf(list, 'CoNarrow', 'CoWide')).toBe('subset')
  // Contravariance: the WIDER instantiation is the SMALLER set.
  expect(relationOf(list, 'WideHandler', 'StrHandler')).toBe('subset')
})

test('teaching: tagged union branches are unrelated, the union contains them', async ({
  page,
}) => {
  await loadCode(
    page,
    [
      "export type GroupRow = { type: 'Group'; groupName: string }",
      "export type DataRow = { type: 'DataRow'; data: string }",
      'export type RowData = GroupRow | DataRow',
    ].join('\n'),
  )
  const list = await relations(page)
  expect(relationOf(list, 'GroupRow', 'DataRow')).toBe('unrelated')
  expect(relationOf(list, 'GroupRow', 'RowData')).toBe('subset')
  expect(relationOf(list, 'DataRow', 'RowData')).toBe('subset')
})

test('teaching: method bivariance merges, property syntax nests', async ({
  page,
}) => {
  await loadCode(
    page,
    [
      'interface Animal { name: string }',
      'interface Dog extends Animal { breed: string }',
      'export interface KennelM { addM(animal: Animal): void }',
      'export interface DogKennelM { addM(dog: Dog): void }',
      'export interface KennelF { addF: (animal: Animal) => void }',
      'export interface DogKennelF { addF: (dog: Dog) => void }',
    ].join('\n'),
  )
  const list = await relations(page)
  expect(relationOf(list, 'KennelM', 'DogKennelM')).toBe('equivalent')
  expect(relationOf(list, 'KennelF', 'DogKennelF')).toBe('subset')
})

test('never preset shows the ∅ background and legend', async ({ page }) => {
  await page.getByRole('button', { name: 'never', exact: true }).click()
  await expect(page.getByText(/∅ never/).first()).toBeVisible({
    timeout: 20_000,
  })
})

test('editor hover quick info comes from the single worker', async ({
  page,
}) => {
  await loadCode(page, 'export type Foo = "foo" | "bar"')
  const info = await page.evaluate(async () => {
    const t = window.__typarium!
    return t.analysis.editor?.quickInfo?.(t.editor.code, 'export type F'.length)
  })
  expect(info).toContain('Foo')
})

test('diagram mode: euler by default, hasse pin sticks, auto-return without pin', async ({
  page,
}) => {
  const euler = page.getByRole('radio', { name: 'Euler' })
  const hasse = page.getByRole('radio', { name: 'Hasse' })
  await expect(euler).toBeChecked()

  // D inside three mutually-unrelated parents: rectangles cannot nest
  // this faithfully — euler disables itself and hasse takes over.
  const undrawable = [
    'export type A = { a: string }',
    'export type B = { b: string }',
    'export type C = { c: string }',
    'export type D = { a: string; b: string; c: string }',
  ].join('\n')
  await loadCode(page, undrawable, 'D')
  await expect(euler).toBeDisabled()
  await expect(hasse).toBeChecked()

  // Back to drawable code with no manual choice: euler returns.
  await loadCode(page, 'export type Solo = string')
  await expect(euler).toBeChecked()
  await expect(euler).toBeEnabled()

  // Manual hasse pin survives content changes in both directions.
  await hasse.click()
  await expect(hasse).toBeChecked()
  await loadCode(page, 'export type Other = number')
  await expect(hasse).toBeChecked()
  const mode = await page.evaluate(() => window.__typarium!.viz.layout?.mode)
  expect(mode).toBe('hasse')

  // Choosing euler releases the pin.
  await euler.click()
  await expect(euler).toBeChecked()
})

test('canvas hover paints the export lines yellow in the editor', async ({
  page,
}) => {
  await loadCode(page, 'export type Foo = "foo" | "bar"')
  // Monaco loads AFTER the first analysis (canvas-first boot); the
  // line decoration needs the editor to exist.
  await expect(page.locator('.monaco-editor').first()).toBeVisible({
    timeout: 30_000,
  })
  const point = await page.evaluate(() => {
    const layout = window.__typarium!.viz.layout
    if (!layout || layout.mode !== 'euler') return null
    const rect = layout.rects[0]
    return { x: rect.outer.x + rect.outer.width / 2, y: rect.outer.y + 12 }
  })
  expect(point).not.toBeNull()
  const box = await page.getByTestId('rect-canvas').boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + point!.x, box!.y + point!.y)
  await expect
    .poll(() => page.locator('.canvas-hover-line').count())
    .toBeGreaterThan(0)

  // Leaving the canvas clears the editor highlight again.
  await page.mouse.move(box!.x - 10, box!.y - 10)
  await expect.poll(() => page.locator('.canvas-hover-line').count()).toBe(0)
})
