import path from 'path'
import { existsSync } from 'fs'
import { ensureDir, writeJson, writeText } from '../utils/fs'
import { sanitizeSessionId } from '../utils/validation'
import { buildNarrativeWithSentenceLevelDistribution } from '../utils/enhancedTranscript'
import { INSTRUCTIONS_TEMPLATE } from './instructions-template'
import type { SessionBundle, ActionsJsonV2 } from '../../shared/types'

export class SessionWriter {
  private outputDir: string

  constructor(outputDir: string) {
    this.outputDir = outputDir
  }

  async write(session: SessionBundle): Promise<string> {
    try {
      // Generate session directory name from startTime
      const date = new Date(session.startTime)
      const sessionId = date.toISOString()
        .replace(/T/, '-')
        .replace(/:/g, '')
        .split('.')[0] // Remove milliseconds
      const safeId = sanitizeSessionId(`session-${sessionId}`)
      
      const sessionDir = path.join(this.outputDir, safeId)
      const screenshotsDir = path.join(sessionDir, 'screenshots')

      await ensureDir(sessionDir)
      await ensureDir(screenshotsDir)

      // Ensure INSTRUCTIONS.md exists in session directory (write once)
      await this.ensureInstructionsFile(sessionDir)

      // Prepare actions without voiceSegments for clean JSON output
      const actionsWithoutVoice = session.actions.map(action => {
        const { voiceSegments, ...actionWithoutVoice } = action
        return actionWithoutVoice
      })
      
      // Extract start URL from first navigate action if available
      const startUrl = session.actions.find(a => a.type === 'navigate')?.url

      // Calculate duration
      let duration = '0s'
      if (session.actions.length > 0) {
        const firstAction = session.actions[0]
        const lastAction = session.actions[session.actions.length - 1]
        const durationMs = lastAction.timestamp - firstAction.timestamp
        duration = this.formatDuration(durationMs)
      }
      
      // Count action types for metadata
      const actionTypeCounts = session.actions.reduce((acc, action) => {
        acc[action.type] = (acc[action.type] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      // Generate narrative text with embedded action references
      const narrativeText = buildNarrativeWithSentenceLevelDistribution(session.actions)

      // Build actions.json v2 structure
      const actionsJsonV2: ActionsJsonV2 = {
        _meta: {
          formatVersion: '2.0',
          generatedBy: 'KiwiGen',
          sessionId: safeId,
          startTime: session.startTime,
          startTimeISO: new Date(session.startTime).toISOString(),
          duration,
          startUrl,
          totalActions: session.actions.length,
          actionTypes: actionTypeCounts
        },
        narrative: {
          text: narrativeText,
          note: "Voice commentary with embedded action references. Match SHORT_ID (first 8 chars) with action.id in actions array."
        },
        actions: actionsWithoutVoice
      }

      // Write only actions.json (INSTRUCTIONS.md already ensured, screenshots saved during recording)
      await writeJson(path.join(sessionDir, 'actions.json'), actionsJsonV2)

      return sessionDir
    } catch (error) {
      console.error('[SessionWriter] Failed to write session:', error)
      throw error
    }
  }

  /**
   * Ensures INSTRUCTIONS.md exists in the session directory.
   * Writes the file only if it doesn't already exist.
   */
  private async ensureInstructionsFile(sessionDir: string): Promise<void> {
    const instructionsPath = path.join(sessionDir, 'INSTRUCTIONS.md')
    
    if (!existsSync(instructionsPath)) {
      await writeText(instructionsPath, INSTRUCTIONS_TEMPLATE)
    }
  }

  /**
   * Formats duration in human-readable format
   */
  private formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    
    if (minutes === 0) {
      return `${seconds}s`
    }
    return `${minutes}m ${seconds}s`
  }
}
