import { Card, Radio } from 'animal-island-ui'
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
 *
 * The island Radio keeps native `input[type=radio]` semantics — the
 * e2e getByRole('radio')/toBeChecked/toBeDisabled contract holds.
 */
export const ModeBar = observer(function ModeBar() {
  const viz = useService(VisualizationStore)
  const settings = useService(SettingsService)
  const infoRef = useRef<HTMLSpanElement>(null)
  const [infoOpen, setInfoOpen] = useState(false)

  return (
    <div className="flex items-center gap-3 px-4 pb-1">
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

      <Radio
        size="small"
        value={viz.effectiveMode}
        onChange={(value) => viz.chooseMode(value as DiagramMode)}
        options={[
          {
            value: 'euler',
            disabled: !viz.eulerDrawable,
            label: (
              <span
                title={
                  viz.eulerDrawable
                    ? undefined
                    : settings.t('mode.eulerUnavailable')
                }
              >
                {settings.t('mode.euler')}
              </span>
            ),
          },
          { value: 'hasse', label: settings.t('mode.hasse') },
        ]}
      />

      {infoOpen ? (
        <Popup anchor={infoRef} placement="bottom-start" distance={10}>
          <Card className="w-[480px] max-w-[92vw]">
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
            <p className="mt-2 text-center text-[11px] text-(--color-ink-soft)">
              {settings.t('mode.info.example')}
            </p>
          </Card>
        </Popup>
      ) : null}
    </div>
  )
})

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
