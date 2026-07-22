import { describe, expect, test } from 'vitest'
import { BootService } from '#/services/boot.service.ts'

describe('BootService pipeline', () => {
  test('starts pending with zero progress', () => {
    const boot = new BootService()
    expect(boot.done).toBe(false)
    expect(boot.progress).toBe(0)
    expect(boot.activeStage).toBe('engine-download')
  })

  test('download byte fractions drive real partial progress', () => {
    const boot = new BootService()
    boot.onAdapterProgress({ stage: 'engine-download', fraction: 0.5 })
    expect(boot.progress).toBeCloseTo(0.45 * 0.5)
    expect(boot.activeStage).toBe('engine-download')
  })

  test('engine-init implies the download completed', () => {
    const boot = new BootService()
    boot.onAdapterProgress({ stage: 'engine-init' })
    expect(boot.stages['engine-download'].status).toBe('done')
    expect(boot.activeStage).toBe('engine-init')
    expect(boot.progress).toBeCloseTo(0.45)
  })

  test('ready completes both engine stages', () => {
    const boot = new BootService()
    boot.onAdapterProgress({ stage: 'ready' })
    expect(boot.stages['engine-init'].status).toBe('done')
    expect(boot.progress).toBeCloseTo(0.8)
    expect(boot.done).toBe(false)
  })

  test('first analysis completes everything, whatever arrived before', () => {
    const boot = new BootService()
    boot.markFirstAnalysisDone()
    expect(boot.done).toBe(true)
    expect(boot.progress).toBe(1)
    expect(boot.activeStage).toBeNull()
  })

  test('stages only move forward: late events never revive a done stage', () => {
    const boot = new BootService()
    boot.markFirstAnalysisDone()
    boot.onAdapterProgress({ stage: 'engine-download', fraction: 0.1 })
    expect(boot.done).toBe(true)
    expect(boot.progress).toBe(1)
  })
})
