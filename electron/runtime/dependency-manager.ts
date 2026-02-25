import path from 'path'
import fs from 'fs'
import https from 'https'
import { app } from 'electron'
import { EventEmitter } from 'events'
import { createHash } from 'crypto'
import { spawn } from 'child_process'
import { ensureDir } from '../utils/fs'
import { logger } from '../utils/logger'
import type {
  RuntimeDependencyEntry,
  RuntimeDependencyStatus,
  RuntimeInstallProgress,
  RuntimeDependencyId,
} from '../../shared/types'
import { runtimeManifest, type RuntimeArtifactSpec, type RuntimePlatform, type RuntimeManifest } from './manifest'

interface InstallStateFile {
  artifacts: Partial<Record<RuntimeDependencyId, { version: string; sha256: string; installedAt: string }>>
}

export interface ResolvedRuntimePaths {
  whisperModelPath: string
  whisperBinaryPath: string
  playwrightBrowsersPath: string
  playwrightExecutablePath: string
}

const INSTALL_STATE_FILENAME = 'install-state.json'

export class RuntimeDependencyManager extends EventEmitter {
  private readonly runtimeRoot: string
  private readonly installStatePath: string
  private installState: InstallStateFile = { artifacts: {} }
  private currentStatus: RuntimeDependencyStatus
  private installAbortController: AbortController | null = null
  private activeManifest: RuntimeManifest = runtimeManifest

  constructor() {
    super()
    this.runtimeRoot = path.join(app.getPath('userData'), 'runtime-deps')
    this.installStatePath = path.join(this.runtimeRoot, INSTALL_STATE_FILENAME)
    this.currentStatus = {
      state: 'needs_install',
      ready: false,
      platform: `${process.platform}-${process.arch}`,
      dependencies: [],
      runtimeRoot: this.runtimeRoot,
    }
  }

  async initialize(): Promise<void> {
    await ensureDir(this.runtimeRoot)
    await this.loadRemoteManifestIfAvailable()
    await this.loadInstallState()
    await this.tryImportLegacyBundledAssets()
    await this.refreshStatus()
  }

  getStatus(): RuntimeDependencyStatus {
    return this.currentStatus
  }

  async resolvePaths(): Promise<ResolvedRuntimePaths | null> {
    await this.refreshStatus()
    if (!this.currentStatus.ready) {
      return null
    }

    const whisperModelPath = path.join(this.runtimeRoot, 'models', 'ggml-small.en.bin')
    const whisperBinaryPath = process.platform === 'win32'
      ? path.join(this.runtimeRoot, 'models', 'win', 'whisper-cli.exe')
      : path.join(this.runtimeRoot, 'models', 'unix', 'whisper')

    const playwrightBrowsersPath = path.join(this.runtimeRoot, 'playwright-browsers')
    const playwrightExecutablePath = this.resolvePlaywrightExecutable(playwrightBrowsersPath)

    return {
      whisperModelPath,
      whisperBinaryPath,
      playwrightBrowsersPath,
      playwrightExecutablePath,
    }
  }

  cancelInstall(): void {
    this.installAbortController?.abort()
  }

  async installAll(): Promise<RuntimeDependencyStatus> {
    if (this.installAbortController) {
      return this.currentStatus
    }

    const platform = this.getRuntimePlatform()
    const artifacts = this.getArtifactsForPlatform(platform)
    this.installAbortController = new AbortController()
    this.currentStatus = {
      ...this.currentStatus,
      state: 'installing',
      lastError: undefined,
    }

    try {
      this.emitProgress({ phase: 'checking', message: 'Preparing runtime dependencies...' })

      for (const artifact of artifacts) {
        const artifactReady = await this.isArtifactReady(artifact)
        const installed = this.installState.artifacts[artifact.id]
        const versionMatches = installed?.version === artifact.version
        if (artifactReady && versionMatches) {
          continue
        }
        await this.installArtifact(artifact, this.installAbortController.signal)
      }

      await this.refreshStatus()
      this.emitProgress({ phase: 'done', message: 'Runtime dependencies are ready.' })
      return this.currentStatus
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const isCancelled = message.toLowerCase().includes('cancel')
      this.currentStatus = {
        ...this.currentStatus,
        state: isCancelled ? 'needs_install' : 'error',
        ready: false,
        lastError: isCancelled ? undefined : message,
      }
      this.emitProgress({ phase: isCancelled ? 'checking' : 'error', message: isCancelled ? 'Install cancelled.' : message })
      await this.refreshStatus()
      throw error
    } finally {
      this.installAbortController = null
      await this.refreshStatus()
    }
  }

