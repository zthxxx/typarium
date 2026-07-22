import { describe, expect, test } from 'vitest'
import { PresetService } from '#/services/preset.service.ts'
import type { LanguagePreset } from '#/core/analysis/adapter.ts'

const CATALOG: Array<LanguagePreset> = [
  {
    label: 'string',
    category: 'primitive',
    kind: 'virtual',
    typeText: 'string',
  },
  {
    label: 'number',
    category: 'primitive',
    kind: 'virtual',
    typeText: 'number',
  },
  {
    label: 'any',
    category: 'intrinsic',
    kind: 'virtual',
    typeText: 'any',
    tone: 'warning',
  },
  {
    label: 'union',
    category: 'snippet',
    kind: 'snippet',
    snippetRhs: 'string | number',
  },
]

function makeService() {
  const inserted: Array<string> = []
  let virtualChanges = 0
  const service = new PresetService(CATALOG, {
    insertSnippet: (rhs) => inserted.push(rhs),
    onVirtualChange: () => {
      virtualChanges += 1
    },
  })
  return {
    service,
    inserted,
    virtualChanges: () => virtualChanges,
  }
}

describe('PresetService', () => {
  test('virtual toggle flips active state and re-analyzes', () => {
    const { service, virtualChanges } = makeService()
    service.toggle(CATALOG[0])
    expect(service.isActive('string')).toBe(true)
    expect(virtualChanges()).toBe(1)
    service.toggle(CATALOG[0])
    expect(service.isActive('string')).toBe(false)
    expect(virtualChanges()).toBe(2)
  })

  test('virtualTypes follow catalog order, not toggle order', () => {
    const { service } = makeService()
    service.toggle(CATALOG[1])
    service.toggle(CATALOG[0])
    expect(service.virtualTypes.map((virtual) => virtual.name)).toEqual([
      'string',
      'number',
    ])
  })

  test('snippet toggle inserts code and never becomes active', () => {
    const { service, inserted, virtualChanges } = makeService()
    service.toggle(CATALOG[3])
    expect(inserted).toEqual(['string | number'])
    expect(service.isActive('union')).toBe(false)
    expect(virtualChanges()).toBe(0)
  })

  test('restore replaces the set, keeps only known virtual labels, stays quiet', () => {
    const { service, virtualChanges } = makeService()
    service.toggle(CATALOG[0])
    service.restore(['number', 'union', 'ghost'])
    expect(service.activeLabels).toEqual(['number'])
    // restore is a boot path: it must not trigger an analysis kick.
    expect(virtualChanges()).toBe(1)
  })
})
