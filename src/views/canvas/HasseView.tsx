import { observer } from 'mobx-react-lite'
import { useState } from 'react'
import { SettingsService } from '#/services/settings.service.ts'
import { VisualizationStore } from '#/services/visualization.store.ts'
import { Popup } from '#/views/floating/Popup.tsx'
import { useService } from '#/views/di.tsx'
import type { HasseLayoutResult, HasseNode } from '#/core/layout/types.ts'
import type { TypeEntity } from '#/core/set-model/types.ts'

const HUE_COUNT = 12

/**
 * Hasse-diagram rendering (ADR-0017): the automatic fallback when the
 * containment DAG cannot be drawn faithfully with rectangles. Supersets
 * sit above their subsets, covering edges connect them; ??? placeholder
 * nodes mark parents that are not exhausted by their children. Node
 * chips reuse the palette; hover shows the same list-style tooltip.
 */
export const HasseView = observer(function HasseView({
  layout,
}: {
  layout: HasseLayoutResult
}) {
  const viz = useService(VisualizationStore)
  const settings = useService(SettingsService)
  const byId = new Map(viz.entities.map((entity) => [entity.id, entity]))

  return (
    <>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        {layout.edges.map((edge) => (
          <line
            key={`${edge.from}->${edge.to}`}
            x1={edge.x1}
            y1={edge.y1}
            x2={edge.x2}
            y2={edge.y2}
            stroke="rgba(100, 106, 115, 0.5)"
            strokeWidth="1.5"
          />
        ))}
      </svg>

      {layout.nodes.map((node) => (
        <HasseNodeChip
          key={node.key}
          node={node}
          entities={node.entityIds
            .map((id) => byId.get(id))
            .filter((entity): entity is TypeEntity => Boolean(entity))}
          otherText={settings.t('canvas.otherTypes')}
          dimmed={viz.isDimmed(node.entityIds)}
          onHover={(entityIds) => viz.hoverClass(entityIds)}
        />
      ))}
    </>
  )
})

const HasseNodeChip = observer(function HasseNodeChip({
  node,
  entities,
  otherText,
  dimmed,
  onHover,
}: {
  node: HasseNode
  entities: Array<TypeEntity>
  otherText: string
  dimmed: boolean
  onHover: (entityIds: Array<string> | null) => void
}) {
  const [hovered, setHovered] = useState(false)
  const [anchor, setAnchor] = useState<{
    x: number
    y: number
    width: number
    height: number
  } | null>(null)
  const placeholder = node.kind === 'placeholder'
  const hue = (node.colorIndex ?? 0) % HUE_COUNT

  return (
    <>
      <div
        className="absolute flex items-center justify-center rounded-xl font-mono text-sm font-bold transition-opacity duration-200"
        style={{
          left: node.box.x,
          top: node.box.y,
          width: node.box.width,
          height: node.box.height,
          border: placeholder
            ? '2px dashed rgba(100, 106, 115, 0.55)'
            : `3px solid var(--set-hue-${hue}-stroke)`,
          background: placeholder
            ? 'rgba(143, 149, 158, 0.08)'
            : `var(--set-hue-${hue}-fill)`,
          color: placeholder
            ? 'rgba(100, 106, 115, 0.75)'
            : `var(--set-hue-${hue}-stroke)`,
          opacity: dimmed ? 0.3 : 1,
          textShadow:
            '0 0 3px white, 0 1px 2px rgba(255,255,255,0.95), 0 -1px 2px rgba(255,255,255,0.95)',
        }}
        onMouseEnter={(event) => {
          setHovered(true)
          const rect = event.currentTarget.getBoundingClientRect()
          setAnchor({
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
          })
          if (node.entityIds.length > 0) onHover(node.entityIds)
        }}
        onMouseLeave={() => {
          setHovered(false)
          onHover(null)
        }}
      >
        <span className="max-w-full truncate px-2">
          {node.labels.join(' ≡ ')}
        </span>
      </div>

      {hovered && anchor ? (
        <Popup anchor={anchor} placement="bottom-start" distance={10}>
          <div className="pointer-events-none min-w-44 rounded-xl border-2 border-(--color-ink) bg-white px-3 py-2 shadow-(--shadow-sticker)">
            <ul className="flex flex-col gap-1">
              {placeholder ? (
                <li className="flex items-baseline gap-2 font-mono text-xs">
                  <span className="font-bold text-(--color-ink-soft)">???</span>
                  <span className="text-(--color-ink-soft)">{otherText}</span>
                </li>
              ) : (
                entities.map((entity) => (
                  <li
                    key={entity.id}
                    className="flex items-baseline gap-2 font-mono text-xs"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 self-center rounded-[4px] border-2"
                      style={{
                        borderColor: `var(--set-hue-${hue}-stroke)`,
                        background: `var(--set-hue-${hue}-fill)`,
                      }}
                    />
                    <span className="font-bold">{entity.name}</span>
                    {entity.expandedText !== entity.name ? (
                      <span className="max-w-[28rem] truncate text-(--color-ink-soft)">
                        {entity.expandedText}
                      </span>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </div>
        </Popup>
      ) : null}
    </>
  )
})
