/**
 * Recording widget for browser injection
 * Creates a floating widget with screenshot and assertion mode buttons
 *
 * IMPORTANT: This file is converted to a string and injected via page.addInitScript()
 * Keep it self-contained with no external imports.
 */

/**
 * Returns the widget creation script as a function to be executed in the browser context
 */
export function getWidgetScript(): () => void {
  return () => {
    // Skip injection in iframes to reduce overhead and prevent duplicates
    if (window !== window.top) {
      return
    }

    // Constants must be defined inside the function scope for injection
    const WIDGET_HOST_ID = '__kiwi-widget-host'
    
    // Window interface for injected functions
    // NOTE: Keep in sync with shared/browser-context.ts (cannot import at runtime)
    interface KiwiWindow extends Window {
      __kiwiRecordAction: (data: string) => void
      __kiwiTakeScreenshot: () => Promise<string | null>
      __kiwiAssertionMode: () => boolean
      __kiwiDisableAssertionMode: () => void
      __kiwiAudioActive: boolean
      __kiwiRecordingPaused?: boolean
      /** Session token injected by recorder.ts — must be passed to pause/resume. */
      __kiwiSessionToken?: string
      __kiwiPauseRecording?: (token: string) => Promise<void>
      __kiwiResumeRecording?: (token: string) => Promise<void>
      __kiwiCreateHighlighter?: () => void
    }

    // Prevent duplicate widget creation
    if (document.getElementById(WIDGET_HOST_ID)) {
      console.log('[KiwiGen] Widget already exists, skipping creation')
      return
    }

    // Initialize state globals if not already set
    const win = window as unknown as KiwiWindow
    if (typeof win.__kiwiAudioActive === 'undefined') {
      win.__kiwiAudioActive = false
    }
    if (typeof win.__kiwiRecordingPaused === 'undefined') {
      win.__kiwiRecordingPaused = false
    }
    
    // Detect OS for tooltip text
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    const modKey = isMac ? 'Cmd' : 'Ctrl'
    
    // Access injected functions
    const recordAction = (window as unknown as KiwiWindow).__kiwiRecordAction
    const takeScreenshot = (window as unknown as KiwiWindow).__kiwiTakeScreenshot
    
    // Create widget host element
    const widgetHost = document.createElement('div')
    widgetHost.id = WIDGET_HOST_ID
    widgetHost.style.cssText = 'position: fixed; z-index: 2147483647; pointer-events: none;'
    
    // Mark as non-React element to prevent React from touching it
    widgetHost.setAttribute('data-dodo-recorder', 'true')
    
    // Attach shadow DOM to prevent CSS conflicts
    const shadow = widgetHost.attachShadow({ mode: 'closed' })
    
    // Create style element
    const style = document.createElement('style')
    style.textContent = `
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        .dodo-widget {
          pointer-events: auto;
          position: fixed;
          top: 20px;
          right: 20px;
          background: rgba(10, 10, 11, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 8px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 14px;
          color: white;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          user-select: none;
          cursor: move;
          transition: opacity 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;
          display: flex;
          gap: 8px;
        }

        .dodo-widget.paused {
          background: rgba(51, 65, 85, 1);
          border: 2px solid rgba(148, 163, 184, 0.6);
          box-shadow: 0 4px 16px rgba(100, 116, 139, 0.2);
        }

        .dodo-widget.dragging {
          transition: none;
          opacity: 0.8;
        }

        .dodo-widget.snapping {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .widget-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: rgba(255, 255, 255, 0.8);
          cursor: pointer;
          padding: 8px 12px;
          transition: all 0.2s ease;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 40px;
          height: 40px;
        }

        .widget-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .widget-btn svg {
          width: 22px;
          height: 22px;
          transition: all 0.2s ease;
        }

        .widget-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.25);
        }
        
        .widget-btn:hover svg path:first-child,
        .widget-btn:hover svg circle:first-child {
          fill: rgba(120, 136, 159, 0.9);
          stroke: rgba(168, 183, 204, 1);
        }

        .widget-btn:active {
          transform: scale(0.95);
        }

        .widget-btn.active {
          background: rgba(59, 130, 246, 0.25);
          border-color: rgba(59, 130, 246, 0.6);
        }
        
        .widget-btn.active svg path:first-child,
        .widget-btn.active svg circle:first-child {
          fill: rgba(96, 165, 250, 0.5);
          stroke: rgba(147, 197, 253, 0.9);
        }
        
        .widget-btn.active svg circle:nth-child(2) {
          fill: rgba(59, 130, 246, 0.7);
          stroke: rgba(147, 197, 253, 0.9);
        }
        
        .widget-btn.active svg circle:nth-child(3) {
          fill: rgba(37, 99, 235, 0.9);
        }

        .widget-btn.flash {
          animation: flash 0.3s ease;
        }

        @keyframes flash {
          0%, 100% {
            background: rgba(255, 255, 255, 0.05);
          }
          50% {
            background: rgba(255, 255, 255, 0.3);
          }
        }
        
        /* Tooltip styles */
        .tooltip {
          position: absolute;
          bottom: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0, 0, 0, 0.9);
          color: white;
          padding: 6px 10px;
          border-radius: 4px;
          font-size: 12px;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.2s ease;
          z-index: 10;
        }
        
        .tooltip::after {
          content: '';
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border: 4px solid transparent;
          border-top-color: rgba(0, 0, 0, 0.9);
        }
        
        .widget-btn:hover .tooltip {
          opacity: 1;
          transition-delay: 0.5s;
        }

        /* Voice recording indicator */
        .voice-indicator {
          display: none;
          width: 10px;
          height: 10px;
          background: #ef4444;
          border-radius: 50%;
          animation: pulse 1.5s ease-in-out infinite;
        }

        .voice-indicator.active {
          display: block;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.5;
            transform: scale(0.85);
          }
        }
      `
    
    // Create widget structure programmatically
    const widget = document.createElement('div')
    widget.className = 'dodo-widget'
    widget.id = 'widget'

    // Pause/Resume button
    const pauseResumeBtn = document.createElement('button')
    pauseResumeBtn.className = 'widget-btn'
    pauseResumeBtn.id = 'pause-resume-btn'
    pauseResumeBtn.title = 'Pause Recording'
    pauseResumeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="6" y="4" width="4" height="16" fill="rgba(100, 116, 139, 0.8)" stroke="rgba(148, 163, 184, 0.9)"></rect>
      <rect x="14" y="4" width="4" height="16" fill="rgba(100, 116, 139, 0.8)" stroke="rgba(148, 163, 184, 0.9)"></rect>
    </svg>`

    const pauseResumeTooltip = document.createElement('span')
    pauseResumeTooltip.className = 'tooltip'
    pauseResumeTooltip.textContent = 'Pause Recording'
    pauseResumeBtn.appendChild(pauseResumeTooltip)

    // Screenshot button
    const screenshotBtn = document.createElement('button')
    screenshotBtn.className = 'widget-btn'
    screenshotBtn.id = 'screenshot-btn'
    screenshotBtn.title = `Screenshot (${modKey}+Shift+S)`
    screenshotBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" fill="rgba(100, 116, 139, 0.8)" stroke="rgba(148, 163, 184, 0.9)"></path>
      <circle cx="12" cy="13" r="3" fill="rgba(51, 65, 85, 0.9)" stroke="rgba(148, 163, 184, 0.9)"></circle>
      <circle cx="12" cy="13" r="1.5" fill="rgba(30, 41, 59, 1)"></circle>
    </svg>`

    const screenshotTooltip = document.createElement('span')
    screenshotTooltip.className = 'tooltip'
    screenshotTooltip.textContent = `Screenshot (${modKey}+Shift+S)`
    screenshotBtn.appendChild(screenshotTooltip)

    // Assertion button
    const assertionBtn = document.createElement('button')
    assertionBtn.className = 'widget-btn'
    assertionBtn.id = 'assertion-btn'
    assertionBtn.title = `Assertion Mode (${modKey}+Click)`
    assertionBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" fill="rgba(100, 116, 139, 0.7)" stroke="rgba(148, 163, 184, 0.9)"></path>
      <circle cx="12" cy="12" r="4" fill="rgba(71, 85, 105, 0.9)" stroke="rgba(148, 163, 184, 0.9)"></circle>
      <circle cx="12" cy="12" r="2.5" fill="rgba(30, 41, 59, 1)" stroke="rgba(51, 65, 85, 0.8)"></circle>
      <circle cx="12" cy="12" r="1" fill="rgba(15, 23, 42, 1)"></circle>
      <circle cx="13" cy="11" r="0.5" fill="rgba(226, 232, 240, 0.8)"></circle>
    </svg>`

    const assertionTooltip = document.createElement('span')
    assertionTooltip.className = 'tooltip'
    assertionTooltip.textContent = `Assertion Mode (${modKey}+Click)`
    assertionBtn.appendChild(assertionTooltip)

    // Voice recording indicator (pulsing red dot)
    const voiceIndicator = document.createElement('div')
    voiceIndicator.className = 'voice-indicator'
    voiceIndicator.id = 'voice-indicator'
    
    // Check initial audio state and show indicator if active
    if (win.__kiwiAudioActive) {
      voiceIndicator.classList.add('active')
    }
    
    // Poll for audio state changes during the first second after widget creation
    // This handles race conditions where audio activity is set before widget is ready
    let pollCount = 0
    const pollInterval = setInterval(() => {
      pollCount++
      
      // Check if audio is now active and indicator is not showing
      if (win.__kiwiAudioActive && !voiceIndicator.classList.contains('active')) {
        const isPaused = win.__kiwiRecordingPaused === true
        if (!isPaused) {
          voiceIndicator.classList.add('active')
          console.log('[Kiwi Widget] Audio indicator activated via polling')
        }
      }
      
      // Stop polling after 10 checks (1 second total)
      if (pollCount >= 10) {
        clearInterval(pollInterval)
      }
    }, 100)

    widget.appendChild(pauseResumeBtn)
    widget.appendChild(screenshotBtn)
    widget.appendChild(assertionBtn)
    widget.appendChild(voiceIndicator)
    
    // Append style and widget to shadow DOM
    shadow.appendChild(style)
    shadow.appendChild(widget)
    
    // Append to body immediately to ensure it renders
    try {
      document.body.appendChild(widgetHost)
      console.log('[KiwiGen] Widget host appended to body')
    } catch (error) {
      console.error('[KiwiGen] Failed to append widget to body:', error)
      return
    }
    
    // Widget drag state
    let isDragging = false
    let dragStartX = 0
    let dragStartY = 0
    let widgetStartX = 0
    let widgetStartY = 0
    let assertionModeActive = false
    
    // Get widget position
    const getWidgetPosition = () => {
      const rect = widget.getBoundingClientRect()
      return {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      }
    }
    
    // Set widget position
    const setWidgetPosition = (x: number, y: number) => {
      widget.style.left = x + 'px'
      widget.style.top = y + 'px'
      widget.style.right = 'auto'
      widget.style.bottom = 'auto'
    }
    
    // Calculate nearest edge and snap
    const snapToEdge = () => {
      const pos = getWidgetPosition()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      
      // Calculate distances to each edge
      const distToTop = pos.y
      const distToBottom = viewportHeight - (pos.y + pos.height)
      const distToLeft = pos.x
      const distToRight = viewportWidth - (pos.x + pos.width)
      
      // Find minimum distance
      const minDist = Math.min(distToTop, distToBottom, distToLeft, distToRight)
      
      // Snap to nearest edge with padding
      const padding = 20
      let newX = pos.x
      let newY = pos.y
      
      if (minDist === distToTop) {
        newY = padding
      } else if (minDist === distToBottom) {
        newY = viewportHeight - pos.height - padding
      } else if (minDist === distToLeft) {
        newX = padding
      } else if (minDist === distToRight) {
        newX = viewportWidth - pos.width - padding
      }
      
      // Apply snapping animation
      widget.classList.add('snapping')
      setWidgetPosition(newX, newY)
      
      setTimeout(() => {
        widget.classList.remove('snapping')
      }, 300)
    }
    
    // Pause/Resume button click handler
    pauseResumeBtn.addEventListener('click', async (e) => {
      e.stopPropagation()

      const win = window as unknown as KiwiWindow
      const isPaused = win.__kiwiRecordingPaused === true
      const sessionToken = win.__kiwiSessionToken ?? ''

      try {
        if (isPaused) {
          // Resume
          if (typeof win.__kiwiResumeRecording === 'function') {
            await win.__kiwiResumeRecording(sessionToken)
            console.log('[Kiwi Widget] Recording resumed')
            pauseResumeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="6" y="4" width="4" height="16" fill="rgba(100, 116, 139, 0.8)" stroke="rgba(148, 163, 184, 0.9)"></rect>
              <rect x="14" y="4" width="4" height="16" fill="rgba(100, 116, 139, 0.8)" stroke="rgba(148, 163, 184, 0.9)"></rect>
            </svg>`
            pauseResumeTooltip.textContent = 'Pause Recording'
            // Re-enable other buttons
            screenshotBtn.disabled = false
            assertionBtn.disabled = false
            // Remove paused visual state
            widget.classList.remove('paused')
            // Show voice indicator if audio is active
            if (win.__kiwiAudioActive) {
              voiceIndicator.classList.add('active')
            }
          }
        } else {
          // Pause
          if (typeof win.__kiwiPauseRecording === 'function') {
            await win.__kiwiPauseRecording(sessionToken)
            console.log('[Kiwi Widget] Recording paused')
            pauseResumeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" fill="rgba(100, 116, 139, 0.8)" stroke="rgba(148, 163, 184, 0.9)"></polygon>
            </svg>`
            pauseResumeTooltip.textContent = 'Resume Recording'
            // Disable other buttons while paused
            screenshotBtn.disabled = true
            assertionBtn.disabled = true
            // Add paused visual state
            widget.classList.add('paused')
            // Hide voice indicator when paused
            voiceIndicator.classList.remove('active')
          }
        }
      } catch (error) {
        console.error('[Kiwi Widget] Pause/Resume failed:', error)
      }
    })

    // Screenshot button click handler
    screenshotBtn.addEventListener('click', async (e) => {
      e.stopPropagation()

      screenshotBtn.classList.add('flash')
      setTimeout(() => screenshotBtn.classList.remove('flash'), 300)

      try {
        const screenshotPath = await takeScreenshot()
        if (screenshotPath) {
          recordAction(JSON.stringify({
            type: 'screenshot',
            screenshot: screenshotPath,
          }))
        }
      } catch (error) {
        console.error('[Kiwi Widget] Screenshot failed:', error)
      }
    })

    // Assertion button click handler
    assertionBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      assertionModeActive = !assertionModeActive

      if (assertionModeActive) {
        assertionBtn.classList.add('active')
      } else {
        assertionBtn.classList.remove('active')
      }
    })

    // Drag handlers
    widget.addEventListener('mousedown', (e) => {
      if (e.target !== widget && !widget.contains(e.target as Node)) return

      isDragging = true
      widget.classList.add('dragging')

      const pos = getWidgetPosition()
      dragStartX = e.clientX
      dragStartY = e.clientY
      widgetStartX = pos.x
      widgetStartY = pos.y

      e.preventDefault()
    })
    
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return
      
      const deltaX = e.clientX - dragStartX
      const deltaY = e.clientY - dragStartY
      
      const newX = widgetStartX + deltaX
      const newY = widgetStartY + deltaY
      
      setWidgetPosition(newX, newY)
    })
    
    document.addEventListener('mouseup', () => {
      if (!isDragging) return
      
      isDragging = false
      widget.classList.remove('dragging')
      
      // Snap to nearest edge
      snapToEdge()
    })
    
    // Expose assertion mode functions to window
    ;(window as unknown as KiwiWindow).__kiwiAssertionMode = () => assertionModeActive
    ;(window as unknown as KiwiWindow).__kiwiDisableAssertionMode = () => {
      assertionModeActive = false
      assertionBtn.classList.remove('active')
    }

    console.log('[KiwiGen] Widget initialized')
  }
}

/**
 * Returns the widget initialization code to be injected
 * This ensures the widget is created when the DOM is ready
 */
export function getWidgetInitScript(): () => void {
  return () => {
    const WIDGET_HOST_ID = '__kiwi-widget-host'
    let observer: MutationObserver | null = null
    
    const createWidget = () => {
      // Only create if widget doesn't already exist
      if (document.getElementById(WIDGET_HOST_ID)) {
        console.log('[Dodo Recorder Init] Widget already exists, skipping')
        return
      }
      
      if (typeof (window as any).__kiwiCreateWidget === 'function') {
        console.log('[Dodo Recorder Init] Creating widget...')
        ;(window as any).__kiwiCreateWidget()
      } else {
        console.warn('[Dodo Recorder Init] __kiwiCreateWidget not available')
      }
    }
    
    const initWidget = () => {
      try {
        // Wait for document.body to be available before creating widget
        const checkBodyAndCreate = () => {
          if (document.body) {
            createWidget()
            setupWidgetMonitor()
          } else {
            // If body doesn't exist yet, wait a bit and try again
            setTimeout(checkBodyAndCreate, 50)
          }
        }
        
        // Small delay to ensure page scripts have loaded and body is ready
        setTimeout(checkBodyAndCreate, 100)
      } catch (error) {
        console.error('[KiwiGen] Failed to create widget:', error)
      }
    }
    
    /**
     * Monitor for widget removal and recreate it
     * This handles aggressive DOM manipulation by SPAs, cookie banners, modals, etc.
     */
    const setupWidgetMonitor = () => {
      if (observer) {
        // Observer already running
        return
      }
      
      console.log('[KiwiGen] Setting up widget monitor...')
      
      // Use MutationObserver to watch for widget removal
      observer = new MutationObserver((mutations) => {
        // Check if widget still exists in DOM
        const widgetExists = document.getElementById(WIDGET_HOST_ID)
        
        if (!widgetExists && document.body) {
          console.log('[KiwiGen] Widget removed from DOM, recreating...')
          createWidget()
        }
      })
      
      // Observe body for child list changes (when elements are added/removed)
      // Also observe documentElement in case body itself is replaced
      if (document.body) {
        observer.observe(document.body, {
          childList: true,
          subtree: false, // Only watch direct children of body
        })
      }
      
      // Watch document.documentElement for body replacement
      observer.observe(document.documentElement, {
        childList: true,
        subtree: false,
      })
      
      // Periodic check as backup (every 2 seconds)
      setInterval(() => {
        const widgetExists = document.getElementById(WIDGET_HOST_ID)
        if (!widgetExists && document.body) {
          console.log('[KiwiGen] Widget missing (periodic check), recreating...')
          createWidget()
        }
      }, 2000)
    }
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initWidget)
    } else {
      initWidget()
    }
  }
}
