# Logging and Debugging

Guide for accessing and using logs to debug Dodo Recorder.

---

## Log Access

### In-App (Easiest)

Two buttons in bottom-right status bar:
- **View Logs** - Opens log file in default text editor
- **Folder icon** - Opens logs folder in Finder/Explorer

### Log File Locations

**macOS:** `~/Library/Logs/dodo-recorder/main.log`
**Windows:** `%USERPROFILE%\AppData\Roaming\dodo-recorder\logs\main.log`

### Manual Access

**macOS:**
```bash
tail -f ~/Library/Logs/dodo-recorder/main.log
open ~/Library/Logs/dodo-recorder/main.log
```

**Windows (PowerShell):**
```powershell
Get-Content "$env:USERPROFILE\AppData\Roaming\dodo-recorder\logs\main.log" -Tail 50 -Wait
```

---

## Log Format

**Levels:** ERROR, WARN, INFO, DEBUG

**Format:** `[YYYY-MM-DD HH:MM:SS.mmm] [LEVEL] Message`

**Example:**
```
[2026-01-16 11:30:15.234] [INFO] Dodo Recorder Starting
[2026-01-16 11:30:15.245] [INFO] App Version: 0.1.0
[2026-01-16 11:30:20.567] [ERROR] Failed to start recording: URL validation failed
```

### Key Sections

**Startup:**
```
================================================================================
Dodo Recorder Starting
================================================================================
App Version: 0.1.0
Electron: 28.x.x
Platform: darwin arm64
Environment: production
Log File: /Users/xxx/Library/Logs/dodo-recorder/main.log
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

---

## Common Issues

### First-Launch Setup Fails

**Check logs for:**
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
- Re-run manifest verification scripts from `docs/building.md`
- Retry setup from in-app first-launch screen

### "Start Recording" Does Nothing

**Check logs for:**
1. `❌ Cannot start recording - preconditions not met` → URL or folder not set
2. `Failed to start recording: Runtime dependencies are not installed yet` → run first-launch setup
3. `Failed to start recording: Browser launch failed` → Chromium runtime asset missing/corrupt
4. `❌ Microphone permission denied` → Grant permissions in System Settings
5. `❌ Exception during startRecording IPC call` → IPC bridge issue, restart app

### Browser Window Doesn't Open

**Solutions:**
- Complete first-launch runtime setup in the app
- Confirm runtime assets exist in `runtime-deps/playwright-browsers/`
- Check startup/runtime errors in `main.log`

### Audio Recording Fails

**Check:**
- Microphone permissions granted
- MediaRecorder supported
- Audio device accessible

### Whisper Issues

**Missing model/binary at runtime:**
- Re-run first-launch setup
- Check `runtime-deps/models/` paths in logs

**Transcription fails:** Check for corrupted audio, binary permissions, model corruption.

---

## DevTools Console (Renderer Process)

**Access in production:**
- macOS: `Cmd+Option+I`
- Windows: `Ctrl+Shift+I`

**Example renderer logs:**
```
🎬 startRecording() called
  canStart: true
  status: idle
  isVoiceEnabled: true
⏰ Recording start time set: 1705408815234
🎤 Voice recording enabled - checking microphone permission...
```

---

## Development vs Production

**Development (`npm run dev`):**
- Console: Full debug output
- File: All levels including DEBUG

**Production (built app):**
- Console: Errors only
- File: INFO and above

---

## For Developers

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

## Advanced

### Enable Verbose Logging

Edit [`electron/utils/logger.ts`](electron/utils/logger.ts:1):
```typescript
// Change production level to debug
log.transports.file.level = 'debug'  // Was 'info'
log.transports.console.level = 'debug'  // Was 'error'
```

Rebuild: `npm run build`

### Log Rotation

Automatic rotation at 10 MB. Old logs: `main.old.log`

### Clear Logs

```bash
# macOS
rm ~/Library/Logs/dodo-recorder/*.log

# Windows
del "%USERPROFILE%\AppData\Roaming\dodo-recorder\logs\*.log"
```

---

## Bug Reports

Always include:
1. App version (from logs)
2. Operating system
3. Full log file (last 100 lines minimum)
4. Steps to reproduce
5. DevTools console output (if relevant)

**Collect logs (macOS):**
```bash
tail -n 200 ~/Library/Logs/dodo-recorder/main.log | pbcopy
```
