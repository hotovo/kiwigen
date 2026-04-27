# KiwiGen Security Analysis

## Scope

This document captures the security issues identified during a code and documentation review of KiwiGen.

Reviewed sources included:

- `README.md`
- `docs/DEVELOPMENT.md`
- `docs/user_guide.md`
- `AGENTS.md`
- `electron/`
- `src/`
- `shared/`
- `index.html`

This is an analysis document only. No remediation is implemented here.

## System Trust Boundaries

KiwiGen has three major trust boundaries:

1. Electron renderer to main process
   The React renderer runs in the Electron app window and reaches privileged functionality through `window.electronAPI` from `electron/preload.ts`.

2. Electron main process to recorded browser pages
   The main process launches a Playwright-controlled Chromium browser and injects recorder code into arbitrary visited pages.

3. Local processing and export
   Recorded actions, page metadata, screenshots, and transcripts are processed locally and exported into session bundles.

Most of the identified issues come from over-trusting data from recorded pages or over-collecting/exporting sensitive data.

## Security Findings

### 1. High: Sensitive form values and URL secrets are exported in plaintext

#### What happens

The recorder captures typed input values and later writes them directly into `actions.json`.

Relevant code:

- `electron/browser/injected-script.ts:302-344`
- `shared/types.ts:37-47`
- `electron/session/writer.ts:63-83`
- `electron/browser/recorder.ts:297-311`

The `input` and `blur` handlers record:

- `type: 'fill'`
- `target: getElementInfo(target)`
- `value: target.value`

There is no filtering for:

- password fields
- one-time passcodes
- API keys
- secret tokens
- personal data
- hidden or security-sensitive form inputs

The recorder also stores navigation URLs. If a visited URL contains secrets in the query string or fragment, those secrets are preserved in the exported actions.

#### Why this is a security problem

This turns normal usage into a data exfiltration path.

Examples:

- recording a login flow can export the actual password
- recording a password reset flow can export a magic-link token from the URL
- recording internal admin tools can export customer identifiers or internal auth parameters
- recording developer tools can export API keys pasted into forms

Because KiwiGen is specifically designed to produce bundles for sharing with AI agents or other people, the exposure risk is high. The bundle becomes a portable plaintext container of secrets.

#### Impact

- credential leakage
- account takeover risk if URLs contain live tokens
- PII leakage
- accidental leakage into source control, tickets, prompts, or external tools

---

### 2. High: The recorder over-collects DOM data and exports hidden/internal values

#### What happens

When a DOM element is recorded, KiwiGen collects a large object from the target element.

Relevant code:

- `electron/browser/injected-script.ts:204-243`
- `electron/browser/injected-script.ts:217-236`
- `electron/session/writer.ts:63-83`

`getElementInfo()` collects:

- selectors and locator variants
- role, name, text, placeholder
- xpath and css selector
- `innerText`
- `attributes` copied from almost all element attributes
- bounding box coordinates

The attribute filtering is minimal. It excludes only:

- `class`
- `style`
- `onclick`
- `onmouseover`

Everything else is potentially exported.

#### Why this is a security problem

This is broader data collection than is needed to generate replayable tests.

It can capture:

- hidden inputs containing CSRF tokens
- internal IDs in `data-*` attributes
- signed URLs in `href` or `src`
- security-relevant attributes in custom components
- visible PII in `innerText`
- application state that was never intended to leave the page

Because these fields are written to `actions.json`, secrets can leak even if the user never typed them. Simply clicking an element may export sensitive page state.

#### Impact

- token leakage
- internal implementation leakage
- accidental export of customer or employee data
- disclosure of data not necessary for recorder functionality

---

### 3. Medium: Untrusted recorded pages can forge actions and trigger screenshots

#### What happens

The Playwright page receives exposed functions from the main process:

- `__kiwiRecordAction`
- `__kiwiTakeScreenshot`

Relevant code:

- `electron/browser/recorder.ts:227-245`
- `electron/browser/injected-script.ts:246-257`

These functions are available inside the page JavaScript context. Any script running on the recorded page can call them.

There is no verification of:

- user gesture
- event origin
- whether the action came from KiwiGen's injected listeners
- whether the caller is trusted application code

#### Why this is a security problem

Any first-party page script, third-party analytics script, ad script, extension-influenced page script, or compromised application script can:

- inject fake actions into the session timeline
- generate misleading evidence in the exported bundle
- trigger screenshots without the user performing the corresponding action

This is primarily an integrity issue, but it can also become a privacy issue if screenshots are forced at sensitive times.

#### Impact

- tampered recordings
- reduced trust in exported evidence
- unintentional screenshot capture of sensitive page states

---

### 4. Medium: The session-token protection for pause/resume is ineffective

#### What happens

