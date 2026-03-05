import path from 'path'
import os from 'os'
import fs from 'fs'
import { app } from 'electron'
import type { AppSettings } from '../settings/store'
import type { RecordedAction, TranscriptSegment, SessionBundle } from '../../shared/types'
import {
  SESSION_ID_REGEX,
  MAX_AUDIO_SIZE,
  MAX_URL_LENGTH,
  MAX_PATH_LENGTH,
  MAX_TIMEOUT_MS,
} from '../../shared/constants'
import { validateAndSanitizeUrl } from '../../shared/urlUtils'

export function validateUrl(url: string): { valid: boolean; sanitized?: string; error?: string } {
  const result = validateAndSanitizeUrl(url)
  
  return {
    valid: result.valid,
    sanitized: result.sanitized,
    // Use user-friendly error for display, fallback to technical error
    error: result.userFriendlyError || result.error
  }
}

export function sanitizeSessionId(id: string): string {
  if (!id || typeof id !== 'string') {
    return `session-${Date.now()}`
  }
  const sanitized = id.replace(/[^a-zA-Z0-9_-]/g, '_')
  return sanitized.slice(0, 100) // Limit length
}

export function validateSessionId(id: string): boolean {
  return typeof id === 'string' && SESSION_ID_REGEX.test(id) && id.length <= 100
}

export function validateAudioBuffer(buffer: ArrayBuffer): { valid: boolean; error?: string } {
  if (!buffer || !(buffer instanceof ArrayBuffer)) {
    return { valid: false, error: 'Invalid audio buffer' }
  }
  if (buffer.byteLength > MAX_AUDIO_SIZE) {
    return { valid: false, error: `Audio buffer too large (max ${MAX_AUDIO_SIZE / 1024 / 1024}MB)` }
  }
  if (buffer.byteLength === 0) {
    return { valid: false, error: 'Audio buffer is empty' }
  }
  return { valid: true }
}

export function validateOutputPath(outputPath: string): { valid: boolean; error?: string } {
  if (!outputPath || typeof outputPath !== 'string') {
    return { valid: false, error: 'Output path is required' }
  }
  
  // Resolve to absolute path first
  const resolved = path.resolve(outputPath)
  
  // Normalize to remove . and .. segments
  const normalized = path.normalize(resolved)
  
  // Check for path traversal (normalized should not differ from resolved)
  if (normalized !== resolved) {
    return { valid: false, error: 'Path traversal not allowed' }
  }
  
  // Additional Windows-specific checks
  if (process.platform === 'win32') {
    // Check for UNC paths or device paths
    if (/^\\\\\?\\/.test(outputPath) || /^[A-Za-z]:/.test(outputPath)) {
      // Allow but validate further
    }
  }
  
  // Ensure path is within user directories
  const homeDir = os.homedir()
  const userDataDir = app.getPath('userData')
  const allowedDirs = [homeDir, userDataDir]
  
  if (!allowedDirs.some(dir => normalized.startsWith(dir))) {
    return { valid: false, error: 'Path must be within user directory' }
  }
  
  // Check for symlink traversal
  try {
    const realPath = fs.realpathSync(normalized)
    if (realPath !== normalized) {
      return { valid: false, error: 'Symlink traversal not allowed' }
    }
  } catch {
    // Path doesn't exist yet, that's OK
  }
  
  return { valid: true }
}

