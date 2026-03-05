/**
 * Hover highlighter for assertion mode
 * 
 * Displays a visual overlay when hovering over elements during assertion mode,
 * similar to browser DevTools inspector or Playwright code generator.
 * 
 * Key features:
 * - Dual trigger mode: widget button OR Cmd/Ctrl modifier key
 * - Semi-transparent blue overlay on hovered element
 * - Solid border outline for clear boundaries  
 * - Small label showing element selector
 * - Isolated in Shadow DOM to prevent style conflicts
 * - Performance optimized with RAF and passive event listeners
 * 
 * Integration:
 * - Checks window.__kiwiAssertionMode() for widget mode state
 * - Tracks Cmd/Ctrl key press state for transient mode
 * - Excludes recording widget from highlighting
 * - Does not interfere with click event recording
 * 
 * @see electron/browser/recorder.ts - Script injection
 * @see electron/browser/recording-widget.ts - Assertion mode state
 * @see plans/hover-highlighting-feature.md - Original feature plan
 * @see plans/hover-highlighting-addendum.md - Dual trigger analysis
 */

interface KiwiWindow extends Window {
  __kiwiAssertionMode?: () => boolean
  __kiwiDisableAssertionMode?: () => void
}

/**
 * Returns the highlighter script as a self-contained function
 * This function will be injected into the browser context and executed
 */
