/**
 * Production-ready logger using electron-log
 * Automatically logs to files in standard OS locations:
 * - macOS: ~/Library/Logs/kiwigen/main.log
 * - Windows: %USERPROFILE%\AppData\Roaming\kiwigen\logs\main.log
 *
 * Features:
 * - Automatic file rotation
 * - Console output in development
 * - Persistent logs in production
 * - Standard log levels (debug, info, warn, error)
 */

import log from 'electron-log'
import { app } from 'electron'

// Configure log file format
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}'

// Set log levels based on environment
const isDevelopment = process.env.NODE_ENV === 'development'

if (isDevelopment) {
  log.transports.file.level = 'debug'
  log.transports.console.level = 'debug'
} else {
  log.transports.file.level = 'info'
  log.transports.console.level = 'error' // Only show errors in production console
}

// Enable file logging with rotation
log.transports.file.maxSize = 10 * 1024 * 1024 // 10 MB

// Log startup information once
let startupLogged = false
export function logStartupInfo(): void {
  if (startupLogged) return
  startupLogged = true
  
  log.info('='.repeat(80))
  log.info('KiwiGen Starting')
  log.info('='.repeat(80))
  log.info(`App Version: ${app.getVersion()}`)
  log.info(`Electron: ${process.versions.electron}`)
  log.info(`Chrome: ${process.versions.chrome}`)
  log.info(`Node: ${process.versions.node}`)
  log.info(`Platform: ${process.platform} ${process.arch}`)
  log.info(`Environment: ${isDevelopment ? 'development' : 'production'}`)
  log.info(`Log File: ${log.transports.file.getFile().path}`)
  log.info('='.repeat(80))
}

/**
 * Get the path to the current log file
 */
export function getLogPath(): string {
  return log.transports.file.getFile().path
}

/**
 * Logger interface matching our previous implementation
 */
export const logger = {
  debug: (...args: any[]): void => log.debug(...args),
  info: (...args: any[]): void => log.info(...args),
  warn: (...args: any[]): void => log.warn(...args),
  error: (...args: any[]): void => log.error(...args),
  
  // Additional helpers
  getLogPath,
  logStartupInfo,
}

export default logger
