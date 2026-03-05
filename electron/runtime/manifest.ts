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

const RELEASE_TAG = 'v0.4.0'
const RELEASE_BASE = `https://github.com/hotovo/kiwigen/releases/download/${RELEASE_TAG}`

export const runtimeManifest: RuntimeManifest = {
  manifestVersion: 1,
  platforms: {
    'darwin-arm64': {
      artifacts: [
        {
          id: 'whisper-model',
          version: 'small.en-0.4.0',
          url: `${RELEASE_BASE}/kiwigen-runtime-whisper-model-small.en.bin`,
          sha256: 'c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d',
          type: 'file',
          targetPath: 'models/ggml-small.en.bin',
        },
        {
          id: 'whisper-binary',
          version: 'whispercpp-0.4.0',
          url: `${RELEASE_BASE}/kiwigen-runtime-whisper-binary-darwin-arm64`,
          sha256: '3cc8df8150d57f0f2e82d7ef929985ded2dd71e2fcc7bff704d70ee157ccb3b6',
          type: 'file',
          targetPath: 'models/unix/whisper',
          executable: true,
        },
        {
          id: 'playwright-chromium',
          version: 'chromium-1208',
          url: `${RELEASE_BASE}/kiwigen-runtime-playwright-darwin-arm64-chromium-1208.zip`,
          sha256: '2c179f2e76e998c6b57a61696ea99470052b84f6ec9f4098f0ed315f9f96fda4',
          type: 'zip',
          targetPath: 'playwright-browsers',
        },
      ],
    },
    'win32-x64': {
      artifacts: [
        {
          id: 'whisper-model',
          version: 'small.en-0.4.0',
          url: `${RELEASE_BASE}/kiwigen-runtime-whisper-model-small.en.bin`,
          sha256: 'c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d',
          type: 'file',
          targetPath: 'models/ggml-small.en.bin',
        },
        {
          id: 'whisper-binary',
          version: 'whispercpp-0.4.0',
          url: `${RELEASE_BASE}/kiwigen-runtime-whisper-binary-win32-x64.zip`,
          sha256: 'PLACEHOLDER_UPDATE_AFTER_PACKAGING',
          type: 'zip',
          targetPath: 'models/win',
        },
        {
          id: 'playwright-chromium',
          version: 'chromium-1200',
          url: `${RELEASE_BASE}/kiwigen-runtime-playwright-win32-x64-chromium-1200.zip`,
          sha256: 'de952108e8f709a68317cf8b1081a2df1e1b5d6af6ef45e458540a9f6c9c2891',
          type: 'zip',
          targetPath: 'playwright-browsers',
        },
      ],
    },
  },
}
