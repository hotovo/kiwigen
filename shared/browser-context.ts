/**
 * Shared type definitions for the Dodo Recorder browser context.
 *
 * This interface describes the globals that the Electron main process injects
 * into the recorded browser page via `page.exposeFunction()` and
 * `page.evaluate()`.  It is used for type safety in:
 *   - electron/browser/recorder.ts (Node side, page.evaluate calls)
 *   - electron/browser/injected-script.ts (browser side, local interface copy)
 *   - electron/browser/recording-widget.ts (browser side, local interface copy)
 *   - electron/browser/hover-highlighter.ts (browser side, local interface copy)
 *
 * NOTE: The browser-injected scripts (injected-script, recording-widget,
 * hover-highlighter) are serialised as strings and cannot import this module
 * at runtime.  They maintain a local `interface DodoWindow` that must stay in
 * sync with the canonical definition here.
 */
export interface DodoWindow extends Window {
  /** Records a user action.  Payload is a JSON-serialised partial RecordedAction. */
  __dodoRecordAction?: (data: string) => void
  /** Captures a screenshot and returns the filename, or null on failure. */
  __dodoTakeScreenshot?: () => Promise<string | null>
  /** Returns whether assertion mode is currently active. */
  __dodoAssertionMode?: () => boolean
  /** Disables assertion mode. */
  __dodoDisableAssertionMode?: () => void
  /** Whether audio recording is currently active. */
  __dodoAudioActive?: boolean
  /** Whether the recording session is currently paused. */
  __dodoRecordingPaused?: boolean
  /** Session token — must be passed to pause/resume calls to prevent spoofing. */
  __dodoSessionToken?: string
  /** Pauses the current recording session. Requires the session token. */
  __dodoPauseRecording?: (token: string) => Promise<void>
  /** Resumes the current recording session. Requires the session token. */
  __dodoResumeRecording?: (token: string) => Promise<void>
  /** Factory function injected by recorder.ts for lazy widget creation. */
  __dodoCreateWidget?: () => void
  /** Factory function injected by recorder.ts for lazy highlighter creation. */
  __dodoCreateHighlighter?: () => void
  /** Shows the audio equalizer animation in the widget. */
  __dodoShowEqualizer?: () => void
  /** Hides the audio equalizer animation in the widget. */
  __dodoHideEqualizer?: () => void
}