The code documents a security control around pause/resume operations using a session token.

Relevant code:

- `electron/browser/recorder.ts:247-294`
- `electron/browser/recording-widget.ts:423-451`
- `shared/browser-context.ts:30-35`
- `docs/DEVELOPMENT.md:301-306`
- `docs/DEVELOPMENT.md:1192-1210`

The intended model is:

1. generate a session token in the main process
2. inject it into the page
3. require it for `__kiwiPauseRecording` and `__kiwiResumeRecording`

However, the same page that can call the functions can also read the injected token from `window.__kiwiSessionToken`.

#### Why this is a security problem

This protection does not protect against the untrusted page itself.

Any page script can:

1. read `window.__kiwiSessionToken`
2. call `window.__kiwiPauseRecording(token)`
3. call `window.__kiwiResumeRecording(token)`

So the token is not a meaningful authentication boundary.

This is especially important because the documentation explicitly claims this mechanism prevents malicious scripts from manipulating recording. In the current implementation, it does not.

#### Impact

- false sense of protection
- malicious or buggy page scripts can pause/resume recording at will
- documentation overstates the security guarantee

---

### 5. Medium: Output path validation can be bypassed

#### What happens

KiwiGen validates the output path before writing session files.

Relevant code:

- `electron/utils/validation.ts:52-95`
- `electron/session/writer.ts:26-30`
- `electron/utils/fs.ts:5-16`

The validation uses prefix checks:

- `normalized.startsWith(homeDir)`
- `normalized.startsWith(userDataDir)`

It also tries to prevent symlink traversal by calling `fs.realpathSync(normalized)`, but only if the exact target already exists.

#### Why this is a security problem

The root check is string-prefix based, not path-boundary based.

Example:

- allowed root: `/Users/dodo`
- attacker-controlled path: `/Users/dodo_evil/session-output`

The second path still starts with `/Users/dodo`, so it passes.

The symlink protection is also incomplete:

- if the final path does not yet exist, `realpathSync()` throws
- the code treats that as acceptable
- a parent directory can already be a symlink and `mkdir(..., { recursive: true })` will follow it

This means a compromised renderer or unexpected caller could direct output outside the intended safe area.

#### Impact

- writes outside intended user-controlled output roots
- export into symlinked locations
- weaker containment than the validation suggests

---

### 6. Medium: The preload and IPC boundary is origin-blind, and the renderer is not sandboxed as documented

#### What happens

The Electron app window exposes a broad preload API.

Relevant code:

- `electron/main.ts:120-124`
- `electron/main.ts:136-139`
- `electron/preload.ts:73-146`
- `electron/ipc/recording.ts:26-222`
- `electron/ipc/session.ts:17-129`
- `docs/DEVELOPMENT.md:63-66`
- `docs/DEVELOPMENT.md:172-177`

The main app window is created with:

- `nodeIntegration: false`
- `contextIsolation: true`

But it does not enable:

- `sandbox: true`

The preload exposes privileged methods such as:

- starting/stopping recording
- saving sessions
- transcribing audio
- reading and updating preferences
- opening the log file and log folder

The IPC handlers do not validate sender origin or frame URL.

In development mode, the app loads remote content through `VITE_DEV_SERVER_URL`.

#### Why this is a security problem

The docs describe a stronger isolation model than the actual code enforces.

Risks:

- if the dev server is compromised, the malicious page gets the full preload API
- if renderer XSS is introduced later, the attacker gets access to all exposed IPC operations
- there is no origin-based defense on the main-process side

This is not the same as immediate RCE, but it significantly enlarges the blast radius of any renderer compromise.

#### Impact

- privileged operations available to compromised renderer content
- weaker-than-documented Electron isolation
- elevated risk during development and for future renderer bugs

---

### 7. Medium: Chromium site isolation is explicitly weakened in the recorded browser

#### What happens

The Playwright-launched browser disables site isolation features.

Relevant code:

- `electron/browser/recorder.ts:199-208`

Launch args include:

- `--disable-features=IsolateOrigins,site-per-process`

#### Why this is a security problem

The recorder visits arbitrary user-specified pages. Disabling Chromium site isolation reduces built-in browser containment between origins. That weakens an important security control in exactly the environment handling untrusted content.

Even if there was a functional reason for this flag, it is still a material security tradeoff and should be treated as such.

#### Impact

- weaker browser-process isolation for untrusted sites
- increased blast radius if a browser-side compromise occurs

---

### 8. Low to Medium: Permission handlers are too broad

#### What happens

The app globally allows several permissions on the default session.

Relevant code:

- `electron/main.ts:87-99`

Allowed permissions are:

- `media`
- `microphone`
- `audioCapture`

The handlers do not inspect:

- origin
- URL
- whether the request came from the trusted renderer
- whether the request came from some future additional webContents