  private async refreshStatus(): Promise<void> {
    const platform = this.getRuntimePlatform()
    const artifacts = this.getArtifactsForPlatform(platform)

    const dependencies: RuntimeDependencyEntry[] = []
    for (const artifact of artifacts) {
      const ready = await this.isArtifactReady(artifact)
      const installed = this.installState.artifacts[artifact.id]
      dependencies.push({
        id: artifact.id,
        ready,
        requiredVersion: artifact.version,
        installedVersion: ready ? installed?.version ?? null : null,
        path: this.getArtifactPath(artifact),
      })
    }

    const ready = dependencies.every((dep) => dep.ready)
    const state = this.installAbortController
      ? 'installing'
      : ready
        ? 'ready'
        : this.currentStatus.state === 'error'
          ? 'error'
          : 'needs_install'

    this.currentStatus = {
      ...this.currentStatus,
      platform: platform,
      runtimeRoot: this.runtimeRoot,
      dependencies,
      ready,
      state,
      lastError: state === 'error' ? this.currentStatus.lastError : undefined,
    }
  }

  private async installArtifact(artifact: RuntimeArtifactSpec, signal: AbortSignal): Promise<void> {
    if (!artifact.url || !artifact.sha256) {
      throw new Error(`Runtime manifest incomplete for ${artifact.id}. Missing URL or SHA256.`)
    }

    const tempDir = path.join(this.runtimeRoot, '.tmp')
    await ensureDir(tempDir)

    const tempFileName = `${artifact.id}-${Date.now()}${artifact.type === 'zip' ? '.zip' : '.bin'}`
    const tempFilePath = path.join(tempDir, tempFileName)
    const targetPath = this.getArtifactPath(artifact)

    this.emitProgress({
      phase: 'downloading',
      dependencyId: artifact.id,
      message: `Downloading ${artifact.id}...`,
    })
    await this.downloadFile(artifact.url, tempFilePath, artifact.id, signal)

    this.emitProgress({
      phase: 'verifying',
      dependencyId: artifact.id,
      message: `Verifying ${artifact.id} checksum...`,
    })
    const checksum = await this.computeSha256(tempFilePath)
    if (checksum.toLowerCase() !== artifact.sha256.toLowerCase()) {
      throw new Error(`Checksum mismatch for ${artifact.id}`)
    }

    if (artifact.type === 'file') {
      await ensureDir(path.dirname(targetPath))
      await fs.promises.copyFile(tempFilePath, targetPath)
      if (artifact.executable && process.platform !== 'win32') {
        await fs.promises.chmod(targetPath, 0o755)
      }
    } else {
      this.emitProgress({
        phase: 'extracting',
        dependencyId: artifact.id,
        message: `Extracting ${artifact.id}...`,
      })
      await fs.promises.rm(targetPath, { recursive: true, force: true })
      await ensureDir(targetPath)
      await this.extractArchive(tempFilePath, targetPath)
    }

    await fs.promises.rm(tempFilePath, { force: true })

    this.installState.artifacts[artifact.id] = {
      version: artifact.version,
      sha256: artifact.sha256,
      installedAt: new Date().toISOString(),
    }
    await this.persistInstallState()

    this.emitProgress({
      phase: 'finalizing',
      dependencyId: artifact.id,
      message: `${artifact.id} installed.`,
    })
  }

  private async tryImportLegacyBundledAssets(): Promise<void> {
    const platform = this.getRuntimePlatform()
    const artifacts = this.getArtifactsForPlatform(platform)

    const legacyRoot = app.isPackaged ? process.resourcesPath : app.getAppPath()
    const legacyCandidates: Partial<Record<RuntimeDependencyId, string>> = {
      'whisper-model': path.join(legacyRoot, 'models', 'ggml-small.en.bin'),
      'whisper-binary': process.platform === 'win32'
        ? path.join(legacyRoot, 'models', 'win', 'whisper-cli.exe')
        : path.join(legacyRoot, 'models', 'unix', 'whisper'),
      'playwright-chromium': path.join(legacyRoot, 'playwright-browsers'),
    }

    for (const artifact of artifacts) {
      const targetPath = this.getArtifactPath(artifact)
      const targetExists = await this.pathExists(targetPath)
      if (targetExists) {
        continue
      }

      const legacyPath = legacyCandidates[artifact.id]
      if (!legacyPath || !(await this.pathExists(legacyPath))) {
        continue
      }

      logger.info(`Importing legacy bundled asset for ${artifact.id}`)
      if (artifact.type === 'file') {
        await ensureDir(path.dirname(targetPath))
        await fs.promises.copyFile(legacyPath, targetPath)
        if (artifact.executable && process.platform !== 'win32') {
          await fs.promises.chmod(targetPath, 0o755)
        }
      } else {
        await fs.promises.cp(legacyPath, targetPath, { recursive: true, force: true })
      }

      this.installState.artifacts[artifact.id] = {
        version: artifact.version,
        sha256: artifact.sha256,
        installedAt: new Date().toISOString(),
      }
    }

    await this.persistInstallState()
  }