export function getHighlighterScript(): () => void {
  return () => {
    // Type guard for KiwiWindow
    const win = window as KiwiWindow

    // Debug flag - set to false to disable console logs in production
    const DEBUG = false

    // Global state
    let isCommandKeyPressed = false // Tracks Cmd (Mac) or Ctrl (Win)
    let currentTarget: Element | null = null
    let rafId: number | null = null

    // Make initialization idempotent - check if already exists
    if (document.getElementById('__kiwi-highlight-overlay-host')) {
      if (DEBUG) console.log('[Kiwi Highlighter] Already initialized, skipping')
      return
    }

    // Shadow DOM host for isolation
    const highlightHost = document.createElement('div')
    highlightHost.id = '__kiwi-highlight-overlay-host'
    highlightHost.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 2147483646;
    `

    const shadow = highlightHost.attachShadow({ mode: 'closed' })

    // Overlay element (semi-transparent background)
    const overlay = document.createElement('div')
    overlay.className = 'highlight-overlay'
    overlay.style.cssText = `
      position: absolute;
      background: rgba(59, 130, 246, 0.2);
      border: 2px solid rgba(59, 130, 246, 0.8);
      pointer-events: none;
      transition: opacity 0.1s cubic-bezier(0.4, 0, 0.2, 1), transform 0.1s cubic-bezier(0.4, 0, 0.2, 1);
      display: none;
      box-sizing: border-box;
      border-radius: 2px;
    `

    // Label element (selector info)
    const label = document.createElement('div')
    label.className = 'highlight-label'
    label.style.cssText = `
      position: absolute;
      background: rgba(59, 130, 246, 0.95);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      line-height: 1.4;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      pointer-events: none;
      white-space: nowrap;
      display: none;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      transition: opacity 0.15s ease-out;
    `

    shadow.appendChild(overlay)
    shadow.appendChild(label)
    document.body.appendChild(highlightHost)

    /**
     * Check if element is within the recording widget
     */
    function isWithinWidget(element: Element): boolean {
      let current: Element | null = element
      while (current) {
        if (
          current.id === '__kiwi-widget-host' ||
          current.id === '__kiwi-highlight-overlay-host'
        ) {
          return true
        }
        // Check shadow host
        const root = current.getRootNode()
        if (root instanceof ShadowRoot) {
          current = root.host as Element
        } else {
          current = current.parentElement
        }
      }
      return false
    }

    /**
     * Escape attribute value for safe display in selector strings
     */
    function escapeAttributeValue(value: string): string {
      return value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
    }

    /**
     * Generate element label showing selector strategy
     */
    function getElementLabel(element: Element): string {
      const tagName = element.tagName.toLowerCase()
      const testId = element.getAttribute('data-testid')
      const id = element.id
      const role = element.getAttribute('role')
      const type = element.getAttribute('type')
      const name = element.getAttribute('name')

      if (testId) return `[data-testid="${escapeAttributeValue(testId)}"]`
      if (id) return `#${escapeAttributeValue(id)}`
      if (role) return `${tagName}[role="${escapeAttributeValue(role)}"]`
      if (type && tagName === 'input') return `input[type="${escapeAttributeValue(type)}"]`
      if (name) return `[name="${escapeAttributeValue(name)}"]`

      // Check for text content (buttons, links)
      if (tagName === 'button' || tagName === 'a') {
        const text = element.textContent?.trim().substring(0, 20)
        if (text) return `${tagName}:text("${escapeAttributeValue(text)}${text.length > 20 ? '...' : ''}")`
      }

      return tagName
    }

    /**
     * Update overlay position and visibility
     */
    function updateOverlay(element: Element): void {
      const rect = element.getBoundingClientRect()

      if (DEBUG) console.log('[Kiwi Highlighter] Updating overlay for:', element.tagName, 'Rect:', rect)

      // Show overlay
      overlay.style.display = 'block'
      overlay.style.left = `${rect.left}px`
      overlay.style.top = `${rect.top}px`
      overlay.style.width = `${rect.width}px`
      overlay.style.height = `${rect.height}px`

      // Show label positioned above element (or below if near top)
      label.textContent = getElementLabel(element)
      label.style.display = 'block'

      // Clamp label position to viewport bounds
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const labelWidth = label.offsetWidth || 100 // Fallback estimate
      const labelHeight = 24 // Approximate label height
      
      // Clamp horizontal position
      let labelLeft = Math.max(0, Math.min(rect.left, viewportWidth - labelWidth))
      label.style.left = `${labelLeft}px`

      // Position label above or below based on space, clamped to viewport
      let labelTop: number
      if (rect.top > 30) {
        labelTop = Math.max(0, rect.top - labelHeight)
      } else {
        labelTop = Math.min(rect.bottom + 4, viewportHeight - labelHeight)
      }
      label.style.top = `${labelTop}px`
      
      if (DEBUG) console.log('[Kiwi Highlighter] Overlay displayed at:', overlay.style.left, overlay.style.top, overlay.style.width, overlay.style.height)
    }

    /**
     * Hide overlay and label
     */
    function hideOverlay(): void {
      overlay.style.display = 'none'
      label.style.display = 'none'
      currentTarget = null

      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
    }

    /**
     * Check if assertion mode is active (dual trigger check)
     */
    function isAssertionModeActive(): boolean {
      const widgetMode = win.__kiwiAssertionMode?.() || false
      const keyMode = isCommandKeyPressed
      return widgetMode || keyMode
    }

    /**
     * Schedule overlay update with RAF throttling
     */
    function scheduleUpdate(element: Element): void {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }

      rafId = requestAnimationFrame(() => {
        updateOverlay(element)
        rafId = null
      })
    }

    // ========================================
    // Event Listeners
    // ========================================

    /**
     * Mousemove handler - Shows overlay on hover in assertion mode
     */
    document.addEventListener(
      'mousemove',
      (e) => {
        // Guard against non-Element targets (text nodes, SVG fragments, etc.)
        if (!(e.target instanceof Element)) {
          return
        }
        
        const target = e.target

        // Check if assertion mode is active (widget OR key)
        const assertionActive = isAssertionModeActive()
        if (!assertionActive) {
          if (overlay.style.display !== 'none') {
            hideOverlay()
          }
          return
        }

        // Skip if hovering over widget or overlay
        if (isWithinWidget(target)) {
          hideOverlay()
          return
        }

        // Skip if same element (no need to update)
        if (target === currentTarget) {
          return
        }

        if (DEBUG) console.log('[Kiwi Highlighter] Hovering over:', target.tagName, 'Assertion mode:', assertionActive)
        currentTarget = target
        scheduleUpdate(target)
      },
      { passive: true }
    )

    /**
     * Keydown handler - Activate transient mode on Cmd/Ctrl
     */
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.metaKey || e.ctrlKey) {
          if (!isCommandKeyPressed) {
            isCommandKeyPressed = true
            if (DEBUG) console.log('[Kiwi Highlighter] Transient mode activated (key press)')
          }
        }
      },
      { passive: true }
    )

    /**
     * Keyup handler - Deactivate transient mode on key release
     */
    document.addEventListener(
      'keyup',
      (e) => {
        // Check if both modifier keys are released
        if (!e.metaKey && !e.ctrlKey) {
          if (isCommandKeyPressed) {
            isCommandKeyPressed = false
            if (DEBUG) console.log('[Kiwi Highlighter] Transient mode deactivated (key release)')
            // Immediately hide overlay if widget mode is also off
            if (!win.__kiwiAssertionMode?.()) {
              hideOverlay()
            }
          }
        }
      },
      { passive: true }
    )

    /**
     * Window blur handler - Clean up key state on focus loss
     */
    window.addEventListener('blur', () => {
      if (isCommandKeyPressed) {
        isCommandKeyPressed = false
        if (DEBUG) console.log('[Kiwi Highlighter] Transient mode deactivated (window blur)')
        // Hide overlay if widget mode is also off
        if (!win.__kiwiAssertionMode?.()) {
          hideOverlay()
        }
      }
    })

    /**
     * Scroll handler - Update overlay position during scroll
     */
    window.addEventListener(
      'scroll',
      () => {
        if (currentTarget && isAssertionModeActive()) {
          scheduleUpdate(currentTarget)
        }
      },
      { passive: true }
    )

    /**
     * Periodic check - Ensure overlay state matches assertion mode
     * Handles edge cases where mode changes outside of events
     */
    setInterval(() => {
      if (!isAssertionModeActive() && overlay.style.display !== 'none') {
        hideOverlay()
      }
    }, 100)

    if (DEBUG) console.log('[Kiwi Highlighter] Hover highlighting initialized with dual trigger mode')
  }
}

