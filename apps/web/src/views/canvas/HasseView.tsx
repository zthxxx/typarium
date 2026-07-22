import { observer } from 'mobx-react-lite'
import { useState } from 'react'
import { SettingsService } from '#/services/settings.service.ts'
import { VisualizationStore } from '#/services/visualization.store.ts'
import { HasseDiagram } from '@typarium/diagram-hasse'
import { Popup } from '#/views/floating/Popup.tsx'
import { useService } from '#/views/di.tsx'
import type { HasseLayoutResult, HasseNode } from '@typarium/diagram-hasse'
import type { TypeEntity } from '@typarium/set-model'

const HUE_COUNT = 12

interface HoveredNode {
  node: HasseNode
  anchor: { x: number; y: number; width: number; height: number }
}

/**
 * App wrapper around the controlled HasseDiagram (ADR-0017/0021): the
 * component draws nodes and covering edges; store wiring (class hover,
 * dimming) and the tooltip chrome live HERE — the diagram package
 * stays embeddable without stores or i18n.
 */
export const HasseView = observer(function HasseView({
  layout,
}: {
  layout: HasseLayoutResult
}) {
  const viz = useService(VisualizationStore)
  const settings = useService(SettingsService)
  const [hovered, setHovered] = useState<HoveredNode | null>(null)
  const byId = new Map(viz.entities.map((entity) => [entity.id, entity]))

  return (
    <>
      <HasseDiagram
        layout={layout}
        dimmedKeys={viz.dimmedKeys}
        onNodeEnter={(node, element) => {
          const rect = element.getBoundingClientRect()
          setHovered({
            node,
            anchor: {
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height,
            },
          })
          if (node.kind === 'placeholder') {
            viz.hoverPlaceholder(node.key)
          } else if (node.entityIds.length > 0) {
            viz.hoverClass(node.entityIds)
          }
        }}
        onNodeLeave={() => {
          setHovered(null)
          viz.hoverClass(null)
        }}
      />

      {hovered ? (
        <Popup anchor={hovered.anchor} placement="bottom-start" distance={10}>
          <div className="pointer-events-none min-w-44 rounded-xl border-2 border-(--color-ink) bg-white px-3 py-2 shadow-(--shadow-sticker)">
            <ul className="flex flex-col gap-1">
              {hovered.node.kind === 'placeholder' ? (
                <li className="flex items-baseline gap-2 font-mono text-xs">
                  <span className="font-bold text-(--color-ink-soft)">???</span>
                  <span className="text-(--color-ink-soft)">
                    {settings.t('canvas.otherTypes')}
                  </span>
                </li>
              ) : (
                hovered.node.entityIds
                  .map((id) => byId.get(id))
                  .filter((entity): entity is TypeEntity => Boolean(entity))
                  .map((entity) => (
                    <li
                      key={entity.id}
                      className="flex items-baseline gap-2 font-mono text-xs"
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 self-center rounded-[4px] border-2"
                        style={{
                          borderColor: `var(--set-hue-${(hovered.node.colorIndex ?? 0) % HUE_COUNT}-stroke)`,
                          background: `var(--set-hue-${(hovered.node.colorIndex ?? 0) % HUE_COUNT}-fill)`,
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
