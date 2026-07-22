import { InformationCircleIcon } from '@heroicons/react/20/solid'
import { observer } from 'mobx-react-lite'
import { useRef, useState } from 'react'
import { MIN_VIEWPORT } from '#/core/layout/constants.ts'
import { computeHasseLayout, computeRectLayout } from '#/core/layout/index.ts'
import { SettingsService } from '#/services/settings.service.ts'
import { EulerDiagram } from '#/views/diagram/EulerDiagram.tsx'
import { HasseDiagram } from '#/views/diagram/HasseDiagram.tsx'
import { VisualizationStore } from '#/services/visualization.store.ts'
import { Popup } from '#/views/floating/Popup.tsx'
import { useService } from '#/views/di.tsx'
import type { DiagramMode } from '#/services/visualization.store.ts'
import type {
  HasseLayoutResult,
  RectLayoutResult,
} from '#/core/layout/types.ts'
import type { PairRelation, TypeEntity } from '#/core/set-model/types.ts'

/**
 * Diagram-mode selector (ADR-0018): Euler / Hasse radio row between
 * the presets bar and the canvas. Euler disables itself while the
 * current containment cannot be drawn faithfully; the info popover
 * explains both paradigms with LIVE mini diagrams — the real layout
 * engines rendering a fixed demo input, never screenshots.
 */
export const ModeBar = observer(function ModeBar() {
  const viz = useService(VisualizationStore)
  const settings = useService(SettingsService)
  const infoRef = useRef<HTMLSpanElement>(null)
  const [infoOpen, setInfoOpen] = useState(false)

  return (
    <div className="flex items-center gap-2 px-4 pb-1">
      <span
        ref={infoRef}
        className="flex cursor-help items-center gap-1"
        onMouseEnter={() => setInfoOpen(true)}
        onMouseLeave={() => setInfoOpen(false)}
      >
        <span className="font-mono text-xs font-bold text-(--color-ink-soft)">
          {settings.t('mode.title')}
        </span>
        <InformationCircleIcon
          className="h-4 w-4 text-(--color-ink-soft) opacity-60"
          aria-label={settings.t('mode.infoAria')}
        />
      </span>

      <div
        role="radiogroup"
        aria-label={settings.t('mode.title')}
        className="flex gap-1.5"
      >
        <ModeRadio
          label="Euler"
          checked={viz.effectiveMode === 'euler'}
          disabled={!viz.eulerDrawable}
          disabledHint={settings.t('mode.eulerUnavailable')}
          onSelect={() => viz.chooseMode('euler')}
        />
        <ModeRadio
          label="Hasse"
          checked={viz.effectiveMode === 'hasse'}
          disabled={false}
          onSelect={() => viz.chooseMode('hasse')}
        />
      </div>

      {infoOpen ? (
        <Popup anchor={infoRef} placement="bottom-start" distance={10}>
          <div className="w-[480px] max-w-[92vw] rounded-xl border-2 border-(--color-ink) bg-white p-4 shadow-(--shadow-sticker)">
            <p className="mb-2 text-xs leading-relaxed">
              <span className="font-mono font-bold">Euler</span> ·{' '}
              {settings.t('mode.info.euler')}
            </p>
            <p className="mb-3 text-xs leading-relaxed">
              <span className="font-mono font-bold">Hasse</span> ·{' '}
              {settings.t('mode.info.hasse')}
            </p>
            <div className="flex items-start justify-center gap-3">
              <MiniDiagram kind="euler" />
              <MiniDiagram kind="hasse" />
            </div>
            <p className="mt-2 text-center font-mono text-[11px] text-(--color-ink-soft)">
              {settings.t('mode.info.example')}
            </p>
          </div>
        </Popup>
      ) : null}
    </div>
  )
})

function ModeRadio({
  label,
  checked,
  disabled,
  disabledHint,
  onSelect,
}: {
  label: string
  checked: boolean
  disabled: boolean
  disabledHint?: string
  onSelect: () => void
}) {
  const base =
    'rounded-full border-2 px-2.5 py-0.5 font-mono text-[11px] font-bold transition-[transform,box-shadow,background-color,border-color]'
  const palette = disabled
    ? 'cursor-not-allowed border-(--color-line) bg-(--color-paper) text-(--color-ink-soft) opacity-60'
    : checked
      ? 'translate-y-[2px] border-(--color-brand-deep) bg-(--color-brand) text-white'
      : 'border-(--color-ink) bg-white text-(--color-ink) shadow-(--shadow-keycap) hover:-translate-y-[1px]'
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
      title={disabled ? disabledHint : undefined}
      className={`${base} ${palette}`}
      onClick={disabled ? undefined : onSelect}
    >
      {label}
    </button>
  )
}

/**
 * Fixed teaching input: C1 contains C2 and C3; C2, C3 disjoint. Both
 * layouts are computed ONCE at module scope from the same pure engines
 * the canvas uses — determinism guarantees the examples always match
 * real rendering.
 */
const DEMO_SCALE = 0.5

function demoEntity(id: string): TypeEntity {
  return {
    id,
    name: id,
    typeText: id,
    expandedText: id,
    special: 'none',
    origin: 'code',
    coveredBySubsets: false,
    declarationSpan: null,
  }
}

const DEMO_INPUT = {
  entities: [demoEntity('C1'), demoEntity('C2'), demoEntity('C3')],
  relations: [
    { a: 'C2', b: 'C1', kind: 'subset' },
    { a: 'C3', b: 'C1', kind: 'subset' },
    { a: 'C2', b: 'C3', kind: 'unrelated' },
  ] as Array<PairRelation>,
  viewport: MIN_VIEWPORT,
}

const DEMO_EULER: RectLayoutResult = computeRectLayout(DEMO_INPUT)
const DEMO_HASSE: HasseLayoutResult = computeHasseLayout(DEMO_INPUT)

function MiniDiagram({ kind }: { kind: DiagramMode }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-lg border-2 border-(--color-line) bg-(--color-board)"
      style={{
        width: MIN_VIEWPORT.width * DEMO_SCALE,
        height: MIN_VIEWPORT.height * DEMO_SCALE,
      }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{
          transform: `scale(${DEMO_SCALE})`,
          width: MIN_VIEWPORT.width,
          height: MIN_VIEWPORT.height,
        }}
      >
        {kind === 'euler' ? (
          <EulerDiagram layout={DEMO_EULER} />
        ) : (
          <HasseDiagram layout={DEMO_HASSE} />
        )}
      </div>
    </div>
  )
}
