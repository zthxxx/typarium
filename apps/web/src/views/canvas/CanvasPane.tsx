import { observer } from 'mobx-react-lite'
import { ModeBar } from '#/views/canvas/ModeBar.tsx'
import { RectCanvas } from '#/views/canvas/RectCanvas.tsx'
import { PresetsBar } from '#/views/presets/PresetsBar.tsx'

/**
 * Left stage: preset picker on top, the diagram-mode selector row,
 * then the canvas. The canvas region is fluid — it takes whatever
 * space the shell gives it and reports its measured size back.
 */
export const CanvasPane = observer(function CanvasPane() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PresetsBar />
      <ModeBar />
      <div className="min-h-0 flex-1 px-4 pt-1 pb-4">
        <RectCanvas />
      </div>
    </div>
  )
})
