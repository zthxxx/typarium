import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { ShareService } from '#/services/share.service.ts'
import type { ShareEnvelope } from '#/services/share.service.ts'

const envelopeArbitrary: fc.Arbitrary<ShareEnvelope> = fc.record(
  {
    languageId: fc.constantFrom('typescript', 'rust', 'golang'),
    code: fc.string(),
    presets: fc.array(fc.string(), { maxLength: 8 }),
  },
  { requiredKeys: ['languageId', 'code'] },
)

describe('ShareService codec', () => {
  test('every envelope round-trips through the hash', () => {
    const share = new ShareService()
    fc.assert(
      fc.property(envelopeArbitrary, (envelope) => {
        const decoded = share.decodeFromHash(share.encodeToHash(envelope))
        expect(decoded).toEqual(envelope)
      }),
      { numRuns: 200 },
    )
  })

  test('unicode content survives the URI-safe encoding', () => {
    const share = new ShareService()
    const envelope: ShareEnvelope = {
      languageId: 'typescript',
      code: 'export type 中文 = "🎯" | `emoji-${string}`',
      presets: ['∅ never', 'unknown'],
    }
    expect(share.decodeFromHash(share.encodeToHash(envelope))).toEqual(envelope)
  })

  test('foreign or corrupted hashes decode to null, never throw', () => {
    const share = new ShareService()
    expect(share.decodeFromHash('')).toBeNull()
    expect(share.decodeFromHash('#other/v1/abc')).toBeNull()
    expect(share.decodeFromHash('#code/v1/@@not-lz@@')).toBeNull()
    fc.assert(
      fc.property(fc.string(), (garbage) => {
        expect(share.decodeFromHash(`#code/v1/${garbage}`)).toBeNull()
      }),
      { numRuns: 100 },
    )
  })

  test('envelopes missing a string code field are rejected', () => {
    const share = new ShareService()
    const forge = (payload: unknown) =>
      share.encodeToHash(payload as ShareEnvelope)
    expect(share.decodeFromHash(forge({ languageId: 'ts' }))).toBeNull()
    expect(share.decodeFromHash(forge({ code: 42 }))).toBeNull()
    expect(share.decodeFromHash(forge(null))).toBeNull()
  })
})
