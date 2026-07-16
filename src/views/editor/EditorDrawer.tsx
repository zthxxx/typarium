import { observer } from 'mobx-react-lite'
import { useRef } from 'react'
import { SettingsService } from '#/services/settings.service.ts'
import { UiService } from '#/services/ui.service.ts'
import { MonacoEditor } from '#/views/editor/MonacoEditor.tsx'
import { useService } from '#/views/di.tsx'

/**
 * The editor shell (product rules, revision 2):
 * - desktop: inline right pane, drag-resizable on its left edge,
 *   collapsible to a slim reopen rail
 * - narrow screens: a drawer floating OVER the canvas from the right;
 *   collapsing retracts it fully off-screen
 */
export const EditorDrawer = observer(function EditorDrawer() {
  const ui = useService(UiService)
  const settings = useService(SettingsService)
  const dragging = useRef(false)

  if (ui.isNarrow) {
    return (
      <>
        <button
          type="button"
          aria-label={
            ui.editorOpen
              ? settings.t('editor.collapse')
              : settings.t('editor.expand')
          }
          className="fixed top-1/2 right-0 z-40 -translate-y-1/2 rounded-l-xl border-2 border-r-0 border-(--color-ink) bg-white px-1.5 py-4 font-mono text-sm font-bold shadow-[-2px_2px_0_rgba(27,39,51,0.12)]"
          onClick={() => ui.toggleEditor()}
        >
          {ui.editorOpen ? '›' : '‹'}
        </button>
        <aside
          className="fixed top-14 right-0 bottom-9 z-30 w-[min(92vw,480px)] border-l-[3px] border-(--color-ink) bg-(--color-board) shadow-[-8px_0_24px_rgba(27,39,51,0.18)] transition-transform duration-300"
          style={{
            transform: ui.editorOpen ? 'translateX(0)' : 'translateX(100%)',
          }}
          aria-hidden={!ui.editorOpen}
        >
          <MonacoEditor />
        </aside>
      </>
    )
  }

  if (!ui.editorOpen) {
    return (
      <button
        type="button"
        aria-label={settings.t('editor.expand')}
        className="flex h-full w-9 shrink-0 items-center justify-center border-l-2 border-(--color-line) bg-white font-mono text-base font-bold text-(--color-ink-soft) hover:bg-(--color-paper) hover:text-(--color-brand)"
        onClick={() => ui.toggleEditor()}
      >
        ‹
      </button>
    )
  }

  return (
    <aside
      className="relative flex h-full min-h-0 shrink-0"
      style={{ width: ui.editorWidth }}
    >
      <div
        role="separator"
        aria-label={settings.t('editor.resize')}
        className="group absolute top-0 bottom-0 left-0 z-20 w-2 cursor-col-resize"
        onPointerDown={(event) => {
          dragging.current = true
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (!dragging.current) return
          ui.setEditorWidth(window.innerWidth - event.clientX)
        }}
        onPointerUp={(event) => {
          dragging.current = false
          event.currentTarget.releasePointerCapture(event.pointerId)
        }}
      >
        <div className="mx-auto h-full w-[3px] bg-(--color-line) transition-colors group-hover:bg-(--color-brand)" />
      </div>
      <div className="flex min-h-0 w-full flex-col border-l-2 border-(--color-line) bg-(--color-board)">
        <div className="flex h-8 shrink-0 items-center justify-between border-b-2 border-(--color-line) px-3">
          <span className="font-mono text-[11px] font-semibold text-(--color-ink-soft)">
            {settings.t('editor.title')}
          </span>
          <button
            type="button"
            aria-label={settings.t('editor.collapse')}
            className="rounded px-1.5 font-mono text-sm font-bold text-(--color-ink-soft) hover:text-(--color-brand)"
            onClick={() => ui.toggleEditor()}
          >
            ›
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <MonacoEditor />
        </div>
      </div>
    </aside>
  )
})
