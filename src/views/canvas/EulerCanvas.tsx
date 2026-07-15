import { observer } from 'mobx-react-lite'
import {
  LOGICAL_VIEWPORT,
  VisualizationStore,
} from '#/services/visualization.store.ts'
import { SettingsService } from '#/services/settings.service.ts'
import { useService } from '#/views/di.tsx'
import { LABEL_METRICS, labelBoxWidth } from '#/core/layout/types.ts'
import type {
  CellAnchor,
  DomainFrame,
  EntityContour,
  RectShape,
  Shape,
} from '#/core/layout/types.ts'

const HUE_COUNT = 12

/**
 * The Euler diagram itself: a fixed-viewport SVG scaled by CSS.
 * Pure presentation — geometry comes fully computed from the layout
 * engine; this component maps it to SVG and wires hover events.
 */
export const EulerCanvas = observer(function EulerCanvas() {
  const viz = useService(VisualizationStore)
  const settings = useService(SettingsService)
  const layout = viz.layout

  return (
    <svg
      viewBox={`0 0 ${LOGICAL_VIEWPORT.width} ${LOGICAL_VIEWPORT.height}`}
      className="h-full w-full min-w-[720px] select-none"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Euler diagram of exported TypeScript types"
    >
      <CanvasDefs />

      {layout ? (
        <>
          <UniverseFrame
            frame={layout.universeFrame}
            emphasized={layout.universeEntityIds.length > 0}
            labels={entityNames(viz, layout.universeEntityIds)}
            onHover={(id) => viz.hoverEntity(id)}
            universeEntityIds={layout.universeEntityIds}
          />
          <NeverLayer
            frame={layout.universeFrame}
            emphasized={layout.emptyEntityIds.length > 0}
          />
          <g>
            {layout.frames.map((frame) => (
              <DomainFrameView key={frame.id} frame={frame} />
            ))}
          </g>
          <g>
            {layout.contours.map((contour) => (
              <ContourView
                key={contour.key}
                contour={contour}
                dimmed={
                  viz.activeEntityId !== null &&
                  !contour.entityIds.includes(viz.activeEntityId)
                }
                highlighted={
                  viz.activeEntityId !== null &&
                  contour.entityIds.includes(viz.activeEntityId)
                }
              />
            ))}
          </g>
          <g>
            {layout.anchors.map((anchor) => (
              <AnchorView
                key={anchor.cellId}
                anchor={anchor}
                uncertainHint={settings.t('canvas.unknownOverlapHint')}
              />
            ))}
          </g>
          <g>
            {layout.contours.map((contour) => (
              <ContourLabel
                key={contour.key}
                contour={contour}
                onHover={(id) => viz.hoverEntity(id)}
              />
            ))}
          </g>
          {layout.emptyEntityIds.length > 0 ? (
            <NeverLegend
              frame={layout.universeFrame}
              names={entityNames(viz, layout.emptyEntityIds)}
              text={settings.t('canvas.neverLegend')}
            />
          ) : null}
        </>
      ) : (
        <EmptyHint text={settings.t('canvas.emptyHint')} />
      )}
    </svg>
  )
})

function entityNames(
  viz: VisualizationStore,
  ids: Array<string>,
): Array<string> {
  return viz.entities
    .filter((entity) => ids.includes(entity.id))
    .map((entity) => entity.name)
}

/**
 * Shared defs: the never ∅ micro-pattern (Photoshop-transparency-grid
 * analogue — the empty set is "everywhere" as the canvas texture,
 * ADR-0005) and three ink textures overlaid on region fills so
 * overlapping translucent regions stay distinguishable (ADR-0009).
 */
function CanvasDefs() {
  return (
    <defs>
      <pattern
        id="never-grid"
        width="28"
        height="28"
        patternUnits="userSpaceOnUse"
      >
        <rect width="14" height="14" fill="rgba(27,39,51,0.022)" />
        <rect
          x="14"
          y="14"
          width="14"
          height="14"
          fill="rgba(27,39,51,0.022)"
        />
        <text
          x="7"
          y="24"
          fontSize="9"
          fontFamily="'JetBrains Mono Variable', monospace"
          fill="rgba(27,39,51,0.14)"
        >
          ∅
        </text>
      </pattern>
      <pattern
        id="tex-dots"
        width="10"
        height="10"
        patternUnits="userSpaceOnUse"
      >
        <circle cx="2" cy="2" r="1" fill="rgba(27,39,51,0.14)" />
      </pattern>
      <pattern
        id="tex-hatch"
        width="10"
        height="10"
        patternUnits="userSpaceOnUse"
      >
        <path d="M0 10 L10 0" stroke="rgba(27,39,51,0.10)" strokeWidth="1.2" />
      </pattern>
      <pattern
        id="tex-grid"
        width="12"
        height="12"
        patternUnits="userSpaceOnUse"
      >
        <path
          d="M12 0 H0 V12"
          fill="none"
          stroke="rgba(27,39,51,0.08)"
          strokeWidth="1"
        />
      </pattern>
    </defs>
  )
}

