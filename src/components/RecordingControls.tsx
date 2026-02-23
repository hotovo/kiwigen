import { useRecordingStore } from '@/stores/recordingStore'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter } from '@/components/ui/dialog'
import { useSettings } from '@/lib/useSettings'
import { Play, Square, Save, Loader2, Mic, MicOff, RotateCcw, CheckCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { RecordedAction, SessionBundle, TranscriptSegment } from '@/types/session'
import { buildNarrativeWithSentenceLevelDistribution } from '../../shared/narrativeBuilder'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'

export function RecordingControls() {
  const {
    status, startUrl, outputPath, actions, transcriptSegments, isVoiceEnabled,
    audioStatus, audioChunksCount, audioError, startTime, sessionSaved, selectedMicrophoneId,
    pausedAt, pausedDurationMs,
    setStatus, setStartTime, addAction, setTranscriptSegments, setTranscriptText, reset,
    setAudioStatus, setAudioError, setSessionSaved,
    setPausedAt, setPausedDuration
  } = useRecordingStore(useShallow((state) => ({
    status: state.status,
    startUrl: state.startUrl,
    outputPath: state.outputPath,
    actions: state.actions,
    transcriptSegments: state.transcriptSegments,
    isVoiceEnabled: state.isVoiceEnabled,
    audioStatus: state.audioStatus,
    audioChunksCount: state.audioChunksCount,
    audioError: state.audioError,
    startTime: state.startTime,
    sessionSaved: state.sessionSaved,
    selectedMicrophoneId: state.selectedMicrophoneId,
    pausedAt: state.pausedAt,
    pausedDurationMs: state.pausedDurationMs,
    setStatus: state.setStatus,
    setStartTime: state.setStartTime,
    addAction: state.addAction,
    setTranscriptSegments: state.setTranscriptSegments,
    setTranscriptText: state.setTranscriptText,
    reset: state.reset,
    setAudioStatus: state.setAudioStatus,
    setAudioError: state.setAudioError,
    setSessionSaved: state.setSessionSaved,
    setPausedAt: state.setPausedAt,
    setPausedDuration: state.setPausedDuration,
  })))

  const { startAudio, stopAudio, pauseAudio, resumeAudio } = useAudioRecorder()

  const [showResetWarning, setShowResetWarning] = useState(false)

  // Use shared settings hook to reload preferences during reset
  const { reload: reloadSettings } = useSettings()

  useEffect(() => {
    if (!window.electronAPI) return
    const unsubscribe = window.electronAPI.onActionRecorded((action) => {
      addAction(action as RecordedAction)
    })
    return unsubscribe
  }, [addAction])

  // Listen for pause/resume state changes from browser widget
  useEffect(() => {
    if (!window.electronAPI) return
    const unsubscribe = window.electronAPI.onRecordingStateChanged((data) => {
      console.log('🔔 Recording state changed from widget:', data.status)
      setStatus(data.status)

      if (data.status === 'paused') {
        setPausedAt(Date.now())
        pauseAudio()
        if (window.electronAPI) void window.electronAPI.updateAudioActivity(false)
      } else if (data.status === 'recording') {
        // Accumulate paused duration
        if (pausedAt) {
          const newDuration = pausedDurationMs + (Date.now() - pausedAt)
          setPausedDuration(newDuration)
          setPausedAt(null)
        }
        resumeAudio()
        if (isVoiceEnabled && window.electronAPI) {
          void window.electronAPI.updateAudioActivity(true)
        }
      }
    })
    return unsubscribe
  }, [setStatus, setPausedAt, setPausedDuration, pausedAt, pausedDurationMs, isVoiceEnabled, pauseAudio, resumeAudio])

  const canStart = startUrl && outputPath && status === 'idle'
  const canStop = status === 'recording' || status === 'paused'
  const canSave = status === 'idle' && (actions.length > 0 || transcriptSegments.length > 0)

  const startRecording = async () => {
    console.log('🎬 startRecording() called')
    console.log('  canStart:', canStart)
    console.log('  startUrl:', startUrl)
    console.log('  outputPath:', outputPath)
    console.log('  status:', status)
    console.log('  isVoiceEnabled:', isVoiceEnabled)
    console.log('  window.electronAPI:', !!window.electronAPI)

    if (!canStart || !window.electronAPI) {
      console.error('❌ Cannot start recording - preconditions not met')
      console.error('  canStart:', canStart)
      console.error('  electronAPI available:', !!window.electronAPI)
      return
    }

    setSessionSaved(false)

    // Set start time FIRST, before any recording starts
    // This ensures audio timestamps align with action timestamps
    const recordingStartTime = Date.now()
    setStartTime(recordingStartTime)
    console.log('⏰ Recording start time set:', recordingStartTime)

    // Start audio recording FIRST (before browser) to capture everything
    let audioStarted = false
    if (isVoiceEnabled) {
      console.log('🎤 Voice recording enabled, starting audio...')
      console.log('🎤 Selected microphone ID:', selectedMicrophoneId)
      audioStarted = await startAudio(selectedMicrophoneId)
      if (!audioStarted) {
        // startAudio already set audioStatus/audioError in the store
        return
      }
      console.log('🎤 Audio recording started at:', recordingStartTime)
    } else {
      console.log('🔇 Voice recording disabled')
      if (window.electronAPI) void window.electronAPI.updateAudioActivity(false)
    }

    // Now start browser recording - pass the startTime so backend uses the same timestamp
    console.log('🌐 Starting browser recording...')
    console.log('  URL:', startUrl)
    console.log('  Output:', outputPath)
    console.log('  Start time:', recordingStartTime)

    try {
      const result = await window.electronAPI.startRecording(startUrl, outputPath, recordingStartTime)
      console.log('🌐 Browser recording result:', result)

      if (!result.success) {
        console.error('❌ Failed to start recording:', result.error)
        // Stop audio if browser failed to start
        if (audioStarted) {
          console.log('🎤 Stopping audio due to browser recording failure')
          await stopAudio()
        }
        return
      }

      console.log('✅ Recording started successfully')
      setStatus('recording')

      // Signal audio is active in the browser widget
      if (isVoiceEnabled && audioStarted) {
        await window.electronAPI.updateAudioActivity(true)
        console.log('✅ Audio activity set to true in browser')
      }
    } catch (err) {
      console.error('❌ Exception during startRecording IPC call:', err)
      if (audioStarted) {
        console.log('🎤 Stopping audio due to exception')
        await stopAudio()
      }
    }
  }


  const stopRecording = async () => {
    if (!canStop || !window.electronAPI) return

    if (window.electronAPI) void window.electronAPI.updateAudioActivity(false)
    setStatus('processing')

    await window.electronAPI.stopRecording()

    // stopAudio() stops the MediaRecorder, waits 500 ms for final chunk, cleans up stream
    const audioBlob = await stopAudio()

    if (audioBlob) {
      setAudioStatus('processing')

      const arrayBuffer = await audioBlob.arrayBuffer()

      console.log('='.repeat(60))
      console.log('🎤 Audio Recording Summary')
      console.log('='.repeat(60))
      console.log(`Total audio size: ${(arrayBuffer.byteLength / 1024).toFixed(2)} KB`)
      console.log('='.repeat(60))

      const result = await window.electronAPI.transcribeAudio(arrayBuffer)
      if (result.success && result.segments) {
        console.log('✅ Transcription successful')
        console.log(`Segments received: ${result.segments.length}`)
        result.segments.forEach((seg: TranscriptSegment, idx: number) => {
          console.log(`  [${idx + 1}] ${seg.startTime}ms -> ${seg.endTime}ms: "${seg.text}"`)
        })
        setTranscriptSegments(result.segments)
        setAudioStatus('complete')

        // Distribute voice segments across actions RIGHT AFTER transcription
        if (startTime && result.segments.length > 0) {
          console.log(`Distributing ${result.segments.length} voice segments across ${actions.length} actions...`)
          try {
            const distributionResult = await window.electronAPI.distributeVoiceSegments(
              actions,
              result.segments,
              startTime
            )
            if (distributionResult.success && distributionResult.actions) {
              console.log('Voice segments distributed successfully')

              const actionsWithVoice = distributionResult.actions

              // Generate narrative text locally for UI display using shared builder
              const narrativeText = buildNarrativeWithSentenceLevelDistribution(actionsWithVoice)
              setTranscriptText(narrativeText)
              console.log('Narrative text generated successfully for UI')

              // Update actions in store - replace entire actions array with distributed ones
              useRecordingStore.setState({ actions: actionsWithVoice })
            } else if ('success' in distributionResult && !distributionResult.success) {
              console.error('Failed to distribute voice segments:', distributionResult.error)
            }
          } catch (error) {
            console.error('Exception during voice distribution:', error)
          }
        }
      } else {
        console.error('❌ Transcription failed:', result)
        setAudioError('success' in result && !result.success ? result.error : 'Transcription failed')
        setAudioStatus('error')
      }
    } else {
      console.warn('⚠️  No audio chunks recorded')
      setAudioStatus('idle')
    }

    setStatus('idle')
  }

  const saveSession = async () => {
    if (!canSave || !window.electronAPI) return

    setStatus('saving')
    console.log('Starting session save...')

    // Distribute voice segments across actions using sophisticated algorithm
    let actionsWithVoice = actions
    if (transcriptSegments.length > 0 && startTime) {
      console.log(`Distributing ${transcriptSegments.length} voice segments across ${actions.length} actions...`)
      try {
        const result = await window.electronAPI.distributeVoiceSegments(
          actions,
          transcriptSegments,
          startTime
        )
        if (result.success && result.actions) {
          actionsWithVoice = result.actions
          console.log('Voice segments distributed successfully')
          
          // Generate narrative text locally for UI display using shared builder
          const narrativeText = buildNarrativeWithSentenceLevelDistribution(actionsWithVoice)
          setTranscriptText(narrativeText)
          console.log('Narrative text generated successfully for UI')
        } else if ('success' in result && !result.success) {
          console.error('Failed to distribute voice segments:', result.error)
        }
      } catch (error) {
        console.error('Exception during voice distribution:', error)
        // Continue with original actions if distribution fails
      }
    }

    // Create simplified session bundle with just actions and startTime
    const session: SessionBundle = {
      actions: actionsWithVoice,
      startTime: startTime || Date.now(),
    }

    console.log('Saving session bundle...')
    const result = await window.electronAPI.saveSession(session)
    
    if (result.success) {
      console.log('Session saved successfully to:', result.path)
      setSessionSaved(true)
    } else {
      console.error('Failed to save session:', 'success' in result ? result.error : 'Unknown error')
    }

    setStatus('idle')
  }

  const resetSession = async () => {
    if (!window.electronAPI) return

    // Show warning if session hasn't been saved
    if (!sessionSaved && (actions.length > 0 || transcriptSegments.length > 0)) {
      setShowResetWarning(true)
      return
    }

    // Save current voice settings
    const currentVoiceEnabled = isVoiceEnabled
    
    // Reset the recording state
    reset()

    // Restore voice enabled state
    useRecordingStore.getState().setVoiceEnabled(currentVoiceEnabled)

    // Reload all saved preferences (URL, output path, microphone settings)
    await reloadSettings()
  }

  const confirmReset = async () => {
    setShowResetWarning(false)
    
    // Save current voice settings
    const currentVoiceEnabled = isVoiceEnabled
    
    // Reset the recording state
    reset()

    // Restore voice enabled state
    useRecordingStore.getState().setVoiceEnabled(currentVoiceEnabled)

    // Reload all saved preferences (URL, output path, microphone settings)
    await reloadSettings()
  }

  const cancelReset = () => {
    setShowResetWarning(false)
  }

  const renderAudioStatus = () => {
    if (!isVoiceEnabled) return null

    if (status === 'recording' && audioStatus === 'recording') {
      return (
        <div className="flex items-center justify-center text-xs bg-red-500/10 text-red-400 px-3 py-2 rounded-md">
          <div className="flex items-center gap-2">
            <Mic className="h-3.5 w-3.5 animate-pulse" />
            <span>Recording audio</span>
            <span className="font-mono">{audioChunksCount}s</span>
          </div>
        </div>
      )
    }

    if (audioStatus === 'processing') {
      return (
        <div className="flex items-center justify-center text-xs bg-amber-500/10 text-amber-400 px-3 py-2 rounded-md">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Transcribing audio...</span>
          </div>
        </div>
      )
    }

    if (audioStatus === 'complete' && transcriptSegments.length > 0) {
      return (
        <div className="flex items-center justify-center text-xs bg-emerald-500/10 text-emerald-400 px-3 py-2 rounded-md">
          <div className="flex items-center gap-2">
            <Mic className="h-3.5 w-3.5" />
            <span>{transcriptSegments.length} voice segment{transcriptSegments.length !== 1 ? 's' : ''} transcribed</span>
          </div>
        </div>
      )
    }

    if (audioStatus === 'error') {
      return (
        <div className="flex items-center justify-center text-xs bg-red-500/10 text-red-400 px-3 py-2 rounded-md">
          <div className="flex items-center gap-2">
            <MicOff className="h-3.5 w-3.5" />
            <span>{audioError || 'Audio error'}</span>
          </div>
        </div>
      )
    }

    return null
  }

  return (
    <>
      <Dialog
        open={showResetWarning}
        onOpenChange={setShowResetWarning}
        title="Unsaved Session"
        description="You have unsaved changes. Are you sure you want to reset? This will clear all recorded actions and cannot be undone."
      >
        <DialogFooter>
          <Button variant="outline" onClick={cancelReset}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirmReset}>
            Reset Anyway
          </Button>
        </DialogFooter>
      </Dialog>

      <div className="p-4 border-t border-border space-y-3">
        {renderAudioStatus()}

        {status === 'idle' && transcriptSegments.length > 0 && actions.length === 0 && (
          <p className="text-xs text-center text-muted-foreground">
            No browser actions recorded. Only voice commentary captured.
          </p>
        )}

      {status === 'idle' && actions.length === 0 && (
        <Button
          className="w-full"
          size="lg"
          onClick={startRecording}
          disabled={!canStart}
        >
          <Play className="h-4 w-4 mr-2" />
          Start Recording
        </Button>
      )}

      {(status === 'recording' || status === 'paused') && (
        <div className="space-y-2">
          {status === 'paused' && (
            <p className="text-xs text-center text-muted-foreground">
              Recording paused. Use the browser widget to resume.
            </p>
          )}
          <Button
            className="w-full"
            size="lg"
            variant="destructive"
            onClick={stopRecording}
          >
            <Square className="h-4 w-4 mr-2" /> Stop Recording
          </Button>
        </div>
      )}

      {status === 'processing' && (
        <Button className="w-full" size="lg" disabled>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          {audioStatus === 'processing' ? 'Transcribing...' : 'Processing...'}
        </Button>
      )}

      {status === 'saving' && (
        <Button className="w-full" size="lg" disabled>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Saving...
        </Button>
      )}

      {status === 'idle' && (actions.length > 0 || transcriptSegments.length > 0) && (
        <div className="space-y-2">
          <Button
            className="w-full"
            size="lg"
            variant={sessionSaved ? "outline" : "success"}
            onClick={saveSession}
            disabled={sessionSaved}
          >
            {sessionSaved ? (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Session Saved
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Session
              </>
            )}
          </Button>
          <Button
            className="w-full"
            size="lg"
            variant="outline"
            onClick={resetSession}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
        </div>
      )}

      {!startUrl && (
        <p className="text-xs text-center text-muted-foreground">
          Enter a URL to start recording
        </p>
      )}
      {startUrl && !outputPath && (
        <p className="text-xs text-center text-muted-foreground">
          Select an output folder
        </p>
      )}
      </div>
    </>
  )
}
