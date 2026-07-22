import type { HasseLayoutResult, HasseNode } from './types.ts'
import '@typarium/set-model/palette.css'
import './styles.css'

const HUE_COUNT = 12

const EMPTY_KEYS: ReadonlySet<string> = new Set()

export interface HasseDiagramProps {
  layout: HasseLayoutResult
  /**
   * Dimmed nodes as PLAIN DATA by node key — same store-free contract
   * as EulerDiagram: reactive hosts derive the set in their own render.
   */
  dimmedKeys?: ReadonlySet<string>
  /**
   * Node hover callbacks with the DOM element as tooltip anchor; the
   * HOST renders any tooltip — the component stays chrome-free.
   */
  onNodeEnter?: (node: HasseNode, element: HTMLElement) => void
  onNodeLeave?: (node: HasseNode) => void
}

/**
 * The layered Hasse diagram as a CONTROLLED component: covering edges
 * as SVG lines, one chip per node, supersets above subsets. Same
 * embedding contract as EulerDiagram — no stores, no i18n, palette by
 * --set-hue-* variables.
 */
export function HasseDiagram({
  layout,
  dimmedKeys = EMPTY_KEYS,
  onNodeEnter,
  onNodeLeave,
}: HasseDiagramProps) {
  return (
    <>
      <svg aria-hidden="true" className="ty-hasse-edges">
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

      {layout.nodes.map((node) => {
        const placeholder = node.kind === 'placeholder'
        const hue = (node.colorIndex ?? 0) % HUE_COUNT
        return (
          <div
            key={node.key}
            className="ty-hasse-node"
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
              opacity: dimmedKeys.has(node.key) ? 0.3 : 1,
            }}
            onMouseEnter={(event) => onNodeEnter?.(node, event.currentTarget)}
            onMouseLeave={() => onNodeLeave?.(node)}
          >
            <span className="ty-hasse-node-label">
              {node.labels.join(' ≡ ')}
            </span>
          </div>
        )
      })}
    </>
  )
}
