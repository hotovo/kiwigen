import path from 'path'
import fs from 'fs'

// Import Playwright first
import { chromium, Browser, Page, Frame } from 'playwright'
import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import { logger } from '../utils/logger'
import type { RecordedAction } from '../../shared/types'
import type { KiwiWindow } from '../../shared/browser-context'
import { getInjectionScript } from './injected-script'
import { getWidgetScript, getWidgetInitScript } from './recording-widget'
import { getHighlighterScript, getHighlighterInitScript } from './hover-highlighter'

enum RecorderState {
  IDLE = 'idle',
  RECORDING = 'recording',
  PAUSED = 'paused',
}

export class BrowserRecorder extends EventEmitter {
  private browser: Browser | null = null
  private page: Page | null = null
  private actions: RecordedAction[] = []
  private startTime: number = 0
  private frameNavigatedHandler: ((frame: Frame) => void) | null = null
  private screenshotDir: string | null = null
  private initialNavigationComplete: boolean = false
  private audioActive: boolean = false
  private lastRecordedUrl: string | null = null
  /** Secure token generated at session start; required by widget IPC calls. */
  private sessionToken: string = ''
  private readonly browsersPath: string
  private readonly browserExecutablePath: string

  private state: RecorderState = RecorderState.IDLE
  
  private pauseStartedAt: number | null = null
  private pausedDurationMs: number = 0

  constructor(browsersPath: string, browserExecutablePath: string) {
    super()
    this.browsersPath = browsersPath
    this.browserExecutablePath = browserExecutablePath

    logger.info(`[recorder.ts] process.cwd(): ${process.cwd()}`)
    logger.info(`[recorder.ts] browsersPath: ${this.browsersPath}`)
    logger.info(`[recorder.ts] browserExecutablePath: ${this.browserExecutablePath}`)
  }

  private get isPaused(): boolean {
    return this.state === RecorderState.PAUSED
  }

