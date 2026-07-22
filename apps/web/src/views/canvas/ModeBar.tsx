import { InformationCircleIcon } from '@heroicons/react/24/outline'
import { observer } from 'mobx-react-lite'
import { useRef, useState } from 'react'
import { MIN_VIEWPORT } from '@typarium/set-model'
import { computeRectLayout, EulerDiagram } from '@typarium/diagram-euler'
import { computeHasseLayout, HasseDiagram } from '@typarium/diagram-hasse'
import { SettingsService } from '#/services/settings.service.ts'
import { VisualizationStore } from '#/services/visualization.store.ts'
import { Popup } from '#/views/floating/Popup.tsx'
import { useService } from '#/views/di.tsx'
import type { DiagramMode } from '#/services/visualization.store.ts'
import type { RectLayoutResult } from '@typarium/diagram-euler'
import type { HasseLayoutResult } from '@typarium/diagram-hasse'
import type { PairRelation, TypeEntity } from '@typarium/set-model'

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
          label={settings.t('mode.euler')}
          checked={viz.effectiveMode === 'euler'}
          disabled={!viz.eulerDrawable}
          disabledHint={settings.t('mode.eulerUnavailable')}
          onSelect={() => viz.chooseMode('euler')}
        />
        <ModeRadio
          label={settings.t('mode.hasse')}
          checked={viz.effectiveMode === 'hasse'}
          disabled={false}
          onSelect={() => viz.chooseMode('hasse')}
        />
      </div>

      {infoOpen ? (
        <Popup anchor={infoRef} placement="bottom-start" distance={10}>
          <div className="w-[480px] max-w-[92vw] rounded-xl border-2 border-(--color-ink) bg-white p-4 shadow-(--shadow-sticker)">
            <p className="mb-2 text-xs leading-relaxed">
              <span className="font-mono font-bold">
                {settings.t('mode.euler')}
              </span>{' '}
              · {settings.t('mode.info.euler')}
            </p>
            <p className="mb-3 text-xs leading-relaxed">
              <span className="font-mono font-bold">
                {settings.t('mode.hasse')}
              </span>{' '}
              · {settings.t('mode.info.hasse')}
            </p>
            <div className="flex items-start justify-center gap-10">
              <figure className="flex flex-col items-center gap-1.5">
                <MiniDiagram kind="euler" />
                <figcaption className="font-mono text-[11px] font-bold">
                  {settings.t('mode.euler')}
                </figcaption>
              </figure>
              <figure className="flex flex-col items-center gap-1.5">
                <MiniDiagram kind="hasse" />
                <figcaption className="font-mono text-[11px] font-bold">
                  {settings.t('mode.hasse')}
                </figcaption>
              </figure>
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
  // Checked state is COLOR only (no offset): radios keep one baseline.
  const base =
    'rounded-full border-2 px-2.5 py-0.5 font-mono text-[11px] font-bold transition-[transform,box-shadow,background-color,border-color]'
  const palette = disabled
    ? 'cursor-not-allowed border-(--color-line) bg-(--color-paper) text-(--color-ink-soft) opacity-60'
    : checked
      ? 'border-(--color-brand-deep) bg-(--color-brand) text-white shadow-(--shadow-keycap)'
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
