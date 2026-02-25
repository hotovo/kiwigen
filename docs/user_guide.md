# User Guide

## Features

- **Browser Recording:** Chromium browser automation via Playwright
- **Pause/Resume:** Pause and resume recording from app or browser widget
- **Rich Locator Extraction:** testId, role, text, CSS, XPath with confidence levels
- **Voice Transcription:** Local Whisper.cpp with optimized early speech detection
- **Screenshot Capture:** Cmd+Shift+S (Mac) / Ctrl+Shift+S (Windows) or widget button
- **Recording Widget:** Floating browser widget with pause/resume, screenshots, and assertion mode
- **Assertion Mode:** Cmd+Click (Mac) / Ctrl+Click (Windows) or widget button
- **Enhanced Transcripts:** AI-friendly narrative with embedded action references
- **Smart Voice Distribution:** 4s lookback, 2s lookahead temporal association
- **Session Export:** Framework-agnostic JSON bundles (INSTRUCTIONS.md + actions.json + screenshots/)

---

## First-Launch Setup

On a fresh install, Dodo Recorder shows a setup screen before the recorder UI.

What happens:
- App checks runtime dependencies (Whisper model, Whisper binary, Chromium runtime)
- Missing dependencies are downloaded from GitHub Release assets
- Downloads are verified with SHA256 before use
- Browser archive is extracted into the app runtime directory

While setup runs:
- Recorder controls are gated
- Progress and current dependency phase are shown
- You can cancel and retry

Runtime install location:
- macOS: `~/Library/Application Support/dodo-recorder/runtime-deps/`
- Windows: `%USERPROFILE%\AppData\Roaming\dodo-recorder\runtime-deps\`

If setup fails:
- Use **Refresh status** and retry install
- Confirm internet access to GitHub release assets
- Check logs in `main.log` for exact artifact failure

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Cmd+Click** (Mac) / **Ctrl+Click** (Windows) | Record assertion (not click) |
| **Cmd+Shift+S** (Mac) / **Ctrl+Shift+S** (Windows) | Take screenshot |

---

## Pause/Resume Recording

Pause and resume recording is only available in the browser widget.

### App UI (Recording Panel)

**Status Display:** Shows current recording state:
- "Recording" (red pulsing) - Session is active
- "Paused" (yellow) - Session is paused via browser widget
- "Processing" (blue) - Transcribing audio
- "Saving" (accent) - Saving session to disk

When paused, app UI shows a message: "Recording paused. Use the browser widget to resume."

**Stop Button:** Available during recording or pause. Ends the session.

### Browser Widget (Floating)

**Pause/Resume Button:** Toggle between pause (⏸) and resume (▶) icons.
**Screenshot Button:** Camera icon, disabled while paused.
**Assertion Button:** Eye icon, blue when active, disabled while paused.
**Voice Indicator:** Red pulsing dot (hidden while paused).

### Behavior

**When paused:**
- All action recording stops (clicks, inputs, navigation, screenshots, assertions)
- Audio recording pauses (no audio chunks recorded during pause)
- Screenshot and assertion buttons disabled
- Elapsed timer freezes
- Voice indicator hides

**When resumed:**
- Recording continues from pause moment
- Audio resumes seamlessly
- Timer excludes paused duration
- Timeline remains synchronized between actions and voice

---

## Session Output

```
session-YYYY-MM-DD-HHMMSS/
├── INSTRUCTIONS.md    # Reusable AI instructions (framework-agnostic)
├── actions.json       # _meta + narrative + actions
└── screenshots/       # PNG files
```

### actions.json Structure

```json
{
  "_meta": {
    "formatVersion": "2.0",
    "sessionId": "session-2026-01-23-102150",
    "startTime": 1737628910000,
    "startTimeISO": "2026-01-23T10:21:50.000Z",
    "duration": "8s",
    "startUrl": "https://example.com",
    "totalActions": 10,
    "actionTypes": { "click": 3, "fill": 2, "assert": 4, "navigate": 1 }
  },
  "narrative": {
    "text": "Voice commentary [action:e6c3069a:click] more text...",
    "note": "Match SHORT_ID (first 8 chars) with action.id in actions array."
  },
  "actions": [
    {
      "id": "e6c3069a-1b2c-4d5e-6f7g-8h9i0j1k2l3m",
      "timestamp": 1234,
      "type": "click",
      "target": {
        "selector": "button:has-text('Submit')",
        "locators": [
          { "strategy": "testId", "value": "submit-btn", "confidence": "high" },
          { "strategy": "text", "value": "Submit", "confidence": "high" }
        ],
        "role": "button",
        "name": "Submit",
        "testId": "submit-btn"
      }
    }
  ]
}
```

---

## AI Usage

**AI workflow:**
1. Read INSTRUCTIONS.md once (framework detection, locator strategies, code patterns)
2. Process actions.json (metadata, narrative, actions)
3. Parse action references: `[action:SHORT_ID:TYPE]` → match with full UUID in actions array
4. Choose locators by confidence (high > medium > low)
5. Generate framework-specific test code

**Supported frameworks:** Playwright, Cypress, Selenium, Puppeteer, any framework

---

## References

- **Output Format:** [`output_format.md`](output_format.md) - Detailed bundle specification
- **Voice Transcription:** [`voice_transcription.md`](voice_transcription.md) - Transcription pipeline
- **Application UI:** [`application_ui.md`](application_ui.md) - UI components and workflows
