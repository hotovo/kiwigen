import { ipcMain, BrowserWindow } from 'electron'
import { BrowserRecorder } from '../browser/recorder'
import { SessionWriter } from '../session/writer'
import { Transcriber } from '../audio/transcriber'
import { handleIpc, ipcError } from '../utils/ipc'
import {
  validateUrl,
  validateOutputPath,
  validateAudioBuffer,
  validateRecordedActionsArray,
  validateTranscriptSegmentsArray,
} from '../utils/validation'
import { distributeVoiceSegments, generateFullTranscript } from '../utils/voiceDistribution'
import { getSettingsStore } from '../settings/store'
import { logger } from '../utils/logger'

let browserRecorder: BrowserRecorder | null = null
let transcriber: Transcriber | null = null
let sessionWriter: SessionWriter | null = null
let isRecording = false

/**
 * Register recording-related IPC handlers
 */
export function registerRecordingHandlers(mainWindow: BrowserWindow | null) {
  ipcMain.handle('start-recording', async (_, startUrl: string, outputPath: string, startTime: number) => {
    // Check if already recording
    if (isRecording) {
      return ipcError('Recording already in progress')
    }

    const urlValidation = validateUrl(startUrl)
    if (!urlValidation.valid) {
      return ipcError(urlValidation.error, 'URL validation failed')
    }

    const pathValidation = validateOutputPath(outputPath)
    if (!pathValidation.valid) {
      return ipcError(pathValidation.error, 'Path validation failed')
    }

    return handleIpc(async () => {
      isRecording = true
      
      try {
        const settings = getSettingsStore()
        const whisperTimeout = settings.getWhisperTimeout()
        
        // Generate session ID for screenshot directory using the startTime from frontend
        // This ensures the screenshot directory matches the session directory created during save
        const date = new Date(startTime)
        const sessionId = date.toISOString()
          .replace(/T/, '-')
          .replace(/:/g, '')
          .split('.')[0] // Remove milliseconds
        const screenshotDir = `${outputPath}/session-${sessionId}/screenshots`
        
        browserRecorder = new BrowserRecorder()
        sessionWriter = new SessionWriter(outputPath)
        transcriber = new Transcriber(whisperTimeout)

        browserRecorder.on('action', (action) => {
          // Check if window and webContents are still valid before sending
          if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
            mainWindow.webContents.send('action-recorded', action)
          }
        })

        browserRecorder.on('paused', () => {
          if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
            mainWindow.webContents.send('recording-state-changed', { status: 'paused' })
            logger.debug('Forwarded paused event to renderer')
          }
        })

        browserRecorder.on('resumed', () => {
          if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
            mainWindow.webContents.send('recording-state-changed', { status: 'recording' })
            logger.debug('Forwarded resumed event to renderer')
          }
        })

        await browserRecorder.start(startUrl, screenshotDir)
        await transcriber.initialize()

        return {}
      } catch (error) {
        // Cleanup on failure
        await browserRecorder?.stop()
        browserRecorder = null
        sessionWriter = null
        transcriber = null
        isRecording = false
        throw error
      }
    }, 'Failed to start recording')
  })

  ipcMain.handle('stop-recording', async () => {
    if (!isRecording) {
      return ipcError('No recording in progress')
    }

    return handleIpc(async () => {
      const actions = browserRecorder?.getActions() || []
      
      // Remove event listeners to prevent memory leaks
      if (browserRecorder) {
        browserRecorder.removeAllListeners()
      }
      
      await browserRecorder?.stop()
      browserRecorder = null
      isRecording = false
      return { actions }
    }, 'Failed to stop recording')
  })

  ipcMain.handle('pause-recording', async () => {
    if (!isRecording || !browserRecorder) {
      return ipcError('No recording in progress')
    }

    return handleIpc(async () => {
      try {
        await browserRecorder!.pause()
        return {}
      } catch (error) {
        if (error instanceof Error) {
          return ipcError(error.message)
        }
        return ipcError('Failed to pause recording')
      }
    }, 'Failed to pause recording')
  })

  ipcMain.handle('resume-recording', async () => {
    if (!isRecording || !browserRecorder) {
      return ipcError('No recording in progress')
    }

    return handleIpc(async () => {
      try {
        await browserRecorder!.resume()
        return {}
      } catch (error) {
        if (error instanceof Error) {
          return ipcError(error.message)
        }
        return ipcError('Failed to resume recording')
      }
    }, 'Failed to resume recording')
  })

  ipcMain.handle('update-audio-activity', async (_event, active: boolean) => {
    if (browserRecorder) {
      await browserRecorder.updateAudioActivity(active)
    }
  })

  ipcMain.handle('transcribe-audio', async (_, audioBuffer: ArrayBuffer) => {
    const bufferValidation = validateAudioBuffer(audioBuffer)
    if (!bufferValidation.valid) {
      return ipcError(bufferValidation.error, 'Audio validation failed')
    }

    return handleIpc(async () => {
      if (!transcriber) {
        const settings = getSettingsStore()
        const whisperTimeout = settings.getWhisperTimeout()
        transcriber = new Transcriber(whisperTimeout)
        await transcriber.initialize()
      }
      const segments = await transcriber.transcribe(Buffer.from(audioBuffer))
      return { segments }
    }, 'Failed to transcribe audio')
  })

  ipcMain.handle('distribute-voice-segments', async (
    _,
    actions: unknown,
    segments: unknown,
    startTime: unknown
  ) => {
    if (!validateRecordedActionsArray(actions)) {
      return ipcError('Invalid actions array structure')
    }
    
    if (!validateTranscriptSegmentsArray(segments)) {
      return ipcError('Invalid transcript segments array structure')
    }
    
    if (typeof startTime !== 'number') {
      return ipcError('Invalid startTime: must be a number')
    }
    
    logger.info(`[IPC] Distributing ${segments.length} voice segments across ${actions.length} actions`)
    return handleIpc(async () => {
      const actionsWithVoice = distributeVoiceSegments(actions, segments, startTime)
      logger.info(`[IPC] Distribution complete, ${actionsWithVoice.length} actions with voice`)
      return { actions: actionsWithVoice }
    }, 'Failed to distribute voice segments')
  })

  ipcMain.handle('generate-full-transcript', async (_, segments: unknown) => {
    if (!validateTranscriptSegmentsArray(segments)) {
      return ipcError('Invalid transcript segments array structure')
    }
    
    return handleIpc(async () => {
      const transcript = generateFullTranscript(segments)
      return { transcript }
    }, 'Failed to generate transcript')
  })
}

/**
 * Get the session writer instance
 */
export function getSessionWriter(): SessionWriter | null {
  return sessionWriter
}
