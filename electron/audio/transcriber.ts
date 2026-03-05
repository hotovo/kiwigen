import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { spawn } from 'child_process'
import { ensureDir, safeUnlink, getTempPath } from '../utils/fs'
import { logger } from '../utils/logger'
import type { TranscriptSegment } from '../../shared/types'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpeg = require('fluent-ffmpeg')

/**
 * Get ffmpeg binary path, handling both development and production environments
 */
function getFfmpegPath(): string {
  if (app.isPackaged) {
    // In production, ffmpeg is extracted to Resources/ffmpeg-static/
    const resourcesPath = process.resourcesPath
    const ffmpegPath = path.join(resourcesPath, 'ffmpeg-static', 'ffmpeg')
    logger.debug('FFmpeg path (production):', ffmpegPath)
    return ffmpegPath
  } else {
    // In development, use ffmpeg-static from node_modules
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegPath = require('ffmpeg-static') as string
    logger.debug('FFmpeg path (development):', ffmpegPath)
    return ffmpegPath
  }
}

const ffmpegPath = getFfmpegPath()
ffmpeg.setFfmpegPath(ffmpegPath)

interface WhisperResult {
  start: string
  end: string
  speech: string
}

export class Transcriber {
  private isInitialized = false
  private transcriptionTimeoutMs: number
  private modelPath: string
  private whisperBinaryPath: string

  constructor(modelPath: string, whisperBinaryPath: string, transcriptionTimeoutMs: number = 300000) {
    this.modelPath = modelPath
    this.whisperBinaryPath = whisperBinaryPath
    this.transcriptionTimeoutMs = transcriptionTimeoutMs
  }

  /**
   * Initializes the transcriber by checking for Whisper model availability
   * @throws {Error} If model is not found (logs error but doesn't throw)
   * @returns Promise that resolves when initialization is complete
   */
  async initialize(): Promise<void> {
    logger.info('='.repeat(60))
    logger.info('🎤 Whisper Transcriber Initialization')
    logger.info('='.repeat(60))
    logger.info('Model: small.en')
    logger.info(`Path: ${this.modelPath}`)
    logger.info(`Binary: ${this.whisperBinaryPath}`)
    
    if (!fs.existsSync(this.modelPath)) {
      logger.error('❌ Whisper model not found!')
      throw new Error(`Whisper model not found at ${this.modelPath}`)
    }

    if (!fs.existsSync(this.whisperBinaryPath)) {
      logger.error('❌ Whisper binary not found!')
      throw new Error(`Whisper binary not found at ${this.whisperBinaryPath}`)
    }

    const stats = fs.statSync(this.modelPath)
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2)
    logger.info(`✅ Model ready (${sizeMB} MB)`)
    
    logger.info('='.repeat(60))
    
