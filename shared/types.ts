export type LocatorStrategy = 
  | 'testId'
  | 'id'
  | 'role'
  | 'placeholder'
  | 'text'
  | 'css'
  | 'xpath'

export interface Locator {
  strategy: LocatorStrategy
  value: string
  confidence: 'high' | 'medium' | 'low'
}

export interface ElementTarget {
  selector: string
  locators: Locator[]
  role?: string
  name?: string
  testId?: string
  xpath?: string
  css?: string
  text?: string
  placeholder?: string
  tagName?: string
  innerText?: string
  attributes?: Record<string, string>
  boundingBox?: {
    x: number
    y: number
    width: number
    height: number
  }
}

export interface RecordedAction {
  id: string
  timestamp: number
  type: 'click' | 'fill' | 'navigate' | 'keypress' | 'select' | 'check' | 'scroll' | 'assert' | 'screenshot'
  target?: ElementTarget
  value?: string
  url?: string
  key?: string
  screenshot?: string
  voiceSegments?: TranscriptSegment[]
}

export interface TranscriptSegment {
  id: string
  startTime: number
  endTime: number
  text: string
}

/**
 * Simplified session bundle for saving recordings.
 * Only contains the actions array and start time - everything else is derived.
 */
export interface SessionBundle {
  actions: RecordedAction[]
  startTime: number
}

/**
 * Format types for session output
 */

export interface MetadataV2 {
  formatVersion: "2.0"
  generatedBy: string
  sessionId: string
  startTime: number
  startTimeISO: string
  duration: string
  startUrl?: string
  totalActions: number
  actionTypes: Record<string, number>
}

export interface NarrativeSection {
  text: string
  note: string
}

export interface ActionsJsonV2 {
  _meta: MetadataV2
  narrative: NarrativeSection
  actions: Omit<RecordedAction, 'voiceSegments'>[]
}

export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'processing' | 'saving'

export type ActionType = RecordedAction['type']

export interface IpcResultSuccess<T = object> {
  success: true
  data?: T
}

export interface IpcResultError {
  success: false
  error: string
}

export type IpcResult<T = object> = (IpcResultSuccess<T> & T) | IpcResultError
