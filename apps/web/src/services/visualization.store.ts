import { computed, makeAutoObservable } from 'mobx'
import { MIN_VIEWPORT } from '@typarium/set-model'
import {
  computeRectLayout,
  probeRectFaithfulness,
} from '@typarium/diagram-euler'
import { computeHasseLayout } from '@typarium/diagram-hasse'
import type { SpecialTypeNames } from '@typarium/language-adapter'
import type {
  Box,
  LayoutInput,
  SourceSpan,
  TypeEntity,
} from '@typarium/set-model'
import type {
  EntityRect,
  PlaceholderRect,
  RectLayoutResult,
} from '@typarium/diagram-euler'
import type { HasseLayoutResult } from '@typarium/diagram-hasse'
import type { AnalysisService } from '#/services/analysis.service.ts'

export type DiagramMode = 'euler' | 'hasse'

/** Discriminated canvas layout: Euler rectangles or the Hasse variant. */
export type CanvasLayout =
  | ({ mode: 'euler' } & RectLayoutResult)
  | ({ mode: 'hasse' } & HasseLayoutResult)

export interface TooltipItem {
  name: string
  typeText: string
  colorIndex: number | null
}

export interface TooltipStack {
  items: Array<TooltipItem>
  /** True when the pointer rests on background dots (the ∅ region). */
  onNever: boolean
  /** True when the pointer rests on a `???` (everything-else) block. */
  onPlaceholder: boolean
}

/**
 * Presentation state for the canvas: diagram-mode policy (ADR-0018),
 * derived layout (a pure function of the last good analysis and the
 * measured viewport) plus hover/caret highlight shared between editor
 * and canvas.
 */
export class VisualizationStore {
  /** Measured canvas size, driven by the view's ResizeObserver. */
  viewportWidth: number = MIN_VIEWPORT.width
  viewportHeight: number = MIN_VIEWPORT.height

  /**
   * The user's explicit diagram-mode choice; null = never chose.
   * Policy (ADR-0018): Euler by default, automatic Hasse fallback when
   * Euler cannot draw faithfully, automatic return to Euler when it
   * can again — UNLESS the user pinned Hasse by hand.
   */
  userMode: DiagramMode | null = null

  /**
   * Equivalence class under the pointer (every entity of the hovered
   * rect/node) — hover semantics are class-level, so one hover can
   * highlight several equal exports in the editor at once.
   */
  hoveredEntityIds: Array<string> = []

  /**
   * The `???` (everything-else) block under the pointer, by key.
   * Mutually exclusive with entity hover: a placeholder IS a hover
   * target of its own — it must highlight, never dim, when pointed at.
   */
  hoveredPlaceholderKey: string | null = null

  /**
   * Editor caret offset — the SOURCE value; the highlighted entity is
   * derived from it. Storing the derived id instead caused a stale
   * dim-state to survive the entity's deletion (analysis changed, the
   * stored id never recomputed).
   */
  cursorOffset: number | null = null

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

