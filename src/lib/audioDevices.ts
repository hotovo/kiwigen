/**
 * Audio device enumeration utilities
 * Handles enumeration of audio input devices and permission management
 */

/**
 * Represents an audio input device
 */
export interface AudioDevice {
  deviceId: string
  label: string
  groupId: string
}

// ─── Virtual / system-alias device detection ──────────────────────────────────

/**
 * Special deviceId values that the browser exposes as pseudo-devices.
 * - "default"        → "Default" system device (macOS/Windows/Linux)
 * - "communications" → Windows "Default Communications" device
 *
 * We skip these because the UI already provides a "Default Microphone" option
 * and they would otherwise duplicate a real physical device in the list.
 */
const SYSTEM_DEVICE_IDS = new Set(['default', 'communications'])

/**
 * Label prefixes used by the OS when it creates a secondary entry for the
 * current system-default device (e.g. macOS: "Default - LinkBuds Fit (Bluetooth)").
 * Devices whose trimmed label starts with one of these strings are aliases of
 * a real device that also appears in the list — we drop the alias.
 */
const DEFAULT_ALIAS_PREFIXES = [
  'default - ',
  'communications - ',
  'built-in - ',          // some Linux drivers
]

/**
 * Substring patterns (lower-cased) that identify virtual / loopback / software
 * audio devices that are generally not useful for voice recording.
 *
 * Deliberately conservative — only well-known virtual device patterns are
 * listed so that genuine hardware devices with unusual names are never hidden.
 */
const VIRTUAL_DEVICE_PATTERNS = [
  '(virtual)',            // e.g. "Microsoft Teams Audio Device (Virtual)"
  'virtual audio',        // e.g. "VB-Audio Virtual Cable", "Virtual Audio Cable"
  'vb-audio',
  'blackhole',            // popular macOS virtual audio driver
  'soundflower',          // classic macOS virtual audio driver
  'loopback audio',       // Rogue Amoeba Loopback
  'aggregate device',     // macOS Aggregate / Multi-Output devices
  'multi-output',
]

/**
 * Returns true when a device label represents a virtual/software device or an
 * OS-managed alias that duplicates a real physical device entry.
 */
function isVirtualOrAlias(label: string): boolean {
  const lower = label.toLowerCase().trim()

  if (DEFAULT_ALIAS_PREFIXES.some((prefix) => lower.startsWith(prefix))) return true
  if (VIRTUAL_DEVICE_PATTERNS.some((pattern) => lower.includes(pattern))) return true

  return false
}

/**
 * Given a list of raw audio input devices (already stripped of system aliases),
 * deduplicate entries that share the same `groupId`.
 *
 * Why: on macOS and Windows the browser sometimes reports the same physical
 * microphone multiple times under different logical names when that device is
 * selected as the system default.  They share the same `groupId` which
 * identifies the physical hardware group.
 *
 * Selection rule for each group:
 *   1. Prefer the entry whose label does NOT start with a default-alias prefix.
 *   2. Among equals, prefer the shortest label (typically the clearest name).
 *
 * Devices with an empty groupId ("") are kept as-is because an empty groupId
 * means the browser cannot determine the physical grouping.
 */
function deduplicateByGroupId(devices: AudioDevice[]): AudioDevice[] {
  const groups = new Map<string, AudioDevice[]>()

  for (const device of devices) {
    // Devices with no groupId info cannot be deduplicated — keep all of them.
    if (!device.groupId) {
      // Use deviceId as a unique key so they are never merged.
      groups.set(`__no_group__${device.deviceId}`, [device])
      continue
    }
    const bucket = groups.get(device.groupId)
    if (bucket) {
      bucket.push(device)
    } else {
      groups.set(device.groupId, [device])
    }
  }

  const result: AudioDevice[] = []

  for (const bucket of groups.values()) {
    if (bucket.length === 1) {
      result.push(bucket[0])
      continue
    }

    // Pick the best representative: non-alias first, then shortest label.
    const best = bucket.reduce((winner, candidate) => {
      const winnerIsAlias = isVirtualOrAlias(winner.label)
      const candidateIsAlias = isVirtualOrAlias(candidate.label)

      if (winnerIsAlias && !candidateIsAlias) return candidate
      if (!winnerIsAlias && candidateIsAlias) return winner

      // Both or neither are aliases — prefer shorter (cleaner) label.
      return candidate.label.length < winner.label.length ? candidate : winner
    })

    result.push(best)
  }

  return result
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Request microphone permission before enumerating devices.
 * This is required because device labels are hidden until permission is granted.
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    // Stop the tracks immediately - we only needed permission
    stream.getTracks().forEach(track => track.stop())
    return true
  } catch (error) {
    console.error('Failed to request microphone permission:', error)
    return false
  }
}

/**
 * Enumerate real, physical audio input devices.
 *
 * Filtering applied (cross-platform):
 *  1. Skip browser pseudo-devices ("default", "communications").
 *  2. Skip OS-generated alias entries (e.g. "Default - LinkBuds Fit").
 *  3. Skip known virtual/software audio devices (Teams, VB-Audio, BlackHole…).
 *  4. Deduplicate entries that share the same `groupId` (physical device group).
 *
 * @returns Promise resolving to a de-duped array of real audio input devices.
 */
export async function enumerateAudioDevices(): Promise<AudioDevice[]> {
  try {
    // Request permission first to get device labels
    await requestMicrophonePermission()

    const allDevices = await navigator.mediaDevices.enumerateDevices()

    // Step 1: keep only audio inputs, map to AudioDevice shape
    const audioInputs: AudioDevice[] = allDevices
      .filter((d) => d.kind === 'audioinput')
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone ${d.deviceId.slice(0, 8)}`,
        groupId: d.groupId,
      }))

    console.log(`Raw audio input devices (${audioInputs.length}):`)
    audioInputs.forEach((d, i) =>
      console.log(`  [${i + 1}] "${d.label}" id=${d.deviceId.slice(0, 12)} group=${d.groupId.slice(0, 12)}`)
    )

    // Step 2: drop system pseudo-devices and virtual/alias entries
    const filtered = audioInputs.filter(
      (d) => !SYSTEM_DEVICE_IDS.has(d.deviceId) && !isVirtualOrAlias(d.label)
    )

    // Step 3: deduplicate by groupId
    const deduped = deduplicateByGroupId(filtered)

    console.log(`Filtered audio input devices (${deduped.length}):`)
    deduped.forEach((d, i) =>
      console.log(`  [${i + 1}] "${d.label}" id=${d.deviceId.slice(0, 12)}`)
    )

    return deduped
  } catch (error) {
    console.error('Failed to enumerate audio devices:', error)
    return []
  }
}

/**
 * Check if a specific device ID exists in the current device list
 * @param deviceId - The device ID to check
 * @returns Promise resolving to true if device exists, false otherwise
 */
export async function deviceExists(deviceId: string): Promise<boolean> {
  const devices = await enumerateAudioDevices()
  return devices.some(device => device.deviceId === deviceId)
}

/**
 * Get the default audio input device
 * @returns Promise resolving to the default device or null if not found
 */
export async function getDefaultAudioDevice(): Promise<AudioDevice | null> {
  const devices = await enumerateAudioDevices()
  // The first device is typically the default
  return devices.length > 0 ? devices[0] : null
}