  /**
   * Checks if Playwright Chromium browser is installed
   * @returns true if browser is installed, false otherwise
   */
  private async checkBrowserInstalled(): Promise<boolean> {
    try {
      // Check if our manually constructed browser path exists
      const exists = fs.existsSync(this.browserExecutablePath)
      logger.info(`[checkBrowserInstalled] browserExecutablePath: ${this.browserExecutablePath}`)
      logger.info(`[checkBrowserInstalled] fs.existsSync(browserExecutablePath): ${exists}`)
      
      // Also check if the browsers directory exists
      const browsersDirExists = fs.existsSync(this.browsersPath)
      logger.info(`[checkBrowserInstalled] browsersPath: ${this.browsersPath}`)
      logger.info(`[checkBrowserInstalled] fs.existsSync(browsersPath): ${browsersDirExists}`)
      
      // List contents of browsers directory if it exists
      if (browsersDirExists) {
        try {
          const contents = fs.readdirSync(this.browsersPath)
          logger.info(`[checkBrowserInstalled] browsersPath contents: ${contents.join(', ')}`)
        } catch (error) {
          logger.info(`[checkBrowserInstalled] Failed to read browsersPath: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      
      return exists
    } catch (error) {
      logger.info(`[checkBrowserInstalled] Exception: ${error}`)
      return false
    }
  }

  /**
   * Starts recording browser interactions
   * @param url - The URL to navigate to
   * @param screenshotDir - Optional directory to save screenshots
   * @throws {Error} If browser fails to launch or navigate
   * @returns Promise that resolves when recording has started
   */
  async start(url: string, screenshotDir?: string): Promise<void> {
    if (this.state !== RecorderState.IDLE) {
      throw new Error(`Cannot start recording from state ${this.state}`)
    }

    this.state = RecorderState.RECORDING
    this.startTime = Date.now()
    this.actions = []
    this.screenshotDir = screenshotDir || null
    this.initialNavigationComplete = false
    this.lastRecordedUrl = url // Initialize with the start URL to avoid recording it as a navigation
    this.pausedDurationMs = 0
    this.pauseStartedAt = null
    // Generate a fresh session token for this recording session
    this.sessionToken = randomUUID()

    // Log the Playwright browsers path (set at module load time)
    logger.info(`Playwright browsers path: ${this.browsersPath}`)
    logger.info(`Browser executable path: ${this.browserExecutablePath}`)

    // Check if Playwright browsers are installed
    const browserInstalled = await this.checkBrowserInstalled()
    if (!browserInstalled) {
      const errorMessage =
        'Playwright Chromium browser is not installed.\n\n' +
        `Expected location: ${this.browserExecutablePath}\n\n` +
        'Run runtime setup to install browser dependencies.'
      logger.error('❌ Playwright browser not installed')
      logger.error(`❌ Browser path check failed. See debug logs above for details.`)
      throw new Error(errorMessage)
    }

    this.browser = await chromium.launch({
      headless: false,
      executablePath: this.browserExecutablePath,
      args: [
        '--start-maximized',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
    })

    const context = await this.browser.newContext({
      viewport: null,
    })

    this.page = await context.newPage()

    await this.setupEventListeners()
    
    // Navigate to URL - the framenavigated event will record this
    await this.page.goto(url)
    // Mark initial navigation as complete to allow subsequent navigations
    this.initialNavigationComplete = true
  }

  private async setupEventListeners(): Promise<void> {
    if (!this.page) return

    // Expose recording function to browser context
    await this.page.exposeFunction('__kiwiRecordAction', (data: string) => {
      try {
        const parsed = JSON.parse(data)
        this.recordAction(parsed)
      } catch (error) {
        logger.error('Failed to parse action:', error instanceof Error ? error.message : String(error))
      }
    })

    // Expose screenshot function to browser context
    await this.page.exposeFunction('__kiwiTakeScreenshot', async () => {
      try {
        return await this.captureScreenshot()
      } catch (error) {
        logger.error('Failed to take screenshot:', error instanceof Error ? error.message : String(error))
        return null
      }
    })

    // Expose pause/resume functions to browser context with session token validation
    await this.page.exposeFunction('__kiwiPauseRecording', async (token: string) => {
      if (token !== this.sessionToken) {
        logger.warn('🔒 Rejected __kiwiPauseRecording: invalid session token')
        return
      }
      try {
        await this.pause()
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        logger.error('Failed to pause recording:', msg)
      }
    })

    await this.page.exposeFunction('__kiwiResumeRecording', async (token: string) => {
      if (token !== this.sessionToken) {
        logger.warn('🔒 Rejected __kiwiResumeRecording: invalid session token')
        return
      }
      try {
        await this.resume()
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        logger.error('Failed to resume recording:', msg)
      }
    })

    // Inject the recording script into the page
    await this.page.addInitScript(getInjectionScript())
    
    // Inject the widget creation function
    // Note: Using string concatenation to avoid nested template literal issues
    await this.page.addInitScript('window.__kiwiCreateWidget = ' + getWidgetScript().toString())
    
    // Inject the widget initialization script
    await this.page.addInitScript(getWidgetInitScript())
    
    // Inject the hover highlighter creation function
    await this.page.addInitScript('window.__kiwiCreateHighlighter = ' + getHighlighterScript().toString())
    
    // Inject the highlighter initialization script (same pattern as widget)
    await this.page.addInitScript(getHighlighterInitScript())

    // Inject session token so the widget can pass it back in pause/resume calls
    await this.page.addInitScript(
      (token: string) => { (window as unknown as { __kiwiSessionToken?: string }).__kiwiSessionToken = token },
      this.sessionToken
    )

    // Setup frame navigation handler
    this.frameNavigatedHandler = (frame: Frame) => {
      try {
        if (frame === this.page?.mainFrame()) {
          // Only record navigation if it's not the initial page load
          // The initial navigation is already recorded by the start() method
          if (this.initialNavigationComplete) {
            const currentUrl = frame.url()
            // Only record navigation if the URL is different from the last recorded one
            // This prevents duplicate navigation events for the same URL
            if (this.lastRecordedUrl !== currentUrl) {
              this.lastRecordedUrl = currentUrl
              this.recordAction({
                type: 'navigate',
                url: currentUrl,
              })
            }
          }
        }
      } catch (error) {
        logger.error('Error handling frame navigation:', error)
      }
    }
    
    this.page.on('framenavigated', this.frameNavigatedHandler)
  }

  /**
   * Captures a screenshot and returns the filename
   */
  private async captureScreenshot(): Promise<string | null> {
    if (!this.page || !this.screenshotDir) return null
    if (this.isPaused) return null // Don't capture screenshots while paused

    try {
      const effectiveElapsedMs = Date.now() - this.startTime - this.pausedDurationMs
      const filename = `screenshot-${effectiveElapsedMs}.png`
      const filepath = path.join(this.screenshotDir, filename)
      
      await this.page.screenshot({
        path: filepath,
        fullPage: false,
      })
      
      logger.debug('Screenshot captured:', filename)
      return filename
    } catch (error) {
      logger.error('Screenshot capture failed:', error)
      return null
    }
  }

  private recordAction(partial: Omit<RecordedAction, 'id' | 'timestamp'>): void {
    // Don't record actions while paused
    if (this.isPaused) {
      logger.debug('Action ignored (paused):', partial.type)
      return
    }

    const effectiveElapsedMs = Date.now() - this.startTime - this.pausedDurationMs
    const action: RecordedAction = {
      id: randomUUID(),
      timestamp: effectiveElapsedMs,
      ...partial,
    }
    
    this.actions.push(action)
    this.emit('action', action)
  }

  /**
   * Gets all recorded actions
   * @returns Array of recorded actions (copy to prevent external modification)
   */
  getActions(): RecordedAction[] {
    return [...this.actions]
  }

  /**
   * Updates the widget visual state to reflect paused or recording.
   * Consolidates the duplicate page.evaluate() blocks from pause() and resume().
   */
  private async updateWidgetState(state: 'paused' | 'recording'): Promise<void> {
    if (!this.page) return
    const isPaused = state === 'paused'

    try {
      await this.page.evaluate(({ isPaused, audioActive }: { isPaused: boolean; audioActive: boolean }) => {
        const win = window as { __kiwiRecordingPaused?: boolean; __kiwiShowEqualizer?: () => void }
        win.__kiwiRecordingPaused = isPaused

        const widgetHost = document.querySelector('#__kiwi-widget-host')
        const widget = widgetHost?.shadowRoot?.querySelector('.dodo-widget')
        const voiceIndicator = widgetHost?.shadowRoot?.querySelector('#voice-indicator')
        const pauseResumeBtn = widgetHost?.shadowRoot?.querySelector('#pause-resume-btn')
        const pauseResumeTooltip = widgetHost?.shadowRoot?.querySelector('#pause-resume-btn .tooltip')
        const screenshotBtn = widgetHost?.shadowRoot?.querySelector('#screenshot-btn') as HTMLButtonElement | null
        const assertionBtn = widgetHost?.shadowRoot?.querySelector('#assertion-btn') as HTMLButtonElement | null

        // Toggle paused class on widget
        widget?.classList.toggle('paused', isPaused)

        // Update voice indicator
        if (voiceIndicator) {
          if (!isPaused && audioActive) {
            voiceIndicator.classList.add('active')
          } else {
            voiceIndicator.classList.remove('active')
          }
        }

        // Update pause/resume button icon and tooltip
        if (pauseResumeBtn) {
          if (isPaused) {
            pauseResumeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" fill="rgba(100, 116, 139, 0.8)" stroke="rgba(148, 163, 184, 0.9)"></polygon>
            </svg>`
          } else {
            pauseResumeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="6" y="4" width="4" height="16" fill="rgba(100, 116, 139, 0.8)" stroke="rgba(148, 163, 184, 0.9)"></rect>
              <rect x="14" y="4" width="4" height="16" fill="rgba(100, 116, 139, 0.8)" stroke="rgba(148, 163, 184, 0.9)"></rect>
            </svg>`
          }
          if (pauseResumeTooltip) {
            pauseResumeTooltip.textContent = isPaused ? 'Resume Recording' : 'Pause Recording'
            pauseResumeBtn.appendChild(pauseResumeTooltip)
          }
        }

        // Enable/disable other buttons
        if (screenshotBtn) screenshotBtn.disabled = isPaused
        if (assertionBtn) assertionBtn.disabled = isPaused

        // Trigger equalizer animation when resuming with active audio
        if (!isPaused && audioActive && typeof win.__kiwiShowEqualizer === 'function') {
          win.__kiwiShowEqualizer()
        }
      }, { isPaused, audioActive: this.audioActive })
    } catch (error) {
      logger.error(`Failed to update widget state to '${state}':`, error)
    }
  }

  /**
   * Updates whether audio recording is active in the browser widget.
   */
  async updateAudioActivity(active: boolean): Promise<void> {
    if (!this.page) return
    
    // Store active state to maintain across navigations
    this.audioActive = active

    try {
      await this.page.evaluate((isActive) => {
        const win = window as unknown as KiwiWindow
        win.__kiwiAudioActive = isActive

        // Update voice indicator visibility (only show if active AND not paused)
        const voiceIndicator = document.querySelector('#__kiwi-widget-host')
          ?.shadowRoot?.querySelector('#voice-indicator')
        
        if (voiceIndicator) {
          const isPaused = win.__kiwiRecordingPaused === true
          if (isActive && !isPaused) {
            voiceIndicator.classList.add('active')
          } else {
            voiceIndicator.classList.remove('active')
          }
        }

        if (isActive && typeof win.__kiwiShowEqualizer === 'function') {
          win.__kiwiShowEqualizer()
        }

        if (!isActive && typeof win.__kiwiHideEqualizer === 'function') {
          win.__kiwiHideEqualizer()
        }
      }, active)
    } catch (error) {
      // Silently ignore failures (page may be navigating)
    }
  }

  /**
   * Pauses the recording session
   * Actions and screenshots are not recorded while paused
   * Paused time is excluded from elapsed time calculations
   * @throws {Error} If not in RECORDING state
   */
  async pause(): Promise<void> {
    if (this.state !== RecorderState.RECORDING) {
      const error = new Error(`Cannot pause from state ${this.state}`)
      logger.warn('Pause failed:', error.message)
      throw error
    }

    if (!this.page) {
      const error = new Error('Cannot pause - no page available')
      logger.warn('Pause failed:', error.message)
      throw error
    }

    this.state = RecorderState.PAUSED
    this.pauseStartedAt = Date.now()
    
    logger.info('🔶 Recording paused')

    await this.updateWidgetState('paused')

    this.emit('paused')
  }

  /**
   * Resumes the recording session
   * Accumulates paused duration and continues recording
   * @throws {Error} If not in PAUSED state
   */
  async resume(): Promise<void> {
    if (this.state !== RecorderState.PAUSED) {
      const error = new Error(`Cannot resume from state ${this.state}`)
      logger.warn('Resume failed:', error.message)
      throw error
    }

    if (!this.page) {
      const error = new Error('Cannot resume - no page available')
      logger.warn('Resume failed:', error.message)
      throw error
    }

    // Accumulate paused duration
    if (this.pauseStartedAt !== null) {
      this.pausedDurationMs += Date.now() - this.pauseStartedAt
      this.pauseStartedAt = null
    }

    this.state = RecorderState.RECORDING
    
    logger.info('▶️ Recording resumed', `(paused for ${this.pausedDurationMs}ms total)`)

    await this.updateWidgetState('recording')

    this.emit('resumed')
  }

  /**
   * Stops the browser recorder and cleans up resources
   * Removes all event listeners to prevent memory leaks
   */
  async stop(): Promise<void> {
    this.state = RecorderState.IDLE

    // Remove all event listeners
    if (this.page && this.frameNavigatedHandler) {
      this.page.removeListener('framenavigated', this.frameNavigatedHandler)
      this.frameNavigatedHandler = null
    }
    
    if (this.browser) {
      await this.browser.close()
      this.browser = null
      this.page = null
    }
  }
}
