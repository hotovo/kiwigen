import { RecordingControls } from '@/components/RecordingControls'
import { ActionsList } from '@/components/ActionsList'
import { SettingsPanel } from '@/components/SettingsPanel'
import { StatusBar } from '@/components/StatusBar'
import { DebugInfoWidget } from '@/components/DebugInfoWidget'
import { TitleBar } from '@/components/TitleBar'
import { TranscriptView } from '@/components/TranscriptView'
import { RuntimeSetupGate } from '@/components/RuntimeSetupGate'
import { useRecordingStore } from '@/stores/recordingStore'
import { FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { RuntimeDependencyStatus, RuntimeInstallProgress } from '../shared/types'

export default function App() {
  const { status, actions, transcriptText, transcriptSegments, isTranscriptViewOpen, setTranscriptViewOpen } = useRecordingStore(
    useShallow((state) => ({
      status: state.status,
      actions: state.actions,
      transcriptText: state.transcriptText,
      transcriptSegments: state.transcriptSegments,
      isTranscriptViewOpen: state.isTranscriptViewOpen,
      setTranscriptViewOpen: state.setTranscriptViewOpen,
    }))
  )
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeDependencyStatus | null>(null)
  const [runtimeProgress, setRuntimeProgress] = useState<RuntimeInstallProgress | null>(null)
  const [runtimeLoading, setRuntimeLoading] = useState(true)
  const [runtimeInstallError, setRuntimeInstallError] = useState<string | null>(null)

  const canViewTranscript = status === 'idle' && (transcriptText || transcriptSegments.length > 0)

  const loadRuntimeStatus = async () => {
    if (!window.electronAPI) {
      setRuntimeStatus({
        state: 'ready',
        ready: true,
        platform: 'web',
        dependencies: [],
        runtimeRoot: 'n/a',
      })
      setRuntimeLoading(false)
      return
    }

    setRuntimeLoading(true)
    const result = await window.electronAPI.getRuntimeDependencyStatus()
    if (result.success && result.status) {
      setRuntimeStatus(result.status)
      setRuntimeInstallError(null)
    } else if ('success' in result && !result.success) {
      setRuntimeInstallError(result.error)
    }
    setRuntimeLoading(false)
  }

  useEffect(() => {
    void loadRuntimeStatus()

    if (!window.electronAPI) {
      return
    }

    const unsubscribe = window.electronAPI.onRuntimeDependencyProgress((progress) => {
      setRuntimeProgress(progress)
      if (progress.phase === 'error') {
        setRuntimeInstallError(progress.message)
      }
    })

    return unsubscribe
  }, [])

  const installRuntimeDependencies = async () => {
    if (!window.electronAPI) {
      return
    }

    setRuntimeInstallError(null)
    setRuntimeProgress({ phase: 'checking', message: 'Starting install...' })

    const result = await window.electronAPI.installRuntimeDependencies()
    if (result.success && result.status) {
      setRuntimeStatus(result.status)
      return
    }

    if ('success' in result && !result.success) {
      setRuntimeInstallError(result.error)
    }
    await loadRuntimeStatus()
  }

  const cancelRuntimeInstall = async () => {
    if (!window.electronAPI) {
      return
    }
    await window.electronAPI.cancelRuntimeDependencyInstall()
    await loadRuntimeStatus()
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden select-none">
      <TitleBar />

      {runtimeStatus?.ready ? (
        <>
          <header className="flex-shrink-0 border-b border-border bg-card px-4 py-2">
            <div className="flex items-center justify-between">
              <StatusBar />
              <DebugInfoWidget />
            </div>
          </header>

          <main className="flex-1 flex overflow-hidden">
            <aside className="w-80 border-r border-border bg-card flex flex-col flex-shrink-0">
              <SettingsPanel />
              <RecordingControls />
            </aside>

            {isTranscriptViewOpen ? (
              <section className="flex-1 flex overflow-hidden bg-background">
                <div className="flex-1 min-w-0 border-r border-border bg-background flex flex-col">
                  <div className="flex-shrink-0 px-4 py-3 border-b border-border flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-medium text-foreground">Recorded Actions</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {actions.length === 0 ? 'No browser actions recorded' : 'Click on transcript to highlight actions'}
                      </p>
                    </div>
                  </div>
                  <ActionsList />
                </div>
                <TranscriptView />
              </section>
            ) : (
              <section className="flex-1 flex flex-col overflow-hidden bg-background">
                <div className="flex-shrink-0 px-4 py-3 border-b border-border flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-medium text-foreground">Recorded Actions</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {status === 'recording' ? 'Recording in progress...' :
                        status === 'idle' && transcriptSegments.length > 0 && actions.length === 0 ?
                          'No browser actions recorded. Only voice commentary available.' :
                          'Actions will appear here during recording'}
                    </p>
                  </div>
                  {canViewTranscript && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setTranscriptViewOpen(true)}
                      className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      <FileText className="h-4 w-4" />
                      View transcript
                    </Button>
                  )}
                </div>
                <ActionsList />
              </section>
            )}
          </main>
        </>
      ) : (
        <RuntimeSetupGate
          status={runtimeStatus}
          progress={runtimeProgress}
          loading={runtimeLoading}
          installError={runtimeInstallError}
          onInstall={() => void installRuntimeDependencies()}
          onCancel={() => void cancelRuntimeInstall()}
          onRefresh={() => void loadRuntimeStatus()}
        />
      )}
    </div>
  )
}
