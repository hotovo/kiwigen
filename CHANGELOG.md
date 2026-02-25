# Changelog

All notable changes to Dodo Recorder will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Fixed

## [0.3.1] - 2026-02-25

### Added

**Documentation:**
- 🤖 Added `AGENTS.md` with repository context, guardrails, commands, and architecture notes
- 📘 Expanded deep-dive project documentation and planning notes in `docs/PROJECT_DEEP_DIVE.md`

### Changed

**Architecture & Refactoring:**
- Refactored renderer audio capture into a dedicated `useAudioRecorder` hook for cleaner lifecycle handling
- Centralized shared limits/audio config in `shared/constants.ts` and browser context typings in `shared/browser-context.ts`
- Simplified `RecordingControls` by moving MediaRecorder/device fallback logic into reusable hook utilities

### Fixed

**Security & Reliability:**
- 🔒 Hardened browser widget pause/resume bridge with per-session token validation for exposed browser functions
- 🎤 Improved microphone device handling by filtering alias/virtual devices and deduplicating physical inputs
- Added safer microphone fallback behavior when a previously selected device is no longer available

## [0.3.0] - 2026-02-09

### Added

**New Features:**
- ⏸️ Pause/Resume recording - users can now pause and resume recording sessions with full state synchronization
- 📋 Security review documentation - comprehensive security and refactoring analysis for recent implementations
- 🔒 IPC error handling - enhanced error handling and validation for pause/resume operations

**Technical Enhancements:**
- State management for pause/resume - tracking paused duration and state transitions
- Visual feedback in browser widget - pause button with status indication
- Synchronized audio pause/resume - audio recording follows recording state
- Event forwarding to renderer - recording state changes propagate to UI

### Changed

**Platform Focus:**
- Removed Linux support mentions - focusing on macOS ARM64 and Windows x64
- Removed macOS x64 mentions - focusing on Apple Silicon (ARM64)

**UI/UX Improvements:**
- Version display in debug widget - shows current application version
- Simplified pause/resume controls - streamlined recording controls UI
- Improved browser widget documentation - updated widget behavior documentation
- Enhanced application UI documentation - revised layout and component documentation
- Better architecture documentation - updated architecture guide

### Fixed

**Bug Fixes:**
- Handle sessions with no actions recorded - prevents errors when stopping empty recordings
- Windows dropdown styling - corrected dropdown display issues on Windows
- Whisper binary permissions - fixed execution permissions for bundled whisper binary
- Local macOS app build - resolved issues with local macOS app building

**Build System:**
- Reverted notarization changes - rolled back problematic notarization attempts
- Improved build documentation - updated build guides for current configuration

## [0.2.0] - 2026-01-28

### Added

**New Features:**
- 🎯 Hover highlighter - visual feedback when hovering over elements in recorded browser
- 🎤 Microphone selector - choose specific audio recording device
- 🔍 Debug info widget - displays build information and system details
- 📝 New output format - improved session bundle structure with better AI parsing

**Technical Enhancements:**
- Build info generation - automatic build metadata generation
- Narrative builder - improved voice commentary to action synchronization
- Production logging - comprehensive logging with electron-log integration
- Validation utilities - input validation patterns for IPC handlers
- Enhanced transcript processing - better silence filtering and voice segmentation

**Platform Support:**
- Windows Whisper.cpp binaries - full set of Whisper binaries for Windows platform

**Documentation:**
- Application UI documentation - comprehensive UI component documentation
- Architecture documentation - updated and reorganized
- CI/CD documentation - GitHub Actions workflow documentation
- Code signing documentation - macOS code signing and notarization guide
- Hover highlighting documentation - feature documentation
- Logs and debugging guide - comprehensive debugging documentation
- User guide improvements - enhanced user documentation

### Changed

**UI/UX Improvements:**
- Recording widget UI adjustments - better layout and visual feedback
- Recording indicator - simplified and more visible recording status
- Header rework - improved header component with build info widget
- Transcript view enhancements - better text selection and copy functionality
- Actions list improvements - refined action display and organization
- Better voice + actions combining - improved synchronization algorithm
- Icons regenerated - refined application icons for all platforms
- Better macOS icons - improved icon quality and appearance

**Audio Improvements:**
- Better filtering out silence in transcript - improved voice detection
- Audio visualizer in browser widget - real-time audio feedback in recording widget

**Hotkeys:**
- Simplified hotkeys - streamlined keyboard shortcuts for common actions

**Documentation Reorganization:**
- Restructured docs - better organized documentation hierarchy
- Removed outdated docs - cleaned up obsolete documentation files
- Updated AGENTS.md - current development guidelines

### Fixed

**Bug Fixes:**
- Fix bug with duplicated navigation actions - prevents duplicate navigation entries
- Fix not copyable text from transcript view - enables text selection and copying
- Fix bug when no actions were recorded - handles empty action sessions gracefully
- Fix not working playwright browsers in production - resolved bundling issues
- Fix recording widget - resolved widget display and interaction issues
- Fix mic dropdown UI - corrected microphone selector display
- Fix installation steps on Windows - updated Windows installation documentation
- Fix omit signature on Windows - resolved Windows build signing issues
- Fix build script notarization issue - macOS notarization process corrected
- Fix GitHub build - resolved CI/CD workflow issues

**Build System:**
- Fix build script for Windows - Windows build process improvements
- Fix build script for macOS - macOS build process improvements
- Fix the issue with no bundled browser - resolved Playwright browser bundling
- Multiple build script fixes - improved reliability across platforms

**Platform-Specific:**
- macOS code signing and notarization - proper macOS distribution support
- Windows build fixes - improved Windows build reliability

### Technical Details

**Dependencies:**
- Added electron-log for production logging
- Updated build scripts for better cross-platform support

**Build System:**
- GitHub Actions CI/CD workflow for automated builds
- Improved build scripts with better error handling
- Build info generation for release tracking
- Playwright browser bundling improvements

[Unreleased]: https://github.com/dodosaurus/dodo-recorder/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/dodosaurus/dodo-recorder/releases/tag/v0.3.1
[0.3.0]: https://github.com/dodosaurus/dodo-recorder/releases/tag/v0.3.0
[0.2.0]: https://github.com/dodosaurus/dodo-recorder/releases/tag/v0.2.0
[0.1.0]: https://github.com/dodosaurus/dodo-recorder/releases/tag/v0.1.0
