import { useRecordingStore } from '@/stores/recordingStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { MicrophoneSelector } from '@/components/MicrophoneSelector'
import { useSettings } from '@/lib/useSettings'
import { cn } from '@/lib/utils'
import { Folder, Mic, CheckCircle2, XCircle } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useState } from 'react'
import { validateAndSanitizeUrl } from '../../shared/urlUtils'

interface UrlValidationState {
  validated: boolean
  valid: boolean
  error?: string
  sanitized?: string
}

export function SettingsPanel() {
  const {
    startUrl, setStartUrl, outputPath, setOutputPath,
    isVoiceEnabled, setVoiceEnabled, status, selectedMicrophoneId, setSelectedMicrophoneId
  } = useRecordingStore(useShallow((state) => ({
    startUrl: state.startUrl,
    setStartUrl: state.setStartUrl,
    outputPath: state.outputPath,
    setOutputPath: state.setOutputPath,
    isVoiceEnabled: state.isVoiceEnabled,
    setVoiceEnabled: state.setVoiceEnabled,
    status: state.status,
    selectedMicrophoneId: state.selectedMicrophoneId,
    setSelectedMicrophoneId: state.setSelectedMicrophoneId,
  })))

  const isDisabled = status === 'recording' || status === 'processing'

  // Use shared settings hook for centralized settings management
  const { updatePreferences, updateMicrophoneSettings } = useSettings()

  // URL validation state
  const [urlValidation, setUrlValidation] = useState<UrlValidationState>({
    validated: false,
    valid: false
  })

  // Update startUrl with automatic persistence
  const handleStartUrlChange = async (url: string) => {
    setStartUrl(url)
    await updatePreferences({ startUrl: url })
    // Reset validation state when user types
    setUrlValidation({ validated: false, valid: false })
  }

  // Validate URL on blur
  const handleUrlBlur = () => {
    if (!startUrl.trim()) {
      // Don't validate empty URLs
      setUrlValidation({ validated: false, valid: false })
      return
    }

    const result = validateAndSanitizeUrl(startUrl)
    setUrlValidation({
      validated: true,
      valid: result.valid,
      error: result.userFriendlyError || result.error,
      sanitized: result.sanitized
    })
  }

  const handleSelectFolder = async () => {
    if (!window.electronAPI) return
    const path = await window.electronAPI.selectOutputFolder()
    if (path) {
      setOutputPath(path)
      await updatePreferences({ outputPath: path })
    }
  }

  const handleMicrophoneChange = async (deviceId: string | undefined) => {
    console.log('[SettingsPanel] Microphone changed to:', deviceId)
    setSelectedMicrophoneId(deviceId)
    await updateMicrophoneSettings({ selectedMicrophoneId: deviceId })
  }

  return (
    <div className="p-4 space-y-4 flex-1">
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Start URL
        </label>
        <div className="relative">
          <Input
            placeholder="https://example.com or example.com"
            value={startUrl}
            onChange={(e) => handleStartUrlChange(e.target.value)}
            onBlur={handleUrlBlur}
            disabled={isDisabled}
            className={cn(
              "bg-background pr-10",
              urlValidation.validated && urlValidation.valid && "border-green-500 focus-visible:ring-green-500",
              urlValidation.validated && !urlValidation.valid && "border-red-500 focus-visible:ring-red-500"
            )}
          />
          {urlValidation.validated && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {urlValidation.valid ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
            </div>
          )}
        </div>
        {urlValidation.validated && urlValidation.valid && urlValidation.sanitized && (
          <p className="text-xs text-green-600 dark:text-green-400 text-center">
            Will navigate to: {urlValidation.sanitized}
          </p>
        )}
        {urlValidation.validated && !urlValidation.valid && urlValidation.error && (
          <p className="text-xs text-red-600 dark:text-red-400">
            {urlValidation.error}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Output Folder
        </label>
        <div className="flex gap-2">
          <Input
            placeholder="Select a folder..."
            value={outputPath}
            readOnly
            disabled={isDisabled}
            className="bg-background flex-1"
          />
          <Button
            variant="secondary"
            size="icon"
            onClick={handleSelectFolder}
            disabled={isDisabled}
          >
            <Folder className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">Voice Recording</span>
        </div>
        <Switch
          checked={isVoiceEnabled}
          onCheckedChange={setVoiceEnabled}
          disabled={isDisabled}
        />
      </div>

      {isVoiceEnabled && (
        <>
          <MicrophoneSelector
            disabled={isDisabled}
            selectedDeviceId={selectedMicrophoneId}
            onDeviceChange={handleMicrophoneChange}
          />
          <p className="text-xs text-muted-foreground text-center">
            Speak your observations during recording. Audio will be transcribed locally using Whisper.
          </p>
        </>
      )}
    </div>
  )
}
