# User Guide

Complete guide for using KiwiGen to capture browser interactions and voice commentary for AI-assisted test generation.

---

## Table of Contents

- [Features Overview](#features-overview)
- [First-Launch Setup](#first-launch-setup)
- [Recording Workflow](#recording-workflow)
- [Browser Widget Controls](#browser-widget-controls)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Voice Recording & Transcription](#voice-recording--transcription)
- [Pause/Resume Recording](#pauseresume-recording)
- [Session Output](#session-output)
- [Viewing & Saving Sessions](#viewing--saving-sessions)
- [Troubleshooting](#troubleshooting)

---

## Features Overview

KiwiGen captures your manual browser testing sessions with voice commentary and produces AI-ready session bundles for automated test generation.

**Key Capabilities:**

- **Browser Recording** - Chromium automation via Playwright, captures clicks, fills, navigation, keypresses, selections, checks, scrolls, assertions, and screenshots
- **Rich Locator Extraction** - Multiple locator strategies (testId, id, role, text, CSS, XPath) with confidence levels
- **Voice Synchronization** - Speak naturally while testing; commentary is transcribed locally and synced with your actions
- **Local Processing** - 100% offline transcription using Whisper.cpp; no cloud dependencies
- **Pause/Resume** - Pause recording from browser widget, resume seamlessly
- **Assertion Mode** - Visual feedback when recording assertions (Cmd/Ctrl + Click)
- **Screenshot Capture** - Manual screenshots during recording (Cmd/Ctrl + Shift + S)
- **AI-Optimized Output** - Session bundles include complete instructions for AI agents

**Supported Platforms:**
- ✅ macOS Apple Silicon (ARM64)
- ✅ Windows x64

---

## First-Launch Setup

On fresh installation, KiwiGen downloads runtime dependencies before enabling recording features.

### What Gets Downloaded

Runtime dependencies are downloaded to your user data directory and managed locally:

- **Whisper model** (`ggml-small.en.bin`) - 466 MB speech recognition model
- **Whisper binary** - Platform-specific executable for transcription
- **Playwright Chromium** - Browser runtime for recording automation

**Installation locations:**
- macOS: `~/Library/Application Support/kiwigen/runtime-deps/`
- Windows: `%USERPROFILE%\AppData\Roaming\kiwigen\runtime-deps\`

### Setup Process

1. **Launch KiwiGen** - Setup screen appears automatically on first run
2. **Click "Install Runtime Dependencies"** - Downloads begin automatically
3. **Wait for completion** - Progress shows download/verification/extraction phases
4. **Recording becomes available** - Once all dependencies are ready, setup screen closes and recorder UI appears

### What Happens During Setup

- Downloads are fetched from GitHub Release assets
- SHA256 checksums verify each download integrity
- Browser archive is extracted into runtime directory
- Legacy bundled assets are imported if present (upgrade path)

### If Setup Fails

**Check:**
1. Network access to GitHub release assets
2. Free disk space in user data location (~1.5 GB required)
3. Logs for specific artifact failure (`main.log`)

**Recovery:**
- Click "Refresh Status" to re-check dependencies
- Click "Install Runtime Dependencies" to retry download
- Check logs: In-app "View Logs" button or file location (see [Troubleshooting](#troubleshooting))

---

## Recording Workflow

### Step 1: Configure Settings

In the Settings Panel (left sidebar):

**Start URL** - Enter the website you want to test (e.g., `https://example.com`)

**Output Folder** - Select where session bundles will be saved

**Voice Recording Toggle** - Enable/disable voice transcription (requires microphone permission)

**Microphone Selector** - Choose specific microphone (appears when voice enabled); if unavailable, auto-falls back to system default

All settings are saved automatically and persist across app restarts.

### Step 2: Start Recording

Click the "Start Recording" button in Recording Controls (bottom left).

**What happens:**
1. Settings validation (URL and folder must be set)
2. Microphone permission requested (if voice enabled)
3. Audio recording starts (16kHz WebM, stored in memory)
4. Playwright Chromium browser launches
5. Browser navigates to your Start URL
6. Browser widget appears in top-right corner

**Status display changes to:** "Recording" (red pulsing indicator)

### Step 3: Interact & Speak

**Browser interactions:**
- Click buttons, fill forms, navigate pages, select dropdowns, checkboxes, scroll
- Take screenshots with Cmd/Ctrl + Shift + S or widget button
- Record assertions with Cmd/Ctrl + Click or widget assertion mode

**Voice commentary:**
- Speak naturally while testing
- Commentary is captured continuously during recording
- Explain your intentions, verify expectations, describe edge cases

**Example commentary:**
> "Now clicking the login button. Filling in email address and password. Clicking submit. Expecting to see the dashboard."

### Step 4: (Optional) Pause/Resume

Use the browser widget (top-right) to pause or resume:

- Click pause button (⏸) - All recording stops, timer freezes, audio pauses
- Click resume button (▶) - Recording continues seamlessly, timer resumes

When paused, the app UI shows: "Recording paused. Use browser widget to resume."

See [Pause/Resume Recording](#pauseresume-recording) for full details.

### Step 5: Stop Recording

Click "Stop Recording" button in the app UI.

**What happens:**
1. Browser closes and actions are collected
2. Audio recording stops
3. Voice transcription begins (if voice was enabled)
4. Status shows "Processing" (blue)
5. Transcribed text is distributed across actions based on timing
6. Complete transcript is generated with embedded action references

**Time required:**
- Transcription: ~2-3x real-time (10s audio → 3-5s processing)
- Total processing: typically under 30 seconds for most sessions

### Step 6: View Transcript (Optional)

Once processing completes, a "View Transcript" button appears.

Click to open split-pane view:
- **Left pane:** ActionsList - chronological list of all recorded actions
- **Right pane:** TranscriptView - voice commentary with clickable action references

**Action references in transcript** (`[action:SHORT_ID:TYPE]`):
- Click any reference to highlight the corresponding action in ActionsList
- ActionsList auto-scrolls to the highlighted action

### Step 7: Save Session

Click "Save Session" button.

**Output created in your output folder:**
```
session-YYYY-MM-DD-HHMMSS/
├── INSTRUCTIONS.md    # AI instructions (reusable across sessions)
├── actions.json       # Session data (metadata + narrative + actions)
└── screenshots/       # PNG screenshots
```

See [Session Output](#session-output) for detailed format.

**After saving:**
- Save button shows green checkmark (disabled)
- "Reset" button becomes available to start fresh session

---

## Browser Widget Controls

Floating widget appears in the recorded browser window (top-right by default). Provides quick access to recording controls without leaving the page.

### Widget Features

**Pause/Resume Button** - Toggle between pause (⏸) and resume (▶)
- Screenshot button (camera icon) - Disabled while paused
- Assertion button (eye icon) - Disabled while paused
- Voice indicator (red pulsing dot) - Hidden while paused

### Drag and Snap

- **Drag** the widget by clicking and holding anywhere on the widget body (not buttons)
- **Release** to snap to nearest screen edge (top/bottom/left/right) with 20px padding
- Smooth animation during snap (300ms)

### Widget Security

The widget is isolated in Shadow DOM:
- Page styles don't affect widget appearance
- Page JavaScript cannot access or manipulate widget
- Widget clicks are never recorded as user actions

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Cmd/Ctrl + Click** | Record assertion (not click) |
| **Cmd/Ctrl + Shift + S** | Take screenshot |

**Assertion mode:** When active, clicking elements records them as assertions with visual feedback (hover highlighter). Use Cmd/Ctrl + Click for one-off assertions.

**Screenshot capture:** Takes full-page screenshot and records as action with reference in transcript.

---

## Voice Recording & Transcription

### How It Works

1. **Audio Capture** - MediaRecorder captures audio at 16kHz, stored in memory as WebM chunks
2. **Transcription (Stop)** - FFmpeg converts to WAV, Whisper.cpp transcribes to JSON
3. **Distribution** - Voice segments are matched to actions using timing windows
4. **Narrative Generation** - Voice text is interleaved with action references at sentence level

### Key Characteristics

**100% Local Processing:**
- No cloud API calls
- No data leaves your machine
- Whisper.cpp runs entirely offline

**Optimized Early Speech Detection:**
- 1.5s silence padding for microphone warm-up
- Entropy threshold tuned for quick speech onset

**Anti-Hallucination Filtering:**
- Removes repetitive text (2+ occurrences)
- Filters out bracketed markers like `[BLANK_AUDIO]`
- Excludes prompt text from output
- ~95% effective

**Time Windows for Voice-to-Action Association:**
- Lookback: 4 seconds (speech that precedes an action)
- Lookahead: 2 seconds (confirmations after action)
- Long segment threshold: 2 seconds (segments spanning multiple actions)

### Performance

- **Transcription speed:** ~2-3x real-time
- **Memory usage:** ~200 MB idle, +1.0 GB during transcription (model loaded)
- **Latency:** Transcription completes in seconds for typical sessions

---

## Pause/Resume Recording

Pause and resume recording is only available in the browser widget (not in the app UI).

### When Paused

- All action recording stops (clicks, inputs, navigation, screenshots, assertions)
- Audio recording pauses (no audio chunks collected)
- Screenshot and assertion buttons disabled
- Elapsed timer freezes
- Voice indicator hides
- App UI shows: "Recording paused. Use browser widget to resume."

### When Resumed

- Recording continues from pause moment
- Audio resumes seamlessly
- Timer excludes paused duration from elapsed time
- Timeline remains synchronized between actions and voice

### Use Cases

- **Taking notes** - Pause while reading documentation or planning next steps
- **Debugging** - Pause to inspect browser DevTools without recording interactions
- **Interrupts** - Pause when context-switching (phone calls, meetings)

---

## Session Output

Each recording produces a compact session bundle optimized for AI-assisted test generation.

### Bundle Structure

```
session-YYYY-MM-DD-HHMMSS/
├── INSTRUCTIONS.md    # Reusable AI instructions (~2,000 tokens)
├── actions.json       # Session-specific data (~3,850 tokens per session)
└── screenshots/       # PNG screenshots (if captured)
```

### Key Characteristics

**Framework-Agnostic:**
- Works with Playwright, Cypress, Selenium, Puppeteer, or any framework
- INSTRUCTIONS.md includes detection logic and framework-specific guides

**Token-Optimized:**
- INSTRUCTIONS.md shared across all sessions in same output directory
- Only session-specific data in actions.json
- 10 sessions = INSTRUCTIONS.md (2k tokens) + 10× actions.json (38.5k tokens) = ~40.5k tokens total

**AI-Instruction-Complete:**
- No external documentation needed
- All parsing rules embedded in INSTRUCTIONS.md
- Complete framework-specific code examples

### actions.json Structure

```json
{
  "_meta": {
    "formatVersion": "2.0",
    "generatedBy": "KiwiGen",
    "sessionId": "session-2026-01-23-102150",
    "startTime": 1737628910000,
    "startTimeISO": "2026-01-23T10:21:50.000Z",
    "duration": "8s",
    "startUrl": "https://example.com",
    "totalActions": 10,
    "actionTypes": { "click": 3, "fill": 2, "assert": 4, "navigate": 1 }
  },
  "narrative": {
    "text": "Clicking login [action:e6c3069a:click]. Filling username [action:c5922be3:fill]...",
    "note": "Voice commentary with embedded action references. Match SHORT_ID (first 8 chars) with action.id in actions array."
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
          { "strategy": "role", "value": "getByRole('button', { name: 'Submit' })", "confidence": "high" }
        ],
        "role": "button",
        "name": "Submit",
        "text": "Submit",
        "testId": "submit-btn"
      }
    }
  ]
}
```

### Action Reference Format

Actions are referenced in narrative as: `[action:SHORT_ID:TYPE]`

- **SHORT_ID** = First 8 characters of the full UUID in actions.json
- **TYPE** = Action type (click, fill, navigate, etc.)
- **Example:** `[action:8c61934e:click]` maps to `"id": "8c61934e-4cd3-4793-bdb5-5c1c6d696f37"`

### Multiple Locator Strategies

Each action provides multiple locator strategies with confidence levels:

| Strategy | Example | Confidence |
|----------|----------|-------------|
| testId | `[data-testid="submit-btn"]` | high |
| id | `#submit-button` | high |
| role | `getByRole('button', { name: 'Submit' })` | high |
| placeholder | `input[placeholder="Email"]` | medium |
| text | `getByText('Submit')` | medium |
| css | `button.submit-btn` | low |
| xpath | `//button[contains(text(), 'Submit')]` | low |

AI agents should prioritize **high confidence** locators when available.

---

## Viewing & Saving Sessions

### Viewing Transcripts

After recording stops and processing completes, click "View Transcript" to open split-pane view:

**Features:**
- Left pane: ActionsList - chronological action display with timestamps
- Right pane: TranscriptView - voice commentary with clickable action badges
- Click any action badge to highlight corresponding action in ActionsList
- Smooth auto-scroll to highlighted action
- Color-coded badges by action type (click=blue, fill=green, etc.)

### Saving Sessions

Click "Save Session" to write the bundle to your configured output folder.

**Success state:**
- "Session saved" message appears
- Save button disabled with green checkmark
- Folder location can be opened via notification or system file manager

### Resetting

Click "Reset" to start a fresh recording session:
- Clears actions and transcript
- Preserves settings (URL, path, voice toggle, microphone)
- Shows confirmation dialog if current session hasn't been saved

---

## Troubleshooting

### First-Launch Setup Fails

**Symptoms:** Setup screen shows errors or "Runtime dependencies not ready"

**Check logs for:**
- `Runtime manifest URL not configured, using bundled manifest.`
- `Failed to load remote runtime manifest. Falling back to bundled manifest.`
- `[runtime] downloading:*` / `[runtime] verifying:*` / `[runtime] extracting:*`
- `Checksum mismatch for ...`
- `Runtime manifest incomplete for ... Missing URL or SHA256.`

**Common causes:**
- Runtime assets not uploaded to GitHub Release
- `runtime-manifest.json` missing from release
- Wrong checksum in manifest
- Corporate proxy/network blocking release downloads

**Solutions:**
- Verify release has all runtime assets and `runtime-manifest.json`
- Re-run setup from in-app first-launch screen
- Check internet connectivity
- Review logs: In-app "View Logs" button or file location below

### "Start Recording" Does Nothing

**Symptoms:** Clicking "Start Recording" has no effect

**Check logs for:**
- `❌ Cannot start recording - preconditions not met` → URL or folder not set
- `Failed to start recording: Runtime dependencies are not installed yet` → Run first-launch setup
- `Failed to start recording: Browser launch failed` → Chromium runtime asset missing/corrupt
- `❌ Microphone permission denied` → Grant permissions in System Settings

**Solutions:**
- Set Start URL and Output Folder in Settings Panel
- Complete runtime dependency setup
- Grant microphone permission (System Settings → Privacy & Security → Microphone on macOS)
- Reinstall app if Chromium runtime is corrupted

### Browser Window Doesn't Open

**Symptoms:** Recording starts but no browser window appears

**Check:**
- Runtime dependencies are installed (setup completed)
- Check startup/runtime errors in `main.log`

**Solutions:**
- Complete first-launch runtime setup in app
- Confirm runtime assets exist in `runtime-deps/playwright-browsers/`

### Audio Recording Fails

**Symptoms:** Voice enabled but "Recording audio" status doesn't appear or shows error

**Check:**
- Microphone permissions granted
- Selected microphone is available
- Audio device is not being used by another app

**Solutions:**
- Grant microphone permission (System Settings → Privacy & Security → Microphone)
- Select different microphone in Microphone Selector
- Close other apps using the microphone
- Check for audio error messages in Status area

### Transcription Issues

**Symptoms:** Transcription takes very long, produces strange text, or fails

**Causes & solutions:**

**Missing early speech:**
- Fixed: 1.5s silence padding + entropy threshold tuning
- If still occurring, check microphone quality and speak clearly

**Hallucinations (strange text during silence):**
- Fixed: Automatic filtering removes repetitive text and bracketed markers
- ~95% effective; remaining noise should be minimal

**Poor technical term recognition:**
- Fixed: Upgraded to `small.en` model for better accuracy
- Use clear enunciation for technical terms

**Transcription fails completely:**
- Check model exists in `runtime-deps/models/`
- Check Whisper binary exists in `runtime-deps/`
- Verify FFmpeg is working (check logs)
- Reinstall runtime dependencies if files are corrupted

### Runtime Dependencies Missing

**Symptoms:** App shows "Runtime dependencies not ready" message

**Solutions:**
- Re-run first-launch setup from the setup screen
- Click "Refresh Status" to re-check dependency state
- If failing repeatedly, delete `runtime-deps` folder and reinstall

### Log Access

**In-App (easiest):**
- Click "View Logs" button in DebugInfoWidget (top-right)
- Click folder icon to open logs folder in Finder/Explorer

**Log file locations:**
- macOS: `~/Library/Logs/kiwigen/main.log`
- Windows: `%USERPROFILE%\AppData\Roaming\kiwigen\logs\main.log`

**Terminal access:**

macOS:
```bash
tail -f ~/Library/Logs/kiwigen/main.log
open ~/Library/Logs/kiwigen/main.log
```

Windows (PowerShell):
```powershell
Get-Content "$env:USERPROFILE\AppData\Roaming\kiwigen\logs\main.log" -Tail 50 -Wait
```

### DevTools (Advanced)

Access browser DevTools for renderer process debugging:

- macOS: `Cmd + Option + I`
- Windows: `Ctrl + Shift + I`

Shows React component state, console logs, and network activity.

### Reporting Bugs

When reporting issues, always include:

1. App version (from DebugInfoWidget)
2. Operating system and version
3. Full log file (last 100 lines minimum)
4. Steps to reproduce
5. DevTools console output (if relevant)

**Collect logs (macOS):**
```bash
tail -n 200 ~/Library/Logs/kiwigen/main.log | pbcopy
```

---

## Additional Resources

- **Development Documentation:** See `DEVELOPMENT.md` for architecture and implementation details
- **GitHub Repository:** [hotovo/kiwigen](https://github.com/hotovo/kiwigen)
- **Issue Reporting:** [GitHub Issues](https://github.com/hotovo/kiwigen/issues)
