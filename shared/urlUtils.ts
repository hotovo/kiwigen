/**
 * URL validation and sanitization utilities
 * 
 * Provides robust URL handling that accepts partial URLs (e.g., 'github.com')
 * and normalizes them to fully-qualified URLs (e.g., 'https://github.com')
 */

import { MAX_URL_LENGTH, ALLOWED_PROTOCOLS } from './constants'

export interface UrlValidationResult {
  valid: boolean
  /** The sanitized/normalized URL if valid */
  sanitized?: string
  /** Technical error message for logging */
  error?: string
  /** User-friendly error message for UI display */
  userFriendlyError?: string
}

/**
 * IP address regex (IPv4)
 */
const IP_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(:\d+)?$/

/**
 * Domain validation regex
 * Requires a valid TLD (at least 2 chars)
 * Format: subdomain.domain.tld or domain.tld
 */
const DOMAIN_WITH_TLD_REGEX = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.[a-zA-Z]{2,}(:\d+)?(\/.*)?$/

/**
 * Checks if a string appears to be a valid domain or domain with path
 * Requires either:
 * - A domain with TLD (e.g., example.com, sub.example.com)
 * - localhost (with or without port)
 * - An IPv4 address
 */
function isValidDomain(input: string): boolean {
  // Extract the hostname part (before any path)
  const hostnameMatch = input.match(/^([^/]+)/)
  if (!hostnameMatch) return false
  
  const hostname = hostnameMatch[1]
  
  // Reject if starts with a dot (e.g., ".com")
  if (hostname.startsWith('.')) {
    return false
  }
  
  // Allow localhost (with optional port)
  if (hostname === 'localhost' || hostname.startsWith('localhost:')) {
    return true
  }
  
  // Allow IPv4 addresses (with optional port)
  const ipPart = hostname.split(':')[0]
  if (IP_REGEX.test(hostname)) {
    const parts = ipPart.split('.')
    // Validate each octet is 0-255
    return parts.every(part => {
      const num = parseInt(part, 10)
      return num >= 0 && num <= 255
    })
  }
  
  // Check against domain regex (requires TLD)
  if (!DOMAIN_WITH_TLD_REGEX.test(input)) {
    return false
  }
  
  // Additional check: ensure it's not just a TLD
  const domainPart = hostname.split(':')[0] // Remove port if present
  const parts = domainPart.split('.')
  
  // Must have at least 2 non-empty parts
  if (parts.length < 2) {
    return false
  }
  
  // Check all parts are non-empty
  if (parts.some(part => !part || part.length === 0)) {
    return false
  }
  
  return true
}

/**
 * Checks if a hostname (from URL.hostname) is valid
 * More lenient than isValidDomain since URL API already parsed it
 */
function isValidHostname(hostname: string): boolean {
  // Empty hostname is invalid
  if (!hostname || hostname.length === 0) {
    return false
  }
  
  // Reject if starts with a dot (e.g., ".com")
  if (hostname.startsWith('.')) {
    return false
  }
  
  // Allow localhost
  if (hostname === 'localhost') {
    return true
  }
  
  // Allow IPv4 addresses
  if (IP_REGEX.test(hostname)) {
    const parts = hostname.split('.')
    return parts.every(part => {
      const num = parseInt(part, 10)
      return num >= 0 && num <= 255
    })
  }
  
  // Require at least one dot (domain.tld)
  if (!hostname.includes('.')) {
    return false
  }
  
  // Split into parts
  const parts = hostname.split('.')
  
  // Must have at least 2 parts (domain + tld)
  if (parts.length < 2) {
    return false
  }
  
  // Check for empty parts (e.g., "example..com" or ".com")
  if (parts.some(part => !part || part.length === 0)) {
    return false
  }
  
  // Get domain and TLD
  const tld = parts[parts.length - 1]
  const domain = parts[parts.length - 2]
  
  // TLD must be at least 2 characters and contain only letters
  if (!tld || tld.length < 2 || !/^[a-zA-Z]+$/.test(tld)) {
    return false
  }
  
  // Domain (the part before TLD) must exist and be at least 1 character
  if (!domain || domain.length < 1) {
    return false
  }
  
  return true
}

/**
 * Sanitizes a URL input by:
 * - Trimming whitespace
 * - Adding https:// if no protocol is present
 * - Preserving explicit http:// or https://
 * - Preserving trailing slashes and paths
 * 
 * @param input - Raw URL input from user
 * @returns Sanitized URL with protocol
 * @throws Error if input is invalid
 */
export function sanitizeUrl(input: string): string {
  // Trim whitespace
  const trimmed = input.trim()
  
  if (!trimmed) {
    throw new Error('URL cannot be empty')
  }
  
  // Check if protocol is already present
  const hasProtocol = /^https?:\/\//i.test(trimmed)
  
  if (hasProtocol) {
    // Already has protocol, return as-is
    return trimmed
  }
  
  // Add https:// by default
  return `https://${trimmed}`
}