function UniverseFrame({
  frame,
  emphasized,
  labels,
  universeEntityIds,
  onHover,
}: {
  frame: RectShape
  emphasized: boolean
  labels: Array<string>
  universeEntityIds: Array<string>
  onHover: (id: string | null) => void
}) {
  const label = emphasized ? `unknown ≡ ${labels.join(' ≡ ')}` : 'unknown'
  return (
    <g>
      <rect
        x={frame.x}
        y={frame.y}
        width={frame.width}
        height={frame.height}
        rx={frame.rx}
        fill="var(--color-board)"
        stroke={emphasized ? 'var(--color-brand)' : 'var(--color-ink)'}
        strokeWidth={emphasized ? 5 : 3.5}
        className={emphasized ? 'set-contour' : undefined}
        style={{ '--contour-width': emphasized ? '5px' : '3.5px' } as never}
      />
      <text
        x={frame.x + 18}
        y={frame.y + 30}
        fontFamily="'JetBrains Mono Variable', monospace"
        fontSize="17"
        fontWeight={700}
        fill={emphasized ? 'var(--color-brand)' : 'var(--color-ink)'}
        onMouseEnter={() => {
          if (universeEntityIds.length > 0) onHover(universeEntityIds[0])
        }}
        onMouseLeave={() => onHover(null)}
        style={{ cursor: emphasized ? 'help' : 'default' }}
      >
        {label}
      </text>
    </g>
  )
}

/** The empty set as texture: present everywhere, in every region. */
function NeverLayer({
  frame,
  emphasized,
}: {
  frame: RectShape
  emphasized: boolean
}) {
  return (
    <rect
      x={frame.x}
      y={frame.y}
      width={frame.width}
      height={frame.height}
      rx={frame.rx}
      fill="url(#never-grid)"
      opacity={emphasized ? 1 : 0.55}
      pointerEvents="none"
    />
  )
}

function DomainFrameView({ frame }: { frame: DomainFrame }) {
  return (
    <g>
      <ShapeView
        shape={frame.shape}
        fill="rgba(255,255,255,0.72)"
        stroke="var(--color-line)"
        strokeWidth={2}
      />
      <text
        x={frame.labelPos.x}
        y={frame.labelPos.y}
        textAnchor="middle"
        fontFamily="'JetBrains Mono Variable', monospace"
        fontSize="15"
        fontWeight={600}
        fill="var(--color-ink-soft)"
      >
        {frame.label}
      </text>
      {frame.subzones.map((subzone) => (
        <g key={subzone.id}>
          <rect
            x={subzone.shape.x}
            y={subzone.shape.y}
            width={subzone.shape.width}
            height={subzone.shape.height}
            rx={subzone.shape.rx}
            fill="none"
            stroke="var(--color-line)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
          <text
            x={subzone.labelPos.x}
            y={subzone.labelPos.y}
            textAnchor="middle"
            fontFamily="'JetBrains Mono Variable', monospace"
            fontSize="11"
            fill="var(--color-ink-soft)"
            opacity={0.75}
          >
            {subzone.label}
          </text>
        </g>
      ))}
    </g>
  )
}

function ContourView({
  contour,
  dimmed,
  highlighted,
}: {
  contour: EntityContour
  dimmed: boolean
  highlighted: boolean
}) {
  const hue = contour.colorIndex % HUE_COUNT
  const texture = ['tex-dots', 'tex-hatch', 'tex-grid'][contour.colorIndex % 3]
  const strokeWidth = highlighted ? 5 : 3.5
  return (
    <g opacity={dimmed ? 0.25 : 1} style={{ transition: 'opacity 0.2s' }}>
      <path
        d={contour.svgPath}
        fill={`var(--set-hue-${hue}-fill)`}
        stroke="none"
      />
      <path
        d={contour.svgPath}
        fill={`url(#${texture})`}
        opacity={0.5}
        pointerEvents="none"
      />
      <path
        d={contour.svgPath}
        fill="none"
        stroke={`var(--set-hue-${hue}-stroke)`}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        className="set-contour"
        style={{ '--contour-width': `${strokeWidth}px` } as never}
      />
    </g>
  )
}

