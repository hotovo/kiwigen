/**
 * Browser injection script for recording user interactions
 * This script is injected into every page to capture clicks, inputs, navigation, etc.
 * 
 * IMPORTANT: This file is converted to a string and injected via page.addInitScript()
 * Keep it self-contained with no external imports.
 */

/**
 * Returns the injection script as a function to be executed in the browser context
 * This function will be serialized and injected into the page
 */
export function getInjectionScript(): () => void {
  return () => {
    // Skip injection in iframes to reduce overhead
    if (window !== window.top) return

    // ===== Constants =====
    const INPUT_DEBOUNCE_MS = 1000 // Wait 1 second after last keystroke
    const WIDGET_HOST_ID = '__kiwi-widget-host'
    const REDACTED_INPUT_VALUE = '[REDACTED]'

    // ===== Utility Functions Module =====
    const utils = {
      escapeForJson: (str: string): string => {
        return str
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t')
          .replace(/\f/g, '\\f')
          .replace(/\b/g, '\\b')
      },

      getTestId: (el: Element): string | null =>
        el.getAttribute('data-testid') ||
        el.getAttribute('data-test-id') ||
        el.getAttribute('data-test'),

      truncateText: (text: string, maxLength: number): string =>
        text.slice(0, maxLength),

      redactInputValue: (target: HTMLInputElement | HTMLTextAreaElement): string => {
        const targetType = target instanceof HTMLInputElement ? target.type.toLowerCase() : 'textarea'
        const targetHints = [
          target.name,
          target.id,
          target.getAttribute('autocomplete'),
          target.getAttribute('placeholder'),
          target.getAttribute('aria-label'),
        ]
          .filter((value): value is string => typeof value === 'string' && value.length > 0)
          .join(' ')
          .toLowerCase()

        const isSensitiveType = ['password', 'hidden'].includes(targetType)
        const hasSensitiveHint = /(pass(word|code)?|secret|token|api[-_ ]?key|auth|otp|one[-_ ]?time|2fa|verification|verify|pin|ssn|card(number)?|cvv|cvc)/.test(targetHints)

        return isSensitiveType || hasSensitiveHint ? REDACTED_INPUT_VALUE : target.value
      },

      VALID_ID_PATTERN: /^[a-zA-Z][a-zA-Z0-9_-]*$/,
    }

    // ===== Locator Generation Module =====
    type LocatorStrategy = 'testId' | 'id' | 'role' | 'placeholder' | 'text' | 'css' | 'xpath'
    interface Locator {
      strategy: LocatorStrategy
      value: string
      confidence: 'high' | 'medium' | 'low'
    }

    const locatorGenerator = {
      generateXPath: (el: Element): string => {
        if (el.id && utils.VALID_ID_PATTERN.test(el.id)) {
          return `//*[@id="${el.id}"]`
        }
        
        const parts: string[] = []
        let current: Element | null = el
        
        while (current && current.nodeType === Node.ELEMENT_NODE) {
          let index = 1
          let sibling = current.previousElementSibling
          
          while (sibling) {
            if (sibling.tagName === current.tagName) index++
            sibling = sibling.previousElementSibling
          }
          
          const tagName = current.tagName.toLowerCase()
          parts.unshift(index > 1 ? `${tagName}[${index}]` : tagName)
          current = current.parentElement
        }
        
        return '/' + parts.join('/')
      },

      generateCssSelector: (el: Element): string => {
        const parts: string[] = []
        let current: Element | null = el
        
        while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 4) {
          let selector = current.tagName.toLowerCase()
          
          if (current.id && utils.VALID_ID_PATTERN.test(current.id)) {
            parts.unshift(`#${current.id}`)
            break
          }
          
          if (current.className && typeof current.className === 'string') {
            const classes = current.className.trim().split(/\s+/).filter(c =>
              c && !/^(ng-|js-|is-|has-)/.test(c) && c.length < 30
            ).slice(0, 2)
            if (classes.length) {
              selector += '.' + classes.join('.')
            }
          }
          
          const parent = current.parentElement
          if (parent) {
            const siblings = Array.from(parent.children).filter(c => c.tagName === current!.tagName)
            if (siblings.length > 1) {
              const index = siblings.indexOf(current) + 1
              selector += `:nth-of-type(${index})`
            }
          }
          
          parts.unshift(selector)
          current = current.parentElement
        }
        
        return parts.join(' > ')
      },

      buildLocators: (element: Element): Locator[] => {
        const locators: Locator[] = []
        const tagName = element.tagName.toLowerCase()
        
        const testId = utils.getTestId(element)
        if (testId) {
          locators.push({
            strategy: 'testId',
            value: `[data-testid="${utils.escapeForJson(testId)}"]`,
            confidence: 'high'
          })
        }
        
        if (element.id && utils.VALID_ID_PATTERN.test(element.id)) {
          locators.push({
            strategy: 'id',
            value: `#${element.id}`,
            confidence: 'high'
          })
        }
        
        const role = element.getAttribute('role')
        const ariaLabel = element.getAttribute('aria-label')
        if (role && ariaLabel) {
          locators.push({
            strategy: 'role',
            value: `getByRole('${role}', { name: '${utils.escapeForJson(ariaLabel)}' })`,
            confidence: 'high'
          })
        } else if (ariaLabel) {
          locators.push({
            strategy: 'role',
            value: `getByLabel('${utils.escapeForJson(ariaLabel)}')`,
            confidence: 'medium'
          })
        }
        
        const placeholder = element.getAttribute('placeholder')
        if (placeholder && ['input', 'textarea'].includes(tagName)) {
          locators.push({
            strategy: 'placeholder',
            value: `getByPlaceholder('${utils.escapeForJson(placeholder)}')`,
            confidence: 'medium'
          })
        }
        
        const text = (element.textContent || '').trim()
        if (text && text.length > 0 && text.length < 50 && ['button', 'a', 'span', 'label', 'h1', 'h2', 'h3', 'h4', 'p'].includes(tagName)) {
          locators.push({
            strategy: 'text',
            value: `getByText('${utils.escapeForJson(utils.truncateText(text, 40))}')`,
            confidence: text.length < 20 ? 'medium' : 'low'
          })
        }
        
        const cssSelector = locatorGenerator.generateCssSelector(element)
        if (cssSelector) {
          locators.push({
            strategy: 'css',
            value: cssSelector,
            confidence: cssSelector.includes('#') ? 'medium' : 'low'
          })
        }
        
        locators.push({
          strategy: 'xpath',
          value: locatorGenerator.generateXPath(element),
          confidence: 'low'
        })
        
        const priorityOrder: LocatorStrategy[] = ['testId', 'id', 'role', 'placeholder', 'text', 'css', 'xpath']
        locators.sort((a, b) => priorityOrder.indexOf(a.strategy) - priorityOrder.indexOf(b.strategy))
        
        // Ensure we always have at least one locator (fallback to xpath)
        if (locators.length === 0) {
          locators.push({
            strategy: 'xpath',
            value: locatorGenerator.generateXPath(element),
            confidence: 'low'
          })
        }
        
        return locators.slice(0, 3)
      },
    }

    // ===== Element Info Extraction Module =====
    const getElementInfo = (element: Element): object => {
      const rect = element.getBoundingClientRect()
      const tagName = element.tagName.toLowerCase()
      const testId = utils.getTestId(element)
      const ariaLabel = element.getAttribute('aria-label')
      const role = element.getAttribute('role') || tagName
      const text = utils.truncateText((element.textContent || '').trim(), 100)
      const placeholder = element.getAttribute('placeholder')
      
      const locators = locatorGenerator.buildLocators(element)
      // Fallback to tagName if no locators found (should not happen due to buildLocators guarantee)
      const selector = locators.length > 0 ? locators[0].value : `${tagName}[1]`

      const attrs: Record<string, string> = {}
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i]
        if (['class', 'style', 'onclick', 'onmouseover'].includes(attr.name)) continue
        attrs[attr.name] = utils.truncateText(attr.value, 100)
      }

      return {
        selector,
        locators,
        role,
        name: ariaLabel || utils.truncateText(text, 50),
        testId,
        xpath: locatorGenerator.generateXPath(element),
        css: locatorGenerator.generateCssSelector(element),
        text: utils.truncateText(text, 100),
        placeholder,
        tagName,
        innerText: utils.truncateText(text, 200),
        attributes: Object.keys(attrs).length > 0 ? attrs : undefined,
        boundingBox: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      }
    }

    // ===== Window Interface =====
    // Define window interface for type safety
    interface KiwiWindow extends Window {
      __kiwiRecordAction: (data: string) => void
      __kiwiTakeScreenshot: () => Promise<string | null>
      __kiwiAssertionMode?: () => boolean
      __kiwiDisableAssertionMode?: () => void
      __kiwiCreateHighlighter?: () => void
      __kiwiRecordingPaused?: boolean
    }
    const recordAction = (window as unknown as KiwiWindow).__kiwiRecordAction
    const takeScreenshot = (window as unknown as KiwiWindow).__kiwiTakeScreenshot
    
    // Helper to check if recording is paused
    const isRecordingPaused = (): boolean => {
      const win = window as unknown as KiwiWindow
      return win.__kiwiRecordingPaused === true
    }

    // ===== Helper: Check if event is within widget =====
    const isWithinWidget = (target: Element): boolean => {
      const widgetHost = document.getElementById(WIDGET_HOST_ID)
      return !!(widgetHost && (widgetHost.contains(target) || widgetHost === target))
    }

    // ===== Event Listeners Setup =====
    // Debounce mechanism for input events
    const inputDebounceMap = new WeakMap<Element, ReturnType<typeof setTimeout>>()

    document.addEventListener('click', (e) => {
      if (isRecordingPaused()) return
      
      const target = e.target as Element
      if (!target || isWithinWidget(target)) return

      const win = window as unknown as KiwiWindow
      const widgetAssertMode = typeof win.__kiwiAssertionMode === 'function'
        ? win.__kiwiAssertionMode()
        : false
      const assertMode = widgetAssertMode || e.metaKey === true || e.ctrlKey === true

      recordAction(JSON.stringify({
        type: assertMode ? 'assert' : 'click',
        target: getElementInfo(target),
      }))

      if (assertMode) {
        e.preventDefault()
        e.stopPropagation()

        if (widgetAssertMode && typeof win.__kiwiDisableAssertionMode === 'function') {
          win.__kiwiDisableAssertionMode()
        }
      }
    }, true)

    document.addEventListener('input', (e) => {
      if (isRecordingPaused()) return
      
      const target = e.target as HTMLInputElement | HTMLTextAreaElement
      if (!target || isWithinWidget(target)) return

      const existingTimer = inputDebounceMap.get(target)
      if (existingTimer) {
        clearTimeout(existingTimer)
      }

      const timerId = setTimeout(() => {
        if (isRecordingPaused()) return
        
        recordAction(JSON.stringify({
          type: 'fill',
          target: getElementInfo(target),
          value: utils.redactInputValue(target),
        }))
        inputDebounceMap.delete(target)
      }, INPUT_DEBOUNCE_MS)

      inputDebounceMap.set(target, timerId)
    }, true)

    document.addEventListener('blur', (e) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement
      if (!target || !['INPUT', 'TEXTAREA'].includes(target.tagName) || isWithinWidget(target)) return

      const existingTimer = inputDebounceMap.get(target)
      if (existingTimer) {
        clearTimeout(existingTimer)
        
        if (!isRecordingPaused()) {
          recordAction(JSON.stringify({
            type: 'fill',
            target: getElementInfo(target),
            value: utils.redactInputValue(target),
          }))
        }
        inputDebounceMap.delete(target)
      }
    }, true)

    document.addEventListener('change', (e) => {
      if (isRecordingPaused()) return
      
      const target = e.target as HTMLSelectElement
      if (target.tagName === 'SELECT' && !isWithinWidget(target)) {
        recordAction(JSON.stringify({
          type: 'select',
          target: getElementInfo(target),
          value: target.value,
        }))
      }
    }, true)

    document.addEventListener('keydown', (e) => {
      if (isRecordingPaused()) return
      
      if (['Enter', 'Tab', 'Escape'].includes(e.key)) {
        const target = e.target as Element
        if (!target || isWithinWidget(target)) return

        recordAction(JSON.stringify({
          type: 'keypress',
          target: getElementInfo(target),
          key: e.key,
        }))
      }
    }, true)

    document.addEventListener('keydown', async (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        // Block screenshot shortcut while paused
        if (isRecordingPaused()) {
          e.preventDefault()
          e.stopPropagation()
          console.log('[KiwiGen] Screenshot blocked - recording is paused')
          return
        }
        
        const target = e.target as Element
        if (target && isWithinWidget(target)) return

        console.log('[KiwiGen] Screenshot shortcut detected')
        e.preventDefault()
        e.stopPropagation()

        try {
          console.log('[KiwiGen] Calling takeScreenshot...')
          const screenshotPath = await takeScreenshot()
          console.log('[KiwiGen] takeScreenshot returned:', screenshotPath)

          if (screenshotPath) {
            const actionData = JSON.stringify({
              type: 'screenshot',
              screenshot: screenshotPath,
            })
            // Truncate path in log to avoid leaking full filesystem structure
            console.log('[KiwiGen] Recording screenshot action (path truncated):', screenshotPath.slice(-40))
            recordAction(actionData)
            console.log('[KiwiGen] ✅ Screenshot action recorded successfully')
          } else {
            console.error('[KiwiGen] ❌ Screenshot capture returned null')
          }
        } catch (error) {
          console.error('[KiwiGen] ❌ Screenshot capture failed:', error)
        }
      }
    }, true)
  }
}
