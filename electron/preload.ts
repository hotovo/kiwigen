import { contextBridge, ipcRenderer } from 'electron'
import type {
  RecordedAction,
  SessionBundle,
  TranscriptSegment,
  IpcResult,
  RuntimeDependencyStatus,
  RuntimeInstallProgress,
} from '../shared/types'

export interface UserPreferences {
  startUrl: string
  outputPath: string
}

export interface MicrophoneSettings {
  selectedMicrophoneId?: string
}

/**
 * Build info interface
 */
export interface BuildInfo {
  commitHash: string
  commitFull: string
  branch: string
  isDirty: boolean
  buildTime: string
  nodeVersion: string
}

/**
 * Validates that data conforms to RecordedAction interface
 */
function isValidRecordedAction(data: unknown): data is RecordedAction {
  if (!data || typeof data !== 'object') return false
  
  const action = data as Partial<RecordedAction>
  
  return (
    typeof action.id === 'string' &&
    typeof action.timestamp === 'number' &&
    typeof action.type === 'string' &&
    ['click', 'fill', 'navigate', 'keypress', 'select', 'check', 'scroll', 'assert', 'screenshot'].includes(action.type)
  )
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
  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void
}

const electronAPI: ElectronAPI = {
  selectOutputFolder: () => ipcRenderer.invoke('select-output-folder'),
  
  startRecording: (startUrl: string, outputPath: string, startTime: number) =>
    ipcRenderer.invoke('start-recording', startUrl, outputPath, startTime),
  
  stopRecording: () => ipcRenderer.invoke('stop-recording'),

  pauseRecording: () => ipcRenderer.invoke('pause-recording'),

  resumeRecording: () => ipcRenderer.invoke('resume-recording'),

  updateAudioActivity: (active: boolean) => ipcRenderer.invoke('update-audio-activity', active),
  
  saveSession: (sessionData: SessionBundle) =>
    ipcRenderer.invoke('save-session', sessionData),
  
  transcribeAudio: (audioBuffer: ArrayBuffer) =>
    ipcRenderer.invoke('transcribe-audio', audioBuffer),

  checkMicrophonePermission: () =>
    ipcRenderer.invoke('check-microphone-permission'),
  
  onActionRecorded: (callback: (action: RecordedAction) => void) => {
    const handler = (_: unknown, data: unknown) => {
      if (isValidRecordedAction(data)) {
        callback(data)
      } else {
        console.error('Invalid action data received from IPC:', data)
      }
    }
    ipcRenderer.on('action-recorded', handler)
    return () => ipcRenderer.removeListener('action-recorded', handler)
  },

  onRecordingStateChanged: (callback: (data: { status: 'recording' | 'paused' }) => void) => {
    const handler = (_: unknown, data: unknown) => {
      if (data && typeof data === 'object' && 'status' in data) {
        callback(data as { status: 'recording' | 'paused' })
      }
    }
    ipcRenderer.on('recording-state-changed', handler)
    return () => ipcRenderer.removeListener('recording-state-changed', handler)
  },

  distributeVoiceSegments: (actions: RecordedAction[], segments: TranscriptSegment[], startTime: number) =>
    ipcRenderer.invoke('distribute-voice-segments', actions, segments, startTime),

  generateFullTranscript: (segments: TranscriptSegment[]) =>
    ipcRenderer.invoke('generate-full-transcript', segments),
  
  getUserPreferences: () =>
    ipcRenderer.invoke('user-preferences-get'),

  updateUserPreferences: (preferences: Partial<UserPreferences>) =>
    ipcRenderer.invoke('user-preferences-update', preferences),

  getMicrophoneSettings: () =>
    ipcRenderer.invoke('get-microphone-settings'),

  updateMicrophoneSettings: (settings: Partial<MicrophoneSettings>) =>
    ipcRenderer.invoke('update-microphone-settings', settings),

  getLogPath: () => ipcRenderer.invoke('get-log-path'),
  openLogFile: () => ipcRenderer.invoke('open-log-file'),
  openLogFolder: () => ipcRenderer.invoke('open-log-folder'),
  getBuildInfo: () => ipcRenderer.invoke('get-build-info'),

  getRuntimeDependencyStatus: () => ipcRenderer.invoke('runtime-dependencies-status'),
  installRuntimeDependencies: () => ipcRenderer.invoke('runtime-dependencies-install'),
  cancelRuntimeDependencyInstall: () => ipcRenderer.invoke('runtime-dependencies-cancel'),
  onRuntimeDependencyProgress: (callback: (progress: RuntimeInstallProgress) => void) => {
    const handler = (_: unknown, data: unknown) => {
      if (data && typeof data === 'object' && 'phase' in data) {
        callback(data as RuntimeInstallProgress)
      }
    }
    ipcRenderer.on('runtime-dependencies-progress', handler)
    return () => ipcRenderer.removeListener('runtime-dependencies-progress', handler)
  },

  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
