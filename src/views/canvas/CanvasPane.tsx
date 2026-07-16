import { observer } from 'mobx-react-lite'
import { RectCanvas } from '#/views/canvas/RectCanvas.tsx'
import { PresetsBar } from '#/views/presets/PresetsBar.tsx'

/**
 * Left stage: preset picker on top, the rectangle canvas below.
 * The canvas region is fluid — it takes whatever space the shell
 * gives it and reports its measured size to the layout.
 */
export const CanvasPane = observer(function CanvasPane() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PresetsBar />
      <div className="min-h-0 flex-1 px-4 pt-2 pb-4">
        <RectCanvas />
      </div>
    </div>
  )
})
