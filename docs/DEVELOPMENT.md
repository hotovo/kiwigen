# Development Guide

Complete guide for developing KiwiGen - system architecture, implementation details, development workflow, and debugging.

---

## Table of Contents

- [System Architecture](#system-architecture)
- [Tech Stack & Dependencies](#tech-stack--dependencies)
- [Core Components - Main Process](#core-components---main-process)
- [Core Components - Frontend Process](#core-components---frontend-process)
- [Browser Injection System](#browser-injection-system)
- [Recording Lifecycle & Data Flow](#recording-lifecycle--data-flow)
- [Development Workflow](#development-workflow)
- [Debugging & Logging](#debugging--logging)
- [Session Output Format](#session-output-format)
- [File Reference Map](#file-reference-map)

---

## System Architecture

### Two-Process Electron Model

KiwiGen uses Electron's two-process model for security and separation of concerns:

```
┌─────────────────────────────────────────────────────────┐
│                  Main Process                         │
│  (Node.js backend, full OS access)                   │
│                                                     │
│  • Application lifecycle                              │
│  • Browser window management                          │
│  • IPC handlers                                     │
│  • Playwright browser control                        │
│  • Whisper transcription                            │
│  • File system operations                            │
│  • Settings persistence                             │
└───────────────────┬─────────────────────────────────┘
                    │ IPC (Inter-Process Communication)
                    │ via preload.ts
┌───────────────────┴─────────────────────────────────┐
│              Renderer Process                         │
│  (React UI running in Chromium sandbox)                │
│                                                     │
│  • User interface                                   │
│  • Recording controls                               │
│  • Audio capture                                   │
│  • State display                                   │
│  • Transcript viewing                              │
└───────────────────────────────────────────────────────┘
```

**Key benefits:**
- Renderer process sandboxed (no direct Node.js access)
- Main process has full OS access (filesystem, subprocess execution)
- Clear security boundary enforced via IPC
- Parallel execution (UI remains responsive during heavy processing)

### IPC Communication Layer

**Renderer → Main** (via `window.electronAPI`):

```typescript
// Controlled actions from UI
window.electronAPI.startRecording(url, outputPath, startTime)
window.electronAPI.stopRecording()
window.electronAPI.transcribeAudio(audioBuffer)
window.electronAPI.distributeVoiceSegments(actions, segments)
window.electronAPI.saveSession(bundle)
window.electronAPI.getRuntimeDependenciesStatus()
window.electronAPI.installRuntimeDependencies()
```

**Main → Renderer** (via `mainWindow.webContents.send()`):

```typescript
// Events and state updates
mainWindow.webContents.send('action-recorded', action)
mainWindow.webContents.send('recording-state-changed', { status: 'paused' })
mainWindow.webContents.send('audio-activity-updated', { isActive })
mainWindow.webContents.send('runtime-dependencies-status', status)
```

**Preload script** (`electron/preload.ts`):
- Exposes safe bridge methods to renderer
- Type-safe `ElectronAPI` interface
- Enforces IPC boundaries
- No direct Node.js access from renderer

---

## Tech Stack & Dependencies

### Frontend (Renderer Process)

| Technology | Purpose | Version |
|------------|---------|---------|
| **React 18** | UI library | 18.2.0 |
| **TypeScript** | Type safety | 5.3.2 |
| **Vite** | Build tool & dev server | 5.0.7 |
| **Tailwind CSS** | Styling (dark mode only) | 3.3.6 |
| **Zustand** | State management | 4.4.7 |
| **Lucide React** | Icon library | 0.294.0 |
| **CVA** (class-variance-authority) | Component variants | 0.7.0 |

**Why these choices:**
- React + TypeScript: Industry standard, excellent tooling, strict type checking
- Vite: Fast HMR, modern build system, better than CRA for Electron
- Tailwind: Rapid UI development, consistent design system
- Zustand: Lightweight state management, no boilerplate, perfect for Electron apps
- Lucide: Consistent, modern icons matching dark theme

### Backend (Main Process)

| Technology | Purpose | Version |
|------------|---------|---------|
| **Electron** | Desktop app framework | 28.0.0 |
| **Node.js** | Runtime (required 18+) | - |
| **Playwright** | Browser automation | 1.40.0 |
| **Whisper.cpp** | Local speech-to-text | (runtime-downloaded) |
| **ffmpeg-static** | Audio processing | 5.3.0 |
| **electron-log** | Production logging | 5.4.3 |
| **uuid** | Unique ID generation | 9.0.1 |

**Why these choices:**
- Electron: Desktop app standard, cross-platform, native browser integration
- Playwright: Modern automation, excellent recording API, headless control
- Whisper.cpp (ggerganov port): Local transcription, no cloud, fast CPU performance
- ffmpeg-static: Audio format conversion, bundled binary
- electron-log: File logging with rotation, production-ready

### Build & Packaging

| Technology | Purpose |
|------------|---------|
| **electron-builder** | Cross-platform packaging and code signing |
| **GitHub Actions** | CI/CD for automated builds |
| **dotenv-cli** | Environment variable management |

---

## Core Components - Main Process

### Main Entry Point (`electron/main.ts`)

**Responsibilities:**
- Creates the main BrowserWindow (frameless, custom title bar)
- Initializes settings and microphone permissions
- Registers all IPC handlers via `registerAllHandlers()`
- Cleans up temporary files on startup
- Initializes runtime dependency manager and setup state
- Logs startup information

**Key implementation:**

```typescript
// Window creation
const mainWindow = new BrowserWindow({
  width: 1200,
  height: 800,
  frame: false,  // Custom title bar
  show: false,   // Show after ready
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,  // Security
  }
})

// Initial content loading
if (isDev) {
  mainWindow.loadURL('http://localhost:5173')
} else {
  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
}
```

**Startup flow:**
1. Initialize logger
2. Clean up temp files
3. Create window
4. Load preload script
5. Load React app
6. Register IPC handlers
7. Check runtime dependency status
8. Show window (after ready)

### IPC Handler System (`electron/ipc/`)

**Architecture:** Central registration with modular handlers

**`handlers.ts`** - Central registration:
```typescript
export function registerAllHandlers(mainWindow: BrowserWindow | null) {
  registerRecordingHandlers(mainWindow)
  registerSessionHandlers()
  registerSettingsHandlers()
  registerRuntimeHandlers(mainWindow)
}
```

**Why this pattern:**
- Single registration point prevents duplicates
- Modular handlers for different concerns
- Easy to add new IPC calls
- Type-safe via `window.electronAPI` in preload

#### Recording Handlers (`electron/ipc/recording.ts`)

| Handler | Purpose | Key Logic |
|----------|---------|------------|
| `start-recording` | Initialize BrowserRecorder, SessionWriter, Transcriber | Validate preconditions, create instances, launch browser |
| `stop-recording` | Stop browser recording, collect actions | Close browser, collect all actions |
| `transcribe-audio` | Transcribe audio via Whisper | FFmpeg conversion → Whisper.cpp → parse JSON |
| `distribute-voice-segments` | Associate voice with actions | Temporal proximity matching (4s/2s windows) |
| `generate-full-transcript` | Generate timestamped transcript | Sentence-level distribution, action references |
| `update-audio-activity` | Update voice indicator in widget | Set `window.__dodoAudioActive` via page.evaluate() |

#### Session Handlers (`electron/ipc/session.ts`)

| Handler | Purpose |
|----------|---------|
| `save-session` | Write session bundle to disk (INSTRUCTIONS.md + actions.json + screenshots/) |
| `settings-get-all`, `settings-update`, `settings-reset` | Settings persistence |
| `user-preferences-get`, `user-preferences-update` | User preferences (startUrl, outputPath) |
| `get-microphone-settings`, `update-microphone-settings` | Microphone selection (selectedMicrophoneId) |

#### Runtime Handlers (`electron/ipc/runtime.ts`)

| Handler | Purpose |
|----------|---------|
| `runtime-dependencies-status` | Returns first-launch dependency status (ready/missing) |
| `runtime-dependencies-install` | Downloads/verifies/extracts missing dependencies |
| `runtime-dependencies-cancel` | Cancels in-progress setup |
| `runtime-dependencies-progress` | Progress events to renderer |

### Browser Recorder (`electron/browser/recorder.ts`)

**Core Function:** Launch Chromium, inject tracking scripts, capture events

**Class:**
```typescript
export class BrowserRecorder extends EventEmitter {
  private browser: Browser | null
  private page: Page | null
  private context: BrowserContext | null
  private actions: RecordedAction[] = []
  private state: RecorderState = RecorderState.IDLE
  private sessionToken: string = ''
  private isPaused: boolean = false
  private pauseStartedAt: number | null = null
  private pausedDurationMs: number = 0

  // Lifecycle methods
  async start(url: string, screenshotDir?: string): Promise<void>
  async pause(): Promise<void>
  async resume(): Promise<void>
  async stop(): Promise<void>
  async captureScreenshot(): Promise<string | null>

  // Private methods
  private updateWidgetState(state: 'paused' | 'recording'): Promise<void>
  private injectScripts(): Promise<void>
  private setupExposedFunctions(): Promise<void>
}
```

**State machine** (RecorderState enum):
- `IDLE` - Not recording
- `RECORDING` - Active recording
- `PAUSED` - Recording paused

**State transition rules:**
- `IDLE → RECORDING`: Only via `start()`
- `RECORDING → PAUSED`: Only via `pause()`
- `PAUSED → RECORDING`: Only via `resume()`
- `RECORDING/PAUSED → IDLE`: Only via `stop()`

**Recording process:**
1. Launch Playwright browser with context and page
2. Inject tracking scripts via `page.addInitScript()` (before page load)
3. Expose functions for injected script to call:
   - `__dodoRecordAction` - Send action data to main process
   - `__dodoTakeScreenshot` - Capture screenshot
   - `__dodoPauseRecording` - Pause with session token validation
   - `__dodoResumeRecording` - Resume with session token validation
4. Navigate to start URL
5. Listen for 'action' events from exposed functions
6. Forward actions to renderer via IPC

**Session token security:**
- UUID generated on each `start()` via `crypto.randomUUID()`
- Token injected into browser context via `page.addInitScript()`
- `__dodoPauseRecording` / `__dodoResumeRecording` require valid token
- Widget reads `window.__dodoSessionToken` and passes on every call
- Prevents malicious scripts from manipulating recording

**Action types captured:**
- `click`, `fill`, `navigate`, `keypress`, `select`, `check`, `scroll`, `assert`, `screenshot`

### Audio Transcriber (`electron/audio/transcriber.ts`)

**Pipeline:**
```
WebM Buffer (16kHz)
  → FFmpeg (16kHz mono WAV + 1.5s silence padding)
  → Whisper.cpp CLI
  → JSON output
  → Timestamp adjustment (-1500ms)
  → Post-processing (filter hallucinations)
  → TranscriptSegment[]
```

**Key parameters:**

| Parameter | Value | Purpose |
|-----------|-------|---------|
| Model | `small.en` (466MB) | Balance of speed and accuracy |
| Sample rate | 16kHz | Whisper native format |
| Channels | Mono (1) | Required by Whisper |
| Padding | 1.5s (both ends) | Early speech detection |
| Entropy threshold | 2.0 | Aggressive detection |
| Beam size | 5 | Search breadth |
| Max segment length | 50 chars | Phrase-level segmentation |
| Split on words | Yes | `--sow` flag |
| Best of N | 5 | `-bo 5` flag |

**Anti-hallucination filtering:**

Two-phase post-processing:

**Phase 1: Detect repetitive text**
```typescript
const textCounts = new Map<string, number>()
result.forEach(segment => {
  const text = segment.speech.trim()
  textCounts.set(text, (textCounts.get(text) || 0) + 1)
})

const hallucinatedTexts = new Set<string>()
textCounts.forEach((count, text) => {
  if (count >= 2) {
    hallucinatedTexts.add(text)  // Repeated = hallucination
  }
})
```

**Phase 2: Filter all types**
```typescript
const validSegments = result.filter(segment => {
  const text = segment.speech.trim()
  return text.length > 0 &&
    text !== WHISPER_PROMPT &&              // Remove prompt
    !hallucinatedTexts.has(text) &&       // Remove repetitions
    !text.match(/^\[.*\]$/) &&            // Remove [BLANK_AUDIO]
    !text.match(/^\(.*\)$/) &&            // Remove (noise)
    text.length > 2                        // Min length
})
```

**Runtime dependency integration:**
- Receives `modelPath` and `whisperBinaryPath` at runtime
- Paths resolved from user-data runtime install root, not packaged resources

### Voice Distribution (`electron/utils/voiceDistribution.ts`)

**Algorithm:** Associates voice commentary with browser actions using temporal proximity

**Time windows (current defaults):**
- Lookback: 4 seconds (speech precedes action)
- Lookahead: 2 seconds (confirmations)
- Long segment threshold: 2 seconds

**Distribution logic:**

```typescript
export function distributeVoiceSegments(
  actions: RecordedAction[],
  segments: TranscriptSegment[],
  sessionStartTime: number
): RecordedAction[] {
  // Sort chronologically
  actions.sort((a, b) => a.timestamp - b.timestamp)
  segments.sort((a, b) => a.startTime - b.startTime)

  // For each segment, find nearest actions within window
  segments.forEach(segment => {
    const windowStart = segment.endTime - LOOKBACK_MS
    const windowEnd = segment.startTime + LOOKAHEAD_MS

    const candidates = actions.filter(a =>
      a.timestamp >= windowStart && a.timestamp <= windowEnd
    )

    if (candidates.length === 0) {
      // No actions in window → assign to closest
      assignToClosest(segment, actions)
    } else if (candidates.length === 1) {
      // One action → assign
      candidates[0].voiceSegments ??= []
      candidates[0].voiceSegments.push(segment)
    } else {
      // Multiple actions
      if (isLongSegment(segment)) {
        // Long segment spanning actions → assign to ALL
        candidates.forEach(a => {
          a.voiceSegments ??= []
          a.voiceSegments.push(segment)
        })
      } else {
        // Short segment → assign to closest by midpoint
        const closest = findClosest(candidates, segment)
        closest.voiceSegments ??= []
        closest.voiceSegments.push(segment)
      }
    }
  })

  return actions
}
```

**Why this algorithm:**
- Handles natural speech patterns (explaining before doing)
- Captures confirmations after actions
- Distributes long commentary appropriately
- Fallback to closest action when uncertain

**Configuration:**
- Stored in `electron/settings/store.ts`
- User-adjustable via settings
- Defaults used if settings not loaded

### Narrative Builder (`shared/narrativeBuilder.ts` / `electron/utils/enhancedTranscript.ts`)

**Purpose:** Generate narrative text with embedded action references for AI consumption

**Key innovation: Sentence-level distribution**

**Before (segment-level - inferior):**
```
"Clicking login then filling username and password.
[action:abc:click] [action:def:fill] [action:ghi:fill]"
```
❌ All actions clustered at end, loses context

**After (sentence-level - superior):**
```
"Clicking login [action:abc:click]. Filling username [action:def:fill].
And password [action:ghi:fill]."
```
✅ Actions adjacent to relevant phrases

**Implementation:**

1. **Split segments into sentences with timestamps:**
```typescript
function splitIntoSentencesWithTimestamps(
  text: string,
  segmentStartTime: number,
  segmentEndTime: number
): SentenceWithTime[] {
  // Split by '.', '!', '?'
  const sentences = text.split(/(?<=[.!?])\s+/)

  // Calculate proportional timestamps
  const totalLength = text.length
  let currentTime = segmentStartTime

  return sentences.map(sentence => {
    const length = sentence.length
    const proportion = length / totalLength
    const duration = (segmentEndTime - segmentStartTime) * proportion

    const sentenceWithTime = {
      text: sentence,
      startTime: currentTime,
      endTime: currentTime + duration
    }
    currentTime += duration
    return sentenceWithTime
  })
}
```

2. **Interleave actions within sentences:**
```typescript
function interleaveActionsInText(
  sentences: SentenceWithTime[],
  actions: RecordedAction[]
): string {
  let output = ''

  sentences.forEach(sentence => {
    // Find actions whose timestamp falls within sentence range
    const actionsInSentence = actions.filter(a =>
      a.timestamp >= sentence.startTime &&
      a.timestamp <= sentence.endTime
    )

    // Add sentence text
    output += sentence.text + ' '

    // Add action references after sentence
    actionsInSentence.forEach(action => {
      const shortId = action.id.substring(0, 8)
      output += `[action:${shortId}:${action.type}] `
    })
  })

  return output.trim()
}
```

3. **Build complete narrative:**
```typescript
function buildNarrativeWithSentenceLevelDistribution(
  actions: RecordedAction[]
): string {
  // Collect all unique segments chronologically
  const segments = getAllVoiceSegments(actions)

  // Build narrative
  let narrative = ''
  segments.forEach(segment => {
    const actionsWithThisSegment = actions.filter(a =>
      a.voiceSegments?.some(s => s.id === segment.id)
    )

    if (actionsWithThisSegment.length === 0) {
      // No actions → add text only
      narrative += segment.text + ' '
    } else {
      // Has actions → split and interleave
      const sentences = splitIntoSentencesWithTimestamps(
        segment.text,
        segment.startTime,
        segment.endTime
      )
      narrative += interleaveActionsInText(sentences, actionsWithThisSegment) + ' '
    }
  })

  // Append silent actions at end
  const silentActions = actions.filter(a => !a.voiceSegments?.length)
  silentActions.forEach(action => {
    const shortId = action.id.substring(0, 8)
    narrative += `[action:${shortId}:${action.type}] `
  })

  return narrative.trim()
}
```

**Why sentence-level:**
- 3-5x finer granularity than segment-level
- Actions appear at most relevant locations
- Natural reading flow for AI
- Better context for interpretation

### Session Writer (`electron/session/writer.ts`)

**Output structure:**
```
session-YYYY-MM-DD-HHMMSS/
├── INSTRUCTIONS.md    # Reusable AI instructions
├── actions.json       # _meta + narrative + actions
└── screenshots/       # PNG files
```

**Implementation:**

```typescript
async write(session: SessionBundle): Promise<string> {
  // 1. Create session directory
  const sessionDir = createSessionDirectory(session)

  // 2. Ensure INSTRUCTIONS.md exists (write once per directory)
  await ensureInstructionsFile(sessionDir)

  // 3. Generate narrative text
  const narrativeText = buildNarrativeWithSentenceLevelDistribution(session.actions)

  // 4. Build actions.json
  const actionsJson = {
    _meta: {
      formatVersion: "2.0",
      generatedBy: "KiwiGen",
      sessionId: session.sessionId,
      startTime: session.startTime,
      startTimeISO: new Date(session.startTime).toISOString(),
      duration: calculateDuration(session.actions),
      startUrl: session.startUrl,
      totalActions: session.actions.length,
      actionTypes: countActionTypes(session.actions)
    },
    narrative: {
      text: narrativeText,
      note: "Voice commentary with embedded action references. Match SHORT_ID (first 8 chars) with action.id in actions array."
    },
    actions: stripVoiceSegments(session.actions)  // Remove voiceSegments for output
  }

  // 5. Write actions.json
  await writeJson(
    path.join(sessionDir, 'actions.json'),
    actionsJson,
    { spaces: 2 }
  )

  // 6. Copy screenshots
  await copyScreenshots(session.screenshots, sessionDir)

  return sessionDir
}
```

**Why this structure:**
- Token-efficient: INSTRUCTIONS.md shared across sessions
- Single source: All session data in one JSON file
- AI-ready: Complete instructions embedded
- Human-readable: Clear metadata and narrative flow

### Settings Store (`electron/settings/store.ts`)

**Persistent JSON storage in user data directory:**

```typescript
interface AppSettings {
  whisper: {
    transcriptionTimeoutMs: number  // 300000 (5 minutes)
  }
  voiceDistribution: {
    lookbackMs: number        // 4000ms (4 seconds)
    lookaheadMs: number       // 2000ms (2 seconds)
    longSegmentThresholdMs: number  // 2000ms (2 seconds)
  }
  output: {
    includeScreenshots: boolean  // false
    prettyPrintJson: boolean    // true
  }
  userPreferences: {
    startUrl: string
    outputPath: string
  }
  audio: {
    selectedMicrophoneId?: string
  }
}
```

**Location:**
- macOS: `~/Library/Application Support/kiwigen/settings.json`
- Windows: `%USERPROFILE%\AppData\Roaming\kiwigen\settings.json`

### Runtime Dependency Manager (`electron/runtime/dependency-manager.ts`)

**Responsibilities:**
- Resolve platform (`darwin-arm64`, `win32-x64`)
- Load release runtime manifest (`runtime-manifest.json`) with bundled fallback
- Track install state in user data (`runtime-deps/install-state.json`)
- Download artifacts, verify SHA256, extract browser archive
- Import legacy bundled assets during transition upgrades
- Expose status/progress for renderer setup gate

**Managed dependencies:**
- Whisper model (`ggml-small.en.bin`)
- Whisper binary (platform-specific)
- Playwright Chromium runtime archive

**FFmpeg conversion:**
```typescript
ffmpeg(inputPath)
  .audioFrequency(16000)  // 16kHz sample rate
  .audioChannels(1)        // Mono
  .audioCodec('pcm_s16le') // PCM format
  .format('wav')
  .audioFilters([
    'apad=pad_dur=1.5',   // Padding technique for early speech detection
    'areverse',
    'apad=pad_dur=1.5',
    'areverse'
  ])
```

**Whisper parameters:**
- Model: `small.en` (466MB)
- Entropy threshold: `2.0` (aggressive early detection)
- Beam search: 5 candidates
- Max segment length: 50 characters
- Split on word boundaries
- Prompt: "This is a recording session with browser interactions, clicking, navigation, and voice commentary."

**Post-processing filters:**
- Removes prompt text hallucinations
- Removes repetitive text (appears 2+ times)
- Removes bracketed text like `[BLANK_AUDIO]`, `[noise]`
- Removes parenthetical text like `(mouse clicking)`
- Minimum 3 characters

### Utility Modules (`electron/utils/`)

**`fs.ts`** - File system helpers:
- `ensureDir()`, `writeJson()`, `writeText()`, `cleanupOldTempFiles()`, `safeUnlink()`, `getTempPath()`

**`ipc.ts`** - IPC response helpers:
- `handleIpc()`, `ipcSuccess()`, `ipcError()`

**`logger.ts`** - Environment-aware logging:
- Uses electron-log with sanitization
- Levels: debug, info, warn, error

**`validation.ts`** - Input validation:
- `validateUrl()`, `validateOutputPath()`, `validateAudioBuffer()`, `sanitizeSessionId()`, `validateRecordedActionsArray()`, `validateTranscriptSegmentsArray()`, `validateSettingsUpdate()`, `validateUserPreferencesUpdate()`, `validateSessionBundle()`

---

## Core Components - Frontend Process

### Main App Component (`src/App.tsx`)

**Layout:**
```tsx
<div className="h-screen flex flex-col overflow-hidden select-none">
  <TitleBar />  {/* Custom window controls */}
  <header>
    <StatusBar />  {/* Recording status, elapsed time, action count */}
    <DebugInfoWidget />  {/* Build info, log access */}
  </header>
  <main className="flex-1 flex overflow-hidden">
    <aside className="w-80 border-r border-border bg-card flex flex-col flex-shrink-0">
      <SettingsPanel />  {/* Start URL, output folder, voice toggle, mic selector */}
      <RecordingControls />  {/* Start/stop/save/reset buttons */}
    </aside>
    <RuntimeSetupGate />  {/* First-launch runtime dependency setup */}
    <section className="flex-1 flex flex-col overflow-hidden bg-background">
      {isTranscriptViewOpen ? (
        // Split view: ActionsList + TranscriptView
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 min-w-0 border-r border-border bg-background flex flex-col">
            <ActionsList />
          </div>
          <TranscriptView />
        </div>
      ) : (
        // Full width ActionsList
        <ActionsList />
      )}
    </section>
  </main>
</div>
```

**RuntimeSetupGate:**
- Shows setup screen if `runtimeStatus !== 'ready'`
- Progress bars for download/verification/extraction phases
- "Refresh Status" and "Install Runtime Dependencies" buttons
- Gates all recorder controls until dependencies ready

### State Management (`src/stores/recordingStore.ts`)

**Global Zustand store:**

```typescript
interface RecordingState {
  // Recording state
  status: RecordingStatus  // 'idle' | 'recording' | 'processing' | 'saving'
  actions: RecordedAction[]
  transcriptSegments: TranscriptSegment[]
  transcriptText: string
  startTime: number | null

  // Settings
  startUrl: string
  outputPath: string
  notes: string
  isVoiceEnabled: boolean
  selectedMicrophoneId: string | undefined

  // Audio
  audioStatus: AudioStatus  // 'idle' | 'recording' | 'processing' | 'complete' | 'error'
  audioChunksCount: number
  audioError: string | null

  // UI
  sessionSaved: boolean
  isTranscriptViewOpen: boolean
  highlightedActionId: string | null

  // Actions
  setStatus: (status: RecordingStatus) => void
  addAction: (action: RecordedAction) => void
  setTranscriptText: (text: string) => void
  // ... more actions
}
```

**Access pattern:**
```typescript
const { status, actions, setStatus } = useRecordingStore(
  useShallow((state) => ({
    status: state.status,
    actions: state.actions,
    setStatus: state.setStatus,
  }))
)
```

**Benefits::**
- No prop drilling
- Efficient re-renders (only when selected state changes)

### Recording Controls (`src/components/RecordingControls.tsx`)

**Buttons:**

**1. Start Recording**
- Shown when: `status === 'idle' && actions.length === 0`
- Enabled when: `startUrl && outputPath && status === 'idle'`

**Process:**
1. Validates URL and output path
2. Requests microphone permission (if voice enabled)
3. Validates selected microphone device exists
4. Starts audio recording (if voice enabled)
5. Launches Playwright browser
6. Navigates to start URL
7. Sets status to 'recording'

**2. Stop Recording**
- Shown when: `status === 'recording'` or `status === 'paused'`

**Process:**
1. Stops browser recording, closes browser
2. Stops audio recording (if enabled)
3. Transcribes audio via Whisper
4. Distributes voice segments to actions
5. Generates transcript text
6. Sets status to 'idle'

**Note:** Pause and resume are only available in the browser widget, not in app UI. When paused, app UI shows a message prompting users to use the browser widget to resume.

**3. Save Session**
- Shown when: `status === 'idle' && actions.length > 0`

Writes session bundle to output folder (INSTRUCTIONS.md, actions.json, screenshots/). Shows success state, disables to prevent duplicate saves. Button uses `variant="success"` when not saved, `variant="outline"` when saved.

**4. Reset**
- Shown when: `status === 'idle' && actions.length > 0`

Shows confirmation dialog if session hasn't been saved. Clears actions, transcript, audio state. Preserves settings (URL, path, voice toggle, microphone) and reloads saved preferences.

**Audio status display:**
- **Recording:** Red pulsing dot + "Recording audio" + chunk count
- **Processing:** Spinner + "Transcribing audio..."
- **Complete:** Segment count display (emerald/green)
- **Error:** Error message with MicOff icon (red)

### Settings Panel (`src/components/SettingsPanel.tsx`)

**Input fields:**

**1. Start URL**
- Auto-saved to persistent settings via `useSettings` hook
- Disabled during recording

**2. Output Folder**
- Read-only input + button opens native folder picker
- Auto-saved
- Disabled during recording

**3. Voice Recording Toggle**
- Enables/disables audio transcription
- When enabled, shows microphone selector and informational text
- Disabled during recording

**4. Microphone Selector** (`src/components/MicrophoneSelector.tsx`)
- Visible only when voice recording enabled
- Features dropdown (select device) and refresh button (re-enumerate)

**Settings persistence:**
Settings are managed via `useSettings` hook (`src/lib/useSettings.ts`):
```typescript
const { updatePreferences, updateMicrophoneSettings } = useSettings()

// Update startUrl with automatic persistence
const handleStartUrlChange = async (url: string) => {
  setStartUrl(url)
  await updatePreferences({ startUrl: url })
}
```

### Actions List (`src/components/ActionsList.tsx`)

Displays recorded browser actions in real-time.

**Empty state:**
Shows icon and message "No actions recorded yet" when no actions exist.

**Action items:**
- Numbered index (01, 02, etc.)
- Type icon and color-coded badge
- Timestamp (MM:SS)
- Type badge: "action", "assertion", or "screenshot"
- Description text (truncated with tooltip)
- Expandable details (locators, confidence, bounding box, voice segments)
- Delete button (Trash2 icon) - appears on hover when not recording

**Highlighting:**
```tsx
className={cn(
  highlightedActionId === action.id
    ? 'bg-blue-500/20 border-l-4 border-l-blue-400'
    : 'hover:bg-card'
)}
```
Triggered by clicking action reference in transcript or programmatic selection.

**Action types and colors:**
- `click`: Blue (`text-blue-400`)
- `fill`: Green (`text-green-400`)
- `navigate`: Purple (`text-purple-400`)
- `keypress`: Yellow (`text-yellow-400`)
- `select`: Orange (`text-orange-400`)
- `check`: Orange (`text-orange-400`)
- `scroll`: Cyan (`text-cyan-400`)
- `assert`: Pink (`text-pink-400`)
- `screenshot`: Indigo (`text-indigo-400`)

### Transcript View (`src/components/TranscriptView.tsx`)

UI component displaying voice commentary with embedded, clickable action references.

**Features:**
- Natural narrative flow, clickable action badges, auto-scroll synchronization, responsive 50/50 split with ActionsList

**Parsing pipeline:**

**Step 1: Extract narrative**
```typescript
const extractNarrative = (text: string): string => {
  const match = text.match(/## Narrative\s*\n\s*([\s\S]*?)(?:\n\n## Action Reference|$)/)
  return match?.[1]?.trim() || text
}
```

**Step 2: Parse into structured parts**
```typescript
interface TranscriptPart {
  type: 'text' | 'action' | 'screenshot'
  content: string
  actionId?: string           // For action parts
  actionType?: ActionType     // For action parts
  screenshotFilename?: string // For screenshot parts
}

const parseTranscript = (text: string): TranscriptPart[] => {
  const regex = /\[(action|screenshot):([^\]]+)\]/g
  // Find all [action:ID:TYPE] and [screenshot:FILENAME] references
  // Extract text between references
  // Build structured array
}
```

**Rendering:**

**Text parts:**
```tsx
<span className="text-foreground/95 text-base leading-relaxed">
  {part.content}
</span>
```

**Action parts (clickable badges):**
```tsx
<button
  onClick={() => handleActionClick(part.actionId!)}
  className={cn(
    'inline-flex items-center gap-1.5 px-2 py-1 mx-0.5 rounded-md',
    'bg-secondary/50 hover:bg-secondary transition-colors',
    'cursor-pointer select-none align-middle',
    colorClass  // Different color per action type
  )}
>
  <Icon className="w-3.5 h-3.5" />
  <span className="text-xs font-mono font-medium">{part.actionId}:{part.actionType}</span>
</button>
```

**Colors by type:** Click (blue), Fill (green), Navigate (purple), Assert (pink), Screenshot (indigo)

**Action highlighting:**
```typescript
const handleActionClick = (shortId: string) => {
  // Match 8-char prefix to full UUID
  const action = actions.find(a => a.id.startsWith(shortId))
  if (action) {
    setHighlightedActionId(action.id)

    // Auto-scroll to action in ActionsList
    setTimeout(() => {
      const element = document.querySelector(`[data-action-id="${action.id}"]`)
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
  }
}
```

### Audio Recording Hook (`src/hooks/useAudioRecorder.ts`)

**Purpose:** Encapsulate MediaRecorder lifecycle and state management

**Interface:**
```typescript
export type AudioStatus = 'idle' | 'recording' | 'processing' | 'complete' | 'error'

interface UseAudioRecorderReturn {
  audioStatus: AudioStatus
  audioError: string | null
  audioChunksCount: number
  startRecording: (deviceId?: string) => Promise<void>
  stopRecording: () => Promise<Blob | null>
  pause: () => void
  resume: () => void
  getAudioChunks: () => Blob[]
  clearChunks: () => void
}
```

**Key features:**
- Permission checking and device validation
- Microphone selection with fallback to default
- MediaRecorder lifecycle management (start, pause, resume, stop)
- Chunk collection with count tracking
- Error handling with user-friendly messages

**Device usage:**
```typescript
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    deviceId: selectedMicrophoneId ? { exact: selectedMicrophoneId } : undefined,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 16000
  }
})
```

**Fallback logic:**
```typescript
// Validate selected device exists before requesting stream
if (selectedMicrophoneId) {
  const devices = await navigator.mediaDevices.enumerateDevices()
  const deviceExists = devices.some(d => d.deviceId === selectedMicrophoneId)

  if (!deviceExists) {
    setAudioError('Selected microphone not available, using default')
    setSelectedMicrophoneId(undefined)
    await window.electronAPI.updateMicrophoneSettings({ selectedMicrophoneId: undefined })
  }
}

// Try selected device, fallback on failure
try {
  stream = await getUserMedia({ deviceId: { exact: selectedMicrophoneId } })
} catch (error) {
  if (selectedMicrophoneId) {
    stream = await getUserMedia({ audio: defaultConstraints })
  } else {
    setAudioError(error.message)
    return
  }
}
```

### Runtime Setup Gate (`src/components/RuntimeSetupGate.tsx`)

**Purpose:** Enforce runtime dependency installation before recording features are available

**Features:**
- Progress bars for download/verify/extract phases
- Current phase display
- "Refresh Status" button to re-check dependency state
- "Install Runtime Dependencies" button to start setup
- Cancel button to stop in-progress setup

**Status states:**
- `not-ready` - Dependencies missing, setup not started
- `downloading` - Currently downloading artifacts
- `verifying` - Verifying checksums
- `extracting` - Extracting browser archive
- `ready` - All dependencies installed, can proceed to recording

**Data source:**
```typescript
const status = await window.electronAPI.getRuntimeDependenciesStatus()
```

---

## Browser Injection System

### Injected Script (`electron/browser/injected-script.ts`)

**Purpose:** Capture browser DOM events and extract rich element information

**Event types captured:**
- `click`, `input`, `change`, `blur`, `keypress`, `scroll`, `submit`
- Assertion mode: `click` with Cmd/Ctrl modifier

**Action generation:**

```typescript
interface RecordedAction {
  id: string              // UUID
  timestamp: number       // ms from session start
  type: ActionType       // click, fill, navigate, keypress, select, check, scroll, assert, screenshot
  target: {
    selector: string     // Best CSS selector
    locators: Locator[]  // Multiple strategies with confidence
    role: string | null
    name: string | null
    text: string | null
    testId: string | null
    tagName: string
    boundingBox: { x, y, width, height }
  }
  value?: string          // For fill, keypress, select actions
  screenshot?: string     // For screenshot actions
}
```

**Locator extraction priority:**
1. `[data-testid="..."]` - Test ID attributes (high confidence)
2. `#id` - Element ID (high confidence)
3. `tagName[role="..."]` - ARIA role (high confidence)
4. `input[type="..."]` - Input type (medium confidence)
5. `[name="..."]` - Name attribute (medium confidence)
6. `tagName:text("...")` - Text content (buttons/links) (medium confidence)
7. `tagName` - Fallback to tag name (low confidence)

**Widget exclusion:**
```typescript
const WIDGET_HOST_ID = '__kiwigen-widget-host'

const isWithinWidget = (target: Element): boolean => {
  const widgetHost = document.getElementById(WIDGET_HOST_ID)
  return !!(widgetHost && (widgetHost.contains(target) || widgetHost === target))
}

// All event listeners check before recording
document.addEventListener('click', (e) => {
  if (isWithinWidget(e.target as Element)) return
  // Record action...
})
```

### Recording Widget (`electron/browser/recording-widget.ts`)

**Purpose:** Floating UI control in browser window during recording sessions

**Features:**
- Pause/resume recording with session token validation
- Screenshot capture button
- Assertion mode toggle
- Voice recording indicator (pulsing red dot)
- Draggable with edge snapping
- Shadow DOM isolation (never recorded)

**Shadow DOM structure:**
```typescript
const widgetHost = document.createElement('div')
widgetHost.id = '__kiwigen-widget-host'
widgetHost.style.cssText = 'position: fixed; z-index: 2147483647; pointer-events: none;'
widgetHost.setAttribute('data-kiwigen', 'true')  // Mark as non-React element
const shadow = widgetHost.attachShadow({ mode: 'closed' })
```

**Benefits:** Complete CSS isolation, page cannot affect widget styling, protection from page JavaScript

**Session token validation:**
```typescript
let assertionModeActive = false

pauseResumeBtn.addEventListener('click', async (e) => {
  e.stopPropagation()

  const win = window as unknown as DodoWindow
  const sessionToken = win.__dodoSessionToken

  if (isPaused) {
    // Resume requires valid token
    if (typeof win.__dodoResumeRecording === 'function') {
      await win.__dodoResumeRecording(sessionToken)
    }
  } else {
    // Pause requires valid token
    if (typeof win.__dodoPauseRecording === 'function') {
      await win.__dodoPauseRecording(sessionToken)
    }
  }
})
```

**State updates:**
```typescript
// Main process calls updateWidgetState() via page.evaluate()
await this.page.evaluate((state: 'paused' | 'recording') => {
  const widget = document.querySelector('#__kiwigen-widget-host')
  if (widget) {
    // Update visual state
    widget.classList.toggle('paused', state === 'paused')

    // Update button icon and tooltip
    const pauseResumeBtn = widget.shadowRoot.querySelector('#pause-resume-btn')
    pauseResumeBtn.innerHTML = state === 'paused' ? PLAY_SVG : PAUSE_SVG

    // Disable/enable other buttons
    const screenshotBtn = widget.shadowRoot.querySelector('#screenshot-btn') as HTMLButtonElement
    const assertionBtn = widget.shadowRoot.querySelector('#assertion-btn') as HTMLButtonElement
    screenshotBtn.disabled = state === 'paused'
    assertionBtn.disabled = state === 'paused'

    // Update voice indicator
    const voiceIndicator = widget.shadowRoot.querySelector('#voice-indicator')
    voiceIndicator.style.display = state === 'paused' ? 'none' : 'block'
  }
}, newState)
```

**Drag and edge snapping:**
```typescript
let isDragging = false
let dragStartX = 0
let dragStartY = 0
let widgetStartX = 0
let widgetStartY = 0

widget.addEventListener('mousedown', (e) => {
  // Only start drag if clicking on widget body, not buttons
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

document.addEventListener('mouseup', () => {
  if (!isDragging) return

  isDragging = false
  widget.classList.remove('dragging')

  // Snap to nearest edge
  snapToEdge()
})

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
```

### Hover Highlighter (`electron/browser/hover-highlighter.ts`)

**Purpose:** Visual feedback during assertion mode, showing element boundaries and selector information

**Dual trigger mode:**
- Widget button toggle (persistent mode)
- Cmd/Ctrl modifier key (transient mode)

**Visual feedback:**
- Semi-transparent blue overlay (`rgba(59, 130, 246, 0.2)`)
- Solid border outline for clear boundaries
- Label showing element selector (testId, id, role, type, name, or text)

**Shadow DOM isolation:**
```typescript
const highlightHost = document.createElement('div')
highlightHost.id = '__dodo-highlight-overlay-host'
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
```

**Assertion mode check:**
```typescript
function isAssertionModeActive(): boolean {
  const widgetMode = win.__dodoAssertionMode?.() || false
  const keyMode = isCommandKeyPressed
  return widgetMode || keyMode
}
```

**Event handlers:**
- `mousemove` - Shows overlay on hover when assertion mode is active
- `keydown` - Activates transient mode on Cmd/Ctrl press
- `keyup` - Deactivates transient mode on key release
- `blur` - Cleans up key state on window focus loss
- `scroll` - Updates overlay position during scroll
- Periodic check (100ms) - Ensures overlay state matches assertion mode

**Element label generation (priority order):**
1. `[data-testid="..."]` - Test ID attributes
2. `#id` - Element ID
3. `tagName[role="..."]` - ARIA role
4. `input[type="..."]` - Input type
5. `[name="..."]` - Name attribute
6. `tagName:text("...")` - Text content (buttons, links)
7. `tagName` - Fallback to tag name

**Performance optimizations:**
- RAF (requestAnimationFrame) throttling for overlay updates
- Passive event listeners for mousemove
- Efficient DOM queries

---

## Recording Lifecycle & Data Flow

### Complete Recording Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    START RECORDING                        │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. User fills settings in UI                              │
│    - Start URL                                             │
│    - Output path                                           │
│    - Voice toggle (enabled)                                 │
│    - Microphone selection (if voice enabled)                  │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. User clicks "Start Recording" button                   │
│    - URL and path validated                               │
│    - Microphone permission requested (if voice enabled)       │
│    - Selected device validated                              │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Renderer process calls IPC handler                    │
│    window.electronAPI.startRecording(url, outputPath, start)│
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Main process creates BrowserRecorder                   │
│    - Resolves runtime paths                               │
│    - Creates BrowserRecorder instance                        │
│    - Generates session token (UUID)                        │
│    - Launches Playwright Chromium browser                    │
│    - Injects tracking scripts before page load               │
│    - Navigates to start URL                             │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Renderer starts audio recording (if voice enabled)    │
│    - MediaRecorder captures chunks                          │
│    - Chunks stored in memory                            │
│    - Audio activity sent to browser widget                  │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. User interacts with browser                          │
│    - Clicks, fills, navigates                          │
│    - Injected script captures events                       │
│    - Actions sent to main process via IPC                │
│    - Actions forwarded to renderer for display               │
│    - Voice commentary captured continuously                    │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. (Optional) User pauses/resumes via browser widget    │
│    - Recording stops temporarily                         │
│    - Audio pauses                                       │
│    - Timer freezes                                     │
│    - Resume continues seamlessly                           │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. User clicks "Stop Recording" button                 │
│    - Browser recording stops, closes browser             │
│    - Audio recording stops                             │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 9. Renderer transcribes audio (if voice enabled)         │
│    window.electronAPI.transcribeAudio(audioBuffer)        │
│    - FFmpeg converts WebM → WAV + padding             │
│    - Whisper.cpp transcribes to JSON                    │
│    - Timestamps adjusted for padding                   │
│    - Hallucinations filtered                         │
│    → Returns TranscriptSegment[]                       │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 10. Renderer distributes voice to actions                 │
│     window.electronAPI.distributeVoiceSegments(actions)    │
│     - Temporal proximity matching (4s/2s windows)      │
│     - Long segment handling                             │
│     - Closest-action fallback                           │
│     → Returns actions with voiceSegments attached        │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 11. Renderer generates transcript                       │
│     window.electronAPI.generateTranscriptWithReferences()  │
│     - Split voice into sentences with timestamps          │
│     - Interleave actions within sentences               │
│     - Build narrative with embedded [action:ID:TYPE]   │
│     → Returns transcript text                          │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 12. Store updated with transcript and voice-enhanced actions│
│     - transcriptText set in store                      │
│     - actions array updated with voiceSegments           │
│     - "View transcript" button becomes visible         │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 13. (Optional) User views transcript                   │
│     - Split view shows ActionsList + TranscriptView      │
│     - Click action badges to highlight in ActionsList    │
│     - Smooth scroll to highlighted action               │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 14. User clicks "Save Session" button                  │
│     window.electronAPI.saveSession(bundle)               │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 15. Main process saves session bundle                   │
│     - Create session directory (session-YYYY-MM-DD-HHMMSS)│
│     - Ensure INSTRUCTIONS.md exists (write if needed)    │
│     - Generate narrative from actions                   │
│     - Write actions.json (_meta + narrative + actions)  │
│     - Copy screenshots to screenshots/ folder            │
│     → Return session directory path                     │
└─────────────────────────────────────────────────────────────┘
```

### IPC Communication Patterns

**Renderer → Main:**
```typescript
// Controlled action from UI
window.electronAPI.startRecording(url, outputPath, startTime)
```

**Main process handler:**
```typescript
ipcMain.handle('start-recording', async (event, url, outputPath, startTime) => {
  // Validate preconditions
  // Create BrowserRecorder instance
  // Start recording
  return { success: true }
})
```

**Main → Renderer:**
```typescript
// Event broadcast
mainWindow.webContents.send('action-recorded', action)
```

**Renderer listener:**
```typescript
useEffect(() => {
  const handleActionRecorded = (_event, action) => {
    setActions(prev => [...prev, action])
  }

  window.electronAPI.onActionRecorded(handleActionRecorded)

  return () => {
    window.electronAPI.offActionRecorded(handleActionRecorded)
  }
}, [])
```

### Pause/Resume Flow

```
┌─────────────────────────────────────────────────────────────┐
│ User clicks pause button in browser widget               │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ Widget calls window.__dodoPauseRecording(sessionToken)   │
│    - Exposed function from recorder                    │
│    - Session token validated                            │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ Recorder sets paused state                              │
│    - Validates state transition (RECORDING → PAUSED)   │
│    - Records pause timestamp                           │
│    - Emits 'paused' event                            │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ Recorder notifies widget via page.evaluate()               │
│    - Sets window.__dodoRecordingPaused = true        │
│    - Updates widget visual state                        │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ Widget updates UI                                      │
│    - Pause button → resume button                       │
│    - Screenshot button disabled                         │
│    - Assertion button disabled                          │
│    - Voice indicator hides                             │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ Recorder notifies main app via IPC                       │
│    mainWindow.webContents.send('recording-state-changed',   │
│      { status: 'paused' })                            │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ Renderer updates display                                │
│    - Shows "Recording paused" message                   │
│    - Status shows "Paused" (yellow)                    │
│    - Timer stops counting                             │
└─────────────────────────────────────────────────────────────┘
```

**Resume flow is the reverse of pause.**

---

## Development Workflow

### Local Development

```bash
npm run dev
```

**This starts:**
- Vite dev server for React frontend (hot reload enabled)
- Electron in watch mode

Changes to source files will automatically reload the app.

### Build Commands

**Local test build** (unsigned, macOS ARM64 only):
```bash
npm run build
```

**Production build** (signed + notarized, macOS ARM64 + Windows x64):
```bash
npm run build:prod
```

### Type Checking

```bash
# Check renderer and Electron/shared code
npx tsc --noEmit

# Check Node.js build scripts
npx tsc -p tsconfig.node.json
```

### Runtime Dependency Preparation (for releases)

Release runtime assets are generated in CI on every published release.

**Release flow:**
1. Commit and push desired source changes.
2. Create and push tag `vX.Y.Z` that matches `package.json` version.
3. Publish a GitHub Release for that tag.

When the release is published, CI automatically:
- builds macOS and Windows installers,
- packages runtime assets on both platforms,
- generates `runtime-manifest.json` from both metadata files,
- verifies manifest structure,
- uploads installers + runtime assets + manifest to that release,
- validates manifest URLs with retries.

Manual scripts remain available for local diagnostics only:

```bash
node ./build/package-runtime-assets.js --platform darwin-arm64 --release-tag vX.Y.Z
node ./build/package-runtime-assets.js --platform win32-x64 --release-tag vX.Y.Z
node ./build/generate-runtime-manifest.js --metadata-dir release/runtime-assets
node ./build/verify-runtime-manifest.js --manifest release/runtime-assets/runtime-manifest.json
```

### Code Signing & Notarization (macOS)

**Required for production builds** (maintainer only):

**Environment variables** (`.env` file):
```bash
APPLE_ID="your-apple-id@example.com"
APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
APPLE_TEAM_ID="L7PUGF6Q28"
```

**Certificate options:**
1. **Explicit .p12 file:** `CSC_LINK=./certificate.p12`, `CSC_KEY_PASSWORD=password`
2. **Keychain auto-discovery** (default) - No variables needed
3. **Explicit certificate name:** `CSC_NAME="Developer ID Application: Your Name (TEAM_ID)"`

**Verification after build:**
```bash
# Check signature
codesign -dv --verbose=4 release/mac-arm64/Dodo\ Recorder.app

# Check notarization
spctl -a -vv -t install release/mac-arm64/Dodo\ Recorder.app
# Expected: "accepted" + "source=Notarized Developer ID"

# Check stapled ticket
stapler validate release/mac-arm64/Dodo\ Recorder.app
# Expected: "The validate action worked!"
```

### CI/CD Pipeline

**GitHub Actions workflow** (`.github/workflows/build.yml`):

**Primary trigger:** GitHub Release `published`

**Fallback trigger:** Manual `workflow_dispatch` with required `release_tag` input

**Jobs:**
1. **`prepare`** - Resolves and validates release tag
2. **`build-macos-arm64`** - Builds signed/notarized macOS app + macOS runtime assets
3. **`build-windows`** - Builds unsigned Windows app + Windows runtime assets
4. **`generate-runtime-manifest`** - Combines platform metadata into `runtime-manifest.json` and verifies it
5. **`upload-to-release`** - Uploads installers + runtime assets + manifest to the same tag and verifies URLs

**GitHub Secrets (macOS signing):**
- `MACOS_CERTIFICATE` - Base64-encoded Developer ID Application certificate (.p12)
- `MACOS_CERTIFICATE_PASSWORD` - Password for .p12 certificate
- `APPLE_ID` - Apple ID email
- `APPLE_APP_SPECIFIC_PASSWORD` - App-specific password
- `APPLE_TEAM_ID` - Apple Developer Team ID

### Testing Runtime Dependency Downloads (macOS)

To simulate a fresh install and verify that dependency downloading works correctly:

**1. Quit the app** (Cmd+Q).

**2. Delete the entire runtime-deps directory:**
```bash
rm -rf ~/Library/Application\ Support/kiwigen/runtime-deps
```
This removes all managed assets and the `install-state.json` tracking file.

**3. Relaunch the app:**
```bash
open /Applications/Dodo\ Recorder.app
```
On startup, `initialize()` recreates the directory, loads the remote manifest (falls back to bundled), and `refreshStatus()` returns `needs_install`. The `RuntimeSetupGate` UI blocks all recorder controls.

**4. Click "Install Runtime Dependencies"** to trigger the download → verify → extract flow.

**Monitor progress in real-time:**
```bash
tail -f ~/Library/Logs/kiwigen/main.log
```
Expected log entries: `[runtime] downloading:*` → `[runtime] verifying:*` → `[runtime] extracting:*` → `[runtime] done`

**To reset only one artifact** (e.g. just the Whisper model):
```bash
rm ~/Library/Application\ Support/kiwigen/runtime-deps/models/ggml-small.en.bin
rm ~/Library/Application\ Support/kiwigen/runtime-deps/install-state.json
```
The `installAll()` loop skips artifacts where the file exists **and** the stored version matches the manifest — deleting `install-state.json` alone forces a full re-verification pass.

---

## Debugging & Logging

### Log Access

**In-App (easiest):**
- Click "View Logs" button in DebugInfoWidget (top-right)
- Click folder icon to open logs folder in Finder/Explorer

**Log file locations:**
- macOS: `~/Library/Logs/kiwigen/main.log`
- Windows: `%USERPROFILE%\AppData\Roaming\kiwigen\logs\main.log`

**Manual access:**

macOS:
```bash
tail -f ~/Library/Logs/kiwigen/main.log
open ~/Library/Logs/kiwigen/main.log
```

Windows (PowerShell):
```powershell
Get-Content "$env:USERPROFILE\AppData\Roaming\kiwigen\logs\main.log" -Tail 50 -Wait
```

### Log Format

**Levels:** ERROR, WARN, INFO, DEBUG

**Format:** `[YYYY-MM-DD HH:MM:SS.mmm] [LEVEL] Message`

**Example:**
```
[2026-01-16 11:30:15.234] [INFO] KiwiGen Starting
[2026-01-16 11:30:15.245] [INFO] App Version: 0.3.0
[2026-01-16 11:30:20.567] [ERROR] Failed to start recording: URL validation failed
```

**Key sections:**

**Startup:**
```
================================================================================
KiwiGen Starting
================================================================================
App Version: 0.3.0
Electron: 28.x.x
Platform: darwin arm64
Environment: production
Log File: /Users/xxx/Library/Logs/kiwigen/main.log
================================================================================
```

**Recording lifecycle:**
```
[INFO] 🎬 startRecording() called
[INFO]   startUrl: https://example.com
[INFO]   outputPath: /Users/xxx/sessions
[INFO]   isVoiceEnabled: true
[INFO] 🎤 Microphone permission result: {"granted":true}
[INFO] ✅ Recording started successfully
```

**Errors:**
```
[ERROR] ❌ Cannot start recording - preconditions not met
[ERROR]   canStart: false
[ERROR] Failed to start recording: Browser launch failed
```

### Common Issues

**First-launch setup fails:**

Check logs for:
1. `Runtime manifest URL not configured, using bundled manifest.`
2. `Failed to load remote runtime manifest. Falling back to bundled manifest.`
3. `[runtime] downloading:*` / `[runtime] verifying:*` / `[runtime] extracting:*`
4. `Checksum mismatch for ...`
5. `Runtime manifest incomplete for ... Missing URL or SHA256.`

**Typical causes:**
- Runtime assets not uploaded to GitHub Release
- `runtime-manifest.json` missing from release
- Wrong checksum in manifest
- Corporate proxy/network blocking release downloads

**Fixes:**
- Verify release has all runtime assets and `runtime-manifest.json`
- Re-run manifest verification scripts from build docs
- Retry setup from in-app first-launch screen

**"Start Recording" does nothing:**

Check logs for:
1. `❌ Cannot start recording - preconditions not met` → URL or folder not set
2. `Failed to start recording: Runtime dependencies are not installed yet` → Run first-launch setup
3. `Failed to start recording: Browser launch failed` → Chromium runtime asset missing/corrupt
4. `❌ Microphone permission denied` → Grant permissions in System Settings
5. `❌ Exception during startRecording IPC call` → IPC bridge issue, restart app

**Audio recording fails:**

Check:
- Microphone permissions granted
- MediaRecorder supported
- Audio device accessible

**Whisper issues:**

Missing model/binary at runtime:
- Re-run first-launch setup
- Check `runtime-deps/models/` paths in logs

Transcription fails:
- Check for corrupted audio, binary permissions, model corruption

### DevTools Console (Renderer Process)

**Access in production:**
- macOS: `Cmd + Option + I`
- Windows: `Ctrl + Shift + I`

**Example renderer logs:**
```
🎬 startRecording() called
  canStart: true
  status: idle
  isVoiceEnabled: true
⏰ Recording start time set: 1705408815234
🎤 Voice recording enabled - checking microphone permission...
```

### Adding Logging

```typescript
import { logger } from './utils/logger'

logger.debug('Detailed info')  // Development only
logger.info('Normal operation')  // Always logged
logger.warn('Warning')
logger.error('Error', error)
```

### Best Practices

1. **Appropriate levels:** DEBUG (dumps), INFO (operations), WARN (recoverable), ERROR (failures)
2. **Include context:** `logger.info('Recording started', { url, outputPath })`
3. **Emojis for visibility:** `logger.info('🎬 Starting...')`, `logger.error('❌ Failed')`
4. **State transitions:** `logger.info(\`Status: ${old} -> ${new}\`)`

---

## Session Output Format

### Bundle Structure

```
session-YYYY-MM-DD-HHMMSS/
├── INSTRUCTIONS.md    # Reusable AI instructions (framework-agnostic)
├── actions.json       # Session data: _meta + narrative + actions
└── screenshots/       # PNG files (screenshot-{timestamp}.png)
```

**Key characteristics:**
- **Compact:** Only 3 essential components
- **Single source:** All session data in actions.json
- **Reusable instructions:** INSTRUCTIONS.md shared across all sessions
- **Framework-agnostic:** Playwright, Cypress, Selenium, Puppeteer, etc.
- **Token-optimized:** Efficient for LLM processing

### File Specifications

**INSTRUCTIONS.md**

**Format:** Markdown
**Size:** ~150 lines (~2,000 tokens)
**Reusability:** ✅ Shared across all sessions in same output directory

**Content:**
1. Overview - What are session bundles, framework-agnostic nature
2. Bundle structure - Files and purposes
3. Processing instructions:
   - Read actions.json
   - Parse action references (`[action:SHORT_ID:TYPE]`)
   - Choose locator strategies (confidence-based)
   - Interpret action types
   - Use voice commentary
4. Framework-specific implementation:
   - Detecting framework (Playwright/Cypress)
   - Playwright guide (structure, locators, best practices)
   - Cypress guide (structure, locators, best practices)
   - Empty repository handling
5. Format version

**Purpose:** Reusable instructions AI reads once, applies to all subsequent sessions.

**actions.json**

**Format:** JSON (pretty-printed, 2-space indent)
**Encoding:** UTF-8
**Size:** ~3,850 tokens for typical 29-action session

**Structure:**
```typescript
interface ActionsJson {
  _meta: {
    formatVersion: "2.0"
    generatedBy: string
    sessionId: string           // session-YYYY-MM-DD-HHMMSS
    startTime: number            // Unix timestamp ms
    startTimeISO: string         // ISO 8601
    duration: string             // e.g., "3m 45s"
    startUrl?: string
    totalActions: number
    actionTypes: Record<string, number>  // { "click": 5, "fill": 2 }
  }
  narrative: {
    text: string  // Voice commentary with [action:SHORT_ID:TYPE] embedded
    note: string  // Fixed explanation of reference format
  }
  actions: RecordedAction[]  // Array without voiceSegments
}
```

**Example:**
```json
{
  "_meta": {
    "formatVersion": "2.0",
    "generatedBy": "KiwiGen",
    "sessionId": "session-2026-01-23-102150",
    "startTime": 1737628910000,
    "startTimeISO": "2026-01-23T10:21:50.000Z",
    "duration": "8s",
    "startUrl": "https://github.com/pricing",
    "totalActions": 10,
    "actionTypes": { "assert": 4, "screenshot": 2, "click": 1, "navigate": 3 }
  },
  "narrative": {
    "text": "This is a recording... [action:c8d39f77:assert] [action:aa42301c:assert]...",
    "note": "Voice commentary with embedded action references. Match SHORT_ID (first 8 chars) with action.id in actions array."
  },
  "actions": [
    {
      "id": "c8d39f77-176a-4b5a-9209-9558c2f4dbf8",
      "timestamp": 4958,
      "type": "assert",
      "target": {
        "selector": "getByText('\\bOpen\\b \\bSource\\b')",
        "locators": [
          { "strategy": "text", "value": "getByText('\\bOpen\\b \\bSource\\b')", "confidence": "medium" },
          { "strategy": "css", "value": "ul > li:nth-of-type(4) > div > button", "confidence": "low" }
        ],
        "role": "button",
        "name": "Open Source",
        "text": "Open Source",
        "tagName": "button",
        "boundingBox": { "x": 402, "y": 16, "width": 134, "height": 40 }
      }
    }
  ]
}
```

**Validation rules:**
1. Action references in narrative must exist in actions array
2. SHORT_ID must match first 8 chars of action.id
3. Action types must match
4. Duration = last.timestamp - first.timestamp
5. actionTypes must sum to totalActions

### screenshots/

**Format:** PNG
**Naming:** `screenshot-{timestamp}.png`
**Referenced by:**
- `action.screenshot` field
- `[screenshot:filename.png]` in narrative

### Token Optimization

**Efficiency:**
```
session-YYYY-MM-DD-HHMMSS/
├── INSTRUCTIONS.md   ~2,000 tokens (shared, read once)
├── actions.json      ~3,850 tokens (per session)
└── screenshots/
```

**Multi-session efficiency:**
- 1 session: ~5,850 tokens
- 5 sessions: ~21,250 tokens (INSTRUCTIONS.md once + 5× actions.json)
- 10 sessions: ~40,500 tokens (INSTRUCTIONS.md once + 10× actions.json)

**Key insight:** INSTRUCTIONS.md reused across all sessions.

### Action Reference Format

**Syntax:** `[action:SHORT_ID:TYPE]`
- **SHORT_ID** = First 8 chars of full UUID in actions.json
- **TYPE** = Action type (click, fill, navigate, etc.)
- **Example:** `[action:8c61934e:click]` → `"id": "8c61934e-4cd3-4793-bdb5-5c1c6d696f37"`

**Screenshot references:**
- **Syntax:** `[screenshot:FILENAME]`
- **Example:** `[screenshot:screenshot-001.png]`

### Multiple Locator Strategies

Each action provides multiple locator strategies with confidence levels:

| Strategy | Example | Confidence |
|----------|----------|-------------|
| testId | `getByTestId('submit-btn')` | high |
| id | `page.locator('#submit-button')` | high |
| role | `getByRole('button', { name: 'Submit' })` | high |
| placeholder | `page.locator('input[placeholder="Email"]')` | medium |
| text | `page.locator('button:has-text("Submit")')` | medium |
| css | `page.locator('button.submit-btn')` | low |
| xpath | `page.locator('//button[contains(text(), "Submit")]')` | low |

**Priority:** Use high confidence locators when available.

---

## File Reference Map

### Quick Lookup: Feature → File Location

| Feature | File Path | Key Functions/Components |
|----------|------------|------------------------|
| **Main entry** | `electron/main.ts` | BrowserWindow creation, IPC registration, startup |
| **IPC handlers** | `electron/ipc/handlers.ts` | Central handler registration |
| **Recording IPC** | `electron/ipc/recording.ts` | start-recording, stop-recording, transcribe-audio, distribute-voice-segments, generate-full-transcript |
| **Session IPC** | `electron/ipc/session.ts` | save-session, settings-get-all, user-preferences-get/update |
| **Runtime IPC** | `electron/ipc/runtime.ts` | runtime-dependencies-status, install, cancel, progress |
| **Browser recorder** | `electron/browser/recorder.ts` | BrowserRecorder class (start, pause, resume, stop) |
| **Injected script** | `electron/browser/injected-script.ts` | Event capture, locator generation |
| **Recording widget** | `electron/browser/recording-widget.ts` | Floating UI widget, pause/resume, screenshot, assertion mode |
| **Hover highlighter** | `electron/browser/hover-highlighter.ts` | Dual-trigger visual feedback, overlay |
| **Audio transcriber** | `electron/audio/transcriber.ts` | Whisper.cpp integration, FFmpeg conversion |
| **Voice distribution** | `electron/utils/voiceDistribution.ts` | Temporal algorithm (4s/2s windows) |
| **Narrative builder** | `shared/narrativeBuilder.ts` / `electron/utils/enhancedTranscript.ts` | Sentence-level distribution |
| **Session writer** | `electron/session/writer.ts` | Bundle generation (INSTRUCTIONS.md + actions.json) |
| **Settings store** | `electron/settings/store.ts` | AppSettings class with persistence |
| **Runtime manager** | `electron/runtime/dependency-manager.ts` | Runtime dependency download/management |
| **Runtime manifest** | `electron/runtime/manifest.ts` | Bundled fallback runtime manifest |
| **FS utilities** | `electron/utils/fs.ts` | File system helpers |
| **IPC utilities** | `electron/utils/ipc.ts` | IPC error handling |
| **Logger** | `electron/utils/logger.ts` | Production logging |
| **Validation** | `electron/utils/validation.ts` | Input validation functions |
| **React app** | `src/App.tsx` | Main app layout, RuntimeSetupGate |
| **Recording controls** | `src/components/RecordingControls.tsx` | Start/stop/save/reset buttons |
| **Settings panel** | `src/components/SettingsPanel.tsx` | Settings form (URL, path, voice toggle, mic selector) |
| **Actions list** | `src/components/ActionsList.tsx` | Action display with timestamps |
| **Transcript view** | `src/components/TranscriptView.tsx` | Narrative with clickable action references |
| **Audio recorder hook** | `src/hooks/useAudioRecorder.ts` | MediaRecorder lifecycle |
| **State store** | `src/stores/recordingStore.ts` | Zustand global state |
| **Runtime setup gate** | `src/components/RuntimeSetupGate.tsx` | First-launch setup UI |

### IPC Handler Registry

**Recording handlers** (`electron/ipc/recording.ts`):

| Handler | Input | Output | Purpose |
|----------|-------|--------|---------|
| `start-recording` | url, outputPath, startTime | { success: boolean } | Start browser recording |
| `stop-recording` | - | { actions: RecordedAction[] } | Stop and collect actions |
| `transcribe-audio` | audioBuffer (ArrayBuffer) | { success: boolean, segments?: TranscriptSegment[] } | Transcribe via Whisper |
| `distribute-voice-segments` | actions, segments | { success: boolean, actions?: RecordedAction[] } | Associate voice with actions |
| `generate-full-transcript` | actions, sessionId, startTime, startUrl | { success: boolean, transcript?: string } | Generate narrative with references |
| `update-audio-activity` | isActive | - | Update voice indicator in widget |

**Session handlers** (`electron/ipc/session.ts`):

| Handler | Input | Output | Purpose |
|----------|-------|--------|---------|
| `save-session` | sessionBundle | { success: boolean, path?: string } | Write session bundle |
| `settings-get-all` | - | AppSettings | Get all settings |
| `settings-update` | updates | AppSettings | Update settings |
| `settings-reset` | - | AppSettings | Reset to defaults |
| `user-preferences-get` | - | UserPreferences | Get user preferences |
| `user-preferences-update` | updates | UserPreferences | Update user preferences |
| `get-microphone-settings` | - | MicrophoneSettings | Get mic settings |
| `update-microphone-settings` | updates | MicrophoneSettings | Update mic settings |

**Runtime handlers** (`electron/ipc/runtime.ts`):

| Handler | Input | Output | Purpose |
|----------|-------|--------|---------|
| `runtime-dependencies-status` | - | RuntimeStatus | Check if runtime ready |
| `runtime-dependencies-install` | - | - | Start runtime install |
| `runtime-dependencies-cancel` | - | - | Cancel in-progress install |
| `get-log-path` | - | { logPath: string } | Get log file path |
| `open-log-file` | - | - | Open log file |
| `open-log-folder` | - | - | Open log folder |

### Component Responsibility Matrix

**Main process components:**

| Component | Primary Responsibility | Secondary Responsibilities |
|-----------|------------------------|------------------------|
| `electron/main.ts` | Application lifecycle, window creation | IPC registration, logging initialization |
| `electron/browser/recorder.ts` | Playwright browser control | Script injection, session token security |
| `electron/browser/injected-script.ts` | DOM event capture | Locator extraction, widget exclusion |
| `electron/browser/recording-widget.ts` | Browser UI controls | Pause/resume, screenshot, assertion mode |
| `electron/browser/hover-highlighter.ts` | Visual feedback during assertions | Dual-trigger mode, overlay rendering |
| `electron/audio/transcriber.ts` | Whisper.cpp integration | FFmpeg conversion, anti-hallucination |
| `electron/utils/voiceDistribution.ts` | Voice-to-action association | Temporal windows, long segment handling |
| `shared/narrativeBuilder.ts` | Narrative text generation | Sentence-level distribution, action references |
| `electron/session/writer.ts` | Session bundle output | INSTRUCTIONS.md generation, JSON writing |
| `electron/runtime/dependency-manager.ts` | Runtime dependency management | Download, verification, extraction |
| `electron/settings/store.ts` | Settings persistence | User preferences, mic selection |

**Frontend process components:**

| Component | Primary Responsibility | Secondary Responsibilities |
|-----------|------------------------|------------------------|
| `src/App.tsx` | Main app layout | RuntimeSetupGate integration |
| `src/stores/recordingStore.ts` | Global state management | Recording status, audio state, UI state |
| `src/components/RecordingControls.tsx` | Recording lifecycle control | Audio status display, save/reset |
| `src/components/SettingsPanel.tsx` | Settings form | URL/path input, voice toggle, mic selector |
| `src/components/ActionsList.tsx` | Action display | Real-time updates, highlighting |
| `src/components/TranscriptView.tsx` | Transcript rendering | Action reference parsing, click-to-highlight |
| `src/hooks/useAudioRecorder.ts` | Audio recording lifecycle | Device validation, fallback logic |
| `src/components/RuntimeSetupGate.tsx` | Runtime dependency setup | Progress display, status checking |

---

## Shared Types (`shared/types.ts`)

**Core type definitions used across main and renderer processes:**

```typescript
export interface RecordedAction {
  id: string
  timestamp: number
  type: ActionType
  target: ActionTarget
  value?: string
  screenshot?: string
  voiceSegments?: TranscriptSegment[]  // Only in internal processing, stripped from output
}

export type ActionType =
  | 'click'
  | 'fill'
  | 'navigate'
  | 'keypress'
  | 'select'
  | 'check'
  | 'scroll'
  | 'assert'
  | 'screenshot'

export interface ActionTarget {
  selector: string
  locators: Locator[]
  role: string | null
  name: string | null
  text: string | null
  testId: string | null
  tagName: string
  boundingBox: BoundingBox
}

export interface Locator {
  strategy: LocatorStrategy
  value: string
  confidence: 'high' | 'medium' | 'low'
}

export type LocatorStrategy =
  | 'testId'
  | 'id'
  | 'role'
  | 'placeholder'
  | 'text'
  | 'css'
  | 'xpath'

export interface TranscriptSegment {
  id: string
  startTime: number
  endTime: number
  text: string
}

export interface SessionBundle {
  sessionId: string
  startTime: number
  startUrl: string
  actions: RecordedAction[]
  screenshots: string[]
}

export interface AppSettings {
  whisper: {
    transcriptionTimeoutMs: number
  }
  voiceDistribution: {
    lookbackMs: number
    lookaheadMs: number
    longSegmentThresholdMs: number
  }
  output: {
    includeScreenshots: boolean
    prettyPrintJson: boolean
  }
  userPreferences: {
    startUrl: string
    outputPath: string
  }
  audio: {
    selectedMicrophoneId?: string
  }
}
```

---

## Shared Constants (`shared/constants.ts`)

Centralized constants for consistency:

```typescript
// Timing configuration
export const INPUT_DEBOUNCE_MS = 1000
export const AUDIO_SAMPLE_RATE = 16000
export const WIDGET_POLL_INTERVAL_MS = 100
export const AUDIO_CHUNK_INTERVAL_MS = 1000
export const AUDIO_STOP_DELAY_MS = 500

// Time windows for voice distribution
export const DEFAULT_LOOKBACK_MS = 4000  // 4 seconds
export const DEFAULT_LOOKAHEAD_MS = 2000  // 2 seconds
export const DEFAULT_LONG_SEGMENT_THRESHOLD_MS = 2000  // 2 seconds

// UI constants
export const MAX_Z_INDEX = 2147483647
export const WIDGET_PADDING = 20
export const SNAP_DISTANCE = 20

// IDs and selectors
export const WIDGET_HOST_ID = '__kiwigen-widget-host'
export const HIGHLIGHT_HOST_ID = '__dodo-highlight-overlay-host'
export const PAUSE_RESUME_BTN_SELECTOR = '#pause-resume-btn'
export const SCREENSHOT_BTN_SELECTOR = '#screenshot-btn'
export const ASSERTION_BTN_SELECTOR = '#assertion-btn'
export const VOICE_INDICATOR_SELECTOR = '#voice-indicator'

// CSS classes
export const CSS_CLASSES = {
  WIDGET: 'dodo-widget',
  PAUSED: 'paused',
  DRAGGING: 'dragging',
  SNAPPING: 'snapping',
  WIDGET_BTN: 'widget-btn',
  VOICE_INDICATOR: 'voice-indicator',
  ACTIVE: 'active',
  FLASH: 'flash',
  TOOLTIP: 'tooltip',
} as const

// Validation constants
export const VALID_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/
export const SESSION_ID_REGEX = /^[a-zA-Z0-9_-]+$/
export const MAX_AUDIO_SIZE = 50 * 1024 * 1024  // 50MB
export const MAX_URL_LENGTH = 2048
export const MAX_PATH_LENGTH = 4096
export const MAX_TIMEOUT_MS = 600000  // 10 minutes

// Audio configuration
export const AUDIO_BITS_PER_SECOND = 128000
export const AUDIO_MIME_TYPE = 'audio/webm;codecs=opus'

// Widget text
export const WIDGET_TEXT = {
  PAUSE_RECORDING: 'Pause Recording',
  RESUME_RECORDING: 'Resume Recording',
  SCREENSHOT: 'Screenshot',
  ASSERTION_MODE: 'Assertion Mode',
} as const
```

---

## Additional Resources

- **User Guide:** See `USER_GUIDE.md` for feature documentation
- **GitHub Repository:** [hotovo/kiwigen](https://github.com/hotovo/kiwigen)
- **Issue Reporting:** [GitHub Issues](https://github.com/hotovo/kiwigen/issues)
