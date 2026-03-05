import { app, BrowserWindow, ipcMain, dialog, systemPreferences, session, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { cleanupOldTempFiles } from './utils/fs'
import { logger } from './utils/logger'
import { getSettingsStore } from './settings/store'
import { updateTimeWindows } from './utils/voiceDistribution'
import { registerAllHandlers } from './ipc/handlers'
import { runtimeDependencyManager } from './runtime/dependency-manager'

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
  logger.error('Uncaught exception:', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason)
  logger.error('Unhandled rejection:', reason)
})

let mainWindow: BrowserWindow | null = null

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const isMac = process.platform === 'darwin'
const isWindows = process.platform === 'win32'
const ALLOWED_PERMISSIONS = ['media', 'microphone', 'audioCapture'] as const

/**
 * Read build info from build-info.json
 */
function getBuildInfo(): Record<string, string | boolean> | null {
  const appPath = app.isPackaged ? process.resourcesPath : app.getAppPath()
  const buildInfoPath = path.join(appPath, 'build-info.json')
  
  try {
    if (fs.existsSync(buildInfoPath)) {
      const content = fs.readFileSync(buildInfoPath, 'utf-8')
      return JSON.parse(content)
    }
  } catch (error) {
    logger.warn('Failed to read build info:', error instanceof Error ? error.message : String(error))
  }
  return null
}

async function requestMicrophonePermission(): Promise<boolean> {
  if (isMac) {
    const status = systemPreferences.getMediaAccessStatus('microphone')
    if (status === 'granted') return true
    if (status === 'denied') {
      logger.error('Microphone access denied. Please enable it in System Preferences > Privacy & Security > Microphone')
      return false
    }
    return await systemPreferences.askForMediaAccess('microphone')
  }
  return true
}

function setupPermissionHandlers() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (ALLOWED_PERMISSIONS.includes(permission as any)) {
      callback(true)
    } else {
      callback(false)
    }
  })

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return ALLOWED_PERMISSIONS.includes(permission as any)
  })
}

async function createWindow() {
  logger.info('Creating main window...')
  
  setupPermissionHandlers()
  await requestMicrophonePermission()

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0a0b',
    show: false,
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
    titleBarOverlay: !isMac ? false : undefined,
    frame: isMac,
    autoHideMenuBar: isWindows,
    trafficLightPosition: isMac ? { x: 16, y: 10 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  mainWindow.once('ready-to-show', () => {
    logger.info('Window ready to show, displaying...')
    mainWindow?.show()
  })

  logger.info(VITE_DEV_SERVER_URL 
    ? `Loading dev server: ${VITE_DEV_SERVER_URL}` 
    : 'Loading production build from dist/index.html')

  if (VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    logger.info('Main window closed')
    mainWindow = null
  })

  mainWindow.on('unresponsive', () => {
    logger.warn('Main window became unresponsive')
  })

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    logger.error(`Failed to load: ${errorCode} - ${errorDescription}`)
  })

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    logger.error(`Render process gone: ${details.reason} - ${details.exitCode}`)
  })

  registerAllHandlers(mainWindow)
  logger.info('Main window created successfully')
}

async function initializeApp(): Promise<void> {
  try {
    logger.logStartupInfo()
    
    const buildInfo = getBuildInfo()
    if (buildInfo) {
      logger.info(`📦 Build: ${buildInfo.commitHash}${buildInfo.isDirty ? ' (dirty)' : ''}`)
      logger.info(`   Branch: ${buildInfo.branch}`)
      logger.info(`   Built: ${buildInfo.buildTime}`)
    } else {
      logger.info('📦 Build: unknown')
    }
    
    logger.info('Initializing runtime dependency manager...')
    await runtimeDependencyManager.initialize()
    logger.info('Runtime dependency manager initialized')
    
    logger.info('Loading settings...')
    const settings = getSettingsStore()
    
    updateTimeWindows(settings.getVoiceDistributionConfig())
    
    logger.info('Cleaning up old temp files...')
    const tempDir = path.join(app.getPath('temp'), 'kiwigen')
    await cleanupOldTempFiles(tempDir, 24 * 60 * 60 * 1000)
    
    logger.info('Creating main window...')
    await createWindow()
    logger.info('App initialization complete')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    
    logger.error('❌ Fatal error during app initialization:', errorMessage)
    if (errorStack) {
      logger.error('Stack trace:', errorStack)
    }
    
    dialog.showErrorBox(
      'KiwiGen - Startup Error',
      `Failed to start KiwiGen:\n\n${errorMessage}\n\nPlease check the logs for more details.\n\nLog location: ${logger.getLogPath()}`
    )
    
    app.quit()
  }
}

app.whenReady().then(() => {
  void initializeApp()
}).catch((error) => {
  console.error('app.whenReady() rejected:', error)
  logger.error('app.whenReady() rejected:', error)
  app.quit()
})

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow()
  }
})

ipcMain.handle('check-microphone-permission', async () => {
  if (isMac) {
    const status = systemPreferences.getMediaAccessStatus('microphone')
    if (status === 'granted') return { granted: true }
    if (status === 'denied') return { granted: false, denied: true }
    const granted = await systemPreferences.askForMediaAccess('microphone')
    return { granted }
  }
  return { granted: true }
})

ipcMain.on('window-minimize', () => mainWindow?.minimize())
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})
ipcMain.on('window-close', () => mainWindow?.close())

// Simple IPC handlers that don't need extraction
ipcMain.handle('select-output-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Output Folder for Sessions',
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

// Log management IPC handlers
ipcMain.handle('get-log-path', () => {
  return logger.getLogPath()
})

ipcMain.handle('open-log-file', async () => {
  try {
    const logPath = logger.getLogPath()
    await shell.openPath(logPath)
    return { success: true }
  } catch (error) {
    logger.error('Failed to open log file:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
})

ipcMain.handle('open-log-folder', async () => {
  try {
    const logPath = logger.getLogPath()
    const logDir = path.dirname(logPath)
    await shell.openPath(logDir)
    return { success: true }
  } catch (error) {
    logger.error('Failed to open log folder:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
})

// Build info IPC handler
ipcMain.handle('get-build-info', () => {
  return getBuildInfo()
})