function ContourLabel({
  contour,
  onHover,
}: {
  contour: EntityContour
  onHover: (id: string | null) => void
}) {
  const hue = contour.colorIndex % HUE_COUNT
  const text = contour.labels.join(' ≡ ')
  const width = labelBoxWidth(text)
  return (
    <g
      transform={`translate(${contour.labelPos.x}, ${contour.labelPos.y})`}
      onMouseEnter={() => onHover(contour.entityIds[0])}
      onMouseLeave={() => onHover(null)}
      style={{ cursor: 'help' }}
    >
      <rect
        x={-width / 2}
        y={-LABEL_METRICS.height / 2 - 1}
        width={width}
        height={LABEL_METRICS.height}
        rx={LABEL_METRICS.height / 2}
        fill="white"
        stroke={`var(--set-hue-${hue}-stroke)`}
        strokeWidth={2.5}
      />
      <text
        textAnchor="middle"
        dominantBaseline="middle"
        y={0}
        fontFamily="'JetBrains Mono Variable', monospace"
        fontSize="13"
        fontWeight={700}
        fill="var(--color-ink)"
      >
        {text}
      </text>
    </g>
  )
}

function AnchorView({
  anchor,
  uncertainHint,
}: {
  anchor: CellAnchor
  uncertainHint: string
}) {
  if (anchor.cellKind === 'domain-full') return null
  if (anchor.shape.kind !== 'circle') return null
  const { cx, cy, radius } = anchor.shape

  if (anchor.cellKind === 'literal') {
    return (
      <g>
        <circle
          cx={cx}
          cy={cy}
          r={Math.min(radius, 5)}
          fill="var(--color-ink)"
        />
        {anchor.label ? (
          <text
            x={cx}
            y={cy - 10}
            textAnchor="middle"
            fontFamily="'JetBrains Mono Variable', monospace"
            fontSize="12"
            fill="var(--color-ink)"
          >
            {anchor.label}
          </text>
        ) : null}
      </g>
    )
  }

  if (anchor.uncertain) {
    return (
      <g style={{ cursor: 'help' }}>
        <title>{uncertainHint}</title>
        <circle
          cx={cx}
          cy={cy}
          r={Math.min(radius, 10)}
          fill="none"
          stroke="var(--color-ink-soft)"
          strokeWidth={2}
          strokeDasharray="4 4"
        />
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fontSize="11"
          fontFamily="'JetBrains Mono Variable', monospace"
          fill="var(--color-ink-soft)"
        >
          ?
        </text>
      </g>
    )
  }

  return null
}

function NeverLegend({
  frame,
  names,
  text,
}: {
  frame: RectShape
  names: Array<string>
  text: string
}) {
  const label = `${names.join(' ≡ ')} = ${text}`
  // CJK glyphs are roughly twice as wide as ASCII at this font size.
  const textWidth = [...label].reduce(
    (sum, char) => sum + (char.charCodeAt(0) > 0x2e80 ? 13 : 7.6),
    0,
  )
  const width = Math.min(frame.width - 40, textWidth + 28)
  return (
    <g transform={`translate(${frame.x + 20}, ${frame.y + frame.height - 44})`}>
      <rect
        width={width}
        height={30}
        rx={15}
        fill="white"
        stroke="var(--color-ink)"
        strokeWidth={2.5}
      />
      <text
        x={14}
        y={20}
        fontFamily="'JetBrains Mono Variable', monospace"
        fontSize="12.5"
        fontWeight={600}
        fill="var(--color-ink)"
      >
        {label}
      </text>
    </g>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <text
      x={LOGICAL_VIEWPORT.width / 2}
      y={LOGICAL_VIEWPORT.height / 2}
      textAnchor="middle"
      fontFamily="'Outfit Variable', sans-serif"
      fontSize="22"
      fill="var(--color-ink-soft)"
    >
      {text}
    </text>
  )
}

function ShapeView({
  shape,
  ...props
}: {
  shape: Shape
  fill: string
  stroke: string
  strokeWidth: number
}) {
  if (shape.kind === 'rect') {
    return (
      <rect
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        rx={shape.rx}
        {...props}
      />
    )
  }
  return <circle cx={shape.cx} cy={shape.cy} r={shape.radius} {...props} />
}