  private async loadInstallState(): Promise<void> {
    if (!(await this.pathExists(this.installStatePath))) {
      this.installState = { artifacts: {} }
      return
    }

    try {
      const raw = await fs.promises.readFile(this.installStatePath, 'utf-8')
      this.installState = JSON.parse(raw) as InstallStateFile
    } catch (error) {
      logger.warn('Failed to load runtime install state, resetting.', error)
      this.installState = { artifacts: {} }
    }
  }

  private async persistInstallState(): Promise<void> {
    await ensureDir(this.runtimeRoot)
    await fs.promises.writeFile(this.installStatePath, JSON.stringify(this.installState, null, 2), 'utf-8')
  }

  private async isArtifactReady(artifact: RuntimeArtifactSpec): Promise<boolean> {
    const targetPath = this.getArtifactPath(artifact)
    if (artifact.type === 'file') {
      return this.pathExists(targetPath)
    }

    if (!(await this.pathExists(targetPath))) {
      return false
    }

    try {
      this.resolvePlaywrightExecutable(targetPath)
      return true
    } catch {
      return false
    }
  }

  private getArtifactPath(artifact: RuntimeArtifactSpec): string {
    return path.join(this.runtimeRoot, artifact.targetPath)
  }

  private getRuntimePlatform(): RuntimePlatform {
    const key = `${process.platform}-${process.arch}`
    if (key === 'darwin-arm64' || key === 'win32-x64') {
      return key
    }
    throw new Error(`Unsupported runtime platform: ${key}`)
  }

  private getArtifactsForPlatform(platform: RuntimePlatform): RuntimeArtifactSpec[] {
    const entry = this.activeManifest.platforms[platform]
    if (!entry) {
      throw new Error(`No runtime manifest entry for platform ${platform}`)
    }
    return entry.artifacts
  }

  private async loadRemoteManifestIfAvailable(): Promise<void> {
    const manifestUrl = this.getRemoteManifestUrl()
    if (!manifestUrl) {
      logger.info('Runtime manifest URL not configured, using bundled manifest.')
      return
    }

    try {
      const content = await this.fetchText(manifestUrl)
      const parsed = JSON.parse(content) as RuntimeManifest
      this.validateManifest(parsed)
      this.activeManifest = parsed
      logger.info(`Loaded remote runtime manifest from ${manifestUrl}`)
    } catch (error) {
      logger.warn('Failed to load remote runtime manifest. Falling back to bundled manifest.', error)
      this.activeManifest = runtimeManifest
    }
  }

  private getRemoteManifestUrl(): string {
    const envUrl = process.env.DODO_RUNTIME_MANIFEST_URL?.trim()
    if (envUrl) {
      return envUrl
    }

    const releaseTag = `v${app.getVersion()}`
    return `https://github.com/dodosaurus/dodo-recorder/releases/download/${releaseTag}/runtime-manifest.json`
  }

  private validateManifest(manifest: RuntimeManifest): void {
    if (!manifest || typeof manifest !== 'object') {
      throw new Error('Runtime manifest is not an object')
    }

    if (!manifest.platforms || typeof manifest.platforms !== 'object') {
      throw new Error('Runtime manifest missing platforms section')
    }

    for (const platform of Object.keys(manifest.platforms)) {
      const platformEntry = manifest.platforms[platform as RuntimePlatform]
      if (!platformEntry || !Array.isArray(platformEntry.artifacts)) {
        throw new Error(`Invalid platform entry in runtime manifest: ${platform}`)
      }

      for (const artifact of platformEntry.artifacts) {
        if (!artifact.id || !artifact.version || !artifact.type || !artifact.targetPath) {
          throw new Error(`Invalid artifact entry for platform ${platform}`)
        }
      }
    }
  }

  private async fetchText(url: string, redirects: number = 0): Promise<string> {
    if (redirects > 5) {
      throw new Error('Too many redirects while fetching runtime manifest')
    }

    return await new Promise<string>((resolve, reject) => {
      const request = https.get(url, (response) => {
        const statusCode = response.statusCode ?? 0

        if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
          response.resume()
          const redirectedUrl = new URL(response.headers.location, url).toString()
          this.fetchText(redirectedUrl, redirects + 1).then(resolve).catch(reject)
          return
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume()
          reject(new Error(`Failed to fetch runtime manifest (${statusCode})`))
          return
        }

        let data = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          data += chunk
        })
        response.on('end', () => resolve(data))
      })

