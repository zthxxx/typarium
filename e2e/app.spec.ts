import { expect, test } from '@playwright/test'
import lzString from 'lz-string'
import type { Page } from '@playwright/test'

/**
 * E2E regression for the teaching MVP. The app exposes its services on
 * `window.__typarium` (composition-root probe) so tests can assert on
 * semantic state without coupling to DOM internals.
 */

interface TypariumProbe {
  editor: { code: string; replaceCode: (code: string) => void }
  analysis: {
    lastGoodResult: {
      relations: Array<{ a: string; b: string; kind: string }>
      anyEntityNames: Array<string>
    } | null
  }
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
    { timeout: 60_000 },
  )
}

async function loadCode(page: Page, code: string): Promise<void> {
  await page.evaluate((source) => {
    window.__typarium!.editor.replaceCode(source)
  }, code)
  await page.waitForFunction(
    (source) => window.__typarium!.editor.code === source,
    code,
  )
  // Analysis is async behind the worker; wait for relations to settle.
  await page.waitForTimeout(1_500)
}

async function relations(
  page: Page,
): Promise<Array<{ a: string; b: string; kind: string }>> {
  return page.evaluate(
    () => window.__typarium!.analysis.lastGoodResult?.relations ?? [],
  )
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
  // Normalize to the queried direction.
  if (found.kind === 'subset') return 'superset'
  if (found.kind === 'superset') return 'subset'
  return found.kind
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)
})

test('boots with the sample and draws set contours', async ({ page }) => {
  await expect(page.locator('svg path.set-contour').first()).toBeVisible()
  await expect(
    page
      .getByLabel('Euler diagram of exported types')
      .getByText('StrHandler', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByLabel('Euler diagram of exported types').getByText('unknown'),
  ).toBeVisible()
})

test('any preset toggles the floating badge', async ({ page }) => {
  await page.getByRole('button', { name: 'any', exact: true }).click()
  await page.waitForTimeout(1_600)
  const badge = page.locator('button', { hasText: /^any$/ }).nth(1)
  await expect(badge).toBeVisible()

  await page.getByRole('button', { name: 'any', exact: true }).first().click()
  await page.waitForTimeout(1_600)
  await expect(
    page.evaluate(
      () => window.__typarium!.analysis.lastGoodResult?.anyEntityNames ?? [],
    ),
  ).resolves.toEqual([])
})

test('share hash restores shared content on load', async ({ page }) => {
  const envelope = {
    languageId: 'typescript',
    code: 'export type SharedDemo = "shared" | 42',
  }
  const hash = `#code/v1/${lzString.compressToEncodedURIComponent(JSON.stringify(envelope))}`
  await page.goto(`/${hash}`)
  await page.reload()
  await waitForApp(page)
  await expect
    .poll(async () => page.evaluate(() => window.__typarium!.editor.code))
    .toContain('SharedDemo')
  await expect(
    page
      .getByLabel('Euler diagram of exported types')
      .getByText('SharedDemo', { exact: true }),
  ).toBeVisible()
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
  )
  const list = await relations(page)
  expect(relationOf(list, 'CoNarrow', 'CoWide')).toBe('subset')
  // Contravariance: the WIDER instantiation is the SMALLER set.
  expect(relationOf(list, 'WideHandler', 'StrHandler')).toBe('subset')
})

test('teaching: tagged union branches are disjoint, the union is their superset', async ({
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
  expect(relationOf(list, 'GroupRow', 'DataRow')).toBe('disjoint')
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

test('never export shows the empty-set legend', async ({ page }) => {
  await loadCode(page, 'export type Nothing = never')
  await expect(page.getByText(/Nothing = ∅/)).toBeVisible()
})
