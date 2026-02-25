import type {
  RecordedAction,
  SessionBundle,
  TranscriptSegment,
  IpcResult,
  RuntimeDependencyStatus,
  RuntimeInstallProgress,
} from '../../shared/types'

export interface UserPreferences {
  startUrl: string
  outputPath: string
}

export interface MicrophoneSettings {
  selectedMicrophoneId?: string
}

export interface BuildInfo {
  version: string
  commitHash: string
  commitFull: string
  branch: string
  isDirty: boolean
  buildTime: string
  nodeVersion: string
}

export interface ElectronAPI {
  selectOutputFolder: () => Promise<string | null>
  startRecording: (startUrl: string, outputPath: string, startTime: number) => Promise<IpcResult>
  stopRecording: () => Promise<IpcResult<{ actions: RecordedAction[] }>>
  pauseRecording: () => Promise<IpcResult>
  resumeRecording: () => Promise<IpcResult>
  updateAudioActivity: (active: boolean) => Promise<void>
  saveSession: (sessionData: SessionBundle) => Promise<IpcResult<{ path: string }>>
  transcribeAudio: (audioBuffer: ArrayBuffer) => Promise<IpcResult<{ segments: TranscriptSegment[] }>>
  checkMicrophonePermission: () => Promise<{ granted: boolean; denied?: boolean }>
  onActionRecorded: (callback: (action: RecordedAction) => void) => () => void
  onRecordingStateChanged: (callback: (data: { status: 'recording' | 'paused' }) => void) => () => void
  distributeVoiceSegments: (actions: RecordedAction[], segments: TranscriptSegment[], startTime: number) => Promise<IpcResult<{ actions: RecordedAction[] }>>
  generateFullTranscript: (segments: TranscriptSegment[]) => Promise<IpcResult<{ transcript: string }>>
  generateTranscriptWithReferences: (actions: RecordedAction[], sessionId: string, startTime: number, startUrl?: string) => Promise<IpcResult<{ transcript: string }>>
  getUserPreferences: () => Promise<IpcResult<{ preferences: UserPreferences }>>
  updateUserPreferences: (preferences: Partial<UserPreferences>) => Promise<IpcResult<{ preferences: UserPreferences }>>
  getMicrophoneSettings: () => Promise<IpcResult<{ settings: MicrophoneSettings }>>
  updateMicrophoneSettings: (settings: Partial<MicrophoneSettings>) => Promise<IpcResult<{ settings: MicrophoneSettings }>>
  getLogPath: () => Promise<string>
  openLogFile: () => Promise<IpcResult>
  openLogFolder: () => Promise<IpcResult>
  getBuildInfo: () => Promise<BuildInfo | null>
  getRuntimeDependencyStatus: () => Promise<IpcResult<{ status: RuntimeDependencyStatus }>>
  installRuntimeDependencies: () => Promise<IpcResult<{ status: RuntimeDependencyStatus }>>
  cancelRuntimeDependencyInstall: () => Promise<IpcResult>
  onRuntimeDependencyProgress: (callback: (progress: RuntimeInstallProgress) => void) => () => void
  minimizeWindow?: () => void
  maximizeWindow?: () => void
  closeWindow?: () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
