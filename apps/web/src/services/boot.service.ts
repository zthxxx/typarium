import { makeAutoObservable } from 'mobx'
import type { BootProgressEvent } from '@typarium/language-adapter'

export type BootStageId =
  'engine-download' | 'engine-init' | 'restore' | 'first-analysis'

type StageStatus = 'pending' | 'active' | 'done'

interface StageState {
  status: StageStatus
  /** 0..1 within the stage when measurable (byte progress); else null. */
  fraction: number | null
}

/** Bar weight per stage — proportional to typical cold-start cost. */
const STAGE_WEIGHTS: Record<BootStageId, number> = {
  'engine-download': 0.45,
  'engine-init': 0.35,
  restore: 0.05,
  'first-analysis': 0.15,
}

const STAGE_ORDER: Array<BootStageId> = [
  'engine-download',
  'engine-init',
  'restore',
  'first-analysis',
]

/**
 * The boot pipeline, made explicit and observable (ADR-0020). Every
 * signal is REAL: byte fractions from the libs download, stage
 * completions from the adapter/bootstrap/first analysis — no timed
 * animation pretending to be progress.
 */
export class BootService {
  stages: Record<BootStageId, StageState> = {
    'engine-download': { status: 'pending', fraction: null },
    'engine-init': { status: 'pending', fraction: null },
    restore: { status: 'pending', fraction: null },
    'first-analysis': { status: 'pending', fraction: null },
  }

  constructor() {
    makeAutoObservable(this)
  }

  /** Adapter boot events (engine download/init/ready). */
  onAdapterProgress(event: BootProgressEvent): void {
    if (event.stage === 'engine-download') {
      this.setStage('engine-download', 'active', event.fraction ?? null)
      if (event.fraction === 1) this.setStage('engine-download', 'done', 1)
    } else if (event.stage === 'engine-init') {
      this.setStage('engine-download', 'done', 1)
      this.setStage('engine-init', 'active', null)
    } else {
      this.setStage('engine-download', 'done', 1)
      this.setStage('engine-init', 'done', null)
    }
  }

  markRestoreActive(): void {
    this.setStage('restore', 'active', null)
  }

  markRestoreDone(): void {
    this.setStage('restore', 'done', null)
  }

  /** First analysis landed (or failed — the overlay must never hang). */
  markFirstAnalysisDone(): void {
    for (const id of STAGE_ORDER) this.setStage(id, 'done', null)
  }

  get done(): boolean {
    return this.stages['first-analysis'].status === 'done'
  }

  /** Weighted real progress in [0, 1]. */
  get progress(): number {
    let total = 0
    for (const id of STAGE_ORDER) {
      const stage = this.stages[id]
      if (stage.status === 'done') total += STAGE_WEIGHTS[id]
      else if (stage.status === 'active' && stage.fraction !== null) {
        total += STAGE_WEIGHTS[id] * stage.fraction
      }
    }
    return Math.min(1, total)
  }

  /** The stage to describe in the small caption line. */
  get activeStage(): BootStageId | null {
    for (const id of STAGE_ORDER) {
      if (this.stages[id].status === 'active') return id
    }
    for (const id of STAGE_ORDER) {
      if (this.stages[id].status === 'pending') return id
    }
    return null
  }

  private setStage(
    id: BootStageId,
    status: StageStatus,
    fraction: number | null,
  ): void {
    const stage = this.stages[id]
    // Stages only move forward: a late 'active' never revives a 'done'.
    if (stage.status === 'done' && status !== 'done') return
    stage.status = status
    stage.fraction = fraction
  }
}
