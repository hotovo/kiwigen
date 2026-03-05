/**
 * Shared constants for the KiwiGen application.
 *
 * These values are importable by both the Electron main process and the
 * React renderer process via the @/* path alias (which resolves to src/) or
 * direct relative imports.
 *
 * NOTE: Browser-injected scripts (injected-script.ts, recording-widget.ts,
 * hover-highlighter.ts) are serialised closures that run inside Playwright
 * pages and therefore CANNOT import from this file at runtime.  Constants
 * used only inside those scripts are kept as inline declarations there.
 * Update both places when changing a shared value and leave a sync comment.
 */

// ============================
// Audio Configuration
// ============================

/** Sample rate expected by Whisper.cpp (Hz). */
export const AUDIO_SAMPLE_RATE = 16000

/** MediaRecorder target bit-rate (bps). */
export const AUDIO_BITS_PER_SECOND = 128000

/** MIME type used for MediaRecorder output. */
export const AUDIO_MIME_TYPE = 'audio/webm;codecs=opus'

/** How often MediaRecorder fires ondataavailable (ms). */
export const AUDIO_CHUNK_INTERVAL_MS = 1000

/** How long to wait after MediaRecorder.stop() for the final chunk (ms). */
export const AUDIO_STOP_DELAY_MS = 500

/** Maximum allowed audio blob size before rejecting (bytes). */
export const MAX_AUDIO_SIZE = 50 * 1024 * 1024 // 50 MB

// ============================
// Validation Limits
// ============================

export const MAX_URL_LENGTH = 2048
export const MAX_PATH_LENGTH = 4096

/** Maximum IPC timeout value (ms). */
export const MAX_TIMEOUT_MS = 600_000 // 10 minutes

export const ALLOWED_PROTOCOLS = ['http:', 'https:'] as const

/** Regex for safe session/file identifiers. */
export const SESSION_ID_REGEX = /^[a-zA-Z0-9_-]+$/
