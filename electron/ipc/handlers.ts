import { BrowserWindow, ipcMain } from 'electron'
import { registerRecordingHandlers } from './recording'
import { registerSessionHandlers, registerSettingsHandlers } from './session'

// Track if handlers have been registered to prevent duplicate registration
let handlersRegistered = false

/**
 * Register all IPC handlers
 * @param mainWindow - The main browser window instance
 */
export function registerAllHandlers(mainWindow: BrowserWindow | null): void {
  // Prevent duplicate registration (important for dev mode hot reload)
  if (handlersRegistered) {
    return
  }
  
  registerRecordingHandlers(mainWindow)
  registerSessionHandlers()
  registerSettingsHandlers()
  
  handlersRegistered = true
}

/**
 * Cleanup handlers (useful for testing or hot reload scenarios)
 */
export function cleanupHandlers(): void {
  // Remove all IPC handlers
  ipcMain.removeHandler('start-recording')
  ipcMain.removeHandler('stop-recording')
  ipcMain.removeHandler('pause-recording')
  ipcMain.removeHandler('resume-recording')
  ipcMain.removeHandler('save-session')
  ipcMain.removeHandler('get-settings')
  ipcMain.removeHandler('update-settings')
  
  handlersRegistered = false
}
