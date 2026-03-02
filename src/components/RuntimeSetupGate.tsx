import { Button } from '@/components/ui/button'
import type { RuntimeDependencyStatus, RuntimeInstallProgress } from '../../shared/types'
import { AlertCircle, CheckCircle2, Download } from 'lucide-react'

interface RuntimeSetupGateProps {
  status: RuntimeDependencyStatus | null
  progress: RuntimeInstallProgress | null
  loading: boolean
  installing: boolean
  installError: string | null
  onInstall: () => void
  onCancel: () => void
  onRefresh: () => void
}

export function RuntimeSetupGate({
  status,
  progress,
  loading,
  installing,
  installError,
  onInstall,
  onCancel,
  onRefresh,
}: RuntimeSetupGateProps) {
  const isInstalling = installing || status?.state === 'installing'
  const progressDone = progress?.phase === 'done'
  const progressCancelled = progress?.phase === 'cancelled'
  const progressPct = progress?.bytesTotal && progress.bytesTotal > 0 && progress.bytesDownloaded !== undefined
    ? Math.min(100, Math.round((progress.bytesDownloaded / progress.bytesTotal) * 100))
    : null

  return (
    <div className="flex-1 bg-background relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-card via-background to-background" />
        <div className="relative h-full max-w-3xl mx-auto px-6 py-10 flex flex-col justify-center">
          <div className="border border-border rounded-xl bg-card/80 backdrop-blur-sm p-6 shadow-sm space-y-6">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">First launch setup</p>
              <h1 className="text-2xl font-semibold text-foreground">Install runtime dependencies</h1>
              <p className="text-sm text-muted-foreground">
                Dodo Recorder needs local Whisper + Chromium assets before recording can start.
              </p>
            </div>

            <div className="grid gap-2">
              {(status?.dependencies ?? []).map((dependency) => (
                <div
                  key={dependency.id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 bg-background/70"
                >
                  <div className="text-sm text-foreground">{dependency.id}</div>
                  <div className="flex h-4 w-4 items-center justify-center">
                    {dependency.ready ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : null}
                  </div>
                </div>
              ))}
            </div>

            {(progress || isInstalling) && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{progress?.message ?? 'Installing dependencies...'}</span>
                  {progressDone
                    ? <span>100%</span>
                    : progressCancelled
                      ? <span>Cancelled</span>
                      : progressPct !== null
                        ? <span>{progressPct}%</span>
                        : null}
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${progressDone ? 100 : (progressPct ?? (isInstalling ? 35 : 0))}%` }}
                  />
                </div>
              </div>
            )}

            {(installError || status?.lastError) && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5" />
                <span>{installError ?? status?.lastError}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              {isInstalling ? (
                <Button variant="destructive" onClick={onCancel}>
                  Cancel install
                </Button>
              ) : (
                <Button onClick={onInstall} disabled={loading || !status || status.ready}>
                  <Download className="h-4 w-4 mr-2" />
                  Install dependencies
                </Button>
              )}

              <Button variant="outline" onClick={onRefresh} disabled={loading || isInstalling}>
                Refresh status
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Runtime path: <span className="font-mono">{status?.runtimeRoot ?? 'Loading...'}</span>
            </p>
          </div>
        </div>
    </div>
  )
}
