import type { RuntimeDependencyId } from '../../shared/types'

export type RuntimePlatform = 'darwin-arm64' | 'win32-x64'

export interface RuntimeArtifactSpec {
  id: RuntimeDependencyId
  version: string
  url: string
  sha256: string
  type: 'file' | 'zip'
  targetPath: string
  executable?: boolean
}

export interface RuntimeManifest {
  manifestVersion: number
  platforms: Record<RuntimePlatform, { artifacts: RuntimeArtifactSpec[] }>
}

// NOTE: URLs/SHA256 are intentionally empty until runtime assets are published.
// The app can still migrate from legacy bundled assets during transition releases.
export const runtimeManifest: RuntimeManifest = {
  manifestVersion: 1,
  platforms: {
    'darwin-arm64': {
      artifacts: [
        {
          id: 'whisper-model',
          version: 'small.en-2026-02-25',
          url: '',
          sha256: '',
          type: 'file',
          targetPath: 'models/ggml-small.en.bin',
        },
        {
          id: 'whisper-binary',
          version: 'whispercpp-2026-02-25',
          url: '',
          sha256: '',
          type: 'file',
          targetPath: 'models/unix/whisper',
          executable: true,
        },
        {
          id: 'playwright-chromium',
          version: 'chromium-1200',
          url: '',
          sha256: '',
          type: 'zip',
          targetPath: 'playwright-browsers',
        },
      ],
    },
    'win32-x64': {
      artifacts: [
        {
          id: 'whisper-model',
          version: 'small.en-2026-02-25',
          url: '',
          sha256: '',
          type: 'file',
          targetPath: 'models/ggml-small.en.bin',
        },
        {
          id: 'whisper-binary',
          version: 'whispercpp-2026-02-25',
          url: '',
          sha256: '',
          type: 'file',
          targetPath: 'models/win/whisper-cli.exe',
        },
        {
          id: 'playwright-chromium',
          version: 'chromium-1200',
          url: '',
          sha256: '',
          type: 'zip',
          targetPath: 'playwright-browsers',
        },
      ],
    },
  },
}
