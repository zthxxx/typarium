import { makeAutoObservable } from 'mobx'

/** Below this width the editor floats over the canvas as a drawer. */
const NARROW_QUERY = '(max-width: 1023px)'

const EDITOR_WIDTH_KEY = 'typarium.editorWidth'
const EDITOR_MIN = 320
const EDITOR_MAX_RATIO = 0.7

/**
 * Responsive shell state (product rules, revision 2):
 * - desktop: the editor is an inline right pane, drag-resizable and
 *   collapsible; collapse retracts it fully (a slim rail reopens it)
 * - narrow screens: the editor floats OVER the canvas from the right;
 *   collapsing retracts it off-screen instead of stacking it below
 */
export class UiService {
  isNarrow = false
  editorOpen = true
  editorWidth = 480

  constructor() {
    makeAutoObservable(this)
    if (typeof window !== 'undefined') {
      const media = window.matchMedia(NARROW_QUERY)
      this.isNarrow = media.matches
      // Drawer starts closed on narrow screens: the canvas is the stage.
      if (media.matches) this.editorOpen = false
      media.addEventListener('change', (event) => {
        this.setNarrow(event.matches)
      })
      try {
        const stored = Number(localStorage.getItem(EDITOR_WIDTH_KEY))
        if (Number.isFinite(stored) && stored >= EDITOR_MIN) {
          this.editorWidth = stored
        }
      } catch {
        // localStorage unavailable: defaults apply.
      }
    }
  }

  private setNarrow(narrow: boolean): void {
    this.isNarrow = narrow
    // Entering narrow mode hides the drawer; leaving it restores the pane.
    this.editorOpen = !narrow
  }

  toggleEditor(): void {
    this.editorOpen = !this.editorOpen
  }

  setEditorWidth(width: number): void {
    const max = Math.round(window.innerWidth * EDITOR_MAX_RATIO)
    this.editorWidth = Math.min(Math.max(width, EDITOR_MIN), max)
    try {
      localStorage.setItem(EDITOR_WIDTH_KEY, String(this.editorWidth))
    } catch {
      // Best-effort persistence only.
    }
  }
}
