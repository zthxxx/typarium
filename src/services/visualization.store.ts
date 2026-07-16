import { computed, makeAutoObservable } from 'mobx'
import { computeRectLayout } from '#/core/layout/index.ts'
import { MIN_VIEWPORT } from '#/core/layout/constants.ts'
import type { Box, EntityRect, RectLayoutResult } from '#/core/layout/types.ts'
import type { AnalysisService } from '#/services/analysis.service.ts'
import type { TypeEntity } from '#/core/set-model/types.ts'

export interface TooltipItem {
  name: string
  typeText: string
  colorIndex: number | null
}

export interface TooltipStack {
  items: Array<TooltipItem>
  /** True when the pointer rests on background dots (the ∅ region). */
  onNever: boolean
}

/**
 * Presentation state for the rectangle canvas: derived layout (a pure
 * function of the last good analysis and the measured viewport) plus
 * hover/caret highlight shared between editor and canvas.
 */
export class VisualizationStore {
  /** Measured canvas size, driven by the view's ResizeObserver. */
  viewportWidth: number = MIN_VIEWPORT.width
  viewportHeight: number = MIN_VIEWPORT.height

  hoveredEntityId: string | null = null
  cursorEntityId: string | null = null

  constructor(private readonly analysis: AnalysisService) {
    makeAutoObservable<VisualizationStore, 'analysis'>(this, {
      analysis: false,
      layout: computed,
    })
  }

  setViewport(width: number, height: number): void {
    this.viewportWidth = Math.max(Math.round(width), MIN_VIEWPORT.width)
    this.viewportHeight = Math.max(Math.round(height), MIN_VIEWPORT.height)
  }

  get entities(): Array<TypeEntity> {
    return this.analysis.lastGoodResult?.entities ?? []
  }

  get anyEntityNames(): Array<string> {
    return this.analysis.lastGoodResult?.anyEntityNames ?? []
  }

  /** Entities resolved to `any`, for the badge's list tooltip. */
  get anyEntities(): Array<TypeEntity> {
    return this.entities.filter(
      (entity) => entity.special === 'outside-set-theory',
    )
  }

  /** Entities resolved to `never` (the empty set), outermost data. */
  get neverEntities(): Array<TypeEntity> {
    return this.entities.filter((entity) => entity.special === 'empty')
  }

  get layout(): RectLayoutResult | null {
    const result = this.analysis.lastGoodResult
    if (!result) return null
    return computeRectLayout({
      entities: result.entities,
      relations: result.relations,
      viewport: { width: this.viewportWidth, height: this.viewportHeight },
    })
  }

  get neverDisplayed(): boolean {
    return (this.layout?.emptyIds.length ?? 0) > 0
  }

  get universeLabels(): Array<string> {
    const layout = this.layout
    if (!layout || layout.universeIds.length === 0) return []
    const byId = new Map(this.entities.map((entity) => [entity.id, entity]))
    return layout.universeIds
      .map((id) => byId.get(id)?.name)
      .filter((name): name is string => Boolean(name))
  }

  hoverEntity(entityId: string | null): void {
    this.hoveredEntityId = entityId
  }

  /** Editor caret moved: highlight the enclosing exported type, if any. */
  setCursorOffset(offset: number): void {
    const entity = this.entities.find(
      (candidate) =>
        candidate.declarationSpan !== null &&
        offset >= candidate.declarationSpan.start &&
        offset <= candidate.declarationSpan.end,
    )
    this.cursorEntityId = entity?.id ?? null
  }

  get activeEntityId(): string | null {
    return this.hoveredEntityId ?? this.cursorEntityId
  }

  /**
   * Containment stack under a canvas point, outermost first: the
   * multi-item tooltip (displayed unknowns prepended, ∅ appended when
   * the point rests on background rather than inside a leaf label).
   */
  stackAt(x: number, y: number): TooltipStack {
    const layout = this.layout
    const byId = new Map(this.entities.map((entity) => [entity.id, entity]))
    const items: Array<TooltipItem> = []

    if (layout) {
      for (const universeId of layout.universeIds) {
        const entity = byId.get(universeId)
        if (entity) {
          items.push({
            name: entity.name,
            typeText: entity.expandedText,
            colorIndex: null,
          })
        }
      }
      const containing = layout.rects
        .filter((rect) => contains(rect.outer, x, y))
        .sort((a, b) => a.depth - b.depth)
      for (const rect of containing) {
        for (const entityId of rect.entityIds) {
          const entity = byId.get(entityId)
          if (entity) {
            items.push({
              name: entity.name,
              typeText: entity.expandedText,
              colorIndex: rect.colorIndex,
            })
          }
        }
      }
    }

    // The ∅ row appears only while never is actually displayed — either
    // toggled as a preset or some export resolved to the empty set.
    return { items, onNever: this.neverDisplayed }
  }

  /** Whether a point falls inside some rectangle body (vs background). */
  rectAt(x: number, y: number): EntityRect | null {
    const layout = this.layout
    if (!layout) return null
    let innermost: EntityRect | null = null
    for (const rect of layout.rects) {
      if (contains(rect.outer, x, y)) {
        if (!innermost || rect.depth > innermost.depth) innermost = rect
      }
    }
    return innermost
  }
}

function contains(box: Box, x: number, y: number): boolean {
  return (
    x >= box.x &&
    x <= box.x + box.width &&
    y >= box.y &&
    y <= box.y + box.height
  )
}