export function validateSettingsUpdate(data: unknown): data is Partial<AppSettings> {
  if (!data || typeof data !== 'object') return false
  
  const settings = data as Partial<AppSettings>
  
  // Validate nested objects
  if (settings.whisper && typeof settings.whisper !== 'object') return false
  if (settings.voiceDistribution && typeof settings.voiceDistribution !== 'object') return false
  if (settings.output && typeof settings.output !== 'object') return false
  if (settings.userPreferences && typeof settings.userPreferences !== 'object') return false
  
  // Validate whisper settings
  if (settings.whisper?.transcriptionTimeoutMs !== undefined) {
    if (typeof settings.whisper.transcriptionTimeoutMs !== 'number') return false
    if (settings.whisper.transcriptionTimeoutMs < 0 || settings.whisper.transcriptionTimeoutMs > MAX_TIMEOUT_MS) {
      return false
    }
  }
  
  // Validate voice distribution settings
  if (settings.voiceDistribution?.lookbackMs !== undefined) {
    if (typeof settings.voiceDistribution.lookbackMs !== 'number') return false
    if (settings.voiceDistribution.lookbackMs < 0 || settings.voiceDistribution.lookbackMs > 60000) return false
  }
  if (settings.voiceDistribution?.lookaheadMs !== undefined) {
    if (typeof settings.voiceDistribution.lookaheadMs !== 'number') return false
    if (settings.voiceDistribution.lookaheadMs < 0 || settings.voiceDistribution.lookaheadMs > 60000) return false
  }
  if (settings.voiceDistribution?.longSegmentThresholdMs !== undefined) {
    if (typeof settings.voiceDistribution.longSegmentThresholdMs !== 'number') return false
    if (settings.voiceDistribution.longSegmentThresholdMs < 0 || settings.voiceDistribution.longSegmentThresholdMs > 60000) return false
  }
  
  // Validate output settings
  if (settings.output?.includeScreenshots !== undefined) {
    if (typeof settings.output.includeScreenshots !== 'boolean') return false
  }
  if (settings.output?.prettyPrintJson !== undefined) {
    if (typeof settings.output.prettyPrintJson !== 'boolean') return false
  }
  
  // Validate user preferences
  if (settings.userPreferences?.startUrl !== undefined) {
    if (typeof settings.userPreferences.startUrl !== 'string') return false
    if (settings.userPreferences.startUrl.length > MAX_URL_LENGTH) return false
  }
  if (settings.userPreferences?.outputPath !== undefined) {
    if (typeof settings.userPreferences.outputPath !== 'string') return false
    if (settings.userPreferences.outputPath.length > MAX_PATH_LENGTH) return false
  }
  
  return true
}

export function validateUserPreferencesUpdate(data: unknown): data is Partial<{ startUrl: string; outputPath: string }> {
  if (!data || typeof data !== 'object') return false
  
  const preferences = data as Partial<{ startUrl: string; outputPath: string }>
  
  if (preferences.startUrl !== undefined) {
    if (typeof preferences.startUrl !== 'string') return false
    if (preferences.startUrl.length > MAX_URL_LENGTH) return false
  }
  
  if (preferences.outputPath !== undefined) {
    if (typeof preferences.outputPath !== 'string') return false
    if (preferences.outputPath.length > MAX_PATH_LENGTH) return false
  }
  
  return true
}

/**
 * Validate a single RecordedAction object
 */
export function validateRecordedAction(action: unknown): action is RecordedAction {
  if (!action || typeof action !== 'object') return false
  
  const act = action as Partial<RecordedAction>
  if (typeof act.id !== 'string') return false
  if (typeof act.timestamp !== 'number') return false
  if (typeof act.type !== 'string') return false
  
  return true
}

/**
 * Validate an array of RecordedAction objects
 */
export function validateRecordedActionsArray(data: unknown): data is RecordedAction[] {
  if (!Array.isArray(data)) return false
  
  for (const action of data) {
    if (!validateRecordedAction(action)) return false
  }
  
  return true
}

/**
 * Validate a single TranscriptSegment object
 */
export function validateTranscriptSegment(segment: unknown): segment is TranscriptSegment {
  if (!segment || typeof segment !== 'object') return false
  
  const seg = segment as Partial<TranscriptSegment>
  if (typeof seg.id !== 'string') return false
  if (typeof seg.startTime !== 'number') return false
  if (typeof seg.endTime !== 'number') return false
  if (typeof seg.text !== 'string') return false
  
  return true
}

/**
 * Validate an array of TranscriptSegment objects
 */
export function validateTranscriptSegmentsArray(data: unknown): data is TranscriptSegment[] {
  if (!Array.isArray(data)) return false
  
  for (const segment of data) {
    if (!validateTranscriptSegment(segment)) return false
  }
  
  return true
}

/**
 * Validate a SessionBundle object
 */
export function validateSessionBundle(data: unknown): data is SessionBundle {
  if (!data || typeof data !== 'object') return false
  
  const bundle = data as Partial<SessionBundle>
  
  // Validate required fields exist and have correct types
  if (!validateRecordedActionsArray(bundle.actions)) return false
  if (typeof bundle.startTime !== 'number') return false
  
  return true
}