      request.on('error', reject)
    })
  }

  private async downloadFile(
    sourceUrl: string,
    destinationPath: string,
    dependencyId: RuntimeDependencyId,
    signal: AbortSignal,
    redirects: number = 0
  ): Promise<void> {
    if (redirects > 5) {
      throw new Error(`Too many redirects while downloading ${dependencyId}`)
    }

    await new Promise<void>((resolve, reject) => {
      const urlObj = new URL(sourceUrl)
      const request = https.get(urlObj, (response) => {
        const statusCode = response.statusCode ?? 0

        if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
          response.resume()
          const redirectedUrl = new URL(response.headers.location, sourceUrl).toString()
          this.downloadFile(redirectedUrl, destinationPath, dependencyId, signal, redirects + 1)
            .then(resolve)
            .catch(reject)
          return
        }

        if (statusCode < 200 || statusCode >= 300) {
          reject(new Error(`Download failed (${statusCode}) for ${dependencyId}`))
          response.resume()
          return
        }

        const totalBytes = Number(response.headers['content-length'] ?? '0') || undefined
        let downloadedBytes = 0
        const output = fs.createWriteStream(destinationPath)

        response.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length
          this.emitProgress({
            phase: 'downloading',
            dependencyId,
            bytesDownloaded: downloadedBytes,
            bytesTotal: totalBytes,
            message: `Downloading ${dependencyId}...`,
          })
        })

        response.on('error', (error) => {
          output.destroy()
          reject(error)
        })

        output.on('error', (error) => {
          response.destroy(error)
          reject(error)
        })

        output.on('finish', () => resolve())

        response.pipe(output)
      })

      request.on('error', reject)
      signal.addEventListener('abort', () => {
        request.destroy(new Error('Runtime dependency install cancelled'))
      }, { once: true })
    })
  }

  private async computeSha256(filePath: string): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      const hash = createHash('sha256')
      const stream = fs.createReadStream(filePath)

      stream.on('error', reject)
      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('end', () => resolve(hash.digest('hex')))
    })
  }

  private async extractArchive(archivePath: string, destinationPath: string): Promise<void> {
    if (process.platform === 'win32') {
      await this.runCommand('powershell', [
        '-NoProfile',
        '-Command',
        `Expand-Archive -Path '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destinationPath.replace(/'/g, "''")}' -Force`,
      ])
      return
    }

    await this.runCommand('unzip', ['-oq', archivePath, '-d', destinationPath])
  }

  private async runCommand(command: string, args: string[]): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, { stdio: 'ignore' })
      child.once('error', reject)
      child.once('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`Command failed: ${command} ${args.join(' ')}`))
        }
      })
    })
  }

  private resolvePlaywrightExecutable(browsersPath: string): string {
    const chromiumDirs = fs.readdirSync(browsersPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('chromium-'))
      .map((entry) => entry.name)
      .sort()
      .reverse()

    if (chromiumDirs.length === 0) {
      throw new Error(`No Chromium runtime found in ${browsersPath}`)
    }

    const chromiumDir = path.join(browsersPath, chromiumDirs[0])
    if (process.platform === 'darwin') {
      const executablePath = path.join(
        chromiumDir,
        'chrome-mac-arm64',
        'Google Chrome for Testing.app',
        'Contents',
        'MacOS',
        'Google Chrome for Testing'
      )
      if (!fs.existsSync(executablePath)) {
        throw new Error(`Chromium executable not found at ${executablePath}`)
      }
      return executablePath
    }

    if (process.platform === 'win32') {
      const win64Path = path.join(chromiumDir, 'chrome-win64', 'chrome.exe')
      if (fs.existsSync(win64Path)) {
        return win64Path
      }

      const winPath = path.join(chromiumDir, 'chrome-win', 'chrome.exe')
      if (fs.existsSync(winPath)) {
        return winPath
      }
      throw new Error(`Chromium executable not found in ${chromiumDir}`)
    }

    throw new Error(`Unsupported platform for Chromium resolution: ${process.platform}`)
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await fs.promises.access(targetPath)
      return true
    } catch {
      return false
    }
  }

  private emitProgress(progress: RuntimeInstallProgress): void {
    logger.info(`[runtime] ${progress.phase}${progress.dependencyId ? `:${progress.dependencyId}` : ''} - ${progress.message}`)
    this.emit('progress', progress)
  }
}

export const runtimeDependencyManager = new RuntimeDependencyManager()