  /** Language display names for the special roles (never hardcode TS). */
  get specialNames(): SpecialTypeNames {
    return this.analysis.descriptor.specialTypeNames
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

  private get layoutInput(): LayoutInput | null {
    const result = this.analysis.lastGoodResult
    if (!result) return null
    return {
      entities: result.entities,
      relations: result.relations,
      viewport: { width: this.viewportWidth, height: this.viewportHeight },
    }
  }

  /** Every place the rectangle paradigm would drop a containment edge. */
  get eulerViolations(): Array<string> {
    const input = this.layoutInput
    if (!input) return []
    return probeRectFaithfulness(input)
  }

  /** Whether Euler can draw the current containment DAG faithfully. */
  get eulerDrawable(): boolean {
    return this.eulerViolations.length === 0
  }

  /** The mode actually rendered: user intent bounded by drawability. */
  get effectiveMode(): DiagramMode {
    if (this.userMode === 'hasse') return 'hasse'
    return this.eulerDrawable ? 'euler' : 'hasse'
  }

  /** Radio click. Selecting Euler releases a manual Hasse pin. */
  chooseMode(mode: DiagramMode): void {
    this.userMode = mode
  }

  get layout(): CanvasLayout | null {
    const input = this.layoutInput
    if (!input) return null
    if (this.effectiveMode === 'euler') {
      return { mode: 'euler', ...computeRectLayout(input) }
    }
    const hasse = computeHasseLayout(input)
    return {
      mode: 'hasse',
      ...hasse,
      warnings: [
        ...this.eulerViolations.map(
          (violation) => `hasse fallback: ${violation}`,
        ),
        ...hasse.warnings,
      ],
    }
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

  /** Canvas hover: the full equivalence class of the hit rect/node. */
  hoverClass(entityIds: Array<string> | null): void {
    this.hoveredEntityIds = entityIds ?? []
    this.hoveredPlaceholderKey = null
  }

  /** Canvas hover landed on a `???` block instead of an entity. */
  hoverPlaceholder(key: string | null): void {
    this.hoveredPlaceholderKey = key
    this.hoveredEntityIds = []
  }

  /** Editor caret moved: remember where it is. */
  setCursorOffset(offset: number): void {
    this.cursorOffset = offset
  }

  /** Editor lost focus: no caret-driven highlight should remain. */
  clearCursor(): void {
    this.cursorOffset = null
  }

  /** The exported type enclosing the caret, recomputed per analysis. */
  get cursorEntityId(): string | null {
    if (this.cursorOffset === null) return null
    const offset = this.cursorOffset
    const entity = this.entities.find(
      (candidate) =>
        candidate.declarationSpan !== null &&
        offset >= candidate.declarationSpan.start &&
        offset <= candidate.declarationSpan.end,
    )
    return entity?.id ?? null
  }

  /** Ids driving highlight/dim; hover wins over the caret. */
  get activeEntityIds(): Array<string> {
    if (this.hoveredEntityIds.length > 0) return this.hoveredEntityIds
    // A hovered placeholder owns the highlight: the caret must not keep
    // some entity lit next to it.
    if (this.hoveredPlaceholderKey !== null) return []
    return this.cursorEntityId === null ? [] : [this.cursorEntityId]
  }

  /** Anything hover/caret-active — entity class OR a ??? block. */
  get hasActive(): boolean {
    return (
      this.activeEntityIds.length > 0 || this.hoveredPlaceholderKey !== null
    )
  }

  /** A rect/node lights up when it shares an entity with the active class. */
  isHighlighted(entityIds: Array<string>): boolean {
    return (
      this.activeEntityIds.length > 0 &&
      entityIds.some((id) => this.activeEntityIds.includes(id))
    )
  }

  /** Everything not highlighted dims while something is active. */
  isDimmed(entityIds: Array<string>): boolean {
    return this.hasActive && !this.isHighlighted(entityIds)
  }

  isPlaceholderHighlighted(key: string): boolean {
    return this.hoveredPlaceholderKey === key
  }

  isPlaceholderDimmed(key: string): boolean {
    return this.hasActive && this.hoveredPlaceholderKey !== key
  }

  /**
   * Declaration spans the editor highlights for the hovered class —
   * code-origin entities only (presets have nothing to highlight), and
   * hover only (the caret already lives in the editor).
   */
  get editorHighlightSpans(): Array<SourceSpan> {
    if (this.hoveredEntityIds.length === 0) return []
    const byId = new Map(this.entities.map((entity) => [entity.id, entity]))
    return this.hoveredEntityIds
      .map((id) => byId.get(id))
      .filter(
        (entity): entity is TypeEntity =>
          entity !== undefined &&
          entity.origin === 'code' &&
          entity.declarationSpan !== null,
      )
      .map((entity) => entity.declarationSpan as SourceSpan)
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

    if (layout && layout.mode === 'euler') {
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
    const onPlaceholder =
      layout?.mode === 'euler' &&
      layout.placeholders.some((placeholder) => contains(placeholder.box, x, y))
    return { items, onNever: this.neverDisplayed, onPlaceholder }
  }

  /** The `???` block under a canvas point, if any (euler mode). */
  placeholderAt(x: number, y: number): PlaceholderRect | null {
    const layout = this.layout
    if (!layout || layout.mode !== 'euler') return null
    return (
      layout.placeholders.find((placeholder) =>
        contains(placeholder.box, x, y),
      ) ?? null
    )
  }

  /** Whether a point falls inside some rectangle body (vs background). */
  rectAt(x: number, y: number): EntityRect | null {
    const layout = this.layout
    if (!layout || layout.mode !== 'euler') return null
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