    this.isInitialized = true
  }

  /**
   * Transcribes audio buffer to text segments
   * @param audioBuffer - Audio data buffer to transcribe
   * @returns Promise that resolves with array of transcript segments (empty array on error)
   */
  async transcribe(audioBuffer: Buffer): Promise<TranscriptSegment[]> {
    if (!this.isInitialized) {
      throw new Error('Transcriber not initialized')
    }

    try {
      const tempDir = path.join(app.getPath('temp'), 'kiwigen')
      await ensureDir(tempDir)
      
      const inputPath = getTempPath(tempDir, 'audio-input', '.webm')
      const wavPath = getTempPath(tempDir, 'audio', '.wav')
      
      await fs.promises.writeFile(inputPath, audioBuffer)
      logger.info('Converting audio to WAV format...')
      
      await this.convertToWav(inputPath, wavPath)
      await safeUnlink(inputPath)

      logger.info('Transcribing audio file:', wavPath)
      const segments = await this.transcribeWithTimeout(wavPath)
      logger.info('Transcription complete, segments:', segments.length)
      
      await safeUnlink(wavPath)
      
      return segments
    } catch (error) {
      logger.error('Transcription failed:', error)
      return []
    }
  }

  private convertToWav(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Add 1.5 seconds of silence at the beginning to help Whisper detect early speech
      // This is especially important for external microphones which have initialization delays
      // Whisper's VAD needs this buffer to properly detect speech at the very beginning
      ffmpeg(inputPath)
        .audioFrequency(16000)
        .audioChannels(1)
        .audioCodec('pcm_s16le')
        .format('wav')
        // Prepend 1.5s of silence using adelay and apad filters
        .audioFilters([
          'apad=pad_dur=1.5',  // Add 1.5s padding at the end
          'areverse',           // Reverse the audio
          'apad=pad_dur=1.5',  // Add 1.5s padding (which will be at the beginning after reversing back)
          'areverse'            // Reverse back to original
        ])
        .on('end', () => {
          logger.debug('Audio conversion complete (with 1.5s leading silence)')
          resolve()
        })
        .on('error', (err: Error) => {
          logger.error('Audio conversion failed:', err)
          reject(err)
        })
        .save(outputPath)
    })
  }

  private parseTimestamp(timestamp: string): number {
    const parts = timestamp.split(':')
    if (parts.length === 3) {
      const hours = parseInt(parts[0], 10)
      const minutes = parseInt(parts[1], 10)
      const seconds = parseFloat(parts[2])
      return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000)
    }
    return 0
  }

  /**
   * Transcribe audio with timeout protection
   * @param audioPath - Path to the audio file
   * @returns Promise that resolves with transcript segments or rejects on timeout
   */
  private async transcribeWithTimeout(audioPath: string): Promise<TranscriptSegment[]> {
    return Promise.race([
      this.runWhisper(audioPath),
      new Promise<TranscriptSegment[]>((_, reject) =>
        setTimeout(() => reject(new Error('Transcription timeout')), this.transcriptionTimeoutMs)
      )
    ])
  }

  /**
   * Run Whisper transcription on audio file using direct whisper.cpp call
   * @param audioPath - Path to the audio file
   * @returns Promise that resolves with transcript segments
   */
  private async runWhisper(audioPath: string): Promise<TranscriptSegment[]> {
    try {
      logger.info('='.repeat(60))
      logger.info('🎙️  Starting Whisper Transcription (Direct whisper.cpp)')
      logger.info('='.repeat(60))
      logger.info(`Audio file: ${audioPath}`)
      logger.info('Model: small.en')
      
      const whisperPath = this.whisperBinaryPath
      
      const modelPath = this.modelPath
      const jsonOutputPath = `${audioPath}.json`
      
      // Prompt text to prime Whisper - also used for filtering hallucinations
      const WHISPER_PROMPT = 'This is a recording session with browser interactions, clicking, navigation, and voice commentary.'
      
      // Build args array for spawn (no shell, no command injection risk)
      // Parameters tuned to minimize hallucinations on silence:
      // - Lower entropy threshold (2.0) = better early speech detection
      // - Repetition filtering = handled in post-processing (more reliable than Whisper params)
      const args = [
        '-m', modelPath,
        '-f', audioPath,
        '-l', 'en',
        '-oj',  // Output JSON format
        '--print-progress',  // Show progress
        '-ml', '50',  // max-len: ~50 characters (1-2 second segments)
        '-sow',  // split-on-word: split on word boundaries
        '-bo', '5',  // best-of: use best of 5 candidates
        '-bs', '5',  // beam-size: beam search size
        '-et', '2.0',  // entropy-thold: LOWERED from 2.4 to 2.0 for better early detection
        '-lpt', '-1.0',  // logprob-thold: log probability threshold (keep at default for stability)
        '--prompt', WHISPER_PROMPT
      ]
      
      logger.info('Executing whisper.cpp with args:', args)
      
      const binaryDir = path.dirname(whisperPath)
      
      // Execute whisper.cpp using spawn (no shell, safe from command injection)
      const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn(whisperPath, args, {
          cwd: binaryDir,
        })
        
        let stdout = ''
        let stderr = ''
        
        child.stdout?.on('data', (data) => {
          stdout += data.toString()
        })
        
        child.stderr?.on('data', (data) => {
          stderr += data.toString()
        })
        
        child.on('close', (code) => {
          if (code === 0) {
            resolve({ stdout, stderr })
          } else {
            reject(new Error(`Whisper exited with code ${code}: ${stderr}`))
          }
        })
        
        child.on('error', (err) => {
          reject(new Error(`Failed to spawn whisper: ${err.message}`))
        })
      })
      
      if (stderr) {
        logger.debug('Whisper stderr:', stderr)
      }
      
      // Read the JSON output file created by whisper.cpp
      logger.info(`Reading JSON output from: ${jsonOutputPath}`)
      const jsonContent = await fs.promises.readFile(jsonOutputPath, 'utf-8')
      const jsonData = JSON.parse(jsonContent)
      
      // Clean up the JSON file
      await safeUnlink(jsonOutputPath)
      
      // Extract transcription segments from JSON
      // whisper.cpp JSON format: { "transcription": [ { "timestamps": { "from": "00:00:00,000", "to": "00:00:05,000" }, "offsets": { "from": 0, "to": 5000 }, "text": "..." } ] }
      const result: WhisperResult[] = []
      
      if (jsonData.transcription && Array.isArray(jsonData.transcription)) {
        for (const segment of jsonData.transcription) {
          if (segment.timestamps && segment.text) {
            // Convert comma format to dot format (00:00:00,000 -> 00:00:00.000)
            const start = segment.timestamps.from.replace(',', '.')
            const end = segment.timestamps.to.replace(',', '.')
            result.push({
              start,
              end,
              speech: segment.text.trim()
            })
          }
        }
      }
      
      logger.info(`Parsed ${result.length} segments from JSON output`)

      logger.info('='.repeat(60))
      logger.info('📊 Raw Whisper Results')
      logger.info('='.repeat(60))
      
      if (!result || !Array.isArray(result)) {
        logger.warn('⚠️  Whisper returned no results')
        return []
      }

      logger.info(`Total segments from Whisper: ${result.length}`)
      
      // Log ALL raw segments before filtering
      result.forEach((segment, index) => {
        const startMs = this.parseTimestamp(segment.start)
        const endMs = this.parseTimestamp(segment.end)
        logger.info(`  [${index + 1}] ${segment.start} -> ${segment.end} (${startMs}ms -> ${endMs}ms)`)
        logger.info(`      Text: "${segment.speech}"`)
      })

      // First pass: Detect repetitive hallucinations
      // Count occurrences of each text segment
      const textCounts = new Map<string, number>()
      result.forEach(segment => {
        const text = segment.speech.trim()
        textCounts.set(text, (textCounts.get(text) || 0) + 1)
      })
      
      // Find texts that appear 2+ times (likely hallucinations)
      const hallucinatedTexts = new Set<string>()
      textCounts.forEach((count, text) => {
        if (count >= 2) {
          hallucinatedTexts.add(text)
          logger.debug(`  🔍 Detected repetitive text (${count}x): "${text}"`)
        }
      })

      // Filter out segments that are likely noise, silence, or hallucinations
      const validSegments = result.filter(segment => {
        const text = segment.speech.trim()
        
        // Check if segment is the prompt text (Whisper hallucination when silent)
        const isPromptHallucination = text === WHISPER_PROMPT
        
        // Check if segment is a repetitive hallucination
        const isRepetitiveHallucination = hallucinatedTexts.has(text)
        
        const isValid = text.length > 0 &&
               !isPromptHallucination &&  // Remove prompt text hallucinations
               !isRepetitiveHallucination &&  // Remove repetitive hallucinations
               !text.match(/^\[.*\]$/) &&  // Remove [BLANK_AUDIO], [noise], etc.
               !text.match(/^\(.*\)$/) &&  // Remove (mouse clicking), etc.
               text !== '...' &&
               text !== '.' &&
               text.length > 2  // Minimum 3 characters
        
        if (!isValid) {
          if (isPromptHallucination) {
            logger.debug(`  ❌ Filtered out prompt hallucination: "${text}"`)
          } else if (isRepetitiveHallucination) {
            logger.debug(`  ❌ Filtered out repetitive hallucination: "${text}"`)
          } else {
            logger.debug(`  ❌ Filtered out: "${text}"`)
          }
        }
        return isValid
      })

      logger.info('='.repeat(60))
      logger.info(`✅ Valid segments after filtering: ${validSegments.length}`)
      logger.info('='.repeat(60))

      // Subtract 1500ms from all timestamps to account for the 1.5s silence padding we added
      // This padding is critical for external microphones which have initialization delays
      const PADDING_OFFSET_MS = 1500
      
      const segments = validSegments.map((segment, index) => {
        const startTime = Math.max(0, this.parseTimestamp(segment.start) - PADDING_OFFSET_MS)
        const endTime = Math.max(0, this.parseTimestamp(segment.end) - PADDING_OFFSET_MS)
        
        return {
          id: `t${index + 1}`,
          startTime,
          endTime,
          text: segment.speech.trim(),
        }
      }).filter(segment => segment.endTime > 0) // Remove any segments that are entirely in the padding

      // Log final processed segments
      logger.info('📝 Final segments (after removing 1500ms padding offset):')
      segments.forEach(segment => {
        const durationMs = segment.endTime - segment.startTime
        logger.info(`  [${segment.id}] ${segment.startTime}ms -> ${segment.endTime}ms (${durationMs}ms)`)
        logger.info(`      "${segment.text}" (${segment.text.length} chars)`)
      })
      logger.info('='.repeat(60))

      return segments
    } catch (error) {
      logger.error('Whisper processing failed:', error)
      return []
    }
  }
}
