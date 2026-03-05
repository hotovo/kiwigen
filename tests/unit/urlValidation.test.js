#!/usr/bin/env node

/**
 * URL Validation Unit Tests
 * 
 * Simple standalone test that validates URL logic without requiring TypeScript compilation
 * 
 * Run with: npm test
 */

// Test implementation inline (mirrors shared/urlUtils.ts logic)
const MAX_URL_LENGTH = 2048
const ALLOWED_PROTOCOLS = ['http:', 'https:']

const IP_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(:\d+)?$/
const DOMAIN_WITH_TLD_REGEX = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.[a-zA-Z]{2,}(:\d+)?(\/.*)?$/

function isValidHostname(hostname) {
  if (!hostname || hostname.length === 0) return false
  if (hostname.startsWith('.')) return false
  if (hostname === 'localhost') return true
  
  if (IP_REGEX.test(hostname)) {
    const parts = hostname.split('.')
    return parts.every(part => {
      const num = parseInt(part, 10)
      return num >= 0 && num <= 255
    })
  }
  
  if (!hostname.includes('.')) return false
  
  const parts = hostname.split('.')
  if (parts.length < 2) return false
  if (parts.some(part => !part || part.length === 0)) return false
  
  const tld = parts[parts.length - 1]
  const domain = parts[parts.length - 2]
  
  if (!tld || tld.length < 2 || !/^[a-zA-Z]+$/.test(tld)) return false
  if (!domain || domain.length < 1) return false
  
  return true
}

function sanitizeUrl(input) {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('URL cannot be empty')
  
  const hasProtocol = /^https?:\/\//i.test(trimmed)
  if (hasProtocol) return trimmed
  
  return `https://${trimmed}`
}

function validateAndSanitizeUrl(input) {
  if (!input || typeof input !== 'string') {
    return {
      valid: false,
      error: 'URL is required',
      userFriendlyError: 'Please enter a URL'
    }
  }
  
  const trimmed = input.trim()
  if (!trimmed) {
    return {
      valid: false,
      error: 'URL is required',
      userFriendlyError: 'Please enter a URL'
    }
  }
  
  if (trimmed.length > MAX_URL_LENGTH) {
    return {
      valid: false,
      error: `URL is too long (max ${MAX_URL_LENGTH} characters)`,
      userFriendlyError: `URL is too long (maximum ${MAX_URL_LENGTH} characters)`
    }
  }
  
  if (/[\s\n\r\t]/.test(trimmed)) {
    return {
      valid: false,
      error: 'URL contains whitespace characters',
      userFriendlyError: 'URL cannot contain spaces or special whitespace'
    }
  }
  
  if (/\.\./.test(trimmed)) {
    return {
      valid: false,
      error: 'URL contains consecutive dots',
      userFriendlyError: 'Invalid domain format (consecutive dots)'
    }
  }
  
  let sanitized
  try {
    sanitized = sanitizeUrl(trimmed)
  } catch (err) {
    return {
      valid: false,
      error: err.message,
      userFriendlyError: 'Invalid URL format'
    }
  }
  
  if (sanitized.length > MAX_URL_LENGTH) {
    return {
      valid: false,
      error: `Sanitized URL is too long (max ${MAX_URL_LENGTH} characters)`,
      userFriendlyError: `URL is too long (maximum ${MAX_URL_LENGTH} characters)`
    }
  }
  
  let parsed
  try {
    parsed = new URL(sanitized)
  } catch (err) {
    return {
      valid: false,
      error: 'Invalid URL format',
      userFriendlyError: 'Invalid URL format. Please enter a valid URL (e.g., github.com or https://example.com)'
    }
  }
  
  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return {
      valid: false,
      error: `Protocol ${parsed.protocol} is not allowed. Use http: or https:`,
      userFriendlyError: `Only HTTP and HTTPS protocols are supported`
    }
  }
  
  if (!isValidHostname(parsed.hostname)) {
    return {
      valid: false,
      error: `Invalid hostname: ${parsed.hostname}`,
      userFriendlyError: 'Invalid domain name. Please enter a valid domain with a proper extension (e.g., github.com, not just github)'
    }
  }
  
  return {
    valid: true,
    sanitized: sanitized
  }
}

// Test cases
const TEST_CASES = [
  // Valid URLs
  { input: 'github.com', shouldPass: true, expectedSanitized: 'https://github.com', description: 'Simple domain' },
  { input: 'www.github.com', shouldPass: true, expectedSanitized: 'https://www.github.com', description: 'Domain with www' },
  { input: 'uat.protechtgroup.com/dodo', shouldPass: true, expectedSanitized: 'https://uat.protechtgroup.com/dodo', description: 'Domain with path' },
  { input: 'https://github.com', shouldPass: true, expectedSanitized: 'https://github.com', description: 'Full HTTPS URL' },
  { input: 'localhost', shouldPass: true, expectedSanitized: 'https://localhost', description: 'localhost' },
  { input: '192.168.1.1', shouldPass: true, expectedSanitized: 'https://192.168.1.1', description: 'IP address' },
  
  // Invalid URLs
  { input: 'https://github', shouldPass: false, description: 'HTTPS without TLD' },
  { input: 'github', shouldPass: false, description: 'Single word without TLD' },
  { input: '.com', shouldPass: false, description: 'TLD only' },
  { input: 'example..com', shouldPass: false, description: 'Consecutive dots' },
  { input: '', shouldPass: false, description: 'Empty string' }
]

// Run tests
let passed = 0
let failed = 0

console.log('\n\x1b[34m🧪 URL Validation Tests\x1b[0m\n')

TEST_CASES.forEach(test => {
  const result = validateAndSanitizeUrl(test.input)
  const success = result.valid === test.shouldPass && 
                  (!test.expectedSanitized || result.sanitized === test.expectedSanitized)
  
  if (success) {
    passed++
    console.log(`\x1b[32m✓\x1b[0m "${test.input}" - ${test.description}`)
    if (result.sanitized) {
      console.log(`  \x1b[90m→ ${result.sanitized}\x1b[0m`)
    }
  } else {
    failed++
    console.log(`\x1b[31m✗\x1b[0m "${test.input}" - ${test.description}`)
    console.log(`  \x1b[31mExpected: ${test.shouldPass ? 'valid' : 'invalid'}, Got: ${result.valid ? 'valid' : 'invalid'}\x1b[0m`)
  }
})

console.log(`\n\x1b[34m📊 ${passed}/${TEST_CASES.length} passed\x1b[0m\n`)

process.exit(failed > 0 ? 1 : 0)