/**
 * Validates and sanitizes a URL input
 * 
 * Accepts various URL formats:
 * - Full URLs: https://github.com, http://example.com
 * - Partial URLs: github.com, www.github.com
 * - URLs with paths: example.com/path, example.com/path/
 * - URLs with ports: localhost:3000, example.com:8080
 * 
 * @param input - Raw URL input from user
 * @returns Validation result with sanitized URL if valid
 */
export function validateAndSanitizeUrl(input: string): UrlValidationResult {
  // Check for empty input
  if (!input || typeof input !== 'string') {
    return {
      valid: false,
      error: 'URL is required',
      userFriendlyError: 'Please enter a URL'
    }
  }
  
  // Trim whitespace
  const trimmed = input.trim()
  
  if (!trimmed) {
    return {
      valid: false,
      error: 'URL is required',
      userFriendlyError: 'Please enter a URL'
    }
  }
  
  // Check length before sanitization
  if (trimmed.length > MAX_URL_LENGTH) {
    return {
      valid: false,
      error: `URL is too long (max ${MAX_URL_LENGTH} characters)`,
      userFriendlyError: `URL is too long (maximum ${MAX_URL_LENGTH} characters)`
    }
  }
  
  // Check for invalid characters (spaces, newlines, tabs)
  if (/[\s\n\r\t]/.test(trimmed)) {
    return {
      valid: false,
      error: 'URL contains whitespace characters',
      userFriendlyError: 'URL cannot contain spaces or special whitespace'
    }
  }
  
  // Check for consecutive dots (invalid domain)
  if (/\.\./.test(trimmed)) {
    return {
      valid: false,
      error: 'URL contains consecutive dots',
      userFriendlyError: 'Invalid domain format (consecutive dots)'
    }
  }
  
  // Try to sanitize (add protocol if needed)
  let sanitized: string
  try {
    sanitized = sanitizeUrl(trimmed)
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Failed to sanitize URL',
      userFriendlyError: 'Invalid URL format'
    }
  }
  
  // Check length after sanitization
  if (sanitized.length > MAX_URL_LENGTH) {
    return {
      valid: false,
      error: `Sanitized URL is too long (max ${MAX_URL_LENGTH} characters)`,
      userFriendlyError: `URL is too long (maximum ${MAX_URL_LENGTH} characters)`
    }
  }
  
  // Validate using Node's URL constructor
  let parsed: URL
  try {
    parsed = new URL(sanitized)
  } catch (err) {
    // Extract the domain/hostname part for better error messages
    const withoutProtocol = sanitized.replace(/^https?:\/\//, '')
    const domain = withoutProtocol.split('/')[0]
    
    // Check if it looks like a domain issue
    if (!isValidDomain(domain)) {
      return {
        valid: false,
        error: `Invalid domain: ${domain}`,
        userFriendlyError: 'Invalid domain format. Please enter a valid URL (e.g., github.com or https://example.com)'
      }
    }
    
    return {
      valid: false,
      error: 'Invalid URL format',
      userFriendlyError: 'Invalid URL format. Please enter a valid URL (e.g., github.com or https://example.com)'
    }
  }
  
  // Check if protocol is allowed
  if (!(ALLOWED_PROTOCOLS as readonly string[]).includes(parsed.protocol)) {
    return {
      valid: false,
      error: `Protocol ${parsed.protocol} is not allowed. Use http: or https:`,
      userFriendlyError: `Only HTTP and HTTPS protocols are supported`
    }
  }
  
  // Additional validation: ensure hostname is valid
  if (!isValidHostname(parsed.hostname)) {
    return {
      valid: false,
      error: `Invalid hostname: ${parsed.hostname}`,
      userFriendlyError: 'Invalid domain name. Please enter a valid domain with a proper extension (e.g., github.com, not just github, or .com)'
    }
  }
  
  // Success!
  return {
    valid: true,
    sanitized: sanitized
  }
}

/**
 * Quick validation check without sanitization
 * Useful for checking if an already-sanitized URL is valid
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (ALLOWED_PROTOCOLS as readonly string[]).includes(parsed.protocol)
  } catch {
    return false
  }
}

/**
 * Redacts sensitive URL parts before writing URLs into recordings or logs.
 * Keeps the destination readable while removing query values and fragment contents.
 */
export function sanitizeRecordedUrl(url: string): string {
  try {
    const parsed = new URL(url)

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return `${parsed.protocol}[redacted]`
    }

    const queryKeys = Array.from(parsed.searchParams.keys())
    parsed.search = ''

    if (queryKeys.length > 0) {
      parsed.search = queryKeys
        .map(key => `${encodeURIComponent(key)}=[redacted]`)
        .join('&')
    }

    if (parsed.hash) {
      parsed.hash = '[redacted]'
    }

    return parsed.toString()
  } catch {
    return '[invalid-url]'
  }
}
