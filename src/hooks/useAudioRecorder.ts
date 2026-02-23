/**
 * useAudioRecorder
 *
 * Encapsulates all MediaRecorder / getUserMedia lifecycle logic that was
 * previously inlined in RecordingControls.tsx.
 *
 * Responsibilities:
 *  - Microphone permission check
 *  - Device validation with automatic fallback to default
 *  - getUserMedia with fallback
 *  - MediaRecorder start / pause / resume / stop
 *  - Audio stream cleanup
 *  - AudioContext / AnalyserNode for audio-activity monitoring
 *
 * State is stored in the Zustand recording store so that other components
 * (e.g. StatusBar) can read audioStatus / audioError / audioChunksCount
 * without prop drilling.
 */
import { useRef, useCallback } from 'react'
import { useRecordingStore } from '@/stores/recordingStore'
import {
  AUDIO_SAMPLE_RATE,
  AUDIO_BITS_PER_SECOND,
  AUDIO_MIME_TYPE,
  AUDIO_CHUNK_INTERVAL_MS,
  AUDIO_STOP_DELAY_MS,
} from '../../shared/constants'

export interface UseAudioRecorderReturn {
  /** Start capturing audio from the given device (or default). Returns false on failure. */
  startAudio: (deviceId?: string) => Promise<boolean>
  /** Stop capturing, return the recorded Blob (or null if nothing was captured). */
  stopAudio: () => Promise<Blob | null>
  /** Pause the MediaRecorder (does not stop the stream). */
  pauseAudio: () => void
  /** Resume a paused MediaRecorder. */
  resumeAudio: () => void
  /** Stop audio-activity monitoring (AudioContext / AnalyserNode). */
  cleanupAudioMonitoring: () => void
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)

  // Zustand store setters
  const setAudioStatus = useRecordingStore((s) => s.setAudioStatus)
  const setAudioError = useRecordingStore((s) => s.setAudioError)
  const incrementAudioChunks = useRecordingStore((s) => s.incrementAudioChunks)
  const setSelectedMicrophoneId = useRecordingStore((s) => s.setSelectedMicrophoneId)

  const cleanupAudioMonitoring = useCallback(() => {
    if (audioContextRef.current) {
      void audioContextRef.current.close()
      audioContextRef.current = null
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect()
      analyserRef.current = null
    }
    if (window.electronAPI) {
      void window.electronAPI.updateAudioActivity(false)
    }
  }, [])

  const cleanupStream = useCallback(() => {
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop())
      audioStreamRef.current = null
    }
  }, [])

  /**
   * Acquire an audio stream with automatic device fallback.
   * Returns the stream or null on failure.
   */
  const acquireStream = useCallback(
    async (deviceId?: string): Promise<MediaStream | null> => {
      const audioConstraints = (id?: string): MediaStreamConstraints => ({
        audio: {
            deviceId: id ? { exact: id } : undefined,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: AUDIO_SAMPLE_RATE,
          },
      })

      // Validate device still exists (avoids confusing browser errors)
      if (deviceId) {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const deviceExists = devices.some((d) => d.deviceId === deviceId)
        if (!deviceExists) {
          console.warn('⚠️  Selected microphone not found, falling back to default')
          setAudioError('Selected microphone not available, using default')
          setSelectedMicrophoneId(undefined)
          if (window.electronAPI) {
            await window.electronAPI.updateMicrophoneSettings({ selectedMicrophoneId: undefined })
          }
          deviceId = undefined
        }
      }

      // Primary attempt
      try {
        return await navigator.mediaDevices.getUserMedia(audioConstraints(deviceId))
      } catch (primaryErr) {
        console.error('❌ Failed to get stream with selected device:', primaryErr)

        // Fallback to default only when a specific device was requested
        if (deviceId) {
          console.warn('🔄 Falling back to default microphone...')
          try {
            const fallbackStream = await navigator.mediaDevices.getUserMedia(
              audioConstraints(undefined)
            )
            setAudioError(null)
            console.log('✅ Fallback to default device succeeded')
            return fallbackStream
          } catch (fallbackErr) {
            console.error('❌ Fallback to default device also failed:', fallbackErr)
            const msg =
              fallbackErr instanceof Error ? fallbackErr.message : 'Failed to access any microphone'
            setAudioError(msg)
            setAudioStatus('error')
            return null
          }
        }

        // No device ID → no fallback possible
        const msg =
          primaryErr instanceof Error ? primaryErr.message : 'Failed to access microphone'
        setAudioError(msg)
        setAudioStatus('error')
        return null
      }
    },
    [setAudioError, setAudioStatus, setSelectedMicrophoneId]
  )

  const startAudio = useCallback(
    async (deviceId?: string): Promise<boolean> => {
      setAudioError(null)

      // Permission check
      if (!window.electronAPI) return false
      const permResult = await window.electronAPI.checkMicrophonePermission()
      console.log('🎤 Microphone permission result:', permResult)
      if (!permResult.granted) {
        console.error('❌ Microphone permission denied')
        setAudioError('Microphone permission denied')
        setAudioStatus('error')
        if (window.electronAPI) void window.electronAPI.updateAudioActivity(false)
        return false
      }

      const stream = await acquireStream(deviceId)
      if (!stream) return false

      audioStreamRef.current = stream
      audioChunksRef.current = []

      try {
        mediaRecorderRef.current = new MediaRecorder(stream, {
            mimeType: AUDIO_MIME_TYPE,
            audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
          })
      } catch (err) {
        console.error('❌ Failed to create MediaRecorder:', err)
        setAudioError(err instanceof Error ? err.message : 'Failed to create audio recorder')
        setAudioStatus('error')
        cleanupStream()
        return false
      }

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data)
          incrementAudioChunks()
        }
      }

      mediaRecorderRef.current.start(AUDIO_CHUNK_INTERVAL_MS)
      setAudioStatus('recording')
      console.log('🎤 Audio recording started')
      return true
    },
    [acquireStream, cleanupStream, incrementAudioChunks, setAudioError, setAudioStatus]
  )

  const stopAudio = useCallback(async (): Promise<Blob | null> => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop())
    }

    // Give the browser a moment to flush the final chunk
    await new Promise<void>((resolve) => setTimeout(resolve, AUDIO_STOP_DELAY_MS))

    const chunks = audioChunksRef.current
    const blob =
      chunks.length > 0 ? new Blob(chunks, { type: 'audio/webm' }) : null

    mediaRecorderRef.current = null
    audioChunksRef.current = []

    cleanupAudioMonitoring()
    cleanupStream()

    return blob
  }, [cleanupAudioMonitoring, cleanupStream])

  const pauseAudio = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === 'recording'
    ) {
      mediaRecorderRef.current.pause()
      console.log('🎤 Audio recording paused')
    }
  }, [])

  const resumeAudio = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === 'paused'
    ) {
      mediaRecorderRef.current.resume()
      console.log('🎤 Audio recording resumed')
    }
  }, [])

  return {
    startAudio,
    stopAudio,
    pauseAudio,
    resumeAudio,
    cleanupAudioMonitoring,
  }
}
