import { BrowserWindow, ipcMain } from 'electron'
import { handleIpc } from '../utils/ipc'
import { runtimeDependencyManager } from '../runtime/dependency-manager'
import type { RuntimeInstallProgress } from '../../shared/types'

let progressListenerRegistered = false

export function registerRuntimeHandlers(mainWindow: BrowserWindow | null): void {
  ipcMain.handle('runtime-dependencies-status', async () => {
    return handleIpc(async () => {
      const status = runtimeDependencyManager.getStatus()
      return { status }
    }, 'Failed to get runtime dependency status')
  })

  ipcMain.handle('runtime-dependencies-install', async () => {
    return handleIpc(async () => {
      const status = await runtimeDependencyManager.installAll()
      return { status }
    }, 'Failed to install runtime dependencies')
  })

  ipcMain.handle('runtime-dependencies-cancel', async () => {
    return handleIpc(async () => {
      runtimeDependencyManager.cancelInstall()
      return {}
    }, 'Failed to cancel runtime dependency install')
  })

  if (!progressListenerRegistered) {
    runtimeDependencyManager.on('progress', (progress: RuntimeInstallProgress) => {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('runtime-dependencies-progress', progress)
      }
    })
    progressListenerRegistered = true
  }
}