#### Why this is a security problem

This is broader than necessary and creates a permissive baseline. It is not currently paired with strict per-origin controls.

If future windows, webviews, or unexpected content are added, this permissive handler could become more dangerous.

#### Impact

- unnecessary permission exposure
- future-security regression risk

---

### 9. Low to Medium: Temporary file handling uses predictable names in a shared temp directory

#### What happens

The transcriber writes temporary audio files to a common temp folder using timestamp-based names.

Relevant code:

- `electron/audio/transcriber.ts:133-150`
- `electron/utils/fs.ts:26-27`

Temporary names are generated as:

- `${prefix}-${Date.now()}${ext}`

#### Why this is a security problem

This is weaker than using a securely created per-run temp directory or a cryptographically random filename. Predictable temp paths in shared temporary directories are a classic local hardening issue.

This is not the biggest problem in the current review, but it is still a security weakness in file-handling hygiene.

#### Impact

- weaker local temp-file isolation
- easier path prediction in shared temp space

---

### 10. Low to Medium: Logs can expose sensitive operational data

#### What happens

The application logs:

- full validated URLs
- filesystem paths
- transcriber paths
- some raw runtime details

Relevant code:

- `electron/ipc/recording.ts:32-45`
- `electron/ipc/recording.ts:41`
- `electron/browser/recorder.ts:107-110`
- `electron/audio/transcriber.ts:97-103`
- `electron/utils/logger.ts:37-52`

The docs mention logging sanitization, but the actual logger is a wrapper around `electron-log` and does not implement structured redaction.

#### Why this is a security problem

Logs are often copied into tickets, chat, and issue reports. If URLs contain secrets or local paths reveal internal environment details, the logs become an additional leakage path.

This issue is lower severity than exported plaintext secrets, but it increases accidental disclosure risk.

#### Impact

- leakage of URL-based secrets into logs
- local path disclosure
- mismatch between documented and actual logging safety

---

### 11. Low: No visible Content Security Policy in the renderer HTML

#### What happens

The root `index.html` does not define a Content Security Policy.

Relevant file:

- `index.html:1-16`

#### Why this is a security problem

In Electron apps, CSP is an important defense-in-depth layer against renderer injection and script execution issues. Its absence does not prove an exploit on its own, but it weakens protection if renderer XSS or supply-chain injected code appears.

#### Impact

- reduced defense in depth for the renderer
- higher risk if any client-side injection bug appears later

---

### 12. Low: The renderer loads remote Google Fonts despite local-first positioning

#### What happens

The app loads fonts from Google in `index.html`.

Relevant file:

- `index.html:7-9`

#### Why this is a security problem

The project presents itself as strongly local-first and privacy-oriented. Remote font loading introduces an external network dependency into the renderer.

This is a comparatively small issue, but it still means:

- network requests leave the machine
- a third party learns the app requested the font resources
- the renderer depends on remote content for presentation

#### Impact

- privacy leakage
- unnecessary external dependency in a privacy-focused desktop app

## Documentation and Security-Model Mismatches

These are not separate vulnerabilities by themselves, but they matter because they can cause maintainers and users to overestimate the current security posture.

### Renderer sandbox claim does not match runtime configuration

Docs describe the renderer as sandboxed.

Relevant docs:

- `docs/DEVELOPMENT.md:33-67`
- `docs/DEVELOPMENT.md:172-177`

Actual code:

- `electron/main.ts:120-124`

The window uses `nodeIntegration: false` and `contextIsolation: true`, but does not set `sandbox: true`.

### Session token protection is described more strongly than it is implemented

Docs say the token prevents malicious scripts from manipulating recording.

Relevant docs:

- `docs/DEVELOPMENT.md:301-306`

Actual implementation exposes the token to the same page that is supposedly being constrained.

### Runtime dependency architecture in docs does not match the inspected codebase

The documentation describes a runtime dependency manager with download, manifest, checksum, and extraction flow. The currently inspected codebase does not contain that implementation and instead uses bundled `models/` plus local `playwright-browsers/`.

This is primarily a maintenance/documentation issue, but it complicates accurate security review because the documented trust model differs from the actual code.

## Summary

The most serious problems are not classic remote-code-execution bugs. They are data security and trust-boundary failures:

1. KiwiGen exports sensitive typed values and sensitive URLs in plaintext.
2. KiwiGen collects much more DOM data than is necessary, including potentially secret attributes and text.
3. Untrusted recorded pages can influence or forge recorded output.
4. The pause/resume token does not provide the protection claimed in the docs.
5. Output path containment is weaker than intended.
6. The Electron security model is weaker than the documentation suggests.

For this project, the biggest real-world risk is accidental export and sharing of secrets, credentials, tokens, and private page data through session bundles and logs.