/**
 * Returns the initialization script that calls the highlighter
 */
export function getHighlighterInitScript(): () => void {
  return () => {
    const DEBUG = false // Match debug flag from main script
    const HIGHLIGHTER_HOST_ID = '__kiwi-highlight-overlay-host'
    let observer: MutationObserver | null = null
    
    const createHighlighter = () => {
      // Only create if highlighter doesn't already exist
      if (document.getElementById(HIGHLIGHTER_HOST_ID)) {
        if (DEBUG) console.log('[Dodo Highlighter Init] Highlighter already exists, skipping')
        return
      }
      
      if (typeof (window as any).__kiwiCreateHighlighter === 'function') {
        if (DEBUG) console.log('[Dodo Highlighter Init] Creating highlighter...')
        ;(window as any).__kiwiCreateHighlighter()
      } else {
        console.warn('[Dodo Highlighter Init] __kiwiCreateHighlighter not available')
      }
    }
    
    const initHighlighter = () => {
      try {
        // Wait for document.body to be available before creating highlighter
        const checkBodyAndCreate = () => {
          if (document.body) {
            createHighlighter()
            setupHighlighterMonitor()
          } else {
            // If body doesn't exist yet, wait a bit and try again
            setTimeout(checkBodyAndCreate, 50)
          }
        }
        
        // Small delay to ensure page scripts have loaded and body is ready
        setTimeout(checkBodyAndCreate, 100)
      } catch (error) {
        console.error('[Kiwi Highlighter] Failed to initialize:', error)
      }
    }
    
    /**
     * Monitor for highlighter removal and recreate it
     * This handles aggressive DOM manipulation by SPAs, cookie banners, modals, etc.
     */
    const setupHighlighterMonitor = () => {
      if (observer) {
        // Observer already running
        return
      }
      
      if (DEBUG) console.log('[Kiwi Highlighter] Setting up highlighter monitor...')
      
      // Use MutationObserver to watch for highlighter removal
      observer = new MutationObserver((mutations) => {
        // Check if highlighter still exists in DOM
        const highlighterExists = document.getElementById(HIGHLIGHTER_HOST_ID)
        
        if (!highlighterExists && document.body) {
          if (DEBUG) console.log('[Kiwi Highlighter] Highlighter removed from DOM, recreating...')
          createHighlighter()
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
        const highlighterExists = document.getElementById(HIGHLIGHTER_HOST_ID)
        if (!highlighterExists && document.body) {
          if (DEBUG) console.log('[Kiwi Highlighter] Highlighter missing (periodic check), recreating...')
          createHighlighter()
        }
      }, 2000)
    }
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initHighlighter)
    } else {
      initHighlighter()
    }
  }
}
